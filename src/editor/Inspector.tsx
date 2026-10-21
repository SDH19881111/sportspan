import type { Activity, FieldKind } from '../model/activity';
import { FIELD_SIZES } from '../model/activity';
import { CATALOG_BY_KIND } from '../model/catalog';
import {
  addBubble,
  addTeam,
  duplicateObjects,
  removeFieldItem,
  removeObjects,
  removeSceneMark,
  removeTeam,
  rotateObjects,
  setFieldKind,
  setFieldSize,
  setPoses,
  setTitle,
  toggleHighlight,
  updateBubble,
  updateLine,
  updateObjects,
  updateTeam,
  updateZone,
} from '../model/ops';
import { useEditor } from './store';

// 오른쪽 속성 패널: 고른 것에 따라 내용이 바뀐다. 아무것도 안 골랐으면 활동 설정.

export const ZONE_COLORS = ['#3f6fc4', '#f2b48a', '#a9d18e', '#ffe08a', '#f4a3a3', '#b8c0cc', '#c9b3ec', '#ffffff'];
export const LINE_COLORS = ['#ffffff', '#7ccf4a', '#e5484d', '#f5b400', '#2f6fdf', '#1d2433'];
const STEP = Math.PI / 12; // 15°

export function Inspector() {
  const sel = useEditor((s) => s.sel);
  return (
    <aside className="inspector" aria-label="속성">
      {!sel && <ActivityPanel />}
      {sel?.t === 'obj' && <ObjectPanel ids={sel.ids} />}
      {sel?.t === 'zone' && <ZonePanel id={sel.id} />}
      {sel?.t === 'line' && <LinePanel id={sel.id} />}
      {sel?.t === 'arrow' && <MarkPanel id={sel.id} kind="arrow" />}
      {sel?.t === 'bubble' && <MarkPanel id={sel.id} kind="bubble" />}
    </aside>
  );
}

function useCommit() {
  const commit = useEditor((s) => s.commit);
  return (fn: (a: Activity) => Activity, mergeKey?: string) => commit(fn(useEditor.getState().activity), mergeKey);
}

function ActivityPanel() {
  const a = useEditor((s) => s.activity);
  const run = useCommit();
  const kinds: { id: FieldKind; name: string }[] = [
    { id: 'gym', name: '체육관' },
    { id: 'playground', name: '운동장' },
    { id: 'classroom', name: '교실' },
  ];
  return (
    <>
      <h2>활동</h2>
      <label className="field">
        <span>이름</span>
        <input id="act-title" value={a.title} onChange={(e) => run((v) => setTitle(v, e.target.value), 'title')} />
      </label>
      <h3>장소</h3>
      <div className="seg">
        {kinds.map((k) => (
          <button
            key={k.id}
            className={a.field.kind === k.id ? 'on' : ''}
            onClick={() =>
              run((v) => {
                const s = FIELD_SIZES[k.id];
                return setFieldSize(setFieldKind(v, k.id), s.width, s.depth);
              })
            }
          >
            {k.name}
          </button>
        ))}
      </div>
      <div className="row2">
        <NumberField
          id="field-w"
          label="가로(m)"
          value={a.field.width}
          onChange={(w) => run((v) => setFieldSize(v, w, v.field.depth))}
        />
        <NumberField
          id="field-d"
          label="세로(m)"
          value={a.field.depth}
          onChange={(d) => run((v) => setFieldSize(v, v.field.width, d))}
        />
      </div>
      <h3>팀</h3>
      <ul className="teams">
        {a.teams.map((t) => (
          <li key={t.id}>
            <input
              type="color"
              aria-label={`${t.name} 색`}
              value={t.color}
              onChange={(e) => run((v) => updateTeam(v, t.id, { color: e.target.value }), `teamc-${t.id}`)}
            />
            <input
              id={`team-${t.id}`}
              aria-label="팀 이름"
              value={t.name}
              onChange={(e) => run((v) => updateTeam(v, t.id, { name: e.target.value }), `team-${t.id}`)}
            />
            <button className="icon" title="팀 지우기" onClick={() => run((v) => removeTeam(v, t.id))}>
              ×
            </button>
          </li>
        ))}
      </ul>
      <button className="wide" onClick={() => run((v) => addTeam(v).activity)}>
        팀 추가
      </button>
    </>
  );
}

