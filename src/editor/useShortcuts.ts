import { useEffect } from 'react';
import {
  duplicateItems,
  groupItems,
  isLocked,
  moveItems,
  removeItems,
  removeScene,
  rotateObjects,
  ungroupItems,
} from '../model/ops';
import { selectedObjIds, useEditor } from './store';

const STEP = Math.PI / 12;

function typing(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}

// 편집 단축키
//  Ctrl+Z/Y 되돌리기·다시 하기, Ctrl+S 저장, Delete 지우기, Ctrl+D 복사, Ctrl+G 묶기(Shift: 풀기),
//  Q/E 돌리기, 화살표 키 10cm씩, Esc 고르기 도구, PageUp/PageDown 장면 넘기기, Space 재생
export function useShortcuts(onSave: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useEditor.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (mod && key === 's') {
        e.preventDefault();
        onSave();
        return;
      }
      if (st.playing) {
        if (e.key === 'Escape' || e.key === ' ') {
          e.preventDefault();
          st.stop();
        }
        return;
      }
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
        st.setSel([]);
        return;
      }
      if (e.key === 'PageDown' || e.key === 'PageUp') {
        e.preventDefault();
        st.setSceneIdx(st.sceneIdx + (e.key === 'PageDown' ? 1 : -1));
        return;
      }
      if (e.key === ' ') {
        e.preventDefault();
        st.play(st.sceneIdx, false);
        return;
      }
      // 장면 띠에서 장면을 고른 상태: Delete는 장면을 지운다(PPT처럼)
      if (st.focus === 'scenes' && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        if (st.activity.scenes.length > 1) {
          const idx = st.sceneIdx;
          st.commit(removeScene(st.activity, idx));
          st.setSceneIdx(Math.min(idx, st.activity.scenes.length - 2));
          useEditor.getState().setFocus('scenes');
        }
        return;
      }

      const sel = st.sel;
      if (!sel.length) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        st.commit(removeItems(st.activity, st.sceneIdx, sel));
        st.setSel([]);
        return;
      }
      if (mod && key === 'd') {
        e.preventDefault();
        const res = duplicateItems(st.activity, sel);
        st.commit(res.activity);
        st.setSel(res.ids);
        return;
      }
      if (mod && key === 'g') {
        e.preventDefault();
        st.commit(e.shiftKey ? ungroupItems(st.activity, sel) : groupItems(st.activity, sel));
        return;
      }
      const objs = selectedObjIds(sel, st.activity);
      if ((key === 'q' || key === 'e') && objs.length) {
        st.commit(rotateObjects(st.activity, st.sceneIdx, objs, key === 'q' ? STEP : -STEP), 'rotate-key');
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
        const moving = sel.filter((id) => !isLocked(st.activity, id));
        st.commit(moveItems(st.activity, st.sceneIdx, moving, d[0], d[1]), 'nudge');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSave]);
}
