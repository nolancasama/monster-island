import * as THREE from "three";
import { PartBuilder } from "../partBuilder";

/**
 * Low-poly kids: body (torso + head) and separate limbs so the walk cycle can
 * swing them. Limb geometries hang from their pivot (y = 0 at the joint).
 */

export interface Outfit {
  skin: string;
  hair: string;
  shirt: string;
  shirtTrim: string;
  shorts: string;
  shoes: string;
  /** Kai's headband, the player's cap. */
  hat: "cap" | "band";
  hatColor: string;
  height: number;
  backpack?: string;
}

export const PLAYER_OUTFIT: Outfit = {
  skin: "#f3c9a1",
  hair: "#3a261a",
  shirt: "#3f9fe0",
  shirtTrim: "#ffffff",
  shorts: "#d8b77a",
  shoes: "#e8483f",
  hat: "cap",
  hatColor: "#ef5b3a",
  height: 1,
  backpack: "#c9934f"
};

export const KAI_OUTFIT: Outfit = {
  skin: "#c58b5c",
  hair: "#1e1612",
  shirt: "#3e9b5a",
  shirtTrim: "#f2d14b",
  shorts: "#36507a",
  shoes: "#7a5532",
  hat: "band",
  hatColor: "#ff8a2a",
  height: 1.1
};

export function bodyGeometry(o: Outfit): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  // Torso: shirt with a trim stripe.
  b.add(new THREE.CapsuleGeometry(0.21, 0.3, 4, 10), o.shirt, [0, 0.82, 0], [0, 0, 0], [1, 1, 0.78]);
  b.add(new THREE.CylinderGeometry(0.215, 0.215, 0.05, 10), o.shirtTrim, [0, 0.86, 0], [0, 0, 0], [1, 1, 0.8]);
  b.add(new THREE.CylinderGeometry(0.2, 0.22, 0.22, 10), o.shorts, [0, 0.58, 0], [0, 0, 0], [1, 1, 0.82]);
  if (o.backpack) {
    b.add(new THREE.BoxGeometry(0.3, 0.32, 0.14), o.backpack, [0, 0.86, -0.2]);
    b.add(new THREE.BoxGeometry(0.22, 0.12, 0.06), "#a8733a", [0, 0.78, -0.28]);
  }
  // Neck and head.
  b.cyl(0.07, 0.08, 0.08, 0, 1.06, 0, o.skin, 8);
  b.sphere(0.21, 0, 1.3, 0, o.skin, [1, 1, 0.97], 14);
  // Hair cap and fringe.
  b.add(new THREE.SphereGeometry(0.22, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), o.hair, [0, 1.33, -0.015], [-0.25, 0, 0]);
  b.sphere(0.09, -0.09, 1.43, 0.13, o.hair, [1.2, 0.5, 0.7]);
  b.sphere(0.08, 0.07, 1.44, 0.14, o.hair, [1.1, 0.5, 0.7]);
  if (o.hat === "cap") {
    b.add(new THREE.SphereGeometry(0.225, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), o.hatColor, [0, 1.36, 0], [-0.12, 0, 0]);
    b.add(new THREE.CylinderGeometry(0.17, 0.17, 0.03, 12, 1, false, -Math.PI / 2, Math.PI), o.hatColor, [0, 1.42, 0.12], [-0.12, 0, 0], [1, 1, 1.3]);
  } else {
    b.add(new THREE.TorusGeometry(0.205, 0.035, 5, 16), o.hatColor, [0, 1.4, 0], [Math.PI / 2 - 0.1, 0, 0]);
    b.add(new THREE.BoxGeometry(0.05, 0.16, 0.04), o.hatColor, [0.06, 1.33, -0.22], [0.3, 0, 0.4]);
    b.add(new THREE.BoxGeometry(0.05, 0.14, 0.04), o.hatColor, [-0.02, 1.32, -0.22], [0.3, 0, -0.3]);
  }
  // Face: eyes, cheeks, smile.
  b.sphere(0.03, -0.075, 1.31, 0.19, "#1d1712", [1, 1.2, 0.6], 8);
  b.sphere(0.03, 0.075, 1.31, 0.19, "#1d1712", [1, 1.2, 0.6], 8);
  b.sphere(0.012, -0.068, 1.325, 0.215, "#ffffff", [1, 1, 0.5], 6);
  b.sphere(0.012, 0.082, 1.325, 0.215, "#ffffff", [1, 1, 0.5], 6);
  b.sphere(0.035, -0.13, 1.24, 0.16, "#ff9a8a", [1, 0.6, 0.4], 8);
  b.sphere(0.035, 0.13, 1.24, 0.16, "#ff9a8a", [1, 0.6, 0.4], 8);
  b.add(new THREE.TorusGeometry(0.045, 0.012, 4, 10, Math.PI), "#8a3a2a", [0, 1.23, 0.198], [0, 0, Math.PI]);
  return b.build();
}

export function legGeometry(o: Outfit): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  b.add(new THREE.CapsuleGeometry(0.075, 0.2, 4, 8), o.skin, [0, -0.2, 0]);
  b.add(new THREE.CapsuleGeometry(0.08, 0.1, 4, 8), o.shoes, [0, -0.4, 0.04], [Math.PI / 2, 0, 0], [1, 1.25, 1]);
  return b.build();
}

export function armGeometry(o: Outfit): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  b.add(new THREE.CapsuleGeometry(0.07, 0.08, 4, 8), o.shirt, [0, -0.06, 0]);
  b.add(new THREE.CapsuleGeometry(0.06, 0.2, 4, 8), o.skin, [0, -0.22, 0]);
  b.sphere(0.065, 0, -0.38, 0, o.skin, [1, 1, 1], 8);
  return b.build();
}
