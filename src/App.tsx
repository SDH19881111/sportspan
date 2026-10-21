import { useState } from 'react';
import { BoardItem } from './scene/BoardItem';
import { Field } from './scene/Field';
import { Stage, type CameraView } from './scene/Stage';
import { coneSoccer } from './samples/coneSoccer';

const VIEWS: { id: CameraView; name: string }[] = [
  { id: 'top', name: '위에서' },
  { id: 'angle', name: '비스듬히' },
  { id: 'close', name: '가까이' },
];

export function App() {
  const activity = coneSoccer;
  const scene = activity.scenes[0];
  const [view, setView] = useState<CameraView>('angle');
  const [viewNonce, setViewNonce] = useState(0);

  return (
    <div className="app">
      <header className="topbar">
        <h1>{activity.title}</h1>
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
      <main className="stage">
        <Stage field={activity.field} view={view} viewNonce={viewNonce}>
          <Field field={activity.field} />
          {activity.objects.map((obj) => {
            const pose = scene.poses[obj.id];
            return pose ? <BoardItem key={obj.id} activity={activity} obj={obj} pose={pose} /> : null;
          })}
        </Stage>
        {scene.caption && <p className="caption">{scene.caption}</p>}
      </main>
    </div>
  );
}
