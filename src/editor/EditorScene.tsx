import type { ThreeEvent } from '@react-three/fiber';
import type { Pose } from '../model/activity';
import { CATALOG_BY_KIND } from '../model/catalog';
import { addBubble, updateArrow, updateLine, updateZone, moveObjects } from '../model/ops';
import { BoardItem } from '../scene/BoardItem';
import { Field } from '../scene/Field';
import { ArrowMark, BubbleTag, HighlightRing } from '../scene/Marks';
import { Interaction, startDrag } from './Interaction';
import { selectedObjIds, useEditor } from './store';

// 편집 화면의 3D 내용: 경기장, 물건, 표시. 누르면 고르고, 끌면 옮긴다.

export function EditorScene() {
  const activity = useEditor((s) => s.activity);
  const sceneIdx = useEditor((s) => s.sceneIdx);
  const sel = useEditor((s) => s.sel);
  const draft = useEditor((s) => s.draft);
  const scene = activity.scenes[sceneIdx];
  const selIds = selectedObjIds(sel);
  const fieldSel = sel && sel.t !== 'obj' ? sel.id : undefined;

  return (
    <>
      <Interaction />
      <Field field={activity.field} selectedId={fieldSel} onItemDown={onFieldItemDown} />
      {activity.objects.map((obj) => {
        const pose = scene.poses[obj.id];
        if (!pose) return null;
        return (
          <group key={obj.id} onPointerDown={(e) => onObjectDown(obj.id, e)}>
            <BoardItem activity={activity} obj={obj} pose={pose} selected={selIds.includes(obj.id)} />
          </group>
        );
      })}
      {scene.highlights.map((id) => {
        const obj = activity.objects.find((o) => o.id === id);
        const p = scene.poses[id];
        if (!obj || !p || p.hidden) return null;
        return <HighlightRing key={id} x={p.x} z={p.z} radius={CATALOG_BY_KIND[obj.kind].radius + 0.2} />;
      })}
      {scene.arrows.map((ar) => (
        <ArrowMark
          key={ar.id}
          {...ar}
          selected={sel?.t === 'arrow' && sel.id === ar.id}
          onPointerDown={(e) => onArrowDown(ar.id, e)}
        />
      ))}
      {scene.bubbles.map((b) => {
        const obj = b.objId ? activity.objects.find((o) => o.id === b.objId) : undefined;
        const p = b.objId ? scene.poses[b.objId] : undefined;
        if (!obj || !p || p.hidden) return null;
        return (
          <BubbleTag
            key={b.id}
            x={p.x}
            z={p.z}
            height={CATALOG_BY_KIND[obj.kind].height}
            text={b.text}
            selected={sel?.t === 'bubble' && sel.id === b.id}
            onPointerDown={(e) => {
              e.stopPropagation();
              useEditor.getState().setSel({ t: 'bubble', id: b.id });
            }}
          />
        );
      })}
      {draft && draft.t === 'arrow' && <ArrowMark {...draft} />}
      {draft && draft.t !== 'arrow' && <DraftShape {...draft} t={draft.t} />}
    </>
  );
}

