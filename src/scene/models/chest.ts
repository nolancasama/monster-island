import * as THREE from "three";
import { PartBuilder } from "../partBuilder";

/** A treasure chest: the base, and the lid (hinged at its back edge). */
export function chestBaseGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0.2);
  b.box(0.95, 0.5, 0.66, 0, 0, 0, "#9a5e2c");
  b.box(1.0, 0.08, 0.7, 0, 0.12, 0, "#e0b33a");
  b.box(0.12, 0.2, 0.06, 0, 0.3, 0.33, "#e0b33a");
  return b.build();
}
export function chestLidGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  const lid = new THREE.CylinderGeometry(0.33, 0.33, 0.95, 10, 1, false, 0, Math.PI);
  lid.rotateZ(Math.PI / 2);
  lid.rotateX(-Math.PI / 2);
  b.add(lid, "#a8672f", [0, 0, 0.33]);
  b.box(1.0, 0.06, 0.08, 0, 0.0, 0.66, "#e0b33a");
  return b.build();
}
