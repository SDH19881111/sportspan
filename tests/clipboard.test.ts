import { describe, expect, it } from 'vitest';
import { emptyActivity } from '../src/model/activity';
import { addAnim, addObject, addZone, copyItems, groupItems, pasteItems, setLocked } from '../src/model/ops';
import { buildTimeline } from '../src/motion/timeline';

describe('복사·붙여넣기', () => {
  it('지금 장면 자리에서 비켜 놓이고, 새 id·새 묶음, 고정은 풀린다', () => {
    let a = emptyActivity('검사');
    const k = addObject(a, { kind: 'kid', teamId: 'red' }, { x: 1, z: 1, rot: 0.5 });
    a = k.activity;
    const z = addZone(a, { x: 0, z: 0, w: 2, d: 2, color: '#fff' });
    a = groupItems(z.activity, [k.id, z.id]);
    a = setLocked(a, [k.id, z.id], true);
    const clip = copyItems(a, 0, [k.id, z.id]);
    const res = pasteItems(a, clip, 1);
    expect(res.ids).toHaveLength(2);
    const kid = res.activity.objects.find((o) => o.id === res.ids[0])!;
    expect(kid.teamId).toBe('red');
    expect(kid.locked).toBeUndefined();
    expect(kid.groupId).toBeDefined();
    expect(kid.groupId).not.toBe(a.objects[0].groupId);
    expect(res.activity.scenes[0].poses[kid.id]).toEqual({ x: 2, z: 2, rot: 0.5 });
    const zone = res.activity.field.zones.find((v) => v.id === res.ids[1])!;
    expect(zone).toMatchObject({ x: 1, z: 1, groupId: kid.groupId });
  });

  it('다른 설명판에 붙이면 같은 색 팀을 찾고, 없으면 그 색 그대로 팀 없이', () => {
    let src = emptyActivity('원본');
    src.teams = [{ id: 'blue', name: '파랑 팀', color: '#2f6fdf' }, ...src.teams];
    const k = addObject(src, { kind: 'kid', teamId: 'blue' }, { x: 0, z: 0, rot: 0 });
    const r = addObject(k.activity, { kind: 'kid', teamId: 'red' }, { x: 1, z: 0, rot: 0 });
    src = r.activity;
    const clip = copyItems(src, 0, [k.id, r.id]);

    const dst = emptyActivity('다른 것'); // 빨강·노랑 팀만 있음
    dst.teams[0].id = 'redTeam'; // 색은 같고 id가 다른 빨강 팀
    const res = pasteItems(dst, clip, 0);
    const [blueKid, redKid] = res.activity.objects;
    expect(blueKid.teamId).toBeUndefined();
    expect(blueKid.color).toBe('#2f6fdf');
    expect(redKid.teamId).toBe('redTeam');
  });
});

describe('애니메이션 빠르기', () => {
  it('0.5배면 같은 길을 두 배 시간 동안 가고, 도착점은 같다', () => {
    const k = addObject(emptyActivity(), { kind: 'kid' }, { x: 0, z: 0, rot: 0 });
    const base = { objId: k.id, kind: 'move' as const, start: 'click' as const, delay: 0, to: { x: 6, z: 0 } };
    const normal = buildTimeline(addAnim(k.activity, 0, base).activity, 0);
    const slow = buildTimeline(addAnim(k.activity, 0, { ...base, speed: 0.5 }).activity, 0);
    expect(slow.duration).toBeCloseTo(normal.duration * 2);
    expect(slow.at(k.id, slow.duration)).toMatchObject({ x: 6, z: 0 });
    expect(slow.at(k.id, normal.duration)!.x).toBeCloseTo(normal.at(k.id, normal.duration / 2)!.x);
  });
});
