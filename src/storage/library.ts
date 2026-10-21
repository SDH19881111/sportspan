// 내 설명판 목록: 브라우저(localStorage)에 활동마다 하나씩 저장한다.
// 브라우저 데이터가 지워지면 함께 사라지므로, 중요한 것은 파일로 내보내 두도록 안내한다.

import type { Activity } from '../model/activity';
import { newId } from '../model/activity';

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
  }
  a.info ??= { players: '', place: '', minutes: 0, equipment: [], rules: [], scoring: '', safety: [] };
  return a;
}
