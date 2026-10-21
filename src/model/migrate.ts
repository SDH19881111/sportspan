// 예전 저장본을 지금 모양으로 바꾼다.
import type { Activity, Anim, BallMove, Pose } from './activity';
import { ACTIVITY_VERSION, newId } from './activity';

type OldPose = Pose & { move?: BallMove };

/**
 * 버전 1: 장면과 장면 사이에서 움직였다(앞 장면 자리 → 이 장면 자리).
 * 버전 2: 장면 안 애니메이션. 그래서 장면 k의 자리 변화는 장면 k-1의 애니메이션이 된다.
 */
export function migrate(a: Activity): Activity {
  if ((a.version ?? 1) >= ACTIVITY_VERSION) return a;
  const kinds = new Map(a.objects.map((o) => [o.id, o.kind]));
  a.scenes.forEach((s) => (s.anims ??= []));

  for (let k = 1; k < a.scenes.length; k++) {
    const prev = a.scenes[k - 1];
    const cur = a.scenes[k];
    const made: Anim[] = [];
    for (const [id, p1] of Object.entries(cur.poses) as [string, OldPose][]) {
      const p0 = prev.poses[id];
      if (!p0) continue;
      const base = { id: newId('an'), objId: id, delay: 0, start: 'with' as const };
      if (p0.hidden && !p1.hidden) made.push({ ...base, kind: 'appear' });
      if (Math.hypot(p1.x - p0.x, p1.z - p0.z) >= 0.05) {
        const ball = kinds.get(id) === 'ball';
        made.push({ ...base, id: newId('an'), kind: 'move', to: { x: p1.x, z: p1.z }, style: ball ? (p1.move ?? 'roll') : 'run' });
      }
      if (p1.fallen && !p0.fallen) made.push({ ...base, id: newId('an'), kind: 'fall', start: 'hit' });
      if (!p0.hidden && p1.hidden) made.push({ ...base, id: newId('an'), kind: 'disappear', start: 'after' });
    }
    // 공이 먼저 움직여야 '공이 닿을 때'가 계산된다
    made.sort((x, y) => order(x) - order(y));
    if (made.length) made[0] = { ...made[0], start: 'click' };
    prev.anims = [...prev.anims, ...made];
  }
  for (const s of a.scenes) for (const p of Object.values(s.poses) as OldPose[]) delete p.move;
  a.version = ACTIVITY_VERSION;
  return a;
}

function order(an: Anim) {
  return { appear: 0, move: 1, fall: 2, disappear: 3 }[an.kind];
}
