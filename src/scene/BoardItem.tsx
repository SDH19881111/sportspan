import { Html } from '@react-three/drei';
import type { Activity, BoardObject } from '../model/activity';
import { colorOf } from '../model/activity';
import { CATALOG_BY_KIND } from '../model/catalog';
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

export function BoardItem({ activity, obj, state, selected, showHidden }: Props) {
  if (state.hidden && !showHidden) return null;
  const faded = state.hidden;
  const color = colorOf(activity, obj) ?? CATALOG_BY_KIND[obj.kind].defaultColor;
  return (
    <group position={[state.x, state.y, state.z]} rotation={[0, state.rot, 0]} userData={{ objId: obj.id }}>
      {obj.kind === 'kid' ? (
        <>
          <Kid shirt={color} pose={state} selected={selected} faded={faded} />
          {obj.label && (
            <Html position={[0, 1.55, 0]} center zIndexRange={[15, 5]} style={{ pointerEvents: 'none' }}>
              <div className="name-tag" style={{ borderColor: color }}>
                {obj.label}
              </div>
            </Html>
          )}
        </>
      ) : (
        <Equipment kind={obj.kind} color={color} selected={selected} tilt={state.tilt} faded={faded} />
      )}
    </group>
  );
}
