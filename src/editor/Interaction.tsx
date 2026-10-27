import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { addArrow, addLine, addMoves, addObject, addZone, expandGroups, faceCenter } from '../model/ops';
import { noteRightPress } from './ContextMenu';
import { useEditor } from './store';

// 화면 좌표 → 바닥(y=0) 좌표. 캔버스 밖으로 끌어도 계속 계산되도록 window 이벤트로 끈다.
export const floorApi = {
  floorAt: (_cx: number, _cy: number): [number, number] | null => null,
  setOrbit: (_on: boolean) => {},
  /** 바닥 위 점 → 화면 좌표(끌어서 고르기용) */
  project: (_x: number, _y: number, _z: number): [number, number] | null => null,
  /** 카메라를 바닥과 나란히 옮긴다(오른쪽 +, 앞쪽 +) */
  pan: (_right: number, _forward: number) => {},
};

// 손으로 누른 자리는 5cm 단위로
const fine = (v: number) => Math.round(v * 20) / 20;
const CLICK_PX = 6;

// Alt를 누르고 있는 동안은 자석을 잠깐 끈다(격자 사이에 놓고 싶을 때).
// Shift를 누르고 구역을 그리면 가로·세로가 같게(정원·정사각형).
let altDown = false;
let shiftDown = false;
if (typeof window !== 'undefined') {
  const keys = (e: KeyboardEvent | PointerEvent) => {
    altDown = e.altKey;
    shiftDown = e.shiftKey;
  };
  window.addEventListener('keydown', keys);
  window.addEventListener('keyup', keys);
  window.addEventListener('pointermove', keys);
  window.addEventListener('blur', () => (altDown = shiftDown = false));
}

/** 구역 그리기: Shift면 짧은 쪽을 긴 쪽에 맞춰 정사각 상자로(누른 점에서 끄는 방향으로) */
function squareUp(x1: number, z1: number, x2: number, z2: number): [number, number] {
  if (!shiftDown) return [x2, z2];
  const side = Math.max(Math.abs(x2 - x1), Math.abs(z2 - z1));
  return [x1 + Math.sign(x2 - x1 || 1) * side, z1 + Math.sign(z2 - z1 || 1) * side];
}

/** 자석이 켜져 있으면 격자 칸에 맞춘다 */
export function gridSnap(v: number): number {
  const g = useEditor.getState().grid;
  if (!g.snap || altDown) return v;
  return Math.round(Math.round(v / g.size) * g.size * 1000) / 1000;
}

export function snapPoint(p: [number, number]): [number, number] {
  return [gridSnap(p[0]), gridSnap(p[1])];
}

