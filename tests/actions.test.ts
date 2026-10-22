// 단축키·오른쪽 클릭 메뉴가 함께 쓰는 편집 동작: 고정된 것은 골라도 옮기기·지우기에서 빠진다
import { beforeEach, describe, expect, it } from 'vitest';
import {
  copySel,
  cycleSel,
  deleteSel,
  flipSel,
  lockSel,
  nudgeSel,
  pasteAt,
  rotateSel,
  selectAll,
} from '../src/editor/actions';
import { useEditor } from '../src/editor/store';
import { emptyActivity } from '../src/model/activity';
import { setCourt } from '../src/model/courts';
import { addObject, groupItems, setLocked } from '../src/model/ops';

const st = useEditor.getState;
let kid = '';
let cone = '';

beforeEach(() => {
  let a = emptyActivity('검사');
  const k = addObject(a, { kind: 'kid' }, { x: -2, z: 0, rot: 0 });
  kid = k.id;
  const c = addObject(k.activity, { kind: 'cone' }, { x: 2, z: 1, rot: 0 });
  cone = c.id;
  a = setLocked(c.activity, [cone], true);
  st().load(a);
});

describe('고정된 것', () => {
  it('골라도 옮기기·돌리기·뒤집기·지우기에서 빠진다', () => {
    st().setSel([kid, cone]);
    nudgeSel(1, 0);
    rotateSel(1);
    flipSel('x');
    const p = st().activity.scenes[0].poses;
    expect(p[cone]).toMatchObject({ x: 2, z: 1, rot: 0 });
    expect(p[kid].x).not.toBe(-2);
    deleteSel();
    expect(st().activity.objects.map((o) => o.id)).toEqual([cone]);
    expect(st().sel).toEqual([cone]); // 남은 고정된 것은 그대로 골라져 있다
  });

  it('하나씩 풀 수 있다', () => {
    st().commit(setLocked(st().activity, [kid], true));
    st().setSel([cone]);
    lockSel(false);
    const a = st().activity;
    expect(a.objects.find((o) => o.id === cone)!.locked).toBeUndefined();
    expect(a.objects.find((o) => o.id === kid)!.locked).toBe(true);
  });
});

describe('모두 선택·Tab', () => {
  it('Ctrl+A는 고정 안 된 것만(경기장 선 틀은 빼고)', () => {
    st().commit(setCourt(st().activity, 'dodge'));
    selectAll();
    expect(st().sel).toEqual([kid]);
  });

  it('Tab은 고정된 것도 포함해 하나씩, 묶음은 묶음째', () => {
    cycleSel(1);
    expect(st().sel).toEqual([kid]);
    cycleSel(1);
    expect(st().sel).toEqual([cone]);
    cycleSel(1);
    expect(st().sel).toEqual([kid]); // 끝에서 처음으로
    cycleSel(-1);
    expect(st().sel).toEqual([cone]);

    const b = addObject(st().activity, { kind: 'ball' }, { x: 0, z: 0, rot: 0 });
    st().commit(groupItems(b.activity, [kid, b.id]));
    st().setSel([]);
    cycleSel(1);
    expect(st().sel.sort()).toEqual([kid, b.id].sort());
  });
});

describe('여기에 붙여넣기', () => {
  it('붙여 넣은 것들의 한가운데가 누른 자리에 온다', () => {
    const b = addObject(st().activity, { kind: 'ball' }, { x: 0, z: 2, rot: 0 });
    st().commit(b.activity);
    st().setSel([kid, b.id]); // 한가운데 (-1, 1)
    copySel();
    pasteAt(5, 5);
    const p = st().activity.scenes[0].poses;
    const made = st().sel;
    expect(made).toHaveLength(2);
    const cx = (p[made[0]].x + p[made[1]].x) / 2;
    const cz = (p[made[0]].z + p[made[1]].z) / 2;
    expect(cx).toBeCloseTo(5);
    expect(cz).toBeCloseTo(5);
  });
});
