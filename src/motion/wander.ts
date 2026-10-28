// 학생 자유 움직임: 이동을 정하지 않은 학생이 발표 중에 가만히 서 있지 않고 조금씩 오간다.
//
// 장면 시간표(timeline)가 정한 자리(base)에 '어긋남(offset)'을 더해 보여 준다. 시간표는 건드리지 않으므로
// 애니메이션·공 받기·되감기 계산은 그대로다. 어긋남은 실제 시간(발표 화면의 프레임)으로 흐르고,
// 클릭을 기다리며 멈춰 있는 동안에도 움직인다.
//  · 자리 둘레(기본): 제자리에서 ROAM_RADIUS 안의 점을 골라 걸어가 잠깐 서고, 또 고른다.
//  · 구역 안: 학생에게 정해 준 구역 안의 점만 고른다.
//  · 가만히: 움직이지 않는다.
// 이동 애니메이션이 곧 시작하거나 도는 중인 학생, 공을 가지고 있거나 날아오는 공을 받을 학생은
// 제자리(시간표 자리)로 돌아가 멈춘다(anchored). 다 돌아오면 시간표 그대로 보여 준다.

import type { Activity, BoardObject, FieldZone, Roam } from '../model/activity';
import { zoneWorldOutline } from '../model/shapes';
import type { ItemState, Timeline } from './timeline';

export const ROAM_RADIUS = 0.8; // 자리 둘레에서 오가는 범위(m)
export const ROAM_SPEED = 0.6; // 오갈 때 걷는 빠르기(m/s)
export const RETURN_SPEED = 2.2; // 제자리로 돌아갈 때(m/s)
const TURN_SPEED = 5; // 몸 돌리기(rad/s)
const PAUSE = [0.8, 3.2]; // 한 점에 서 있는 시간(초)
const EDGE = 0.4; // 바닥 끝·구역 끝에서 띄우는 거리(m)
const NEAR_BALL = 0.7; // 이만큼 가까운 공은 이 학생이 가진 것으로 본다(m)
const CATCH_AREA = 1.2; // 날아오는 공의 도착점이 이만큼 가까우면 받을 학생(m)
const LEAD = 0.5; // 이동 애니메이션 몇 초 전부터 제자리로 돌아가기 시작할지

/** 이 물건의 자유 움직임. 학생만 움직이고, 지운 구역을 가리키면 자리 둘레로 */
export function roamOf(obj: BoardObject, zones: FieldZone[] = []): { roam: Roam; zone: FieldZone | null } {
  if (obj.kind !== 'kid') return { roam: 'off', zone: null };
  const roam = obj.roam ?? 'around';
  if (typeof roam === 'object') {
    const zone = zones.find((z) => z.id === roam.zone) ?? null;
    return zone ? { roam, zone } : { roam: 'around', zone: null };
  }
  return { roam, zone: null };
}

export interface Wanderer {
  ox: number; // 시간표 자리에서 어긋난 만큼(m)
  oz: number;
  /** 걸어갈 점(바닥 좌표). null이면 서서 쉬는 중 */
  target: { x: number; z: number } | null;
  wait: number; // 남은 쉬는 시간(초)
  heading: number; // 몸 방향(라디안, rot와 같은 기준)
  stride: number; // 다리 흔들기 위상
  swing: number; // 다리 흔들기 크기 0~1
  settled: boolean; // 제자리에 돌아와 시간표 그대로 보여 주는 중
}

export function newWanderer(base: ItemState, rand: () => number = Math.random): Wanderer {
  // 처음부터 다 같이 걷기 시작하지 않게 쉬는 시간을 흩어 둔다
  return { ox: 0, oz: 0, target: null, wait: rand() * PAUSE[1], heading: base.rot, stride: 0, swing: 0, settled: true };
}

type P = [number, number];

