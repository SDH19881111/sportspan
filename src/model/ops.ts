// 활동을 바꾸는 순수 함수들. 항상 새 Activity를 돌려준다(실행 취소 기록을 위해 원본은 건드리지 않는다).
import type {
  Activity,
  Anim,
  Arrow,
  BoardObject,
  Bubble,
  FieldLine,
  FieldZone,
  Pose,
  Team,
} from './activity';
import { newId } from './activity';
import { buildTimeline } from '../motion/timeline';
import { CATALOG_BY_KIND } from './catalog';

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
    s.anims = s.anims.filter((an) => !an.objId || !ids.includes(an.objId));
    for (const an of s.anims) if (an.carry && ids.includes(an.carry.ballId)) delete an.carry;
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
  s.anims = s.anims.filter((v) => v.markId !== id);
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

// ── 여러 종류를 함께 다루기(고르기·묶음·고정) ──────────

export type ItemKind = 'obj' | 'zone' | 'line' | 'arrow' | 'bubble' | 'anim';

export function itemKind(a: Activity, sceneIdx: number, id: string): ItemKind | null {
  if (a.objects.some((o) => o.id === id)) return 'obj';
  if (a.field.zones.some((z) => z.id === id)) return 'zone';
  if (a.field.lines.some((l) => l.id === id)) return 'line';
  const s = a.scenes[sceneIdx];
  if (s?.arrows.some((v) => v.id === id)) return 'arrow';
  if (s?.bubbles.some((v) => v.id === id)) return 'bubble';
  if (s?.anims.some((v) => v.id === id)) return 'anim';
  return null;
}

function arrangeables(a: Activity): (BoardObject | FieldZone | FieldLine)[] {
  return [...a.objects, ...a.field.zones, ...a.field.lines];
}

/** 묶음에 든 것을 하나라도 고르면 그 묶음 전체를 고른 것으로 친다. */
export function expandGroups(a: Activity, ids: string[]): string[] {
  const items = arrangeables(a);
  const groups = new Set(items.filter((i) => ids.includes(i.id) && i.groupId).map((i) => i.groupId));
  const out = new Set(ids);
  for (const i of items) if (i.groupId && groups.has(i.groupId)) out.add(i.id);
  return [...out];
}

export function isLocked(a: Activity, id: string): boolean {
  return !!arrangeables(a).find((i) => i.id === id)?.locked;
}

/**
 * 끌기 시작할 때의 활동(base)을 기준으로 고른 것을 모두 dx·dz만큼 옮긴다.
 * 물건·화살표는 지금 장면에서만, 구역·선은 경기장 자체가 옮겨진다(모든 장면).
 */
export function moveItems(base: Activity, sceneIdx: number, ids: string[], dx: number, dz: number): Activity {
  const next = clone(base);
  const scene = next.scenes[sceneIdx];
  for (const id of ids) {
    const p = scene.poses[id];
    if (p && next.objects.some((o) => o.id === id)) {
      [p.x, p.z] = clampToField(base, p.x + dx, p.z + dz);
      continue;
    }
    const z = next.field.zones.find((v) => v.id === id);
    if (z) {
      z.x = round(z.x + dx);
      z.z = round(z.z + dz);
      continue;
    }
    const l = next.field.lines.find((v) => v.id === id) ?? scene.arrows.find((v) => v.id === id);
    if (l) {
      l.x1 = round(l.x1 + dx);
      l.z1 = round(l.z1 + dz);
      l.x2 = round(l.x2 + dx);
      l.z2 = round(l.z2 + dz);
    }
  }
  return next;
}

export function removeItems(a: Activity, sceneIdx: number, ids: string[]): Activity {
  const next = removeObjects(a, ids.filter((id) => a.objects.some((o) => o.id === id)));
  next.field.zones = next.field.zones.filter((z) => !ids.includes(z.id));
  next.field.lines = next.field.lines.filter((l) => !ids.includes(l.id));
  const s = next.scenes[sceneIdx];
  s.arrows = s.arrows.filter((v) => !ids.includes(v.id));
  s.bubbles = s.bubbles.filter((v) => !ids.includes(v.id));
  s.anims = s.anims.filter((v) => !ids.includes(v.id) && !(v.markId && ids.includes(v.markId)));
  return next;
}

