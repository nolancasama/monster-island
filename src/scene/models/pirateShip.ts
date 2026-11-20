import * as THREE from "three";
import { PartBuilder } from "../partBuilder";
import { SEA_Y } from "../../game/world/island";
import { BOW_Z, BULWARK_THICKNESS, BUCKET, CANNONS, CARGO_SIZE, COUNTER_SIZE, CROWS_NEST_Y, DECK_BARRELS, DECK_Y, FISH_DECK, FISH_LANDING_Z, FISH_Y, HALF_BEAM, HOLD, HOLD_BARRELS, HOLD_BOX, HOLD_CEILING_Y, HOLD_DOOR, HOLD_HATCH_GUARDS, HOLD_HEADER_Y, HOLD_LANTERN, HOLD_PILLAR, HOLD_PORTAL, HOLD_RAMP, HOLD_SHELF, HOLD_STAIRS, HOLD_TABLE, HOLD_Y, MASTS, MESS, SAIL_FOOT, SPOT, STERN_RAMP, STERN_STAIRS, STERN_Z, SUPPLY_CRATES, SUPPLY_SIZE, hullHalf, type Box } from "../../game/world/pirateShip";

/**
 * Captain Redbeard's ship (docs/PIRATE_VOYAGE.md §2, §8) in LOCAL coordinates
 * (the scene places it at SHIP).
 * - `base`: hull, decks, companionway, galley fittings, cannons, helm, fishing deck.
 * - `tall`: fore and mizzen masts, rigging, the galley chimney and the stern
 *   lanterns, drawn with the material that dissolves between camera and player.
 * - `main`: the mainmast, built about its own foot so it can fall in the storm.
 * The three sails are their own meshes so they can billow and tear.
 */

const WOOD = "#6b4a30", DARK = "#4a2f1e", PLANK = "#b88a52", PLANK2 = "#a97d48", HOLDWOOD = "#8d6540", RED = "#b8322a", GOLD = "#e0b23a", IRON = "#3c3f44", SPAR = "#7a5532";
const HULL_BOTTOM = SEA_Y - 1.4, LOWER_HULL_THICKNESS = 0.35;
const FISH_PLATFORM_DEPTH = 0.2;
const stemZ = (inset: number) => BOW_Z - 1.4 + inset * 1.5;

/** The hull outline (starboard stern → bow → port stern), with a pointed bow. */
function outline(inset: number): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  for (let lz = STERN_Z; lz >= BOW_Z; lz -= 1) pts.push(new THREE.Vector2(Math.max(0.05, hullHalf(lz) - inset), -lz));
  pts.push(new THREE.Vector2(0, -stemZ(inset)));
  for (let lz = BOW_Z; lz <= STERN_Z; lz += 1) pts.push(new THREE.Vector2(-Math.max(0.05, hullHalf(lz) - inset), -lz));
  return pts;
}

/** The hull sides and transom, with a passage through to the fishing deck. */
function hullRing(b: PartBuilder, y0: number, y1: number, color: string, outer = 0, wall = 0.3) {
  const shape = new THREE.Shape([...outline(outer), ...outline(outer + wall).reverse()]);
  const g = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false, curveSegments: 1 });
  g.rotateX(-Math.PI / 2);
  b.add(g, color, [0, y0, 0]);
  const half = hullHalf(STERN_Z) - outer;
  const transom = (x0: number, x1: number, top: number) =>
    b.box(x1 - x0, top - y0, 0.2, (x0 + x1) / 2, y0, STERN_Z + 0.1, color);
  transom(-half, STERN_RAMP.x0, y1);
  transom(STERN_RAMP.x1, half, y1);
  const landingBase = FISH_Y - FISH_PLATFORM_DEPTH - 0.01;
  if (y0 < landingBase) transom(STERN_RAMP.x0, STERN_RAMP.x1, Math.min(y1, landingBase));
}

