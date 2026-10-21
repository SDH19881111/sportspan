import { beforeEach, describe, expect, it } from 'vitest';
import { useEditor } from '../src/editor/store';
import { emptyActivity } from '../src/model/activity';
import { addObject, moveObjects, setTitle } from '../src/model/ops';

beforeEach(() => useEditor.getState().load(emptyActivity('검사')));

describe('실행 취소', () => {
  it('되돌리기와 다시 하기', () => {
    const st = useEditor.getState;
    const { activity, id } = addObject(st().activity, { kind: 'cone' }, { x: 0, z: 0, rot: 0 });
    st().commit(activity);
    expect(st().activity.objects).toHaveLength(1);
    st().undo();
    expect(st().activity.objects).toHaveLength(0);
    st().redo();
    expect(st().activity.objects[0].id).toBe(id);
  });

  it('끌기는 여러 번 미리보기해도 기록이 한 번만 남는다', () => {
    const st = useEditor.getState;
    const { activity, id } = addObject(st().activity, { kind: 'cone' }, { x: 0, z: 0, rot: 0 });
    st().commit(activity);
    const start = { [id]: st().activity.scenes[0].poses[id] };
    st().beginGesture();
    for (let i = 1; i <= 5; i++) st().preview(moveObjects(st().activity, 0, start, i, 0));
    st().endGesture();
    expect(st().past).toHaveLength(2);
    st().undo();
    expect(st().activity.scenes[0].poses[id].x).toBe(0);
  });

  it('글자 입력은 한 번으로 묶인다', () => {
    const st = useEditor.getState;
    for (const t of ['콘', '콘 축', '콘 축구']) st().commit(setTitle(st().activity, t), 'title');
    expect(st().past).toHaveLength(1);
    st().undo();
    expect(st().activity.title).toBe('검사');
  });

  it('되돌린 뒤 사라진 물건은 선택에서 빠진다', () => {
    const st = useEditor.getState;
    const { activity, id } = addObject(st().activity, { kind: 'cone' }, { x: 0, z: 0, rot: 0 });
    st().commit(activity);
    st().setSel([id]);
    st().undo();
    expect(st().sel).toEqual([]);
  });
});
