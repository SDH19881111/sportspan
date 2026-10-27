// 구역 모양: 모든 모양이 w×d 상자 안에 꼭 맞고, 돌리기·뒤집기가 방향을 바르게 바꾼다
import { describe, expect, it } from 'vitest';
import { emptyActivity } from '../src/model/activity';
import { addZone, flipItems, rotateZones } from '../src/model/ops';
import { ZONE_SHAPES, zoneOutline, zoneWorldOutline } from '../src/model/shapes';

const box = (pts: [number, number][]) => ({
  minX: Math.min(...pts.map((p) => p[0])),
  maxX: Math.max(...pts.map((p) => p[0])),
  minZ: Math.min(...pts.map((p) => p[1])),
  maxZ: Math.max(...pts.map((p) => p[1])),
});

describe('모양 윤곽', () => {
  it.each(ZONE_SHAPES.map((s) => s.id))('%s는 6×4 상자에 꼭 맞는다', (shape) => {
    const b = box(zoneOutline(shape, 6, 4).outer);
    expect(b.minX).toBeCloseTo(-3);
    expect(b.maxX).toBeCloseTo(3);
    expect(b.minZ).toBeCloseTo(-2);
    expect(b.maxZ).toBeCloseTo(2);
  });

  it('세로로 긴 트랙형도 상자에 맞는다', () => {
    const b = box(zoneOutline('stadium', 4, 10).outer);
    expect([b.minX, b.maxX, b.minZ, b.maxZ].map((v) => Math.round(v * 100) / 100)).toEqual([-2, 2, -5, 5]);
  });

  it('고리는 가운데가 빈다', () => {
    const { hole } = zoneOutline('ring', 10, 10);
    expect(box(hole!).maxX).toBeCloseTo(3);
  });

  it('반원은 둥근 쪽, 세모는 꼭짓점이 앞(+z)', () => {
    const semi = zoneOutline('semicircle', 4, 2).outer;
    expect(semi.filter((p) => p[1] > 0.9).every((p) => Math.abs(p[0]) < 1.5)).toBe(true); // 앞쪽은 좁고
    expect(semi.some((p) => Math.abs(p[0]) > 1.99 && p[1] < -0.99)).toBe(true); // 뒤쪽 곧은 변이 가장 넓다
    expect(zoneOutline('triangle', 4, 2).outer[0]).toEqual([0, 1]);
  });

  it('90° 돌리면 앞이 +x로(물건 방향과 같은 규칙)', () => {
    const { outer } = zoneWorldOutline({ x: 10, z: 0, w: 4, d: 2, shape: 'triangle', rot: Math.PI / 2 });
    expect(outer[0][0]).toBeCloseTo(11); // 꼭짓점 (0, 1) → x 쪽으로
    expect(outer[0][1]).toBeCloseTo(0);
  });
});

describe('구역 돌리기·뒤집기', () => {
  it('Q/E처럼 15°씩, 한 바퀴 돌면 rot이 없어진다', () => {
    let { activity, id } = addZone(emptyActivity(), { x: 0, z: 0, w: 3, d: 2, color: '#fff', shape: 'semicircle' });
    activity = rotateZones(activity, [id], Math.PI / 12);
    expect(activity.field.zones[0].rot).toBeCloseTo(Math.PI / 12);
    for (let i = 0; i < 23; i++) activity = rotateZones(activity, [id], Math.PI / 12);
    expect(activity.field.zones[0].rot).toBeUndefined();
  });

  it('반원을 앞뒤로 뒤집으면 둥근 쪽이 뒤로, 네모는 그대로', () => {
    let a = emptyActivity();
    const semi = addZone(a, { x: 0, z: 2, w: 3, d: 2, color: '#fff', shape: 'semicircle' });
    a = semi.activity;
    const rect = addZone(a, { x: 5, z: 2, w: 3, d: 2, color: '#fff' });
    a = rect.activity;
    const f = flipItems(a, 0, [semi.id], 'z');
    expect(Math.abs(f.field.zones[0].rot!)).toBeCloseTo(Math.PI);
    const g = flipItems(a, 0, [rect.id], 'z');
    expect(g.field.zones[1].rot).toBeUndefined();
  });
});
