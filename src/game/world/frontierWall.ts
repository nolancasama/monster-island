import { groundY, LEDGE, massifY, type SolidShape } from "./island";
import { CLIFF_ROPE } from "./lowland";

/** HOME only. The two tails descend into unwalkable, unmasked cliff rock.
 * Keep the rope, its landing, and its climb line in the central opening. */
export const FRONTIER_GATE = {
  x: CLIFF_ROPE.x, z: LEDGE.z0 + .85, width: 2.4, depth: 1.3, height: 2.1,
};
export const FRONTIER_RUNS: readonly (readonly [number, number])[][] = [
  [[54, -144.5], [58, -149.8], [66, -150.35], [FRONTIER_GATE.x - FRONTIER_GATE.width / 2, FRONTIER_GATE.z]],
  [[FRONTIER_GATE.x + FRONTIER_GATE.width / 2, FRONTIER_GATE.z], [84, -150.35], [89, -149.8], [92, -144.5]],
];
export interface WallFootprint {
  x: number; z: number; width: number; depth: number; yaw: number;
}
export interface WallStone extends WallFootprint { height: number; buried?: boolean }

/** Short, overlapping foundations follow both the turn and the real terrain. */
export const FRONTIER_STONES: WallStone[] = FRONTIER_RUNS.flatMap((run, side) => {
  const stones: WallStone[] = [];
  for (let j = 1; j < run.length; j++) {
    const [ax, az] = run[j - 1], [bx, bz] = run[j];
    const length = Math.hypot(bx - ax, bz - az), count = Math.ceil(length / 2.3);
    for (let i = 0; i < count; i++) {
      const t = (i + .5) / count, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      const endDistance = side === 0 && j === 1 ? t * length : side === 1 && j === run.length - 1 ? (1 - t) * length : Infinity;
      stones.push({ x, z, width: length / count + .035, depth: FRONTIER_GATE.depth,
        yaw: -Math.atan2(bz - az, bx - ax),
        height: x > 70 && x < 81 ? .5 : Math.min(1.4 + .18 * Math.sin(i * 2.3 + j), endDistance * .6),
        buried: endDistance < 1.3,
      });
    }
  }
  return stones;
});

export const FRONTIER_TOWER: WallStone = { x: 67.1, z: -150.15, width: 2.9, depth: 2.7, yaw: 0, height: 2.75 };
export const FRONTIER_JAMBS: WallStone[] = [-1, 1].map(side => ({
  x: FRONTIER_GATE.x + side * (FRONTIER_GATE.width / 2 + .6), z: FRONTIER_GATE.z,
  width: 1.2, depth: FRONTIER_GATE.depth, yaw: 0, height: FRONTIER_GATE.height,
}));

export function footprintPoint(p: WallFootprint, u: number, v: number) {
  const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
  return { x: p.x + c * u + s * v, z: p.z - s * u + c * v };
}

/** The cliff's rendered rock cap is above groundY outside the grass ledge.
 * Match the closed slab and stepped wings in cliffFaceGeometry, not the
 * lowland floor underneath them. The world floor itself is unchanged. */
export function frontierTerrainY(x: number, z: number) {
  let y = groundY(x, z);
  const top = groundY(CLIFF_ROPE.x, CLIFF_ROPE.top.z);
  if (x >= CLIFF_ROPE.x - 6.4 && x <= CLIFF_ROPE.x + 6.4 && z >= CLIFF_ROPE.faceZ && z <= CLIFF_ROPE.faceZ + 9)
    y = Math.max(y, top - .12);
  if (z >= CLIFF_ROPE.faceZ + .05 && z <= CLIFF_ROPE.faceZ + 8.05) {
    const foot = groundY(CLIFF_ROPE.foot.x, CLIFF_ROPE.foot.z) - .6;
    for (let column = 49; column < 92; column += 2) {
      if (Math.abs(column - CLIFF_ROPE.x) < 6 || Math.abs(x - column) > 1.03) continue;
      y = Math.max(y, foot + Math.max(1, groundY(column, -147.5) - foot - .15));
    }
  }
  return y;
}

/** Sample the whole footprint, including all edges, rather than its centre.
 * An embedded continuous core covers small terrain-mesh interpolation errors. */
export function frontierFoundation(p: WallFootprint, terrainY = frontierTerrainY) {
  let min = Infinity, max = -Infinity;
  const nx = Math.ceil(p.width / .12), nz = Math.ceil(p.depth / .12);
  for (let ix = 0; ix <= nx; ix++) for (let iz = 0; iz <= nz; iz++) {
    const q = footprintPoint(p, (ix / nx - .5) * p.width, (iz / nz - .5) * p.depth);
    const y = terrainY(q.x, q.z);
    min = Math.min(min, y, groundY(q.x, q.z)); max = Math.max(max, y);
  }
  return { bottom: min - .4, top: max + .06 };
}

export const FRONTIER_GATE_FOOTPRINT: WallFootprint = {
  ...FRONTIER_GATE, yaw: 0,
};
const solid = (p: WallFootprint): SolidShape => ({ kind: "box", x: p.x, z: p.z, hx: p.width / 2, hz: p.depth / 2, yaw: p.yaw });
export const FRONTIER_SOLIDS = [...FRONTIER_STONES, FRONTIER_TOWER, ...FRONTIER_JAMBS].map(solid);
export const FRONTIER_GATE_SOLID = solid(FRONTIER_GATE_FOOTPRINT);

/** The tips have no walkable shelf under them: they merge into massif rock. */
export const FRONTIER_ANCHORS = [FRONTIER_RUNS[0][0], FRONTIER_RUNS[1].at(-1)!].map(([x, z]) => ({ x, z, y: massifY(x, z) }));
