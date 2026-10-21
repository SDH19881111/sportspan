import type { ObjectKind } from './activity';

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
