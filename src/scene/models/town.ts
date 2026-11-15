import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { PartBuilder } from "../partBuilder";
import { rockGeometry } from "./nature";
import { SEA_Y, groundY } from "../../game/world/island";
import { CRATES, FOUNTAIN, HOUSES, LAMPS, PIER2, PORT, PORT_WALL, SERVICES, TOWN_GATE, type ServiceId } from "../../game/world/lowland";

/**
 * Port Town (docs/PORT_TOWN_REVAMP.md §2), as two merged meshes:
 * - the base (volumes, gable roofs, chimneys, the giant hat, quay, pier, boat and
 *   lighthouse) is drawn at any distance, at no more triangles than before;
 * - the detail (timber frames, shutters, flower boxes, awnings, shop props, lamps,
 *   the fountain and the sign boards) only near the town.
 * Buildings are modelled in their own frame (front = +z, ridge along x, ground
 * y = 0) on their unchanged footprints, then placed. The fixed camera looks south,
 * so the north faces and the roofs carry most of each shop's identity.
 */

/** The detail mesh draws within this distance of its bounds (coast, causeway and town views). */
export const TOWN_DETAIL_FAR = 40;

interface Look { wall: string; trim: string; roof: string; accent: string; h: number; rise: number; storeys?: 2; chimney?: boolean; dormer?: boolean }
const LOOK: Record<ServiceId, Look> = {
  market: { wall: "#f6e3c0", trim: "#6e452a", roof: "#d9553f", accent: "#3f9a52", h: 3, rise: 1.5 },
  clothes: { wall: "#ffe8f1", trim: "#6b4a7a", roof: "#8d5cc9", accent: "#ff7eb6", h: 3.2, rise: 1.7 },
  trainer: { wall: "#e4edf8", trim: "#5a4632", roof: "#2f6fc0", accent: "#ffd23f", h: 3.1, rise: 1.4, chimney: true },
  inn: { wall: "#f7efe0", trim: "#5a3e2a", roof: "#2f8f86", accent: "#2f6fc0", h: 4.4, rise: 1.9, storeys: 2, chimney: true },
  harbor: { wall: "#eef3f6", trim: "#26467a", roof: "#2c4f86", accent: "#e8553f", h: 3, rise: 1.2 },
};
const HOUSE_EXTRA: Array<Partial<Look>> = [{ chimney: true, rise: 1.8 }, { dormer: true, rise: 1.6 }, { chimney: true, rise: 1.3, h: 2.8 }];
const STONE = "#9d9585", DOOR = "#6a4428", GLASS = "#8fd0ea", WOOD = "#8a5f3b", DARKWOOD = "#5a3c26";

const gy = (x: number, z: number) => groundY(x, z);

