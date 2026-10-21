import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { addLine, addObject, addArrow, addZone } from '../model/ops';
import { useEditor } from './store';

// 화면 좌표 → 바닥(y=0) 좌표. 캔버스 밖으로 끌어도 계속 계산되도록 window 이벤트로 끈다.
export const floorApi = {
  floorAt: (_cx: number, _cy: number): [number, number] | null => null,
  setOrbit: (_on: boolean) => {},
};

// 5cm 격자에 맞춘다
const snap = (v: number) => Math.round(v * 20) / 20;
const CLICK_PX = 6;

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
      return [snap(hit.x), snap(hit.z)];
    };
  }, [camera, gl]);

  useEffect(() => {
    const c = controls as unknown as OrbitControlsImpl | null;
    floorApi.setOrbit = (on) => {
      if (c) c.enabled = on && useEditor.getState().tool.t === 'select';
    };
    if (c) c.enabled = tool.t === 'select';
  }, [controls, tool]);

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    const st = useEditor.getState();
    const t = st.tool;
    const native = e.nativeEvent;

    if (t.t === 'place') {
      e.stopPropagation();
      const p = floorApi.floorAt(native.clientX, native.clientY);
      if (!p) return;
      const { activity, id } = addObject(
        st.activity,
        { kind: t.kind, ...(t.teamId ? { teamId: t.teamId } : {}) },
        { x: p[0], z: p[1], rot: 0 },
      );
      st.commit(activity);
      st.setSel([id]);
      return;
    }

    if (t.t === 'zone' || t.t === 'line' || t.t === 'arrow') {
      e.stopPropagation();
      const kind = t.t;
      startDrag(
        native,
        (p, s) => useEditor.getState().setDraft({ t: kind, x1: s[0], z1: s[1], x2: p[0], z2: p[1] }),
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
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]} onPointerDown={onDown}>
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

function pick(d: { x1: number; z1: number; x2: number; z2: number }) {
  return { x1: d.x1, z1: d.z1, x2: d.x2, z2: d.z2 };
}
