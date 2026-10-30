import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type * as THREE from "three";
import { getGame } from "../game/store";
import { flatMat } from "./materials";
import { frontierGateGeometry, frontierWallGeometry } from "./models/frontierWall";
import { FRONTIER_GATE } from "../game/world/frontierWall";

/** Two merged opaque draws at most, sharing the home island's flat material. */
export function FrontierWall() {
  const wall = useMemo(frontierWallGeometry, []);
  const gate = useMemo(frontierGateGeometry, []);
  const door = useRef<THREE.Mesh>(null);
  const group = useRef<THREE.Group>(null);
  useFrame(({ camera }) => {
    // Skip both merged meshes together beyond the distant scenery range.
    if (group.current) group.current.visible = Math.hypot(camera.position.x - FRONTIER_GATE.x, camera.position.z - FRONTIER_GATE.z) < 180;
    if (door.current) door.current.visible = !getGame().progress.act2.started;
  });
  return <group ref={group}>
    <mesh geometry={wall} material={flatMat} />
    <mesh ref={door} geometry={gate} material={flatMat} />
  </group>;
}
