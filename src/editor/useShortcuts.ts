import { useEffect } from 'react';
import {
  clipIsEmpty,
  copyItems,
  duplicateItems,
  pasteItems,
  type Clip,
  groupItems,
  isLocked,
  moveItems,
  removeItems,
  removeScene,
  rotateObjects,
  ungroupItems,
} from '../model/ops';
import { unlockAudio } from '../audio/sfx';
import { startPresent } from '../present/Presenter';
import { floorApi } from './Interaction';
import { selectedObjIds, useEditor } from './store';

/** 복사해 둔 것. 붙여 넣을 때마다 조금씩 비켜 놓는다. 다른 설명판을 열어도 남아 있다. */
const clipboard: { clip: Clip | null; pastes: number } = { clip: null, pastes: 0 };

const STEP = Math.PI / 12;

function typing(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}

// 편집 단축키
//  Ctrl+Z/Y 되돌리기·다시 하기, Ctrl+S 저장, Delete 지우기, Ctrl+C/X/V 복사·잘라내기·붙여넣기,
//  Ctrl+D 바로 복제, Ctrl+G 묶기(Shift: 풀기), Q/E 돌리기, 방향키 10cm씩(안 골랐거나 Alt: 화면 옮기기),
//  Esc 고르기 도구, PageUp/PageDown 장면 넘기기, Space 재생
export function useShortcuts(onSave: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useEditor.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (st.presenting !== null) return; // 발표 화면이 키를 따로 받는다

      // F5 처음부터 발표, Shift+F5 지금 장면부터(PPT와 같게)
      if (e.key === 'F5' && !mod) {
        e.preventDefault();
        startPresent(e.shiftKey ? st.sceneIdx : 0);
        return;
      }

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
        st.setScrubT(null);
        return;
      }
      if (e.key === 'PageDown' || e.key === 'PageUp') {
        e.preventDefault();
        st.setSceneIdx(st.sceneIdx + (e.key === 'PageDown' ? 1 : -1));
        return;
      }
      if (e.key === ' ') {
        e.preventDefault();
        unlockAudio();
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
      const arrows: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, 1],
        ArrowDown: [0, -1],
      };
      // 아무것도 안 골랐거나 Alt를 누르면 방향키로 화면(시점)을 옮긴다
      if (arrows[e.key] && (!sel.length || e.altKey)) {
        e.preventDefault();
        const k = e.shiftKey ? 3 : 1;
        floorApi.pan(arrows[e.key][0] * k, arrows[e.key][1] * k);
        return;
      }
      if (mod && key === 'v') {
        e.preventDefault();
        if (clipIsEmpty(clipboard.clip)) return;
        clipboard.pastes += 1;
        const g = st.grid;
        const unit = g.snap ? g.size * Math.max(1, Math.ceil(0.6 / g.size)) : 0.6;
        const res = pasteItems(st.activity, clipboard.clip!, unit * clipboard.pastes);
        st.commit(res.activity);
        st.setSel(res.ids);
        return;
      }
      if (!sel.length) return;
      if (mod && (key === 'c' || key === 'x')) {
        e.preventDefault();
        clipboard.clip = copyItems(st.activity, st.sceneIdx, sel);
        clipboard.pastes = key === 'x' ? -1 : 0; // 잘라 낸 것은 첫 붙여넣기를 제자리에
        if (key === 'x') {
          st.commit(removeItems(st.activity, st.sceneIdx, sel));
          st.setSel([]);
        }
        return;
      }
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
