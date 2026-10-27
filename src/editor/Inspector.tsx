import { useEffect, useRef } from 'react';
import type { Activity, AnimKind, AnimStart, FieldKind } from '../model/activity';
import { FIELD_SIZES } from '../model/activity';
import { CATALOG_BY_KIND } from '../model/catalog';
import { COURTS, currentCourt, setCourt } from '../model/courts';
import { ZONE_SHAPES } from '../model/shapes';
import { ShapeIcon } from './Palette';
import {
  addAnim,
  addBubble,
  addTeam,
  duplicateItems,
  flipItems,
  groupItems,
  isLocked,
  itemKind,
  lockedCount,
  removeFieldItem,
  removeSceneMark,
  setLocked,
  ungroupItems,
  unlockAll,
  type ItemKind,
  removeTeam,
  rotateObjects,
  rotateZones,
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
import { deleteSel } from './actions';
import { AnimPane } from './AnimPane';
import { useEditor } from './store';

// 오른쪽 속성 패널: 고른 것에 따라 내용이 바뀐다. 아무것도 안 골랐으면 활동 설정.

export const ZONE_COLORS = ['#3f6fc4', '#f2b48a', '#a9d18e', '#ffe08a', '#f4a3a3', '#b8c0cc', '#c9b3ec', '#ffffff'];
export const LINE_COLORS = ['#ffffff', '#7ccf4a', '#e5484d', '#f5b400', '#2f6fdf', '#1d2433'];
const STEP = Math.PI / 12; // 15°


export function Inspector() {
  const sel = useEditor((s) => s.sel);
  const activity = useEditor((s) => s.activity);
  const sceneIdx = useEditor((s) => s.sceneIdx);
  const kinds = sel.map((id) => itemKind(activity, sceneIdx, id));
  const only = (k: ItemKind) => kinds.length > 0 && kinds.every((v) => v === k);
  const single = sel.length === 1;
  const tab = useEditor((s) => s.rightTab);
  const setTab = useEditor((s) => s.setRightTab);
  const animCount = activity.scenes[sceneIdx].anims.length;
  const showAnims = tab === 'anims' || only('anim');
  return (
    <aside className="inspector" aria-label="속성">
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={!showAnims} className={!showAnims ? 'on' : ''} onClick={() => setTab('props')}>
          속성
        </button>
        <button role="tab" aria-selected={showAnims} className={showAnims ? 'on' : ''} onClick={() => setTab('anims')}>
          애니메이션{animCount ? ` ${animCount}` : ''}
        </button>
      </div>
      {showAnims ? <AnimPane /> : <PropsContent sel={sel} only={only} single={single} />}
    </aside>
  );
}

function PropsContent({ sel, only, single }: { sel: string[]; only: (k: ItemKind) => boolean; single: boolean }) {
  return (
    <>
      {!sel.length && <ActivityPanel />}
      {only('obj') && <ObjectPanel ids={sel} />}
      {single && only('zone') && <ZonePanel id={sel[0]} />}
      {single && only('line') && <LinePanel id={sel[0]} />}
      {single && only('arrow') && <MarkPanel id={sel[0]} kind="arrow" />}
      {single && only('bubble') && <MarkPanel key={sel[0]} id={sel[0]} kind="bubble" />}
      {sel.length > 1 && !only('obj') && <h2>{sel.length}개 고름</h2>}
      {sel.length > 0 && !only('arrow') && !only('bubble') && <ArrangePanel ids={sel} />}
    </>
  );
}

/** 묶기·고정·복사·지우기: 무엇을 골랐든 공통 */
function ArrangePanel({ ids }: { ids: string[] }) {
  const a = useEditor((s) => s.activity);
  const sceneIdx = useEditor((s) => s.sceneIdx);
  const setSel = useEditor((s) => s.setSel);
  const run = useCommit();
  const items = [...a.objects, ...a.field.zones, ...a.field.lines].filter((i) => ids.includes(i.id));
  const groups = new Set(items.map((i) => i.groupId));
  const oneGroup = items.length > 1 && groups.size === 1 && !groups.has(undefined);
  const anyGrouped = items.some((i) => i.groupId);
  const allLocked = items.length > 0 && items.every((i) => i.locked);
  return (
    <>
      <h3>배치</h3>
      <div className="stack">
        {items.length > 1 && !oneGroup && (
          <button onClick={() => run((v) => groupItems(v, ids))} title="함께 골라지고 함께 움직입니다 (Ctrl+G)">
            하나로 묶기
          </button>
        )}
        {anyGrouped && (
          <button onClick={() => run((v) => ungroupItems(v, ids))} title="Ctrl+Shift+G">
            묶음 풀기
          </button>
        )}
        {items.length > 0 && (
          <button
            className={allLocked ? 'on' : ''}
            onClick={() => run((v) => setLocked(v, ids, !allLocked))}
            title="고정하면 끌어도 옮겨지지 않고 지워지지 않습니다. 눌러서 고를 수는 있습니다"
          >
            {allLocked ? '고정 풀기' : '고정하기'}
          </button>
        )}
        {oneGroup && <p className="note">묶음입니다. 하나를 누르면 묶음 전체가 골라집니다.</p>}
        {allLocked && <p className="note">고정됨: 옮기거나 돌리거나 지울 수 없습니다. 고치려면 "고정 풀기".</p>}
      </div>
      <div className="seg">
        <button
          onClick={() => run((v) => flipItems(v, sceneIdx, ids.filter((id) => !isLocked(v, id)), 'x'))}
          title="고른 것들의 가운데를 기준으로 좌우를 바꿉니다. 보는 방향·이 장면의 이동 경로도 함께 (H)"
        >
          ↔ 좌우 뒤집기
        </button>
        <button
          onClick={() => run((v) => flipItems(v, sceneIdx, ids.filter((id) => !isLocked(v, id)), 'z'))}
          title="고른 것들의 가운데를 기준으로 앞뒤를 바꿉니다 (V)"
        >
          ↕ 앞뒤 뒤집기
        </button>
      </div>
      <h3>편집</h3>
      <div className="stack">
        <button
          onClick={() => {
            const st = useEditor.getState();
            const res = duplicateItems(st.activity, ids);
            st.commit(res.activity);
            setSel(res.ids);
          }}
          title="Ctrl+D"
        >
          복사
        </button>
        <button
          className="danger"
          title="Delete (고정된 것은 남깁니다)"
          disabled={allLocked}
          onClick={deleteSel}
        >
          지우기
        </button>
      </div>
    </>
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
  const court = currentCourt(a);
  // 바닥 크기가 바뀌면 그어 둔 경기장 선도 새 크기에 맞춰 다시 긋는다
  const refit = (v: Activity) => {
    const c = currentCourt(v);
    return c ? setCourt(v, c) : v;
  };
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
                return refit(setFieldSize(setFieldKind(v, k.id), s.width, s.depth));
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
          onChange={(w) => run((v) => refit(setFieldSize(v, w, v.field.depth)))}
        />
        <NumberField
          id="field-d"
          label="세로(m)"
          value={a.field.depth}
          onChange={(d) => run((v) => refit(setFieldSize(v, v.field.width, d)))}
        />
      </div>
      <h3>경기장 선</h3>
      <div className="seg wrap" role="group" aria-label="경기장 선">
        <button className={court === null ? 'on' : ''} onClick={() => run((v) => setCourt(v, null))}>
          없음
        </button>
        {COURTS.map((c) => (
          <button
            key={c.id}
            className={court === c.id ? 'on' : ''}
            title={`${c.hint}. 바닥 크기에 맞춰 긋습니다`}
            onClick={() => run((v) => setCourt(v, c.id))}
          >
            {c.name}
          </button>
        ))}
      </div>
      {court && <p className="note">선은 고정되어 있어 끌어도 옮겨지지 않습니다. 고치려면 선을 눌러 고른 뒤 "고정 풀기".</p>}
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
      {lockedCount(a) > 0 && (
        <>
          <h3>고정</h3>
          <p className="note">고정된 것이 {lockedCount(a)}개 있습니다. 하나씩 풀려면 그것을 눌러 고른 뒤 "고정 풀기"(오른쪽 클릭 메뉴에도 있음).</p>
          <button className="wide" onClick={() => run((v) => unlockAll(v))}>
            모두 고정 풀기
          </button>
        </>
      )}
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
  const allHidden = ids.every((id) => scene.poses[id]?.hidden);
  const canFall = objs.every((o) => o.kind === 'cone' || o.kind === 'cup');
  const allFallen = ids.every((id) => scene.poses[id]?.fallen);

  /** 넘어지기·나타나기·사라지기: 고른 것 모두에 붙이고, 둘째부터는 '앞과 함께' */
  const addSimple = (kind: AnimKind, start: AnimStart) => {
    const st = useEditor.getState();
    let next = st.activity;
    const made: string[] = [];
    ids.forEach((id, i) => {
      const res = addAnim(next, sceneIdx, { objId: id, kind, start: i === 0 ? start : 'with', delay: 0 });
      next = res.activity;
      made.push(res.id);
    });
    st.commit(next);
    setSel(made);
    st.setRightTab('anims');
  };

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
        <button onClick={() => run((v) => rotateObjects(v, sceneIdx, ids.filter((id) => !isLocked(v, id)), STEP))} title="왼쪽으로 15° (Q)">
          ↺ 15°
        </button>
        <span className="deg">{single ? `${Math.round((rot * 180) / Math.PI)}°` : ''}</span>
        <button onClick={() => run((v) => rotateObjects(v, sceneIdx, ids.filter((id) => !isLocked(v, id)), -STEP))} title="오른쪽으로 15° (E)">
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
              run((v) => setPoses(v, sceneIdx, Object.fromEntries(ids.filter((id) => !isLocked(v, id)).map((id) => [id, { rot: r as number }]))))
            }
          >
            {label}
          </button>
        ))}
      </div>
      <h3>애니메이션 추가</h3>
      <div className="anim-add">
        {ids.length > 1 ? (
          <>
            <button
              title="바닥을 누른 곳으로 모두 함께 모입니다. 그 자리는 비우고 한 칸씩 띄워 둥글게 섭니다"
              onClick={() => useEditor.getState().setTool({ t: 'path', ids, mode: 'gather' })}
            >
              모여 이동
            </button>
            <button
              title="지금 간격(대형)을 그대로 유지한 채 함께 움직입니다. 처음 고른 것이 누른 곳으로 갑니다"
              onClick={() => useEditor.getState().setTool({ t: 'path', ids, mode: 'keep' })}
            >
              대형 유지
            </button>
          </>
        ) : (
          <button
            title="바닥을 누르면 그곳까지 움직입니다"
            onClick={() => useEditor.getState().setTool({ t: 'path', ids })}
          >
            이동
          </button>
        )}
        {canFall && (
          <button
            title="공이 지나가며 닿을 때 쓰러집니다(공 이동이 없으면 앞 애니메이션과 함께)"
            onClick={() => addSimple('fall', 'hit')}
          >
            넘어지기
          </button>
        )}
        <button title="숨어 있다가 나타납니다" onClick={() => addSimple('appear', 'click')}>
          나타나기
        </button>
        <button title="보이다가 사라집니다" onClick={() => addSimple('disappear', 'click')}>
          사라지기
        </button>
        <button title="그 순간부터 발밑에 강조 원이 깜빡입니다" onClick={() => addSimple('highlight', 'click')}>
          강조
        </button>
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
              setSel([id]);
            }}
          >
            말풍선 달기
          </button>
        )}
        <button
          className={allHidden ? 'on' : ''}
          title="장면이 시작될 때 안 보입니다. '나타나기' 애니메이션으로 보이게 할 수 있습니다"
          onClick={() =>
            run((v) => setPoses(v, sceneIdx, Object.fromEntries(ids.map((id) => [id, { hidden: !allHidden }]))))
          }
        >
          {allHidden ? '숨김 풀기' : '숨긴 채 시작'}
        </button>
        {canFall && (
          <button
            className={allFallen ? 'on' : ''}
            title="장면이 시작될 때 넘어져 있습니다"
            onClick={() =>
              run((v) => setPoses(v, sceneIdx, Object.fromEntries(ids.map((id) => [id, { fallen: !allFallen }]))))
            }
          >
            {allFallen ? '세운 채 시작' : '넘어진 채 시작'}
          </button>
        )}
      </div>
    </>
  );
}

