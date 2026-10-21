// 장면 하나의 애니메이션 시간표. PPT처럼 목록 순서대로 시작 시각을 정하고,
// 움직임은 물리 공식으로 계산해 둔다(bake). 재생할 때는 at(id, t)로 꺼내 쓴다.
//
// 시간은 장면 처음부터 잰 초. "클릭할 때" 애니메이션은 새 묶음(클릭 묶음)을 연다.
// 편집 화면 미리보기는 묶음 사이를 CLICK_GAP만큼 쉬고 이어서 틀고,
// 발표 화면은 묶음마다 클릭을 기다린다(groups의 시작 시각을 쓴다).

import type { Activity, Anim, BoardObject, MoveStyle, Pose, SoundKind } from '../model/activity';
import { CATALOG_BY_KIND } from '../model/catalog';
import {
  BALL_R,
  bounceFlight,
  clamp,
  lerpAngle,
  rollProfile,
  runProfile,
  throwFlight,
  topple,
  type Flight,
} from './physics';

/** 그 순간 물건 하나의 모습 */
export interface ItemState {
  x: number;
  y: number;
  z: number;
  rot: number;
  hidden: boolean;
  fallen: boolean;
  stride: number; // 학생 다리 흔들기 위상
  swing: number; // 0~1
  bob: number;
  tilt: number; // 넘어짐 각도
}

export interface TimedAnim {
  anim: Anim;
  index: number; // 목록 순서
  group: number; // 몇 번째 클릭 묶음인지(0부터)
  start: number;
  duration: number;
  /** 물건 애니메이션만: 시작할 때·끝날 때 모습, 그 사이 */
  from?: ItemState;
  end?: ItemState;
  at?: (local: number) => ItemState;
  /** 움직이는 길 위 위치(공에 맞았는지, 경로 그리기용) */
  path?: (local: number) => { x: number; y: number; z: number };
  heading?: number;
  /** 학생이 공을 가지고 갈 때 공 쪽에 생기는 따라가기(목록에는 안 보인다) */
  carried?: boolean;
}

export interface Timeline {
  duration: number;
  items: TimedAnim[];
  /** 클릭 묶음: 시작·끝 시각, 클릭을 기다리는지 */
  groups: { start: number; end: number; waitsForClick: boolean }[];
  at: (objId: string, t: number) => ItemState | null;
  /** 말풍선·화살표가 t초에 보이는지(나타나기 애니메이션이 없으면 늘 보임) */
  markVisible: (markId: string, t: number) => boolean;
  /** t초에 강조 원이 보이는 물건들 */
  highlightsAt: (t: number) => string[];
  /** 효과음: 언제 무엇을 */
  sounds: { at: number; sound: SoundKind }[];
  /** 모든 애니메이션이 끝난 뒤의 자리(다음 장면 복제용) */
  endPoses: Record<string, Pose>;
}

export const CLICK_GAP = 0.6;
const STEP = 0.55; // 한 걸음(m)
const HIT_RADIUS = 0.5;
const MARK_TIME = 0.3; // 나타나기·강조 같은 순간 애니메이션의 길이
export const SOUND_TIME: Record<SoundKind, number> = { whistle: 0.7, bell: 1.2, beep: 0.3, clap: 0.25 };

export const SPEED: Record<'walk' | 'run', { vmax: number; acc: number }> = {
  walk: { vmax: 1.4, acc: 2 },
  run: { vmax: 3.0, acc: 2.5 },
};

export const SPEEDS = [0.25, 0.5, 0.75, 1, 1.5, 2];

/** 공을 가지고 갈 때 공 자리: 발 앞(드리블) 또는 손(들고) */
const CARRY = { foot: { ahead: 0.35, y: 0 }, hand: { ahead: 0.22, y: 0.72 } };

export function poseState(p: Pose): ItemState {
  return {
    x: p.x,
    y: 0,
    z: p.z,
    rot: p.rot,
    hidden: !!p.hidden,
    fallen: !!p.fallen,
    stride: 0,
    swing: 0,
    bob: 0,
    tilt: p.fallen ? Math.PI / 2 : 0,
  };
}

function rest(s: ItemState): ItemState {
  return { ...s, y: 0, stride: 0, swing: 0, bob: 0 };
}

export function defaultStyle(obj: BoardObject): MoveStyle {
  return obj.kind === 'ball' ? 'roll' : 'run';
}

