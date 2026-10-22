// 경기장 선 틀: 피구 코트·달리기 출발선·트랙·축구장을 지금 바닥 크기에 맞춰 한 번에 긋는다.
// 그은 선은 한 묶음으로 고정해 둔다(학생을 놓고 끌 때 선이 대신 골라지지 않게). 고치려면 "모두 고정 풀기".
import type { Activity, FieldLine, FieldZone } from './activity';
import { newId } from './activity';
import { round } from './ops';

export type CourtKind = 'dodge' | 'sprint' | 'track' | 'soccer';

export const COURTS: { id: CourtKind; name: string; hint: string }[] = [
  { id: 'dodge', name: '피구', hint: '가로 2 : 세로 1 코트와 중앙선' },
  { id: 'sprint', name: '달리기', hint: '출발선·결승선과 레인' },
  { id: 'track', name: '트랙', hint: '둥근 트랙 2레인과 출발·결승선' },
  { id: 'soccer', name: '축구', hint: '테두리·중앙선·센터 서클·골 구역' },
];

const GROUP = 'court:';
const WHITE = '#ffffff';
const MARGIN = 1; // 바닥 테두리에서 1m 안쪽에 긋는다

type L = Omit<FieldLine, 'id'>;

function line(x1: number, z1: number, x2: number, z2: number, label?: string): L {
  return { x1: round(x1), z1: round(z1), x2: round(x2), z2: round(z2), color: WHITE, ...(label ? { label } : {}) };
}

function rect(w: number, d: number, cx = 0, cz = 0): L[] {
  const [l, r, t, b] = [cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2];
  return [line(l, t, r, t), line(r, t, r, b), line(r, b, l, b), line(l, b, l, t)];
}

/** 원호를 짧은 선으로 잇는다. a0→a1(라디안), x = cx + r·cos, z = cz + r·sin */
function arc(cx: number, cz: number, r: number, a0: number, a1: number, n: number): L[] {
  const out: L[] = [];
  for (let i = 0; i < n; i++) {
    const p = a0 + ((a1 - a0) * i) / n;
    const q = a0 + ((a1 - a0) * (i + 1)) / n;
    out.push(line(cx + r * Math.cos(p), cz + r * Math.sin(p), cx + r * Math.cos(q), cz + r * Math.sin(q)));
  }
  return out;
}

/** 바닥 크기에 맞춘 선(과 구역) */
export function courtShapes(kind: CourtKind, width: number, depth: number): { lines: L[]; zones: Omit<FieldZone, 'id'>[] } {
  const W = Math.max(2, width - MARGIN * 2);
  const D = Math.max(2, depth - MARGIN * 2);

  switch (kind) {
    case 'dodge': {
      // 초등 피구 코트는 대략 18×9m. 바닥이 작으면 2:1을 지키며 줄인다.
      const d = Math.min(9, D, W / 2);
      const w = d * 2;
      return { lines: [...rect(w, d), line(0, -d / 2, 0, d / 2, '중앙선')], zones: [] };
    }
    case 'sprint': {
      // 거리는 5m 단위로 바닥에 들어가는 만큼(최대 50m), 레인은 1.2m
      const len = Math.max(5, Math.min(50, Math.floor(W / 5) * 5));
      const lanes = Math.max(1, Math.min(6, Math.floor(D / 1.2)));
      const half = (lanes * 1.2) / 2;
      const [sx, fx] = [-len / 2, len / 2];
      const lines = [line(sx, -half, sx, half, '출발'), line(fx, -half, fx, half, `결승 ${len}m`)];
      for (let i = 0; i <= lanes; i++) lines.push(line(sx, -half + i * 1.2, fx, -half + i * 1.2));
      return { lines, zones: [] };
    }
    case 'track': {
      // 안쪽 반지름 r, 바깥은 2레인(2.4m) 밖. 곧은 길이는 남는 가로만큼.
      const lane = 1.2;
      const rOut = Math.max(lane * 2 + 0.5, D / 2);
      const r = rOut - lane * 2;
      const straight = Math.max(0, W - rOut * 2);
      const h = straight / 2;
      const lines: L[] = [];
      for (const rr of [r, r + lane, rOut]) {
        lines.push(line(-h, -rr, h, -rr), line(h, rr, -h, rr));
        lines.push(...arc(h, 0, rr, -Math.PI / 2, Math.PI / 2, 12), ...arc(-h, 0, rr, Math.PI / 2, (Math.PI * 3) / 2, 12));
      }
      lines.push(line(0, r, 0, rOut, '출발·결승'));
      return { lines, zones: [] };
    }
    case 'soccer': {
      const cr = Math.min(3, D / 5);
      const gw = Math.min(D * 0.4, 8); // 골 구역 세로
      const gd = Math.min(W * 0.08, 3); // 골 구역 깊이
      return {
        lines: [
          ...rect(W, D),
          line(0, -D / 2, 0, D / 2, '중앙선'),
          ...arc(0, 0, cr, 0, Math.PI * 2, 16),
          ...rect(gd, gw, -W / 2 + gd / 2, 0),
          ...rect(gd, gw, W / 2 - gd / 2, 0),
        ],
        zones: [],
      };
    }
  }
}

/** 지금 그어진 틀(없으면 null) */
export function currentCourt(a: Activity): CourtKind | null {
  const g = [...a.field.lines, ...a.field.zones].find((v) => v.groupId?.startsWith(GROUP))?.groupId;
  return g ? (g.slice(GROUP.length) as CourtKind) : null;
}

/** 틀을 바꾼다(전에 그은 틀은 지운다). kind가 null이면 지우기만. */
export function setCourt(a: Activity, kind: CourtKind | null): Activity {
  const next = structuredClone(a);
  const mine = (v: { groupId?: string }) => !!v.groupId?.startsWith(GROUP);
  next.field.lines = next.field.lines.filter((v) => !mine(v));
  next.field.zones = next.field.zones.filter((v) => !mine(v));
  if (!kind) return next;
  const groupId = GROUP + kind;
  const { lines, zones } = courtShapes(kind, a.field.width, a.field.depth);
  // 틀은 맨 아래에 깔아 선생님이 그린 구역·선이 위에 오게
  next.field.zones = [...zones.map((z) => ({ ...z, id: newId('z'), groupId, locked: true })), ...next.field.zones];
  next.field.lines = [...lines.map((l) => ({ ...l, id: newId('l'), groupId, locked: true })), ...next.field.lines];
  return next;
}
