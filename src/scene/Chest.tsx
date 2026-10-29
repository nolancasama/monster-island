import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { rt } from "../game/runtime";
import { getGame } from "../game/store";
import { CHESTS, POND_Y } from "../game/world/lowland";
import { groundY } from "../game/world/island";
import { additiveSprite, flatMat } from "./materials";
import { CHEST_HINGE, CHEST_OPEN_ANGLE, chestBaseGeometry, chestLidGeometry } from "./models/chest";

/** A treasure chest. Whether it is drawn at all is decided by the lowland's visibility rules (`visible`). */
export function Chest({ id, visible }: { id: string; visible: (x: number, z: number) => boolean }) {
  const c = CHESTS.find((x) => x.id === id)!;
  const base = useMemo(chestBaseGeometry, []);
  const lid = useMemo(chestLidGeometry, []);
  const lidRef = useRef<THREE.Group>(null);
  const glow = useMemo(() => additiveSprite("#ffe680", 0.22), []);
  const openingGlow = useMemo(() => additiveSprite("#ffc86b", 0), []);
  const glowRef = useRef<THREE.Sprite>(null);
  const openingGlowRef = useRef<THREE.Sprite>(null);
  const previousLid = useRef(rt.chestLid.get(id) ?? 0);
  const openingSeen = useRef(previousLid.current > 0 || getGame().progress.act2.chests.includes(id));
  const openingAge = useRef(1);
  const root = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (root.current) root.current.visible = visible(c.x, c.z);
    const k = THREE.MathUtils.clamp(rt.chestLid.get(id) ?? 0, 0, 1);
    const open = getGame().progress.act2.chests.includes(id);
    if (!openingSeen.current && previousLid.current === 0 && k > 0) {
      openingSeen.current = true;
      if (!open) openingAge.current = 0;
    }
    previousLid.current = k;
    if (lidRef.current) lidRef.current.rotation.x = CHEST_OPEN_ANGLE * THREE.MathUtils.smoothstep(k, 0, 1);
    if (glowRef.current) {
      glowRef.current.visible = !open && k === 0;
      glowRef.current.scale.setScalar(0.45 + Math.sin(rt.time * 3) * 0.025);
    }
    openingAge.current += dt;
    if (openingGlowRef.current) {
      const t = Math.min(openingAge.current / 0.8, 1);
      openingGlowRef.current.visible = t < 1;
      openingGlow.opacity = Math.sin(t * Math.PI) * 0.65;
      openingGlowRef.current.position.y = 0.53 + t * 0.4;
      openingGlowRef.current.scale.setScalar(0.35 + t * 0.5);
    }
  });
  const y = id === "isletChest" ? POND_Y + 0.15 : groundY(c.x, c.z);
  return (
    <group ref={root} position={[c.x, y, c.z]} rotation={[0, c.yaw, 0]}>
      <mesh geometry={base} material={flatMat} />
      <group ref={lidRef} position={CHEST_HINGE}>
        <mesh geometry={lid} material={flatMat} />
      </group>
      <sprite ref={glowRef} position={[0, 1.04, 0]} material={glow} />
      <sprite ref={openingGlowRef} visible={false} position={[0, 0.53, 0]} material={openingGlow} />
    </group>
  );
}
