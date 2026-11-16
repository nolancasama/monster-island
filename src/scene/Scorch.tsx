import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { rt } from "../game/runtime";
import { getGame } from "../game/store";
import { standY } from "../game/world/collision";
import { SCORCH, scorches, scorchStage, type Scorch as Mark } from "../game/scorch";

/**
 * Ember's scorch marks (game/scorch.ts): soft, irregular dark patches lying on the
 * ground or deck under where the flames swept, glowing for a moment, then fading
 * back. One pooled mesh and one draw call for every mark; vertex heights follow
 * the surface when a mark is laid, colours change per frame.
 */
const RIM = 12, PER = 1 + RIM * 2, TRIS = RIM * 3;
const CHAR = new THREE.Color("#1c1611"), EMBER = new THREE.Color("#ff6a14");

export function Scorch() {
  const { geometry, material } = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(SCORCH.max * PER * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(SCORCH.max * PER * 4), 4).setUsage(THREE.DynamicDrawUsage));
    const index: number[] = [];
    for (let m = 0; m < SCORCH.max; m++) {
      const o = m * PER;
      for (let i = 0; i < RIM; i++) {
        const a = o + 1 + i, b = o + 1 + (i + 1) % RIM, A = a + RIM, B = b + RIM;
        index.push(o, b, a, a, b, B, a, B, A);
      }
    }
    g.setIndex(index);
    g.setDrawRange(0, 0);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    return { geometry: g, material: mat };
  }, []);
  // Which mark (and size) each slot holds, so a slot's heights are only rebuilt when it changes.
  const laid = useRef<Array<{ seed: number; r: number } | null>>([]);
  const ref = useRef<THREE.Mesh>(null);
  const tint = useMemo(() => new THREE.Color(), []);

  useFrame(() => {
    const mesh = ref.current;
    if (!mesh) return;
    mesh.visible = scorches.length > 0;
    if (!mesh.visible) return;
    const pos = geometry.getAttribute("position") as THREE.BufferAttribute, col = geometry.getAttribute("color") as THREE.BufferAttribute;
    const solved = getGame().progress.solved;
    let moved = false;
    scorches.forEach((s, slot) => {
      const was = laid.current[slot];
      if (!was || was.seed !== s.seed || was.r !== s.r) { lay(pos, slot, s, solved); laid.current[slot] = { seed: s.seed, r: s.r }; moved = true; }
      const { char, glow } = scorchStage(s, rt.time);
      tint.copy(CHAR).lerp(EMBER, glow * 0.55);
      const o = slot * PER;
      col.setXYZW(o, tint.r, tint.g, tint.b, 0.8 * char);
      for (let i = 0; i < RIM; i++) {
        col.setXYZW(o + 1 + i, tint.r, tint.g, tint.b, 0.62 * char);
        col.setXYZW(o + 1 + RIM + i, CHAR.r, CHAR.g, CHAR.b, 0);
      }
    });
    for (let slot = scorches.length; slot < laid.current.length; slot++) laid.current[slot] = null;
    if (moved) pos.needsUpdate = true;
    col.needsUpdate = true;
    geometry.setDrawRange(0, scorches.length * TRIS * 3);
  });
  return <mesh ref={ref} geometry={geometry} material={material} frustumCulled={false} renderOrder={2} visible={false} />;
}

/** Lay a mark's vertices on the surface under it: a dark middle ring and a soft outer edge. */
function lay(pos: THREE.BufferAttribute, slot: number, s: Mark, solved: readonly string[]) {
  const o = slot * PER, lift = 0.035;
  const y = (x: number, z: number) => standY(x, z, solved as never, s.layer) + lift;
  pos.setXYZ(o, s.x, y(s.x, s.z), s.z);
  for (let i = 0; i < RIM; i++) {
    const a = (i / RIM) * Math.PI * 2, wobble = 0.78 + 0.32 * Math.abs(Math.sin(s.seed * 12.9898 + i * 4.1));
    const ix = s.x + Math.cos(a) * s.r * 0.55 * wobble, iz = s.z + Math.sin(a) * s.r * 0.55 * wobble;
    const ox = s.x + Math.cos(a) * s.r * wobble, oz = s.z + Math.sin(a) * s.r * wobble;
    pos.setXYZ(o + 1 + i, ix, y(ix, iz), iz);
    pos.setXYZ(o + 1 + RIM + i, ox, y(ox, oz), oz);
  }
}