function DraftShape({ t, x1, z1, x2, z2 }: { t: 'zone' | 'line'; x1: number; z1: number; x2: number; z2: number }) {
  const zoneColor = useEditor((s) => s.zoneColor);
  const lineColor = useEditor((s) => s.lineColor);
  if (t === 'zone') {
    const w = Math.abs(x2 - x1);
    const d = Math.abs(z2 - z1);
    return (
      <mesh position={[(x1 + x2) / 2, 0.03, (z1 + z2) / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[Math.max(w, 0.01), Math.max(d, 0.01)]} />
        <meshBasicMaterial color={zoneColor} transparent opacity={0.6} />
      </mesh>
    );
  }
  return <ArrowlessLine x1={x1} z1={z1} x2={x2} z2={z2} color={lineColor} />;
}

function ArrowlessLine(p: { x1: number; z1: number; x2: number; z2: number; color: string }) {
  const len = Math.hypot(p.x2 - p.x1, p.z2 - p.z1);
  const angle = Math.atan2(p.z2 - p.z1, p.x2 - p.x1);
  return (
    <mesh position={[(p.x1 + p.x2) / 2, 0.03, (p.z1 + p.z2) / 2]} rotation={[-Math.PI / 2, 0, -angle]}>
      <planeGeometry args={[Math.max(len, 0.01), 0.08]} />
      <meshBasicMaterial color={p.color} />
    </mesh>
  );
}

// ── 누르기 처리 ───────────────────────────────────────

function onObjectDown(id: string, e: ThreeEvent<PointerEvent>) {
  if (e.button !== 0) return;
  const st = useEditor.getState();

  if (st.tool.t === 'bubble') {
    e.stopPropagation();
    const { activity, id: bid } = addBubble(st.activity, st.sceneIdx, { objId: id, text: '' });
    st.commit(activity);
    st.setSel({ t: 'bubble', id: bid });
    st.setTool({ t: 'select' });
    return;
  }
  // 놓기·그리기 도구일 때는 바닥으로 넘긴다(물건 위에도 그릴 수 있게).
  if (st.tool.t !== 'select') return;
  e.stopPropagation();

  const native = e.nativeEvent;
  const cur = selectedObjIds(st.sel);
  const additive = native.shiftKey || native.ctrlKey || native.metaKey;
  let ids: string[];
  if (additive) {
    ids = cur.includes(id) ? cur.filter((v) => v !== id) : [...cur, id];
  } else {
    ids = cur.includes(id) ? cur : [id];
  }
  st.setSel(ids.length ? { t: 'obj', ids } : null);
  if (!ids.includes(id)) return;

  const scene = st.activity.scenes[st.sceneIdx];
  const start: Record<string, Pose> = {};
  for (const v of ids) if (scene.poses[v]) start[v] = scene.poses[v];
  st.beginGesture();
  startDrag(
    native,
    (p, s) => {
      const now = useEditor.getState();
      now.preview(moveObjects(now.activity, now.sceneIdx, start, p[0] - s[0], p[1] - s[1]));
    },
    (moved) => {
      useEditor.getState().endGesture();
      // 여러 개를 골라 둔 상태에서 하나를 끌지 않고 클릭만 하면 그것 하나만 고른다.
      if (!moved && !additive && cur.includes(id) && cur.length > 1) {
        useEditor.getState().setSel({ t: 'obj', ids: [id] });
      }
    },
  );
}

function onFieldItemDown(kind: 'zone' | 'line', id: string, e: ThreeEvent<PointerEvent>) {
  if (e.button !== 0) return;
  const st = useEditor.getState();
  if (st.tool.t !== 'select') return;
  e.stopPropagation();
  st.setSel({ t: kind, id });
  const zone = st.activity.field.zones.find((z) => z.id === id);
  const line = st.activity.field.lines.find((l) => l.id === id);
  st.beginGesture();
  startDrag(
    e.nativeEvent,
    (p, s) => {
      const now = useEditor.getState();
      const dx = p[0] - s[0];
      const dz = p[1] - s[1];
      if (zone) now.preview(updateZone(now.activity, id, { x: zone.x + dx, z: zone.z + dz }));
      if (line) {
        now.preview(
          updateLine(now.activity, id, { x1: line.x1 + dx, z1: line.z1 + dz, x2: line.x2 + dx, z2: line.z2 + dz }),
        );
      }
    },
    () => useEditor.getState().endGesture(),
  );
}

function onArrowDown(id: string, e: ThreeEvent<PointerEvent>) {
  if (e.button !== 0) return;
  const st = useEditor.getState();
  if (st.tool.t !== 'select') return;
  e.stopPropagation();
  st.setSel({ t: 'arrow', id });
  const ar = st.activity.scenes[st.sceneIdx].arrows.find((v) => v.id === id);
  if (!ar) return;
  st.beginGesture();
  startDrag(
    e.nativeEvent,
    (p, s) => {
      const now = useEditor.getState();
      const dx = p[0] - s[0];
      const dz = p[1] - s[1];
      now.preview(
        updateArrow(now.activity, now.sceneIdx, id, { x1: ar.x1 + dx, z1: ar.z1 + dz, x2: ar.x2 + dx, z2: ar.z2 + dz }),
      );
    },
    () => useEditor.getState().endGesture(),
  );
}
