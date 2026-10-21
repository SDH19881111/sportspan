import { useEffect, useRef, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { Field as FieldData } from '../model/activity';

export type CameraView = 'top' | 'angle' | 'close';

export function cameraSpot(view: CameraView, field: FieldData) {
  const span = Math.max(field.width, field.depth * 1.6);
  switch (view) {
    case 'top':
      return { pos: new THREE.Vector3(0, span * 0.95, 0.001), target: new THREE.Vector3(0, 0, 0) };
    case 'angle':
      return {
        pos: new THREE.Vector3(0, span * 0.55, field.depth * 0.5 + span * 0.45),
        target: new THREE.Vector3(0, 0, field.depth * 0.05),
      };
    case 'close':
      return { pos: new THREE.Vector3(0, 3.2, field.depth * 0.25 + 4), target: new THREE.Vector3(0, 0.6, 0) };
  }
}

// 카메라 버튼을 누르면 그 자리로 부드럽게 옮긴다. 옮기는 중이 아니면 손으로 돌려 볼 수 있다.
function CameraRig({ view, field, nonce }: { view: CameraView; field: FieldData; nonce: number }) {
  const { camera, controls } = useThree();
  const goal = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);

  useEffect(() => {
    goal.current = cameraSpot(view, field);
  }, [view, field.width, field.depth, nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, dt) => {
    const g = goal.current;
    const c = controls as unknown as OrbitControlsImpl | null;
    if (!g || !c) return;
    const k = 1 - Math.exp(-dt * 5);
    camera.position.lerp(g.pos, k);
    c.target.lerp(g.target, k);
    c.update();
    if (camera.position.distanceTo(g.pos) < 0.02 && c.target.distanceTo(g.target) < 0.02) goal.current = null;
  });
  return null;
}

interface Props {
  field: FieldData;
  view: CameraView;
  viewNonce: number;
  children: ReactNode;
  onPointerMissed?: () => void;
  controlsEnabled?: boolean;
}

// controlsEnabled를 주지 않으면 편집기(Interaction)가 카메라 조작을 직접 켜고 끈다.
export function Stage({ field, view, viewNonce, children, onPointerMissed, controlsEnabled }: Props) {
  const start = cameraSpot(view, field);
  const span = Math.max(field.width, field.depth);
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: start.pos.toArray(), fov: 40, near: 0.1, far: 400 }}
      onPointerMissed={onPointerMissed}
    >
      <color attach="background" args={['#cfe3f2']} />
      <hemisphereLight args={['#ffffff', '#b59f80', 0.9]} />
      <directionalLight
        position={[span * 0.3, span * 0.8, span * 0.4]}
        intensity={1.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-span * 0.7}
        shadow-camera-right={span * 0.7}
        shadow-camera-top={span * 0.7}
        shadow-camera-bottom={-span * 0.7}
        shadow-camera-far={span * 3}
        shadow-bias={-0.0005}
      />
      <OrbitControls
        makeDefault
        enabled={controlsEnabled ?? true}
        maxPolarAngle={Math.PI / 2.15}
        minDistance={2}
        maxDistance={span * 2.5}
        target={start.target}
      />
      <CameraRig view={view} field={field} nonce={viewNonce} />
      {children}
    </Canvas>
  );
}