/** 여러 점을 잇는 길: 거리 s만큼 갔을 때의 위치 */
export interface Polyline {
  length: number;
  pointAt: (s: number) => { x: number; z: number };
  /** 거리 s에서 가는 방향(모델 앞쪽 +z 기준 각도) */
  headingAt: (s: number) => number;
}

export function polyline(points: { x: number; z: number }[]): Polyline {
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
  }
  const length = cum[cum.length - 1];
  const seg = (s: number) => {
    let i = 1;
    while (i < cum.length - 1 && cum[i] < s) i++;
    return i;
  };
  const pointAt = (s: number) => {
    if (points.length === 1 || length <= 0) return points[points.length - 1];
    const c = clamp(s, 0, length);
    const i = seg(c);
    const a = points[i - 1];
    const b = points[i];
    const L = cum[i] - cum[i - 1];
    const k = L > 0 ? (c - cum[i - 1]) / L : 1;
    return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k };
  };
  const headingAt = (s: number) => {
    // 조금 앞을 바라보게 해서 꺾을 때 자연스럽게 돈다
    const p = pointAt(Math.min(s, Math.max(0, length - 0.3)));
    const q = pointAt(Math.min(length, s + 0.3));
    if (Math.hypot(q.x - p.x, q.z - p.z) < 1e-6) {
      const i = Math.max(1, cum.length - 1);
      return Math.atan2(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
    }
    return Math.atan2(q.x - p.x, q.z - p.z);
  };
  return { length, pointAt, headingAt };
}

type Built = Required<Pick<TimedAnim, 'duration' | 'at' | 'end'>> & Pick<TimedAnim, 'path' | 'heading'>;

function buildMove(obj: BoardObject, from: ItemState, anim: Anim): Built {
  const to = anim.to ?? { x: from.x, z: from.z };
  const style = anim.style ?? defaultStyle(obj);
  const flying = obj.kind === 'ball' && (style === 'throw' || style === 'bounce');
  // 던지기·튕기기는 곧게 날아가므로 꺾는 점을 쓰지 않는다
  const line = polyline([{ x: from.x, z: from.z }, ...(flying ? [] : anim.via ?? []), to]);
  const dist = line.length;
  const heading = dist > 1e-6 ? line.headingAt(0) : from.rot;

  if (obj.kind === 'ball') {
    let path: (t: number) => { x: number; y: number; z: number };
    let duration: number;
    if (flying) {
      const fl: Flight = style === 'throw' ? throwFlight(dist) : bounceFlight(dist);
      duration = fl.duration;
      path = (t) => ({ ...line.pointAt(fl.f(t) * dist), y: fl.y(t) });
    } else {
      const prof = rollProfile(dist);
      duration = prof.duration;
      path = (t) => ({ ...line.pointAt(prof.s(t)), y: BALL_R });
    }
    const end = rest({ ...from, x: to.x, z: to.z });
    return {
      duration,
      end,
      path,
      heading,
      at: (t) => {
        const q = path(t);
        // 공 모델의 기준점은 바닥이라 높이는 (중심 높이 - 반지름). 굴러가는 만큼 돈다.
        const spin = (t / Math.max(duration, 1e-6)) * dist * 9;
        return { ...from, x: q.x, z: q.z, y: Math.max(0, q.y - BALL_R), rot: from.rot + spin };
      },
    };
  }

  const sp = SPEED[style === 'walk' ? 'walk' : 'run'];
  const prof = runProfile(dist, sp.vmax, sp.acc);
  const kid = obj.kind === 'kid';
  const endHeading = dist > 1e-6 ? line.headingAt(dist) : from.rot;
  const end = rest({ ...from, x: to.x, z: to.z, rot: kid ? endHeading : from.rot });
  return {
    duration: prof.duration,
    end,
    heading,
    path: (t) => ({ ...line.pointAt(prof.s(t)), y: 0 }),
    at: (t) => {
      const s = prof.s(t);
      const base = { ...from, ...line.pointAt(s) };
      if (!kid) return base;
      const phase = (s / STEP) * Math.PI;
      const swing = clamp(prof.v(t) / 1.5, 0, 1);
      const want = dist > 1e-6 ? line.headingAt(s) : from.rot;
      return {
        ...base,
        rot: t < 0.2 ? lerpAngle(from.rot, want, t / 0.2) : want,
        stride: phase,
        swing,
        bob: Math.abs(Math.sin(phase)) * 0.05 * swing,
      };
    },
  };
}

