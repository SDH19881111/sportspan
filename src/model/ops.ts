// 활동을 바꾸는 순수 함수들. 항상 새 Activity를 돌려준다(실행 취소 기록을 위해 원본은 건드리지 않는다).
import type {
  Activity,
  Arrow,
  BoardObject,
  Bubble,
  FieldLine,
  FieldZone,
  Pose,
  Team,
} from './activity';
import { newId } from './activity';

function clone(a: Activity): Activity {
  return structuredClone(a);
}

// 바깥에 줄 서는 아이들도 있으니 경기장보다 3m 더 넓게까지 허용한다.
export const OUTSIDE_MARGIN = 3;

export function clampToField(a: Activity, x: number, z: number): [number, number] {
  const hx = a.field.width / 2 + OUTSIDE_MARGIN;
  const hz = a.field.depth / 2 + OUTSIDE_MARGIN;
  return [round(Math.min(hx, Math.max(-hx, x))), round(Math.min(hz, Math.max(-hz, z)))];
}

/** 소수 오차(0.1 + 0.2 같은)를 저장하지 않도록 1mm 단위로 자른다. */
export function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

// ── 물건 ───────────────────────────────────────────────

/** 새 물건은 모든 장면에 같은 자리로 들어간다. 장면마다 옮기는 것은 선생님 몫. */
export function addObject(a: Activity, obj: Omit<BoardObject, 'id'>, pose: Pose): { activity: Activity; id: string } {
  const next = clone(a);
  const id = newId('o');
  const [x, z] = clampToField(a, pose.x, pose.z);
  next.objects.push({ ...obj, id });
  for (const s of next.scenes) s.poses[id] = { ...pose, x, z };
  return { activity: next, id };
}

export function updateObjects(a: Activity, ids: string[], patch: Partial<Omit<BoardObject, 'id' | 'kind'>>): Activity {
  const next = clone(a);
  for (const o of next.objects) {
    if (!ids.includes(o.id)) continue;
    Object.assign(o, patch);
    for (const k of Object.keys(patch) as (keyof typeof patch)[]) if (patch[k] === undefined) delete o[k];
  }
  return next;
}

/** 지금 장면에서만 자리를 바꾼다. */
export function setPoses(a: Activity, sceneIdx: number, poses: Record<string, Partial<Pose>>): Activity {
  const next = clone(a);
  const scene = next.scenes[sceneIdx];
  for (const [id, p] of Object.entries(poses)) {
    const cur = scene.poses[id];
    if (!cur) continue;
    const merged = { ...cur, ...p };
    [merged.x, merged.z] = clampToField(a, merged.x, merged.z);
    scene.poses[id] = merged;
  }
  return next;
}

export function moveObjects(
  a: Activity,
  sceneIdx: number,
  start: Record<string, Pose>,
  dx: number,
  dz: number,
): Activity {
  const poses: Record<string, Partial<Pose>> = {};
  for (const [id, p] of Object.entries(start)) poses[id] = { x: p.x + dx, z: p.z + dz };
  return setPoses(a, sceneIdx, poses);
}

export function rotateObjects(a: Activity, sceneIdx: number, ids: string[], delta: number): Activity {
  const scene = a.scenes[sceneIdx];
  const poses: Record<string, Partial<Pose>> = {};
  for (const id of ids) if (scene.poses[id]) poses[id] = { rot: normAngle(scene.poses[id].rot + delta) };
  return setPoses(a, sceneIdx, poses);
}

export function normAngle(r: number): number {
  const t = Math.PI * 2;
  let v = ((r % t) + t) % t;
  if (v > Math.PI) v -= t;
  return Math.round(v * 1e6) / 1e6;
}

export function removeObjects(a: Activity, ids: string[]): Activity {
  const next = clone(a);
  next.objects = next.objects.filter((o) => !ids.includes(o.id));
  for (const s of next.scenes) {
    for (const id of ids) delete s.poses[id];
    s.bubbles = s.bubbles.filter((b) => !b.objId || !ids.includes(b.objId));
    s.highlights = s.highlights.filter((h) => !ids.includes(h));
  }
  return next;
}

/** 복사본은 모든 장면에서 원본 옆(offset)에 놓인다. */
export function duplicateObjects(
  a: Activity,
  ids: string[],
  offset = 0.6,
): { activity: Activity; ids: string[] } {
  const next = clone(a);
  const made: string[] = [];
  for (const id of ids) {
    const src = next.objects.find((o) => o.id === id);
    if (!src) continue;
    const nid = newId('o');
    next.objects.push({ ...src, id: nid });
    for (const s of next.scenes) {
      const p = s.poses[id];
      if (!p) continue;
      const [x, z] = clampToField(a, p.x + offset, p.z + offset);
      s.poses[nid] = { ...p, x, z };
    }
    made.push(nid);
  }
  return { activity: next, ids: made };
}

// ── 경기장 구역·선(모든 장면 공통) ─────────────────────

export function addZone(a: Activity, zone: Omit<FieldZone, 'id'>): { activity: Activity; id: string } {
  const next = clone(a);
  const id = newId('z');
  next.field.zones.push({ ...zone, id });
  return { activity: next, id };
}

export function updateZone(a: Activity, id: string, patch: Partial<Omit<FieldZone, 'id'>>): Activity {
  const next = clone(a);
  const z = next.field.zones.find((v) => v.id === id);
  if (z) Object.assign(z, patch);
  return next;
}

