import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { PartBuilder } from "../partBuilder";
import { WEARABLES, type WearSlot, type Wearer, type WearableId } from "../../game/data/wearables";

/**
 * Ms. Button's items as low-poly models (docs/PORT_TOWN_REVAMP.md §3.5). Each is
 * built once at the player's head size (radius ≈ 0.22) with its origin at its
 * mount point, facing +z, then placed on a wearer by that wearer's anchor.
 * A character's worn items merge into one mesh (one draw per dressed character).
 */

export type Mount = "head" | "eyes" | "mouth";
/** Where each item sits: hats on the head, glasses on the eyes, the mustache under the nose. */
export const MOUNT: Record<WearableId, Mount> = Object.fromEntries(
  (Object.keys(WEARABLES) as WearableId[]).map((id) => [id, id === "mustache" ? "mouth" : WEARABLES[id].slot === "head" ? "head" : "eyes"])
) as Record<WearableId, Mount>;

export interface Anchor {
  pos: [number, number, number];
  scale: number;
  /** A little jaunty roll (z) and backward pitch (x), radians. */
  roll?: number;
  pitch?: number;
}

/** Per wearer, in the frame that carries the body (player: posed body; friend: its rig). */
export const WEAR_ANCHORS: Record<Wearer, Record<Mount, Anchor>> = {
  player: { head: { pos: [0, 1.5, -0.01], scale: 1, roll: 0.1, pitch: -0.12 }, eyes: { pos: [0, 1.315, 0.2], scale: 1 }, mouth: { pos: [0, 1.255, 0.205], scale: 1 } },
  leafy: { head: { pos: [0, 0.92, 0.02], scale: 1.6, roll: 0.12, pitch: -0.08 }, eyes: { pos: [0, 0.76, 0.33], scale: 1.6 }, mouth: { pos: [0, 0.665, 0.37], scale: 1.4 } },
  bubbo: { head: { pos: [0, 0.8, -0.1], scale: 1.6, roll: 0.1, pitch: -0.1 }, eyes: { pos: [0, 0.76, 0.35], scale: 2.4 }, mouth: { pos: [0, 0.47, 0.52], scale: 1.8 } },
  puff: { head: { pos: [0, 0.68, 0], scale: 1.3, roll: 0.12, pitch: -0.08 }, eyes: { pos: [0, 0.52, 0.27], scale: 1.3 }, mouth: { pos: [0, 0.395, 0.31], scale: 1.1 } },
  ember: { head: { pos: [0, 1.64, 0.02], scale: 1.75, roll: 0.1, pitch: -0.1 }, eyes: { pos: [0, 1.4, 0.37], scale: 2 }, mouth: { pos: [0, 1.14, 0.5], scale: 1.8 } },
};

const TAU = Math.PI * 2;