function ObjectPanel({ ids }: { ids: string[] }) {
  const a = useEditor((s) => s.activity);
  const sceneIdx = useEditor((s) => s.sceneIdx);
  const setSel = useEditor((s) => s.setSel);
  const run = useCommit();
  const objs = a.objects.filter((o) => ids.includes(o.id));
  if (!objs.length) return null;
  const first = objs[0];
  const scene = a.scenes[sceneIdx];
  const kinds = new Set(objs.map((o) => o.kind));
  const single = objs.length === 1;
  const teamColored = objs.every((o) => CATALOG_BY_KIND[o.kind].teamColored);
  const highlighted = ids.every((id) => scene.highlights.includes(id));
  const rot = scene.poses[first.id]?.rot ?? 0;

  return (
    <>
      <h2>
        {single ? CATALOG_BY_KIND[first.kind].name : `${objs.length}개 고름`}
        {!single && kinds.size === 1 && ` (${CATALOG_BY_KIND[first.kind].name})`}
      </h2>
      {single && first.kind === 'kid' && (
        <label className="field">
          <span>이름표</span>
          <input
            id="obj-label"
            placeholder="예: 1번, 골키퍼"
            value={first.label ?? ''}
            onChange={(e) => run((v) => updateObjects(v, ids, { label: e.target.value || undefined }), `label-${first.id}`)}
          />
        </label>
      )}
      {teamColored && (
        <>
          <h3>팀</h3>
          <div className="swatches">
            {a.teams.map((t) => (
              <button
                key={t.id}
                className={`swatch${objs.every((o) => o.teamId === t.id) ? ' on' : ''}`}
                style={{ background: t.color }}
                title={t.name}
                aria-label={t.name}
                onClick={() => run((v) => updateObjects(v, ids, { teamId: t.id, color: undefined }))}
              />
            ))}
          </div>
        </>
      )}
      {!teamColored && (
        <label className="field">
          <span>색</span>
          <input
            type="color"
            value={first.color ?? CATALOG_BY_KIND[first.kind].defaultColor}
            onChange={(e) => run((v) => updateObjects(v, ids, { color: e.target.value, teamId: undefined }), `color-${first.id}`)}
          />
        </label>
      )}
      <h3>방향</h3>
      <div className="rotate">
        <button onClick={() => run((v) => rotateObjects(v, sceneIdx, ids, STEP))} title="왼쪽으로 15° (Q)">
          ↺ 15°
        </button>
        <span className="deg">{single ? `${Math.round((rot * 180) / Math.PI)}°` : ''}</span>
        <button onClick={() => run((v) => rotateObjects(v, sceneIdx, ids, -STEP))} title="오른쪽으로 15° (E)">
          15° ↻
        </button>
      </div>
      <div className="seg">
        {[
          ['→', Math.PI / 2],
          ['↓', 0],
          ['←', -Math.PI / 2],
          ['↑', Math.PI],
        ].map(([label, r]) => (
          <button
            key={label as string}
            title="이 방향을 보게 합니다"
            onClick={() =>
              run((v) => setPoses(v, sceneIdx, Object.fromEntries(ids.map((id) => [id, { rot: r as number }]))))
            }
          >
            {label}
          </button>
        ))}
      </div>
      <h3>이 장면에서</h3>
      <div className="stack">
        <button className={highlighted ? 'on' : ''} onClick={() => run((v) => toggleHighlight(v, sceneIdx, ids))}>
          {highlighted ? '강조 끄기' : '강조하기'}
        </button>
        {single && (
          <button
            onClick={() => {
              const st = useEditor.getState();
              const { activity, id } = addBubble(st.activity, sceneIdx, { objId: first.id, text: '' });
              st.commit(activity);
              setSel({ t: 'bubble', id });
            }}
          >
            말풍선 달기
          </button>
        )}
      </div>
      <h3>편집</h3>
      <div className="stack">
        <button
          onClick={() => {
            const st = useEditor.getState();
            const res = duplicateObjects(st.activity, ids);
            st.commit(res.activity);
            setSel({ t: 'obj', ids: res.ids });
          }}
          title="Ctrl+D"
        >
          복사
        </button>
        <button
          className="danger"
          title="Delete"
          onClick={() => {
            run((v) => removeObjects(v, ids));
            setSel(null);
          }}
        >
          지우기
        </button>
      </div>
    </>
  );
}

