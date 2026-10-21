import { useEffect } from 'react';
import { duplicateObjects, removeFieldItem, removeObjects, removeSceneMark, rotateObjects, moveObjects } from '../model/ops';
import { selectedObjIds, useEditor } from './store';

const STEP = Math.PI / 12;

function typing(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}

// 편집 단축키: Ctrl+Z/Y 되돌리기, Delete 지우기, Ctrl+D 복사, Q/E 돌리기, 화살표 키로 10cm씩 옮기기, Esc 고르기 도구.
export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useEditor.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
        return;
      }
      if (mod && key === 'y') {
        e.preventDefault();
        st.redo();
        return;
      }
      if (typing(e)) return;

      if (e.key === 'Escape') {
        st.setTool({ t: 'select' });
        st.setSel(null);
        return;
      }

      const ids = selectedObjIds(st.sel);
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (ids.length) st.commit(removeObjects(st.activity, ids));
        else if (st.sel?.t === 'zone' || st.sel?.t === 'line') st.commit(removeFieldItem(st.activity, st.sel.id));
        else if (st.sel?.t === 'arrow' || st.sel?.t === 'bubble')
          st.commit(removeSceneMark(st.activity, st.sceneIdx, st.sel.id));
        else return;
        e.preventDefault();
        st.setSel(null);
        return;
      }
      if (!ids.length) return;

      if (mod && key === 'd') {
        e.preventDefault();
        const res = duplicateObjects(st.activity, ids);
        st.commit(res.activity);
        st.setSel({ t: 'obj', ids: res.ids });
        return;
      }
      if (key === 'q' || key === 'e') {
        st.commit(rotateObjects(st.activity, st.sceneIdx, ids, key === 'q' ? STEP : -STEP), 'rotate-key');
        return;
      }
      const nudge: Record<string, [number, number]> = {
        ArrowLeft: [-0.1, 0],
        ArrowRight: [0.1, 0],
        ArrowUp: [0, -0.1],
        ArrowDown: [0, 0.1],
      };
      const d = nudge[e.key];
      if (d) {
        e.preventDefault();
        const scene = st.activity.scenes[st.sceneIdx];
        const start = Object.fromEntries(ids.filter((id) => scene.poses[id]).map((id) => [id, scene.poses[id]]));
        st.commit(moveObjects(st.activity, st.sceneIdx, start, d[0], d[1]), 'nudge');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