function build(id: WearableId): THREE.BufferGeometry {
  const [c0, c1, c2] = WEARABLES[id].colors;
  const b = new PartBuilder(0);
  switch (id) {
    case "partyHat":
      b.cone(0.125, 0.32, 0, -0.02, 0, c0, 8);
      b.cyl(0.13, 0.13, 0.035, 0, -0.03, 0, c1, 8);
      b.sphere(0.045, 0, 0.31, 0, c2, [1, 1, 1], 6);
      for (let i = 0; i < 3; i++) b.boxAt(0.035, 0.035, 0.012, [Math.sin(i * 2.1) * 0.07, 0.08 + i * 0.06, 0.085 - i * 0.022], [0, i * 2.1, 0.78], c1);
      break;
    case "bigBow":
      for (const s of [-1, 1]) b.add(new THREE.SphereGeometry(0.09, 8, 5), c0, [s * 0.1, 0.02, 0.06], [0, 0, s * -0.45], [1.25, 0.8, 0.45]);
      b.boxAt(0.065, 0.065, 0.06, [0, 0.02, 0.08], [0, 0, 0.78], c1);
      for (const s of [-1, 1]) b.boxAt(0.04, 0.12, 0.015, [s * 0.04, -0.05, 0.09], [0.1, 0, s * 0.35], c1);
      break;
    case "flowerCrown":
      b.add(new THREE.TorusGeometry(0.2, 0.024, 4, 12), c0, [0, -0.03, 0], [Math.PI / 2, 0, 0]);
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i - 2) * 0.62, x = Math.cos(a) * 0.2, z = -Math.sin(a) * 0.2;
        b.boxAt(0.075, 0.075, 0.03, [x, -0.01, z], [0, Math.atan2(x, z), 0.78], c1);
        b.boxAt(0.032, 0.032, 0.034, [x * 1.03, -0.01, z * 1.03], [0, Math.atan2(x, z), 0], c2);
      }
      break;
    case "babyBonnet":
      b.add(new THREE.SphereGeometry(0.25, 10, 5, 0, TAU, 0, Math.PI * 0.55), c0, [0, -0.13, -0.03], [-0.5, 0, 0], [1, 1.05, 1]);
      b.add(new THREE.TorusGeometry(0.22, 0.035, 4, 12, Math.PI), c1, [0, -0.16, 0.06], [0.6, 0, 0]);
      for (const s of [-1, 1]) b.boxAt(0.035, 0.2, 0.012, [s * 0.17, -0.3, 0.06], [0, 0, s * 0.2], c2);
      break;
    case "bandana":
      b.add(new THREE.CylinderGeometry(0.228, 0.232, 0.085, 12, 1, true), c0, [0, -0.08, 0], [-0.12, 0, 0]);
      b.boxAt(0.07, 0.07, 0.05, [0, -0.07, -0.23], [0, 0, 0.78], c0);
      for (const s of [-1, 1]) b.boxAt(0.05, 0.13, 0.015, [s * 0.04, -0.15, -0.24], [0.25, 0, s * 0.4], c0);
      for (const x of [-0.11, 0, 0.11]) b.boxAt(0.026, 0.026, 0.01, [x, -0.06, 0.228 - Math.abs(x) * 0.25], [0, x * 2.2, 0.78], c1);
      break;
    case "explorerHat":
      b.cyl(0.31, 0.31, 0.022, 0, -0.05, 0, c0, 12);
      b.add(new THREE.SphereGeometry(0.19, 10, 5, 0, TAU, 0, Math.PI / 2), c0, [0, -0.04, 0], [0, 0, 0], [1, 0.9, 1]);
      b.cyl(0.192, 0.192, 0.045, 0, -0.035, 0, c1, 10);
      break;
    case "pirateHat": {
      // A tricorn: a three-sided brim (point to the front) on a round crown, gold trim, a skull.
      const brim = new THREE.CylinderGeometry(0.33, 0.33, 0.06, 3);
      b.add(brim, c0, [0, -0.02, 0], [0, Math.PI, 0]);
      b.add(new THREE.CylinderGeometry(0.345, 0.345, 0.02, 3), c1, [0, 0.015, 0], [0, Math.PI, 0]);
      b.add(new THREE.SphereGeometry(0.2, 8, 5, 0, TAU, 0, Math.PI / 2), c0, [0, 0, 0], [0, 0, 0], [1, 0.95, 1]);
      b.sphere(0.05, 0, 0.1, 0.18, c2, [1, 1, 0.55], 6);
      break;
    }
    case "knightHelmet":
      // A cute cap-helmet with its visor raised: the eyes always show.
      b.add(new THREE.SphereGeometry(0.245, 10, 5, 0, TAU, 0, Math.PI / 2), c0, [0, -0.07, 0], [-0.05, 0, 0]);
      b.cyl(0.252, 0.252, 0.045, 0, -0.1, 0, c0, 10);
      b.boxAt(0.3, 0.065, 0.045, [0, -0.035, 0.232], [-0.4, 0, 0], c2);
      b.cone(0.05, 0.22, 0, 0.14, -0.02, c1, 6);
      b.sphere(0.07, 0, 0.32, -0.05, c1, [1, 1.3, 1.4], 6);
      break;
    case "crown":
      b.cyl(0.165, 0.15, 0.1, 0, -0.03, 0, c0, 10);
      b.cyl(0.14, 0.14, 0.012, 0, 0.068, 0, c1, 10);
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * TAU;
        b.cone(0.035, 0.09, Math.sin(a) * 0.15, 0.07, Math.cos(a) * 0.15, c0, 5);
      }
      b.boxAt(0.045, 0.045, 0.02, [0, 0.02, 0.163], [0, 0, 0.78], c1);
      for (const s of [-1, 1]) b.boxAt(0.035, 0.035, 0.02, [s * 0.115, 0.02, 0.12], [0, s * 0.75, 0.78], c2);
      break;
    case "mustache":
      for (const s of [-1, 1]) b.add(new THREE.SphereGeometry(0.06, 7, 4), c0, [s * 0.05, 0, 0.02], [0, 0, s * 0.35], [1.35, 0.55, 0.5]);
      for (const s of [-1, 1]) b.sphere(0.025, s * 0.115, 0.03, 0.015, c0, [1, 1, 0.7], 5);
      break;
    case "sunglasses":
      for (const s of [-1, 1]) {
        b.boxAt(0.105, 0.075, 0.016, [s * 0.072, 0, 0.012], [0, 0, 0], c0);
        b.boxAt(0.088, 0.06, 0.012, [s * 0.072, -0.002, 0.022], [0, 0, 0], c1);
        b.boxAt(0.014, 0.016, 0.16, [s * 0.128, 0.018, -0.07], [0, 0, 0], c0);
      }
      b.boxAt(0.05, 0.014, 0.014, [0, 0.02, 0.014], [0, 0, 0], c0);
      break;
    case "heartGlasses":
      // Each lens is a heart: two round lobes over a diamond point.
      for (const s of [-1, 1]) {
        const x = s * 0.072;
        for (const t of [-1, 1]) b.sphere(0.031, x + t * 0.022, 0.012, 0.02, c1, [1, 1, 0.45], 5);
        b.boxAt(0.046, 0.046, 0.018, [x, -0.016, 0.02], [0, 0, Math.PI / 4], c1);
        b.boxAt(0.014, 0.016, 0.16, [s * 0.128, 0.018, -0.07], [0, 0, 0], c0);
      }
      b.boxAt(0.05, 0.014, 0.014, [0, 0.02, 0.014], [0, 0, 0], c0);
      break;
    case "goggles":
      b.add(new THREE.CylinderGeometry(0.232, 0.232, 0.035, 12, 1, true), c0, [0, 0, -0.205], [0, 0, 0]);
      for (const s of [-1, 1]) {
        b.cylAt(0.064, 0.034, [s * 0.072, 0, 0.012], [Math.PI / 2, 0, 0], c2, 8);
        b.cylAt(0.05, 0.036, [s * 0.072, 0, 0.016], [Math.PI / 2, 0, 0], c1, 8);
      }
      break;
  }
  return b.build();
}

const cache = new Map<WearableId, THREE.BufferGeometry>();
/** One shared model per item (never disposed; there are only thirteen). */
export function wearableGeometry(id: WearableId): THREE.BufferGeometry {
  let g = cache.get(id);
  if (!g) cache.set(id, (g = build(id)));
  return g;
}

/** A wearer's items placed on its anchors and merged (null when nothing is worn). */
export function outfitGeometry(who: Wearer, outfit: Partial<Record<WearSlot, WearableId>>): THREE.BufferGeometry | null {
  const parts: THREE.BufferGeometry[] = [];
  for (const id of [outfit.head, outfit.face]) {
    if (!id) continue;
    const a = WEAR_ANCHORS[who][MOUNT[id]];
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(...a.pos),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(a.pitch ?? 0, 0, a.roll ?? 0)),
      new THREE.Vector3(a.scale, a.scale, a.scale),
    );
    parts.push(wearableGeometry(id).clone().applyMatrix4(m));
  }
  if (!parts.length) return null;
  const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
  if (parts.length > 1) parts.forEach((p) => p.dispose());
  merged.computeBoundingSphere();
  return merged;
}
