// 3순위(만들기 번거로움) 점검: 경기장 선 틀, 새 판 이름·빈 판, 처음 방향·뒤집기, 보기 배율, 달리기 빠르기
import { describe, expect, it } from 'vitest';
import { emptyActivity } from '../src/model/activity';
import { viewScale } from '../src/model/catalog';
import { courtShapes, currentCourt, setCourt } from '../src/model/courts';
import { addAnim, addObject, addZone, faceCenter, flipItems, setFieldSize } from '../src/model/ops';
import { buildTimeline } from '../src/motion/timeline';
import { autoTitle, isBlank } from '../src/storage/library';

describe('경기장 선 틀', () => {
  it('바닥 안쪽에 들어가고, 바꾸면 전 틀은 지워진다', () => {
    const a = emptyActivity('검사', 'playground');
    const dodge = setCourt(a, 'dodge');
    expect(currentCourt(dodge)).toBe('dodge');
    for (const l of dodge.field.lines) {
      expect(l.locked).toBe(true);
      for (const x of [l.x1, l.x2]) expect(Math.abs(x)).toBeLessThanOrEqual(a.field.width / 2);
      for (const z of [l.z1, l.z2]) expect(Math.abs(z)).toBeLessThanOrEqual(a.field.depth / 2);
    }
    const track = setCourt(dodge, 'track');
    expect(currentCourt(track)).toBe('track');
    expect(track.field.lines.every((l) => l.groupId === 'court:track')).toBe(true);
    expect(currentCourt(setCourt(track, null))).toBeNull();
  });

  it('선생님이 그린 구역은 남긴다', () => {
    const a = addZone(emptyActivity(), { x: 0, z: 0, w: 2, d: 2, color: '#fff' }).activity;
    expect(setCourt(setCourt(a, 'soccer'), null).field.zones).toHaveLength(1);
  });

  it('피구 코트는 2:1, 체육관(24×14)에서 18×9', () => {
    const xs = courtShapes('dodge', 24, 14).lines.flatMap((l) => [l.x1, l.x2]);
    const zs = courtShapes('dodge', 24, 14).lines.flatMap((l) => [l.z1, l.z2]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(18);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(9);
  });

  it('달리기: 운동장(40×25)에서 35m, 출발·결승 이름표', () => {
    const lines = courtShapes('sprint', 40, 25).lines;
    expect(lines.find((l) => l.label === '출발')!.x1).toBeCloseTo(-17.5);
    expect(lines.some((l) => l.label === '결승 35m')).toBe(true);
  });

  it('바닥 크기를 바꾸면 다시 맞춰 그을 수 있다', () => {
    const a = setCourt(emptyActivity('검사', 'gym'), 'dodge');
    const small = setCourt(setFieldSize(a, 10, 8), 'dodge');
    const xs = small.field.lines.flatMap((l) => [l.x1, l.x2]);
    expect(Math.max(...xs)).toBeLessThanOrEqual(5);
  });
});

describe('새 판 이름·빈 판', () => {
  it('장소와 다음 번호로 이름을 짓는다', () => {
    expect(autoTitle('playground', [])).toBe('운동장 활동 1');
    expect(autoTitle('gym', ['체육관 활동 1', '체육관 활동 2'])).toBe('체육관 활동 3');
  });

  it('아무것도 안 만든 판만 빈 판', () => {
    const a = emptyActivity(autoTitle('gym', []));
    expect(isBlank(a)).toBe(true);
    expect(isBlank(emptyActivity('새 활동'))).toBe(true);
    expect(isBlank({ ...a, title: '3학년 피구' })).toBe(false);
    expect(isBlank(addObject(a, { kind: 'cone' }, { x: 0, z: 0, rot: 0 }).activity)).toBe(false);
    expect(isBlank(setCourt(a, 'dodge'))).toBe(false);
    expect(isBlank({ ...a, scenes: [{ ...a.scenes[0], caption: '모이기' }] })).toBe(false);
  });
});

describe('처음 방향·뒤집기', () => {
  it('새 학생은 가운데 쪽을 본다(두 편이 마주 선다)', () => {
    const a = emptyActivity('검사', 'gym'); // 가로가 긴 바닥
    expect(faceCenter(a, -5, 2)).toBeCloseTo(Math.PI / 2); // 왼쪽 편 → 오른쪽(+x)을 본다
    expect(faceCenter(a, 5, 2)).toBeCloseTo(-Math.PI / 2);
    expect(faceCenter(a, 0, 3)).toBeCloseTo(Math.PI); // 가운데 줄 아래쪽 → 위(-z)를 본다
  });

  it('좌우 뒤집기: 가운데를 기준으로 자리·방향·이동 경로가 거울처럼', () => {
    let a = emptyActivity('검사', 'gym');
    const k1 = addObject(a, { kind: 'kid' }, { x: -4, z: 1, rot: Math.PI / 2 });
    a = k1.activity;
    const k2 = addObject(a, { kind: 'kid' }, { x: -2, z: -1, rot: 0.3 });
    a = k2.activity;
    a = addAnim(a, 0, { objId: k1.id, kind: 'move', start: 'click', delay: 0, to: { x: -1, z: 1 }, via: [{ x: -3, z: 2 }] })
      .activity;
    const f = flipItems(a, 0, [k1.id, k2.id], 'x');
    const p = f.scenes[0].poses;
    expect(p[k1.id]).toMatchObject({ x: -2, z: 1 });
    expect(p[k1.id].rot).toBeCloseTo(-Math.PI / 2);
    expect(p[k2.id]).toMatchObject({ x: -4, z: -1 });
    expect(p[k2.id].rot).toBeCloseTo(-0.3);
    const mv = f.scenes[0].anims[0];
    expect(mv.to).toEqual({ x: -5, z: 1 });
    expect(mv.via).toEqual([{ x: -3, z: 2 }]);
    // 두 번 뒤집으면 제자리
    const back = flipItems(f, 0, [k1.id, k2.id], 'x').scenes[0].poses;
    for (const id of [k1.id, k2.id]) {
      expect(back[id]).toMatchObject({ x: a.scenes[0].poses[id].x, z: a.scenes[0].poses[id].z });
      expect(back[id].rot).toBeCloseTo(a.scenes[0].poses[id].rot);
    }
  });

  it('앞뒤 뒤집기는 방향을 π - rot으로', () => {
    const { activity, id } = addObject(emptyActivity(), { kind: 'kid' }, { x: 0, z: 2, rot: 0 });
    const f = flipItems(activity, 0, [id], 'z');
    expect(f.scenes[0].poses[id].z).toBe(2); // 혼자면 자리는 그대로, 뒤로 돈다
    expect(Math.abs(f.scenes[0].poses[id].rot)).toBeCloseTo(Math.PI);
  });
});

describe('보기 배율·달리기 빠르기', () => {
  it('운동장에서 학생·콘을 키우고, 공은 어디서나 키운다', () => {
    expect(viewScale('kid', 'gym')).toBe(1);
    expect(viewScale('kid', 'playground')).toBeGreaterThan(1);
    expect(viewScale('cone', 'playground')).toBeGreaterThan(1);
    expect(viewScale('ball', 'gym')).toBeGreaterThan(1);
    expect(viewScale('goal', 'playground')).toBe(1);
  });

  it('30m 뛰기가 1배속 9초 안쪽', () => {
    const { activity, id } = addObject(emptyActivity(), { kind: 'kid' }, { x: -15, z: 0, rot: 0 });
    const a = addAnim(activity, 0, { objId: id, kind: 'move', start: 'click', delay: 0, to: { x: 15, z: 0 }, style: 'run' })
      .activity;
    const it = buildTimeline(a, 0).items[0];
    expect(it.duration).toBeLessThan(9);
    expect(it.duration).toBeGreaterThan(6);
  });
});
