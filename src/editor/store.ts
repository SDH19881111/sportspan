import { create } from 'zustand';
import type { Activity, ObjectKind } from '../model/activity';
import { itemKind, type MoveMode } from '../model/ops';
import type { ZoneShape } from '../model/shapes';
import { coneSoccer } from '../samples/coneSoccer';

export type Tool =
  | { t: 'select' }
  | { t: 'place'; kind: ObjectKind; teamId?: string }
  | { t: 'zone' }
  | { t: 'line' }
  | { t: 'arrow' }
  | { t: 'bubble' }
  /**
   * 이동 경로: ids가 있으면 바닥을 누른 곳이 도착점, 없으면 물건을 눌러 끌어 놓는다.
   * 여러 개면 mode로 모이기(gather)·대형 유지(keep)를 고른다.
   */
  | { t: 'path'; ids?: string[]; mode?: MoveMode };

/** 고른 것들의 id(물건·구역·선·화살표·말풍선이 섞일 수 있다) */
export type Selection = string[];

/** 구역·선·화살표·이동 경로를 그리는 중의 미리보기 */
export interface Draft {
  t: 'zone' | 'line' | 'arrow' | 'path';
  x1: number;
  z1: number;
  x2: number;
  z2: number;
}

/** 재생 중: scene 장면의 애니메이션을 처음부터 튼다. all이면 다음 장면으로 이어서. */
export interface Playing {
  scene: number;
  all: boolean;
  /** 재생을 누를 때마다 새 번호(같은 장면을 다시 틀어도 처음부터) */
  run: number;
  /** 이 시각(초)부터 튼다(여기서부터 재생) */
  from: number;
}

/** 키보드 Delete가 무엇을 지울지: 화면에서 고른 것 / 장면 띠에서 고른 장면 */
export type Focus = 'canvas' | 'scenes';

export interface GridSettings {
  show: boolean; // 바닥에 격자 그리기
  snap: boolean; // 자석: 놓고 옮기고 그릴 때 격자 칸에 맞추기
  size: number; // 칸 크기(m)
}

/** 끌어서 고르기 사각형(화면 좌표) */
export interface Marquee {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const GRID_KEY = 'peboard.grid';
function loadGrid(): GridSettings {
  try {
    const g = JSON.parse(localStorage.getItem(GRID_KEY) ?? 'null');
    if (g && typeof g.size === 'number') return { show: !!g.show, snap: !!g.snap, size: g.size };
  } catch {
    /* 저장소를 못 쓰면 기본값 */
  }
  return { show: true, snap: true, size: 0.5 };
}
export type RightTab = 'props' | 'anims';

/** 오른쪽 클릭 빠른 메뉴: 화면 좌표와, 바닥을 눌렀을 때의 바닥 좌표 */
export interface ContextMenuState {
  x: number;
  y: number;
  floor: [number, number] | null;
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
  /** 구역 도구로 그릴 모양 */
  zoneShape: ZoneShape;
  lineColor: string;
  past: Activity[];
  future: Activity[];
  gestureBase: Activity | null;
  playing: Playing | null;
  play: (scene: number, all: boolean, from?: number) => void;
  /** 재생 중 지금 시각(애니메이션 창의 재생 헤드) */
  playT: number;
  setPlayT: (t: number) => void;
  /** 되감기: 편집 화면을 이 시각의 모습으로 보여 준다(null이면 장면 시작 모습) */
  scrubT: number | null;
  setScrubT: (t: number | null) => void;
  stop: () => void;
  focus: Focus;
  setFocus: (f: Focus) => void;
  rightTab: RightTab;
  setRightTab: (t: RightTab) => void;
  grid: GridSettings;
  setGrid: (patch: Partial<GridSettings>) => void;
  marquee: Marquee | null;
  setMarquee: (m: Marquee | null) => void;
  /** 발표 화면: 몇 번째 장면부터 발표 중인지(null이면 편집 중) */
  presenting: number | null;
  present: (fromScene: number) => void;
  endPresent: (atScene: number) => void;
  /** 재생 빠르기(0.5배 ~ 2배) */
  playRate: number;
  setPlayRate: (r: number) => void;
  /** 내 설명판 창(Ctrl+O로도 연다) */
  libOpen: boolean;
  setLibOpen: (v: boolean) => void;
  menu: ContextMenuState | null;
  setMenu: (m: ContextMenuState | null) => void;

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
  setZoneShape: (s: ZoneShape) => void;
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
  zoneShape: 'rect',
  lineColor: '#ffffff',
  past: [],
  future: [],
  gestureBase: null,
  playing: null,
  play: (scene, all, from = 0) => {
    const n = get().activity.scenes.length;
    if (scene < 0 || scene >= n) return;
    set({
      playing: { scene, all, from, run: (get().playing?.run ?? 0) + 1 },
      sceneIdx: scene,
      tool: { t: 'select' },
      draft: null,
      scrubT: null,
      playT: from,
    });
  },
  playT: 0,
  setPlayT: (playT) => set({ playT }),
  scrubT: null,
  setScrubT: (scrubT) => set({ scrubT }),
  stop: () => set({ playing: null }),
  presenting: null,
  present: (fromScene) =>
    set({ presenting: fromScene, playing: null, tool: { t: 'select' }, draft: null, scrubT: null, marquee: null }),
  endPresent: (atScene) => {
    set({ presenting: null });
    get().setSceneIdx(atScene);
  },
  focus: 'canvas',
  setFocus: (focus) => set({ focus }),
  rightTab: 'props',
  setRightTab: (rightTab) => set({ rightTab }),
  grid: typeof localStorage === 'undefined' ? { show: true, snap: true, size: 0.5 } : loadGrid(),
  setGrid: (patch) => {
    const grid = { ...get().grid, ...patch };
    set({ grid });
    try {
      localStorage.setItem(GRID_KEY, JSON.stringify(grid));
    } catch {
      /* 무시 */
    }
  },
  marquee: null,
  setMarquee: (marquee) => set({ marquee }),
  playRate: 1,
  setPlayRate: (playRate) => set({ playRate }),
  libOpen: false,
  setLibOpen: (libOpen) => set({ libOpen, menu: null }),
  menu: null,
  setMenu: (menu) => set({ menu }),

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
  setSel: (sel) => set({ sel, ...(sel.length ? { focus: 'canvas' as const } : {}) }),
  setDraft: (draft) => set({ draft }),
  setDragging: (dragging) => set({ dragging }),
  setZoneColor: (zoneColor) => set({ zoneColor }),
  setZoneShape: (zoneShape) => set({ zoneShape }),
  setLineColor: (lineColor) => set({ lineColor }),
  load: (a) =>
    set({ activity: a, sceneIdx: 0, sel: [], past: [], future: [], tool: { t: 'select' }, draft: null, playing: null }),
  setSceneIdx: (sceneIdx) => {
    const { activity, sel } = get();
    const idx = Math.max(0, Math.min(activity.scenes.length - 1, sceneIdx));
    set({ sceneIdx: idx, sel: validSel(sel, activity, idx), lastMerge: null, scrubT: null });
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
