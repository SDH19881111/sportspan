import { describe, expect, it } from 'vitest';
import { emptyActivity, type Activity } from '../src/model/activity';
import {
  addObject,
  addSceneAfter,
  addZone,
  duplicateItems,
  expandGroups,
  groupItems,
  lockedCount,
  moveItems,
  moveScene,
  removeItems,
  removeScene,
  setLocked,
  ungroupItems,
  unlockAll,
} from '../src/model/ops';
import { coneSoccer } from '../src/samples/coneSoccer';
import { fromFile, toFile, validateActivity } from '../src/storage/library';

function setup(): { a: Activity; kid: string; cone: string; zone: string } {
  let a = emptyActivity('검사');
  const k = addObject(a, { kind: 'kid', teamId: 'red' }, { x: 0, z: 0, rot: 0 });
  a = k.activity;
  const c = addObject(a, { kind: 'cone' }, { x: 1, z: 0, rot: 0 });
  a = c.activity;
  const z = addZone(a, { x: 0, z: 0, w: 4, d: 4, color: '#3f6fc4' });
  return { a: z.activity, kid: k.id, cone: c.id, zone: z.id };
}

describe('묶음', () => {
  it('하나만 골라도 묶음 전체가 골라진다', () => {
    const { a, kid, cone, zone } = setup();
    const g = groupItems(a, [kid, zone]);
    expect(expandGroups(g, [zone]).sort()).toEqual([kid, zone].sort());
    expect(expandGroups(g, [cone])).toEqual([cone]);
    expect(expandGroups(ungroupItems(g, [kid, zone]), [zone])).toEqual([zone]);
  });

  it('묶음을 옮기면 구역과 학생이 함께 움직인다', () => {
    const { a, kid, zone } = setup();
    const moved = moveItems(a, 0, [kid, zone], 2, -1);
    expect(moved.scenes[0].poses[kid]).toMatchObject({ x: 2, z: -1 });
    expect(moved.field.zones[0]).toMatchObject({ x: 2, z: -1 });
  });

  it('묶음째 복사하면 복사본끼리 새 묶음이 된다', () => {
    const { a, kid, zone } = setup();
    const g = groupItems(a, [kid, zone]);
    const res = duplicateItems(g, [kid, zone]);
    expect(res.ids).toHaveLength(2);
    const newGroup = expandGroups(res.activity, [res.ids[0]]);
    expect(newGroup.sort()).toEqual([...res.ids].sort());
  });
});

describe('고정', () => {
  it('고정하고 풀기', () => {
    const { a, kid, zone } = setup();
    const l = setLocked(a, [kid, zone], true);
    expect(lockedCount(l)).toBe(2);
    expect(lockedCount(unlockAll(l))).toBe(0);
  });
});

describe('지우기', () => {
  it('물건과 구역을 함께 지운다', () => {
    const { a, kid, zone } = setup();
    const r = removeItems(a, 0, [kid, zone]);
    expect(r.objects).toHaveLength(1);
    expect(r.field.zones).toHaveLength(0);
  });
});

describe('장면', () => {
  it('다음 장면은 자리를 이어받고 설명·표시는 비운다', () => {
    let { a, kid } = setup();
    a.scenes[0].caption = '첫 장면';
    a.scenes[0].highlights = [kid];
    a.scenes[0].poses[kid].move = 'throw';
    const res = addSceneAfter(a, 0);
    expect(res.idx).toBe(1);
    const s = res.activity.scenes[1];
    expect(s.poses[kid]).toEqual({ x: 0, z: 0, rot: 0 });
    expect(s.caption).toBe('');
    expect(s.highlights).toEqual([]);
    expect(s.id).not.toBe(a.scenes[0].id);
  });

  it('순서 바꾸기와 지우기, 마지막 하나는 못 지운다', () => {
    let { a } = setup();
    a = addSceneAfter(a, 0).activity;
    a.scenes[1].caption = '둘째';
    a = moveScene(a, 1, -1);
    expect(a.scenes[0].caption).toBe('둘째');
    a = removeScene(a, 0);
    expect(a.scenes).toHaveLength(1);
    expect(removeScene(a, 0).scenes).toHaveLength(1);
  });
});

describe('파일', () => {
  it('내보낸 파일을 다시 가져오면 새 id로 같은 내용이 된다', () => {
    const { text } = toFile(coneSoccer);
    const back = fromFile(text);
    expect(back.id).not.toBe(coneSoccer.id);
    expect(back.objects).toEqual(coneSoccer.objects);
    expect(back.scenes[0].poses).toEqual(coneSoccer.scenes[0].poses);
  });

  it('다른 파일은 알아듣게 거절한다', () => {
    expect(() => fromFile('{"hello": 1}')).toThrow('체육 설명판 파일이 아닙니다');
    expect(() => fromFile('not json')).toThrow('체육 설명판 파일이 아닙니다');
    expect(() => validateActivity({ ...coneSoccer, scenes: [] })).toThrow('장면');
  });
});
