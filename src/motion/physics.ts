// 움직임 공식. 모두 순수 함수라 같은 입력이면 언제나 같은 결과가 나온다.
// 단위: m, s, rad.

export const G = 9.8;

/** 거리 dist를 가는 동안의 이동 곡선: t초에 간 거리 s(t)와 속도 v(t) */
export interface Profile {
  duration: number;
  s: (t: number) => number;
  v: (t: number) => number;
}

const still: Profile = { duration: 0, s: () => 0, v: () => 0 };

// ── 학생 달리기: 출발할 때 빨라지고 도착할 때 느려진다(사다리꼴 속도) ──
// 초등학생이 설명용으로 뛰는 빠르기. 3m/s로는 30m 달리기가 11초 넘게 걸려 발표가 늘어져서,
// 실제 전력 질주(5~6m/s)보다는 느리게 4.5m/s로. 30m가 약 8초.
export const KID_VMAX = 4.5;
export const KID_ACC = 3.5;

export function runProfile(dist: number, vmax = KID_VMAX, acc = KID_ACC): Profile {
  if (dist <= 0) return still;
  const tAcc = vmax / acc;
  const dAcc = 0.5 * acc * tAcc * tAcc;
  if (dist < 2 * dAcc) {
    // 최고 속도까지 못 올라가고 바로 줄인다(삼각형)
    const tp = Math.sqrt(dist / acc);
    const T = 2 * tp;
    return {
      duration: T,
      s: (t) => {
        const c = clamp(t, 0, T);
        return c < tp ? 0.5 * acc * c * c : dist - 0.5 * acc * (T - c) ** 2;
      },
      v: (t) => {
        const c = clamp(t, 0, T);
        return c < tp ? acc * c : acc * (T - c);
      },
    };
  }
  const tCruise = (dist - 2 * dAcc) / vmax;
  const T = 2 * tAcc + tCruise;
  return {
    duration: T,
    s: (t) => {
      const c = clamp(t, 0, T);
      if (c < tAcc) return 0.5 * acc * c * c;
      if (c < tAcc + tCruise) return dAcc + vmax * (c - tAcc);
      return dist - 0.5 * acc * (T - c) ** 2;
    },
    v: (t) => {
      const c = clamp(t, 0, T);
      if (c < tAcc) return acc * c;
      if (c < tAcc + tCruise) return vmax;
      return acc * (T - c);
    },
  };
}

// ── 공 굴리기: 바닥 마찰로 일정하게 느려지다 목표 지점에서 멈춘다 ──
export const ROLL_DECEL = 1.2; // m/s², 체육관 바닥에서 굴러가는 공

export function rollProfile(dist: number, decel = ROLL_DECEL): Profile {
  if (dist <= 0) return still;
  const v0 = Math.sqrt(2 * decel * dist);
  const T = v0 / decel;
  return {
    duration: T,
    s: (t) => {
      const c = clamp(t, 0, T);
      return v0 * c - 0.5 * decel * c * c;
    },
    v: (t) => Math.max(0, v0 - decel * clamp(t, 0, T)),
  };
}

// ── 던지기·튕기기: 수평으로는 같은 빠르기, 위아래로는 중력 ──

export interface Flight {
  duration: number;
  /** 가로 이동 비율 0~1 */
  f: (t: number) => number;
  /** 공 중심 높이(m) */
  y: (t: number) => number;
}

export const BALL_R = 0.11;
export const HAND_H = 1.0; // 손에서 놓는 높이

/** 던진 공의 꼭대기 높이: 멀리 던질수록 높게, 너무 높지는 않게 */
export function throwApex(dist: number, h0 = HAND_H): number {
  return Math.min(6, Math.max(h0 + 0.6, h0 + dist * 0.25));
}

/** 손 높이 h0에서 던져 바닥(공 반지름 높이)에 떨어지는 포물선 */
export function throwFlight(dist: number, h0 = HAND_H): Flight {
  if (dist <= 0) return { duration: 0, f: () => 1, y: () => BALL_R };
  const H = throwApex(dist, h0);
  const vy0 = Math.sqrt(2 * G * (H - h0));
  const tUp = vy0 / G;
  const tDown = Math.sqrt((2 * (H - BALL_R)) / G);
  const T = tUp + tDown;
  return {
    duration: T,
    f: (t) => clamp(t, 0, T) / T,
    y: (t) => {
      const c = clamp(t, 0, T);
      return Math.max(BALL_R, h0 + vy0 * c - 0.5 * G * c * c);
    },
  };
}

/** 던진 뒤 바닥에서 반발 계수 e로 몇 번 튀고 목표 지점에 멈춘다. */
export function bounceFlight(dist: number, e = 0.55, bounces = 2, h0 = HAND_H): Flight {
  if (dist <= 0) return { duration: 0, f: () => 1, y: () => BALL_R };
  const H = throwApex(dist * 0.6, h0);
  const vy0 = Math.sqrt(2 * G * (H - h0));
  const tFirst = vy0 / G + Math.sqrt((2 * (H - BALL_R)) / G);
  const vLand = Math.sqrt(2 * G * (H - BALL_R));
  // 각 튕김: 위로 튀는 빠르기 v_i = e^i · vLand, 공중에 있는 시간 2·v_i/g
  const segs: { start: number; dur: number; v: number }[] = [];
  let t0 = tFirst;
  let v = vLand;
  for (let i = 0; i < bounces; i++) {
    v *= e;
    const d = (2 * v) / G;
    segs.push({ start: t0, dur: d, v });
    t0 += d;
  }
  const T = t0;
  return {
    duration: T,
    f: (t) => clamp(t, 0, T) / T, // 수평 빠르기는 바뀌지 않는다고 본다
    y: (t) => {
      const c = clamp(t, 0, T);
      if (c < tFirst) return Math.max(BALL_R, h0 + vy0 * c - 0.5 * G * c * c);
      for (const sg of segs) {
        if (c <= sg.start + sg.dur) {
          const u = c - sg.start;
          return BALL_R + sg.v * u - 0.5 * G * u * u;
        }
      }
      return BALL_R;
    },
  };
}

// ── 콘 넘어지기: 바닥 모서리를 축으로 중력에 의해 쓰러진다 ──

/**
 * 막대처럼 생각한 물체(높이 L)가 모서리를 축으로 넘어질 때의 각도 표.
 * θ'' = (3g / 2L)·sin θ, 공에 맞아 처음 각속도 w0로 출발. 고정 간격으로 적분해 언제나 같은 결과.
 */
export function topple(L: number, w0 = 3, dt = 1 / 240): { duration: number; angle: (t: number) => number } {
  const k = (3 * G) / (2 * L);
  const table: number[] = [0];
  let th = 0;
  let w = w0;
  while (th < Math.PI / 2 && table.length < 2000) {
    w += k * Math.sin(th) * dt;
    th += w * dt;
    table.push(Math.min(th, Math.PI / 2));
  }
  const T = (table.length - 1) * dt;
  return {
    duration: T,
    angle: (t) => {
      if (t <= 0) return 0;
      if (t >= T) return Math.PI / 2;
      const i = t / dt;
      const a = Math.floor(i);
      return table[a] + (table[a + 1] - table[a]) * (i - a);
    },
  };
}

export function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

/** 각도 a에서 b로 가장 짧은 쪽으로 k(0~1)만큼 */
export function lerpAngle(a: number, b: number, k: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * clamp(k, 0, 1);
}