/** 물건·구역·선을 하나로 묶는다(화살표·말풍선은 장면 표시라 묶지 않는다). */
export function groupItems(a: Activity, ids: string[]): Activity {
  const next = clone(a);
  const members = arrangeables(next).filter((i) => ids.includes(i.id));
  if (members.length < 2) return a;
  const gid = newId('g');
  for (const m of members) m.groupId = gid;
  return next;
}

export function ungroupItems(a: Activity, ids: string[]): Activity {
  const next = clone(a);
  for (const m of arrangeables(next)) if (ids.includes(m.id)) delete m.groupId;
  return next;
}

export function setLocked(a: Activity, ids: string[], locked: boolean): Activity {
  const next = clone(a);
  for (const m of arrangeables(next)) {
    if (!ids.includes(m.id)) continue;
    if (locked) m.locked = true;
    else delete m.locked;
  }
  return next;
}

export function lockedCount(a: Activity): number {
  return arrangeables(a).filter((i) => i.locked).length;
}

export function unlockAll(a: Activity): Activity {
  return setLocked(
    a,
    arrangeables(a).map((i) => i.id),
    false,
  );
}

/** 물건·구역·선 복사. 묶음째 복사하면 복사본끼리 새 묶음이 된다. */
export function duplicateItems(a: Activity, ids: string[], offset = 0.6): { activity: Activity; ids: string[] } {
  const objIds = ids.filter((id) => a.objects.some((o) => o.id === id));
  const res = duplicateObjects(a, objIds, offset);
  const next = res.activity;
  const made = [...res.ids];
  for (const z of a.field.zones.filter((v) => ids.includes(v.id))) {
    const id = newId('z');
    next.field.zones.push({ ...z, id, x: round(z.x + offset), z: round(z.z + offset) });
    made.push(id);
  }
  for (const l of a.field.lines.filter((v) => ids.includes(v.id))) {
    const id = newId('l');
    next.field.lines.push({
      ...l,
      id,
      x1: round(l.x1 + offset),
      z1: round(l.z1 + offset),
      x2: round(l.x2 + offset),
      z2: round(l.z2 + offset),
    });
    made.push(id);
  }
  // 묶음 번호 새로 매기기
  const remap = new Map<string, string>();
  for (const m of arrangeables(next)) {
    if (!made.includes(m.id) || !m.groupId) continue;
    if (!remap.has(m.groupId)) remap.set(m.groupId, newId('g'));
    m.groupId = remap.get(m.groupId);
  }
  return { activity: next, ids: made };
}

// ── 장면 ───────────────────────────────────────────────

/**
 * idx 장면을 복사해 바로 뒤에 새 장면을 만든다.
 *  - 'end': 애니메이션이 모두 끝난 자리에서 시작(이어서 설명할 때)
 *  - 'start': 애니메이션 전 자리 그대로
 * 설명·화살표·말풍선·강조·애니메이션은 비운다.
 */
export function addSceneAfter(
  a: Activity,
  idx: number,
  mode: 'end' | 'start' = 'end',
): { activity: Activity; idx: number } {
  const next = clone(a);
  const src = next.scenes[idx];
  const poses: Record<string, Pose> =
    mode === 'end' && src.anims.length ? buildTimeline(a, idx).endPoses : structuredClone(src.poses);
  next.scenes.splice(idx + 1, 0, {
    id: newId('sc'),
    caption: '',
    poses,
    bubbles: [],
    arrows: [],
    highlights: [],
    anims: [],
  });
  return { activity: next, idx: idx + 1 };
}

export function removeScene(a: Activity, idx: number): Activity {
  if (a.scenes.length <= 1) return a;
  const next = clone(a);
  next.scenes.splice(idx, 1);
  return next;
}

export function moveScene(a: Activity, idx: number, dir: -1 | 1): Activity {
  const to = idx + dir;
  if (to < 0 || to >= a.scenes.length) return a;
  const next = clone(a);
  const [s] = next.scenes.splice(idx, 1);
  next.scenes.splice(to, 0, s);
  return next;
}

