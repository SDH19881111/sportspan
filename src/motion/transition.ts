// 앞 장면 → 이 장면으로 넘어가는 움직임을 한 번에 계산해 둔다(bake).
// 재생할 때는 at(t)로 그 순간의 모습만 꺼내 쓴다.

import type { Activity, BoardObject, Pose } from '../model/activity';
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
  stride: number; // 학생 다리 흔들기 위상
  swing: number; // 0~1
  bob: number;
  tilt: number; // 넘어짐 각도
}

export interface Transition {
  duration: number;
  at: (id: string, t: number) => ItemState | null;
}

const TURN_TIME = 0.3; // 도착해서 정해진 방향으로 돌아서는 시간
const STEP = 0.55; // 한 걸음(m)
const HOLD = 0.25; // 끝나고 잠깐 멈춤
const MIN_MOVE = 0.05;
const HIT_RADIUS = 0.5; // 공 길이 콘에 이만큼 가까우면 맞은 것으로 본다

type Track = { duration: number; at: (t: number) => ItemState };

function base(p: Pose): ItemState {
  return { x: p.x, y: 0, z: p.z, rot: p.rot, hidden: !!p.hidden, stride: 0, swing: 0, bob: 0, tilt: 0 };
}

/** 장면 하나를 가만히 보여줄 때의 모습(편집 화면용) */
export function staticState(obj: BoardObject, p: Pose): ItemState {
  const s = base(p);
  if (p.fallen) s.tilt = Math.PI / 2;
  if (obj.kind === 'ball') s.y = 0;
  return s;
}

function kidTrack(p0: Pose, p1: Pose): Track {
  const dx = p1.x - p0.x;
  const dz = p1.z - p0.z;
  const dist = Math.hypot(dx, dz);
  if (dist < MIN_MOVE) {
    return {
      duration: Math.abs(p1.rot - p0.rot) > 0.01 ? TURN_TIME : 0,
      at: (t) => ({ ...base(p1), rot: lerpAngle(p0.rot, p1.rot, t / TURN_TIME) }),
    };
  }
  const prof = runProfile(dist);
  const heading = Math.atan2(dx, dz); // 앞쪽이 +z인 모델 기준
  return {
    duration: prof.duration + TURN_TIME,
    at: (t) => {
      const s = prof.s(t);
      const v = prof.v(t);
      const k = s / dist;
      const phase = (s / STEP) * Math.PI;
      const swing = clamp(v / 1.5, 0, 1);
      let rot: number;
      if (t < 0.2) rot = lerpAngle(p0.rot, heading, t / 0.2);
      else if (t <= prof.duration) rot = heading;
      else rot = lerpAngle(heading, p1.rot, (t - prof.duration) / TURN_TIME);
      return {
        ...base(p1),
        x: p0.x + dx * k,
        z: p0.z + dz * k,
        rot,
        stride: phase,
        swing,
        bob: Math.abs(Math.sin(phase)) * 0.05 * swing,
      };
    },
  };
}

interface BallPath {
  track: Track;
  /** 공이 지나간 길: t초에 어디 있었는지(높이 포함) */
  pos: (t: number) => { x: number; y: number; z: number };
  heading: number;
}

function ballTrack(p0: Pose, p1: Pose): BallPath {
  const dx = p1.x - p0.x;
  const dz = p1.z - p0.z;
  const dist = Math.hypot(dx, dz);
  const heading = Math.atan2(dx, dz);
  const move = p1.move ?? 'roll';
  let duration: number;
  let pos: (t: number) => { x: number; y: number; z: number };

  if (dist < MIN_MOVE) {
    duration = 0;
    pos = () => ({ x: p1.x, y: BALL_R, z: p1.z });
  } else if (move === 'roll') {
    const prof: Profile = rollProfile(dist);
    duration = prof.duration;
    pos = (t) => {
      const k = prof.s(t) / dist;
      return { x: p0.x + dx * k, y: BALL_R, z: p0.z + dz * k };
    };
  } else {
    // 던질 때는 손 높이에서 출발한다
    const fl: Flight = move === 'throw' ? throwFlight(dist) : bounceFlight(dist);
    duration = fl.duration;
    pos = (t) => {
      const k = fl.f(t);
      return { x: p0.x + dx * k, y: fl.y(t), z: p0.z + dz * k };
    };
  }
  return {
    heading,
    pos,
    track: {
      duration,
      at: (t) => {
        const q = pos(t);
        // 공 모델의 기준점은 바닥이라 높이는 (중심 높이 - 반지름)
        return { ...base(p1), x: q.x, z: q.z, y: Math.max(0, q.y - BALL_R), rot: p1.rot + t * 6 };
      },
    },
  };
}