/** 학생이 움직이는 동안 공이 발 앞이나 손에 붙어 따라간다 */
function buildCarry(kidMove: Built, ballFrom: ItemState, hold: 'foot' | 'hand'): Built {
  const c = CARRY[hold];
  const place = (k: ItemState, t: number): ItemState => ({
    ...ballFrom,
    hidden: ballFrom.hidden,
    x: k.x + Math.sin(k.rot) * c.ahead,
    z: k.z + Math.cos(k.rot) * c.ahead,
    y: c.y,
    rot: hold === 'foot' ? ballFrom.rot + t * 8 : ballFrom.rot,
  });
  const endState = place(kidMove.end, kidMove.duration);
  return {
    duration: kidMove.duration,
    end: { ...endState, rot: ballFrom.rot },
    at: (t) => place(kidMove.at(t), t),
    path: (t) => {
      const s = place(kidMove.at(t), t);
      return { x: s.x, y: s.y + BALL_R, z: s.z };
    },
    heading: kidMove.heading,
  };
}

function buildFall(obj: BoardObject, from: ItemState, yaw: number): Built {
  const fall = topple(Math.max(0.1, CATALOG_BY_KIND[obj.kind].height));
  const end = { ...from, rot: yaw, fallen: true, tilt: Math.PI / 2 };
  return {
    duration: fall.duration,
    end,
    at: (t) => ({ ...from, rot: yaw, tilt: fall.angle(t) }),
  };
}

/**
 * 빠르기 배율: 움직임 모양(달리기 곡선·포물선)은 그대로 두고 시간만 늘이거나 줄인다.
 * 0.5배면 같은 길을 두 배 시간 동안(느린 화면처럼) 간다.
 */
function withSpeed<T extends { duration: number; at?: (t: number) => ItemState; path?: TimedAnim['path'] }>(
  b: T,
  speed = 1,
): T {
  if (!(speed > 0) || speed === 1) return b;
  return {
    ...b,
    duration: b.duration / speed,
    at: b.at && ((t: number) => b.at!(t * speed)),
    path: b.path && ((t: number) => b.path!(t * speed)),
  };
}

/** 공이 (x,z)에 가장 가까워지는 순간(머리 위로 지나가면 안 맞는다) */
function closestHit(ball: TimedAnim, x: number, z: number) {
  let best = { t: 0, d: Infinity };
  if (!ball.path) return best;
  const n = Math.max(10, Math.ceil(ball.duration * 60));
  for (let i = 0; i <= n; i++) {
    const t = (ball.duration * i) / n;
    const q = ball.path(t);
    if (q.y > 0.6) continue;
    const d = Math.hypot(q.x - x, q.z - z);
    if (d < best.d) best = { t, d };
  }
  return best;
}

