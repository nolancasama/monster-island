import * as THREE from "three";
import { PartBuilder } from "../partBuilder";
import { SEA_Y } from "../../game/world/island";
import { BOW_Z, BUCKET, CANNONS, CROWS_NEST_Y, DECK_BARRELS, DECK_Y, FISH_DECK, FISH_Y, HALF_BEAM, HOLD, HOLD_RAMP, HOLD_Y, MASTS, MESS, SPOT, STERN_RAMP, STERN_Z, SUPPLY_CRATES, hullHalf } from "../../game/world/pirateShip";

/**
 * Captain Redbeard's ship (docs/PIRATE_VOYAGE.md §2, §8) in LOCAL coordinates
 * (the scene places it at SHIP). Cutaway: no ceilings anywhere.
 * - `base`: hull, decks, hold, galley fittings, cannons, helm, fishing deck.
 * - `tall`: fore and mizzen masts, rigging, the galley bulkhead and the stern
 *   lanterns, drawn with the material that dissolves between camera and player.
 * - `main`: the mainmast, built about its own foot so it can fall in the storm.
 * The three sails are their own meshes so they can billow and tear.
 */

const WOOD = "#6b4a30", DARK = "#4a2f1e", PLANK = "#b88a52", PLANK2 = "#a97d48", HOLDWOOD = "#8d6540", RED = "#b8322a", GOLD = "#e0b23a", IRON = "#3c3f44", SPAR = "#7a5532";

/** The hull outline (starboard stern → bow → port stern), with a pointed bow. */
function outline(inset: number): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  for (let lz = STERN_Z; lz >= BOW_Z; lz -= 1) pts.push(new THREE.Vector2(Math.max(0.05, hullHalf(lz) - inset), -lz));
  pts.push(new THREE.Vector2(0, -(BOW_Z - 1.4 + inset * 1.5)));
  for (let lz = BOW_Z; lz <= STERN_Z; lz += 1) pts.push(new THREE.Vector2(-Math.max(0.05, hullHalf(lz) - inset), -lz));
  return pts;
}

/** A ring of hull from y0 to y1 (outer outline minus an inner one), standing up. */
function hullRing(b: PartBuilder, y0: number, y1: number, color: string, outer = 0, wall = 0.3) {
  const shape = new THREE.Shape(outline(outer));
  shape.holes.push(new THREE.Path(outline(outer + wall).reverse()));
  const g = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false, curveSegments: 1 });
  g.rotateX(-Math.PI / 2);
  b.add(g, color, [0, y0, 0]);
}

/** A flat horizontal shape at height y from local (x, z) points. */
function floor(b: PartBuilder, pts: Array<[number, number]>, y: number, color: string, holes: Array<Array<[number, number]>> = []) {
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(-Math.PI / 2);
  b.add(g, color, [0, y, 0], [0, 0, 0], [1, 1, 1], { flatAo: true });
}

/** A thin round line between two points. */
function line(b: PartBuilder, a: THREE.Vector3, c: THREE.Vector3, r: number, color: string, seg = 4) {
  const g = new THREE.CylinderGeometry(r, r, a.distanceTo(c), seg);
  g.lookAt(c.clone().sub(a));
  g.rotateX(Math.PI / 2);
  const mid = a.clone().add(c).multiplyScalar(0.5);
  b.add(g, color, [mid.x, mid.y, mid.z]);
}

const rect = (x0: number, x1: number, z0: number, z1: number): Array<[number, number]> => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

/** A mast with its boom, gaff and shrouds; `origin` shifts it (the mainmast is built about its foot). */
function mast(b: PartBuilder, p: { x: number; z: number }, m: { h: number; gaff: number }, origin = { x: 0, y: 0, z: 0 }) {
  const x = p.x - origin.x, z = p.z - origin.z, y = DECK_Y - origin.y, h = m.h;
  b.cyl(0.13, 0.24, h, x, y, z, SPAR, 8);
  b.boxAt(0.16, 0.16, 4.6, [x, y + 2.25, z + 2.2], [0, 0, 0], SPAR);
  // The gaff rises aft from its jaws at the sail's head.
  b.boxAt(0.12, 0.12, 4.0, [x, y + m.gaff + 0.55, z + 1.85], [-0.28, 0, 0], SPAR);
  for (const s of [-1, 1]) {
    line(b, new THREE.Vector3(x, y + h - 0.4, z), new THREE.Vector3(s * (hullHalf(p.z) - 0.2) - origin.x, y + 0.9, z + 0.6), 0.025, "#4a3424");
  }
}