function ZonePanel({ id }: { id: string }) {
  const zone = useEditor((s) => s.activity.field.zones.find((z) => z.id === id));
  const setZoneColor = useEditor((s) => s.setZoneColor);
  const setSel = useEditor((s) => s.setSel);
  const run = useCommit();
  if (!zone) return null;
  return (
    <>
      <h2>구역</h2>
      <label className="field">
        <span>이름</span>
        <input
          id="zone-label"
          placeholder="예: 노랑 구역, 캐치존"
          value={zone.label ?? ''}
          onChange={(e) => run((v) => updateZone(v, id, { label: e.target.value || undefined }), `zl-${id}`)}
        />
      </label>
      <h3>색</h3>
      <div className="swatches">
        {ZONE_COLORS.map((c) => (
          <button
            key={c}
            className={`swatch${zone.color === c ? ' on' : ''}`}
            style={{ background: c }}
            aria-label={c}
            onClick={() => {
              setZoneColor(c);
              run((v) => updateZone(v, id, { color: c }));
            }}
          />
        ))}
      </div>
      <div className="row2">
        <NumberField id="zone-w" label="가로(m)" value={zone.w} onChange={(w) => run((v) => updateZone(v, id, { w }))} />
        <NumberField id="zone-d" label="세로(m)" value={zone.d} onChange={(d) => run((v) => updateZone(v, id, { d }))} />
      </div>
      <p className="note">구역과 선은 모든 장면에 똑같이 보입니다.</p>
      <button
        className="wide danger"
        onClick={() => {
          run((v) => removeFieldItem(v, id));
          setSel(null);
        }}
      >
        구역 지우기
      </button>
    </>
  );
}

function LinePanel({ id }: { id: string }) {
  const line = useEditor((s) => s.activity.field.lines.find((l) => l.id === id));
  const setLineColor = useEditor((s) => s.setLineColor);
  const setSel = useEditor((s) => s.setSel);
  const run = useCommit();
  if (!line) return null;
  return (
    <>
      <h2>선</h2>
      <label className="field">
        <span>이름</span>
        <input
          id="line-label"
          placeholder="예: 경계선, 출발선"
          value={line.label ?? ''}
          onChange={(e) => run((v) => updateLine(v, id, { label: e.target.value || undefined }), `ll-${id}`)}
        />
      </label>
      <h3>색</h3>
      <div className="swatches">
        {LINE_COLORS.map((c) => (
          <button
            key={c}
            className={`swatch${line.color === c ? ' on' : ''}`}
            style={{ background: c }}
            aria-label={c}
            onClick={() => {
              setLineColor(c);
              run((v) => updateLine(v, id, { color: c }));
            }}
          />
        ))}
      </div>
      <button
        className="wide danger"
        onClick={() => {
          run((v) => removeFieldItem(v, id));
          setSel(null);
        }}
      >
        선 지우기
      </button>
    </>
  );
}

function MarkPanel({ id, kind }: { id: string; kind: 'arrow' | 'bubble' }) {
  const sceneIdx = useEditor((s) => s.sceneIdx);
  const bubble = useEditor((s) => s.activity.scenes[s.sceneIdx].bubbles.find((b) => b.id === id));
  const setSel = useEditor((s) => s.setSel);
  const run = useCommit();
  return (
    <>
      <h2>{kind === 'arrow' ? '화살표' : '말풍선'}</h2>
      {kind === 'bubble' && bubble && (
        <label className="field">
          <span>내용</span>
          <textarea
            id="bubble-text"
            rows={3}
            autoFocus
            placeholder="예: 가위바위보!"
            value={bubble.text}
            onChange={(e) => run((v) => updateBubble(v, sceneIdx, id, e.target.value), `b-${id}`)}
          />
        </label>
      )}
      <p className="note">{kind === 'arrow' ? '화살표는' : '말풍선은'} 지금 장면에만 보입니다.</p>
      <button
        className="wide danger"
        onClick={() => {
          run((v) => removeSceneMark(v, sceneIdx, id));
          setSel(null);
        }}
      >
        지우기
      </button>
    </>
  );
}

function NumberField(props: { id: string; label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <input
        id={props.id}
        type="number"
        min={0.5}
        step={0.5}
        value={Math.round(props.value * 100) / 100}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (Number.isFinite(v) && v > 0) props.onChange(v);
        }}
      />
    </label>
  );
}
