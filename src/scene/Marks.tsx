import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { Strip } from './Field';

// 장면에 붙는 표시: 바닥 화살표, 말풍선, 강조 원.

export const ARROW_COLOR = '#ffd23f';

interface ArrowProps {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  selected?: boolean;
  onPointerDown?: (e: ThreeEvent<PointerEvent>) => void;
}

export function ArrowMark({ x1, z1, x2, z2, selected, onPointerDown }: ArrowProps) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  if (len < 0.01) return null;
  const head = Math.min(0.6, len * 0.4);
  const ux = (x2 - x1) / len;
  const uz = (z2 - z1) / len;
  const bx = x2 - ux * head;
  const bz = z2 - uz * head;
  const angle = Math.atan2(uz, ux);
  const color = selected ? '#2563eb' : ARROW_COLOR;
  return (
    <group onPointerDown={onPointerDown}>
      {/* 잡기 쉬운 두꺼운 투명 띠 */}
      <mesh position={[(x1 + x2) / 2, 0.02, (z1 + z2) / 2]} rotation={[-Math.PI / 2, 0, -angle]}>
        <planeGeometry args={[len, 0.5]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <Strip x1={x1} z1={z1} x2={bx} z2={bz} color={color} y={0.02} width={0.14} />
      <mesh position={[bx, 0.021, bz]} rotation={[-Math.PI / 2, 0, -angle]}>
        <shapeGeometry args={[arrowHead(head)]} />
        <meshBasicMaterial color={color} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function arrowHead(len: number) {
  const s = new THREE.Shape();
  const w = len * 0.65;
  s.moveTo(len, 0);
  s.lineTo(0, w);
  s.lineTo(0, -w);
  s.closePath();
  return s;
}

interface BubbleProps {
  x: number;
  z: number;
  height: number;
  text: string;
  selected?: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
}

export function BubbleTag({ x, z, height, text, selected, onPointerDown }: BubbleProps) {
  return (
    <Html position={[x, height + 0.25, z]} center zIndexRange={[20, 10]} style={{ pointerEvents: 'none' }}>
      <div
        className={`bubble${selected ? ' selected' : ''}${text ? '' : ' empty'}`}
        style={{ pointerEvents: onPointerDown ? 'auto' : 'none' }}
        onPointerDown={onPointerDown}
      >
        {text || '말풍선 내용을 입력하세요'}
      </div>
    </Html>
  );
}

export function HighlightRing({ x, z, radius }: { x: number; z: number; radius: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const k = 1 + Math.sin(clock.elapsedTime * 4) * 0.08;
    ref.current.scale.set(k, k, 1);
  });
  return (
    <mesh ref={ref} position={[x, 0.025, z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[radius, radius + 0.09, 40]} />
      <meshBasicMaterial color="#7ee04a" />
    </mesh>
  );
}

/** 애니메이션 번호표(PPT처럼 물건 옆에 붙는 숫자) */
export function AnimBadge(p: {
  x: number;
  z: number;
  y?: number;
  label: string;
  selected?: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
}) {
  return (
    <Html position={[p.x, p.y ?? 0.05, p.z]} center zIndexRange={[25, 15]} style={{ pointerEvents: 'none' }}>
      <div
        className={`anim-badge${p.selected ? ' selected' : ''}`}
        style={{ pointerEvents: p.onPointerDown ? 'auto' : 'none' }}
        onPointerDown={p.onPointerDown}
      >
        {p.label}
      </div>
    </Html>
  );
}

/**
 * 이동 경로: 출발점에서 도착점까지 점선, 도착점에 흐린 원(끌어서 도착점을 옮길 수 있다).
 * 던지기·튕기기는 공이 날아가는 높이를 점으로 보여 준다.
 */
export function PathMark(p: {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  color: string;
  radius: number;
  selected?: boolean;
  heights?: number[]; // 길을 따라 고르게 나눈 높이(던지기)
  onEndDown?: (e: ThreeEvent<PointerEvent>) => void;
}) {
  const len = Math.hypot(p.x1 - p.x0, p.z1 - p.z0);
  const angle = Math.atan2(p.z1 - p.z0, p.x1 - p.x0);
  const dash = 0.25;
  const n = Math.max(1, Math.floor(len / (dash * 2)));
  const lineColor = p.selected ? '#2563eb' : p.color;
  const dashes = [];
  for (let i = 0; i < n; i++) {
    const k = (i * dash * 2 + dash / 2) / len;
    if (k > 1) break;
    dashes.push(
      <mesh
        key={i}
        position={[p.x0 + (p.x1 - p.x0) * k, 0.018, p.z0 + (p.z1 - p.z0) * k]}
        rotation={[-Math.PI / 2, 0, -angle]}
      >
        <planeGeometry args={[dash, p.selected ? 0.12 : 0.07]} />
        <meshBasicMaterial color={lineColor} transparent opacity={0.9} />
      </mesh>,
    );
  }
  const dots = (p.heights ?? []).map((h, i, arr) => {
    const k = arr.length > 1 ? i / (arr.length - 1) : 0;
    return (
      <mesh key={`h${i}`} position={[p.x0 + (p.x1 - p.x0) * k, h, p.z0 + (p.z1 - p.z0) * k]}>
        <sphereGeometry args={[0.04, 6, 4]} />
        <meshBasicMaterial color={lineColor} />
      </mesh>
    );
  });
  return (
    <group>
      {dashes}
      {dots}
      <mesh position={[p.x1, 0.02, p.z1]} rotation={[-Math.PI / 2, 0, 0]} onPointerDown={p.onEndDown}>
        <circleGeometry args={[p.radius + 0.08, 24]} />
        <meshBasicMaterial color={p.color} transparent opacity={0.4} />
      </mesh>
      <mesh position={[p.x1, 0.021, p.z1]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[p.radius + 0.08, p.radius + 0.14, 24]} />
        <meshBasicMaterial color={lineColor} />
      </mesh>
    </group>
  );
}