/** A closed triangular prism along x (the gable attic), no bottom face; flat normals. */
function prism(w: number, d: number, rise: number): THREE.BufferGeometry {
  const hw = w / 2, hd = d / 2;
  const v = [
    -hw, 0, -hd, -hw, 0, hd, -hw, rise, 0,
    hw, 0, hd, hw, 0, -hd, hw, rise, 0,
    -hw, 0, hd, hw, 0, hd, hw, rise, 0, -hw, 0, hd, hw, rise, 0, -hw, rise, 0,
    hw, 0, -hd, -hw, 0, -hd, -hw, rise, 0, hw, 0, -hd, -hw, rise, 0, hw, rise, 0,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

/** Two roof slabs with eaves and gable overhangs, plus a ridge beam, over a w × d attic. */
function roof(b: PartBuilder, w: number, d: number, y: number, rise: number, color: string, ridge: string) {
  const S = Math.hypot(d / 2, rise), a = Math.atan2(rise, d / 2), L = S + .42, t = .13;
  for (const side of [1, -1]) {
    const uy = -rise / S, uz = side * (d / 2) / S, ny = (d / 2) / S, nz = side * rise / S;
    const cy = y + rise + uy * (L / 2 - .08) + ny * t / 2, cz = uz * (L / 2 - .08) + nz * t / 2;
    b.boxAt(w + .5, t, L, [0, cy, cz], [side * a, 0, 0], color);
  }
  b.boxAt(w + .56, .16, .2, [0, y + rise + .09, 0], [0, 0, 0], ridge);
}

/** A window on a wall facing local +z (front) or ±x (gable ends): glass, frame, shutters, maybe flowers. */
function window(b: PartBuilder, l: Look, face: "front" | "back" | "left" | "right", u: number, y: number, w: number, d: number, flowers: boolean) {
  const out = face === "front" || face === "right" ? 1 : -1;
  const along = face === "front" || face === "back";
  const at = (s: number, off: number): [number, number, number] => along ? [u + s, y, out * (d / 2 + off)] : [out * (w / 2 + off), y, u + s];
  const rot: [number, number, number] = along ? [0, 0, 0] : [0, Math.PI / 2, 0];
  b.boxAt(.66, .66, .05, at(0, .02), rot, GLASS);
  b.boxAt(.8, .1, .1, at(0, .05).map((v, i) => (i === 1 ? v - .37 : v)) as [number, number, number], rot, l.trim);
  b.boxAt(.06, .7, .06, at(0, .05), rot, l.trim);
  for (const s of [-1, 1]) b.boxAt(.3, .7, .05, at(s * .5, .06), rot, l.accent);
  if (!flowers) return;
  const p = at(0, .18);
  b.boxAt(.74, .16, .2, [p[0], y - .48, p[2]], rot, WOOD);
  for (const [s, c] of [[-.22, "#ff6f9e"], [0, "#ffd23f"], [.22, "#ff8a3c"]] as const) {
    const q = at(s, .2);
    b.boxAt(.13, .13, .13, [q[0], y - .33, q[2]], [0, .6, .78], c);
  }
  const g = at(0, .2);
  b.boxAt(.62, .06, .16, [g[0], y - .37, g[2]], rot, "#5aa04a");
}

/** One building's base (volumes and roof) or detail (frames, windows, door trims) in its own frame. */
function building(l: Look, w: number, d: number, detail: boolean): THREE.BufferGeometry {
  const b = new PartBuilder(detail ? 0 : 0.45);
  if (!detail) {
    b.box(w + .18, .5, d + .18, 0, -.32, 0, STONE);
    b.box(w, l.h, d, 0, 0, 0, l.wall);
    b.add(prism(w, d, l.rise), l.wall, [0, l.h, 0]);
    roof(b, w, d, l.h, l.rise, l.roof, l.trim);
    b.boxAt(.95, 1.85, .08, [0, .92, d / 2 + .03], [0, 0, 0], DOOR);
    if (l.chimney) b.box(.6, l.rise + 1, .6, w * .28, l.h + .2, -d * .18, "#b9a48c");
    if (l.dormer) {
      b.box(1.1, .8, .9, -w * .18, l.h + .25, d * .2, l.wall);
      b.add(prism(1.25, 1.05, .5), l.roof, [-w * .18, l.h + 1.05, d * .2], [0, Math.PI / 2, 0]);
    }
    return b.build();
  }
  // Timber frame: corner posts, the eave beam, a floor band on two storeys.
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) b.box(.18, l.h, .18, x * (w / 2 - .02), 0, z * (d / 2 - .02), l.trim);
  b.boxAt(w + .1, .16, d + .1, [0, l.h - .06, 0], [0, 0, 0], l.trim);
  if (l.storeys) b.boxAt(w + .08, .14, d + .08, [0, l.h * .5, 0], [0, 0, 0], l.trim);
  // Door frame and step.
  b.boxAt(1.15, .14, .12, [0, 1.9, d / 2 + .05], [0, 0, 0], l.trim);
  for (const s of [-1, 1]) b.boxAt(.12, 1.9, .12, [s * .55, .95, d / 2 + .05], [0, 0, 0], l.trim);
  b.box(1.3, .14, .45, 0, .1, d / 2 + .22, STONE);
  // Windows: front, both gable ends; upper floor on the inn.
  const rows = l.storeys ? [1.55, 3.35] : [1.75];
  for (const y of rows) {
    for (const s of [-1, 1]) window(b, l, "front", s * w * .3, y, w, d, y === rows[0]);
    for (const face of ["left", "right"] as const) window(b, l, face, 0, y, w, d, y === rows[0] && face === "left");
    window(b, l, "back", w * .22, y, w, d, false);
  }
  if (l.storeys) window(b, l, "front", 0, 3.35, w, d, false);
  return b.build();
}

/** A barrel standing on y (world or local). */
function barrel(b: PartBuilder, x: number, y: number, z: number, s = 1) {
  b.cyl(.3 * s, .3 * s, .82 * s, x, y, z, "#8a5a32", 8);
  for (const hy of [.18, .62]) b.cyl(.315 * s, .315 * s, .07 * s, x, y + hy * s, z, "#4b4f55", 8);
}

/** Service props in the building's frame (front = +z); `north` is the local direction of world north. */
function serviceProps(b: PartBuilder, id: ServiceId, l: Look, w: number, d: number, north: [number, number]) {
  const fz = d / 2;
  // A shallow awning: deep ones hide everything under them from the high camera.
  const awning = (c1: string, c2: string) => {
    const n = 7, span = w - .8;
    for (let i = 0; i < n; i++) b.boxAt(span / n + .01, .06, 1, [-span / 2 + span * (i + .5) / n, 2.74, fz + .45], [.36, 0, 0], i % 2 ? c2 : c1);
    b.boxAt(span + .1, .1, .1, [0, 2.57, fz + .93], [0, 0, 0], c1);
    for (const s of [-1, 1]) b.boxAt(.08, .08, .8, [s * (span / 2 - .1), 2.45, fz + .35], [-.6, 0, 0], l.trim);
  };
  if (id === "market") {
    awning("#e8553f", "#ffffff");
    // The produce display on the north end, facing the camera: apples, bananas, fish, berries.
    const nx = north[0] * (w / 2 + .42);
    for (const [z, c] of [[-1.35, "#e83a35"], [-.45, "#ffd23f"], [.45, "#5a7ea0"], [1.35, "#8a4fd0"]] as const) {
      b.box(.56, .52, .8, nx, 0, z, WOOD);
      b.boxAt(.48, .16, .7, [nx, .57, z], [0, 0, 0], c);
      for (const o of [-.2, .15]) b.sphere(.11, nx + (o > 0 ? .05 : -.05), .68, z + o, c, [1, .8, 1], 6);
    }
    barrel(b, north[0] * (w / 2 - .45), 0, fz + .5);
    b.cyl(.22, .17, .3, north[0] * (w / 2 - 1.15), 0, fz + .45, "#c99a5a", 8);
  } else if (id === "clothes") {
    awning("#ff7eb6", "#ffffff");
    // Bunting along the eave.
    const flags = ["#ff4f8b", "#ffd23f", "#4fc3ff", "#5fd35a", "#8d5cc9", "#ff8a3c", "#ff4f8b", "#4fc3ff", "#ffd23f"];
    flags.forEach((c, i) => b.boxAt(.24, .24, .03, [-w / 2 + .45 + (w - .9) * i / (flags.length - 1), l.h - .28 - Math.sin(i / (flags.length - 1) * Math.PI) * .12, fz + .1], [0, 0, .78], c));
    // A hat stand by the north corner of the front.
    const hx = north[0] * (w / 2 - .45), hz = fz + .55;
    b.cyl(.05, .07, 1.6, hx, 0, hz, DARKWOOD, 6);
    b.cyl(.22, .26, .06, hx, 0, hz, DARKWOOD, 8);
    b.cyl(.13, .12, .26, hx, 1.62, hz, "#2a2a33", 8);
    b.cyl(.21, .21, .03, hx, 1.6, hz, "#2a2a33", 8);
    b.cone(.11, .26, hx + .2, 1.25, hz, "#ff5fa2", 6);
    b.cyl(.15, .15, .03, hx - .2, 1.2, hz, "#ffcc33", 6);
  } else if (id === "trainer") {
    // The training yard: sand, two straw dummies, a ring target on the north wall.
    b.boxAt(w - .6, .04, 2.5, [0, .02, fz + 1.3], [0, 0, 0], "#e2cd96");
    for (const s of [-1, 1]) {
      const x = s * (w / 2 - .55), z = fz + .75;
      b.cyl(.06, .07, 1.05, x, 0, z, DARKWOOD, 6);
      b.cyl(.25, .27, .72, x, .7, z, "#d8b45a", 8);
      b.sphere(.19, x, 1.6, z, "#e2c06a", [1, 1, 1], 6);
      b.boxAt(.9, .1, .1, [x, 1.2, z], [0, 0, 0], "#a77a3a");
      b.boxAt(.42, .08, .05, [x, 1.0, z + .26], [0, 0, 0], "#e8553f");
    }
    const tx = north[0] * (w / 2 + .05), tz = north[1] * (d / 2 + .05);
    const rot: [number, number, number] = north[0] !== 0 ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0];
    for (const [r, c, o] of [[.66, "#e8443a", 0], [.46, "#ffffff", .03], [.24, "#e8443a", .06]] as const)
      b.cylAt(r, .06, [tx + north[0] * o, 1.95, tz + north[1] * o], rot, c, 12);
  } else if (id === "inn") {
    // Lanterns by the door and a hanging moon sign.
    for (const s of [-1, 1]) {
      b.boxAt(.2, .28, .2, [s * .85, 2.05, fz + .16], [0, 0, 0], "#3c3c44");
      b.boxAt(.13, .18, .13, [s * .85, 2.05, fz + .2], [0, 0, 0], "#ffe27a");
    }
    const sx = -north[0] * (w / 2 - .5);
    b.boxAt(.08, .08, .9, [sx, 3.05, fz + .45], [0, 0, 0], DARKWOOD);
    b.boxAt(.72, .62, .06, [sx, 2.62, fz + .8], [0, 0, 0], "#2f3f74");
    b.boxAt(.16, .36, .07, [sx - .08, 2.64, fz + .8], [0, 0, .3], "#ffe27a");
    b.boxAt(.14, .26, .07, [sx + .02, 2.6, fz + .8], [0, 0, -.5], "#2f3f74");
  } else if (id === "harbor") {
    // The keeper's side is the north (back) wall: an anchor, a ship's wheel, rope and barrels.
    // (Local x runs west here: the sign hangs at world x ≈ 65, the keeper stands at 69.8.)
    const bz = -fz - .05;
    b.boxAt(.14, 1.05, .06, [-1.6, 1.7, bz], [0, 0, 0], "#26467a");
    b.boxAt(.62, .1, .06, [-1.6, 2.1, bz], [0, 0, 0], "#26467a");
    for (const s of [-1, 1]) b.boxAt(.42, .1, .06, [-1.6 + s * .2, 1.27, bz], [0, 0, s * .6], "#26467a");
    b.torus(.08, .025, [-1.6, 2.3, bz], [0, 0, 0], "#26467a");
    b.torus(.36, .04, [2.7, 1.75, bz], [0, 0, 0], DARKWOOD);
    for (let i = 0; i < 4; i++) b.boxAt(.82, .05, .04, [2.7, 1.75, bz - .01], [0, 0, i * Math.PI / 4], DARKWOOD);
    for (const x of [1.2, 1.8]) barrel(b, x, 0, -fz - .45, .9);
    b.torus(.26, .07, [-.2, .07, -fz - .45], [Math.PI / 2, 0, 0], "#c9a86a");
  }
}