export interface ShipGeometries { base: THREE.BufferGeometry; tall: THREE.BufferGeometry; main: THREE.BufferGeometry }

export function pirateShipGeometries(): ShipGeometries {
  const b = new PartBuilder(0), t = new PartBuilder(0), m = new PartBuilder(0);
  // Hull: dark lower hull, a red stripe, wooden bulwarks with a gold cap.
  hullRing(b, SEA_Y - 1.4, DECK_Y - 0.45, DARK, 0, 0.35);
  hullRing(b, DECK_Y - 0.45, DECK_Y - 0.15, RED, -0.02, 0.37);
  hullRing(b, DECK_Y - 0.15, DECK_Y + 0.85, WOOD, 0, 0.3);
  hullRing(b, DECK_Y + 0.85, DECK_Y + 0.95, GOLD, -0.03, 0.36);
  // The deck, around the hold opening and the stern stairs; a darker quarterdeck.
  const inner = outline(0.3).map((v) => [v.x, -v.y] as [number, number]);
  const holdRim = HOLD.x1 + 0.25, sr = STERN_RAMP;
  floor(b, inner, DECK_Y, PLANK, [rect(-HOLD.x1 - 0.2, HOLD.x1 + 0.2, -8, -1).reverse(), rect(sr.x0, sr.x1, 12, 15).reverse()]);
  for (let x = -(HALF_BEAM - 0.6); x <= HALF_BEAM - 0.6; x += 0.62) {
    // Plank seams, clipped to the hull and split around the hold and the stern stairs.
    let start: number | null = null;
    for (let lz = BOW_Z + 0.4; lz <= STERN_Z - 0.2; lz += 0.25) {
      const inside = Math.abs(x) < hullHalf(lz) - 0.4 && !(Math.abs(x) < holdRim && lz > -8.05 && lz < -0.95) && !(x > sr.x0 - 0.05 && x < sr.x1 + 0.05 && lz > 11.95);
      if (inside && start === null) start = lz;
      if ((!inside || lz + 0.25 > STERN_Z - 0.2) && start !== null) {
        const end = inside ? lz : lz - 0.25;
        if (end - start > 0.6) b.boxAt(0.035, 0.012, end - start, [x, DECK_Y + 0.006, (start + end) / 2], [0, 0, 0], PLANK2);
        start = null;
      }
    }
  }
  const quarter = hullHalf(14.6) - 0.4;
  floor(b, rect(-quarter, quarter, 7, 14.6).reverse(), DECK_Y + 0.004, "#a3784a", [rect(sr.x0, sr.x1, 12, 15).reverse()]);

  // The hold: floor, walls, the stairs down, rails round the opening.
  b.box(HOLD.x1 - HOLD.x0 + 0.4, 0.2, HOLD.z1 - HOLD.z0 + 0.4, 0, HOLD_Y - 0.2, (HOLD.z0 + HOLD.z1) / 2, HOLDWOOD);
  const holdW = 2 * holdRim + 0.2;
  for (const [x, z, w, d] of [[0, -8.05, holdW, 0.2], [0, -0.95, holdW, 0.2], [-holdRim, -4.5, 0.2, 7.1], [holdRim, -4.5, 0.2, 7.1]] as const)
    b.box(w, DECK_Y - HOLD_Y, d, x, HOLD_Y, z, z === -0.95 ? WOOD : DARK);
  const rampLen = Math.hypot(HOLD_RAMP.z1 - HOLD_RAMP.z0, DECK_Y - HOLD_Y), rampTilt = Math.atan2(DECK_Y - HOLD_Y, HOLD_RAMP.z1 - HOLD_RAMP.z0);
  const rampX = (HOLD_RAMP.x0 + HOLD_RAMP.x1) / 2;
  b.boxAt(1.0, 0.12, rampLen, [rampX, (HOLD_Y + DECK_Y) / 2 - 0.06, (HOLD_RAMP.z0 + HOLD_RAMP.z1) / 2], [rampTilt, 0, 0], PLANK2);
  for (let i = 1; i < 10; i++) {
    const k = i / 10;
    b.boxAt(1.0, 0.05, 0.08, [rampX, HOLD_Y + (DECK_Y - HOLD_Y) * k + 0.01, HOLD_RAMP.z0 + (HOLD_RAMP.z1 - HOLD_RAMP.z0) * k], [0, 0, 0], DARK);
  }
  const railLine = (x0: number, z0: number, x1: number, z1: number, y: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 1.1));
    b.boxAt(Math.abs(x1 - x0) + 0.08, 0.08, Math.abs(z1 - z0) + 0.08, [(x0 + x1) / 2, y + 0.9, (z0 + z1) / 2], [0, 0, 0], GOLD);
    for (let i = 0; i <= n; i++) b.box(0.08, 0.9, 0.08, x0 + (x1 - x0) * i / n, y, z0 + (z1 - z0) * i / n, WOOD);
  };
  const rampRail = HOLD_RAMP.x1 + 0.15;
  railLine(-holdRim, -8.05, holdRim, -8.05, DECK_Y);
  railLine(holdRim, -8.05, holdRim, -0.95, DECK_Y);
  railLine(-holdRim, -8.05, -holdRim, 2, DECK_Y);
  railLine(rampRail, -0.95, holdRim, -0.95, DECK_Y);
  railLine(rampRail, -0.95, rampRail, 2, DECK_Y);
  // Hold furniture: a table, a wall shelf, an open box, a red door on the bow wall.
  const tb = SPOT.table;
  b.box(1.6, 0.1, 1.5, tb.x, HOLD_Y + 0.92, tb.z, "#9a6c43");
  for (const [dx, dz] of [[-0.7, -0.65], [0.7, -0.65], [0.7, 0.65], [-0.7, 0.65]]) b.box(0.1, 0.92, 0.1, tb.x + dx, HOLD_Y, tb.z + dz, DARK);
  const sh = SPOT.shelf;
  b.box(0.62, 0.08, 2.2, sh.x + 0.05, HOLD_Y + 1.25, sh.z, "#9a6c43");
  for (const dz of [-0.9, 0.9]) b.boxAt(0.5, 0.08, 0.08, [sh.x + 0.05, HOLD_Y + 1.1, sh.z + dz], [0, 0, 0.6], DARK);
  const bx = SPOT.box;
  b.box(1.2, 0.08, 1.2, bx.x, HOLD_Y, bx.z, "#c79a5c");
  for (const [dx, dz, w, d] of [[0, -0.56, 1.2, 0.08], [0, 0.56, 1.2, 0.08], [-0.56, 0, 0.08, 1.2], [0.56, 0, 0.08, 1.2]] as const) b.box(w, 0.55, d, bx.x + dx, HOLD_Y, bx.z + dz, "#d8a865");
  const dr = SPOT.door;
  b.box(1.0, 1.6, 0.1, dr.x, HOLD_Y, -7.9, "#c0392b");
  b.box(1.16, 0.12, 0.12, dr.x, HOLD_Y + 1.6, -7.88, DARK);
  for (const s of [-1, 1]) b.box(0.1, 1.6, 0.12, dr.x + s * 0.55, HOLD_Y, -7.88, DARK);
  b.sphere(0.05, dr.x + 0.32, HOLD_Y + 0.85, -7.82, GOLD, [1, 1, 1], 6);
  // Cargo-hold clutter along the walls (not on any slot).
  for (const [x, z] of [[HOLD.x1 - 0.45, -7.4], [HOLD.x1 - 0.45, -1.6]]) { b.cyl(0.28, 0.28, 0.7, x, HOLD_Y, z, "#8a5a32", 8); b.cyl(0.29, 0.29, 0.06, x, HOLD_Y + 0.5, z, IRON, 8); }

  // The galley: a bulkhead with a door (cut away), stove and chimney, the pot, supplies, a counter, pans.
  for (const [x0, x1] of [[-(HALF_BEAM - 0.1), -1], [1, HALF_BEAM - 0.1]]) {
    const w = x1 - x0;
    t.box(w, 2.3, 0.3, (x0 + x1) / 2, DECK_Y, -13, WOOD);
    t.box(w + 0.05, 0.12, 0.36, (x0 + x1) / 2, DECK_Y + 2.3, -13, GOLD);
  }
  t.box(2.2, 0.3, 0.32, 0, DECK_Y + 2.0, -13, WOOD);
  for (const x of [-1.6, 1.6]) t.boxAt(0.16, 0.16, 5.2, [x, DECK_Y + 2.45, -15.6], [0, 0, 0], DARK);
  const st = SPOT.stove;
  b.box(1.4, 0.9, 1.4, st.x, DECK_Y, st.z, "#2e3036");
  b.box(1.2, 0.05, 1.2, st.x, DECK_Y + 0.9, st.z, "#53565e");
  t.cyl(0.14, 0.14, 2.6, st.x + 0.45, DECK_Y + 0.9, st.z - 0.45, "#2e3036", 8);
  b.box(0.5, 0.35, 0.06, st.x, DECK_Y + 0.15, st.z + 0.71, "#1a1a1e");
  // The pot on the stove.
  b.cyl(0.42, 0.36, 0.42, st.x, DECK_Y + 0.95, st.z, "#3a3d44", 10);
  b.torus(0.42, 0.04, [st.x, DECK_Y + 1.37, st.z], [Math.PI / 2, 0, 0], "#5a5e66");
  // Supply crates: fish, meat, apples, bananas (labels on top match the food).
  for (const c of SUPPLY_CRATES) {
    b.box(0.95, 0.6, 0.72, c.x, DECK_Y, c.z, "#a77a46");
    b.boxAt(0.8, 0.12, 0.6, [c.x, DECK_Y + 0.64, c.z], [0, 0, 0], c.color);
  }
  const ct = SPOT.counter;
  b.box(0.9, 0.95, 2.2, ct.x, DECK_Y, ct.z, "#8a5f3b");
  b.box(1.0, 0.06, 2.3, ct.x, DECK_Y + 0.95, ct.z, "#c9a06a");
  for (const x of [-0.6, 0.2, 1.0]) t.cyl(0.14, 0.12, 0.08, x, DECK_Y + 1.5, -13.2, "#53565e", 8);
  // The mess table and its bench outside the galley.
  b.box(1.6, 0.08, 2.4, MESS.x, DECK_Y + 0.72, MESS.z, "#9a6c43");
  for (const [dx, dz] of [[-0.65, -1.0], [0.65, -1.0], [0.65, 1.0], [-0.65, 1.0]]) b.box(0.1, 0.72, 0.1, MESS.x + dx, DECK_Y, MESS.z + dz, DARK);

  // Fore and mizzen masts (cut away), the mainmast in its own mesh.
  mast(t, SPOT.foreMast, MASTS.fore);
  mast(t, SPOT.mizzenMast, MASTS.mizzen);
  const mm = SPOT.mainMast, o = { x: mm.x, y: DECK_Y, z: mm.z };
  mast(m, mm, MASTS.main, o);
  m.cyl(0.75, 0.6, 0.55, 0, CROWS_NEST_Y, 0, SPAR, 10);
  m.box(1.25, 0.8, 0.04, 0.65, 12.3, 0, "#1d1d22");
  m.sphere(0.2, 0.6, 12.75, 0.03, "#f6f2e6", [1, 0.95, 0.4], 7);
  for (const s of [-1, 1]) m.boxAt(0.06, 0.06, 0.02, [0.6 + s * 0.07, 12.78, 0.07], [0, 0, 0], "#1d1d22");
  m.boxAt(0.42, 0.05, 0.03, [0.6, 12.45, 0.04], [0, 0, 0.6], "#f6f2e6");
  m.boxAt(0.42, 0.05, 0.03, [0.6, 12.45, 0.04], [0, 0, -0.6], "#f6f2e6");

  // Cannons along both rails, the helm, lanterns and stern windows.
  for (const { x, z, side: s } of CANNONS) {
    b.box(0.6, 0.3, 0.7, x, DECK_Y, z, "#5a3c26");
    b.cylAt(0.15, 1.1, [x + s * 0.35, DECK_Y + 0.45, z], [0, 0, Math.PI / 2], IRON, 8);
  }
  const hm = SPOT.helm;
  b.cyl(0.12, 0.16, 1.0, hm.x, DECK_Y, hm.z, "#5a3c26", 8);
  b.torus(0.48, 0.05, [hm.x, DECK_Y + 1.25, hm.z - 0.15], [0, 0, 0], "#8a5a2b");
  for (let i = 0; i < 4; i++) b.boxAt(1.2, 0.05, 0.05, [hm.x, DECK_Y + 1.25, hm.z - 0.15], [0, 0, i * Math.PI / 4], "#8a5a2b");
  for (const s of [-1, 1]) {
    const lx = s * (hullHalf(14.3) - 0.6);
    t.cyl(0.05, 0.06, 1.6, lx, DECK_Y + 0.9, 14.3, IRON, 6);
    t.box(0.3, 0.38, 0.3, lx, DECK_Y + 2.45, 14.3, "#ffe08a");
  }
  for (const x of [-3.6, -1.2, 1.2]) b.box(0.9, 0.9, 0.1, x, DECK_Y - 0.4, STERN_Z + 0.01, "#ffd98a");

  // The stern stairs down to the fishing deck, and the fishing deck itself.
  const sLen = Math.hypot(sr.z1 - sr.z0, DECK_Y - FISH_Y), sTilt = -Math.atan2(DECK_Y - FISH_Y, sr.z1 - sr.z0), srX = (sr.x0 + sr.x1) / 2;
  b.boxAt(1.2, 0.12, sLen, [srX, (DECK_Y + FISH_Y) / 2 - 0.06, (sr.z0 + sr.z1) / 2], [sTilt, 0, 0], PLANK2);
  for (let i = 1; i < 11; i++) {
    const k = i / 11;
    b.boxAt(1.2, 0.05, 0.08, [srX, DECK_Y + (FISH_Y - DECK_Y) * k + 0.01, sr.z0 + (sr.z1 - sr.z0) * k], [0, 0, 0], DARK);
  }
  railLine(sr.x0 - 0.15, 12, sr.x0 - 0.15, 15.4, DECK_Y - 0.6);
  b.box(FISH_DECK.x1 - FISH_DECK.x0 + 0.4, 0.2, FISH_DECK.z1 - FISH_DECK.z0 + 0.3, 0, FISH_Y - 0.2, (FISH_DECK.z0 + FISH_DECK.z1) / 2 + 0.1, PLANK);
  const fx = FISH_DECK.x1 + 0.1, fr = FISH_DECK.x1 + 0.15;
  for (const [x, z] of [[-fx, 18.1], [fx, 18.1], [-fx, 15.6], [fx, 15.6]]) b.cyl(0.12, 0.12, 2.0, x, SEA_Y - 1.4, z, DARK, 6);
  railLine(-fr, 18.15, fr, 18.15, FISH_Y);
  railLine(-fr, 15.5, -fr, 18.15, FISH_Y);
  railLine(fr, 15.5, fr, 18.15, FISH_Y);
  // The fish bucket and a coiled net.
  const bk = BUCKET;
  b.cyl(0.32, 0.26, 0.5, bk.x, FISH_Y, bk.z, "#8a5a32", 10);
  b.torus(0.31, 0.03, [bk.x, FISH_Y + 0.5, bk.z], [Math.PI / 2, 0, 0], IRON);
  b.cyl(0.29, 0.29, 0.02, bk.x, FISH_Y + 0.38, bk.z, "#3f7fae", 10);
  b.box(1.6, 0.06, 0.9, 2.1, FISH_Y + 0.005, 17.55, "#4f6b45");

  // The bowsprit and a gold scroll at the bow.
  line(b, new THREE.Vector3(0, DECK_Y + 0.7, BOW_Z - 0.8), new THREE.Vector3(0, DECK_Y + 2.4, BOW_Z - 6), 0.13, SPAR, 6);
  b.torus(0.3, 0.07, [0, DECK_Y + 0.3, BOW_Z - 1.15], [0, Math.PI / 2, 0], GOLD);
  // Barrels against the bulwarks (clear of every walking line).
  for (const { x, z } of DECK_BARRELS) { b.cyl(0.3, 0.3, 0.8, x, DECK_Y, z, "#8a5a32", 8); b.cyl(0.31, 0.31, 0.06, x, DECK_Y + 0.55, z, IRON, 8); }
  const base = b.build(), tall = t.build(), main = m.build();
  for (const g of [base, tall, main]) g.computeVertexNormals();
  return { base, tall, main };
}