export function buildTimeline(a: Activity, sceneIdx: number): Timeline {
  const scene = a.scenes[sceneIdx];
  const byId = new Map(a.objects.map((o) => [o.id, o]));
  const current = new Map<string, ItemState>(); // 지금까지 계산한 마지막 상태
  for (const o of a.objects) {
    const p = scene.poses[o.id];
    if (p) current.set(o.id, poseState(p));
  }
  const markExists = (id?: string) =>
    !!id && (scene.bubbles.some((b) => b.id === id) || scene.arrows.some((ar) => ar.id === id));

  const items: TimedAnim[] = [];
  const groups: Timeline['groups'] = [];
  let prev: TimedAnim | null = null;
  let latestEnd = 0;

  scene.anims.forEach((anim, index) => {
    const obj = anim.objId ? byId.get(anim.objId) : undefined;
    const from = anim.objId ? current.get(anim.objId) : undefined;
    const objectAnim = anim.kind !== 'show' && anim.kind !== 'sound';
    if (objectAnim && (!obj || !from)) return;
    if (anim.kind === 'show' && !markExists(anim.markId)) return;
    if (anim.kind === 'sound' && !anim.sound) return;

    // 시작 시각
    let start: number;
    let group = groups.length - 1;
    const opensGroup = anim.start === 'click' || !prev;
    if (opensGroup) {
      const gStart = prev ? latestEnd + CLICK_GAP : 0;
      groups.push({ start: gStart, end: gStart, waitsForClick: anim.start === 'click' });
      group = groups.length - 1;
      start = gStart + anim.delay;
    } else if (anim.start === 'after') start = prev!.start + prev!.duration + anim.delay;
    else start = prev!.start + anim.delay; // 'with', 'hit'(맞는 순간을 못 찾으면 '앞과 함께')

    let item: TimedAnim;
    if (!objectAnim) {
      const duration = anim.kind === 'sound' ? SOUND_TIME[anim.sound!] : MARK_TIME;
      item = { anim, index, group, start, ...withSpeed({ duration }, anim.speed) };
    } else {
      let built: Built;
      if (anim.kind === 'move') built = buildMove(obj!, from!, anim);
      else if (anim.kind === 'fall') {
        let yaw = from!.rot;
        if (anim.start === 'hit') {
          // 이 장면에서 앞서 움직인 공 중에 지나가며 닿는 것
          for (const b of items) {
            const bo = b.anim.objId ? byId.get(b.anim.objId) : undefined;
            if (bo?.kind !== 'ball' || !b.path) continue;
            const hit = closestHit(b, from!.x, from!.z);
            if (hit.d <= HIT_RADIUS + CATALOG_BY_KIND[obj!.kind].radius) {
              start = b.start + hit.t + anim.delay;
              yaw = b.heading ?? yaw;
              break;
            }
          }
        }
        built = buildFall(obj!, from!, yaw);
      } else if (anim.kind === 'highlight') {
        built = { duration: MARK_TIME, end: from!, at: () => from! };
      } else {
        const visible = anim.kind === 'appear';
        const f = from!;
        built = { duration: MARK_TIME, end: { ...f, hidden: !visible }, at: (t) => ({ ...f, hidden: !visible && t >= MARK_TIME }) };
      }
      built = withSpeed(built, anim.speed);
      item = { anim, index, group, start, from, ...built };
      current.set(anim.objId!, built.end);

      // 공을 가지고 가기: 공 쪽에 따라가기 애니메이션을 같은 시각에 붙인다
      const ballId = anim.kind === 'move' && obj!.kind === 'kid' ? anim.carry?.ballId : undefined;
      const ballFrom = ballId ? current.get(ballId) : undefined;
      if (ballId && ballFrom && byId.get(ballId)?.kind === 'ball') {
        const c = buildCarry(built, ballFrom, anim.carry!.hold);
        items.push({
          anim: { ...anim, id: `${anim.id}~carry`, objId: ballId, carry: undefined },
          index,
          group,
          start,
          from: ballFrom,
          carried: true,
          ...c,
        });
        current.set(ballId, c.end);
      }
    }
    items.push(item);
    prev = item;
    latestEnd = Math.max(latestEnd, start + item.duration);
    groups[group].end = Math.max(groups[group].end, start + item.duration);
  });

  // 공을 가지고 간 뒤 이어지는 공 이동이 맞는 자리에서 출발하도록, 목록 순서가 아닌 시각 순으로 정렬
  const perObj = new Map<string, TimedAnim[]>();
  for (const it of items) {
    if (!it.anim.objId || !it.at) continue;
    const list = perObj.get(it.anim.objId) ?? [];
    list.push(it);
    perObj.set(it.anim.objId, list);
  }
  for (const list of perObj.values()) list.sort((x, y) => x.start - y.start || x.index - y.index);

  const endPoses: Record<string, Pose> = {};
  for (const [id, s] of current) {
    endPoses[id] = {
      x: Math.round(s.x * 1000) / 1000,
      z: Math.round(s.z * 1000) / 1000,
      rot: Math.round(s.rot * 1000) / 1000,
      ...(s.hidden ? { hidden: true } : {}),
      ...(s.fallen ? { fallen: true } : {}),
    };
  }

  const showStart = new Map<string, number>();
  const highlightStart = new Map<string, number>();
  const sounds: Timeline['sounds'] = [];
  for (const it of items) {
    if (it.anim.kind === 'show' && it.anim.markId && !showStart.has(it.anim.markId)) showStart.set(it.anim.markId, it.start);
    if (it.anim.kind === 'highlight' && it.anim.objId) highlightStart.set(it.anim.objId, it.start);
    if (it.anim.kind === 'sound' && it.anim.sound) sounds.push({ at: it.start, sound: it.anim.sound });
  }

  return {
    duration: latestEnd,
    items,
    groups,
    endPoses,
    sounds,
    at: (id, t) => {
      const p = scene.poses[id];
      if (!p) return null;
      let state = poseState(p);
      for (const it of perObj.get(id) ?? []) {
        if (t < it.start) break;
        state = t >= it.start + it.duration ? it.end! : it.at!(t - it.start);
      }
      return state;
    },
    markVisible: (id, t) => {
      const s = showStart.get(id);
      return s === undefined || t >= s;
    },
    highlightsAt: (t) => {
      const out = new Set(scene.highlights);
      for (const [id, s] of highlightStart) if (t >= s) out.add(id);
      return [...out];
    },
  };
}