interface Placed { x: number; z: number; w: number; d: number; yaw: number; look: Look; id?: ServiceId }
function placedBuildings(): Placed[] {
  const out: Placed[] = Object.values(SERVICES).map(s => ({ ...s.house, look: LOOK[s.id], id: s.id }));
  HOUSES.forEach((h, i) => out.push({ x: h.x, z: h.z, w: h.w, d: h.d, yaw: h.yaw, look: { wall: h.color, trim: "#6a4a30", roof: h.roof, accent: i === 1 ? "#ff8a3c" : "#3f9a52", h: 3.1, rise: 1.5, ...HOUSE_EXTRA[i] } }));
  return out;
}

/** Buildings sit .15 m into the ground (uneven plaza); props stand on it (`lift` .15). */
function place(g: THREE.BufferGeometry, p: Placed, lift = 0): THREE.BufferGeometry {
  return g.applyMatrix4(new THREE.Matrix4().compose(
    new THREE.Vector3(p.x, gy(p.x, p.z) - .15 + lift, p.z), new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, p.yaw), new THREE.Vector3(1, 1, 1)));
}

const merge = (parts: THREE.BufferGeometry[]) => {
  const merged = mergeGeometries(parts, false);
  parts.forEach(p => p.dispose());
  merged.computeBoundingSphere();
  return merged;
};

