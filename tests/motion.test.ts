import { describe, expect, it } from 'vitest';
import { emptyActivity, type Activity, type Anim } from '../src/model/activity';
import { migrate } from '../src/model/migrate';
import { addAnim, addMoves, addObject, addSceneAfter, moveAnim } from '../src/model/ops';
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
import { CLICK_GAP, SPEED, buildTimeline } from '../src/motion/timeline';

describe('물리 공식', () => {
  it('달리기: 목표 거리만큼 가고, 최고 속도를 넘지 않고, 서서 출발해 서서 멈춘다', () => {
    const p = runProfile(10);
    expect(p.s(p.duration)).toBeCloseTo(10);
    let vmax = 0;
    for (let t = 0; t <= p.duration; t += 0.01) vmax = Math.max(vmax, p.v(t));
    expect(vmax).toBeLessThanOrEqual(KID_VMAX + 1e-9);
    expect(p.v(0)).toBe(0);
    expect(p.v(p.duration)).toBeCloseTo(0);
    expect(runProfile(1).v(runProfile(1).duration / 2)).toBeLessThan(KID_VMAX);
  });

  it('굴리기: 일정하게 느려지다 목표 지점에서 멈춘다(v² = 2ad)', () => {
    const p = rollProfile(6);
    expect(p.s(p.duration)).toBeCloseTo(6);
    expect(p.v(p.duration)).toBeCloseTo(0);
    expect(p.v(0) ** 2).toBeCloseTo(2 * ROLL_DECEL * 6);
  });

  it('던지기: 꼭대기 높이와 비행 시간이 중력 공식과 맞다', () => {
    const d = 8;
    const fl = throwFlight(d);
    const H = throwApex(d);
    let top = 0;
    for (let t = 0; t <= fl.duration; t += 0.001) top = Math.max(top, fl.y(t));
    expect(top).toBeCloseTo(H, 2);
    expect(fl.y(0)).toBeCloseTo(HAND_H);
    expect(fl.y(fl.duration)).toBeCloseTo(BALL_R, 2);
    expect(fl.duration).toBeCloseTo(Math.sqrt((2 * (H - HAND_H)) / G) + Math.sqrt((2 * (H - BALL_R)) / G));
  });

  it('튕기기: 튈 때마다 높이가 e²배로 줄어든다', () => {
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
    expect(peaks.length).toBe(3);
    expect((peaks[2] - BALL_R) / (peaks[1] - BALL_R)).toBeCloseTo(0.55 ** 2, 2);
  });

  it('콘 넘어지기: 끝까지(90°) 쓰러지고 키가 클수록 느리다', () => {
    const a = topple(0.3);
    expect(a.angle(a.duration)).toBeCloseTo(Math.PI / 2);
    expect(topple(1).duration).toBeGreaterThan(a.duration);
  });
});

function setup() {
  let a = emptyActivity('검사');
  const k = addObject(a, { kind: 'kid', teamId: 'red' }, { x: -5, z: 0, rot: 0 });
  a = k.activity;
  const b = addObject(a, { kind: 'ball' }, { x: -4, z: 0, rot: 0 });
  a = b.activity;
  const c = addObject(a, { kind: 'cone' }, { x: 4, z: 0, rot: 0 });
  a = c.activity;
  return { a, kid: k.id, ball: b.id, cone: c.id };
}

function add(a: Activity, anim: Omit<Anim, 'id'>) {
  return addAnim(a, 0, anim).activity;
}

