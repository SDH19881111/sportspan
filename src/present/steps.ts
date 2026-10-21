// 발표 화면의 단계 넘기기. PPT처럼 클릭 묶음마다 멈추고, 장면 끝에서도 멈춘다.
//
// 장면의 클릭 묶음(timeline.groups)을 하나씩 튼다. played는 지금까지 시작한 묶음 수,
// t는 장면 시각, target이 있으면 그 시각까지 돌아가는 중이다.
// "클릭할 때"가 아닌 애니메이션으로 시작하는 장면은 첫 묶음이 들어가자마자 돈다.

import type { Timeline } from '../motion/timeline';

export interface PresentState {
  scene: number;
  played: number;
  t: number;
  target: number | null;
}

type Groups = Timeline['groups'];

/** 장면 처음으로 들어간다(첫 묶음이 클릭을 기다리지 않으면 바로 튼다) */
export function enterScene(scene: number, groups: Groups): PresentState {
  const g = groups[0];
  if (g && !g.waitsForClick) return { scene, played: 1, t: g.start, target: g.end };
  return { scene, played: 0, t: 0, target: null };
}

/** 장면 끝난 모습으로 들어간다(뒤로 가기로 앞 장면에 갈 때) */
export function enterSceneEnd(scene: number, groups: Groups): PresentState {
  const last = groups[groups.length - 1];
  return { scene, played: groups.length, t: last ? last.end : 0, target: null };
}

/**
 * 다음: 도는 중이면 그 묶음을 끝까지 건너뛰고, 멈춰 있으면 다음 묶음을 튼다.
 * 묶음을 다 틀었으면 다음 장면. 마지막 장면 끝이면 그대로(null).
 */
export function advance(s: PresentState, groupsOf: (scene: number) => Groups, sceneCount: number): PresentState | null {
  const groups = groupsOf(s.scene);
  if (s.target !== null) return { ...s, t: s.target, target: null };
  const g = groups[s.played];
  if (g) return { ...s, played: s.played + 1, t: g.start, target: g.end };
  if (s.scene + 1 < sceneCount) return enterScene(s.scene + 1, groupsOf(s.scene + 1));
  return null;
}

/** 뒤로: 마지막에 튼 묶음을 시작 전으로 되돌린다. 장면 처음이면 앞 장면 끝으로. */
export function back(s: PresentState, groupsOf: (scene: number) => Groups): PresentState | null {
  const groups = groupsOf(s.scene);
  // 저절로 도는 첫 묶음만 튼 상태는 '장면 처음'으로 본다
  const auto = groups[0] && !groups[0].waitsForClick ? 1 : 0;
  if (s.played > auto) {
    const played = s.played - 1;
    return { ...s, played, t: groups[played].start, target: null };
  }
  if (s.scene > 0) return enterSceneEnd(s.scene - 1, groupsOf(s.scene - 1));
  if (s.t > 0 || s.target !== null) return enterScene(s.scene, groups);
  return null;
}

/** 시간 흐르기: 도는 중일 때만 target까지 */
export function tick(s: PresentState, dt: number): PresentState {
  if (s.target === null) return s;
  const t = Math.min(s.t + dt, s.target);
  return t >= s.target ? { ...s, t, target: null } : { ...s, t };
}

/** 이 장면에 남은 단계가 있는지(마지막 장면 끝 표시용) */
export function atEnd(s: PresentState, groups: Groups, sceneCount: number): boolean {
  return s.target === null && s.played >= groups.length && s.scene === sceneCount - 1;
}
