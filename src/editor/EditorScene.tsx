import { useMemo, useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import type { Activity } from '../model/activity';
import { colorOf } from '../model/activity';
import { CATALOG_BY_KIND } from '../model/catalog';
import { addBubble, addMoves, expandGroups, isLocked, moveItems, updateAnim } from '../model/ops';
import { buildTimeline, type Timeline } from '../motion/timeline';
import { BoardItem } from '../scene/BoardItem';
import { Field } from '../scene/Field';
import { AnimBadge, ArrowMark, BubbleTag, HighlightRing, PathMark } from '../scene/Marks';
import { Interaction, startDrag } from './Interaction';
import { useEditor } from './store';

/** 편집 화면은 애니메이션이 하나도 일어나기 전(장면 시작) 모습을 보여 준다 */
const BEFORE_START = -1;

// 편집 화면의 3D 내용. 장면 시작 모습 위에 애니메이션 경로와 번호를 겹쳐 보여 준다.
// 누르면 고르고, 끌면 옮긴다. 재생 중에는 시간표대로 움직인다.

export function EditorScene() {
  const activity = useEditor((s) => s.activity);
  const sceneIdx = useEditor((s) => s.sceneIdx);
  const sel = useEditor((s) => s.sel);
  const draft = useEditor((s) => s.draft);
  const playing = useEditor((s) => s.playing);
  const scene = activity.scenes[sceneIdx];
  const timeline = useMemo(() => buildTimeline(activity, sceneIdx), [activity, sceneIdx]);

  if (playing) return <PlaybackScene key={`${playing.scene}-${playing.run}`} activity={activity} />;

  return (
    <>
      <Interaction />
      <Field field={activity.field} selectedIds={sel} onItemDown={onItemDown} />
      <Items activity={activity} timeline={timeline} t={BEFORE_START} sel={sel} interactive />
      <AnimMarks activity={activity} timeline={timeline} sel={sel} />
      {scene.highlights.map((id) => {
        const obj = activity.objects.find((o) => o.id === id);
        const p = scene.poses[id];
        if (!obj || !p) return null;
        return <HighlightRing key={id} x={p.x} z={p.z} radius={CATALOG_BY_KIND[obj.kind].radius + 0.2} />;
      })}
      {scene.arrows.map((ar) => (
        <ArrowMark key={ar.id} {...ar} selected={sel.includes(ar.id)} onPointerDown={(e) => onItemDown(ar.id, e)} />
      ))}
      <Bubbles activity={activity} sceneIdx={sceneIdx} sel={sel} />
      {draft && draft.t === 'arrow' && <ArrowMark {...draft} />}
      {draft && draft.t === 'path' && (
        <PathMark x0={draft.x1} z0={draft.z1} x1={draft.x2} z1={draft.z2} color="#2563eb" radius={0.25} selected />
      )}
      {draft && (draft.t === 'zone' || draft.t === 'line') && <DraftShape {...draft} t={draft.t} />}
    </>
  );
}

function Items(props: { activity: Activity; timeline: Timeline; t: number; sel?: string[]; interactive?: boolean }) {
  const { activity, timeline, t, sel = [], interactive } = props;
  return (
    <>
      {activity.objects.map((obj) => {
        const state = timeline.at(obj.id, t);
        if (!state) return null;
        return (
          <group key={obj.id} onPointerDown={interactive ? (e) => onItemDown(obj.id, e) : undefined}>
            <BoardItem
              activity={activity}
              obj={obj}
              state={state}
              selected={sel.includes(obj.id)}
              showHidden={interactive}
            />
          </group>
        );
      })}
    </>
  );
}

/** 애니메이션 경로와 번호표. 번호를 누르면 그 애니메이션을 고르고, 도착점 원을 끌면 도착점이 옮겨진다. */
function AnimMarks({ activity, timeline, sel }: { activity: Activity; timeline: Timeline; sel: string[] }) {
  const objs = new Map(activity.objects.map((o) => [o.id, o]));
  const selObjs = new Set(sel);
  return (
    <>
      {timeline.items.map((it) => {
        const obj = objs.get(it.anim.objId);
        if (!obj) return null;
        const chosen = sel.includes(it.anim.id) || selObjs.has(obj.id);
        const color = colorOf(activity, obj) ?? CATALOG_BY_KIND[obj.kind].defaultColor;
        const label = String(it.index + 1);
        const pick = (e: React.PointerEvent) => {
          e.stopPropagation();
          const st = useEditor.getState();
          st.setSel([it.anim.id]);
          st.setRightTab('anims');
        };
        if (it.anim.kind === 'move') {
          const style = it.anim.style;
          let heights: number[] | undefined;
          if (obj.kind === 'ball' && (style === 'throw' || style === 'bounce') && it.path) {
            heights = Array.from({ length: 13 }, (_, i) => it.path!((it.duration * i) / 12).y);
          }
          return (
            <group key={it.anim.id}>
              <PathMark
                x0={it.from.x}
                z0={it.from.z}
                x1={it.end.x}
                z1={it.end.z}
                color={color}
                radius={Math.max(0.15, CATALOG_BY_KIND[obj.kind].radius)}
                selected={chosen}
                heights={heights}
                onEndDown={(e) => onPathEndDown(it.anim.id, e)}
              />
              <AnimBadge x={it.end.x} z={it.end.z} y={0.05} label={label} selected={chosen} onPointerDown={pick} />
            </group>
          );
        }
        const tag = it.anim.kind === 'fall' ? `${label} 넘어짐` : it.anim.kind === 'appear' ? `${label} 나타남` : `${label} 사라짐`;
        return (
          <AnimBadge
            key={it.anim.id}
            x={it.from.x + 0.35}
            z={it.from.z - 0.35}
            y={CATALOG_BY_KIND[obj.kind].height + 0.1}
            label={tag}
            selected={chosen}
            onPointerDown={pick}
          />
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
        if (!obj || !p) return null;
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

/** 재생: 지금 장면의 애니메이션을 처음부터 끝까지. all이면 다음 장면으로 이어 간다. */
function PlaybackScene({ activity }: { activity: Activity }) {
  const playing = useEditor((s) => s.playing)!;
  const timeline = useMemo(() => buildTimeline(activity, playing.scene), [activity, playing.scene]);
  const scene = activity.scenes[playing.scene];
  const start = useRef<number | null>(null);
  const [t, setT] = useState(0);
  const HOLD = 0.8; // 끝난 모습을 잠깐 보여 준다

  useFrame(({ clock }) => {
    if (start.current === null) start.current = clock.elapsedTime;
    const now = clock.elapsedTime - start.current;
    if (now < timeline.duration + HOLD) {
      setT(Math.min(now, timeline.duration));
      return;
    }
    start.current = null;
    const st = useEditor.getState();
    if (playing.all && playing.scene + 1 < activity.scenes.length) st.play(playing.scene + 1, true);
    else st.stop();
  });

  return (
    <>
      <Field field={activity.field} />
      <Items activity={activity} timeline={timeline} t={t} />
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

// ── 누르기 처리 ─────────────────────────────────────────

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

  // 이동 경로 도구(물건을 아직 안 골랐을 때): 물건을 눌러 도착점까지 끌어 놓는다
  if (st.tool.t === 'path' && !st.tool.ids) {
    if (!isObj) return;
    e.stopPropagation();
    const ends = buildTimeline(st.activity, st.sceneIdx).endPoses;
    const from = ends[id];
    if (!from) return;
    startDrag(
      e.nativeEvent,
      (p) => useEditor.getState().setDraft({ t: 'path', x1: from.x, z1: from.z, x2: p[0], z2: p[1] }),
      (moved, p) => {
        const now = useEditor.getState();
        now.setDraft(null);
        if (!moved || !p || Math.hypot(p[0] - from.x, p[1] - from.z) < 0.2) return;
        const res = addMoves(now.activity, now.sceneIdx, [id], { x: p[0], z: p[1] });
        now.commit(res.activity);
        now.setSel(res.ids);
        now.setRightTab('anims');
      },
    );
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

/** 도착점 원을 끌어 이동 도착점을 옮긴다. */
function onPathEndDown(animId: string, e: ThreeEvent<PointerEvent>) {
  if (e.button !== 0) return;
  const st = useEditor.getState();
  if (st.playing || st.tool.t !== 'select') return;
  e.stopPropagation();
  st.setSel([animId]);
  st.setRightTab('anims');
  st.beginGesture();
  const base = st.activity;
  startDrag(
    e.nativeEvent,
    (p) => {
      const now = useEditor.getState();
      now.preview(updateAnim(base, now.sceneIdx, animId, { to: { x: p[0], z: p[1] } }));
    },
    () => useEditor.getState().endGesture(),
  );
}
