import { useCallback, useEffect, useRef, useState } from 'react';
import { EditorScene } from './editor/EditorScene';
import { Inspector } from './editor/Inspector';
import { formatTime, Library } from './editor/Library';
import { Palette, ToolHint } from './editor/Palette';
import { Presenter, startPresent } from './present/Presenter';
import { SceneStrip } from './editor/SceneStrip';
import { useEditor } from './editor/store';
import { useShortcuts } from './editor/useShortcuts';
import { setCaption } from './model/ops';
import { coneSoccer } from './samples/coneSoccer';
import { Stage, type CameraView } from './scene/Stage';
import { copyOf, lastOpened, listActivities, loadActivity, saveActivity } from './storage/library';

const VIEWS: { id: CameraView; name: string }[] = [
  { id: 'top', name: '위에서' },
  { id: 'angle', name: '비스듬히' },
  { id: 'close', name: '가까이' },
];

const SAVE_DELAY = 800;

type SaveState = { status: 'saved'; at: number } | { status: 'pending' } | { status: 'error' };

/** 바뀔 때마다 잠깐 기다렸다가 자동 저장. flush()는 바로 저장. */
function useAutosave() {
  const [state, setState] = useState<SaveState>({ status: 'pending' });
  const timer = useRef<number | undefined>(undefined);

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
    try {
      const meta = saveActivity(useEditor.getState().activity);
      setState({ status: 'saved', at: meta.updatedAt });
    } catch {
      setState({ status: 'error' });
    }
  }, []);

  useEffect(() => {
    // 처음 열 때: 마지막에 쓰던 설명판, 없으면 견본
    const id = lastOpened() ?? listActivities()[0]?.id;
    const a = id ? loadActivity(id) : null;
    useEditor.getState().load(a ?? copyOf(coneSoccer, '콘 축구 (견본)'));
    flush();

    const unsub = useEditor.subscribe((s, prev) => {
      if (s.activity === prev.activity) return;
      setState({ status: 'pending' });
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, SAVE_DELAY);
    });
    const beforeUnload = () => {
      if (timer.current !== undefined) flush();
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      unsub();
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [flush]);

  return { state, flush };
}

/** Ctrl+끌기로 고를 때의 사각형 */
function MarqueeBox() {
  const m = useEditor((s) => s.marquee);
  if (!m) return null;
  return (
    <div
      className="marquee"
      style={{
        left: Math.min(m.x1, m.x2),
        top: Math.min(m.y1, m.y2),
        width: Math.abs(m.x2 - m.x1),
        height: Math.abs(m.y2 - m.y1),
      }}
    />
  );
}

export function App() {
  const activity = useEditor((s) => s.activity);
  const sceneIdx = useEditor((s) => s.sceneIdx);
  const tool = useEditor((s) => s.tool);
  const playing = useEditor((s) => s.playing);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const commit = useEditor((s) => s.commit);
  const setFocus = useEditor((s) => s.setFocus);
  const presenting = useEditor((s) => s.presenting);
  const endPresent = useEditor((s) => s.endPresent);
  const [view, setView] = useState<CameraView>('angle');
  const [viewNonce, setViewNonce] = useState(0);
  const [libOpen, setLibOpen] = useState(false);
  const save = useAutosave();
  useShortcuts(save.flush);
  const scene = activity.scenes[sceneIdx];
  const playingScene = playing ? activity.scenes[playing.scene] : null;

  // 발표 중에는 편집 화면을 내린다(3D 화면을 둘 그리지 않게)
  if (presenting !== null) return <Presenter startScene={presenting} onExit={endPresent} />;

  return (
    <div className="app">
      <header className="topbar">
        <button className="lib-btn" onClick={() => setLibOpen(true)}>
          내 설명판
        </button>
        <h1>{activity.title || '이름 없는 활동'}</h1>
        <span className={`save-state ${save.state.status}`} role="status">
          {save.state.status === 'saved' && `저장됨 ${formatTime(save.state.at)}`}
          {save.state.status === 'pending' && '저장 중…'}
          {save.state.status === 'error' && '저장 못 함: 브라우저 저장 공간을 확인하세요'}
        </span>
        <div className="history">
          <button onClick={undo} disabled={!canUndo || !!playing} title="되돌리기 (Ctrl+Z)">
            되돌리기
          </button>
          <button onClick={redo} disabled={!canRedo || !!playing} title="다시 하기 (Ctrl+Y)">
            다시 하기
          </button>
        </div>
        <button
          className="present-btn"
          onClick={() => startPresent(0)}
          title="전체 화면으로 처음부터 발표 (F5, 지금 장면부터는 Shift+F5)"
        >
          ▶ 발표
        </button>
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
      </header>
      <div className="workspace">
        <Palette />
        <div className="center">
          <main className={`stage tool-${tool.t}`} onPointerDown={() => setFocus('canvas')}>
            <Stage field={activity.field} view={view} viewNonce={viewNonce}>
              <EditorScene />
            </Stage>
            <ToolHint />
            {playingScene ? (
              playingScene.caption && <p className="caption">{playingScene.caption}</p>
            ) : (
              <div className="caption-edit">
                <label htmlFor="scene-caption">장면 {sceneIdx + 1} 설명</label>
                <textarea
                  id="scene-caption"
                  rows={1}
                  placeholder="이 장면에서 아이들이 할 일을 적어 주세요. 발표할 때 자막으로 크게 나옵니다. (Enter: 줄 바꾸기)"
                  value={scene.caption}
                  onChange={(e) => commit(setCaption(activity, sceneIdx, e.target.value), `caption-${scene.id}`)}
                />
              </div>
            )}
          </main>
          <SceneStrip />
        </div>
        <Inspector />
      </div>
      <MarqueeBox />
      {libOpen && <Library onClose={() => setLibOpen(false)} flush={save.flush} />}
    </div>
  );
}
