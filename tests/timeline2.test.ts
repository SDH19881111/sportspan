import { describe, expect, it } from 'vitest';
import { emptyActivity, type Activity, type Anim } from '../src/model/activity';
import {
  addAnim,
  addArrow,
  addBubble,
  addObject,
  addVia,
  removeObjects,
  removeSceneMark,
  reorderAnims,
  updateAnims,
} from '../src/model/ops';
import { buildTimeline, polyline } from '../src/motion/timeline';

function setup() {
  let a = emptyActivity('검사');
  const k = addObject(a, { kind: 'kid', teamId: 'red' }, { x: 0, z: 0, rot: 0 });
  a = k.activity;
  const b = addObject(a, { kind: 'ball' }, { x: 0, z: 0.35, rot: 0 });
  a = b.activity;
  return { a, kid: k.id, ball: b.id };
}
const add = (a: Activity, an: Omit<Anim, 'id'>) => addAnim(a, 0, an).activity;

describe('꺾는 점', () => {
  it('여러 점을 잇는 길의 길이와 위치', () => {
    const line = polyline([
      { x: 0, z: 0 },
      { x: 3, z: 0 },
      { x: 3, z: 4 },
    ]);
    expect(line.length).toBe(7);
    expect(line.pointAt(5)).toEqual({ x: 3, z: 2 });
    expect(line.headingAt(1)).toBeCloseTo(Math.PI / 2); // +x 쪽
    expect(line.headingAt(6)).toBeCloseTo(0); // +z 쪽
  });

  it('학생이 꺾는 점을 지나 도착하고, 마지막 구간 쪽을 보고 선다', () => {
    let { a, kid } = setup();
    a = add(a, { objId: kid, kind: 'move', start: 'click', delay: 0, to: { x: 3, z: 4 }, via: [{ x: 3, z: 0 }] });
    const tl = buildTimeline(a, 0);
    const it = tl.items[0];
    // 길 중간쯤에서는 꺾는 점 근처를 지난다
    let passed = false;
    for (let t = 0; t <= it.duration; t += 0.02) {
      const s = tl.at(kid, t)!;
      if (Math.hypot(s.x - 3, s.z) < 0.1) passed = true;
    }
    expect(passed).toBe(true);
    expect(tl.at(kid, it.duration)).toMatchObject({ x: 3, z: 4 });
    expect(tl.at(kid, it.duration)!.rot).toBeCloseTo(0);
  });

  it('꺾는 점 추가는 가장 긴 구간 가운데', () => {
    let { a, kid } = setup();
    a = add(a, { objId: kid, kind: 'move', start: 'click', delay: 0, to: { x: 4, z: 0 } });
    const id = a.scenes[0].anims[0].id;
    a = addVia(a, 0, id, { x: 0, z: 0 });
    expect(a.scenes[0].anims[0].via).toEqual([{ x: 2, z: 0 }]);
    a = addVia(a, 0, id, { x: 0, z: 0 });
    expect(a.scenes[0].anims[0].via).toHaveLength(2);
  });
});

describe('공 가지고 가기', () => {
  it('학생이 움직이는 동안 공이 발 앞에 붙어 가고, 끝에서 학생 앞에 멈춘다', () => {
    let { a, kid, ball } = setup();
    a = add(a, {
      objId: kid,
      kind: 'move',
      start: 'click',
      delay: 0,
      to: { x: 0, z: 6 },
      carry: { ballId: ball, hold: 'foot' },
    });
    const tl = buildTimeline(a, 0);
    const d = tl.items.find((x) => !x.carried)!.duration;
    for (const t of [0.3, d / 2, d]) {
      const k = tl.at(kid, t)!;
      const b = tl.at(ball, t)!;
      expect(Math.hypot(b.x - k.x, b.z - k.z)).toBeCloseTo(0.35, 1);
    }
    expect(tl.endPoses[ball].z).toBeCloseTo(6.35);
    // 목록에 보이는 것은 학생 이동 하나(공 따라가기는 숨은 항목)
    expect(tl.items.filter((x) => !x.carried)).toHaveLength(1);
  });

  it('가지고 간 뒤 이어지는 공 이동은 학생 앞에서 출발한다', () => {
    let { a, kid, ball } = setup();
    a = add(a, { objId: kid, kind: 'move', start: 'click', delay: 0, to: { x: 0, z: 6 }, carry: { ballId: ball, hold: 'foot' } });
    a = add(a, { objId: ball, kind: 'move', start: 'after', delay: 0, to: { x: 0, z: 10 } });
    const tl = buildTimeline(a, 0);
    const kick = tl.items.find((x) => x.anim.objId === ball && !x.carried)!;
    expect(kick.from!.z).toBeCloseTo(6.35);
  });

  it('공을 지우면 가지고 가기도 떨어진다', () => {
    let { a, kid, ball } = setup();
    a = add(a, { objId: kid, kind: 'move', start: 'click', delay: 0, to: { x: 0, z: 6 }, carry: { ballId: ball, hold: 'hand' } });
    a = removeObjects(a, [ball]);
    expect(a.scenes[0].anims[0].carry).toBeUndefined();
  });
});