/**
 * Panel edges up a gaff sail (fractions of its height). The rows sit exactly on
 * the stripe edges and every face carries one flat colour, so the three red
 * bands stay crisp at any distance (no colour is interpolated across a face).
 */
export const SAIL_ROWS = [0, 0.12, 0.24, 0.44, 0.56, 0.76, 0.88, 1];
export const SAIL_RED_ROWS = [1, 3, 5];
/** A torn sail is missing a ragged hole across its middle bands (row, column). */
const TORN = new Set(["2,2", "2,3", "3,2", "3,3", "4,3"]);
export const SAIL_CREAM = "#f2e8d0", SAIL_RED = "#c23b2e";

/** A gaff sail (in the y–z plane, curving out along +x) bent to full billow; scale x to slacken it. */
export function sailGeometry(h: number, torn = false): THREE.BufferGeometry {
  const w = 4.1, cols = 6, top = 1.15, rows = SAIL_ROWS.length - 1;
  const at = (r: number, c: number): [number, number, number] => {
    const u = c / cols, v = SAIL_ROWS[r];
    return [Math.sin(u * Math.PI) * Math.sin(v * Math.PI * 0.9 + 0.15) * 0.9, v * (h + top * u), u * w];
  };
  const pos: number[] = [], col: number[] = [];
  const cream = new THREE.Color(SAIL_CREAM), red = new THREE.Color(SAIL_RED);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (torn && TORN.has(`${r},${c}`)) continue;
    const tint = SAIL_RED_ROWS.includes(r) ? red : cream;
    for (const [rr, cc] of [[r, c], [r + 1, c], [r, c + 1], [r, c + 1], [r + 1, c], [r + 1, c + 1]]) {
      pos.push(...at(rr, cc));
      col.push(tint.r, tint.g, tint.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------ small props (jobs, storm, raft)

/** The hold's cargo: a red barrel, a blue bag, a green bottle (each sits on y = 0). */
export function cargoGeometry(item: "barrel" | "bag" | "bottle"): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  if (item === "barrel") {
    b.cyl(0.3, 0.3, 0.72, 0, 0, 0, "#c0392b", 10);
    for (const y of [0.12, 0.56]) b.cyl(0.315, 0.315, 0.05, 0, y, 0, "#3c3f44", 10);
  } else if (item === "bag") {
    b.sphere(0.32, 0, 0.3, 0, "#2f6fd0", [1, 0.95, 0.85], 10);
    b.cyl(0.1, 0.16, 0.18, 0, 0.56, 0, "#2f6fd0", 8);
    b.torus(0.11, 0.03, [0, 0.66, 0], [Math.PI / 2, 0, 0], "#e0b23a");
  } else {
    b.cyl(0.17, 0.2, 0.46, 0, 0, 0, "#2ea44f", 10);
    b.cyl(0.07, 0.15, 0.16, 0, 0.46, 0, "#2ea44f", 8);
    b.cyl(0.06, 0.06, 0.12, 0, 0.62, 0, "#a77a46", 6);
  }
  return b.build();
}

/** A cooked dish: a bowl with the food's colour. */
export function dishGeometry(color: string): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  b.cyl(0.26, 0.16, 0.16, 0, 0, 0, "#f2e8d0", 10);
  b.sphere(0.2, 0, 0.16, 0, color, [1, 0.45, 1], 8);
  return b.build();
}

/** An old boot (the fishing job's joke catch). */
export function bootGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  b.box(0.22, 0.42, 0.26, 0, 0, -0.06, "#5a4632");
  b.box(0.24, 0.16, 0.5, 0, 0, 0.08, "#4a3a28");
  return b.build();
}