/** A flat horizontal shape at height y from local (x, z) points. */
function floor(b: PartBuilder, pts: Array<[number, number]>, y: number, color: string, holes: Array<Array<[number, number]>> = [], underside = false) {
  const plan = ([x, z]: [number, number]) => new THREE.Vector2(x, underside ? z : -z);
  const shape = new THREE.Shape(pts.map(plan));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(plan)));
  const g = new THREE.ShapeGeometry(shape);
  g.rotateX(underside ? Math.PI / 2 : -Math.PI / 2);
  b.add(g, color, [0, y, 0], [0, 0, 0], [1, 1, 1], { flatAo: true });
}

type Point = [number, number, number];
type Mast = keyof typeof MASTS;
type RiggingLine = { from: Point; to: Point; mesh: "base" | "tall" | "main"; fromOn: string; toOn: string };

const MAST_TIP_RADIUS = 0.13;
const BOOM = { length: 4.6, width: 0.16, z: 2.2, y: SAIL_FOOT - 0.07 };
const BOWSPRIT: [Point, Point] = [
  [0, DECK_Y + 0.7, stemZ(BULWARK_THICKNESS / 2)],
  [0, DECK_Y + 2.4, BOW_Z - 6],
];
const bowspritEye = (): Point => [
  0, THREE.MathUtils.lerp(BOWSPRIT[0][1], BOWSPRIT[1][1], 0.97),
  THREE.MathUtils.lerp(BOWSPRIT[0][2], BOWSPRIT[1][2], 0.97),
];
const masthead = (m: Mast, dx = 0): Point => [MASTS[m].x + dx, DECK_Y + MASTS[m].h - 0.15, MASTS[m].z];
const boomEnd = (m: Mast): Point => [
  MASTS[m].x - BOOM.width * 0.375, DECK_Y + BOOM.y, MASTS[m].z + BOOM.z + BOOM.length / 2 - 0.04,
];

/** All ropes, in ship-local coordinates before the mainmast's origin shift. */
export function riggingLines(): RiggingLine[] {
  // Low shrouds cross the walkable strip just inside the rails. The mainmast
  // carries only its topping lift, so both attachments fall together.
  const lifts = (["fore", "mizzen", "main"] as const).map((m): RiggingLine => ({
    // Run outboard of the gaff and the sail as they rise aft.
    from: masthead(m, -MAST_TIP_RADIUS * 0.8), to: boomEnd(m),
    mesh: m === "main" ? "main" : "tall", fromOn: `mast:${m}`, toOn: `boom:${m}`,
  }));
  return [
    ...lifts,
    { from: masthead("fore"), to: bowspritEye(), mesh: "tall", fromOn: "mast:fore", toOn: "bowsprit" },
    { from: bowspritEye(), to: [0, SEA_Y, stemZ(LOWER_HULL_THICKNESS / 2)], mesh: "base", fromOn: "bowsprit", toOn: "stem" },
  ];
}

function cylinderBetween(b: PartBuilder, from: Point, to: Point, r: number, color: string, segments: number) {
  const a = new THREE.Vector3(...from), c = new THREE.Vector3(...to);
  const axis = c.clone().sub(a);
  const g = new THREE.CylinderGeometry(r, r, axis.length(), segments);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.normalize()));
  const mid = a.add(c).multiplyScalar(0.5);
  b.add(g, color, [mid.x, mid.y, mid.z]);
}

/** A mast with its boom and gaff. The mainmast is built about its foot. */
function mast(b: PartBuilder, m: Mast, origin: Point = [0, 0, 0]) {
  const p = MASTS[m];
  const x = p.x - origin[0], z = p.z - origin[2], y = DECK_Y - origin[1], h = p.h;
  b.cyl(MAST_TIP_RADIUS, 0.24, h, x, y, z, SPAR, 8);
  b.boxAt(BOOM.width, BOOM.width, BOOM.length, [x, y + BOOM.y, z + BOOM.z], [0, 0, 0], SPAR);
  // The gaff rises aft from its jaws at the sail's head.
  b.boxAt(0.12, 0.12, 4.0, [x, y + p.gaff + 0.55, z + 1.85], [-0.28, 0, 0], SPAR);
}

