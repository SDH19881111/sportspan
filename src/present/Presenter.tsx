import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { buildTimeline, type Timeline } from '../motion/timeline';
import { playSound, unlockAudio } from '../audio/sfx';
import { ShowScene, type AdjustItem } from '../editor/EditorScene';
import { useEditor } from '../editor/store';
import { Stage, type CameraView } from '../scene/Stage';
import { advance, atEnd, back, enterScene, tick, type PresentState } from './steps';
import type { Activity } from '../model/activity';
import { applyWander, isAnchored, newWanderer, roamOf, stepWanderer, type Wanderer } from '../motion/wander';

const VIEWS: { id: CameraView; name: string }[] = [
  { id: 'top', name: '위에서' },
  { id: 'angle', name: '비스듬히' },
  { id: 'close', name: '가까이' },
];

const CLICK_PX = 6;
const HINT_MS = 4000;

const NEXT_KEYS = new Set([' ', 'Enter', 'ArrowRight', 'ArrowDown', 'PageDown']);
const PREV_KEYS = new Set(['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace']);

/**
 * 발표 시작. 전체 화면은 브라우저 규칙상 버튼·키를 누른 그 순간에만 켤 수 있어서 여기서 바로 요청한다.
 * 못 켜는 환경이면 창 안에서 그대로 발표한다.
 */
export function startPresent(fromScene: number) {
  document.documentElement.requestFullscreen?.().catch(() => {});
  useEditor.getState().present(fromScene);
}

/**
 * 발표 미리보기: 전체 화면을 켜지 않고 창 안의 TV 비율(16:9) 틀에 발표 화면을 띄운다.
 * 클뷰플 펼치기 창에서는 전체 화면이 곧 TV로 옮기기라서, 그 전에 선생님 화면에서 확인할 수 있게.
 */
export function startPreview(fromScene: number) {
  useEditor.getState().present(fromScene, true);
}

/** 미리보기에서 그 자리 그대로 발표로. 전체 화면은 누른 그 순간에만 켤 수 있어 버튼에서 부른다 */
function goLive() {
  document.documentElement.requestFullscreen?.().catch(() => {});
  useEditor.getState().goLive();
}

/**
 * 발표 화면: 전체 화면에 장면과 큰 자막만. 클릭·Space·→로 다음 단계, ←로 이전 단계, Esc로 나간다.
 * "클릭할 때" 애니메이션마다, 그리고 장면 끝에서 멈춰 기다린다.
 */
export function Presenter({ startScene, onExit }: { startScene: number; onExit: (scene: number) => void }) {
  const activity = useEditor((s) => s.activity);
  const preview = useEditor((s) => s.previewing);
  const timelines = useMemo(() => activity.scenes.map((_, i) => buildTimeline(activity, i)), [activity]);
  const groupsOf = useCallback((i: number) => timelines[i].groups, [timelines]);
  const count = activity.scenes.length;

  const [state, setState] = useState<PresentState>(() => enterScene(startScene, groupsOf(startScene)));
  // 단계 넘기기와 시간 흐르기가 같은 프레임에 겹쳐도 덮어쓰지 않도록 최신 상태는 ref에 바로 둔다
  const stateRef = useRef(state);
  const commit = useCallback((s: PresentState) => {
    stateRef.current = s;
    setState(s);
  }, []);
  /** 효과음을 어디까지 울렸는지. 단계를 건너뛰면 그 사이 소리는 울리지 않는다. */
  const soundFrom = useRef(state.target !== null ? state.t - 1e-6 : state.t);

  const go = useCallback((next: PresentState | null) => {
    if (!next) return;
    soundFrom.current = next.target !== null ? next.t - 1e-6 : next.t;
    commit(next);
  }, [commit]);
  const next = useCallback(() => {
    unlockAudio();
    go(advance(stateRef.current, groupsOf, count));
  }, [go, groupsOf, count]);
  const prev = useCallback(() => go(back(stateRef.current, groupsOf)), [go, groupsOf]);
  const exit = useCallback(() => onExit(stateRef.current.scene), [onExit]);

  const [view, setView] = useState<CameraView>('angle');
  const [viewNonce, setViewNonce] = useState(0);
  const [hint, setHint] = useState(true);

  useEffect(() => {
    const id = window.setTimeout(() => setHint(false), HINT_MS);
    return () => window.clearTimeout(id);
  }, []);

  // 학생 자유 움직임(motion/wander.ts): 학생마다 어긋남을 프레임마다 옮기고, 그릴 때 시간표 자리에 더한다
  const wanderers = useRef(new Map<string, Wanderer>());
  const [, setFrame] = useState(0);
  useEffect(() => wanderers.current.clear(), [state.scene]); // 장면이 바뀌면 새 자리에서 다시
  const adjust = useCallback<AdjustItem>((obj, s) => (obj.kind === 'kid' ? applyWander(s, wanderers.current.get(obj.id)) : s), []);
  const redraw = useCallback(() => setFrame((n) => (n + 1) % 1000000), []);

  // 전체 화면은 startPresent가 누른 순간 켠다. 브라우저가 Esc로 전체 화면을 먼저 풀면 발표도 끝낸다.
  // 미리보기는 전체 화면을 쓰지 않는다(이대로 발표를 누르면 그때부터 지켜본다).
  useEffect(() => {
    if (preview) return;
    let entered = !!document.fullscreenElement;
    const onChange = () => {
      if (document.fullscreenElement) entered = true;
      else if (entered) exit();
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, [exit, preview]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (NEXT_KEYS.has(e.key)) {
        e.preventDefault();
        next();
      } else if (PREV_KEYS.has(e.key)) {
        e.preventDefault();
        prev();
      } else if (e.key === 'Home') {
        e.preventDefault();
        go(enterScene(0, groupsOf(0)));
      } else if (e.key === 'Escape') {
        e.preventDefault();
        exit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, exit, go, groupsOf]);

  // 화면을 누르면 다음. 끌면 카메라만 돈다.
  const down = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    down.current = e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = down.current;
    down.current = null;
    if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < CLICK_PX) next();
  };
  const stop = (e: React.PointerEvent) => e.stopPropagation();

  const timeline = timelines[state.scene];
  const caption = activity.scenes[state.scene].caption;
  const ended = atEnd(state, timeline.groups, count);
  const waiting = state.target === null && !ended;

  return (
    <div className={preview ? 'present preview' : 'present'}>
      {preview && (
        <div className="preview-bar">
          <span className="preview-title">👁 발표 미리보기 <em>TV에는 아직 나가지 않습니다 · 클릭·Space·→로 넘겨 보세요</em></span>
          <button className="present-btn" onClick={goLive} title="지금 보는 자리부터 전체 화면으로 발표">
            ▶ 이대로 발표
          </button>
          <button className="present-exit" onClick={exit} title="미리보기 닫기 (Esc)">
            닫기
          </button>
        </div>
      )}
      <div className="present-screen" onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
      <Stage field={activity.field} view={view} viewNonce={viewNonce} controlsEnabled>
        <Runner stateRef={stateRef} commit={commit} timelines={timelines} soundFrom={soundFrom} />
        <WanderDriver activity={activity} timelines={timelines} stateRef={stateRef} wanderers={wanderers} redraw={redraw} />
        <ShowScene activity={activity} sceneIdx={state.scene} timeline={timeline} t={state.t} adjust={adjust} />
      </Stage>

      <div className="present-bar" onPointerDown={stop} onPointerUp={stop}>
        <span className="present-count">
          장면 {state.scene + 1} / {count}
        </span>
        <div className="views" role="group" aria-label="카메라">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              className={v.id === view ? 'on' : ''}
              onClick={() => {
                setView(v.id);
                setViewNonce((n) => n + 1);
              }}
            >
              {v.name}
            </button>
          ))}
        </div>
        <button className="present-exit" onClick={exit} title="발표 끝내기 (Esc)">
          나가기
        </button>
      </div>

      {caption && <p className="caption present-caption">{caption}</p>}

      <div className="present-nav" onPointerDown={stop} onPointerUp={stop}>
        <button onClick={prev} aria-label="이전 (←)" title="이전 (←)">
          ◀
        </button>
        <button onClick={next} aria-label="다음 (→)" title="다음 (→)" disabled={ended} className={waiting ? 'ready' : ''}>
          ▶
        </button>
      </div>

      {ended && <p className="present-end">마지막 장면입니다 · Esc로 나가기</p>}
      {hint && <p className="present-hint">클릭·Space·→ 다음 · ← 이전 · Esc 나가기</p>}
      </div>
    </div>
  );
}

