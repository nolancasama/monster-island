import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { rt } from "../game/runtime";
import { getGame } from "../game/store";
import { LEAF_STATE, UPPER_LEAVES } from "../game/world/upperCanopy";
import { layerView } from "./layerView";
import { summitGeometry, unstableLeafGeometry, upperCanopyGeometry, upperCanopyMaterial, upperRopeGeometry } from "./models/upperCanopy";
import { Chest } from "./Chest";
import { flatMat } from "./materials";
import { lowlandView } from "./Lowland";

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
  const summit = useMemo(summitGeometry, []);
  const unstable = useMemo(() => UPPER_LEAVES.filter(l => l.unstable).map(l => ({ leaf: l, geometry: unstableLeafGeometry(l) })), []);
  const leafRefs = useRef<Array<THREE.Mesh | null>>([]);
  const drop = useRef<Record<string, number>>({});

  useFrame((_, dt) => {
    const playing = getGame().screen === "game";
    // Up top it always draws; from below only while the lowland itself draws and the
    // player is close (keeps it out of the volcano tunnel and Sanctuary budgets).
    const near = rt.player.layer === "high"
      || (lowlandView.visible && Math.hypot(rt.player.x - 95, rt.player.z + 215) < 70);
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
    <mesh geometry={summit} material={flatMat} />
    <Chest id="summitChest" visible={() => true} />
    {unstable.map(({ leaf, geometry }, i) => {
      // Re-centre on the leaf so it can tilt and fall about itself.
      const g = geometry.clone();
      g.translate(-leaf.x, -leaf.y, -leaf.z);
      return <mesh key={leaf.id} ref={m => { leafRefs.current[i] = m; }} geometry={g} material={mat} position={[leaf.x, leaf.y, leaf.z]} />;
    })}
  </group>;
}

/** Bubbo's big bubble around the player (and his own small one), while it lasts. */
export function BubbleRide() {
  const group = useRef<THREE.Group>(null), big = useRef<THREE.Mesh>(null), small = useRef<THREE.Mesh>(null);
  const motes = useRef<Array<THREE.Mesh | null>>([]);
  const mat = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
void main() {
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = normalize(-mv.xyz);
  vP = position;
  gl_Position = projectionMatrix * mv;
}`,
    fragmentShader: `
uniform float uTime;
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
void main() {
  float rim = pow(1.0 - abs(dot(vN, vV)), 2.4);
  float shimmer = 0.5 + 0.5 * sin(vP.y * 9.0 + vP.x * 6.0 + uTime * 2.3);
  vec3 col = mix(vec3(0.55, 0.82, 1.0), vec3(0.92, 0.85, 1.0), shimmer * rim);
  float spot = smoothstep(0.93, 0.99, dot(vN, normalize(vec3(-0.4, 0.6, 0.7))));
  float alpha = 0.06 + 0.5 * rim + 0.6 * spot;
  gl_FragColor = vec4(col + spot, alpha);
  #include <colorspace_fragment>
}`,
  }), []);
  const sphere = useMemo(() => new THREE.SphereGeometry(1, 24, 16), []);
  useFrame(() => {
    const r = rt.bubbleRide, on = r.phase !== "idle";
    if (group.current) group.current.visible = on;
    if (!on) return;
    mat.uniforms.uTime.value = rt.time;
    const pop = r.phase === "popping" ? 1.25 : 1, wob = .035 * Math.sin(rt.time * 3.1);
    if (big.current) {
      big.current.position.set(r.x, r.y + .85, r.z);
      big.current.scale.set(1.3 * r.k * pop * (1 + wob), 1.3 * r.k * pop * (1 - wob), 1.3 * r.k * pop * (1 + wob * .5));
      big.current.visible = r.phase !== "popping" || rt.time % .2 < .1;
    }
    if (small.current) {
      small.current.position.set(r.bubbo.x, r.bubbo.y + .45, r.bubbo.z);
      small.current.scale.setScalar(.8 * r.k * (1 - wob));
      small.current.visible = r.phase === "flying";
    }
    motes.current.forEach((m, i) => {
      if (!m) return;
      const a = rt.time * (.8 + i * .17) + i * 1.3;
      m.position.set(r.x + Math.cos(a) * (1.6 + i * .12), r.y + .9 + Math.sin(a * 1.3) * .6, r.z + Math.sin(a) * (1.6 + i * .12));
      m.scale.setScalar(.09 + .03 * i * r.k);
    });
  });
  return <group ref={group} visible={false}>
    <mesh ref={big} geometry={sphere} material={mat} renderOrder={5} />
    <mesh ref={small} geometry={sphere} material={mat} renderOrder={5} />
    {[0, 1, 2, 3, 4].map(i => <mesh key={i} ref={m => { motes.current[i] = m; }} geometry={sphere} material={mat} renderOrder={5} />)}
  </group>;
}