/** Volumes, roofs, the clothes shop's giant hat, quay, pier, boat and lighthouse: drawn at any distance. */
export function townGeometry(): THREE.BufferGeometry {
  const parts = placedBuildings().map(p => place(building(p.look, p.w, p.d, false), p));
  // The clothes shop's landmark: a giant purple top hat with a pink band and bow on the ridge.
  const hat = new PartBuilder(0);
  const c = SERVICES.clothes.house, l = LOOK.clothes, top = l.h + l.rise - .12;
  hat.cyl(1.05, 1.05, .12, 0, top, 0, "#7b4fc9", 12);
  hat.cyl(.62, .58, 1.3, 0, top + .1, 0, "#7b4fc9", 10);
  hat.cyl(.635, .6, .26, 0, top + .16, 0, "#ff7eb6", 10);
  for (const s of [-1, 1]) hat.boxAt(.42, .3, .1, [s * .26, top + .29, .62], [0, 0, s * .4], "#ff4f8b");
  parts.push(place(hat.build(), { ...c, look: l }));
  // The quay wall, the pier and its posts, a moored boat, the lighthouse.
  const b = new PartBuilder(0.4);
  const qz = PORT.z0 - 0.2, qy = gy(76, PORT.z0 + 1);
  b.box(PORT.x1 - PORT.x0 + 6, qy + 4.4, 1, (PORT.x0 + PORT.x1) / 2, -4.4, qz, "#a59a88");
  const deck = qy + PIER2.deckY;
  b.box(PIER2.half * 2, 0.16, PIER2.z1 - PIER2.z0, PIER2.x, deck - 0.16, (PIER2.z0 + PIER2.z1) / 2, "#b88a52");
  for (let z = PIER2.z0 + 0.6; z < PIER2.z1; z += 2.4)
    for (const side of [-1, 1]) b.cyl(0.12, 0.12, deck + 3.6, PIER2.x + side * (PIER2.half - 0.05), -3.6, z, "#7a5532", 6);
  const bx = PIER2.x + 3.6, bz = PIER2.z0 + 4;
  const hull = new THREE.CylinderGeometry(1.4, 0.9, 6.5, 8, 1, false, Math.PI, Math.PI);
  hull.rotateX(Math.PI / 2);
  b.add(hull, "#c0503a", [bx, SEA_Y + 0.6, bz], [0, 0, Math.PI]);
  b.box(2.4, 0.15, 5.6, bx, SEA_Y + 0.55, bz, "#d8b77a");
  b.cyl(0.09, 0.11, 6, bx, SEA_Y + 0.6, bz, "#7a5532", 6);
  b.boxAt(0.05, 3.6, 2.6, [bx, SEA_Y + 3.6, bz + 1.4], [0, 0, 0], "#fbf6ea");
  const lx = 99, lz = -327;
  b.add(rockGeometry(3, 2.5, 1800, 1), "#7a6c61", [lx, SEA_Y - 1, lz]);
  b.cyl(0.9, 1.3, 8, lx, SEA_Y + 1.2, lz, "#ffffff", 10);
  for (const y of [3, 6]) b.cyl(1.0 - y * 0.03, 1.2 - y * 0.03, 0.9, lx, SEA_Y + 1.2 + y, lz, "#e8553f", 10);
  b.cyl(1.0, 1.0, 1.2, lx, SEA_Y + 9.2, lz, "#fff3b0", 10);
  b.cone(1.2, 1.2, lx, SEA_Y + 10.4, lz, "#e8553f", 10);
  parts.push(b.build());
  return merge(parts);
}

