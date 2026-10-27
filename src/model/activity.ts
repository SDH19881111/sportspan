// 활동 하나 = 경기장 + 팀 + 물건 + 장면들.
// 장면은 모든 물건의 자리를 통째로 갖는다(PPT에서 슬라이드를 복제해 말을 옮기던 방식).
// 길이 단위는 모두 m, 각도는 라디안. 바닥은 x(가로)·z(세로) 평면이고 가운데가 원점.

import type { ZoneShape } from './shapes';

export type FieldKind = 'gym' | 'playground' | 'classroom';

export type ObjectKind =
  | 'kid'
  | 'cone'
  | 'disc'
  | 'ball'
  | 'hoop'
  | 'bib'
  | 'beanbag'
  | 'cup'
  | 'bell'
  | 'basket'
  | 'goal'
  | 'desk';

export interface Team {
  id: string;
  name: string;
  color: string; // '#rrggbb'
}

/** 묶음과 고정은 물건·구역·선 모두에 붙을 수 있다. */
export interface Arrangeable {
  groupId?: string; // 같은 groupId끼리 함께 골라지고 함께 움직인다
  locked?: boolean; // 고정: 화면에서 눌러도 골라지지 않는다
}

export interface FieldZone extends Arrangeable {
  id: string;
  x: number;
  z: number;
  w: number;
  d: number;
  color: string;
  label?: string;
  /** 모양(없으면 네모). 모양은 w×d 상자 안에 꼭 맞게 그린다 → model/shapes.ts */
  shape?: ZoneShape;
  /** 상자 가운데를 축으로 돈 각도(라디안, 없으면 0). 앞쪽은 +z */
  rot?: number;
}

export interface FieldLine extends Arrangeable {
  id: string;
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  color: string;
  label?: string;
}

export interface Field {
  kind: FieldKind;
  width: number; // x 방향
  depth: number; // z 방향
  zones: FieldZone[];
  lines: FieldLine[];
}

export interface BoardObject extends Arrangeable {
  id: string;
  kind: ObjectKind;
  teamId?: string;
  color?: string; // 팀이 없을 때의 색
  label?: string; // 아이 이름·번호
}

/** 장면이 시작될 때의 자리와 상태 */
export interface Pose {
  x: number;
  z: number;
  rot: number;
  hidden?: boolean; // 장면 시작 때 안 보임(나타나기 애니메이션으로 보이게 할 수 있다)
  fallen?: boolean; // 콘·컵: 넘어진 채로 시작
}

// ── 애니메이션(PPT처럼 장면 안에서 순서대로 일어나는 일) ──

/** 클릭할 때 / 앞과 함께 / 앞 다음에 / (넘어지기만) 공이 닿을 때 */
export type AnimStart = 'click' | 'with' | 'after' | 'hit';

/** 이동 방식: 사람·장비는 걷기·뛰기, 공은 굴러감·던짐·튀김 */
export type MoveStyle = 'walk' | 'run' | 'roll' | 'throw' | 'bounce';
export type BallMove = Extract<MoveStyle, 'roll' | 'throw' | 'bounce'>;

/**
 * 물건 애니메이션: move·fall·appear·disappear·highlight(objId)
 * 표시 애니메이션: show(markId = 말풍선·화살표 id) — 그 시각에 나타난다
 * 효과음: sound
 */
export type AnimKind = 'move' | 'fall' | 'appear' | 'disappear' | 'highlight' | 'show' | 'sound';

export type SoundKind = 'whistle' | 'bell' | 'beep' | 'clap';

export interface Anim {
  id: string;
  objId?: string; // 물건 애니메이션
  markId?: string; // show: 말풍선·화살표
  sound?: SoundKind; // sound
  kind: AnimKind;
  start: AnimStart;
  delay: number; // 초
  to?: { x: number; z: number }; // move만: 도착점
  via?: { x: number; z: number }[]; // move만: 꺾는 점(지나가는 순서대로)
  style?: MoveStyle; // move만
  speed?: number; // 빠르기 배율(1 = 보통, 0.5 = 절반 빠르기로 느리게). 없으면 1
  /** 학생 move만: 공을 함께 가지고 간다(발 = 드리블, 손 = 들고) */
  carry?: { ballId: string; hold: 'foot' | 'hand' };
}

export interface Bubble {
  id: string;
  objId?: string; // 말풍선이 붙은 물건
  text: string;
}

export interface Arrow {
  id: string;
  x1: number;
  z1: number;
  x2: number;
  z2: number;
}

export interface Scene {
  id: string;
  caption: string;
  poses: Record<string, Pose>;
  bubbles: Bubble[];
  arrows: Arrow[];
  highlights: string[];
  anims: Anim[];
}

export interface ActivityInfo {
  players: string;
  place: string;
  minutes: number;
  equipment: string[];
  rules: string[];
  scoring: string;
  safety: string[];
}

/** 2: 움직임을 장면 안 애니메이션으로 저장(1은 장면과 장면 사이에서 움직였다) */
export const ACTIVITY_VERSION = 2;

export interface Activity {
  id: string;
  title: string;
  version?: number;
  updatedAt?: number; // 내 설명판 목록 정렬용(ms)
  info: ActivityInfo;
  field: Field;
  teams: Team[];
  objects: BoardObject[];
  scenes: Scene[];
}

let seq = 0;
export function newId(prefix: string): string {
  seq += 1;
  return `${prefix}${Date.now().toString(36)}${seq.toString(36)}`;
}

export const FIELD_SIZES: Record<FieldKind, { width: number; depth: number }> = {
  gym: { width: 24, depth: 14 },
  playground: { width: 40, depth: 25 },
  classroom: { width: 9, depth: 7.5 },
};

export function emptyActivity(title = '새 활동', kind: FieldKind = 'gym'): Activity {
  return {
    id: newId('act'),
    title,
    info: { players: '', place: '', minutes: 0, equipment: [], rules: [], scoring: '', safety: [] },
    field: { kind, ...FIELD_SIZES[kind], zones: [], lines: [] },
    teams: [
      { id: 'red', name: '빨강 팀', color: '#e5484d' },
      { id: 'yellow', name: '노랑 팀', color: '#f5b400' },
    ],
    objects: [],
    version: ACTIVITY_VERSION,
    scenes: [{ id: newId('sc'), caption: '', poses: {}, bubbles: [], arrows: [], highlights: [], anims: [] }],
  };
}

export function colorOf(activity: Activity, obj: BoardObject): string | undefined {
  if (obj.teamId) return activity.teams.find((t) => t.id === obj.teamId)?.color;
  return obj.color;
}
