import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { rt } from "../game/runtime";
import { getGame } from "../game/store";
import { LEAF_STATE, UPPER_LEAVES } from "../game/world/upperCanopy";
import { layerView } from "./layerView";
import { unstableLeafGeometry, upperCanopyGeometry, upperCanopyMaterial, upperRopeGeometry } from "./models/upperCanopy";
import { flatMat } from "./materials";

/** Exposed for the browser capture hook. */
export const upperView = { visible: false, cull: false };

/** The Upper Canopy: drawn whenever the lens is near the Canopy and not in the
 * cave. Seen from below, leaves near the lens are cut away (no transparency). */
export function UpperCanopy() {
  const { camera } = useThree();
  const group = useRef<THREE.Group>(null);
  const mat = useMemo(upperCanopyMaterial, []);
  const main = useMemo(upperCanopyGeometry, []);
  const rope = useMemo(upperRopeGeometry, []);
  const unstable = useMemo(() => UPPER_LEAVES.filter(l => l.unstable).map(l => ({ leaf: l, geometry: unstableLeafGeometry(l) })), []);
  const leafRefs = useRef<Array<THREE.Mesh | null>>([]);
  const drop = useRef<Record<string, number>>({});

  useFrame((_, dt) => {
    const playing = getGame().screen === "game";
    const near = Math.hypot(camera.position.x - 101, camera.position.z + 219) < 120;
    const show = playing && near && layerView(rt.player.layer).high && getGame().progress.act3.world !== "cloud";
    upperView.visible = show;
    if (group.current) group.current.visible = show;
    if (!show) return;
    const cull = rt.player.layer !== "high";
    upperView.cull = cull;
    mat.userData.cull.value = cull ? 1 : 0;
    mat.userData.lens.value.copy(camera.position);
    unstable.forEach(({ leaf }, i) => {
      const mesh = leafRefs.current[i];
      if (!mesh) return;
      const s = LEAF_STATE[leaf.id];
      let k = drop.current[leaf.id] ?? 0;
      if (s.phase === "gone") k = Math.min(1, k + dt / .6);
      else k = Math.max(0, k - dt / 1.2);
      drop.current[leaf.id] = k;
      const shake = s.phase === "warn" ? .05 * Math.sin(rt.time * 40) : 0;
      // Pivot about the leaf's own centre: shake while warning, fall away when gone, grow back.
      mesh.position.set(leaf.x, leaf.y - 9 * k * k, leaf.z);
      mesh.rotation.set(shake + k * .9, 0, shake * .7 + k * .4);
      const grow = s.phase === "solid" && k > 0 ? 1 - k : 1;
      mesh.scale.setScalar(Math.max(.01, grow));
      mesh.visible = k < .99 || s.phase !== "gone";
    });
  });

  return <group ref={group} visible={false}>
    <mesh geometry={main} material={mat} />
    <mesh geometry={rope} material={flatMat} />
    {unstable.map(({ leaf, geometry }, i) => {
      // Re-centre on the leaf so it can tilt and fall about itself.
      const g = geometry.clone();
      g.translate(-leaf.x, -leaf.y, -leaf.z);
      return <mesh key={leaf.id} ref={m => { leafRefs.current[i] = m; }} geometry={g} material={mat} position={[leaf.x, leaf.y, leaf.z]} />;
    })}
  </group>;
}
