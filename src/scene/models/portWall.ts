import * as THREE from "three";
import { PartBuilder } from "../partBuilder";
import { PORT_WALL, TOWN_GATE } from "../../game/world/lowland";
import { groundY } from "../../game/world/island";

/**
 * Port Town's wooden palisade (docs/PORT_TOWN_REVAMP.md §1): sharpened logs on an
 * earth footing, rails and braces on the town side, two timber watchtowers by the
 * gate, a log lintel with the PORT TOWN board. Same footprint, collision and fade
 * as the stone wall it replaces; one merged mesh.
 */

const BARK = ["#7a5236", "#6b4730", "#86603f", "#73502f"];
const TIP = "#b48a5c", EARTH = "#7d6a4c", STONE = "#8f887a", ROPE = "#c9a86a", PLANK = "#9a6c43", DARK = "#4a3424", MOSS = "#6f9148";
const hash = (n: number) => { const s = Math.sin(n * 91.7) * 43758.5; return s - Math.floor(s); };

/** One sharpened log standing on `g` (open cylinder plus an open cone: no hidden caps). */
function log(b: PartBuilder, x: number, z: number, g: number, h: number, r: number, k: number) {
  const lean: [number, number, number] = [(hash(k + 7) - .5) * .05, 0, (hash(k + 9) - .5) * .05];
  b.add(new THREE.CylinderGeometry(r, r * 1.04, h, 6, 1, true), BARK[k % 4], [x, g + h / 2 - .5, z], lean);
  b.add(new THREE.ConeGeometry(r, .62, 6, 1, true), hash(k + 3) > .3 ? TIP : BARK[(k + 1) % 4], [x + lean[2] * -h * .5, g + h - .5 + .31, z + lean[0] * h * .5], lean);
}

