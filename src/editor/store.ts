import { create } from 'zustand';
import type { Activity, ObjectKind } from '../model/activity';
import { itemKind } from '../model/ops';
import { coneSoccer } from '../samples/coneSoccer';

export type Tool =
  | { t: 'select' }
  | { t: 'place'; kind: ObjectKind; teamId?: string }
  | { t: 'zone' }
  | { t: 'line' }
  | { t: 'arrow' }
  | { t: 'bubble' };

/** 고른 것들의 id(물건·구역·선·화살표·말풍선이 섞일 수 있다) */
export type Selection = string[];

/** 구역·선·화살표를 그리는 중의 미리보기 */
export interface Draft {
  t: 'zone' | 'line' | 'arrow';
  x1: number;
  z1: number;
  x2: number;
  z2: number;
}

/** 재생 중: target 장면으로 넘어가는 움직임을 보여 준다. all이면 끝까지 이어서. */
export interface Playing {
  target: number;
  all: boolean;
}

const HISTORY_LIMIT = 100;
const MERGE_MS = 1500;

interface EditorState {
  activity: Activity;
  sceneIdx: number;
  tool: Tool;
  sel: Selection;
  draft: Draft | null;
  dragging: boolean;
  zoneColor: string;
  lineColor: string;
  past: Activity[];
  future: Activity[];
  gestureBase: Activity | null;
  playing: Playing | null;
  play: (target: number, all: boolean) => void;
  stop: () => void;

  /** 바로 기록하는 변경(버튼·키 한 번). mergeKey가 같은 연속 입력(글자 치기)은 한 번으로 묶는다. */
  commit: (next: Activity, mergeKey?: string) => void;
  lastMerge: { key: string; at: number } | null;
  /** 끌기 시작 → 미리보기 여러 번 → 끝에서 한 번만 기록 */
  beginGesture: () => void;
  preview: (next: Activity) => void;
  endGesture: () => void;
  undo: () => void;
  redo: () => void;
  setTool: (tool: Tool) => void;
  setSel: (sel: Selection) => void;
  setDraft: (draft: Draft | null) => void;
  setDragging: (v: boolean) => void;
  setZoneColor: (c: string) => void;
  setLineColor: (c: string) => void;
  load: (a: Activity) => void;
  setSceneIdx: (idx: number) => void;
}

function pushPast(past: Activity[], a: Activity) {
  const next = [...past, a];
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
}

export const useEditor = create<EditorState>((set, get) => ({
  activity: structuredClone(coneSoccer),
  sceneIdx: 0,
  tool: { t: 'select' },
  sel: [],
  draft: null,
  dragging: false,
  zoneColor: '#3f6fc4',
  lineColor: '#ffffff',
  past: [],
  future: [],
  gestureBase: null,
  playing: null,
  play: (target, all) => {
    const n = get().activity.scenes.length;
    if (target < 1 || target >= n) return;
    set({ playing: { target, all }, sceneIdx: target - 1, sel: [], tool: { t: 'select' }, draft: null });
  },
  stop: () => set({ playing: null }),

  lastMerge: null,
  commit: (next, mergeKey) => {
    const { activity, past, lastMerge } = get();
    if (next === activity) return;
    const now = Date.now();
    if (mergeKey && lastMerge && lastMerge.key === mergeKey && now - lastMerge.at < MERGE_MS && past.length) {
      set({ activity: next, future: [], lastMerge: { key: mergeKey, at: now } });
      return;
    }
    set({
      activity: next,
      past: pushPast(past, activity),
      future: [],
      lastMerge: mergeKey ? { key: mergeKey, at: now } : null,
    });
  },
  beginGesture: () => set({ gestureBase: get().activity, lastMerge: null }),
  preview: (next) => set({ activity: next }),
  endGesture: () => {
    const { gestureBase, activity, past } = get();
    if (gestureBase && gestureBase !== activity) {
      set({ past: pushPast(past, gestureBase), future: [], gestureBase: null });
    } else {
      set({ gestureBase: null });
    }
  },
  undo: () => {
    const { past, activity, future } = get();
    if (!past.length) return;
    const prev = past[past.length - 1];
    const sceneIdx = Math.min(get().sceneIdx, prev.scenes.length - 1);
    set({
      activity: prev,
      sceneIdx,
      past: past.slice(0, -1),
      future: [activity, ...future],
      sel: validSel(get().sel, prev, sceneIdx),
    });
  },
  redo: () => {
    const { past, activity, future } = get();
    if (!future.length) return;
    const next = future[0];
    const sceneIdx = Math.min(get().sceneIdx, next.scenes.length - 1);
    set({
      activity: next,
      sceneIdx,
      past: pushPast(past, activity),
      future: future.slice(1),
      sel: validSel(get().sel, next, sceneIdx),
    });
  },
  setTool: (tool) => set({ tool, draft: null }),
  setSel: (sel) => set({ sel }),
  setDraft: (draft) => set({ draft }),
  setDragging: (dragging) => set({ dragging }),
  setZoneColor: (zoneColor) => set({ zoneColor }),
  setLineColor: (lineColor) => set({ lineColor }),
  load: (a) =>
    set({ activity: a, sceneIdx: 0, sel: [], past: [], future: [], tool: { t: 'select' }, draft: null, playing: null }),
  setSceneIdx: (sceneIdx) => {
    const { activity, sel } = get();
    const idx = Math.max(0, Math.min(activity.scenes.length - 1, sceneIdx));
    set({ sceneIdx: idx, sel: validSel(sel, activity, idx), lastMerge: null });
  },
}));

/** 실행 취소·장면 바꾸기 뒤에 없는 것을 고르고 있으면 빼 준다. */
export function validSel(sel: Selection, a: Activity, sceneIdx: number): Selection {
  const kept = sel.filter((id) => itemKind(a, sceneIdx, id));
  return kept.length === sel.length ? sel : kept;
}

/** 고른 것 중 물건만 */
export function selectedObjIds(sel: Selection, a: Activity): string[] {
  return sel.filter((id) => a.objects.some((o) => o.id === id));
}

// 개발 중 브라우저 콘솔에서 상태를 들여다볼 수 있게
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __peboard: typeof useEditor }).__peboard = useEditor;
}
