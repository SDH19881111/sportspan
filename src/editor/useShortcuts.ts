import { useEffect } from 'react';
import { removeScene } from '../model/ops';
import { unlockAudio } from '../audio/sfx';
import { startPresent } from '../present/Presenter';
import {
  copySel,
  cycleSel,
  deleteSel,
  duplicateSel,
  flipSel,
  focusRename,
  groupSel,
  newScene,
  nudgeSel,
  paste,
  rotateSel,
  selectAll,
} from './actions';
import { floorApi } from './Interaction';
import { useEditor } from './store';

/** 마우스가 3D 작업판 위에 있는지(Tab으로 고르기는 작업판 위에서만) */
export const pointer = { overStage: false };

function typing(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}

// 편집 단축키(윈도우·PPT에서 쓰던 것과 같게)
//  Ctrl+Z/Y(Ctrl+Shift+Z) 되돌리기·다시 하기, Ctrl+S 저장, Ctrl+O 내 설명판, Ctrl+A 모두 선택,
//  Ctrl+C/X/V 복사·잘라내기·붙여넣기, Ctrl+D 바로 복제, Delete 지우기, Ctrl+G 묶기(Shift: 풀기),
//  Ctrl+M 새 장면, F2 이름 고치기, Tab/Shift+Tab 다음·이전 것 고르기(작업판 위), Q/E 돌리기, H/V 뒤집기,
//  방향키 10cm씩(Shift: 격자 한 칸, 안 골랐거나 Alt: 화면 옮기기), Esc 고르기 도구,
//  PageUp/PageDown 장면 넘기기, Home/End 첫·마지막 장면, Space 재생, F5 발표
export function useShortcuts(onSave: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useEditor.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (st.presenting !== null) return; // 발표 화면이 키를 따로 받는다
      if (st.menu) {
        // 빠른 메뉴가 떠 있으면 Esc는 메뉴만 닫는다
        if (e.key === 'Escape') {
          e.preventDefault();
          st.setMenu(null);
        }
        return;
      }

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
      if (mod && key === 'o') {
        e.preventDefault();
        st.setLibOpen(true);
        return;
      }
      if (st.libOpen) return; // 내 설명판 창이 떠 있는 동안은 편집하지 않는다
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
      if (typing(e)) {
        // 글자 칸에서 Esc를 누르면 칸에서 나와 다시 단축키를 쓸 수 있게
        if (e.key === 'Escape') (e.target as HTMLElement).blur();
        return;
      }

      if (e.key === 'Escape') {
        st.setTool({ t: 'select' });
        st.setSel([]);
        st.setScrubT(null);
        return;
      }
      if (mod && key === 'a') {
        e.preventDefault();
        selectAll();
        return;
      }
      if (mod && key === 'm') {
        e.preventDefault();
        newScene();
        return;
      }
      if (e.key === 'F2') {
        e.preventDefault();
        focusRename();
        return;
      }
      if (e.key === 'Tab' && !mod && pointer.overStage) {
        e.preventDefault();
        cycleSel(e.shiftKey ? -1 : 1);
        return;
      }
      if (e.key === 'PageDown' || e.key === 'PageUp') {
        e.preventDefault();
        st.setSceneIdx(st.sceneIdx + (e.key === 'PageDown' ? 1 : -1));
        return;
      }
      if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        st.setSceneIdx(e.key === 'Home' ? 0 : st.activity.scenes.length - 1);
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
        paste();
        return;
      }
      if (!sel.length) return;
      if (mod && (key === 'c' || key === 'x')) {
        e.preventDefault();
        copySel(key === 'x');
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSel();
        return;
      }
      if (mod && key === 'd') {
        e.preventDefault();
        duplicateSel();
        return;
      }
      if (mod && key === 'g') {
        e.preventDefault();
        groupSel(!e.shiftKey);
        return;
      }
      if (mod) return;
      if (key === 'h' || key === 'v') {
        flipSel(key === 'h' ? 'x' : 'z');
        return;
      }
      if (key === 'q' || key === 'e') {
        rotateSel(key === 'q' ? 1 : -1);
        return;
      }
      const a = arrows[e.key];
      if (a) {
        e.preventDefault();
        const step = e.shiftKey ? st.grid.size : 0.1;
        nudgeSel(a[0] * step, -a[1] * step);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSave]);
}