describe('장면 안 애니메이션 시간표', () => {
  it('이동: 장면 시작 자리에서 출발해 도착점에서 멈추고, 가는 쪽을 본다', () => {
    let { a, kid } = setup();
    a = add(a, { objId: kid, kind: 'move', start: 'click', delay: 0, to: { x: 0, z: 0 } });
    const tl = buildTimeline(a, 0);
    expect(tl.at(kid, 0)).toMatchObject({ x: -5, z: 0 });
    const mid = tl.at(kid, tl.duration / 2)!;
    expect(mid.x).toBeGreaterThan(-5);
    expect(mid.x).toBeLessThan(0);
    expect(mid.rot).toBeCloseTo(Math.PI / 2);
    expect(mid.swing).toBeGreaterThan(0);
    expect(tl.at(kid, tl.duration)).toMatchObject({ x: 0, z: 0, swing: 0 });
    expect(tl.endPoses[kid]).toMatchObject({ x: 0, z: 0 });
    // 장면 자리 자체는 그대로(PPT처럼 애니메이션만 붙는다)
    expect(a.scenes[0].poses[kid]).toMatchObject({ x: -5, z: 0 });
  });

  it('걷기는 뛰기보다 오래 걸린다', () => {
    let { a, kid } = setup();
    const walk = buildTimeline(add(a, { objId: kid, kind: 'move', start: 'click', delay: 0, to: { x: 5, z: 0 }, style: 'walk' }), 0);
    const run = buildTimeline(add(a, { objId: kid, kind: 'move', start: 'click', delay: 0, to: { x: 5, z: 0 }, style: 'run' }), 0);
    expect(walk.duration).toBeGreaterThan(run.duration);
    expect(SPEED.walk.vmax).toBeLessThan(SPEED.run.vmax);
  });

  it('시작 방식: 앞과 함께 / 앞 다음에 / 클릭할 때', () => {
    let { a, kid, ball } = setup();
    a = add(a, { objId: kid, kind: 'move', start: 'click', delay: 0, to: { x: 0, z: 0 } });
    a = add(a, { objId: ball, kind: 'move', start: 'with', delay: 0.5, to: { x: 0, z: 2 } });
    a = add(a, { objId: ball, kind: 'move', start: 'after', delay: 0, to: { x: 2, z: 2 } });
    a = add(a, { objId: kid, kind: 'move', start: 'click', delay: 0, to: { x: 1, z: 1 } });
    const tl = buildTimeline(a, 0);
    const [m1, m2, m3, m4] = tl.items;
    expect(m2.start).toBeCloseTo(m1.start + 0.5);
    expect(m3.start).toBeCloseTo(m2.start + m2.duration);
    // 두 번째 클릭 묶음은 앞 묶음이 다 끝나고 잠깐 쉰 뒤
    const firstEnd = Math.max(m1.start + m1.duration, m3.start + m3.duration);
    expect(m4.start).toBeCloseTo(firstEnd + CLICK_GAP);
    expect(tl.groups).toHaveLength(2);
    expect(tl.groups.every((g) => g.waitsForClick)).toBe(true);
    expect(m3.from).toMatchObject({ x: 0, z: 2 }); // 이동을 이어 붙이면 앞 이동 끝에서 출발
  });

  it('공이 닿을 때 넘어지기: 공이 콘 근처에 왔을 때 쓰러지기 시작해 공이 간 쪽으로 눕는다', () => {
    let { a, ball, cone } = setup();
    a = add(a, { objId: ball, kind: 'move', start: 'click', delay: 0, to: { x: 6, z: 0 }, style: 'roll' });
    a = add(a, { objId: cone, kind: 'fall', start: 'hit', delay: 0 });
    const tl = buildTimeline(a, 0);
    const fall = tl.items[1];
    expect(tl.at(ball, fall.start)!.x).toBeGreaterThan(3);
    expect(tl.at(cone, fall.start - 0.01)!.tilt).toBe(0);
    expect(tl.at(cone, tl.duration)!.tilt).toBeCloseTo(Math.PI / 2);
    expect(tl.at(cone, tl.duration)!.rot).toBeCloseTo(Math.PI / 2);
    expect(tl.endPoses[cone].fallen).toBe(true);
  });

  it('나타나기·사라지기', () => {
    let { a, kid } = setup();
    a.scenes[0].poses[kid].hidden = true;
    a = add(a, { objId: kid, kind: 'appear', start: 'click', delay: 0 });
    a = add(a, { objId: kid, kind: 'disappear', start: 'after', delay: 1 });
    const tl = buildTimeline(a, 0);
    expect(tl.at(kid, -1)!.hidden).toBe(true); // 장면 시작 전(클릭 전)
    expect(tl.at(kid, tl.items[0].start + 0.01)!.hidden).toBe(false);
    expect(tl.at(kid, tl.duration)!.hidden).toBe(true);
  });

  it('던짐·튀김도 꺾는 점을 지나간다: 던짐은 손 높이로 받고, 튀김은 바닥에 튄다', () => {
    let { a, ball } = setup();
    const via = [{ x: 0, z: 4 }];
    const at = (style: 'throw' | 'bounce') => {
      const tl = buildTimeline(add(a, { objId: ball, kind: 'move', start: 'click', delay: 0, to: { x: 4, z: 0 }, via, style }), 0);
      const it = tl.items[0];
      // 꺾는 점에 가장 가까이 가는 순간
      let best = { d: Infinity, y: 0 };
      for (let i = 0; i <= 600; i++) {
        const q = it.path!((it.duration * i) / 600);
        const d = Math.hypot(q.x - via[0].x, q.z - via[0].z);
        if (d < best.d) best = { d, y: q.y };
      }
      return { best, end: tl.at(ball, tl.duration)! };
    };
    const th = at('throw');
    expect(th.best.d).toBeLessThan(0.05);
    expect(th.best.y).toBeCloseTo(HAND_H, 1);
    expect(th.end).toMatchObject({ x: 4, z: 0, y: 0 });
    const bo = at('bounce');
    expect(bo.best.d).toBeLessThan(0.05);
    expect(bo.best.y).toBeCloseTo(BALL_R, 1);
    expect(bo.end).toMatchObject({ x: 4, z: 0, y: 0 });
  });

  it('던진 공 높이: 학생에게 던지면 가슴 높이에서 받아 멈추고, 다음에는 그 높이에서 떠난다', () => {
    let { a, ball } = setup();
    const k2 = addObject(a, { kind: 'kid', teamId: 'red' }, { x: 3, z: 0, rot: 0 });
    a = k2.activity;
    a = add(a, { objId: ball, kind: 'move', start: 'click', delay: 0, to: { x: 3, z: 0 }, style: 'throw' });
    a = add(a, { objId: ball, kind: 'move', start: 'after', delay: 0, to: { x: 0, z: 3 }, style: 'throw' });
    const tl = buildTimeline(a, 0);
    const [t1, t2] = tl.items;
    expect(t1.heights!.landing?.kind).toBe('kid');
    expect(t1.end!.y).toBeGreaterThan(0.5); // 손에 들고 있다
    expect(t2.heights!.from).toBeCloseTo(t1.heights!.to);
    expect(tl.at(ball, tl.duration)!.y).toBe(0); // 아무도 없는 곳은 바닥
  });

  it('바구니 위로 던지면 그 높이에서 떨어져 들어가고, 정한 높이는 알아서보다 앞선다', () => {
    let { a, ball } = setup();
    const bk = addObject(a, { kind: 'basket' }, { x: 3, z: 0, rot: 0 });
    a = bk.activity;
    a = add(a, { objId: ball, kind: 'move', start: 'click', delay: 0, to: { x: 3, z: 0 }, style: 'throw', fromH: 2 });
    const it = buildTimeline(a, 0).items[0];
    expect(it.heights!.landing?.kind).toBe('basket');
    expect(it.path!(0).y).toBeCloseTo(2);
    let top = 0;
    for (let i = 0; i <= 200; i++) top = Math.max(top, it.path!((it.duration * i) / 200).y);
    expect(top).toBeGreaterThan(it.heights!.to);
    expect(it.path!(it.duration).y).toBeCloseTo(BALL_R);
    expect(it.end!.y).toBe(0);
  });

  it('같은 장면은 몇 번을 계산해도 똑같다', () => {
    let { a, ball } = setup();
    a = add(a, { objId: ball, kind: 'move', start: 'click', delay: 0, to: { x: 6, z: 2 }, style: 'bounce' });
    const t1 = buildTimeline(a, 0);
    const t2 = buildTimeline(a, 0);
    for (const t of [0.1, 0.7, 1.3]) expect(t1.at(ball, t)).toEqual(t2.at(ball, t));
  });

  it('순서를 바꾸면 시작 시각도 바뀐다', () => {
    let { a, kid, ball } = setup();
    a = add(a, { objId: kid, kind: 'move', start: 'click', delay: 0, to: { x: 0, z: 0 } });
    a = add(a, { objId: ball, kind: 'move', start: 'after', delay: 0, to: { x: 0, z: 2 } });
    const ballAnim = a.scenes[0].anims[1].id;
    const swapped = moveAnim(a, 0, ballAnim, -1);
    expect(buildTimeline(swapped, 0).items[0].anim.objId).toBe(ball);
    expect(buildTimeline(swapped, 0).items[0].start).toBe(0);
  });
});

