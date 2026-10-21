import { useMemo } from 'react';
import { Html } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { Field as FieldData, FieldKind } from '../model/activity';

const FLOOR: Record<FieldKind, { floor: string; around: string; line: string }> = {
  gym: { floor: '#d8b27e', around: '#8f8576', line: '#ffffff' },
  playground: { floor: '#c9a47a', around: '#6f9a58', line: '#ffffff' },
  classroom: { floor: '#cdb79a', around: '#9aa0a8', line: '#ffffff' },
};

// 체육관 바닥 판자 무늬를 캔버스로 그린다(이미지 파일 없이).
function usePlankTexture(kind: FieldKind, width: number, depth: number) {
  return useMemo(() => {
    if (kind === 'playground') return null;
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const g = c.getContext('2d')!;
    const base = FLOOR[kind].floor;
    g.fillStyle = base;
    g.fillRect(0, 0, 512, 512);
    const rows = 8;
    for (let i = 0; i < rows; i++) {
      const y = (i * 512) / rows;
      g.fillStyle = i % 2 ? 'rgba(0,0,0,0.035)' : 'rgba(255,255,255,0.04)';
      g.fillRect(0, y, 512, 512 / rows);
      g.fillStyle = 'rgba(0,0,0,0.08)';
      g.fillRect(0, y, 512, 1.5);
      const off = (i * 197) % 512;
      g.fillRect(off, y, 1.5, 512 / rows);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(width / 4, depth / 4); // 판자 한 줄 0.5m
    return tex;
  }, [kind, width, depth]);
}

interface FieldProps {
  field: FieldData;
  selectedIds?: string[];
  onItemDown?: (id: string, e: ThreeEvent<PointerEvent>) => void;
}

export function Field({ field, selectedIds = [], onItemDown }: FieldProps) {
  const { kind, width, depth } = field;
  const colors = FLOOR[kind];
  const plank = usePlankTexture(kind, width, depth);
  const around = Math.max(width, depth) * 3;

  return (
    <group>
      {/* 바깥 땅 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[around, around]} />
        <meshStandardMaterial color={colors.around} roughness={1} />
      </mesh>
      {/* 경기장 바닥 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow name="floor">
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color={plank ? '#ffffff' : colors.floor} map={plank} roughness={0.9} />
      </mesh>
      {/* 경기장 테두리 */}
      <Strip x1={-width / 2} z1={-depth / 2} x2={width / 2} z2={-depth / 2} color={colors.line} y={0.003} />
      <Strip x1={-width / 2} z1={depth / 2} x2={width / 2} z2={depth / 2} color={colors.line} y={0.003} />
      <Strip x1={-width / 2} z1={-depth / 2} x2={-width / 2} z2={depth / 2} color={colors.line} y={0.003} />
      <Strip x1={width / 2} z1={-depth / 2} x2={width / 2} z2={depth / 2} color={colors.line} y={0.003} />

      {field.zones.map((zone, i) => (
        <group key={zone.id} position={[zone.x, 0.004 + i * 0.0005, zone.z]}>
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            receiveShadow
            onPointerDown={onItemDown && ((e) => onItemDown(zone.id, e))}
          >
            <planeGeometry args={[zone.w, zone.d]} />
            <meshStandardMaterial color={zone.color} transparent opacity={0.78} roughness={1} />
          </mesh>
          {selectedIds.includes(zone.id) && <Outline w={zone.w} d={zone.d} />}
          {zone.label && <FloorLabel text={zone.label} />}
        </group>
      ))}
      {field.lines.map((line) => (
        <group key={line.id}>
          <Strip {...line} y={0.008} width={0.08} color={selectedIds.includes(line.id) ? '#2563eb' : line.color} />
          {onItemDown && (
            <Strip
              {...line}
              y={0.009}
              width={0.45}
              color="#000"
              hitOnly
              onPointerDown={(e) => onItemDown(line.id, e)}
            />
          )}
          {line.label && (
            <group position={[(line.x1 + line.x2) / 2, 0.01, (line.z1 + line.z2) / 2]}>
              <FloorLabel text={line.label} />
            </group>
          )}
        </group>
      ))}
    </group>
  );
}

interface StripProps {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  color: string;
  y: number;
  width?: number;
  hitOnly?: boolean; // 보이지 않고 클릭만 받는 넓은 띠
  onPointerDown?: (e: ThreeEvent<PointerEvent>) => void;
}

export function Strip({ x1, z1, x2, z2, color, y, width = 0.06, hitOnly, onPointerDown }: StripProps) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const len = Math.hypot(dx, dz);
  const angle = Math.atan2(dz, dx);
  return (
    <mesh
      position={[(x1 + x2) / 2, y, (z1 + z2) / 2]}
      rotation={[-Math.PI / 2, 0, -angle]}
      onPointerDown={onPointerDown}
    >
      <planeGeometry args={[len + width, width]} />
      {hitOnly ? (
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      ) : (
        <meshBasicMaterial color={color} />
      )}
    </mesh>
  );
}

function Outline({ w, d }: { w: number; d: number }) {
  const c = '#2563eb';
  const y = 0.006;
  return (
    <group>
      <Strip x1={-w / 2} z1={-d / 2} x2={w / 2} z2={-d / 2} color={c} y={y} width={0.1} />
      <Strip x1={-w / 2} z1={d / 2} x2={w / 2} z2={d / 2} color={c} y={y} width={0.1} />
      <Strip x1={-w / 2} z1={-d / 2} x2={-w / 2} z2={d / 2} color={c} y={y} width={0.1} />
      <Strip x1={w / 2} z1={-d / 2} x2={w / 2} z2={d / 2} color={c} y={y} width={0.1} />
    </group>
  );
}

function FloorLabel({ text }: { text: string }) {
  return (
    <Html center position={[0, 0.02, 0]} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
      <div className="floor-label">{text}</div>
    </Html>
  );
}
