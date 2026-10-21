import type { Activity, BoardObject, Pose } from '../model/activity';
import { colorOf } from '../model/activity';
import { CATALOG_BY_KIND } from '../model/catalog';
import { Equipment } from './models/Equipment';
import { Kid, type KidPoseState } from './models/Kid';

interface Props {
  activity: Activity;
  obj: BoardObject;
  pose: Pose;
  y?: number; // 공이 떠 있을 때 높이
  kidPose?: KidPoseState;
  tilt?: number;
  selected?: boolean;
}

export function BoardItem({ activity, obj, pose, y = 0, kidPose, tilt, selected }: Props) {
  if (pose.hidden) return null;
  const color = colorOf(activity, obj) ?? CATALOG_BY_KIND[obj.kind].defaultColor;
  return (
    <group position={[pose.x, y, pose.z]} rotation={[0, pose.rot, 0]} userData={{ objId: obj.id }}>
      {obj.kind === 'kid' ? (
        <Kid shirt={color} pose={kidPose} selected={selected} />
      ) : (
        <Equipment kind={obj.kind} color={color} selected={selected} tilt={tilt} />
      )}
    </group>
  );
}
