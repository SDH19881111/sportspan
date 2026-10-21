// 장면 하나의 애니메이션 시간표. PPT처럼 목록 순서대로 시작 시각을 정하고,
// 움직임은 물리 공식으로 계산해 둔다(bake). 재생할 때는 at(id, t)로 꺼내 쓴다.
//
// 시간은 장면 처음부터 잰 초. "클릭할 때" 애니메이션은 새 묶음(클릭 묶음)을 연다.
// 편집 화면 미리보기는 묶음 사이를 CLICK_GAP만큼 쉬고 이어서 틀고,
// 발표 화면은 묶음마다 클릭을 기다린다(groups의 시작 시각을 쓴다).

import type { Activity, Anim, BoardObject, MoveStyle, Pose } from '../model/activity';
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
  type Profile,
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
  from: ItemState;
  end: ItemState;
  at: (local: number) => ItemState;
  /** 공 이동: 길 위 위치(맞았는지 계산용) */
  path?: (local: number) => { x: number; y: number; z: number };
  heading?: number;
}

export interface Timeline {
  duration: number;
  items: TimedAnim[];
  /** 클릭 묶음: 시작·끝 시각, 클릭을 기다리는지 */
  groups: { start: number; end: number; waitsForClick: boolean }[];
  at: (objId: string, t: number) => ItemState | null;
  /** 모든 애니메이션이 끝난 뒤의 자리(다음 장면 복제용) */
  endPoses: Record<string, Pose>;
}

export const CLICK_GAP = 0.6;
const STEP = 0.55; // 한 걸음(m)
const HIT_RADIUS = 0.5;

export const SPEED: Record<'walk' | 'run', { vmax: number; acc: number }> = {
  walk: { vmax: 1.4, acc: 2 },
  run: { vmax: 3.0, acc: 2.5 },
};

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

type Built = Pick<TimedAnim, 'duration' | 'at' | 'end' | 'path' | 'heading'>;

function buildMove(obj: BoardObject, from: ItemState, anim: Anim): Built {
  const to = anim.to ?? { x: from.x, z: from.z };
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const dist = Math.hypot(dx, dz);
  const heading = dist > 1e-6 ? Math.atan2(dx, dz) : from.rot; // 모델 앞쪽이 +z
  const style = anim.style ?? defaultStyle(obj);

  if (obj.kind === 'ball') {
    let path: (t: number) => { x: number; y: number; z: number };
    let duration: number;
    if (style === 'throw' || style === 'bounce') {
      const fl: Flight = style === 'throw' ? throwFlight(dist) : bounceFlight(dist);
      duration = fl.duration;
      path = (t) => {
        const k = fl.f(t);
        return { x: from.x + dx * k, y: fl.y(t), z: from.z + dz * k };
      };
    } else {
      const prof: Profile = rollProfile(dist);
      duration = prof.duration;
      path = (t) => {
        const k = dist > 0 ? prof.s(t) / dist : 1;
        return { x: from.x + dx * k, y: BALL_R, z: from.z + dz * k };
      };
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
        return { ...from, x: q.x, z: q.z, y: Math.max(0, q.y - BALL_R), rot: from.rot + (t / Math.max(duration, 1e-6)) * dist * 9 };
      },
    };
  }

  const sp = SPEED[style === 'walk' ? 'walk' : 'run'];
  const prof = runProfile(dist, sp.vmax, sp.acc);
  const end = rest({ ...from, x: to.x, z: to.z, rot: obj.kind === 'kid' ? heading : from.rot });
  const kid = obj.kind === 'kid';
  return {
    duration: prof.duration,
    end,
    heading,
    at: (t) => {
      const s = prof.s(t);
      const k = dist > 0 ? s / dist : 1;
      const base = { ...from, x: from.x + dx * k, z: from.z + dz * k };
      if (!kid) return base;
      const phase = (s / STEP) * Math.PI;
      const swing = clamp(prof.v(t) / 1.5, 0, 1);
      return {
        ...base,
        rot: lerpAngle(from.rot, heading, t / 0.2),
        stride: phase,
        swing,
        bob: Math.abs(Math.sin(phase)) * 0.05 * swing,
      };
    },
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

export const SPEEDS = [0.25, 0.5, 0.75, 1, 1.5, 2];

/**
 * 빠르기 배율: 움직임 모양(달리기 곡선·포물선)은 그대로 두고 시간만 늘이거나 줄인다.
 * 0.5배면 같은 길을 두 배 시간 동안(느린 화면처럼) 간다.
 */
function withSpeed(b: Built, speed = 1): Built {
  if (!(speed > 0) || speed === 1) return b;
  return {
    ...b,
    duration: b.duration / speed,
    at: (t) => b.at(t * speed),
    path: b.path && ((t) => b.path!(t * speed)),
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

  const items: TimedAnim[] = [];
  const groups: Timeline['groups'] = [];
  let prev: TimedAnim | null = null;
  let latestEnd = 0;

  scene.anims.forEach((anim, index) => {
    const obj = byId.get(anim.objId);
    const from = current.get(anim.objId);
    if (!obj || !from) return;

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

    let built: Built;
    if (anim.kind === 'move') built = buildMove(obj, from, anim);
    else if (anim.kind === 'fall') {
      let yaw = from.rot;
      if (anim.start === 'hit') {
        // 이 장면에서 앞서 움직인 공 중에 지나가며 닿는 것
        for (const b of items) {
          if (byId.get(b.anim.objId)?.kind !== 'ball' || !b.path) continue;
          const hit = closestHit(b, from.x, from.z);
          if (hit.d <= HIT_RADIUS + CATALOG_BY_KIND[obj.kind].radius) {
            start = b.start + hit.t + anim.delay;
            yaw = b.heading ?? yaw;
            break;
          }
        }
      }
      built = buildFall(obj, from, yaw);
    } else {
      const visible = anim.kind === 'appear';
      const end = { ...from, hidden: !visible };
      built = { duration: 0.3, end, at: (t) => ({ ...from, hidden: visible ? false : t < 0.3 ? false : true }) };
    }
    built = withSpeed(built, anim.speed);

    const item: TimedAnim = { anim, index, group, start, from, ...built };
    items.push(item);
    current.set(anim.objId, built.end);
    prev = item;
    latestEnd = Math.max(latestEnd, start + built.duration);
    groups[group].end = Math.max(groups[group].end, start + built.duration);
  });

  const perObj = new Map<string, TimedAnim[]>();
  for (const it of items) {
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

  return {
    duration: latestEnd,
    items,
    groups,
    endPoses,
    at: (id, t) => {
      const p = scene.poses[id];
      if (!p) return null;
      let state = poseState(p);
      for (const it of perObj.get(id) ?? []) {
        if (t < it.start) break;
        state = t >= it.start + it.duration ? it.end : it.at(t - it.start);
      }
      return state;
    },
  };
}
