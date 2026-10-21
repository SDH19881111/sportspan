import { describe, expect, it } from 'vitest';
import { buildTimeline } from '../src/motion/timeline';
import { coneSoccer } from '../src/samples/coneSoccer';
import { advance, atEnd, back, enterScene, enterSceneEnd, tick, type PresentState } from '../src/present/steps';

type G = { start: number; end: number; waitsForClick: boolean };
const click = (start: number, end: number): G => ({ start, end, waitsForClick: true });
const auto = (start: number, end: number): G => ({ start, end, waitsForClick: false });

// 장면 0: 클릭 묶음 둘 / 장면 1: 애니메이션 없음 / 장면 2: 저절로 도는 묶음 + 클릭 묶음
const SCENES: G[][] = [[click(0, 2), click(2.6, 4)], [], [auto(0, 1), click(1.6, 3)]];
const groupsOf = (i: number) => SCENES[i];
const N = SCENES.length;

/** 도는 중이면 끝까지 시간을 흘린다 */
function finish(s: PresentState): PresentState {
  let cur = s;
  for (let i = 0; i < 1000 && cur.target !== null; i++) cur = tick(cur, 0.1);
  return cur;
}
const next = (s: PresentState) => advance(s, groupsOf, N)!;

describe('발표 단계 넘기기', () => {
  it('클릭 묶음으로 시작하는 장면은 들어가서 멈춰 기다린다', () => {
    expect(enterScene(0, groupsOf(0))).toEqual({ scene: 0, played: 0, t: 0, target: null });
  });

  it('클릭마다 묶음 하나를 틀고 끝에서 멈춘다(끝까지 저절로 흐르지 않는다)', () => {
    let s = next(enterScene(0, groupsOf(0)));
    expect(s).toMatchObject({ played: 1, t: 0, target: 2 });
    s = finish(s);
    expect(s).toMatchObject({ played: 1, t: 2, target: null });
    s = next(s);
    expect(s).toMatchObject({ played: 2, t: 2.6, target: 4 }); // 묶음 사이 쉬는 틈은 건너뛴다
    s = finish(s);
    expect(s).toMatchObject({ scene: 0, t: 4, target: null }); // 장면 끝에서도 멈춘다
  });

  it('도는 중에 누르면 그 묶음을 끝으로 건너뛰기만 한다', () => {
    const s = next(next(enterScene(0, groupsOf(0))));
    expect(s).toMatchObject({ played: 1, t: 2, target: null });
  });

  it('장면 끝에서 누르면 다음 장면, 애니메이션 없는 장면은 바로 그다음으로', () => {
    let s = finish(next(finish(next(enterScene(0, groupsOf(0))))));
    s = next(s);
    expect(s).toEqual({ scene: 1, played: 0, t: 0, target: null });
    s = next(s);
    // 장면 2는 첫 묶음이 저절로 돈다
    expect(s).toEqual({ scene: 2, played: 1, t: 0, target: 1 });
  });

  it('마지막 장면 끝에서는 더 가지 않는다', () => {
    const end = enterSceneEnd(2, groupsOf(2));
    expect(atEnd(end, groupsOf(2), N)).toBe(true);
    expect(advance(end, groupsOf, N)).toBeNull();
  });

  it('뒤로: 마지막에 튼 묶음의 시작 전 모습으로', () => {
    const s = finish(next(finish(next(enterScene(0, groupsOf(0))))));
    expect(back(s, groupsOf)).toEqual({ scene: 0, played: 1, t: 2.6, target: null });
  });

  it('뒤로: 장면 처음이면 앞 장면의 끝난 모습으로', () => {
    expect(back(enterScene(1, groupsOf(1)), groupsOf)).toEqual({ scene: 0, played: 2, t: 4, target: null });
    // 저절로 도는 첫 묶음만 튼 상태도 '장면 처음'
    expect(back(enterScene(2, groupsOf(2)), groupsOf)).toEqual({ scene: 1, played: 0, t: 0, target: null });
  });

  it('첫 장면 처음에서 뒤로는 아무것도 하지 않는다', () => {
    expect(back(enterScene(0, groupsOf(0)), groupsOf)).toBeNull();
  });

  it('견본(콘 축구)을 처음부터 끝까지 넘기면 모든 장면·묶음을 한 번씩 지난다', () => {
    const tls = coneSoccer.scenes.map((_, i) => buildTimeline(coneSoccer, i));
    const g = (i: number) => tls[i].groups;
    let s: PresentState | null = enterScene(0, g(0));
    let clicks = 0;
    const seen = new Set<string>();
    while (s) {
      s = finish(s);
      seen.add(`${s.scene}:${s.played}`);
      s = advance(s, g, tls.length);
      clicks++;
      if (clicks > 100) throw new Error('끝나지 않는다');
    }
    const total = tls.reduce((n, tl) => n + tl.groups.filter((x) => x.waitsForClick).length, 0);
    // 클릭 수 = 기다리는 묶음 수 + 장면 넘기기(장면 수 - 1) + 마지막 한 번(null)
    expect(clicks).toBe(total + tls.length);
    expect(seen.has(`${tls.length - 1}:${g(tls.length - 1).length}`)).toBe(true);
  });
});