// ── 애니메이션 ─────────────────────────────────────────

export function addAnim(a: Activity, sceneIdx: number, anim: Omit<Anim, 'id'>): { activity: Activity; id: string } {
  const next = clone(a);
  const id = newId('an');
  const an: Anim = { ...anim, id };
  if (an.to) an.to = { x: clampToField(a, an.to.x, an.to.z)[0], z: clampToField(a, an.to.x, an.to.z)[1] };
  next.scenes[sceneIdx].anims.push(an);
  return { activity: next, id };
}

export function updateAnim(a: Activity, sceneIdx: number, id: string, patch: Partial<Omit<Anim, 'id' | 'objId'>>): Activity {
  const next = clone(a);
  const an = next.scenes[sceneIdx].anims.find((v) => v.id === id);
  if (an) {
    Object.assign(an, patch);
    if ('speed' in patch && patch.speed === undefined) delete an.speed;
    if (patch.to) {
      const [x, z] = clampToField(a, patch.to.x, patch.to.z);
      an.to = { x, z };
    }
    if (an.delay < 0 || !Number.isFinite(an.delay)) an.delay = 0;
  }
  return next;
}

/** 목록 순서를 한 칸 옮긴다(PPT 애니메이션 창의 ▲▼) */
export function moveAnim(a: Activity, sceneIdx: number, id: string, dir: -1 | 1): Activity {
  const list = a.scenes[sceneIdx].anims;
  const i = list.findIndex((v) => v.id === id);
  const to = i + dir;
  if (i < 0 || to < 0 || to >= list.length) return a;
  const next = clone(a);
  const arr = next.scenes[sceneIdx].anims;
  const [an] = arr.splice(i, 1);
  arr.splice(to, 0, an);
  return next;
}

/**
 * 여러 물건을 이동시키는 방법
 *  keep: 첫 물건이 dest로 가고 나머지는 같은 간격(대형)을 유지한다.
 *  gather: 모두 dest로 모인다. dest 자리는 비우고 그 둘레에 한 칸(cell)씩 띄워 둥글게 선다.
 */
export type MoveMode = 'keep' | 'gather';

/**
 * 고른 물건들에 이동을 한꺼번에 붙인다. 둘째부터는 '앞과 함께'라 모두 동시에 움직인다.
 * 출발점은 각 물건의 '지금까지 애니메이션이 끝난 자리'라서 이동을 이어 붙일 수 있다.
 */
export function addMoves(
  a: Activity,
  sceneIdx: number,
  ids: string[],
  dest: { x: number; z: number },
  start: Anim['start'] = 'click',
  opts: { mode?: MoveMode; cell?: number } = {},
): { activity: Activity; ids: string[] } {
  const ends = buildTimeline(a, sceneIdx).endPoses;
  const lead = ends[ids[0]];
  if (!lead) return { activity: a, ids: [] };
  const live = ids.filter((id) => ends[id]);
  const gather = opts.mode === 'gather' && live.length > 1 ? gatherSpots(a, live, ends, dest, opts.cell ?? 0.5) : null;
  let next = a;
  const made: string[] = [];
  live.forEach((id, i) => {
    const p = ends[id];
    const to = gather ? gather[id] : { x: dest.x + (p.x - lead.x), z: dest.z + (p.z - lead.z) };
    const res = addAnim(next, sceneIdx, {
      objId: id,
      kind: 'move',
      start: i === 0 ? start : 'with',
      delay: 0,
      to,
    });
    next = res.activity;
    made.push(res.id);
  });
  return { activity: next, ids: made };
}

/**
 * 모이기 자리: dest를 가운데 두고 둥글게. 가운데에서 한 칸, 옆 사람과도 몸 사이 한 칸 띈다.
 * 각자 오던 쪽 자리에 서도록 출발 방향 순서대로 자리를 나눠 길이 서로 엇갈리지 않게 한다.
 */
