import { useState } from 'react';
import { unlockAudio } from '../audio/sfx';
import type { Activity, Scene } from '../model/activity';
import { colorOf } from '../model/activity';
import { CATALOG_BY_KIND } from '../model/catalog';
import { addSceneAfter, moveScene, removeScene } from '../model/ops';
import { zoneWorldOutline } from '../model/shapes';
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
  const focus = useEditor((s) => s.focus);
  const setFocus = useEditor((s) => s.setFocus);
  const setSel = useEditor((s) => s.setSel);
  const [askCopy, setAskCopy] = useState(false);
  const n = activity.scenes.length;
  const shown = playing ? playing.scene : sceneIdx;
  const hasAnims = activity.scenes[sceneIdx].anims.length > 0;

  const addNext = (mode: 'end' | 'start') => {
    const res = addSceneAfter(activity, sceneIdx, mode);
    commit(res.activity);
    setSceneIdx(res.idx);
    setAskCopy(false);
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
              onClick={() => {
                unlockAudio();
                play(sceneIdx, false);
              }}
              title="이 장면의 애니메이션을 처음부터 (Space)"
            >
              ▶ 이 장면
            </button>
            <button
              className="play"
              onClick={() => {
                unlockAudio();
                play(0, true);
              }}
              title="첫 장면부터 끝까지 이어서"
            >
              ▶ 처음부터
            </button>
          </>
        )}
      </div>
      <ol className={`scene-list${focus === 'scenes' ? ' focused' : ''}`}>
        {activity.scenes.map((s, i) => (
          <li key={s.id}>
            <button
              className={`scene-card${i === shown ? ' on' : ''}`}
              onClick={() => {
                if (playing) return;
                setSceneIdx(i);
                setSel([]);
                setFocus('scenes'); // 이제 Delete는 이 장면을 지운다
              }}
              aria-current={i === shown ? 'step' : undefined}
              title={s.caption || `장면 ${i + 1}`}
            >
              <MiniMap activity={activity} scene={s} />
              <span className="scene-num">{i + 1}</span>
              <span className="scene-cap">{s.caption || '설명 없음'}</span>
              {s.anims.length > 0 && <span className="scene-anims">애니 {s.anims.length}</span>}
            </button>
          </li>
        ))}
      </ol>
      <div className="scene-add-wrap">
        <button
          className="scene-add"
          onClick={() => (hasAnims ? setAskCopy((v) => !v) : addNext('start'))}
          disabled={!!playing}
          aria-expanded={hasAnims ? askCopy : undefined}
          title="지금 장면을 복사해 바로 뒤에 넣습니다"
        >
          ＋ 다음 장면
        </button>
        {askCopy && (
          <div className="copy-menu" role="menu">
            <p>장면 {sceneIdx + 1}에 애니메이션이 있습니다. 어느 상태로 복사할까요?</p>
            <button role="menuitem" onClick={() => addNext('end')}>
              <b>애니메이션 끝난 상태로</b>
              <span>움직인 뒤 자리에서 이어서 설명</span>
            </button>
            <button role="menuitem" onClick={() => addNext('start')}>
              <b>애니메이션 전 상태로</b>
              <span>움직이기 전 자리 그대로</span>
            </button>
            <button className="copy-cancel" onClick={() => setAskCopy(false)}>
              취소
            </button>
          </div>
        )}
      </div>
      <div className="scene-tools">
        {/* 앞뒤 장면 넘기기로 오해하지 않게 '장면 순서' 이름표를 붙인다 */}
        <div className="scene-order" role="group" aria-label="장면 순서 바꾸기">
          <span>장면 순서</span>
          <button
            disabled={!!playing || sceneIdx === 0}
            title="이 장면을 한 칸 앞으로 옮기기"
            aria-label="이 장면을 앞으로 옮기기"
            onClick={() => {
              commit(moveScene(activity, sceneIdx, -1));
              setSceneIdx(sceneIdx - 1);
            }}
          >
            ◀
          </button>
          <button
            disabled={!!playing || sceneIdx === n - 1}
            title="이 장면을 한 칸 뒤로 옮기기"
            aria-label="이 장면을 뒤로 옮기기"
            onClick={() => {
              commit(moveScene(activity, sceneIdx, 1));
              setSceneIdx(sceneIdx + 1);
            }}
          >
            ▶
          </button>
        </div>
        <button
          className="danger"
          disabled={!!playing || n <= 1}
          title="이 장면 지우기 (장면을 누른 뒤 Delete)"
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
      {activity.field.zones.map((z) => {
        const { outer, hole } = zoneWorldOutline(z);
        const path = (pts: [number, number][]) => `M${pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join('L')}Z`;
        return (
          <path key={z.id} d={path(outer) + (hole ? path(hole) : '')} fill={z.color} fillRule="evenodd" opacity={0.8} />
        );
      })}
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