export function addLine(a: Activity, line: Omit<FieldLine, 'id'>): { activity: Activity; id: string } {
  const next = clone(a);
  const id = newId('l');
  next.field.lines.push({ ...line, id });
  return { activity: next, id };
}

export function updateLine(a: Activity, id: string, patch: Partial<Omit<FieldLine, 'id'>>): Activity {
  const next = clone(a);
  const l = next.field.lines.find((v) => v.id === id);
  if (l) Object.assign(l, patch);
  return next;
}

export function removeFieldItem(a: Activity, id: string): Activity {
  const next = clone(a);
  next.field.zones = next.field.zones.filter((z) => z.id !== id);
  next.field.lines = next.field.lines.filter((l) => l.id !== id);
  return next;
}

// ── 장면 표시(화살표·말풍선·강조·자막) ─────────────────

export function addArrow(a: Activity, sceneIdx: number, arrow: Omit<Arrow, 'id'>): { activity: Activity; id: string } {
  const next = clone(a);
  const id = newId('ar');
  next.scenes[sceneIdx].arrows.push({ ...arrow, id });
  return { activity: next, id };
}

export function updateArrow(a: Activity, sceneIdx: number, id: string, patch: Partial<Omit<Arrow, 'id'>>): Activity {
  const next = clone(a);
  const ar = next.scenes[sceneIdx].arrows.find((v) => v.id === id);
  if (ar) Object.assign(ar, patch);
  return next;
}

export function addBubble(a: Activity, sceneIdx: number, bubble: Omit<Bubble, 'id'>): { activity: Activity; id: string } {
  const next = clone(a);
  const id = newId('b');
  next.scenes[sceneIdx].bubbles.push({ ...bubble, id });
  return { activity: next, id };
}

export function updateBubble(a: Activity, sceneIdx: number, id: string, text: string): Activity {
  const next = clone(a);
  const b = next.scenes[sceneIdx].bubbles.find((v) => v.id === id);
  if (b) b.text = text;
  return next;
}

export function removeSceneMark(a: Activity, sceneIdx: number, id: string): Activity {
  const next = clone(a);
  const s = next.scenes[sceneIdx];
  s.arrows = s.arrows.filter((v) => v.id !== id);
  s.bubbles = s.bubbles.filter((v) => v.id !== id);
  return next;
}

/** 고른 것 중 하나라도 강조가 없으면 모두 켜고, 모두 켜져 있으면 끈다. */
export function toggleHighlight(a: Activity, sceneIdx: number, ids: string[]): Activity {
  const next = clone(a);
  const s = next.scenes[sceneIdx];
  const allOn = ids.every((id) => s.highlights.includes(id));
  s.highlights = allOn ? s.highlights.filter((h) => !ids.includes(h)) : [...new Set([...s.highlights, ...ids])];
  return next;
}

export function setCaption(a: Activity, sceneIdx: number, caption: string): Activity {
  const next = clone(a);
  next.scenes[sceneIdx].caption = caption;
  return next;
}

// ── 팀·활동 ────────────────────────────────────────────

export const TEAM_COLORS = ['#e5484d', '#f5b400', '#2f6fdf', '#30a46c', '#8e4ec6', '#f76b15', '#12a5a5', '#d6409f'];
const TEAM_NAMES: Record<string, string> = {
  '#e5484d': '빨강',
  '#f5b400': '노랑',
  '#2f6fdf': '파랑',
  '#30a46c': '초록',
  '#8e4ec6': '보라',
  '#f76b15': '주황',
  '#12a5a5': '청록',
  '#d6409f': '분홍',
};

export function addTeam(a: Activity): { activity: Activity; id: string } {
  const next = clone(a);
  const used = new Set(a.teams.map((t) => t.color));
  const color = TEAM_COLORS.find((c) => !used.has(c)) ?? TEAM_COLORS[a.teams.length % TEAM_COLORS.length];
  const id = newId('t');
  next.teams.push({ id, name: `${TEAM_NAMES[color] ?? '새'} 팀`, color });
  return { activity: next, id };
}

export function updateTeam(a: Activity, id: string, patch: Partial<Omit<Team, 'id'>>): Activity {
  const next = clone(a);
  const t = next.teams.find((v) => v.id === id);
  if (t) Object.assign(t, patch);
  return next;
}

/** 팀을 지우면 그 팀 물건은 지금 색을 그대로 가진 채 팀 없음이 된다. */
export function removeTeam(a: Activity, id: string): Activity {
  const next = clone(a);
  const team = next.teams.find((t) => t.id === id);
  next.teams = next.teams.filter((t) => t.id !== id);
  for (const o of next.objects) {
    if (o.teamId !== id) continue;
    delete o.teamId;
    o.color = team?.color;
  }
  return next;
}

export function setTitle(a: Activity, title: string): Activity {
  const next = clone(a);
  next.title = title;
  return next;
}

export function setFieldSize(a: Activity, width: number, depth: number): Activity {
  const next = clone(a);
  next.field.width = Math.max(4, Math.min(60, width));
  next.field.depth = Math.max(4, Math.min(60, depth));
  return next;
}

export function setFieldKind(a: Activity, kind: Activity['field']['kind']): Activity {
  const next = clone(a);
  next.field.kind = kind;
  return next;
}
