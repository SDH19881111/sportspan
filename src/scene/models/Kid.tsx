import { useMemo } from 'react';
import * as THREE from 'three';

// 저폴리 아이: 각진 면(flatShading)으로 둥글둥글하게. 키 약 1.35m(초등 중학년).
// 몸 기준점은 발바닥 가운데(y=0), 앞쪽은 +z.

const SKIN = '#f2c9a0';
const HAIR = '#3b2a20';
const PANTS = '#2f3a56';
const SHOE = '#f4f4f0';

export interface KidPoseState {
  stride: number; // 다리·팔 흔들기 위상(라디안)
  swing: number; // 흔들기 크기 0~1 (서 있으면 0)
  bob: number; // 위아래 들썩임(m)
}

interface Props {
  shirt: string;
  pose?: KidPoseState;
  selected?: boolean;
}

function mat(color: string) {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85 });
}

export function Kid({ shirt, pose, selected }: Props) {
  const m = useMemo(
    () => ({ skin: mat(SKIN), hair: mat(HAIR), pants: mat(PANTS), shoe: mat(SHOE), shirt: mat(shirt) }),
    [shirt],
  );
  const swing = (pose?.swing ?? 0) * 0.7;
  const s = Math.sin(pose?.stride ?? 0) * swing;
  const bob = pose?.bob ?? 0;

  return (
    <group position={[0, bob, 0]}>
      {/* 발밑 팀 색 원: 위에서 내려다볼 때도 팀이 바로 보이게 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012 - bob, 0]}>
        <circleGeometry args={[0.3, 16]} />
        <meshBasicMaterial color={shirt} transparent opacity={0.85} />
      </mesh>
      {/* 다리: 엉덩이(y=0.62)를 축으로 흔든다 */}
      {[-1, 1].map((side) => (
        <group key={side} position={[0.09 * side, 0.62, 0]} rotation={[s * side, 0, 0]}>
          <mesh material={m.pants} position={[0, -0.28, 0]} castShadow>
            <cylinderGeometry args={[0.07, 0.06, 0.56, 6]} />
          </mesh>
          <mesh material={m.shoe} position={[0, -0.58, 0.04]} castShadow>
            <boxGeometry args={[0.12, 0.08, 0.2]} />
          </mesh>
        </group>
      ))}
      {/* 몸통(팀 색 옷) */}
      <mesh material={m.shirt} position={[0, 0.84, 0]} castShadow>
        <cylinderGeometry args={[0.16, 0.19, 0.46, 7]} />
      </mesh>
      {/* 팔: 어깨(y=1.02)를 축으로 다리와 반대로 흔든다 */}
      {[-1, 1].map((side) => (
        <group key={side} position={[0.22 * side, 1.02, 0]} rotation={[-s * side, 0, 0.12 * side]}>
          <mesh material={m.shirt} position={[0, -0.12, 0]} castShadow>
            <cylinderGeometry args={[0.055, 0.05, 0.24, 5]} />
          </mesh>
          <mesh material={m.skin} position={[0, -0.32, 0]} castShadow>
            <cylinderGeometry args={[0.045, 0.04, 0.18, 5]} />
          </mesh>
        </group>
      ))}
      {/* 머리 */}
      <mesh material={m.skin} position={[0, 1.2, 0]} castShadow>
        <icosahedronGeometry args={[0.16, 1]} />
      </mesh>
      <mesh material={m.hair} position={[0, 1.25, -0.02]} scale={[1.05, 0.8, 1.05]} castShadow>
        <icosahedronGeometry args={[0.16, 1]} />
      </mesh>
      {/* 눈: 어느 쪽을 보는지 알 수 있게 */}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[0.055 * side, 1.21, 0.145]}>
          <sphereGeometry args={[0.022, 6, 4]} />
          <meshBasicMaterial color="#1b1b1f" />
        </mesh>
      ))}
      {selected && <SelectRing radius={0.32} />}
    </group>
  );
}

export function SelectRing({ radius }: { radius: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
      <ringGeometry args={[radius, radius + 0.05, 32]} />
      <meshBasicMaterial color="#2563eb" transparent opacity={0.9} />
    </mesh>
  );
}
