import { useMemo } from 'react';
import * as THREE from 'three';
import type { ObjectKind } from '../../model/activity';
import { CATALOG_BY_KIND } from '../../model/catalog';
import { SelectRing } from './Kid';

// 장비 저폴리 모델. 기준점은 바닥 가운데(y=0).

interface Props {
  kind: Exclude<ObjectKind, 'kid'>;
  color: string;
  selected?: boolean;
  tilt?: number; // 넘어짐 각도(라디안), 콘·컵용
}

function useMat(color: string) {
  return useMemo(() => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.7 }), [color]);
}

const WHITE = '#f4f4f0';

export function Equipment({ kind, color, selected, tilt = 0 }: Props) {
  const m = useMat(color);
  const white = useMat(WHITE);
  const r = CATALOG_BY_KIND[kind].radius;

  let body: JSX.Element;
  switch (kind) {
    case 'cone':
      body = (
        <>
          <mesh material={m} position={[0, 0.16, 0]} castShadow>
            <coneGeometry args={[0.1, 0.3, 8]} />
          </mesh>
          <mesh material={white} position={[0, 0.16, 0]}>
            <cylinderGeometry args={[0.058, 0.07, 0.05, 8]} />
          </mesh>
          <mesh material={m} position={[0, 0.01, 0]} castShadow>
            <boxGeometry args={[0.24, 0.02, 0.24]} />
          </mesh>
        </>
      );
      break;
    case 'disc':
      body = (
        <mesh material={m} position={[0, 0.025, 0]} castShadow>
          <cylinderGeometry args={[0.03, 0.1, 0.05, 10, 1, true]} />
        </mesh>
      );
      break;
    case 'ball':
      body = (
        <mesh material={m} position={[0, 0.11, 0]} castShadow>
          <icosahedronGeometry args={[0.11, 1]} />
        </mesh>
      );
      break;
    case 'hoop':
      body = (
        <mesh material={m} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
          <torusGeometry args={[0.4, 0.015, 4, 24]} />
        </mesh>
      );
      break;
    case 'bib':
      body = (
        <mesh material={m} position={[0, 0.02, 0]} castShadow>
          <boxGeometry args={[0.36, 0.03, 0.4]} />
        </mesh>
      );
      break;
    case 'beanbag':
      body = (
        <mesh material={m} position={[0, 0.02, 0]} scale={[1, 0.4, 1]} castShadow>
          <dodecahedronGeometry args={[0.07, 0]} />
        </mesh>
      );
      break;
    case 'cup':
      body = (
        <mesh material={m} position={[0, 0.06, 0]} castShadow>
          <cylinderGeometry args={[0.04, 0.05, 0.12, 8]} />
        </mesh>
      );
      break;
    case 'bell':
      body = (
        <>
          <mesh material={white} position={[0, 0.02, 0]} castShadow>
            <cylinderGeometry args={[0.1, 0.1, 0.04, 10]} />
          </mesh>
          <mesh material={m} position={[0, 0.04, 0]} castShadow>
            <sphereGeometry args={[0.08, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>
          <mesh material={m} position={[0, 0.13, 0]}>
            <sphereGeometry args={[0.02, 6, 4]} />
          </mesh>
        </>
      );
      break;
    case 'basket':
      body = (
        <mesh material={m} position={[0, 0.125, 0]} castShadow>
          <cylinderGeometry args={[0.2, 0.15, 0.25, 10, 1, true]} />
        </mesh>
      );
      break;
    case 'goal':
      body = <Goal material={white} />;
      break;
    case 'desk':
      body = (
        <>
          <mesh material={m} position={[0, 0.69, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.2, 0.03, 0.6]} />
          </mesh>
          {[
            [-0.55, -0.25],
            [0.55, -0.25],
            [-0.55, 0.25],
            [0.55, 0.25],
          ].map(([x, z]) => (
            <mesh key={`${x}${z}`} position={[x, 0.34, z]} castShadow>
              <cylinderGeometry args={[0.02, 0.02, 0.68, 5]} />
              <meshStandardMaterial color="#8a8f98" flatShading />
            </mesh>
          ))}
        </>
      );
      break;
  }

  return (
    <group>
      {/* 넘어질 때는 앞쪽(+z) 바닥 모서리를 축으로 돈다 */}
      <group position={[0, 0, r]} rotation={[tilt, 0, 0]}>
        <group position={[0, 0, -r]}>{body}</group>
      </group>
      {selected && <SelectRing radius={r + 0.08} />}
    </group>
  );
}

// 미니 골대 1.8m × 1.0m, 앞쪽(+z)이 열린 쪽.
function Goal({ material }: { material: THREE.Material }) {
  const w = 1.8;
  const h = 1.0;
  const d = 0.7;
  const bar = 0.04;
  const net = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.25, side: THREE.DoubleSide }),
    [],
  );
  return (
    <group>
      {[-w / 2, w / 2].map((x) => (
        <mesh key={x} material={material} position={[x, h / 2, d / 2]} castShadow>
          <cylinderGeometry args={[bar, bar, h, 6]} />
        </mesh>
      ))}
      <mesh material={material} position={[0, h, d / 2]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[bar, bar, w, 6]} />
      </mesh>
      <mesh material={net} position={[0, h / 2, -d / 2 + 0.35]} rotation={[0.35, 0, 0]}>
        <planeGeometry args={[w, h * 1.05]} />
      </mesh>
    </group>
  );
}