function inPolygon(pts: P[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i];
    const [xj, zj] = pts[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** 구역 안인지(고리는 구멍 빼고). 끝에서 margin만큼 안쪽이어야 한다 */
export function insideZone(zone: FieldZone, x: number, z: number, margin = 0): boolean {
  const { outer, hole } = zoneWorldOutline(zone);
  const probes: P[] = margin > 0 ? [[x, z], [x + margin, z], [x - margin, z], [x, z + margin], [x, z - margin]] : [[x, z]];
  return probes.every(([px, pz]) => inPolygon(outer, px, pz) && !(hole && inPolygon(hole, px, pz)));
}

/** 다음에 걸어갈 점. 자리 둘레면 base 둘레, 구역이면 구역 안(못 찾으면 구역 가운데) */
export function pickTarget(
  base: { x: number; z: number },
  current: { x: number; z: number },
  field: { width: number; depth: number },
  zone: FieldZone | null,
  rand: () => number = Math.random,
): { x: number; z: number } {
  const hx = field.width / 2 - EDGE;
  const hz = field.depth / 2 - EDGE;
  const clamp = (p: { x: number; z: number }) => ({ x: Math.max(-hx, Math.min(hx, p.x)), z: Math.max(-hz, Math.min(hz, p.z)) });
  if (zone) {
    const { outer } = zoneWorldOutline(zone);
    const xs = outer.map((p) => p[0]);
    const zs = outer.map((p) => p[1]);
    const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    // 구역이 넓어도 한 번에 너무 멀리 가지 않게, 지금 자리에서 가까운 점을 먼저 찾아본다
    for (let i = 0; i < 40; i++) {
      const near = i < 20;
      const p = near
        ? { x: current.x + (rand() * 2 - 1) * ROAM_RADIUS * 2, z: current.z + (rand() * 2 - 1) * ROAM_RADIUS * 2 }
        : { x: x0 + rand() * (x1 - x0), z: z0 + rand() * (z1 - z0) };
      if (insideZone(zone, p.x, p.z, Math.min(EDGE, zone.w / 4, zone.d / 4))) return clamp(p);
    }
    return clamp({ x: zone.x, z: zone.z });
  }
  for (let i = 0; i < 8; i++) {
    const a = rand() * Math.PI * 2;
    const r = ROAM_RADIUS * Math.sqrt(0.15 + 0.85 * rand());
    const p = clamp({ x: base.x + Math.sin(a) * r, z: base.z + Math.cos(a) * r });
    if (Math.hypot(p.x - current.x, p.z - current.z) > 0.25) return p;
  }
  return clamp(base);
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
function turnToward(from: number, to: number, max: number): number {
  const d = wrap(to - from);
  return Math.abs(d) <= max ? to : from + Math.sign(d) * max;
}

/**
 * 한 프레임 진행. base는 지금 시각의 시간표 자리, anchored면 제자리로 돌아간다.
 * 앞쪽이 +z이고 rot=0일 때 +z를 본다(학생 모델과 같은 기준) → 방향 = atan2(dx, dz).
 */
export function stepWanderer(
  w: Wanderer,
  opts: { base: ItemState; anchored: boolean; field: { width: number; depth: number }; zone: FieldZone | null; dt: number; rand?: () => number },
): Wanderer {
  const { base, anchored, field, zone, dt } = opts;
  const rand = opts.rand ?? Math.random;
  const next: Wanderer = { ...w };
  const pos = { x: base.x + w.ox, z: base.z + w.oz };

  let goal: { x: number; z: number } | null;
  let speed: number;
  if (anchored) {
    if (w.settled) return { ...next, heading: base.rot, swing: 0, target: null };
    goal = { x: base.x, z: base.z };
    speed = RETURN_SPEED;
    next.target = null;
    next.wait = 0;
  } else {
    if (!w.target) {
      next.wait = w.wait - dt;
      if (next.wait > 0) {
        next.swing = Math.max(0, w.swing - dt * 3);
        next.heading = w.settled ? base.rot : w.heading;
        return next;
      }
      next.target = pickTarget(base, pos, field, zone, rand);
    }
    goal = next.target;
    speed = ROAM_SPEED;
    next.settled = false;
  }

  const dx = goal!.x - pos.x;
  const dz = goal!.z - pos.z;
  const dist = Math.hypot(dx, dz);
  const step = speed * dt;
  if (dist <= step || dist < 1e-4) {
    next.ox = goal!.x - base.x;
    next.oz = goal!.z - base.z;
    if (anchored) {
      next.ox = 0;
      next.oz = 0;
      next.heading = turnToward(w.heading, base.rot, TURN_SPEED * dt);
      next.swing = Math.max(0, w.swing - dt * 3);
      // 몸도 다 돌았으면 시간표 그대로 보여 준다
      next.settled = Math.abs(wrap(next.heading - base.rot)) < 0.05 && next.swing === 0;
    } else {
      next.target = null;
      next.wait = PAUSE[0] + rand() * (PAUSE[1] - PAUSE[0]);
    }
    return next;
  }
  next.ox = pos.x + (dx / dist) * step - base.x;
  next.oz = pos.z + (dz / dist) * step - base.z;
  next.heading = turnToward(w.heading, Math.atan2(dx, dz), TURN_SPEED * dt);
  next.stride = w.stride + step * 5.5; // 다리 한 번 흔들 때 약 1.1m
  next.swing = Math.min(anchored ? 1 : 0.55, w.swing + dt * 3);
  return next;
}

/** 시간표 자리에 어긋남을 더한 모습. 제자리에 있으면 시간표 그대로 */
export function applyWander(base: ItemState, w: Wanderer | undefined): ItemState {
  if (!w || w.settled) return base;
  return { ...base, x: base.x + w.ox, z: base.z + w.oz, rot: w.heading, stride: w.stride, swing: w.swing, bob: Math.abs(Math.sin(w.stride)) * 0.02 * w.swing };
}

/**
 * 이 학생이 지금 제자리에 있어야 하는지: 이동이 곧 시작·도는 중, 공을 가짐, 날아오는 공을 받음,
 * 말풍선·강조가 붙어 있음(표시는 시간표 자리에 그려지므로 어긋나지 않게)
 */
export function isAnchored(activity: Activity, sceneIdx: number, timeline: Timeline, objId: string, base: ItemState, t: number, running: boolean): boolean {
  if (base.hidden) return true;
  if (timeline.highlightsAt(t).includes(objId)) return true;
  if (activity.scenes[sceneIdx]?.bubbles.some((b) => b.objId === objId && timeline.markVisible(b.id, t))) return true;
  for (const it of timeline.items) {
    const a = it.anim;
    if (a.kind !== 'move') continue;
    const end = it.start + it.duration;
    // 클릭을 기다리는 동안 다음 묶음의 이동은 아직 멀었다(누르면 그때 돌아간다)
    const soon = running ? it.start - LEAD : it.start;
    if (a.objId === objId && t >= soon && t <= end) return true;
    // 공이 이 학생 쪽으로 날아오는 중
    if (a.objId !== objId && a.to && t >= soon && t <= end) {
      const ball = activity.objects.find((o) => o.id === a.objId);
      if (ball?.kind === 'ball' && Math.hypot(a.to.x - base.x, a.to.z - base.z) < CATCH_AREA) return true;
    }
  }
  // 공을 발밑·손에 가지고 있다
  for (const o of activity.objects) {
    if (o.kind !== 'ball') continue;
    const s = timeline.at(o.id, t);
    if (s && !s.hidden && Math.hypot(s.x - base.x, s.z - base.z) < NEAR_BALL) return true;
  }
  return false;
}