describe('다음 장면 복제', () => {
  it('애니메이션 끝난 상태 / 전 상태', () => {
    let { a, kid, ball, cone } = setup();
    a = add(a, { objId: ball, kind: 'move', start: 'click', delay: 0, to: { x: 6, z: 0 } });
    a = add(a, { objId: cone, kind: 'fall', start: 'hit', delay: 0 });
    const end = addSceneAfter(a, 0, 'end').activity.scenes[1];
    expect(end.poses[ball]).toMatchObject({ x: 6, z: 0 });
    expect(end.poses[cone].fallen).toBe(true);
    expect(end.poses[kid]).toMatchObject({ x: -5, z: 0 });
    expect(end.anims).toEqual([]);
    const start = addSceneAfter(a, 0, 'start').activity.scenes[1];
    expect(start.poses[ball]).toMatchObject({ x: -4, z: 0 });
    expect(start.poses[cone].fallen).toBeUndefined();
  });

  it('여러 명을 함께 옮기면 간격을 유지하고 둘째부터는 앞과 함께', () => {
    let { a, kid, ball } = setup();
    const res = addMoves(a, 0, [kid, ball], { x: 0, z: 3 });
    const [m1, m2] = res.activity.scenes[0].anims;
    expect(m1.to).toEqual({ x: 0, z: 3 });
    expect(m2.to).toEqual({ x: 1, z: 3 });
    expect(m1.start).toBe('click');
    expect(m2.start).toBe('with');
  });
});

describe('예전 저장본 바꾸기(버전 1 → 2)', () => {
  it('장면 사이 자리 변화가 앞 장면의 애니메이션이 된다', () => {
    let { a, kid, ball, cone } = setup();
    delete a.version;
    a.scenes[0].anims = undefined as unknown as Anim[];
    a.scenes.push({
      id: 'old2',
      caption: '',
      bubbles: [],
      arrows: [],
      highlights: [],
      anims: undefined as unknown as Anim[],
      poses: {
        [kid]: { x: -5, z: 0, rot: 0 },
        [ball]: { x: 6, z: 0, rot: 0, move: 'throw' } as never,
        [cone]: { x: 4, z: 0, rot: 0, fallen: true },
      },
    });
    const m = migrate(a);
    expect(m.version).toBe(2);
    const anims = m.scenes[0].anims;
    expect(anims.map((x) => x.kind)).toEqual(['move', 'fall']);
    expect(anims[0]).toMatchObject({ objId: ball, start: 'click', style: 'throw', to: { x: 6, z: 0 } });
    expect(anims[1]).toMatchObject({ objId: cone, start: 'hit' });
    expect(m.scenes[1].anims).toEqual([]);
    expect('move' in m.scenes[1].poses[ball]).toBe(false);
  });
});