/**
 * 학생 자유 움직임을 프레임마다 옮긴다(클릭을 기다리며 시간이 멈춰 있어도). 움직이는 학생이 있을 때만 다시 그린다.
 */
function WanderDriver(props: {
  activity: Activity;
  timelines: Timeline[];
  stateRef: React.MutableRefObject<PresentState>;
  wanderers: React.MutableRefObject<Map<string, Wanderer>>;
  redraw: () => void;
}) {
  const ref = useRef(props);
  ref.current = props;
  useFrame((_, dt) => {
    const { activity, timelines, stateRef, wanderers, redraw } = ref.current;
    const st = stateRef.current;
    const timeline = timelines[st.scene];
    const step = Math.min(dt, 0.1);
    let moved = false;
    for (const obj of activity.objects) {
      const { roam, zone } = roamOf(obj, activity.field.zones);
      if (roam === 'off') {
        if (wanderers.current.delete(obj.id)) moved = true;
        continue;
      }
      const base = timeline.at(obj.id, st.t);
      if (!base) continue;
      const prev = wanderers.current.get(obj.id) ?? newWanderer(base);
      const anchored = isAnchored(activity, st.scene, timeline, obj.id, base, st.t, st.target !== null);
      const next = stepWanderer(prev, { base, anchored, field: activity.field, zone, dt: step });
      wanderers.current.set(obj.id, next);
      if (!(prev.settled && next.settled)) moved = true;
    }
    if (moved) redraw();
  });
  return null;
}

/** 캔버스 안에서 시간을 흘린다(도는 중일 때만). 지나간 효과음도 여기서 울린다. */
function Runner(props: {
  stateRef: React.MutableRefObject<PresentState>;
  commit: (s: PresentState) => void;
  timelines: Timeline[];
  soundFrom: React.MutableRefObject<number>;
}) {
  const ref = useRef(props);
  ref.current = props;
  useFrame((_, dt) => {
    const { stateRef, commit, timelines, soundFrom } = ref.current;
    const state = stateRef.current;
    if (state.target === null) return;
    // 탭을 다녀오면 dt가 커진다: 한 번에 너무 많이 건너뛰지 않게
    const next = tick(state, Math.min(dt, 0.1) * useEditor.getState().playRate);
    for (const snd of timelines[state.scene].sounds) {
      if (snd.at > soundFrom.current && snd.at <= next.t) playSound(snd.sound);
    }
    soundFrom.current = next.t;
    commit(next);
  });
  return null;
}
