import * as THREE from "three";
import { PartBuilder } from "../partBuilder";
import { GROVE_DOOR, GROVE_DOOR_RETURNS } from "../../game/world/lowland";
import { groundY } from "../../game/world/island";

const STONE = ["#8a8b76", "#969680", "#777e6b", "#a4a18a"];
const MOSS = "#587d43", VINE = "#45673a", WOOD = "#73583d", IRON = "#444c49";

/** The carved frame and rock returns share one vertex-coloured world mesh. */
export function groveDoorFrameGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  const { x, z, half, postWidth, depth, height } = GROVE_DOOR;
  const y = groundY(x, z);
  for (const side of [-1, 1]) {
    const px = x + side * (half + postWidth / 2);
    // The inner faces stay exactly outside the authored passage band.
    for (let course = 0; course < 4; course++) {
      b.box(postWidth, height / 4 - .025, depth, px, y + course * height / 4, z, STONE[course]);
    }
    for (const face of [-1, 1]) {
      // Shallow incised-looking dark channels and raised carved chevrons.
      b.box(.08, height - .5, .025, px, y + .2, z + face * (depth / 2 + .014), STONE[2]);
      for (let i = 0; i < 3; i++) {
        b.boxAt(.28, .07, .04, [px, y + .72 + i * .82, z + face * (depth / 2 + .035)], [0, 0, side * .46], STONE[3]);
      }
      b.box(postWidth * .72, .28, .045, px, y + .03, z + face * (depth / 2 + .025), MOSS);
      // Vines run on the outer half of each post, clear of the doorway.
      for (let i = 0; i < 5; i++) {
        const vx = px + side * (.18 + (i % 2) * .05), vy = y + height - .2 - i * .42;
        b.boxAt(.055, .5, .045, [vx, vy, z + face * (depth / 2 + .05)], [0, 0, side * (i % 2 ? .2 : -.2)], VINE);
        b.boxAt(.18, .07, .06, [vx + side * .08, vy, z + face * (depth / 2 + .07)], [0, 0, side * .5], MOSS);
      }
    }
  }
  // A weathered, segmented lintel keeps a full mounted-height opening.
  const span = half * 2 + postWidth * 2;
  for (let i = 0; i < 5; i++) {
    b.box(span / 5 - .025, .62 - (i % 2) * .04, depth + .12, x + (i - 2) * span / 5, y + height, z, STONE[i % 4]);
    b.box(span / 5 - .08, .055, depth * .72, x + (i - 2) * span / 5, y + height + .63 - (i % 2) * .04, z, MOSS);
  }
  for (const r of GROVE_DOOR_RETURNS) {
    const dx = r.bx - r.ax, dz = r.bz - r.az, len = Math.hypot(dx, dz);
    const base = Math.min(groundY(r.ax, r.az), groundY(r.bx, r.bz));
    const cx = (r.ax + r.bx) / 2, cz = (r.az + r.bz) / 2;
    // Capsule footprint matches the collision returns, including round ends.
    b.box(r.r * 2, 1.8, len, cx, base, cz, STONE[2], Math.atan2(dx, dz));
    for (const [rx, rz] of [[r.ax, r.az], [r.bx, r.bz]]) b.cyl(r.r, r.r, 1.8, rx, base, rz, STONE[0], 8);
    b.box(r.r * 1.5, .08, len + r.r, cx, base + 1.8, cz, MOSS, Math.atan2(dx, dz));
  }
  return b.build();
}

/** Hinge-local leaf: +1 extends right from the left post, -1 extends left. */
export function groveDoorGeometry(dir: 1 | -1): THREE.BufferGeometry {
  const b = new PartBuilder(0);
  const { half: width, height } = GROVE_DOOR;
  const planks = 5;
  for (let i = 0; i < planks; i++) {
    b.box(width / planks - .025, height - .15 - (i % 2) * .055, .18, dir * (i + .5) * width / planks, .04, 0, i % 2 ? WOOD : "#806345");
  }
  for (const h of [.5, height * .5, height - .5]) {
    b.box(width - .02, .15, .23, dir * width / 2, h, 0, IRON);
    for (let i = 0; i < 4; i++) {
      for (const face of [-1, 1]) b.box(.055, .055, .025, dir * (i + .5) * width / 4, h + .045, face * .127, "#858c7d");
    }
  }
  for (const face of [-1, 1]) {
    b.box(.1, .38, .08, dir * (width - .22), height * .45, face * .16, IRON);
  }
  return b.build();
}
