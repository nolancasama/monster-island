import * as THREE from "three";
import { TENT_SIZE } from "../../game/world/island";
import { PartBuilder } from "../partBuilder";
import { between } from "./nature";

const CANVAS = "#e9ba70";
const SEAM = "#ad7b43";
const WOOD = "#775332";
const ROPE = "#e7d8b5";
const INSIDE = "#59432c";

/** A closed canvas panel, including its thickness and outward-facing end caps. */
function panel(points: [number, number][], depth: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  points.forEach(([x, y], i) => i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y));
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
}

/** Local +z is the entrance. The canvas keeps the existing 3.2 × 2.8 m footprint. */
export function tentGeometry(groundOffset: (x: number, z: number) => number = () => 0): THREE.BufferGeometry {
  const b = new PartBuilder(0.35);
  const w = TENT_SIZE.width / 2, d = TENT_SIZE.depth / 2, h = TENT_SIZE.height;
  const eave = 0.8, base = -0.18;
  const outline: [number, number][] = [[-w, base], [w, base], [w, eave], [0, h], [-w, eave]];
  // Thick walls, closed roof facets and a ground cloth overlap at every seam.
  b.add(panel(outline, 0.06), CANVAS, [0, 0, -d]);
  for (const side of [-1, 1]) {
    b.box(0.06, eave - base, 2 * d, side * (w - 0.03), base, 0, CANVAS);
    const roof: [number, number][] = side < 0
      ? [[-w, eave - 0.06], [0, h - 0.06], [0, h], [-w, eave]]
      : [[0, h - 0.06], [w, eave - 0.06], [w, eave], [0, h]];
    b.add(panel(roof, 2 * d), side < 0 ? "#f0c782" : CANVAS, [0, 0, -d]);
    b.box(0.025, 0.045, 2 * d + 0.015, side * (w + 0.006), eave - 0.03, 0, SEAM);
    b.box(0.025, 0.06, 2 * d + 0.015, side * (w + 0.006), 0.045, 0, SEAM);
    // Stitched roof seams follow the slope rather than float above it.
    for (const z of [-d + 0.015, 0, d - 0.015]) {
      between(b, [side * w, eave + 0.006, z], [0, h + 0.006, z], 0.012, 0.012, SEAM, 4);
    }
  }
  b.box(2 * w, 0.035, 2 * d, 0, base, 0, INSIDE);
  // The front panel has a real doorway, with a dark recessed interior behind it.
  // Its walls and floor close the recess, so no view can see through the tent.
  const door = 0.52, doorH = 1.42;
  const front: [number, number][] = [
    [-w, base], [-door, base], [-door, doorH], [door, doorH], [door, base],
    [w, base], [w, eave], [0, h], [-w, eave]
  ];
  b.add(panel(front, 0.06), "#f2cc8c", [0, 0, d - 0.06]);
  b.box(door * 2, doorH - base, 0.04, 0, base, d - 0.34, INSIDE);
  for (const side of [-1, 1]) {
    b.box(0.045, doorH - base, 0.32, side * door, base, d - 0.17, INSIDE);
    b.box(0.045, doorH + 0.03, 0.025, side * door, 0, d + 0.012, SEAM);
  }
  b.box(door * 2, 0.035, 0.32, 0, doorH - 0.035, d - 0.17, INSIDE);
  // Rolled-back canvas flap and its two ties sit directly over the doorway.
  b.cylAt(0.105, 1.17, [0, doorH + 0.06, d + 0.04], [0, 0, Math.PI / 2], "#f4d49a", 10);
  for (const x of [-0.36, 0.36]) {
    b.cylAt(0.108, 0.045, [x, doorH + 0.06, d + 0.04], [0, 0, Math.PI / 2], WOOD, 10);
  }
  // Exterior ridge pole, upright poles and taut ropes anchored into the terrain.
  b.cylAt(0.045, 2 * d + 0.34, [0, h + 0.025, 0], [Math.PI / 2, 0, 0], WOOD, 8);
  for (const side of [-1, 1]) {
    const z = side * (d + 0.12), bottom = groundOffset(0, z) - 0.035;
    b.cyl(0.035, 0.045, h + 0.025 - bottom, 0, bottom, z, WOOD, 8);
    for (const xSide of [-1, 1]) {
      const x = xSide * (w + 0.45), pegZ = side * (d + 0.35), y = groundOffset(x, pegZ);
      between(b, [xSide * (w - 0.025), eave - 0.015, side * (d - 0.08)], [x, y + 0.04, pegZ], 0.014, 0.014, ROPE, 5);
      b.cyl(0.025, 0.035, 0.16, x, y - 0.07, pegZ, WOOD, 6);
    }
  }
  return b.build();
}

/** Details on Maple's existing map table; the existing crates stay beside it. */
export function expeditionEquipmentGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  // Folded map with a coast, a trail and three survey marks, all opaque geometry.
  b.box(0.7, 0.018, 0.53, 0, 1.002, 0.1, "#efe1b6");
  b.box(0.008, 0.004, 0.52, 0.02, 1.02, 0.1, "#c5b78d");
  between(b, [-0.25, 1.024, -0.08], [-0.12, 1.024, 0.06], 0.009, 0.009, "#79a8a2", 4);
  between(b, [-0.12, 1.024, 0.06], [-0.21, 1.024, 0.29], 0.009, 0.009, "#79a8a2", 4);
  for (const z of [-0.06, 0.1, 0.25]) b.cyl(0.018, 0.018, 0.006, 0.18, 1.022, z, "#a46a47", 5);
  // Ceramic specimen jars: coloured opaque bodies, corks and cream paper labels.
  for (const [x, z, colour] of [[-0.65, 0.22, "#8da58b"], [-0.43, 0.27, "#9caa78"]] as const) {
    b.cyl(0.075, 0.085, 0.2, x, 0.9, z, colour, 8);
    b.cyl(0.059, 0.059, 0.055, x, 1.1, z, WOOD, 8);
    b.box(0.095, 0.075, 0.014, x, 0.955, z + 0.078, "#efe1b6");
  }
  // Brass expedition lantern, with solid amber panes and a carry handle.
  const x = 0.57, z = 0.22;
  b.cyl(0.115, 0.13, 0.06, x, 0.9, z, WOOD, 8);
  b.cyl(0.085, 0.085, 0.22, x, 0.96, z, "#ffd582", 6);
  b.cyl(0.13, 0.1, 0.045, x, 1.18, z, WOOD, 8);
  for (const dx of [-0.075, 0.075]) for (const dz of [-0.045, 0.045]) {
    b.box(0.015, 0.24, 0.015, x + dx, 0.95, z + dz, WOOD);
  }
  b.torus(0.075, 0.012, [x, 1.29, z], [0, 0, 0], WOOD);
  return b.build();
}
