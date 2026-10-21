import { describe, expect, it } from 'vitest';
import { emptyActivity, type Activity } from '../src/model/activity';
import { addObject, addSceneAfter, setPoses } from '../src/model/ops';
import {
  BALL_R,
  G,
  HAND_H,
  KID_VMAX,
  ROLL_DECEL,
  bounceFlight,
  rollProfile,
  runProfile,
  throwApex,
  throwFlight,
  topple,
} from '../src/motion/physics';
import { buildTransition } from '../src/motion/transition';

describe('학생 달리기', () => {
  it('정확히 목표 거리만큼 가고, 최고 속도를 넘지 않는다', () => {
    const p = runProfile(10);
    expect(p.s(p.duration)).toBeCloseTo(10);
    let vmax = 0;
    for (let t = 0; t <= p.duration; t += 0.01) vmax = Math.max(vmax, p.v(t));
    expect(vmax).toBeLessThanOrEqual(KID_VMAX + 1e-9);
    expect(p.v(0)).toBe(0);
    expect(p.v(p.duration)).toBeCloseTo(0);
  });

  it('짧은 거리는 최고 속도까지 안 올라가고 바로 줄인다', () => {
    const p = runProfile(1);
    expect(p.s(p.duration)).toBeCloseTo(1);
    expect(p.v(p.duration / 2)).toBeLessThan(KID_VMAX);
  });
});

describe('공', () => {
  it('굴린 공은 일정하게 느려지다 목표 지점에서 멈춘다', () => {
    const p = rollProfile(6);
    expect(p.s(p.duration)).toBeCloseTo(6);
    expect(p.v(p.duration)).toBeCloseTo(0);
    // v² = 2·a·d
    expect(p.v(0) ** 2).toBeCloseTo(2 * ROLL_DECEL * 6);
  });

  it('던진 공은 정해진 꼭대기 높이까지 올라갔다가 바닥에 떨어진다', () => {
    const d = 8;
    const fl = throwFlight(d);
    const H = throwApex(d);
    let top = 0;
    for (let t = 0; t <= fl.duration; t += 0.001) top = Math.max(top, fl.y(t));
    expect(top).toBeCloseTo(H, 2);
    expect(fl.y(0)).toBeCloseTo(HAND_H);
    expect(fl.y(fl.duration)).toBeCloseTo(BALL_R, 2);
    // 비행 시간 = 올라가는 시간 + 떨어지는 시간
    const expected = Math.sqrt((2 * (H - HAND_H)) / G) + Math.sqrt((2 * (H - BALL_R)) / G);
    expect(fl.duration).toBeCloseTo(expected);
    expect(fl.f(fl.duration)).toBe(1);
  });

  it('튀는 공은 튈 때마다 낮아진다', () => {
    const fl = bounceFlight(8, 0.55, 2);
    const peaks: number[] = [];
    let prev = fl.y(0);
    let rising = true;
    for (let t = 0.001; t <= fl.duration; t += 0.001) {
      const y = fl.y(t);
      if (rising && y < prev) {
        peaks.push(prev);
        rising = false;
      } else if (!rising && y > prev) rising = true;
      prev = y;
    }
    expect(peaks.length).toBe(3); // 던진 꼭대기 + 튕김 2번
    expect(peaks[1]).toBeLessThan(peaks[0]);
    expect(peaks[2]).toBeLessThan(peaks[1]);
    // 튕김 높이 비율 ≈ e²
    expect((peaks[2] - BALL_R) / (peaks[1] - BALL_R)).toBeCloseTo(0.55 ** 2, 2);
  });
});

describe('콘 넘어지기', () => {
  it('끝까지 쓰러지고(90°), 같은 입력이면 같은 결과', () => {
    const a = topple(0.3);
    const b = topple(0.3);
    expect(a.angle(a.duration)).toBeCloseTo(Math.PI / 2);
    expect(a.duration).toBe(b.duration);
    expect(a.angle(0.1)).toBe(b.angle(0.1));
    // 키가 큰 것은 더 천천히 쓰러진다
    expect(topple(1).duration).toBeGreaterThan(a.duration);
  });
});

function twoScenes(): { a: Activity; kid: string; ball: string; cone: string } {
  let a = emptyActivity('검사');
  const k = addObject(a, { kind: 'kid', teamId: 'red' }, { x: -5, z: 0, rot: 0 });
  a = k.activity;
  const b = addObject(a, { kind: 'ball' }, { x: -4, z: 0, rot: 0 });
  a = b.activity;
  const c = addObject(a, { kind: 'cone' }, { x: 4, z: 0, rot: 0 });
  a = c.activity;
  a = addSceneAfter(a, 0).activity;
  return { a, kid: k.id, ball: b.id, cone: c.id };
}

describe('장면 사이 움직임', () => {
  it('학생은 앞 장면 자리에서 출발해 이 장면 자리에 도착하고, 가는 쪽을 본다', () => {
    let { a, kid } = twoScenes();
    a = setPoses(a, 1, { [kid]: { x: 0, z: 0 } });
    const tr = buildTransition(a, 1);
    expect(tr.at(kid, 0)).toMatchObject({ x: -5, z: 0 });
    const mid = tr.at(kid, tr.duration / 2)!;
    expect(mid.x).toBeGreaterThan(-5);
    expect(mid.x).toBeLessThan(0);
    expect(mid.rot).toBeCloseTo(Math.PI / 2); // +x 쪽
    expect(mid.swing).toBeGreaterThan(0);
    expect(tr.at(kid, tr.duration)).toMatchObject({ x: 0, z: 0 });
  });

  it('공 길에 있는 콘을 넘어뜨리면 공이 닿는 순간 쓰러지기 시작한다', () => {
    let { a, ball, cone } = twoScenes();
    a = setPoses(a, 1, { [ball]: { x: 5, z: 0 }, [cone]: { fallen: true } });
    const tr = buildTransition(a, 1);
    expect(tr.at(cone, 0)!.tilt).toBe(0);
    expect(tr.at(cone, tr.duration)!.tilt).toBeCloseTo(Math.PI / 2);
    // 공이 콘 근처(x≈3.4)에 오기 전에는 서 있다
    let tStart = 0;
    for (let t = 0; t < tr.duration; t += 0.01) {
      if (tr.at(cone, t)!.tilt > 0) {
        tStart = t;
        break;
      }
    }
    expect(tr.at(ball, tStart)!.x).toBeGreaterThan(3);
    expect(tr.at(cone, tr.duration)!.rot).toBeCloseTo(Math.PI / 2); // 공이 간 쪽으로 쓰러짐
  });

  it('같은 장면은 몇 번을 계산해도 똑같다', () => {
    let { a, kid, ball } = twoScenes();
    a = setPoses(a, 1, { [kid]: { x: 2, z: 3 }, [ball]: { x: 6, z: 2, move: 'bounce' } });
    const t1 = buildTransition(a, 1);
    const t2 = buildTransition(a, 1);
    expect(t1.duration).toBe(t2.duration);
    for (const t of [0.1, 0.7, 1.3]) expect(t1.at(ball, t)).toEqual(t2.at(ball, t));
  });

  it('첫 장면은 움직임이 없다', () => {
    const { a } = twoScenes();
    expect(buildTransition(a, 0).duration).toBe(0);
  });
});
