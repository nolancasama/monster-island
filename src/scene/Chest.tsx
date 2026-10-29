import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { rt } from "../game/runtime";
import { getGame } from "../game/store";
import { CHESTS, POND_Y } from "../game/world/lowland";
import { groundY } from "../game/world/island";
import { additiveSprite, flatMat } from "./materials";
import { chestBaseGeometry, chestLidGeometry } from "./models/chest";

/** A treasure chest. Whether it is drawn at all is decided by the lowland's visibility rules (`visible`). */
export function Chest({ id, visible }: { id: string; visible: (x: number, z: number) => boolean }) {
  const c = CHESTS.find((x) => x.id === id)!;
  const base = useMemo(chestBaseGeometry, []);
  const lid = useMemo(chestLidGeometry, []);
  const lidRef = useRef<THREE.Group>(null);
  const glow = useMemo(() => additiveSprite("#ffe680", 0.55), []);
  const glowRef = useRef<THREE.Sprite>(null);
  const root = useRef<THREE.Group>(null);
  useFrame(() => {
    if (root.current) root.current.visible = visible(c.x, c.z);
    const k = rt.chestLid.get(id) ?? 0;
    if (lidRef.current) lidRef.current.rotation.x = -k * 1.9;
    if (glowRef.current) {
      const open = getGame().progress.act2.chests.includes(id);
      glowRef.current.visible = !open;
      glowRef.current.scale.setScalar(1.3 + Math.sin(rt.time * 3) * 0.12);
    }
  });
  const y = id === "isletChest" ? POND_Y + 0.15 : groundY(c.x, c.z);
  return (
    <group ref={root} position={[c.x, y, c.z]} rotation={[0, c.yaw, 0]}>
      <mesh geometry={base} material={flatMat} />
      <group ref={lidRef} position={[0, 0.5, -0.33]}>
        <mesh geometry={lid} material={flatMat} />
      </group>
      <sprite ref={glowRef} position={[0, 1.1, 0]} material={glow} />
    </group>
  );
}