/** Floating obstacles: a sea rock and a drifting barrel. */
export function rockGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  b.add(new THREE.DodecahedronGeometry(1.6, 0), "#6e6a64", [0, 0.2, 0], [0.3, 0.5, 0], [1.2, 0.9, 1]);
  b.add(new THREE.DodecahedronGeometry(1.0, 0), "#7d7972", [0.9, 0.5, 0.6], [0.8, 0.1, 0.4]);
  return b.build();
}
export function floatBarrelGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  b.add(new THREE.CylinderGeometry(0.45, 0.45, 1.1, 10), "#8a5a32", [0, 0, 0], [Math.PI / 2, 0, 0.3]);
  for (const z of [-0.35, 0.35]) b.add(new THREE.CylinderGeometry(0.47, 0.47, 0.06, 10), "#3c3f44", [0, 0, z], [Math.PI / 2, 0, 0.3]);
  return b.build();
}

/** A small deck fire: three flame cones (animated by scale). */
export function fireGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  b.cone(0.32, 0.8, 0, 0, 0, "#ff7a1a", 6);
  b.cone(0.2, 0.6, 0.18, 0, 0.1, "#ffb21a", 6);
  b.cone(0.18, 0.55, -0.16, 0, -0.08, "#ffd84a", 6);
  return b.build();
}

