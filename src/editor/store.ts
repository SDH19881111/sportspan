import { create } from 'zustand';
import type { Activity, ObjectKind } from '../model/activity';
import { coneSoccer } from '../samples/coneSoccer';

export type Tool =
  | { t: 'select' }
  | { t: 'place'; kind: ObjectKind; teamId?: string }
  | { t: 'zone' }
  | { t: 'line' }
  | { t: 'arrow' }
  | { t: 'bubble' };

export type Selection =
  | { t: 'obj'; ids: string[] }
  | { t: 'zone' | 'line' | 'arrow' | 'bubble'; id: string }
  | null;

/** 구역·선·화살표를 그리는 중의 미리보기 */
export interface Draft {
  t: 'zone' | 'line' | 'arrow';
  x1: number;
  z1: number;
  x2: number;
  z2: number;
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
}

function pushPast(past: Activity[], a: Activity) {
  const next = [...past, a];
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
}

export const useEditor = create<EditorState>((set, get) => ({
  activity: structuredClone(coneSoccer),
  sceneIdx: 0,
  tool: { t: 'select' },
  sel: null,
  draft: null,
  dragging: false,
  zoneColor: '#3f6fc4',
  lineColor: '#ffffff',
  past: [],
  future: [],
  gestureBase: null,

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
    set({ activity: prev, past: past.slice(0, -1), future: [activity, ...future], sel: validSel(get().sel, prev) });
  },
  redo: () => {
    const { past, activity, future } = get();
    if (!future.length) return;
    const next = future[0];
    set({ activity: next, past: pushPast(past, activity), future: future.slice(1), sel: validSel(get().sel, next) });
  },
  setTool: (tool) => set({ tool, draft: null }),
  setSel: (sel) => set({ sel }),
  setDraft: (draft) => set({ draft }),
  setDragging: (dragging) => set({ dragging }),
  setZoneColor: (zoneColor) => set({ zoneColor }),
  setLineColor: (lineColor) => set({ lineColor }),
  load: (a) => set({ activity: a, sceneIdx: 0, sel: null, past: [], future: [], tool: { t: 'select' } }),
}));

/** 실행 취소 뒤에 사라진 것을 고르고 있으면 선택을 정리한다. */
export function validSel(sel: Selection, a: Activity): Selection {
  if (!sel) return null;
  if (sel.t === 'obj') {
    const ids = sel.ids.filter((id) => a.objects.some((o) => o.id === id));
    return ids.length ? { t: 'obj', ids } : null;
  }
  const exists =
    a.field.zones.some((z) => z.id === sel.id) ||
    a.field.lines.some((l) => l.id === sel.id) ||
    a.scenes.some((s) => s.arrows.some((v) => v.id === sel.id) || s.bubbles.some((v) => v.id === sel.id));
  return exists ? sel : null;
}

export function selectedObjIds(sel: Selection): string[] {
  return sel?.t === 'obj' ? sel.ids : [];
}
