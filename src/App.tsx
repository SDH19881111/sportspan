import { useState } from 'react';
import { EditorScene } from './editor/EditorScene';
import { Inspector } from './editor/Inspector';
import { Palette } from './editor/Palette';
import { useEditor } from './editor/store';
import { useShortcuts } from './editor/useShortcuts';
import { setCaption } from './model/ops';
import { Stage, type CameraView } from './scene/Stage';

const VIEWS: { id: CameraView; name: string }[] = [
  { id: 'top', name: '위에서' },
  { id: 'angle', name: '비스듬히' },
  { id: 'close', name: '가까이' },
];

export function App() {
  const activity = useEditor((s) => s.activity);
  const sceneIdx = useEditor((s) => s.sceneIdx);
  const tool = useEditor((s) => s.tool);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const commit = useEditor((s) => s.commit);
  const [view, setView] = useState<CameraView>('angle');
  const [viewNonce, setViewNonce] = useState(0);
  useShortcuts();
  const scene = activity.scenes[sceneIdx];

  return (
    <div className="app">
      <header className="topbar">
        <h1>{activity.title || '이름 없는 활동'}</h1>
        <div className="history">
          <button onClick={undo} disabled={!canUndo} title="되돌리기 (Ctrl+Z)">
            되돌리기
          </button>
          <button onClick={redo} disabled={!canRedo} title="다시 하기 (Ctrl+Y)">
            다시 하기
          </button>
        </div>
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
        <main className={`stage tool-${tool.t}`}>
          <Stage field={activity.field} view={view} viewNonce={viewNonce}>
            <EditorScene />
          </Stage>
          <div className="caption-edit">
            <label htmlFor="scene-caption">장면 설명</label>
            <input
              id="scene-caption"
              placeholder="이 장면에서 아이들이 할 일을 적어 주세요. 발표할 때 자막으로 크게 나옵니다."
              value={scene.caption}
              onChange={(e) => commit(setCaption(activity, sceneIdx, e.target.value), `caption-${scene.id}`)}
            />
          </div>
        </main>
        <Inspector />
      </div>
    </div>
  );
}
