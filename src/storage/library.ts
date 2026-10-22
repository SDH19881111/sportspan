// 내 설명판 목록: 브라우저(localStorage)에 활동마다 하나씩 저장한다.
// 브라우저 데이터가 지워지면 함께 사라지므로, 중요한 것은 파일로 내보내 두도록 안내한다.

import type { Activity } from '../model/activity';
import { newId } from '../model/activity';
import { migrate } from '../model/migrate';

const PREFIX = 'peboard.';
const INDEX = `${PREFIX}index`;
const LAST = `${PREFIX}last`;
const actKey = (id: string) => `${PREFIX}act.${id}`;

export interface ActivityMeta {
  id: string;
  title: string;
  updatedAt: number;
  scenes: number;
  place: Activity['field']['kind'];
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function listActivities(): ActivityMeta[] {
  return read<ActivityMeta[]>(INDEX, []).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function loadActivity(id: string): Activity | null {
  const a = read<Activity | null>(actKey(id), null);
  if (!a) return null;
  try {
    return validateActivity(a);
  } catch {
    return null;
  }
}

/** 저장하고 목록을 갱신한다. 저장 공간이 꽉 차면 오류를 던진다. */
export function saveActivity(a: Activity): ActivityMeta {
  const updatedAt = Date.now();
  write(actKey(a.id), { ...a, updatedAt });
  const meta: ActivityMeta = {
    id: a.id,
    title: a.title,
    updatedAt,
    scenes: a.scenes.length,
    place: a.field.kind,
  };
  const list = read<ActivityMeta[]>(INDEX, []).filter((m) => m.id !== a.id);
  write(INDEX, [meta, ...list]);
  setLastOpened(a.id);
  return meta;
}

export function deleteActivity(id: string) {
  try {
    localStorage.removeItem(actKey(id));
    write(
      INDEX,
      read<ActivityMeta[]>(INDEX, []).filter((m) => m.id !== id),
    );
  } catch {
    /* 저장소를 못 쓰는 환경: 지울 것도 없다 */
  }
}

export function lastOpened(): string | null {
  try {
    return localStorage.getItem(LAST);
  } catch {
    return null;
  }
}

export function setLastOpened(id: string) {
  try {
    localStorage.setItem(LAST, id);
  } catch {
    /* 무시 */
  }
}

const PLACE_NAME: Record<Activity['field']['kind'], string> = { gym: '체육관', playground: '운동장', classroom: '교실' };
const AUTO_TITLE = /^(?:(?:체육관|운동장|교실) 활동(?: \d+)?|새 활동)$/;

/** 새로 만들 때의 이름: "운동장 활동 3"처럼 장소와, 목록에 없는 다음 번호 */
export function autoTitle(place: Activity['field']['kind'], taken = listActivities().map((m) => m.title)): string {
  const base = `${PLACE_NAME[place]} 활동`;
  let n = 1;
  while (taken.includes(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

/**
 * 아무것도 안 만든 판: 이름도 자동 이름 그대로이고 학생·장비·선·자막·애니메이션·설명이 하나도 없다.
 * 실수로 "새로 만들기"를 눌러 생긴 판이 목록에 쌓이지 않도록 저장하지 않는다.
 */
export function isBlank(a: Activity): boolean {
  const i = a.info;
  return (
    AUTO_TITLE.test(a.title.trim()) &&
    a.objects.length === 0 &&
    a.field.zones.length === 0 &&
    a.field.lines.length === 0 &&
    a.scenes.length === 1 &&
    a.scenes.every((s) => !s.caption.trim() && s.anims.length === 0 && s.arrows.length === 0) &&
    !i?.players && !i?.place && !i?.scoring && !i?.rules?.length && !i?.safety?.length && !i?.equipment?.length
  );
}

/** 저장하되 빈 판이면 저장하지 않고, 전에 저장된 것이 있으면 목록에서 뺀다. 저장했으면 정보를, 아니면 null. */
export function saveUnlessBlank(a: Activity): ActivityMeta | null {
  if (!isBlank(a)) return saveActivity(a);
  if (read<ActivityMeta[]>(INDEX, []).some((m) => m.id === a.id)) deleteActivity(a.id);
  return null;
}

/** 다른 이름으로 하나 더: 새 id, 제목 뒤에 "사본" */
export function copyOf(a: Activity, title = `${a.title} 사본`): Activity {
  return { ...structuredClone(a), id: newId('act'), title, updatedAt: undefined };
}

// ── 파일로 내보내기·가져오기 ───────────────────────────

export const FILE_KIND = 'pe-board-activity';

export function toFile(a: Activity): { name: string; text: string } {
  const safe = (a.title || '체육 설명판').replace(/[\\/:*?"<>|]/g, '_');
  return { name: `${safe}.json`, text: JSON.stringify({ kind: FILE_KIND, version: 1, activity: a }, null, 2) };
}

export function downloadFile(a: Activity) {
  const { name, text } = toFile(a);
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 가져온 파일은 늘 새 id를 받는다(같은 파일을 두 번 가져와도 덮어쓰지 않게). */
export function fromFile(text: string): Activity {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('체육 설명판 파일이 아닙니다. 내보내기로 만든 .json 파일을 골라 주세요.');
  }
  const d = data as { kind?: string; activity?: unknown };
  if (d?.kind !== FILE_KIND || !d.activity) {
    throw new Error('체육 설명판 파일이 아닙니다. 내보내기로 만든 .json 파일을 골라 주세요.');
  }
  return { ...validateActivity(d.activity), id: newId('act') };
}

const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown) => typeof v === 'string';

/** 저장된 내용·파일 내용의 모양을 검사한다. 잘못되면 무엇이 틀렸는지 알려 준다. */
export function validateActivity(x: unknown): Activity {
  const a = x as Activity;
  const fail = (what: string) => {
    throw new Error(`파일 내용이 올바르지 않습니다: ${what}`);
  };
  if (!a || typeof a !== 'object') fail('활동 정보가 없습니다');
  if (!isStr(a.id) || !isStr(a.title)) fail('이름');
  if (!a.field || !isNum(a.field.width) || !isNum(a.field.depth)) fail('경기장 크기');
  if (!['gym', 'playground', 'classroom'].includes(a.field.kind)) fail('장소');
  if (!Array.isArray(a.field.zones) || !Array.isArray(a.field.lines)) fail('구역·선');
  if (!Array.isArray(a.teams) || !a.teams.every((t) => isStr(t.id) && isStr(t.color))) fail('팀');
  if (!Array.isArray(a.objects) || !a.objects.every((o) => isStr(o.id) && isStr(o.kind))) fail('학생·장비');
  if (!Array.isArray(a.scenes) || a.scenes.length === 0) fail('장면');
  for (const s of a.scenes) {
    if (!s || typeof s.poses !== 'object') fail('장면 자리');
    for (const p of Object.values(s.poses)) if (!isNum(p.x) || !isNum(p.z) || !isNum(p.rot)) fail('장면 자리');
    s.bubbles ??= [];
    s.arrows ??= [];
    s.highlights ??= [];
    s.caption ??= '';
    s.anims ??= [];
    if (!Array.isArray(s.anims) || !s.anims.every((an) => isStr(an.id) && isStr(an.objId) && isStr(an.kind))) {
      fail('애니메이션');
    }
  }
  a.info ??= { players: '', place: '', minutes: 0, equipment: [], rules: [], scoring: '', safety: [] };
  return migrate(a);
}