function staircase(b: PartBuilder, ramp: Box, stairs: typeof HOLD_STAIRS, omitLast = false) {
  const width = ramp.x1 - ramp.x0, x = (ramp.x0 + ramp.x1) / 2;
  const treads = omitLast ? stairs.steps.slice(0, -1) : stairs.steps;
  for (const [i, { z0, z1, y }] of treads.entries()) {
    b.box(width, 0.16, z1 - z0, x, y - 0.16, (z0 + z1) / 2, i % 2 ? PLANK2 : PLANK);
  }
  const { slopeStart, slopeEnd, floorY } = stairs;
  const run = slopeEnd - slopeStart, rise = floorY(slopeEnd) - floorY(slopeStart);
  // Stringers sit just outside the treads (never above a walking surface).
  for (const edge of [ramp.x0 - 0.12, ramp.x1 + 0.12]) {
    b.boxAt(0.24, 0.26, Math.hypot(run, rise), [edge, (floorY(slopeStart) + floorY(slopeEnd)) / 2 - 0.2, (slopeStart + slopeEnd) / 2], [-Math.atan2(rise, run), 0, 0], DARK);
  }
}

function holdCompanionway(b: PartBuilder) {
  const hr = HOLD_RAMP, width = hr.x1 - hr.x0, x = (hr.x0 + hr.x1) / 2;
  const shaftWood = "#503522";
  // Each tread and riser owns a single face. The walls cover the stair edges.
  let lastY = HOLD_Y;
  for (const [i, { z0, z1, y }] of HOLD_STAIRS.steps.entries()) {
    b.add(new THREE.PlaneGeometry(width, z1 - z0), i % 2 ? PLANK2 : PLANK, [x, y, (z0 + z1) / 2], [-Math.PI / 2, 0, 0]);
    if (y > lastY) b.add(new THREE.PlaneGeometry(width, y - lastY), DARK, [x, (lastY + y) / 2, z0], [0, Math.PI, 0]);
    lastY = y;
  }
  // The collar continues down to the floor along both sides. The cap under
  // the top landing and the header over the lower doorway close the shaft.
  const [port, starboard, front] = HOLD_HATCH_GUARDS;
  const collarY = DECK_Y + 0.13;
  for (const side of [port, starboard]) {
    b.box(side.x1 - side.x0, collarY - HOLD_Y, side.z1 - side.z0, (side.x0 + side.x1) / 2,
      HOLD_Y, (side.z0 + side.z1) / 2, shaftWood);
  }
  b.box(width, collarY - HOLD_HEADER_Y, front.z1 - front.z0, x, HOLD_HEADER_Y, (front.z0 + front.z1) / 2, shaftWood);
  b.box(width, DECK_Y - HOLD_Y, 0.16, x, HOLD_Y, hr.z1 + 0.08, shaftWood);

  // The end rail fits between the side rails, which share their corner posts.
  const rail = 0.09, y = DECK_Y + 0.86, z = (front.z0 + front.z1) / 2;
  const railXs = [(port.x0 + port.x1) / 2, (starboard.x0 + starboard.x1) / 2];
  b.box(railXs[1] - railXs[0] - rail, rail, rail, x, y, z, GOLD);
  for (const railX of railXs) {
    b.box(rail, rail, hr.z1 - z + rail / 2, railX, y, (z + hr.z1 - rail / 2) / 2, GOLD);
    for (const postZ of [z, z + 1.1, z + 2.2, hr.z1 - rail]) {
      b.box(0.1, y - collarY, 0.1, railX, collarY, postZ, WOOD);
    }
  }
  b.box(0.1, y - collarY, 0.1, x, collarY, z, WOOD);
}

const SIGN_ATLAS = { width: 512, height: 1024, row: 192, inset: 5, whiteV: 0.125 };