describe('표시·강조·효과음 애니메이션', () => {
  it('말풍선·화살표는 나타나는 시각부터 보이고, 강조는 그 시각부터', () => {
    let { a, kid } = setup();
    const bub = addBubble(a, 0, { objId: kid, text: '가위바위보!' });
    a = bub.activity;
    const ar = addArrow(a, 0, { x1: 0, z1: 0, x2: 2, z2: 0 });
    a = ar.activity;
    a = add(a, { objId: kid, kind: 'move', start: 'click', delay: 0, to: { x: 0, z: 3 } });
    a = add(a, { markId: bub.id, kind: 'show', start: 'after', delay: 0 });
    a = add(a, { objId: kid, kind: 'highlight', start: 'with', delay: 0 });
    a = add(a, { kind: 'sound', sound: 'whistle', start: 'click', delay: 0 });
    const tl = buildTimeline(a, 0);
    const show = tl.items[1];
    expect(tl.markVisible(bub.id, show.start - 0.01)).toBe(false);
    expect(tl.markVisible(bub.id, show.start)).toBe(true);
    expect(tl.markVisible(ar.id, 0)).toBe(true); // 나타나기가 없는 것은 늘 보인다
    expect(tl.highlightsAt(show.start - 0.01)).toEqual([]);
    expect(tl.highlightsAt(show.start)).toEqual([kid]);
    expect(tl.sounds).toHaveLength(1);
    expect(tl.sounds[0].at).toBeGreaterThan(show.start);
    expect(tl.groups).toHaveLength(2);
  });

  it('말풍선을 지우면 그 나타나기도 지워진다', () => {
    let { a, kid } = setup();
    const bub = addBubble(a, 0, { objId: kid, text: '안녕' });
    a = add(bub.activity, { markId: bub.id, kind: 'show', start: 'click', delay: 0 });
    a = removeSceneMark(a, 0, bub.id);
    expect(a.scenes[0].anims).toEqual([]);
  });
});

describe('애니메이션 창 편집', () => {
  it('여러 개를 한꺼번에 옮기고, 한꺼번에 설정한다', () => {
    let { a, kid, ball } = setup();
    a = add(a, { objId: kid, kind: 'move', start: 'click', delay: 0, to: { x: 1, z: 0 } });
    a = add(a, { objId: ball, kind: 'move', start: 'with', delay: 0, to: { x: 2, z: 0 } });
    a = add(a, { kind: 'sound', sound: 'bell', start: 'after', delay: 0 });
    const [x, y, z] = a.scenes[0].anims.map((v) => v.id);
    const moved = reorderAnims(a, 0, [y, z], 0);
    expect(moved.scenes[0].anims.map((v) => v.id)).toEqual([y, z, x]);
    const end = reorderAnims(a, 0, [x], 3);
    expect(end.scenes[0].anims.map((v) => v.id)).toEqual([y, z, x]);
    const set = updateAnims(a, 0, [x, y], { delay: 0.5, speed: 2 });
    expect(set.scenes[0].anims.slice(0, 2).every((v) => v.delay === 0.5 && v.speed === 2)).toBe(true);
  });
});
