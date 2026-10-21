import type { Activity, Scene } from '../model/activity';
import { colorOf } from '../model/activity';
import { CATALOG_BY_KIND } from '../model/catalog';
import { addSceneAfter, moveScene, removeScene } from '../model/ops';
import { useEditor } from './store';

// 아래쪽 장면 띠: 장면 고르기, 다음 장면 만들기(지금 장면 복사), 순서 바꾸기, 지우기, 재생.

export function SceneStrip() {
  const activity = useEditor((s) => s.activity);
  const sceneIdx = useEditor((s) => s.sceneIdx);
  const playing = useEditor((s) => s.playing);
  const commit = useEditor((s) => s.commit);
  const setSceneIdx = useEditor((s) => s.setSceneIdx);
  const play = useEditor((s) => s.play);
  const stop = useEditor((s) => s.stop);
  const n = activity.scenes.length;
  const shown = playing ? playing.target : sceneIdx;

  const addNext = () => {
    const res = addSceneAfter(activity, sceneIdx);
    commit(res.activity);
    setSceneIdx(res.idx);
  };

  return (
    <nav className="scene-strip" aria-label="장면">
      <div className="scene-play">
        {playing ? (
          <button className="play on" onClick={stop}>
            ■ 멈추기
          </button>
        ) : (
          <>
            <button
              className="play"
              disabled={sceneIdx === 0}
              onClick={() => play(sceneIdx, false)}
              title={sceneIdx === 0 ? '첫 장면은 앞 장면이 없어 움직임이 없습니다' : '앞 장면에서 이 장면으로 움직입니다 (Space)'}
            >
              ▶ 이 장면 움직임
            </button>
            <button className="play" disabled={n < 2} onClick={() => play(1, true)} title="첫 장면부터 끝까지 이어서">
              ▶ 처음부터
            </button>
          </>
        )}
      </div>
      <ol className="scene-list">
        {activity.scenes.map((s, i) => (
          <li key={s.id}>
            <button
              className={`scene-card${i === shown ? ' on' : ''}`}
              onClick={() => !playing && setSceneIdx(i)}
              aria-current={i === shown ? 'step' : undefined}
              title={s.caption || `장면 ${i + 1}`}
            >
              <MiniMap activity={activity} scene={s} />
              <span className="scene-num">{i + 1}</span>
              <span className="scene-cap">{s.caption || '설명 없음'}</span>
            </button>
          </li>
        ))}
        <li>
          <button className="scene-add" onClick={addNext} disabled={!!playing} title="지금 장면을 복사해 바로 뒤에 넣습니다">
            ＋ 다음 장면
          </button>
        </li>
      </ol>
      <div className="scene-tools">
        <button
          disabled={!!playing || sceneIdx === 0}
          title="앞으로"
          aria-label="장면을 앞으로"
          onClick={() => {
            commit(moveScene(activity, sceneIdx, -1));
            setSceneIdx(sceneIdx - 1);
          }}
        >
          ◀
        </button>
        <button
          disabled={!!playing || sceneIdx === n - 1}
          title="뒤로"
          aria-label="장면을 뒤로"
          onClick={() => {
            commit(moveScene(activity, sceneIdx, 1));
            setSceneIdx(sceneIdx + 1);
          }}
        >
          ▶
        </button>
        <button
          className="danger"
          disabled={!!playing || n <= 1}
          title="이 장면 지우기"
          onClick={() => {
            commit(removeScene(activity, sceneIdx));
            setSceneIdx(Math.min(sceneIdx, n - 2));
          }}
        >
          장면 지우기
        </button>
      </div>
    </nav>
  );
}

/** 장면 띠에 들어가는 작은 평면도(PPT 썸네일처럼) */
function MiniMap({ activity, scene }: { activity: Activity; scene: Scene }) {
  const { width: w, depth: d } = activity.field;
  const m = 1;
  return (
    <svg className="minimap" viewBox={`${-w / 2 - m} ${-d / 2 - m} ${w + 2 * m} ${d + 2 * m}`} aria-hidden>
      <rect x={-w / 2} y={-d / 2} width={w} height={d} fill="#d8b27e" />
      {activity.field.zones.map((z) => (
        <rect key={z.id} x={z.x - z.w / 2} y={z.z - z.d / 2} width={z.w} height={z.d} fill={z.color} opacity={0.8} />
      ))}
      {activity.field.lines.map((l) => (
        <line key={l.id} x1={l.x1} y1={l.z1} x2={l.x2} y2={l.z2} stroke={l.color} strokeWidth={0.15} />
      ))}
      {activity.objects.map((o) => {
        const p = scene.poses[o.id];
        if (!p || p.hidden) return null;
        const r = o.kind === 'kid' ? 0.45 : Math.max(0.2, CATALOG_BY_KIND[o.kind].radius);
        return (
          <circle
            key={o.id}
            cx={p.x}
            cy={p.z}
            r={r}
            fill={colorOf(activity, o) ?? CATALOG_BY_KIND[o.kind].defaultColor}
            stroke="#1d2433"
            strokeWidth={0.06}
          />
        );
      })}
    </svg>
  );
}
