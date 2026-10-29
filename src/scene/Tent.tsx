import { useMemo } from "react";
import { CAMP, groundY } from "../game/world/island";
import { flatMat } from "./materials";
import { expeditionEquipmentGeometry, tentGeometry } from "./models/tent";

/** Maple's expedition shelter and equipment use the shared opaque world material. */
export function Tent() {
  const canvas = useMemo(() => {
    const { x, z, yaw } = CAMP.tent, y = groundY(x, z);
    return tentGeometry((localX, localZ) => groundY(
      x + localX * Math.cos(yaw) + localZ * Math.sin(yaw),
      z - localX * Math.sin(yaw) + localZ * Math.cos(yaw)
    ) - y);
  }, []);
  const equipment = useMemo(expeditionEquipmentGeometry, []);
  return (
    <group>
      <mesh geometry={canvas} material={flatMat}
        position={[CAMP.tent.x, groundY(CAMP.tent.x, CAMP.tent.z), CAMP.tent.z]} rotation={[0, CAMP.tent.yaw, 0]} />
      <mesh geometry={equipment} material={flatMat}
        position={[CAMP.table.x, groundY(CAMP.table.x, CAMP.table.z), CAMP.table.z]} rotation={[0, CAMP.table.yaw, 0]} />
    </group>
  );
}
