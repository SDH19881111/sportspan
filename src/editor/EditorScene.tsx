import { useMemo, useRef, useState } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { Activity } from '../model/activity';
import { colorOf } from '../model/activity';
import { CATALOG_BY_KIND, viewScale } from '../model/catalog';
import { addBubble, addMoves, expandGroups, isLocked, moveItems, moveVia, updateAnim } from '../model/ops';
import { playSound } from '../audio/sfx';
import { buildTimeline, type Timeline } from '../motion/timeline';
import { BoardItem } from '../scene/BoardItem';
import { Field } from '../scene/Field';
import { AnimBadge, ArrowMark, BubbleTag, HighlightRing, PathMark } from '../scene/Marks';
import { gridSnap, Interaction, snapPoint, startDrag } from './Interaction';
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
  const scrubT = useEditor((s) => s.scrubT);
  const timeline = useMemo(() => buildTimeline(activity, sceneIdx), [activity, sceneIdx]);

  if (playing) return <PlaybackScene key={`${playing.scene}-${playing.run}`} activity={activity} />;

  // 되감기 중이면 그 시각의 모습, 아니면 장면 시작 모습(표시는 편집하기 쉽게 모두 보인다)
  const t = scrubT ?? BEFORE_START;
  return (
    <>
      <Interaction />
      <Field field={activity.field} selectedIds={sel} onItemDown={onItemDown} />
      <GridOverlay activity={activity} />
      <Items activity={activity} timeline={timeline} t={t} sel={sel} interactive />
      {scrubT === null && <AnimMarks activity={activity} timeline={timeline} sel={sel} />}
      <SceneMarks
        activity={activity}
        sceneIdx={sceneIdx}
        timeline={timeline}
        t={t}
        sel={sel}
        showAll={scrubT === null}
        interactive
      />
      {draft && draft.t === 'arrow' && <ArrowMark {...draft} />}
      {draft && draft.t === 'path' && (
        <PathMark
          points={[
            { x: draft.x1, z: draft.z1 },
            { x: draft.x2, z: draft.z2 },
          ]}
          color="#2563eb"
          radius={0.25}
          selected
        />
      )}
      {draft && (draft.t === 'zone' || draft.t === 'line') && <DraftShape {...draft} t={draft.t} />}
    </>
  );
}