/** Where each sign hangs (world, facing north toward the fixed camera) and its board size. */
export function signSpots(): Array<{ text: string; color: string; x: number; y: number; z: number; w: number; h: number; blade: boolean }> {
  const label: Record<ServiceId, [string, string]> = {
    market: ["FOOD MARKET", "#e8553f"], clothes: ["CLOTHES SHOP", "#e2508f"], trainer: ["MONSTER TRAINER", "#3f7fd0"],
    inn: ["SEASIDE INN", "#2f8f86"], harbor: ["HARBOR OFFICE", "#26467a"],
  };
  const spots = Object.values(SERVICES).map(s => {
    const h = s.house, [text, color] = label[s.id], g = gy(h.x, h.z);
    if (s.id === "harbor") return { text, color, x: h.x - .9, y: g + 2.45, z: h.z + h.d / 2 + .1, w: 2.2, h: .5, blade: false };
    // West and east rows: a blade sign from the north end of the plaza-facing front.
    const fx = Math.sin(h.yaw), frontX = h.x + fx * h.d / 2;
    return { text, color, x: frontX + fx * 1.05, y: g + (s.id === "inn" ? 3.5 : 2.85), z: h.z + h.w / 2 - .3, w: 1.95, h: .48, blade: true };
  });
  const lintel = gy(TOWN_GATE.x, PORT_WALL.z) + PORT_WALL.height + .35;
  spots.push({ text: "PORT TOWN", color: "#7a4a2a", x: TOWN_GATE.x, y: lintel - .55, z: PORT_WALL.z + .25 + .08, w: 2.5, h: .56, blade: false });
  return spots;
}