export function supplySignAtlas(): THREE.CanvasTexture | null {
  const canvas = document.createElement("canvas");
  const { width, height, row } = SIGN_ATLAS;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "900 105px Arial, sans-serif";
  for (const [i, crate] of SUPPLY_CRATES.entries()) {
    const top = i * row;
    ctx.fillStyle = "#261b19";
    ctx.fillRect(0, top, width, row);
    ctx.strokeStyle = crate.color;
    ctx.lineWidth = 12;
    ctx.strokeRect(12, top + 12, width - 24, row - 24);
    ctx.fillStyle = "#fff4d8";
    ctx.fillText(crate.food.toUpperCase(), width / 2, top + row / 2 + 5, width - 64);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function supplySigns(b: PartBuilder) {
  const { row, height, width, inset } = SIGN_ATLAS;
  const signWidth = SUPPLY_SIZE.depth - 0.075, signHeight = 0.46, tilt = Math.PI / 8;
  for (const [i, c] of SUPPLY_CRATES.entries()) {
    // Raised wooden signs tilt slightly up toward the gameplay camera.
    const mount = (g: THREE.BufferGeometry) => g.rotateY(Math.PI / 2).rotateZ(tilt)
      .translate(SUPPLY_SIZE.width / 2 + Math.sin(tilt) * signHeight / 2 + 0.024, DECK_Y + 0.34, 0)
      .rotateY(c.yaw).translate(c.x, 0, c.z);
    const backing = new THREE.BoxGeometry(signWidth, signHeight, 0.045);
    backing.translate(0, 0, -0.02);
    const backingUV = backing.attributes.uv;
    for (let j = 0; j < backingUV.count; j++) backingUV.setXY(j, 0.5, SIGN_ATLAS.whiteV);
    b.add(mount(backing), DARK, [0, 0, 0]);
    const face = new THREE.PlaneGeometry(signWidth, signHeight);
    face.translate(0, 0, 0.004);
    const uv = face.attributes.uv;
    for (let j = 0; j < uv.count; j++) {
      uv.setXY(j, (inset + (width - 2 * inset) * uv.getX(j)) / width,
        1 - (i * row + inset + (row - 2 * inset) * (1 - uv.getY(j))) / height);
    }
    b.add(mount(face), "#ffffff", [0, 0, 0], [0, 0, 0], [1, 1, 1], { vary: false, flatAo: true });
  }
}

export interface ShipGeometries {
  base: THREE.BufferGeometry;
  tall: THREE.BufferGeometry;
  main: THREE.BufferGeometry;
  hold: THREE.BufferGeometry;
  lantern: THREE.BufferGeometry;
}

export function pirateShipGeometries(): ShipGeometries {
  const b = new PartBuilder(0), t = new PartBuilder(0), m = new PartBuilder(0);
  // Hull: dark lower hull, a red stripe, wooden bulwarks with a gold cap.
  hullRing(b, HULL_BOTTOM, DECK_Y - 0.45, DARK, 0, LOWER_HULL_THICKNESS);
  hullRing(b, DECK_Y - 0.45, DECK_Y - 0.15, RED, -0.02, 0.37);
  hullRing(b, DECK_Y - 0.15, DECK_Y + 0.85, WOOD, 0, BULWARK_THICKNESS);
  hullRing(b, DECK_Y + 0.85, DECK_Y + 0.95, GOLD, -0.03, 0.36);
  // The deck covers the hold from bow to stern, with a single guarded hatch.
  const inner = outline(BULWARK_THICKNESS).map((v): [number, number] => [v.x, -v.y]);
  const hr = HOLD_RAMP, sr = STERN_RAMP;
  const sternNotch = (edge: number): Array<[number, number]> =>
    [[sr.x0, edge], [sr.x0, sr.z0], [sr.x1, sr.z0], [sr.x1, edge]];
  const holdOpening: Array<[number, number]> = [
    [hr.x0, hr.z0], [hr.x1, hr.z0], [hr.x1, hr.z1], [hr.x0, hr.z1],
  ];
  floor(b, [...inner, ...sternNotch(STERN_Z)], DECK_Y, PLANK, [holdOpening.reverse()]);
  const atOpening = (x: number, z: number) => [hr, sr].some(
    ({ x0, x1, z0, z1 }) => x >= x0 - 0.025 && x <= x1 + 0.025 && z >= z0 && z <= z1,
  );
  for (let x = -(HALF_BEAM - 0.6); x <= HALF_BEAM - 0.6; x += 0.62) {
    // Plank seams, clipped to the hull and split around the hold and the stern stairs.
    let start: number | null = null;
    for (let lz = BOW_Z + 0.4; lz <= STERN_Z - 0.2; lz += 0.25) {
      const inside = Math.abs(x) < hullHalf(lz) - 0.4 && !atOpening(x, lz);
      if (inside && start === null) start = lz;
      if ((!inside || lz + 0.25 > STERN_Z - 0.2) && start !== null) {
        const end = inside ? lz : lz - 0.25;
        if (end - start > 0.6) b.boxAt(0.035, 0.012, end - start, [x, DECK_Y + 0.006, (start + end) / 2], [0, 0, 0], PLANK2);
        start = null;
      }
    }
  }
  const quarterEnd = 14.6, quarter = hullHalf(quarterEnd) - 0.4;
  floor(b, [
    [quarter, quarterEnd], [quarter, 7], [-quarter, 7], [-quarter, quarterEnd], ...sternNotch(quarterEnd),
  ], DECK_Y + 0.004, "#a3784a");

  holdCompanionway(b);
  const railLine = (x0: number, z0: number, x1: number, z1: number, y: number, endY = y) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 1.1));
    const postFoot = endY === y ? 0 : 0.25;
    b.boxAt(Math.abs(x1 - x0) + 0.08, 0.08, Math.hypot(z1 - z0, endY - y) + 0.08,
      [(x0 + x1) / 2, (y + endY) / 2 + 0.9, (z0 + z1) / 2], [-Math.atan2(endY - y, len), 0, 0], GOLD);
    for (let i = 0; i <= n; i++) b.box(0.08, 0.9 + postFoot, 0.08, x0 + (x1 - x0) * i / n, y + (endY - y) * i / n - postFoot, z0 + (z1 - z0) * i / n, WOOD);
  };

  // Open galley: stove and chimney, pot, supplies and a serving counter.
  const st = SPOT.stove;
  b.box(1.4, 0.9, 1.4, st.x, DECK_Y, st.z, "#2e3036");
  b.box(1.2, 0.05, 1.2, st.x, DECK_Y + 0.9, st.z, "#53565e");
  t.cyl(0.14, 0.14, 2.6, st.x + 0.45, DECK_Y + 0.9, st.z - 0.45, "#2e3036", 8);
  b.box(0.5, 0.35, 0.06, st.x, DECK_Y + 0.15, st.z + 0.71, "#1a1a1e");
  // The pot on the stove.
  b.cyl(0.42, 0.36, 0.42, st.x, DECK_Y + 0.95, st.z, "#3a3d44", 10);
  b.torus(0.42, 0.04, [st.x, DECK_Y + 1.37, st.z], [Math.PI / 2, 0, 0], "#5a5e66");
  // The coloured lids and the signs follow the angle of the port bulwark.
  for (const c of SUPPLY_CRATES) {
    const { width, depth, height } = SUPPLY_SIZE;
    b.boxAt(width, height - 0.1, depth, [c.x, DECK_Y + (height - 0.1) / 2, c.z], [0, c.yaw, 0], "#a77a46");
    b.boxAt(width - 0.1, 0.1, depth - 0.1, [c.x, DECK_Y + height - 0.05, c.z], [0, c.yaw, 0], c.color);
  }
  const ct = SPOT.counter;
  b.box(COUNTER_SIZE.width - 0.1, 0.95, COUNTER_SIZE.depth - 0.1, ct.x, DECK_Y, ct.z, "#8a5f3b");
  const counterTop = DECK_Y + 0.95, counterLip = 0.06;
  b.box(COUNTER_SIZE.width, counterLip, COUNTER_SIZE.depth, ct.x, counterTop, ct.z, "#c9a06a");
  for (const dx of [-0.84, -0.52, -0.2]) b.cyl(0.14, 0.12, 0.08, ct.x + dx, counterTop + counterLip, ct.z - 0.25, "#53565e", 8);
  // The mess table and its bench outside the galley.
  b.box(1.6, 0.08, 2.4, MESS.x, DECK_Y + 0.72, MESS.z, "#9a6c43");
  for (const [dx, dz] of [[-0.65, -1.0], [0.65, -1.0], [0.65, 1.0], [-0.65, 1.0]]) b.box(0.1, 0.72, 0.1, MESS.x + dx, DECK_Y, MESS.z + dz, DARK);

  // Fore and mizzen masts (cut away), the mainmast in its own mesh.
  mast(t, "fore");
  mast(t, "mizzen");
  const mainOrigin: Point = [MASTS.main.x, DECK_Y, MASTS.main.z];
  mast(m, "main", mainOrigin);
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
  staircase(b, sr, STERN_STAIRS, true);
  for (const x of [sr.x0 - 0.15, sr.x1 + 0.15]) {
    railLine(x, sr.z0, x, sr.z1, DECK_Y, FISH_Y);
  }
  const fishDeckEnd = FISH_DECK.z1 + 0.25, left = FISH_DECK.x0 - 0.2, right = FISH_DECK.x1 + 0.2;
  const platform = new THREE.Shape([
    [left, fishDeckEnd], [right, fishDeckEnd], [right, FISH_DECK.z0], [sr.x1, FISH_DECK.z0],
    [sr.x1, FISH_LANDING_Z], [sr.x0, FISH_LANDING_Z], [sr.x0, FISH_DECK.z0], [left, FISH_DECK.z0],
  ].map(([x, z]) => new THREE.Vector2(x, -z)));
  const fishingDeck = new THREE.ExtrudeGeometry(platform, { depth: FISH_PLATFORM_DEPTH, bevelEnabled: false });
  fishingDeck.rotateX(-Math.PI / 2);
  b.add(fishingDeck, PLANK, [0, FISH_Y - FISH_PLATFORM_DEPTH, 0]);
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
  cylinderBetween(b, ...BOWSPRIT, 0.13, SPAR, 6);
  b.torus(0.3, 0.07, [0, DECK_Y + 0.3, BOW_Z - 1.15], [0, Math.PI / 2, 0], GOLD);
  const builders = { base: b, tall: t, main: m };
  const aboutMain = ([x, y, z]: Point): Point => [x - mainOrigin[0], y - mainOrigin[1], z - mainOrigin[2]];
  for (const { from, to, mesh } of riggingLines()) {
    const [a, c] = mesh === "main" ? [aboutMain(from), aboutMain(to)] : [from, to];
    cylinderBetween(builders[mesh], a, c, 0.025, "#4a3424", 4);
  }
  // Barrels against the bulwarks (clear of every walking line).
  for (const { x, z } of DECK_BARRELS) { b.cyl(0.3, 0.3, 0.8, x, DECK_Y, z, "#8a5a32", 8); b.cyl(0.31, 0.31, 0.06, x, DECK_Y + 0.55, z, IRON, 8); }
  const untextured = b.vertexCount;
  supplySigns(b);
  // Reserve a second white atlas sample for the shade drawn over the unlit stairs.
  const shade = new THREE.PlaneGeometry(hr.x1 - hr.x0, DECK_Y - HOLD_Y);
  const shadeUV = shade.attributes.uv;
  for (let i = 0; i < shadeUV.count; i++) shadeUV.setXY(i, 0.875, SIGN_ATLAS.whiteV);
  b.add(shade, "#211611", [(hr.x0 + hr.x1) / 2, (HOLD_Y + DECK_Y) / 2, HOLD_PORTAL.enterZ - 0.12]);
  const base = b.build(), tall = t.build(), main = m.build();
  const uv = base.attributes.uv;
  for (let i = 0; i < untextured; i++) uv.setXY(i, 0.5, SIGN_ATLAS.whiteV);
  for (const g of [base, tall, main]) g.computeVertexNormals();
  return { base, tall, main, hold: holdGeometry(), lantern: holdLanternGeometry() };
}

function holdGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0), h = HOLD;
  const width = h.x1 - h.x0, length = h.z1 - h.z0, midZ = (h.z0 + h.z1) / 2;
  const room: Array<[number, number]> = [[h.x0, h.z0], [h.x1, h.z0], [h.x1, h.z1], [h.x0, h.z1]];
  floor(b, room, HOLD_Y, HOLDWOOD);
  floor(b, room, HOLD_CEILING_Y, "#94704e", [], true);
  const wallH = DECK_Y - HOLD_Y;
  const wall = 0.16;
  b.box(width + 2 * wall, wallH, wall, 0, HOLD_Y, h.z0 - wall / 2, WOOD);
  const [port, starboard] = HOLD_HATCH_GUARDS;
  for (const [a, c] of [[h.x0 - wall, port.x0], [starboard.x1, h.x1 + wall]]) {
    b.box(c - a, wallH, wall, (a + c) / 2, HOLD_Y, h.z1 + wall / 2, WOOD);
  }
  for (const x of [h.x0 - wall / 2, h.x1 + wall / 2]) b.box(wall, wallH, length, x, HOLD_Y, midZ, WOOD);
  // Plank seams on the floor and ceiling, and visible ribs along the room.
  for (let x = h.x0 + 0.45; x < h.x1; x += 0.6) {
    b.box(0.023, 0.009, length - 0.02, x, HOLD_Y + 0.001, midZ, DARK);
    b.box(0.028, 0.012, length, x, HOLD_CEILING_Y - 0.013, midZ, DARK);
  }
  for (let z = h.z0 + 0.45; z < h.z1; z += 2.25) {
    b.box(width, 0.058, 0.19, 0, HOLD_CEILING_Y - 0.058, z, DARK);
    for (const x of [h.x0 + 0.025, h.x1 - 0.025]) b.box(0.05, HOLD_CEILING_Y - HOLD_Y - 0.058, 0.17, x, HOLD_Y, z, DARK);
  }
  for (let y = HOLD_Y + 0.46; y < HOLD_CEILING_Y; y += 0.46) {
    for (const x of [h.x0 + 0.005, h.x1 - 0.005]) b.box(0.012, 0.02, length, x, y, midZ, DARK);
    b.box(width, 0.02, 0.012, 0, y, h.z0 + 0.005, DARK);
  }
  const { x, z, r } = HOLD_PILLAR;
  b.cyl(r - 0.04, r - 0.04, HOLD_CEILING_Y - HOLD_Y, x, HOLD_Y, z, SPAR, 12);
  for (const y of [0.08, HOLD_CEILING_Y - HOLD_Y - 0.16]) b.cyl(r, r, 0.08, x, HOLD_Y + y, z, DARK, 12);

  for (const [at, size] of [[SPOT.table, HOLD_TABLE], [SPOT.shelf, HOLD_SHELF]] as const) {
    const { width, depth, top, board, leg } = size;
    b.box(width, board, depth, at.x, HOLD_Y + top - board, at.z, "#9a6c43");
    for (const dx of [-1, 1]) for (const dz of [-1, 1]) {
      b.box(leg, top - board, leg, at.x + dx * (width / 2 - leg / 2 - 0.02), HOLD_Y,
        at.z + dz * (depth / 2 - leg / 2 - 0.02), DARK);
    }
  }
  const shelfX = HOLD.x0 + 0.33, shelfBottom = HOLD_Y + HOLD_SHELF.top - HOLD_SHELF.board;
  for (const dz of [-0.86, 0.86]) {
    b.boxAt(0.9, 0.1, 0.13, [shelfX, shelfBottom - 0.35, SPOT.shelf.z + dz], [0, 0, 0.78], DARK);
  }
  const bx = SPOT.box;
  const box = HOLD_BOX, boxWall = box.height - box.base;
  b.box(box.width, box.base, box.depth, bx.x, HOLD_Y, bx.z, "#9a6c43");
  for (const sign of [-1, 1]) {
    b.box(box.width, boxWall, box.wall, bx.x, HOLD_Y + box.base, bx.z + sign * (box.depth - box.wall) / 2, "#d8a865");
    b.box(box.wall, boxWall, box.depth - 2 * box.wall, bx.x + sign * (box.width - box.wall) / 2, HOLD_Y + box.base, bx.z, "#c79659");
  }
  const dr = SPOT.door, frame = 0.09, doorH = 1.98;
  b.box(HOLD_DOOR.width - 2 * frame, doorH, 0.08, dr.x, HOLD_Y, dr.z, "#c0392b");
  b.box(HOLD_DOOR.width, 0.12, HOLD_DOOR.depth, dr.x, HOLD_Y + doorH, dr.z, DARK);
  for (const s of [-1, 1]) b.box(frame, doorH, HOLD_DOOR.depth, dr.x + s * (HOLD_DOOR.width - frame) / 2, HOLD_Y, dr.z, DARK);
  b.sphere(0.05, dr.x + 0.32, HOLD_Y + 1, dr.z + 0.069, GOLD, [1, 1, 1], 6);
  for (const { x, z } of HOLD_BARRELS) {
    b.cyl(0.28, 0.28, 0.76, x, HOLD_Y, z, "#9a6838", 8);
    for (const y of [0.16, 0.57]) b.cyl(0.3, 0.3, 0.065, x, HOLD_Y + y, z, IRON, 8);
  }
  const l = HOLD_LANTERN;
  b.box(0.07, HOLD_CEILING_Y - l.y - 0.2, 0.07, l.x, l.y + 0.2, l.z, IRON);
  b.cyl(0.14, 0.18, 0.075, l.x, l.y + 0.125, l.z, IRON, 8);
  b.cyl(0.18, 0.15, 0.075, l.x, l.y - 0.2, l.z, IRON, 8);
  for (const [dx, dz] of [[0.12, 0.1], [0.12, -0.1], [-0.12, 0.1], [-0.12, -0.1]]) b.box(0.028, 0.25, 0.028, l.x + dx, l.y - 0.125, l.z + dz, IRON);
  const geometry = b.build();
  geometry.computeVertexNormals();
  return geometry;
}