export function gatherSpots(
  a: Activity,
  ids: string[],
  from: Record<string, { x: number; z: number }>,
  dest: { x: number; z: number },
  cell: number,
): Record<string, { x: number; z: number }> {
  const n = ids.length;
  const byId = new Map(a.objects.map((o) => [o.id, o]));
  const rad = Math.max(...ids.map((id) => CATALOG_BY_KIND[byId.get(id)?.kind ?? 'kid'].radius));
  const r = Math.max(cell + rad, (2 * rad + cell) / (2 * Math.sin(Math.PI / n)));
  const step = (2 * Math.PI) / n;
  const angleOf = (id: string) => {
    const p = from[id];
    const dx = p.x - dest.x;
    const dz = p.z - dest.z;
    return Math.hypot(dx, dz) < 1e-6 ? 0 : Math.atan2(dz, dx);
  };
  const sorted = ids.map((id) => ({ id, ang: angleOf(id) })).sort((u, v) => u.ang - v.ang);
  // 자리 고리를 돌려 각자 출발 방향과 가장 가깝게(각도 차이의 원형 평균)
  let sx = 0;
  let sz = 0;
  sorted.forEach((o, k) => {
    sx += Math.cos(o.ang - k * step);
    sz += Math.sin(o.ang - k * step);
  });
  const base = Math.atan2(sz, sx);
  const out: Record<string, { x: number; z: number }> = {};
  sorted.forEach((o, k) => {
    const ang = base + k * step;
    const [x, z] = clampToField(a, dest.x + r * Math.cos(ang), dest.z + r * Math.sin(ang));
    out[o.id] = { x, z };
  });
  return out;
}

// ── 복사·붙여넣기 ───────────────────────────────────────

/** 복사해 둔 것(다른 설명판에 붙여 넣을 수도 있게 팀 정보도 함께) */
export interface Clip {
  objects: { obj: BoardObject; pose: Pose }[];
  zones: FieldZone[];
  lines: FieldLine[];
  teams: Team[];
}

export function copyItems(a: Activity, sceneIdx: number, ids: string[]): Clip {
  const scene = a.scenes[sceneIdx];
  const objects = a.objects
    .filter((o) => ids.includes(o.id) && scene.poses[o.id])
    .map((o) => ({ obj: structuredClone(o), pose: structuredClone(scene.poses[o.id]) }));
  return {
    objects,
    zones: structuredClone(a.field.zones.filter((z) => ids.includes(z.id))),
    lines: structuredClone(a.field.lines.filter((l) => ids.includes(l.id))),
    teams: structuredClone(a.teams.filter((t) => objects.some((x) => x.obj.teamId === t.id))),
  };
}

export function clipIsEmpty(c: Clip | null): boolean {
  return !c || c.objects.length + c.zones.length + c.lines.length === 0;
}

/**
 * 붙여 넣기: 새 id, 고정은 풀고, 묶음은 새 묶음으로. 물건은 모든 장면에 (지금 장면 자리 + offset)으로 들어간다.
 * 다른 설명판에서 가져온 학생은 같은 id나 같은 색의 팀을 찾고, 없으면 팀 없이 그 색으로.
 */
export function pasteItems(a: Activity, clip: Clip, offset: number): { activity: Activity; ids: string[] } {
  const next = clone(a);
  const made: string[] = [];
  const groups = new Map<string, string>();
  const regroup = (g?: string) => {
    if (!g) return undefined;
    if (!groups.has(g)) groups.set(g, newId('g'));
    return groups.get(g);
  };

  for (const { obj, pose } of clip.objects) {
    const id = newId('o');
    const copy: BoardObject = { ...obj, id, groupId: regroup(obj.groupId) };
    delete copy.locked;
    if (!copy.groupId) delete copy.groupId;
    if (copy.teamId && !next.teams.some((t) => t.id === copy.teamId)) {
      const color = clip.teams.find((t) => t.id === copy.teamId)?.color;
      const same = next.teams.find((t) => t.color === color);
      if (same) copy.teamId = same.id;
      else {
        delete copy.teamId;
        copy.color = color;
      }
    }
    next.objects.push(copy);
    const [x, z] = clampToField(a, pose.x + offset, pose.z + offset);
    for (const s of next.scenes) s.poses[id] = { ...pose, x, z };
    made.push(id);
  }
  for (const zn of clip.zones) {
    const id = newId('z');
    const copy: FieldZone = { ...zn, id, x: round(zn.x + offset), z: round(zn.z + offset), groupId: regroup(zn.groupId) };
    delete copy.locked;
    if (!copy.groupId) delete copy.groupId;
    next.field.zones.push(copy);
    made.push(id);
  }
  for (const ln of clip.lines) {
    const id = newId('l');
    const copy: FieldLine = {
      ...ln,
      id,
      x1: round(ln.x1 + offset),
      z1: round(ln.z1 + offset),
      x2: round(ln.x2 + offset),
      z2: round(ln.z2 + offset),
      groupId: regroup(ln.groupId),
    };
    delete copy.locked;
    if (!copy.groupId) delete copy.groupId;
    next.field.lines.push(copy);
    made.push(id);
  }
  return { activity: next, ids: made };
}