export function portWallGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  const { z, x0, x1, thick, gateHalf, height, towerR } = PORT_WALL;
  const gx = TOWN_GATE.x;
  const y0 = groundY(gx, z);
  const inner = z - .32; // the town side (the town lies toward −z)

  const curtain = (from: number, to: number, seed: number) => {
    // Logs: touching, varied heights; tops stay roughly level with the gate.
    const n = Math.round((to - from) / .44);
    for (let i = 0; i < n; i++) {
      const k = seed + i, x = from + (to - from) * (i + .5) / n, g = groundY(x, z);
      const h = height + .5 + (hash(k) - .5) * .6 + (y0 - g) * .6;
      log(b, x, z + (hash(k + 1) - .5) * .08, g, h, .22 + hash(k + 2) * .03, k);
    }
    // Earth footing, rails and a brace per 3 m bay; rope lashing on the coast face.
    const bays = Math.max(1, Math.round((to - from) / 3.1)), w = (to - from) / bays;
    for (let i = 0; i < bays; i++) {
      const x = from + w * (i + .5), g = groundY(x, z), k = seed + i * 5;
      b.box(w + .05, .5, thick, x, g - .1, z, EARTH);
      if (hash(k + 4) > .45) b.box(.5 + hash(k) * .4, .28, .45, x + (hash(k + 1) - .5) * w * .6, g + .12, z + thick / 2 - .05, STONE);
      for (const y of [1.15, 3.35]) b.boxAt(w + .02, .16, .16, [x, g + y, inner - .1], [0, 0, 0], PLANK);
      b.boxAt(.14, 3.6, .14, [x - w * .25, g + 1.75, inner - .42], [.32, 0, (i % 2 ? 1 : -1) * .5], DARK);
      if (i % 2 === 0) b.boxAt(Math.min(w, 1.6), .12, .52, [x + (hash(k + 6) - .5) * w * .4, g + 3.9 + (y0 - g) * .6, z], [0, 0, 0], ROPE);
      if (hash(k + 8) > .5) b.box(w * (.3 + hash(k) * .4), .3 + hash(k + 2) * .5, .06, x, g - .05, z + thick / 2 + .02, MOSS);
    }
  };
  curtain(x0, gx - gateHalf - towerR * 2, 3);
  curtain(gx + gateHalf + towerR * 2, x1, 59);

  // Two watchtowers on the old tower circles: log skirt, posts, deck, rail, roof.
  for (const side of [-1, 1]) {
    const tx = gx + side * (gateHalf + towerR), g = groundY(tx, z), s = towerR * .78;
    for (const [px, pz] of [[-s, -s], [s, -s], [s, s], [-s, s]]) b.add(new THREE.CylinderGeometry(.2, .22, 7, 6, 1, true), DARK, [tx + px, g + 3.5 - .4, z + pz]);
    // The lower walls: logs round the square, so the tower reads as solid as it collides.
    const k0 = side > 0 ? 200 : 300;
    for (let e = 0; e < 4; e++) for (let i = 0; i < 6; i++) {
      const t = -s + (i + .5) * (2 * s) / 6;
      const [px, pz] = e === 0 ? [t, -s] : e === 1 ? [s, t] : e === 2 ? [-t, s] : [-s, -t];
      log(b, tx + px, z + pz, g, 4.4 + hash(k0 + e * 6 + i) * .3, .2, k0 + e * 6 + i);
    }
    b.box(2 * s + .9, .2, 2 * s + .9, tx, g + 4.75, z, PLANK);
    for (const [px, pz, w, d] of [[0, -s - .4, 2 * s + .9, .12], [0, s + .4, 2 * s + .9, .12], [-s - .4, 0, .12, 2 * s + .9], [s + .4, 0, .12, 2 * s + .9]]) {
      b.boxAt(w, .12, d, [tx + px, g + 5.75, z + pz], [0, 0, 0], PLANK);
      b.boxAt(w > d ? w : .1, .5, w > d ? .1 : d, [tx + px, g + 5.2, z + pz], [0, 0, 0], BARK[0]);
    }
    const roof = new THREE.ConeGeometry(2 * s + .4, 1.7, 4, 1, true);
    roof.rotateY(Math.PI / 4);
    b.add(roof, "#a5603a", [tx, g + 6.95, z]);
    b.box(.18, .5, .18, tx, g + 7.75, z, DARK);
    if (side < 0) {
      // A flag on the west tower, a bell on the east one.
      b.cyl(.04, .05, 1.4, tx, g + 7.8, z, DARK, 5);
      b.box(.9, .5, .05, tx + .47, g + 8.6, z, "#3c7fb8");
    } else {
      b.cone(.22, .32, tx, g + 5.95, z, "#c9a44a", 7);
      b.box(.08, .2, .08, tx, g + 6.25, z, DARK);
    }
    // A torch on the tower's coast-side corner post, by the gate.
    const cx = tx - side * s, cz = z + s + .15;
    b.boxAt(.12, .5, .12, [cx, g + 3, cz + .1], [.4, 0, 0], DARK);
    b.cone(.13, .32, cx, g + 3.2, cz + .2, "#ff9b2e", 6);
    b.cone(.07, .22, cx, g + 3.27, cz + .2, "#ffe27a", 6);
  }

  // The lintel: a heavy log over the opening (still tall enough for a rider on Ember),
  // and the PORT TOWN board hanging from it (its words are in the town sign atlas).
  const lintelY = y0 + height + .35;
  b.cylAt(.32, gateHalf * 2 + 1.2, [gx, lintelY + .32, z], [0, 0, Math.PI / 2], BARK[2], 8);
  b.cylAt(.22, gateHalf * 2 + .4, [gx, lintelY + .92, z - .1], [0, 0, Math.PI / 2], BARK[1], 8);
  for (const s of [-1, 1]) b.boxAt(.05, .5, .05, [gx + s * 1.05, lintelY - .05, z + .25], [0, 0, 0], ROPE);
  b.boxAt(2.7, .66, .12, [gx, lintelY - .55, z + .25], [0, 0, 0], PLANK);

  // The road through the gate: packed earth with a few flat stones.
  for (let i = -5; i <= 5; i++) {
    const zz = z + i * 1.05, w = gateHalf * 2 - .6 - Math.abs(i) * .14;
    b.box(w, .05, 1, gx + (i % 2) * .06, groundY(gx, zz) + .01, zz, i % 2 ? "#a08a66" : "#957f5d");
    if (i % 3 === 0) b.box(.6, .07, .5, gx + (hash(i + 20) - .5) * 3, groundY(gx, zz) + .02, zz + .2, STONE);
  }

  // Natural rock takes over at both ends, so no end of the wall stands alone.
  for (const [x, zz, r, sy, tint] of [
    [x0 - 1, z + .4, 5.2, 1.5, "#807c70"], [x0 - 5.5, z - 2.2, 6.4, 1.25, "#726f66"], [x0 + 1.6, z - 2.5, 2.8, 1.1, "#8b8678"],
    [x1 + 1, z + .4, 5.4, 1.45, "#807c70"], [x1 + 5.8, z - 1.8, 6.6, 1.3, "#726f66"], [x1 - 1.4, z + 2.4, 2.6, 1.1, "#8b8678"],
  ] as const) {
    const g = groundY(x, zz);
    b.sphere(r, x, g + r * sy * .22, zz, tint, [1, sy, .9], 6);
    b.sphere(r * .62, x + .4, g + r * sy * .95, zz + .3, MOSS, [1, .34, .9], 5);
  }
  const geometry = b.build();
  geometry.computeVertexNormals();
  return geometry;
}

/** One plank door, hinge at x = 0, extending along +x (`dir` 1) or −x (`dir` −1): battens and a Z-brace. */
export function portDoorGeometry(dir: 1 | -1): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  const w = PORT_WALL.gateHalf, h = PORT_WALL.height + .35, planks = 6;
  for (let i = 0; i < planks; i++) {
    const x = dir * (i + .5) * w / planks;
    b.box(w / planks - .04, h - (i % 3) * .1, .2, x, -.05, 0, i % 2 ? PLANK : "#8a5f3b");
    b.cone(w / planks / 2 - .02, .28, x, h - .05 - (i % 3) * .1, 0, i % 2 ? PLANK : "#8a5f3b", 4);
  }
  // Two battens on the town side and a diagonal brace between them.
  for (const y of [.9, h - 1.1]) b.box(w - .1, .26, .14, dir * w / 2, y, -.16, DARK);
  const dy = h - 2.25, len = Math.hypot(w - .5, dy);
  b.boxAt(len, .22, .12, [dir * w / 2, (1.03 + h - 1.03) / 2, -.16], [0, 0, dir * Math.atan2(dy, w - .5)], DARK);
  // Iron hinge straps by the post and a rope pull ring on the meeting edge.
  for (const y of [.95, h - 1.05]) b.box(.55, .1, .24, dir * .3, y + .08, 0, "#454a4e");
  b.torus(.15, .035, [dir * (w - .35), 1.75, .14], [0, 0, 0], ROPE);
  return b.build();
}