function slideTrack(p0: Pose, p1: Pose): Track {
  const dx = p1.x - p0.x;
  const dz = p1.z - p0.z;
  const dist = Math.hypot(dx, dz);
  if (dist < MIN_MOVE) {
    return { duration: 0, at: () => base(p1) };
  }
  const prof = runProfile(dist);
  return {
    duration: prof.duration,
    at: (t) => {
      const k = prof.s(t) / dist;
      return { ...base(p1), x: p0.x + dx * k, z: p0.z + dz * k, rot: lerpAngle(p0.rot, p1.rot, k) };
    },
  };
}

/** 공의 길이 (x,z)에 가장 가까워지는 순간 */
function closestTime(path: BallPath, duration: number, x: number, z: number) {
  let best = { t: 0, d: Infinity };
  const n = Math.max(10, Math.ceil(duration * 60));
  for (let i = 0; i <= n; i++) {
    const t = (duration * i) / n;
    const q = path.pos(t);
    if (q.y > 0.6) continue; // 머리 위로 지나가면 안 맞는다
    const d = Math.hypot(q.x - x, q.z - z);
    if (d < best.d) best = { t, d };
  }
  return best;
}

export function buildTransition(a: Activity, sceneIdx: number): Transition {
  const cur = a.scenes[sceneIdx];
  const prev = a.scenes[sceneIdx - 1];
  const tracks = new Map<string, Track>();
  const byId = new Map(a.objects.map((o) => [o.id, o]));

  if (!prev) {
    for (const o of a.objects) {
      const p = cur.poses[o.id];
      if (p) tracks.set(o.id, { duration: 0, at: () => staticState(o, p) });
    }
    return finish(tracks);
  }

  const balls: BallPath[] = [];
  for (const o of a.objects) {
    const p1 = cur.poses[o.id];
    if (!p1) continue;
    const p0 = prev.poses[o.id] ?? p1;
    // 새로 나타나는 것은 처음부터 제자리, 사라지는 것은 끝에 사라진다
    if (p0.hidden && !p1.hidden) {
      tracks.set(o.id, { duration: 0, at: () => staticState(o, p1) });
      continue;
    }
    if (!p0.hidden && p1.hidden) {
      const last = staticState(o, p0);
      tracks.set(o.id, { duration: 0.01, at: (t) => (t < 0.01 ? last : { ...last, hidden: true }) });
      continue;
    }
    if (o.kind === 'kid') tracks.set(o.id, kidTrack(p0, p1));
    else if (o.kind === 'ball') {
      const b = ballTrack(p0, p1);
      balls.push(b);
      tracks.set(o.id, b.track);
    } else tracks.set(o.id, slideTrack(p0, p1));
  }

  // 이 장면에서 새로 넘어진 콘·컵: 공이 지나갈 때 맞아서 쓰러진다
  for (const [id, track] of tracks) {
    const o = byId.get(id)!;
    const p1 = cur.poses[id];
    const p0 = prev.poses[id] ?? p1;
    if (!p1.fallen || p0.fallen) continue;
    let tHit = 0;
    let yaw = p1.rot;
    for (const b of balls) {
      const hit = closestTime(b, b.track.duration, p1.x, p1.z);
      if (hit.d <= HIT_RADIUS + CATALOG_BY_KIND[o.kind].radius) {
        tHit = hit.t;
        yaw = b.heading;
        break;
      }
    }
    const fall = topple(Math.max(0.1, CATALOG_BY_KIND[o.kind].height));
    tracks.set(id, {
      duration: Math.max(track.duration, tHit + fall.duration),
      at: (t) => ({ ...track.at(t), rot: yaw, tilt: fall.angle(t - tHit) }),
    });
  }
  return finish(tracks);
}

function finish(tracks: Map<string, Track>): Transition {
  let longest = 0;
  for (const tr of tracks.values()) longest = Math.max(longest, tr.duration);
  const duration = longest > 0 ? longest + HOLD : 0;
  return {
    duration,
    at: (id, t) => tracks.get(id)?.at(t) ?? null,
  };
}

