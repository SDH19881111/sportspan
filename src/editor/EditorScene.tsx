import { useMemo, useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import type { Activity } from '../model/activity';
import { CATALOG_BY_KIND } from '../model/catalog';
import { addBubble, expandGroups, isLocked, moveItems } from '../model/ops';
import { buildTransition, type Transition } from '../motion/transition';
import { BoardItem } from '../scene/BoardItem';
import { Field } from '../scene/Field';
import { ArrowMark, BubbleTag, Ghost, HighlightRing } from '../scene/Marks';
import { Interaction, startDrag } from './Interaction';
import { useEditor } from './store';

// 편집 화면의 3D 내용. 누르면 고르고, 끌면 옮긴다. 재생 중에는 움직임을 보여 준다.

export function EditorScene() {
  const activity = useEditor((s) => s.activity);
  const sceneIdx = useEditor((s) => s.sceneIdx);
  const sel = useEditor((s) => s.sel);
  const draft = useEditor((s) => s.draft);
  const playing = useEditor((s) => s.playing);
  const scene = activity.scenes[sceneIdx];

  // 가만히 있을 때 모습 = 이 장면으로 넘어오는 움직임의 마지막 순간(넘어진 콘 방향까지 같게)
  const settled = useMemo(() => buildTransition(activity, sceneIdx), [activity, sceneIdx]);

  if (playing) return <PlaybackScene activity={activity} />;

  return (
    <>
      <Interaction />
      <Field field={activity.field} selectedIds={sel} onItemDown={onItemDown} />
      {sceneIdx > 0 && <Ghosts activity={activity} sceneIdx={sceneIdx} />}
      <Items activity={activity} transition={settled} t={settled.duration} sel={sel} interactive />
      {scene.highlights.map((id) => {
        const obj = activity.objects.find((o) => o.id === id);
        const p = scene.poses[id];
        if (!obj || !p || p.hidden) return null;
        return <HighlightRing key={id} x={p.x} z={p.z} radius={CATALOG_BY_KIND[obj.kind].radius + 0.2} />;
      })}
      {scene.arrows.map((ar) => (
        <ArrowMark key={ar.id} {...ar} selected={sel.includes(ar.id)} onPointerDown={(e) => onItemDown(ar.id, e)} />
      ))}
      <Bubbles activity={activity} sceneIdx={sceneIdx} sel={sel} />
      {draft && draft.t === 'arrow' && <ArrowMark {...draft} />}
      {draft && draft.t !== 'arrow' && <DraftShape {...draft} t={draft.t} />}
    </>
  );
}

function Items(props: { activity: Activity; transition: Transition; t: number; sel?: string[]; interactive?: boolean }) {
  const { activity, transition, t, sel = [], interactive } = props;
  return (
    <>
      {activity.objects.map((obj) => {
        const state = transition.at(obj.id, t);
        if (!state) return null;
        return (
          <group key={obj.id} onPointerDown={interactive ? (e) => onItemDown(obj.id, e) : undefined}>
            <BoardItem activity={activity} obj={obj} state={state} selected={sel.includes(obj.id)} />
          </group>
        );
      })}
    </>
  );
}

function Bubbles({ activity, sceneIdx, sel }: { activity: Activity; sceneIdx: number; sel: string[] }) {
  const scene = activity.scenes[sceneIdx];
  return (
    <>
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
            selected={sel.includes(b.id)}
            onPointerDown={(e) => {
              e.stopPropagation();
              useEditor.getState().setSel([b.id]);
            }}
          />
        );
      })}
    </>
  );
}

/** 앞 장면에서의 자리를 흐리게 보여 주고, 지금 자리까지 점선으로 잇는다. */
function Ghosts({ activity, sceneIdx }: { activity: Activity; sceneIdx: number }) {
  const prev = activity.scenes[sceneIdx - 1];
  const cur = activity.scenes[sceneIdx];
  return (
    <>
      {activity.objects.map((o) => {
        const p0 = prev.poses[o.id];
        const p1 = cur.poses[o.id];
        if (!p0 || !p1 || p0.hidden || p1.hidden) return null;
        if (Math.hypot(p1.x - p0.x, p1.z - p0.z) < 0.05) return null;
        const team = o.teamId ? activity.teams.find((t) => t.id === o.teamId)?.color : undefined;
        return (
          <Ghost
            key={o.id}
            x0={p0.x}
            z0={p0.z}
            x1={p1.x}
            z1={p1.z}
            radius={Math.max(0.15, CATALOG_BY_KIND[o.kind].radius)}
            color={team ?? o.color ?? CATALOG_BY_KIND[o.kind].defaultColor}
          />
        );
      })}
    </>
  );
}

