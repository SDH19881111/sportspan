// 구역 모양. 모든 모양은 가로 w × 세로 d 상자 안에 꼭 맞게 그리고, 상자 가운데를 축으로 rot만큼 돈다.
// 앞쪽은 물건과 같이 +z(반원은 둥근 쪽, 세모는 꼭짓점이 앞). 3D 화면·장면 띠 미리보기가 같은 윤곽을 쓴다.
import type { FieldZone } from './activity';

export type ZoneShape = 'rect' | 'ellipse' | 'semicircle' | 'triangle' | 'diamond' | 'stadium' | 'ring';

export const ZONE_SHAPES: { id: ZoneShape; name: string; hint: string }[] = [
  { id: 'rect', name: '네모', hint: '네모 구역(코트·진영)' },
  { id: 'ellipse', name: '원', hint: '원·타원(원형 피구, 술래 구역). Shift를 누른 채 그리면 정원' },
  { id: 'semicircle', name: '반원', hint: '반원(농구 자유투 구역, 골 앞 구역). 둥근 쪽이 앞' },
  { id: 'triangle', name: '세모', hint: '세모(꼭짓점이 앞)' },
  { id: 'diamond', name: '마름모', hint: '마름모(티볼·발야구 내야)' },
  { id: 'stadium', name: '트랙형', hint: '양 끝이 둥근 트랙 모양' },
  { id: 'ring', name: '고리', hint: '가운데가 빈 고리(원형 피구 바깥 구역)' },
];

/** 좌우·앞뒤가 같지 않아 뒤집으면 방향이 바뀌는 모양 */
export const ASYMMETRIC: ZoneShape[] = ['semicircle', 'triangle'];

/** 고리의 안쪽 구멍 크기(바깥 대비) */
export const RING_INNER = 0.6;

type P = [number, number]; // [x, z]

function ellipse(rx: number, rz: number, n = 48, cz = 0, a0 = 0, a1 = Math.PI * 2, closed = true): P[] {
  const out: P[] = [];
  const steps = closed ? n : n + 1;
  for (let i = 0; i < steps; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([rx * Math.cos(a), cz + rz * Math.sin(a)]);
  }
  return out;
}

/** 돌리기 전, 상자 가운데가 원점인 윤곽(바깥, 구멍) */
export function zoneOutline(shape: ZoneShape, w: number, d: number): { outer: P[]; hole?: P[] } {
  const hw = w / 2;
  const hd = d / 2;
  switch (shape) {
    case 'ellipse':
      return { outer: ellipse(hw, hd) };
    case 'ring':
      return { outer: ellipse(hw, hd), hole: ellipse(hw * RING_INNER, hd * RING_INNER) };
    case 'semicircle':
      // 곧은 변이 뒤(-z), 둥근 쪽이 앞(+z)
      return { outer: ellipse(hw, d, 32, -hd, 0, Math.PI, false) };
    case 'triangle':
      return { outer: [[0, hd], [-hw, -hd], [hw, -hd]] };
    case 'diamond':
      return { outer: [[0, hd], [-hw, 0], [0, -hd], [hw, 0]] };
    case 'stadium': {
      // 긴 쪽 양 끝을 반원으로
      const out: P[] = [];
      if (w >= d) {
        const r = hd;
        const c = hw - r;
        for (const [cx, a0] of [[c, -Math.PI / 2], [-c, Math.PI / 2]] as const)
          for (let i = 0; i <= 16; i++) {
            const a = a0 + (Math.PI * i) / 16;
            out.push([cx + r * Math.cos(a), r * Math.sin(a)]);
          }
      } else {
        const r = hw;
        const c = hd - r;
        for (const [cz, a0] of [[c, 0], [-c, Math.PI]] as const)
          for (let i = 0; i <= 16; i++) {
            const a = a0 + (Math.PI * i) / 16;
            out.push([r * Math.cos(a), cz + r * Math.sin(a)]);
          }
      }
      return { outer: out };
    }
    default:
      return { outer: [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]] };
  }
}

/** 구역의 바닥 위 실제 윤곽(돌리고 옮긴 뒤). three.js의 y축 회전과 같은 방향. */
export function zoneWorldOutline(z: Pick<FieldZone, 'x' | 'z' | 'w' | 'd' | 'shape' | 'rot'>): { outer: P[]; hole?: P[] } {
  const { outer, hole } = zoneOutline(z.shape ?? 'rect', z.w, z.d);
  const r = z.rot ?? 0;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const tf = ([x, q]: P): P => [z.x + x * c + q * s, z.z - x * s + q * c];
  return { outer: outer.map(tf), hole: hole?.map(tf) };
}