/** 여러 애니메이션에 같은 설정을 한꺼번에 */
export function updateAnims(
  a: Activity,
  sceneIdx: number,
  ids: string[],
  patch: Partial<Pick<Anim, 'start' | 'delay' | 'speed' | 'style'>>,
): Activity {
  let next = a;
  for (const id of ids) next = updateAnim(next, sceneIdx, id, patch);
  return next;
}

/**
 * 고른 애니메이션들을 목록의 toIndex 자리(옮기기 전 목록 기준, 그 줄 앞)로 옮긴다.
 * 고른 것끼리의 순서는 그대로 둔다.
 */
export function reorderAnims(a: Activity, sceneIdx: number, ids: string[], toIndex: number): Activity {
  const list = a.scenes[sceneIdx].anims;
  const moving = list.filter((an) => ids.includes(an.id));
  if (!moving.length) return a;
  const before = list.slice(0, toIndex).filter((an) => !ids.includes(an.id));
  const after = list.slice(toIndex).filter((an) => !ids.includes(an.id));
  const order = [...before, ...moving, ...after];
  if (order.every((an, i) => an === list[i])) return a;
  const next = clone(a);
  next.scenes[sceneIdx].anims = order.map((an) => next.scenes[sceneIdx].anims.find((v) => v.id === an.id)!);
  return next;
}

/** 꺾는 점 추가: 가장 긴 구간의 가운데에 넣는다 */
export function addVia(a: Activity, sceneIdx: number, animId: string, from: { x: number; z: number }): Activity {
  const next = clone(a);
  const an = next.scenes[sceneIdx].anims.find((v) => v.id === animId);
  if (!an || an.kind !== 'move' || !an.to) return a;
  const pts = [from, ...(an.via ?? []), an.to];
  let best = 0;
  let bestLen = -1;
  for (let i = 1; i < pts.length; i++) {
    const L = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
    if (L > bestLen) {
      bestLen = L;
      best = i;
    }
  }
  const mid = { x: round((pts[best - 1].x + pts[best].x) / 2), z: round((pts[best - 1].z + pts[best].z) / 2) };
  const via = [...(an.via ?? [])];
  via.splice(best - 1, 0, mid);
  an.via = via;
  return next;
}

export function moveVia(a: Activity, sceneIdx: number, animId: string, index: number, p: { x: number; z: number }): Activity {
  const next = clone(a);
  const an = next.scenes[sceneIdx].anims.find((v) => v.id === animId);
  if (!an?.via?.[index]) return a;
  const [x, z] = clampToField(a, p.x, p.z);
  an.via[index] = { x, z };
  return next;
}

export function removeVia(a: Activity, sceneIdx: number, animId: string, index?: number): Activity {
  const next = clone(a);
  const an = next.scenes[sceneIdx].anims.find((v) => v.id === animId);
  if (!an?.via) return a;
  if (index === undefined) delete an.via;
  else {
    an.via.splice(index, 1);
    if (!an.via.length) delete an.via;
  }
  return next;
}

/** 학생 이동에 공 가지고 가기를 붙이거나 뗀다 */
export function setCarry(a: Activity, sceneIdx: number, animId: string, carry: Anim['carry'] | null): Activity {
  const next = clone(a);
  const an = next.scenes[sceneIdx].anims.find((v) => v.id === animId);
  if (!an) return a;
  if (carry) an.carry = carry;
  else delete an.carry;
  return next;
}
