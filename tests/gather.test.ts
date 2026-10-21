import { describe, expect, it } from 'vitest';
import { emptyActivity, type Activity } from '../src/model/activity';
import { addMoves, addObject } from '../src/model/ops';
import { buildTimeline } from '../src/motion/timeline';

const CELL = 0.5;
const KID_R = 0.25;

function kids(points: [number, number][]): { a: Activity; ids: string[] } {
  let a = emptyActivity('gym');
  const ids: string[] = [];
  for (const [x, z] of points) {
    const res = addObject(a, { kind: 'kid', teamId: a.teams[0].id }, { x, z, rot: 0 });
    a = res.activity;
    ids.push(res.id);
  }
  return { a, ids };
}

const dist = (p: { x: number; z: number }, q: { x: number; z: number }) => Math.hypot(p.x - q.x, p.z - q.z);

describe('모여 이동', () => {
  it('누른 자리는 비우고 한 칸 띄워 둘러서고, 옆 사람과도 몸 사이 한 칸 띈다', () => {
    for (const n of [2, 3, 5, 10]) {
      const pts: [number, number][] = Array.from({ length: n }, (_, i) => [-6 + i * 1.2, 4 - (i % 3)]);
      const { a, ids } = kids(pts);
      const dest = { x: 2, z: -1 };
      const res = addMoves(a, 0, ids, dest, 'click', { mode: 'gather', cell: CELL });
      const tos = res.activity.scenes[0].anims.map((m) => m.to!);
      expect(tos).toHaveLength(n);
      for (const t of tos) expect(dist(t, dest)).toBeGreaterThanOrEqual(CELL + KID_R - 0.002);
      for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++) expect(dist(tos[i], tos[j])).toBeGreaterThanOrEqual(2 * KID_R + CELL - 0.002);
    }
  });

  it('모두 동시에: 첫째만 클릭, 나머지는 앞과 함께. 도착 시각도 같은 묶음', () => {
    const { a, ids } = kids([
      [-5, 0],
      [5, 0],
      [0, 5],
    ]);
    const res = addMoves(a, 0, ids, { x: 0, z: 0 }, 'click', { mode: 'gather', cell: CELL });
    const anims = res.activity.scenes[0].anims;
    expect(anims.map((m) => m.start)).toEqual(['click', 'with', 'with']);
    const tl = buildTimeline(res.activity, 0);
    expect(tl.groups).toHaveLength(1);
    expect(new Set(tl.items.map((it) => it.start))).toEqual(new Set([0]));
  });

  it('각자 오던 쪽 자리에 선다(왼쪽에서 온 학생은 왼쪽, 오른쪽은 오른쪽)', () => {
    const { a, ids } = kids([
      [-8, 0],
      [8, 0],
    ]);
    const res = addMoves(a, 0, ids, { x: 0, z: 0 }, 'click', { mode: 'gather', cell: CELL });
    const [left, right] = res.activity.scenes[0].anims.map((m) => m.to!);
    expect(left.x).toBeLessThan(0);
    expect(right.x).toBeGreaterThan(0);
  });

  it('한 명이면 누른 곳으로 그대로 간다', () => {
    const { a, ids } = kids([[-3, 0]]);
    const res = addMoves(a, 0, ids, { x: 2, z: 1 }, 'click', { mode: 'gather', cell: CELL });
    expect(res.activity.scenes[0].anims[0].to).toEqual({ x: 2, z: 1 });
  });

  it('대형 유지(keep)는 예전처럼 간격을 그대로 둔다', () => {
    const { a, ids } = kids([
      [-3, 0],
      [-2, 1],
    ]);
    const res = addMoves(a, 0, ids, { x: 2, z: 0 }, 'click', { mode: 'keep', cell: CELL });
    expect(res.activity.scenes[0].anims.map((m) => m.to)).toEqual([
      { x: 2, z: 0 },
      { x: 3, z: 1 },
    ]);
  });
});
