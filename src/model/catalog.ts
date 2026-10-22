import type { FieldKind, ObjectKind } from './activity';

// 팔레트에 나오는 물건. 크기는 초등 체육 수업에서 쓰는 실제 장비 기준(m).
export interface CatalogItem {
  kind: ObjectKind;
  name: string;
  defaultColor: string;
  teamColored: boolean; // 팀 색을 따르는지
  radius: number; // 바닥에서 차지하는 반지름(선택·충돌용)
  height: number;
}

export const CATALOG: CatalogItem[] = [
  { kind: 'kid', name: '학생', defaultColor: '#e5484d', teamColored: true, radius: 0.25, height: 1.35 },
  { kind: 'cone', name: '콘', defaultColor: '#ff7a1a', teamColored: false, radius: 0.12, height: 0.3 },
  { kind: 'disc', name: '접시콘', defaultColor: '#ff7a1a', teamColored: false, radius: 0.1, height: 0.05 },
  { kind: 'ball', name: '공', defaultColor: '#f4f4f0', teamColored: false, radius: 0.11, height: 0.22 },
  { kind: 'hoop', name: '훌라후프', defaultColor: '#7c5cff', teamColored: false, radius: 0.4, height: 0.03 },
  { kind: 'bib', name: '조끼', defaultColor: '#a3e635', teamColored: true, radius: 0.2, height: 0.04 },
  { kind: 'beanbag', name: '콩주머니', defaultColor: '#3b82f6', teamColored: true, radius: 0.07, height: 0.04 },
  { kind: 'cup', name: '컵', defaultColor: '#ef4444', teamColored: false, radius: 0.05, height: 0.12 },
  { kind: 'bell', name: '종', defaultColor: '#facc15', teamColored: false, radius: 0.1, height: 0.15 },
  { kind: 'basket', name: '바구니', defaultColor: '#8b5cf6', teamColored: false, radius: 0.2, height: 0.25 },
  { kind: 'goal', name: '골대', defaultColor: '#f4f4f0', teamColored: false, radius: 0.9, height: 1.0 },
  { kind: 'desk', name: '책상', defaultColor: '#c8a27a', teamColored: false, radius: 0.6, height: 0.7 },
];

export const CATALOG_BY_KIND = Object.fromEntries(CATALOG.map((c) => [c.kind, c])) as Record<
  ObjectKind,
  CatalogItem
>;

// 화면에 그릴 때만 키우는 배율. 실제 크기로 그리면 운동장(40×25m)에서 학생·콘이 점처럼 작고,
// 공은 체육관에서도 잘 안 보인다. 자리·거리·움직임 계산은 그대로 실제 크기(m)를 쓴다.
// 넓게 깔리는 것(훌라후프·조끼·골대·책상)은 키우면 서로 겹쳐 보여서 그대로 둔다.
const AS_IS: ObjectKind[] = ['hoop', 'bib', 'goal', 'desk'];

export function viewScale(kind: ObjectKind, field: FieldKind): number {
  if (AS_IS.includes(kind)) return 1;
  const wide = field === 'playground';
  if (kind === 'kid') return wide ? 1.4 : 1;
  if (kind === 'ball') return wide ? 2.2 : 1.6;
  return wide ? 1.8 : 1;
}
