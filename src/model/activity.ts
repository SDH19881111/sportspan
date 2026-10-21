// 활동 하나 = 경기장 + 팀 + 물건 + 장면들.
// 장면은 모든 물건의 자리를 통째로 갖는다(PPT에서 슬라이드를 복제해 말을 옮기던 방식).
// 길이 단위는 모두 m, 각도는 라디안. 바닥은 x(가로)·z(세로) 평면이고 가운데가 원점.

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

/** 공이 앞 장면 자리에서 이 장면 자리로 오는 방법 */
export type BallMove = 'roll' | 'throw' | 'bounce';

export interface Pose {
  x: number;
  z: number;
  rot: number;
  hidden?: boolean; // 이 장면에서는 안 보임
  move?: BallMove; // 공만: 기본은 굴러감
  fallen?: boolean; // 콘·컵만: 이 장면에서 넘어져 있음
}

export interface Bubble {
  id: string;
  objId?: string; // 없으면 화면 위쪽 자막 옆에 뜬다
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

export interface Activity {
  id: string;
  title: string;
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
    scenes: [{ id: newId('sc'), caption: '', poses: {}, bubbles: [], arrows: [], highlights: [] }],
  };
}

export function colorOf(activity: Activity, obj: BoardObject): string | undefined {
  if (obj.teamId) return activity.teams.find((t) => t.id === obj.teamId)?.color;
  return obj.color;
}
