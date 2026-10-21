import { Html } from '@react-three/drei';
import type { Activity, BoardObject } from '../model/activity';
import { colorOf } from '../model/activity';
import { CATALOG_BY_KIND } from '../model/catalog';
import type { ItemState } from '../motion/transition';
import { Equipment } from './models/Equipment';
import { Kid } from './models/Kid';

interface Props {
  activity: Activity;
  obj: BoardObject;
  state: ItemState;
  selected?: boolean;
}

export function BoardItem({ activity, obj, state, selected }: Props) {
  if (state.hidden) return null;
  const color = colorOf(activity, obj) ?? CATALOG_BY_KIND[obj.kind].defaultColor;
  return (
    <group position={[state.x, state.y, state.z]} rotation={[0, state.rot, 0]} userData={{ objId: obj.id }}>
      {obj.kind === 'kid' ? (
        <>
          <Kid shirt={color} pose={state} selected={selected} />
          {obj.label && (
            <Html position={[0, 1.55, 0]} center zIndexRange={[15, 5]} style={{ pointerEvents: 'none' }}>
              <div className="name-tag" style={{ borderColor: color }}>
                {obj.label}
              </div>
            </Html>
          )}
        </>
      ) : (
        <Equipment kind={obj.kind} color={color} selected={selected} tilt={state.tilt} />
      )}
    </group>
  );
}