/** The fallen spar (a broken yard) lying across a pirate. */
export function sparGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  b.cylAt(0.16, 3.6, [0, 0.18, 0], [0, 0, Math.PI / 2], SPAR, 8);
  b.boxAt(0.5, 0.12, 0.12, [1.65, 0.18, 0], [0.4, 0, 0], "#9a6c43");
  return b.build();
}

/** A lifeboat with two oars (pirates are drawn in it separately). */
export function lifeboatGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  b.add(new THREE.CylinderGeometry(0.9, 0.55, 0.6, 7), "#7a4f2e", [0, 0.1, 0], [0, 0, 0], [1.2, 1, 2.6]);
  b.box(1.8, 0.08, 3.6, 0, 0.38, 0, "#a97d48");
  for (const s of [-1, 1]) b.boxAt(2.2, 0.06, 0.12, [s * 1.3, 0.45, 0], [0, 0, s * -0.35], "#c9a06a");
  return b.build();
}

/** The raft: a floating hatch, its three plank slots, a little mast and sail. */
export function raftGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  b.box(2.6, 0.22, 2.4, 0, -0.22, 0, "#8a6440");
  for (const x of [-0.9, 0, 0.9]) b.box(0.08, 0.02, 2.3, x, 0.0, 0, "#6b4a30");
  return b.build();
}
export function plankGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  b.box(0.8, 0.16, 2.5, 0, -0.16, 0, "#b88a52");
  b.box(0.06, 0.02, 2.4, 0.2, 0.0, 0, "#8d6540");
  return b.build();
}
export function raftSailGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  b.cyl(0.06, 0.07, 3.2, 0, 0, 0, SPAR, 6);
  b.add(new THREE.PlaneGeometry(1.8, 2.0, 1, 1), "#f2e8d0", [0, 2.0, 0.05], [0, 0, 0]);
  return b.build();
}

/** A far island silhouette for the raft's horizon (≈ 80 m wide). */
export function islandGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  b.add(new THREE.ConeGeometry(30, 22, 7), "#3f5a4a", [0, 6, 0], [0, 0.3, 0], [1.6, 1, 0.6]);
  b.add(new THREE.ConeGeometry(16, 30, 6), "#4c6b55", [12, 10, 4], [0, 0.7, 0], [1, 1, 0.6]);
  b.add(new THREE.ConeGeometry(14, 14, 6), "#56755c", [-26, 2, 2], [0, 0.1, 0], [1.4, 1, 0.6]);
  return b.build();
}