function holdLanternGeometry(): THREE.BufferGeometry {
  const glass = new THREE.CylinderGeometry(0.145, 0.145, 0.25, 8);
  return glass.translate(HOLD_LANTERN.x, HOLD_LANTERN.y, HOLD_LANTERN.z);
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
  const { radius: r, height: h } = CARGO_SIZE[item];
  if (item === "barrel") {
    b.cyl(r - 0.025, r - 0.025, h, 0, 0, 0, "#c0392b", 12);
    for (const y of [0.14, h - 0.21]) b.cyl(r, r, 0.07, 0, y, 0, IRON, 12);
  } else if (item === "bag") {
    b.sphere(r, 0, h * 0.43, 0, "#2f6fd0", [1, h * 0.43 / r, 0.85], 10);
    b.cyl(r * 0.33, r * 0.47, h * 0.23, 0, h * 0.77, 0, "#2f6fd0", 8);
    b.torus(r * 0.35, 0.026, [0, h * 0.87, 0], [Math.PI / 2, 0, 0], GOLD);
  } else {
    b.cyl(r * 0.91, r, h * 0.59, 0, 0, 0, "#2ea44f", 12);
    b.cyl(r * 0.36, r * 0.91, h * 0.25, 0, h * 0.59, 0, "#2ea44f", 12);
    b.cyl(r * 0.33, r * 0.33, h * 0.16, 0, h * 0.84, 0, "#a77a46", 8);
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