function ZonePanel({ id }: { id: string }) {
  const zone = useEditor((s) => s.activity.field.zones.find((z) => z.id === id));
  const setZoneColor = useEditor((s) => s.setZoneColor);
  const setZoneShape = useEditor((s) => s.setZoneShape);
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
      <h3>모양</h3>
      <div className="shape-pick" role="group" aria-label="구역 모양">
        {ZONE_SHAPES.map((z) => (
          <button
            key={z.id}
            className={(zone.shape ?? 'rect') === z.id ? 'on' : ''}
            aria-pressed={(zone.shape ?? 'rect') === z.id}
            title={z.hint}
            onClick={() => {
              setZoneShape(z.id); // 다음에 그릴 구역도 이 모양으로
              run((v) => updateZone(v, id, { shape: z.id === 'rect' ? undefined : z.id }));
            }}
          >
            <ShapeIcon shape={z.id} />
            {z.name}
          </button>
        ))}
      </div>
      <h3>방향</h3>
      <div className="rotate">
        <button disabled={zone.locked} onClick={() => run((v) => rotateZones(v, [id], STEP))} title="왼쪽으로 15° (Q)">
          ↺ 15°
        </button>
        <span className="deg">{Math.round(((zone.rot ?? 0) * 180) / Math.PI)}°</span>
        <button disabled={zone.locked} onClick={() => run((v) => rotateZones(v, [id], -STEP))} title="오른쪽으로 15° (E)">
          15° ↻
        </button>
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
          setSel([]);
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
          setSel([]);
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
  const hasShow = useEditor((s) => s.activity.scenes[s.sceneIdx].anims.some((an) => an.markId === id));
  const setSel = useEditor((s) => s.setSel);
  const run = useCommit();
  // 말풍선을 고르면 바로 글자를 칠 수 있게. 3D 화면을 누른 직후에는 브라우저가 포커스를 가져가므로 한 박자 늦춘다.
  const text = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const t = window.setTimeout(() => text.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [id]);
  return (
    <>
      <h2>{kind === 'arrow' ? '화살표' : '말풍선'}</h2>
      {kind === 'bubble' && bubble && (
        <label className="field">
          <span>내용</span>
          <textarea
            id="bubble-text"
            ref={text}
            rows={3}
            placeholder="예: 가위바위보!"
            value={bubble.text}
            onChange={(e) => run((v) => updateBubble(v, sceneIdx, id, e.target.value), `b-${id}`)}
          />
        </label>
      )}
      <p className="note">{kind === 'arrow' ? '화살표는' : '말풍선은'} 지금 장면에만 보입니다.</p>
      {hasShow ? (
        <p className="note">애니메이션으로 나타납니다. 시점은 애니메이션 탭에서 바꿉니다.</p>
      ) : (
        <button
          className="wide"
          title="처음엔 숨어 있다가 정한 순간에 나타납니다"
          onClick={() => {
            const st = useEditor.getState();
            const res = addAnim(st.activity, sceneIdx, { kind: 'show', markId: id, start: 'click', delay: 0 });
            st.commit(res.activity);
            setSel([res.id]);
            st.setRightTab('anims');
          }}
        >
          애니메이션으로 나타나기
        </button>
      )}
      <button
        className="wide danger"
        onClick={() => {
          run((v) => removeSceneMark(v, sceneIdx, id));
          setSel([]);
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
