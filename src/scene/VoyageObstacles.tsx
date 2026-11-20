import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh } from "three";
import { steeringObstacleFrame } from "../game/flow/voyageJobs";
import { SHIP_OBSTACLE_SCALE } from "../game/logic/steerPath";
import { rt } from "../game/runtime";
import { vy } from "../game/voyageRt";
import { SEA_Y } from "../game/world/island";
import { SHIP } from "../game/world/pirateShip";
import { flatMat } from "./materials";
import { floatBarrelGeometry, rockGeometry } from "./models/pirateShip";

export function VoyageObstacles() {
  const rock = useMemo(rockGeometry, []), barrel = useMemo(floatBarrelGeometry, []);
  const first = useRef<Mesh>(null), second = useRef<Mesh>(null);
  useFrame(() => {
    for (let i = 0; i < 2; i++) {
      const mesh = i === 0 ? first.current : second.current;
      const obstacle = vy.obstacles[i];
      if (!mesh) continue;
      if (!obstacle || !vy.sea || rt.world !== "home") {
        mesh.visible = false;
        continue;
      }
      const raft = vy.raft.on;
      const frame = raft ? undefined : steeringObstacleFrame(obstacle);
      mesh.visible = raft || Boolean(frame);
      if (!mesh.visible) continue;

      const isBarrel = obstacle.kind === "barrel";
      const geometry = isBarrel ? barrel : rock;
      if (mesh.geometry !== geometry) mesh.geometry = geometry;
      const y = SEA_Y + (isBarrel ? 0.1 : -0.3) + Math.sin(rt.time * 2 + obstacle.id) * 0.08;
      if (frame) {
        mesh.position.set(SHIP.x + vy.shipOffset.x + frame.x, y, SHIP.z + vy.shipOffset.z + frame.z);
        mesh.scale.setScalar(SHIP_OBSTACLE_SCALE);
      } else {
        mesh.position.set(vy.raft.x + (obstacle.lane - vy.laneVis) * 4.5, y, vy.raft.z + obstacle.z);
        mesh.scale.setScalar(0.75);
      }
      mesh.rotation.set(0, obstacle.id * 1.7 + (isBarrel ? rt.time * 0.4 : 0), isBarrel ? Math.sin(rt.time * 1.6) * 0.2 : 0);
    }
  });
  return <>
    <mesh ref={first} geometry={rock} material={flatMat} visible={false} />
    <mesh ref={second} geometry={rock} material={flatMat} visible={false} />
  </>;
}