/** Trims, shop props, lamps, the fountain, counters and sign boards: near views only. */
export function townDetailGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const p of placedBuildings()) {
    const g = building(p.look, p.w, p.d, true);
    if (p.id) {
      const props = new PartBuilder(0);
      serviceProps(props, p.id, p.look, p.w, p.d, [-Math.sin(p.yaw), Math.cos(p.yaw)]);
      parts.push(place(props.build(), p, .15));
    }
    parts.push(place(g, p));
  }
  const b = new PartBuilder(0);
  // A counter in front of each keeper.
  for (const s of Object.values(SERVICES)) {
    const k = s.keeper, fx = Math.sin(s.house.yaw), fz = Math.cos(s.house.yaw);
    b.boxAt(Math.min(3, s.house.w * 0.5), 1, 0.7, [k.x - fx * 0.95, gy(k.x, k.z) + 0.5, k.z - fz * 0.95], [0, s.house.yaw, 0], "#b0763e");
    b.boxAt(Math.min(3, s.house.w * 0.5) + .12, .08, .82, [k.x - fx * 0.95, gy(k.x, k.z) + 1.02, k.z - fz * 0.95], [0, s.house.yaw, 0], DARKWOOD);
  }
  // Sign boards behind the atlas words, with their brackets.
  for (const s of signSpots()) {
    // The gate board is part of the palisade.
    if (s.text === "PORT TOWN") continue;
    b.boxAt(s.w + .14, s.h + .14, .07, [s.x, s.y, s.z - .045], [0, 0, 0], "#5a3c26");
    if (s.blade) {
      const wallX = s.x - Math.sign(77 - s.x) * 1.05;
      b.boxAt(Math.abs(s.x - wallX) + .2, .09, .09, [(s.x + wallX) / 2, s.y + s.h / 2 + .2, s.z - .045], [0, 0, 0], "#3c3c44");
      for (const o of [-.6, .6]) b.boxAt(.03, .2, .03, [s.x + o, s.y + s.h / 2 + .12, s.z - .045], [0, 0, 0], "#3c3c44");
    }
  }
  // The plaza fountain with a ring of flat stones.
  const f = FOUNTAIN, fy = gy(f.x, f.z);
  b.cyl(f.r, f.r + 0.1, 0.5, f.x, fy - 0.05, f.z, "#bdb3a2", 12);
  b.cyl(f.r - 0.25, f.r - 0.25, 0.05, f.x, fy + 0.4, f.z, "#6fd0e0", 12);
  b.cyl(0.25, 0.3, 1.2, f.x, fy + 0.4, f.z, "#bdb3a2", 8);
  b.sphere(0.35, f.x, fy + 1.7, f.z, "#bdb3a2", [1, 0.5, 1], 8);
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2;
    b.boxAt(.9, .05, .55, [f.x + Math.cos(a) * (f.r + .75), fy + .01, f.z + Math.sin(a) * (f.r + .75)], [0, -a, 0], i % 2 ? "#b8ad98" : "#a89d88");
  }
  // Lamps: a post, a little roof and a warm lantern.
  for (const l of LAMPS) {
    const y = gy(l.x, l.z);
    b.cyl(0.06, 0.08, 2.6, l.x, y - 0.1, l.z, "#4a4a52", 6);
    b.boxAt(.26, .3, .26, [l.x, y + 2.62, l.z], [0, 0, 0], "#fff3b0");
    b.cone(.24, .2, l.x, y + 2.77, l.z, "#3c3c44", 4);
  }
  for (const c of CRATES) {
    b.boxAt(0.8 * c.s, 0.8 * c.s, 0.8 * c.s, [c.x, gy(c.x, c.z) + 0.4 * c.s, c.z], [0, c.yaw, 0], "#b0763e");
    b.boxAt(0.84 * c.s, 0.1 * c.s, 0.84 * c.s, [c.x, gy(c.x, c.z) + 0.55 * c.s, c.z], [0, c.yaw, 0], DARKWOOD);
  }
  // A few barrels on the quay, by the pier head.
  for (const [x, dz] of [[PIER2.x - 2.4, 1.3], [PIER2.x - 3.1, 1.6], [PIER2.x + 2.6, 1.2]] as const) barrel(b, x, gy(x, PORT.z0 + dz), PORT.z0 + dz, .95);
  parts.push(b.build());
  return merge(parts);
}

/** Signboards (English words to read): one atlas, one draw, every board facing north. */
export function townSigns(): { geo: THREE.BufferGeometry; tex: THREE.CanvasTexture } {
  const spots = signSpots();
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 64 * spots.length;
  const g = c.getContext("2d")!;
  spots.forEach(({ text, color }, i) => {
    g.fillStyle = "#fff8ea";
    g.fillRect(0, i * 64, 512, 64);
    g.fillStyle = color;
    g.fillRect(6, i * 64 + 6, 500, 52);
    g.fillStyle = "#ffffff";
    g.font = "bold 36px sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, 256, i * 64 + 33, 488);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const parts = spots.map((s, i) => {
    const plane = new THREE.PlaneGeometry(s.w, s.h);
    const uv = plane.attributes.uv as THREE.BufferAttribute;
    for (let k = 0; k < uv.count; k++) uv.setY(k, 1 - (i + 1 - uv.getY(k)) / spots.length);
    plane.translate(s.x, s.y, s.z);
    return plane;
  });
  return { geo: mergeGeometries(parts, false), tex };
}
