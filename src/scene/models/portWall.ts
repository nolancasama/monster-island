import * as THREE from "three";
import { PartBuilder } from "../partBuilder";
import { PORT_WALL, TOWN_GATE } from "../../game/world/lowland";
import { groundY } from "../../game/world/island";

const STONE = ["#9a9484", "#8a8678", "#a8a08c", "#7d7b70"];
const CAP = "#b5ad98", MOSS = "#6f9148", TIMBER = "#7c5941", IRON = "#454a4e";
const hash = (n: number) => { const s = Math.sin(n * 91.7) * 43758.5; return s - Math.floor(s); };

/** Curtain walls, gate towers, lintel, banners and end outcrops, as one merged mesh. */
export function portWallGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  const { z, x0, x1, thick, gateHalf, height, towerHeight, towerR } = PORT_WALL;
  const gx = TOWN_GATE.x;
  const y0 = groundY(gx, z);
  const curtain = (from: number, to: number, seed: number) => {
    const n = Math.round((to - from) / 3.1), w = (to - from) / n;
    for (let i = 0; i < n; i++) {
      const x = from + w * (i + .5), g = groundY(x, z), k = seed + i;
      // Stepped tops and alternating courses keep it from reading as a long box.
      const h = height + (hash(k) - .5) * .5 + (y0 - g) * .6, top = g + h;
      b.box(w + .04, h + 1.4, thick, x, g - 1.4, z, STONE[k % 4]);
      b.box(w + .04, .5, thick + .16, x, g + h * .45, z, STONE[(k + 2) % 4]);
      b.box(w + .1, .26, thick + .32, x, top, z, CAP);
      for (const m of [-.3, .3]) {
        for (const side of [-1, 1]) b.box(w * .22, .62, .36, x + m * w, top + .26, z + side * (thick / 2 - .1), STONE[(k + 1) % 4]);
      }
      if (i % 3 === 1) b.box(.9, h * .72 + 1, thick + 1, x, g - 1, z + .5, STONE[(k + 3) % 4]);
      // Moss creeps up from the foot on the land side.
      if (hash(k + 5) > .35) b.box(w * (.35 + hash(k) * .5), .4 + hash(k + 2) * .9, .08, x + (hash(k + 3) - .5) * w * .4, g - .1, z + thick / 2 + .02, MOSS);
    }
  };
  curtain(x0, gx - gateHalf - towerR, 3);
  curtain(gx + gateHalf + towerR, x1, 29);

  for (const side of [-1, 1]) {
    const x = gx + side * (gateHalf + towerR), g = groundY(x, z);
    b.cyl(towerR, towerR + .25, towerHeight + 1.4, x, g - 1.4, z, STONE[side > 0 ? 0 : 1], 8);
    b.cyl(towerR + .04, towerR + .04, .55, x, g + 2.6, z, STONE[3], 8);
    b.cyl(towerR + .42, towerR, .4, x, g + towerHeight, z, CAP, 8);
    for (let i = 0; i < 8; i++) {
      const a = (i + .5) / 8 * Math.PI * 2, r = towerR + .2;
      b.box(.62, .7, .4, x + Math.sin(a) * r, g + towerHeight + .4, z + Math.cos(a) * r, STONE[i % 4], a);
    }
    b.cone(towerR * .86, 2.3, x, g + towerHeight + .5, z, "#b5553a", 8);
    // Flag on the roof, banner on the land face, lantern by the doors.
    b.cyl(.05, .06, 1.5, x, g + towerHeight + 2.6, z, TIMBER, 5);
    b.box(.9, .5, .05, x + .48, g + towerHeight + 3.5, z, "#3c7fb8");
    b.box(1.1, 2.3, .08, x, g + 3.5, z + towerR + .06, "#3c7fb8");
    b.box(.46, .46, .09, x, g + 4.5, z + towerR + .07, "#f2d36b");
    b.box(.1, .5, .28, x - side * (towerR - .5), g + 2.5, z + towerR * .85, IRON);
    b.sphere(.17, x - side * (towerR - .5), g + 2.45, z + towerR * .85 + .2, "#ffcf6b", [1, 1.2, 1], 6);
    b.box(.9, .6, .1, x + side * .2, g - .05, z + towerR + .03, MOSS);
  }

  // The stone lintel: the opening stays tall enough for a rider on Ember.
  const lintelY = y0 + height + .35;
  b.box(gateHalf * 2 + .6, 1, thick + .3, gx, lintelY, z, STONE[0]);
  b.box(gateHalf * 2 + .9, .24, thick + .55, gx, lintelY + 1, z, CAP);
  for (let i = -2; i <= 2; i++) b.box(.72, .62, .4, gx + i * 1.45, lintelY + 1.24, z + thick / 2 - .1, STONE[(i + 4) % 4]);

  // The road through the gate: worn flagstones on both sides.
  for (let i = -5; i <= 5; i++) {
    const zz = z + i * 1.05, w = gateHalf * 2 - .8 - Math.abs(i) * .12;
    b.box(w, .06, .95, gx + (i % 2) * .08, groundY(gx, zz) + .015, zz, i % 2 ? "#a79c86" : "#968d79");
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

/** One timber door, hinge at x = 0, extending along +x (`dir` 1) or −x (`dir` −1). */
export function portDoorGeometry(dir: 1 | -1): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  const w = PORT_WALL.gateHalf, h = PORT_WALL.height + .35, planks = 5;
  for (let i = 0; i < planks; i++) {
    const x = dir * (i + .5) * w / planks;
    b.box(w / planks - .05, h - (i % 2) * .12, .24, x, -.05, 0, i % 2 ? TIMBER : "#8a6548");
  }
  for (const y of [.8, 2.4, 4]) {
    b.box(w, .2, .3, dir * w / 2, y, .02, IRON);
    for (let i = 0; i < 4; i++) b.box(.1, .1, .36, dir * (i + .5) * w / 4, y + .05, .02, "#8d9499");
  }
  // The handle ring, on the meeting edge.
  b.torus(.16, .035, [dir * (w - .36), 1.75, .2], [0, 0, 0], IRON);
  return b.build();
}
