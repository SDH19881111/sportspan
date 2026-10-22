import { Html } from '@react-three/drei';
import type { Activity, BoardObject } from '../model/activity';
import { colorOf } from '../model/activity';
import { CATALOG_BY_KIND, viewScale } from '../model/catalog';
import type { ItemState } from '../motion/timeline';
import { Equipment } from './models/Equipment';
import { Kid } from './models/Kid';

interface Props {
  activity: Activity;
  obj: BoardObject;
  state: ItemState;
  selected?: boolean;
  /** 숨은 것도 흐리게 보여 준다(편집 화면에서 고를 수 있게) */
  showHidden?: boolean;
}

/** 바닥에 묻히기 쉬운 작은 장비: 발밑에 어두운 그림자 원을 깔아 흙·마루 위에서도 떠 보이게 */
const GROUNDED = new Set(['cone', 'disc', 'ball', 'beanbag', 'cup', 'bell', 'basket']);

export function BoardItem({ activity, obj, state, selected, showHidden }: Props) {
  if (state.hidden && !showHidden) return null;
  const faded = state.hidden;
  const color = colorOf(activity, obj) ?? CATALOG_BY_KIND[obj.kind].defaultColor;
  const s = viewScale(obj.kind, activity.field.kind);
  return (
    <group position={[state.x, state.y, state.z]} rotation={[0, state.rot, 0]} userData={{ objId: obj.id }}>
      <group scale={s}>
        {GROUNDED.has(obj.kind) && !faded && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004 - state.y / s, 0]}>
            <circleGeometry args={[CATALOG_BY_KIND[obj.kind].radius * 1.5, 16]} />
            <meshBasicMaterial color="#000000" transparent opacity={0.28} depthWrite={false} />
          </mesh>
        )}
        {obj.kind === 'kid' ? (
          <Kid shirt={color} pose={state} selected={selected} faded={faded} />
        ) : (
          <Equipment kind={obj.kind} color={color} selected={selected} tilt={state.tilt} faded={faded} />
        )}
      </group>
      {obj.kind === 'kid' && obj.label && (
        <Html position={[0, 1.55 * s, 0]} center zIndexRange={[15, 5]} style={{ pointerEvents: 'none' }}>
          <div className="name-tag" style={{ borderColor: color }}>
            {obj.label}
          </div>
        </Html>
      )}
    </group>
  );
}