/** 누른 뒤 손을 뗄 때까지 바닥 좌표를 넘겨준다. 움직였는지(클릭인지)도 알려 준다. */
export function startDrag(
  ev: { clientX: number; clientY: number; pointerId: number },
  onMove: (p: [number, number], start: [number, number]) => void,
  onEnd: (moved: boolean, p: [number, number] | null) => void,
) {
  const start = floorApi.floorAt(ev.clientX, ev.clientY);
  if (!start) return;
  const sx = ev.clientX;
  const sy = ev.clientY;
  let moved = false;
  let last: [number, number] | null = start;
  floorApi.setOrbit(false);
  useEditor.getState().setDragging(true);

  const move = (e: PointerEvent) => {
    if (e.pointerId !== ev.pointerId) return;
    if (!moved && Math.hypot(e.clientX - sx, e.clientY - sy) < CLICK_PX) return;
    moved = true;
    const p = floorApi.floorAt(e.clientX, e.clientY);
    if (!p) return;
    last = p;
    onMove(p, start);
  };
  const up = (e: PointerEvent) => {
    if (e.pointerId !== ev.pointerId) return;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    floorApi.setOrbit(true);
    useEditor.getState().setDragging(false);
    onEnd(moved, last);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const hit = new THREE.Vector3();

export function Interaction() {
  const { camera, gl, controls } = useThree();
  const field = useEditor((s) => s.activity.field);
  const tool = useEditor((s) => s.tool);

  useEffect(() => {
    floorApi.floorAt = (cx, cy) => {
      const r = gl.domElement.getBoundingClientRect();
      ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      if (!raycaster.ray.intersectPlane(plane, hit)) return null;
      return [fine(hit.x), fine(hit.z)];
    };
    floorApi.project = (x, y, z) => {
      const r = gl.domElement.getBoundingClientRect();
      const v = new THREE.Vector3(x, y, z).project(camera);
      if (v.z > 1) return null; // 카메라 뒤
      return [r.left + ((v.x + 1) / 2) * r.width, r.top + ((1 - v.y) / 2) * r.height];
    };
  }, [camera, gl]);

  useEffect(() => {
    const c = controls as unknown as OrbitControlsImpl | null;
    floorApi.pan = (right, forward) => {
      if (!c) return;
      const dist = camera.position.distanceTo(c.target);
      const step = Math.max(0.3, dist * 0.06);
      const fwd = new THREE.Vector3();
      camera.getWorldDirection(fwd);
      fwd.y = 0;
      if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1); // 바로 위에서 볼 때는 화면 위쪽이 앞
      fwd.normalize();
      const rgt = new THREE.Vector3(-fwd.z, 0, fwd.x);
      const d = rgt.multiplyScalar(right * step).add(fwd.multiplyScalar(forward * step));
      camera.position.add(d);
      c.target.add(d);
      c.update();
    };
  }, [camera, controls]);

  useEffect(() => {
    const c = controls as unknown as OrbitControlsImpl | null;
    floorApi.setOrbit = (on) => {
      if (c) c.enabled = on && useEditor.getState().tool.t === 'select';
    };
    if (c) c.enabled = tool.t === 'select';
  }, [controls, tool]);

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button === 2) {
      noteRightPress({ floor: floorApi.floorAt(e.nativeEvent.clientX, e.nativeEvent.clientY) });
      return;
    }
    if (e.button !== 0) return;
    const st = useEditor.getState();
    const t = st.tool;
    const native = e.nativeEvent;

    if (t.t === 'place') {
      e.stopPropagation();
      const raw = floorApi.floorAt(native.clientX, native.clientY);
      if (!raw) return;
      const p = snapPoint(raw);
      const { activity, id } = addObject(
        st.activity,
        { kind: t.kind, ...(t.teamId ? { teamId: t.teamId } : {}) },
        { x: p[0], z: p[1], rot: t.kind === 'kid' ? faceCenter(st.activity, p[0], p[1]) : 0 },
      );
      st.commit(activity);
      st.setSel([id]);
      return;
    }

    if (t.t === 'path') {
      // 이동할 것을 먼저 골라 두었으면 누른 곳이 도착점
      if (!t.ids?.length) return;
      e.stopPropagation();
      const raw = floorApi.floorAt(native.clientX, native.clientY);
      if (!raw) return;
      const p = snapPoint(raw);
      const res = addMoves(st.activity, st.sceneIdx, t.ids, { x: p[0], z: p[1] }, 'click', {
        mode: t.mode,
        cell: st.grid.size,
      });
      st.commit(res.activity);
      st.setTool({ t: 'select' });
      st.setSel(res.ids);
      st.setRightTab('anims');
      return;
    }

    if (t.t === 'zone' || t.t === 'line' || t.t === 'arrow') {
      e.stopPropagation();
      const kind = t.t;
      startDrag(
        native,
        (p, s) => {
          const [x1, z1] = snapPoint(s);
          let [x2, z2] = snapPoint(p);
          if (kind === 'zone') [x2, z2] = squareUp(x1, z1, x2, z2);
          useEditor.getState().setDraft({ t: kind, x1, z1, x2, z2 });
        },
        (moved) => {
          const cur = useEditor.getState();
          const d = cur.draft;
          cur.setDraft(null);
          if (!moved || !d) return;
          const len = Math.hypot(d.x2 - d.x1, d.z2 - d.z1);
          if (len < 0.3) return;
          let res: { activity: typeof cur.activity; id: string };
          if (kind === 'zone') {
            res = addZone(cur.activity, {
              x: (d.x1 + d.x2) / 2,
              z: (d.z1 + d.z2) / 2,
              w: Math.abs(d.x2 - d.x1),
              d: Math.abs(d.z2 - d.z1),
              color: cur.zoneColor,
              ...(cur.zoneShape !== 'rect' ? { shape: cur.zoneShape } : {}),
            });
          } else if (kind === 'line') {
            res = addLine(cur.activity, { ...pick(d), color: cur.lineColor });
          } else {
            res = addArrow(cur.activity, cur.sceneIdx, pick(d));
          }
          cur.commit(res.activity);
          cur.setSel([res.id]);
        },
      );
      return;
    }

    if (t.t === 'select' && (native.ctrlKey || native.metaKey)) {
      // Ctrl을 누른 채 끌면 사각형 안의 것을 한꺼번에 고른다(Shift도 누르면 더한다)
      e.stopPropagation();
      startMarquee(native);
      return;
    }

    if (t.t === 'select') {
      // 빈 바닥을 클릭하면 선택 해제. 끌면 카메라가 돈다(OrbitControls).
      const sx = native.clientX;
      const sy = native.clientY;
      const up = (ev: PointerEvent) => {
        window.removeEventListener('pointerup', up);
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < CLICK_PX) useEditor.getState().setSel([]);
      };
      window.addEventListener('pointerup', up);
    }
  };

  const size = Math.max(field.width, field.depth) * 4;
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]} onPointerDown={onDown}>
        <planeGeometry args={[size, size]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {/* 하늘·벽 쪽을 눌렀을 때도 끌어서 고르기·선택 해제가 되도록 둘레를 감싸는 보이지 않는 공 */}
      <mesh onPointerDown={onSkyDown}>
        <sphereGeometry args={[size * 3, 16, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.BackSide} />
      </mesh>
    </>
  );
}

