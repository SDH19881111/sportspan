import { describe, expect, it } from 'vitest';
import type { FieldZone } from '../src/model/activity';
import { buildTimeline, type ItemState } from '../src/motion/timeline';
import {
  applyWander,
  insideZone,
  isAnchored,
  newWanderer,
  ROAM_RADIUS,
  roamOf,
  stepWanderer,
  type Wanderer,
} from '../src/motion/wander';
import { coneSoccer } from '../src/samples/coneSoccer';

// 같은 결과가 나오게 정해진 난수
function seeded(seed = 7) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const FIELD = { width: 20, depth: 12 };
const base = (x = 0, z = 0, rot = 0): ItemState => ({ x, y: 0, z, rot, hidden: false, fallen: false, stride: 0, swing: 0, bob: 0, tilt: 0 });

/** dt씩 흘리며 매 프레임의 보이는 자리를 모은다 */
function run(w: Wanderer, opts: { base: ItemState; anchored?: boolean; zone?: FieldZone | null }, seconds: number, rand = seeded()) {
  const shown: ItemState[] = [];
  let cur = w;
  for (let t = 0; t < seconds; t += 1 / 30) {
    cur = stepWanderer(cur, { base: opts.base, anchored: !!opts.anchored, field: FIELD, zone: opts.zone ?? null, dt: 1 / 30, rand });
    shown.push(applyWander(opts.base, cur));
  }
  return { w: cur, shown };
}

describe('학생 자유 움직임', () => {
  it('자리 둘레에서 정해진 범위 안을 오가고, 걸을 때는 가는 쪽을 본다', () => {
    const b = base(2, 1, 0);
    const { shown } = run(newWanderer(b, seeded()), { base: b }, 60);
    const far = Math.max(...shown.map((s) => Math.hypot(s.x - b.x, s.z - b.z)));
    expect(far).toBeGreaterThan(0.3); // 실제로 움직인다
    expect(far).toBeLessThanOrEqual(ROAM_RADIUS + 1e-6);
    expect(shown.some((s) => s.swing > 0)).toBe(true); // 걷는 다리
    expect(shown.some((s) => s.swing === 0)).toBe(true); // 서서 쉬기도 한다
  });

  it('바닥 끝을 넘어가지 않는다', () => {
    const b = base(9.9, 5.9);
    const { shown } = run(newWanderer(b, seeded(3)), { base: b }, 60, seeded(3));
    for (const s of shown.slice(60)) {
      expect(Math.abs(s.x)).toBeLessThanOrEqual(10);
      expect(Math.abs(s.z)).toBeLessThanOrEqual(6);
    }
  });

  it('구역을 정하면 그 구역 안에서만 오간다 (고리는 구멍을 피한다)', () => {
    const ring: FieldZone = { id: 'z1', x: -4, z: 0, w: 6, d: 6, color: '#fff', shape: 'ring' };
    const b = base(-4, 2.5); // 고리 위에서 시작
    expect(insideZone(ring, b.x, b.z)).toBe(true);
    expect(insideZone(ring, -4, 0)).toBe(false); // 가운데 구멍
    const { shown } = run(newWanderer(b, seeded(11)), { base: b, zone: ring }, 90, seeded(11));
    const moved = shown.filter((s) => Math.hypot(s.x - b.x, s.z - b.z) > 0.05);
    expect(moved.length).toBeGreaterThan(30);
    // 서 있는 점(걸어가는 목표)은 모두 구역 안
    const stops = shown.filter((s, i) => i > 0 && s.swing === 0 && shown[i - 1].swing > 0);
    expect(stops.length).toBeGreaterThan(2);
    for (const s of stops) expect(insideZone(ring, s.x, s.z)).toBe(true);
  });

  it('제자리로 부르면 돌아와 시간표 그대로가 된다', () => {
    const b = base(0, 0, 1.2);
    const away = run(newWanderer(b, seeded()), { base: b }, 20).w;
    const back = run(away, { base: b, anchored: true }, 3);
    expect(back.w.settled).toBe(true);
    expect(back.shown[back.shown.length - 1]).toEqual(b);
  });

  it('학생만 움직이고, 가만히·지운 구역을 고른다', () => {
    const zones: FieldZone[] = [{ id: 'z1', x: 0, z: 0, w: 4, d: 4, color: '#fff' }];
    expect(roamOf({ id: 'k', kind: 'kid' }, zones).roam).toBe('around');
    expect(roamOf({ id: 'c', kind: 'cone' }, zones).roam).toBe('off');
    expect(roamOf({ id: 'k', kind: 'kid', roam: 'off' }, zones).roam).toBe('off');
    expect(roamOf({ id: 'k', kind: 'kid', roam: { zone: 'z1' } }, zones).zone?.id).toBe('z1');
    // 구역을 지웠으면 자리 둘레로
    expect(roamOf({ id: 'k', kind: 'kid', roam: { zone: 'gone' } }, zones)).toEqual({ roam: 'around', zone: null });
  });

  it('이동하는 학생, 공을 가진 학생, 날아오는 공을 받을 학생은 제자리에 선다', () => {
    const a = coneSoccer;
    // 장면 3: y4 달리기 + 공 굴러감(click) → r4·r0 달림(with)
    const tl = buildTimeline(a, 2);
    const at = (id: string, t: number) => tl.at(id, t)!;
    const g = tl.groups[0];
    const mid = (g.start + g.end) / 2;
    expect(isAnchored(a, 2, tl, 'y4', at('y4', mid), mid, true)).toBe(true); // 달리는 중
    // 아무 애니메이션도 없고 공과 먼 학생은 자유
    const free = a.objects.filter((o) => o.kind === 'kid' && !tl.items.some((it) => it.anim.objId === o.id));
    const loose = free.find((o) => {
      const s = at(o.id, 0);
      const ball = at('ball', 0);
      return Math.hypot(s.x - ball.x, s.z - ball.z) > 2;
    })!;
    expect(isAnchored(a, 2, tl, loose.id, at(loose.id, 0), 0, false)).toBe(false);
    // 공 가까이 있는 학생은 공을 가진 것으로 본다
    const ball = at('ball', 0);
    const near = { ...at(loose.id, 0), x: ball.x + 0.3, z: ball.z };
    expect(isAnchored(a, 2, tl, loose.id, near, 0, false)).toBe(true);
    // 숨어 있으면 움직이지 않는다
    expect(isAnchored(a, 2, tl, loose.id, { ...at(loose.id, 0), hidden: true }, 0, false)).toBe(true);
  });

  it('이동이 곧 시작하면(도는 중) 미리 돌아가고, 클릭을 기다리는 동안에는 아직 자유롭다', () => {
    const tl = buildTimeline(coneSoccer, 2);
    // r0은 첫 묶음에서 조금 늦게 달린다
    const it0 = tl.items.find((it) => it.anim.objId === 'r0')!;
    expect(it0.start).toBeGreaterThan(0.3);
    const s = tl.at('r0', 0)!;
    expect(isAnchored(coneSoccer, 2, tl, 'r0', s, 0, false)).toBe(false); // 클릭 기다리는 중
    const t = it0.start - 0.3;
    expect(isAnchored(coneSoccer, 2, tl, 'r0', tl.at('r0', t)!, t, true)).toBe(true); // 출발 직전: 미리 돌아간다
  });
});
