import { describe, expect, it } from 'vitest';
import { emptyActivity, type Activity } from '../src/model/activity';
import {
  addArrow,
  addBubble,
  addObject,
  addTeam,
  addZone,
  clampToField,
  duplicateObjects,
  moveObjects,
  normAngle,
  removeObjects,
  removeTeam,
  rotateObjects,
  toggleHighlight,
} from '../src/model/ops';

function withTwoScenes(): Activity {
  const a = emptyActivity('검사');
  a.scenes.push({ id: 's2', caption: '', poses: {}, bubbles: [], arrows: [], highlights: [], anims: [] });
  return a;
}

describe('물건', () => {
  it('새 물건은 모든 장면에 같은 자리로 들어가고 원본은 그대로다', () => {
    const a = withTwoScenes();
    const { activity, id } = addObject(a, { kind: 'cone' }, { x: 1, z: 2, rot: 0 });
    expect(a.objects).toHaveLength(0);
    expect(activity.objects).toHaveLength(1);
    expect(activity.scenes[0].poses[id]).toEqual({ x: 1, z: 2, rot: 0 });
    expect(activity.scenes[1].poses[id]).toEqual({ x: 1, z: 2, rot: 0 });
  });

  it('옮기기는 지금 장면만 바꾼다', () => {
    const { activity, id } = addObject(withTwoScenes(), { kind: 'kid', teamId: 'red' }, { x: 0, z: 0, rot: 0 });
    const start = { [id]: activity.scenes[1].poses[id] };
    const moved = moveObjects(activity, 1, start, 0.1 + 0.2, -1);
    expect(moved.scenes[1].poses[id]).toMatchObject({ x: 0.3, z: -1 });
    expect(moved.scenes[0].poses[id]).toMatchObject({ x: 0, z: 0 });
  });

  it('경기장 밖 3m보다 멀리는 못 나간다', () => {
    const a = emptyActivity('검사', 'gym'); // 24 × 14
    expect(clampToField(a, 100, -100)).toEqual([15, -10]);
  });

  it('돌리기 각도는 -π~π로 정리된다', () => {
    expect(normAngle(Math.PI * 1.5)).toBeCloseTo(-Math.PI / 2);
    const { activity, id } = addObject(emptyActivity(), { kind: 'kid' }, { x: 0, z: 0, rot: Math.PI - 0.1 });
    const r = rotateObjects(activity, 0, [id], 0.2).scenes[0].poses[id].rot;
    expect(r).toBeCloseTo(-Math.PI + 0.1);
  });

  it('지우면 말풍선과 강조도 함께 사라진다', () => {
    let { activity, id } = addObject(emptyActivity(), { kind: 'kid' }, { x: 0, z: 0, rot: 0 });
    activity = addBubble(activity, 0, { objId: id, text: '안녕' }).activity;
    activity = toggleHighlight(activity, 0, [id]);
    const removed = removeObjects(activity, [id]);
    expect(removed.objects).toHaveLength(0);
    expect(removed.scenes[0].bubbles).toHaveLength(0);
    expect(removed.scenes[0].highlights).toHaveLength(0);
    expect(removed.scenes[0].poses[id]).toBeUndefined();
  });

  it('복사본은 옆에 놓이고 새 id를 갖는다', () => {
    const { activity, id } = addObject(withTwoScenes(), { kind: 'cone' }, { x: 1, z: 1, rot: 0 });
    const res = duplicateObjects(activity, [id]);
    expect(res.ids).toHaveLength(1);
    expect(res.ids[0]).not.toBe(id);
    expect(res.activity.scenes[1].poses[res.ids[0]]).toMatchObject({ x: 1.6, z: 1.6 });
  });
});

describe('강조', () => {
  it('하나라도 꺼져 있으면 모두 켜고, 모두 켜져 있으면 끈다', () => {
    let a = emptyActivity();
    a = toggleHighlight(a, 0, ['a']);
    a = toggleHighlight(a, 0, ['a', 'b']);
    expect(a.scenes[0].highlights.sort()).toEqual(['a', 'b']);
    a = toggleHighlight(a, 0, ['a', 'b']);
    expect(a.scenes[0].highlights).toEqual([]);
  });
});

describe('팀', () => {
  it('새 팀은 아직 안 쓴 색을 고른다', () => {
    const a = emptyActivity(); // 빨강, 노랑
    const { activity } = addTeam(a);
    expect(activity.teams[2].color).toBe('#2f6fdf');
    expect(activity.teams[2].name).toBe('파랑 팀');
  });

  it('팀을 지우면 그 팀 학생은 색을 그대로 유지한다', () => {
    const { activity, id } = addObject(emptyActivity(), { kind: 'kid', teamId: 'red' }, { x: 0, z: 0, rot: 0 });
    const next = removeTeam(activity, 'red');
    const kid = next.objects.find((o) => o.id === id)!;
    expect(kid.teamId).toBeUndefined();
    expect(kid.color).toBe('#e5484d');
  });
});

describe('구역·화살표', () => {
  it('구역은 경기장에, 화살표는 장면에 들어간다', () => {
    const a = withTwoScenes();
    const z = addZone(a, { x: 0, z: 0, w: 2, d: 3, color: '#fff' }).activity;
    expect(z.field.zones).toHaveLength(1);
    const ar = addArrow(z, 1, { x1: 0, z1: 0, x2: 1, z2: 0 }).activity;
    expect(ar.scenes[0].arrows).toHaveLength(0);
    expect(ar.scenes[1].arrows).toHaveLength(1);
  });
});
