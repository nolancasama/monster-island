import * as THREE from "three";
import type { CloudEnemyKind } from "../../game/data/combat";
import { PartBuilder } from "../partBuilder";
import { between } from "./nature";

/** One merged low-poly body per creature, including the raiders' crescent. */
export function cloudEnemyGeometry(kind: CloudEnemyKind): THREE.BufferGeometry {
  const b = new PartBuilder(0.2);
  let badgeY = 0.8;
  let badgeZ = 0.4;
  let badgeColor = "#413659";
  if (kind === "stormCrab") {
    b.sphere(0.58, 0, 0.42, 0, "#627c99", [1.1, 0.65, 0.9], 10);
    b.box(0.95, 0.28, 0.25, 0, 0.4, 0.43, "#a5bbcc");
    for (const s of [-1, 1]) {
      for (const z of [-0.3, 0, 0.25]) between(b, [s * 0.4, 0.3, z], [s * 0.85, 0.08, z - 0.15], 0.055, 0.04, "#41556e", 4);
      between(b, [s * 0.48, 0.4, 0.25], [s * 0.84, 0.5, 0.62], 0.1, 0.16, "#7693af", 5);
      b.sphere(0.2, s * 0.84, 0.54, 0.64, "#a5bbcc", [1, 0.8, 1.4], 6);
      b.cyl(0.035, 0.05, 0.25, s * 0.21, 0.65, 0.3, "#41556e", 5);
      b.sphere(0.09, s * 0.21, 0.92, 0.3, "#fff2c5", [1, 1, 1], 6);
      b.sphere(0.04, s * 0.21, 0.92, 0.37, "#171a2c", [1, 1, 0.5], 6);
    }
    badgeY = 0.52; badgeZ = 0.575; badgeColor = "#a5bbcc";
  } else if (kind === "windSprite") {
    b.sphere(0.4, 0, 0.95, 0, "#a4cddd", [1, 1.05, 0.8], 10);
    b.sphere(0.27, 0, 0.65, 0, "#7197bd", [0.7, 1.2, 0.7], 8);
    for (const s of [-1, 1]) b.add(new THREE.ConeGeometry(0.19, 0.6, 5), "#c4e7ec", [s * 0.45, 1.02, -0.02], [0, 0, -s * 1.1]);
    b.add(new THREE.ConeGeometry(0.18, 0.5, 6), "#88adc9", [0, 0.36, 0], [Math.PI, 0, 0]);
    badgeY = 0.72; badgeZ = 0.23;
    b.box(0.35, 0.24, 0.06, 0, 0.61, 0.2, badgeColor);
  } else if (kind === "raiderDrone") {
    b.sphere(0.44, 0, 0.95, 0, "#626a7b", [1.2, 0.65, 0.9], 8);
    b.box(0.6, 0.18, 0.15, 0, 0.83, 0.36, "#363147");
    b.sphere(0.1, 0, 0.94, 0.47, "#ff4b53", [1, 1, 0.5], 8);
    for (const s of [-1, 1]) {
      b.box(0.43, 0.09, 0.12, s * 0.49, 0.94, 0, "#9da7b9");
      b.torus(0.25, 0.045, [s * 0.66, 1.12, 0], [Math.PI / 2, 0, 0], "#aab7c4");
      b.box(0.43, 0.035, 0.07, s * 0.66, 1.11, 0, "#34384f");
    }
    badgeY = 1.16; badgeZ = 0.25;
    b.box(0.3, 0.25, 0.05, 0, 1.04, 0.22, badgeColor);
  } else {
    b.sphere(0.65, 0, 0.5, -0.07, "#594b87", [1, 0.65, 1.15], 10);
    b.box(0.08, 0.15, 0.85, 0, 0.79, -0.07, "#f7d972");
    b.sphere(0.26, 0, 0.48, 0.58, "#38394e", [1, 0.9, 0.8], 8);
    for (const s of [-1, 1]) {
      for (const z of [-0.35, 0.04, 0.38]) between(b, [s * 0.48, 0.3, z], [s * 0.8, 0.05, z + 0.1], 0.05, 0.04, "#39364e", 4);
      between(b, [s * 0.12, 0.65, 0.59], [s * 0.23, 1.0, 0.66], 0.035, 0.02, "#f7d972", 4);
    }
    badgeY = 0.61; badgeZ = 0.77; badgeColor = "#38394e";
  }
  if (kind !== "stormCrab" && kind !== "raiderDrone") {
    for (const s of [-1, 1]) {
      b.sphere(0.075, s * 0.12, kind === "windSprite" ? 1.03 : 0.58, kind === "windSprite" ? 0.3 : 0.77, "#fff2c5", [1, 1, 0.5], 6);
      b.sphere(0.033, s * 0.12, kind === "windSprite" ? 1.03 : 0.58, kind === "windSprite" ? 0.34 : 0.8, "#171a2c", [1, 1, 0.5], 6);
    }
  }
  // Two offset discs make the same white crescent used on the airship.
  b.add(new THREE.CylinderGeometry(0.105, 0.105, 0.025, 12), "#fff6cf", [0, badgeY, badgeZ], [Math.PI / 2, 0, 0]);
  b.add(new THREE.CylinderGeometry(0.085, 0.085, 0.03, 12), badgeColor, [0.045, badgeY + 0.02, badgeZ + 0.02], [Math.PI / 2, 0, 0]);
  return b.build();
}