function onSkyDown(e: ThreeEvent<PointerEvent>) {
  if (e.button === 2) {
    noteRightPress({ floor: null });
    return;
  }
  if (e.button !== 0) return;
  const st = useEditor.getState();
  if (st.tool.t !== 'select') return;
  const native = e.nativeEvent;
  e.stopPropagation();
  if (native.ctrlKey || native.metaKey) {
    startMarquee(native);
    return;
  }
  const sx = native.clientX;
  const sy = native.clientY;
  const up = (ev: PointerEvent) => {
    window.removeEventListener('pointerup', up);
    if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < CLICK_PX) useEditor.getState().setSel([]);
  };
  window.addEventListener('pointerup', up);
}

function startMarquee(ev: PointerEvent) {
  const st = useEditor.getState();
  const sx = ev.clientX;
  const sy = ev.clientY;
  const additive = ev.shiftKey;
  floorApi.setOrbit(false);
  st.setMarquee({ x1: sx, y1: sy, x2: sx, y2: sy });

  const move = (e: PointerEvent) => {
    if (e.pointerId !== ev.pointerId) return;
    useEditor.getState().setMarquee({ x1: sx, y1: sy, x2: e.clientX, y2: e.clientY });
  };
  const up = (e: PointerEvent) => {
    if (e.pointerId !== ev.pointerId) return;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    floorApi.setOrbit(true);
    const now = useEditor.getState();
    now.setMarquee(null);
    const box = {
      l: Math.min(sx, e.clientX),
      r: Math.max(sx, e.clientX),
      t: Math.min(sy, e.clientY),
      b: Math.max(sy, e.clientY),
    };
    if (box.r - box.l < CLICK_PX && box.b - box.t < CLICK_PX) {
      if (!additive) now.setSel([]);
      return;
    }
    const inside = (x: number, y: number, z: number) => {
      const q = floorApi.project(x, y, z);
      return !!q && q[0] >= box.l && q[0] <= box.r && q[1] >= box.t && q[1] <= box.b;
    };
    const a = now.activity;
    const scene = a.scenes[now.sceneIdx];
    const hits: string[] = [];
    for (const o of a.objects) {
      const p = scene.poses[o.id];
      if (p && !o.locked && inside(p.x, 0.3, p.z)) hits.push(o.id);
    }
    for (const z of a.field.zones) if (!z.locked && inside(z.x, 0, z.z)) hits.push(z.id);
    for (const l of a.field.lines) if (!l.locked && inside((l.x1 + l.x2) / 2, 0, (l.z1 + l.z2) / 2)) hits.push(l.id);
    const ids = expandGroups(a, hits);
    now.setSel(additive ? [...new Set([...now.sel, ...ids])] : ids);
    if (ids.length) now.setRightTab('props');
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}

function pick(d: { x1: number; z1: number; x2: number; z2: number }) {
  return { x1: d.x1, z1: d.z1, x2: d.x2, z2: d.z2 };
}