/** 재생: target-1 장면에서 target 장면으로 움직인다. all이면 마지막 장면까지 이어 간다. */
function PlaybackScene({ activity }: { activity: Activity }) {
  const playing = useEditor((s) => s.playing)!;
  const transition = useMemo(() => buildTransition(activity, playing.target), [activity, playing.target]);
  const scene = activity.scenes[playing.target];
  const start = useRef<number | null>(null);
  const [t, setT] = useState(0);

  useFrame(({ clock }) => {
    if (start.current === null) start.current = clock.elapsedTime;
    const now = clock.elapsedTime - start.current;
    if (now < transition.duration) {
      setT(now);
      return;
    }
    const st = useEditor.getState();
    start.current = null;
    if (playing.all && playing.target + 1 < activity.scenes.length) {
      useEditor.setState({ playing: { target: playing.target + 1, all: true }, sceneIdx: playing.target });
      setT(0);
    } else {
      st.stop();
      st.setSceneIdx(playing.target);
    }
  });

  return (
    <>
      <Field field={activity.field} />
      <Items activity={activity} transition={transition} t={t} />
      {scene.arrows.map((ar) => (
        <ArrowMark key={ar.id} {...ar} />
      ))}
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
  const len = Math.hypot(x2 - x1, z2 - z1);
  const angle = Math.atan2(z2 - z1, x2 - x1);
  return (
    <mesh position={[(x1 + x2) / 2, 0.03, (z1 + z2) / 2]} rotation={[-Math.PI / 2, 0, -angle]}>
      <planeGeometry args={[Math.max(len, 0.01), 0.08]} />
      <meshBasicMaterial color={lineColor} />
    </mesh>
  );
}

// ── 누르기 처리: 물건·구역·선·화살표 공통 ────────────────

function onItemDown(id: string, e: ThreeEvent<PointerEvent>) {
  if (e.button !== 0) return;
  const st = useEditor.getState();
  if (st.playing) return;
  const isObj = st.activity.objects.some((o) => o.id === id);

  if (st.tool.t === 'bubble') {
    if (!isObj) return;
    e.stopPropagation();
    const { activity, id: bid } = addBubble(st.activity, st.sceneIdx, { objId: id, text: '' });
    st.commit(activity);
    st.setSel([bid]);
    st.setTool({ t: 'select' });
    return;
  }
  // 놓기·그리기 도구일 때, 또는 고정된 것은 바닥으로 넘긴다.
  if (st.tool.t !== 'select' || isLocked(st.activity, id)) return;
  e.stopPropagation();

  const native = e.nativeEvent;
  const clicked = expandGroups(st.activity, [id]);
  const cur = st.sel;
  const additive = native.shiftKey || native.ctrlKey || native.metaKey;
  const already = clicked.every((v) => cur.includes(v));
  let ids: string[];
  if (additive) ids = already ? cur.filter((v) => !clicked.includes(v)) : [...new Set([...cur, ...clicked])];
  else ids = already ? cur : clicked;
  st.setSel(ids);
  if (!clicked.every((v) => ids.includes(v))) return;

  const moving = ids.filter((v) => !isLocked(st.activity, v));
  const base = st.activity;
  st.beginGesture();
  startDrag(
    native,
    (p, s) => {
      const now = useEditor.getState();
      now.preview(moveItems(base, now.sceneIdx, moving, p[0] - s[0], p[1] - s[1]));
    },
    (moved) => {
      useEditor.getState().endGesture();
      // 여러 개를 골라 둔 상태에서 끌지 않고 누르기만 하면 그것(묶음)만 고른다.
      if (!moved && !additive && already && cur.length > clicked.length) useEditor.getState().setSel(clicked);
    },
  );
}