/** 바닥 격자: 칸마다 가는 선, 5m마다 조금 진한 선 */
function GridOverlay({ activity }: { activity: Activity }) {
  const grid = useEditor((s) => s.grid);
  const geom = useMemo(() => {
    if (!grid.show) return null;
    const hx = activity.field.width / 2 + 3;
    const hz = activity.field.depth / 2 + 3;
    const minor: number[] = [];
    const major: number[] = [];
    const n = (h: number) => Math.floor(h / grid.size);
    for (let i = -n(hx); i <= n(hx); i++) {
      const x = i * grid.size;
      const arr = Math.abs(x % 5) < 1e-6 ? major : minor;
      arr.push(x, 0, -hz, x, 0, hz);
    }
    for (let i = -n(hz); i <= n(hz); i++) {
      const z = i * grid.size;
      const arr = Math.abs(z % 5) < 1e-6 ? major : minor;
      arr.push(-hx, 0, z, hx, 0, z);
    }
    const make = (pts: number[]) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      return g;
    };
    return { minor: make(minor), major: make(major) };
  }, [grid.show, grid.size, activity.field.width, activity.field.depth]);
  if (!geom) return null;
  return (
    <group position={[0, 0.006, 0]}>
      <lineSegments geometry={geom.minor}>
        <lineBasicMaterial color="#ffffff" transparent opacity={0.18} />
      </lineSegments>
      <lineSegments geometry={geom.major}>
        <lineBasicMaterial color="#ffffff" transparent opacity={0.4} />
      </lineSegments>
    </group>
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

/** 애니메이션 경로와 번호표. 번호를 누르면 그 애니메이션을 고르고, 도착점·꺾는 점을 끌면 옮겨진다. */
function AnimMarks({ activity, timeline, sel }: { activity: Activity; timeline: Timeline; sel: string[] }) {
  const objs = new Map(activity.objects.map((o) => [o.id, o]));
  const scene = activity.scenes[useEditor.getState().sceneIdx];
  return (
    <>
      {timeline.items.map((it) => {
        if (it.carried) return null;
        const an = it.anim;
        const label = String(it.index + 1);
        const chosen = sel.includes(an.id) || (!!an.objId && sel.includes(an.objId));
        const pick = (e: React.PointerEvent) => {
          e.stopPropagation();
          const st = useEditor.getState();
          const additive = e.shiftKey || e.ctrlKey || e.metaKey;
          st.setSel(additive ? [...new Set([...st.sel, an.id])] : [an.id]);
          st.setRightTab('anims');
        };

        if (an.kind === 'show') {
          const ar = scene.arrows.find((v) => v.id === an.markId);
          const bub = scene.bubbles.find((v) => v.id === an.markId);
          const host = bub?.objId ? scene.poses[bub.objId] : undefined;
          const at = ar ? { x: ar.x2, z: ar.z2, y: 0.05 } : host ? { x: host.x - 0.4, z: host.z, y: 1.9 } : null;
          if (!at) return null;
          return <AnimBadge key={an.id} {...at} label={`${label} 나타남`} selected={chosen} onPointerDown={pick} />;
        }
        if (an.kind === 'sound' || !it.from || !it.end) return null;
        const obj = an.objId ? objs.get(an.objId) : undefined;
        if (!obj) return null;
        const color = colorOf(activity, obj) ?? CATALOG_BY_KIND[obj.kind].defaultColor;

        if (an.kind === 'move') {
          const flying = obj.kind === 'ball' && (an.style === 'throw' || an.style === 'bounce');
          const points = [{ x: it.from.x, z: it.from.z }, ...(flying ? [] : an.via ?? []), { x: it.end.x, z: it.end.z }];
          const air =
            flying && it.path ? Array.from({ length: 13 }, (_, i) => it.path!((it.duration * i) / 12)) : undefined;
          const carry = an.carry ? ' +공' : '';
          return (
            <group key={an.id}>
              <PathMark
                points={points}
                color={color}
                radius={Math.max(0.15, CATALOG_BY_KIND[obj.kind].radius * viewScale(obj.kind, activity.field.kind))}
                selected={chosen}
                air={air}
                onEndDown={(e) => onPathEndDown(an.id, e)}
                onViaDown={(i, e) => onViaDown(an.id, i, e)}
              />
              <AnimBadge x={it.end.x} z={it.end.z} y={0.05} label={label + carry} selected={chosen} onPointerDown={pick} />
            </group>
          );
        }
        const word = { fall: '넘어짐', appear: '나타남', disappear: '사라짐', highlight: '강조' }[an.kind];
        return (
          <AnimBadge
            key={an.id}
            x={it.from.x + 0.35}
            z={it.from.z - 0.35}
            y={CATALOG_BY_KIND[obj.kind].height * viewScale(obj.kind, activity.field.kind) + 0.1}
            label={`${label} ${word}`}
            selected={chosen}
            onPointerDown={pick}
          />
        );
      })}
    </>
  );
}

/**
 * 장면 표시: 강조 원, 화살표, 말풍선. 말풍선은 붙은 물건을 따라다닌다.
 * showAll이면(편집 화면) 나타나기 애니메이션과 상관없이 모두 보인다.
 */
function SceneMarks(props: {
  activity: Activity;
  sceneIdx: number;
  timeline: Timeline;
  t: number;
  sel?: string[];
  showAll?: boolean;
  interactive?: boolean;
}) {
  const { activity, sceneIdx, timeline, t, sel = [], showAll, interactive } = props;
  const scene = activity.scenes[sceneIdx];
  const visible = (id: string) => showAll || timeline.markVisible(id, t);
  const highlights = showAll ? scene.highlights : timeline.highlightsAt(t);
  return (
    <>
      {highlights.map((id) => {
        const obj = activity.objects.find((o) => o.id === id);
        const st = timeline.at(id, t);
        if (!obj || !st || st.hidden) return null;
        return <HighlightRing key={id} x={st.x} z={st.z} radius={CATALOG_BY_KIND[obj.kind].radius * viewScale(obj.kind, activity.field.kind) + 0.2} />;
      })}
      {scene.arrows.filter((ar) => visible(ar.id)).map((ar) => (
        <ArrowMark
          key={ar.id}
          {...ar}
          selected={sel.includes(ar.id)}
          onPointerDown={interactive ? (e) => onItemDown(ar.id, e) : undefined}
        />
      ))}
      {scene.bubbles.filter((b) => visible(b.id)).map((b) => {
        const obj = b.objId ? activity.objects.find((o) => o.id === b.objId) : undefined;
        const st = b.objId ? timeline.at(b.objId, t) : null;
        if (!obj || !st || (st.hidden && !showAll)) return null;
        return (
          <BubbleTag
            key={b.id}
            x={st.x}
            z={st.z}
            height={CATALOG_BY_KIND[obj.kind].height * viewScale(obj.kind, activity.field.kind) + st.y}
            text={b.text}
            selected={sel.includes(b.id)}
            onPointerDown={
              interactive
                ? (e) => {
                    e.stopPropagation();
                    useEditor.getState().setSel([b.id]);
                    useEditor.getState().setRightTab('props');
                  }
                : undefined
            }
          />
        );
      })}
    </>
  );
}

/** 재생: 지금 장면의 애니메이션을 (from초부터) 끝까지. all이면 다음 장면으로 이어 간다. */
function PlaybackScene({ activity }: { activity: Activity }) {
  const playing = useEditor((s) => s.playing)!;
  const timeline = useMemo(() => buildTimeline(activity, playing.scene), [activity, playing.scene]);
  const start = useRef<number | null>(null);
  const last = useRef(playing.from - 1e-6);
  const [t, setT] = useState(playing.from);
  const HOLD = 0.8; // 끝난 모습을 잠깐 보여 준다

  useFrame(({ clock }) => {
    if (start.current === null) start.current = clock.elapsedTime;
    const st = useEditor.getState();
    const now = playing.from + (clock.elapsedTime - start.current) * st.playRate;
    // 지나간 효과음 울리기
    for (const snd of timeline.sounds) if (snd.at > last.current && snd.at <= now) playSound(snd.sound);
    last.current = now;
    if (now < timeline.duration + HOLD) {
      const shown = Math.min(now, timeline.duration);
      setT(shown);
      st.setPlayT(shown);
      return;
    }
    start.current = null;
    if (playing.all && playing.scene + 1 < activity.scenes.length) st.play(playing.scene + 1, true);
    else st.stop();
  });

  return <ShowScene activity={activity} sceneIdx={playing.scene} timeline={timeline} t={t} />;
}

/** 손댈 수 없는 장면 모습(재생·발표 화면): t초의 물건 자리와 표시 */
export function ShowScene(props: { activity: Activity; sceneIdx: number; timeline: Timeline; t: number }) {
  const { activity, sceneIdx, timeline, t } = props;
  return (
    <>
      <Field field={activity.field} />
      <Items activity={activity} timeline={timeline} t={t} />
      <SceneMarks activity={activity} sceneIdx={sceneIdx} timeline={timeline} t={t} />
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
    st.setRightTab('props'); // 글자 칸이 있는 속성 탭으로(애니메이션 탭에 있으면 쓸 곳이 안 보인다)
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
      (raw) => {
        const p = snapPoint(raw);
        useEditor.getState().setDraft({ t: 'path', x1: from.x, z1: from.z, x2: p[0], z2: p[1] });
      },
      (moved, raw) => {
        const now = useEditor.getState();
        now.setDraft(null);
        if (!moved || !raw) return;
        const p = snapPoint(raw);
        if (Math.hypot(p[0] - from.x, p[1] - from.z) < 0.2) return;
        const res = addMoves(now.activity, now.sceneIdx, [id], { x: p[0], z: p[1] });
        now.commit(res.activity);
        // 도구는 켜 둔 채로: 여러 학생의 이동을 이어서 그릴 수 있게(다 했으면 Esc·고르기).
        // 켜져 있다는 것은 화면 위 안내와 눌린 도구 버튼으로 늘 보인다. 같은 학생을 다시 끌면
        // 지난 이동이 끝난 자리에서 이어 간다.
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
  st.setRightTab('props'); // 물건을 고르면 바로 그 속성을(애니메이션 탭에 머물러 있지 않게)
  if (!clicked.every((v) => ids.includes(v))) return;

  const moving = ids.filter((v) => !isLocked(st.activity, v));
  const base = st.activity;
  const anchor = anchorOf(base, st.sceneIdx, id);
  st.beginGesture();
  startDrag(
    native,
    (p, s) => {
      const now = useEditor.getState();
      // 자석: 누른 물건(구역은 왼쪽 위 모서리)이 격자 칸에 오도록 옮기는 양을 맞춘다
      let dx = p[0] - s[0];
      let dz = p[1] - s[1];
      if (anchor) {
        dx = gridSnap(anchor[0] + dx) - anchor[0];
        dz = gridSnap(anchor[1] + dz) - anchor[1];
      }
      now.preview(moveItems(base, now.sceneIdx, moving, dx, dz));
    },
    (moved) => {
      useEditor.getState().endGesture();
      // 여러 개를 골라 둔 상태에서 끌지 않고 누르기만 하면 그것(묶음)만 고른다.
      if (!moved && !additive && already && cur.length > clicked.length) useEditor.getState().setSel(clicked);
    },
  );
}

/** 자석으로 맞출 기준점: 물건은 서 있는 자리, 구역은 왼쪽 위 모서리, 선·화살표는 시작점 */
function anchorOf(a: Activity, sceneIdx: number, id: string): [number, number] | null {
  const p = a.scenes[sceneIdx].poses[id];
  if (p && a.objects.some((o) => o.id === id)) return [p.x, p.z];
  const z = a.field.zones.find((v) => v.id === id);
  if (z) return [z.x - z.w / 2, z.z - z.d / 2];
  const l = a.field.lines.find((v) => v.id === id) ?? a.scenes[sceneIdx].arrows.find((v) => v.id === id);
  if (l) return [l.x1, l.z1];
  return null;
}

/** 꺾는 점 손잡이를 끌어 옮긴다. */
function onViaDown(animId: string, index: number, e: ThreeEvent<PointerEvent>) {
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
      const [x, z] = snapPoint(p);
      now.preview(moveVia(base, now.sceneIdx, animId, index, { x, z }));
    },
    () => useEditor.getState().endGesture(),
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
      const [x, z] = snapPoint(p);
      now.preview(updateAnim(base, now.sceneIdx, animId, { to: { x, z } }));
    },
    () => useEditor.getState().endGesture(),
  );
}
