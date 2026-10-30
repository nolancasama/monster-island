import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { PartBuilder } from "../partBuilder";
import { FRONTIER_GATE, FRONTIER_GATE_FOOTPRINT, FRONTIER_JAMBS, FRONTIER_STONES, FRONTIER_TOWER, footprintPoint, frontierFoundation, frontierTerrainY, type WallFootprint, type WallStone } from "../../game/world/frontierWall";
import { cliffFaceGeometry } from "./lowland";

const stoneColors = ["#858879", "#999b89", "#727b70", "#a5a391"];
const foundationKey = (p: WallFootprint) => [p.x, p.z, p.width, p.depth, p.yaw].join(",");
let foundations: Map<string, ReturnType<typeof frontierFoundation>> | undefined;

/** Sample the existing rendered cliff, including its faceted rock bulges.
 * Cache just heights, then dispose the temporary sampling mesh. No duplicate
 * cliff is rendered or retained, and collision keeps its original floor. */
export function frontierRenderedFoundation(p: WallFootprint) {
  if (!foundations) {
    foundations = new Map();
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const cliff = new THREE.Mesh(cliffFaceGeometry(), material);
    const ray = new THREE.Raycaster();
    const terrainY = (x: number, z: number) => {
      ray.set(new THREE.Vector3(x, 100, z), new THREE.Vector3(0, -1, 0));
      return Math.max(frontierTerrainY(x, z), ray.intersectObject(cliff)[0]?.point.y ?? -Infinity);
    };
    for (const part of [...FRONTIER_STONES, ...FRONTIER_JAMBS, FRONTIER_TOWER, FRONTIER_GATE_FOOTPRINT])
      foundations.set(foundationKey(part), frontierFoundation(part, terrainY));
    cliff.geometry.dispose(); material.dispose();
  }
  return foundations.get(foundationKey(p))!;
}

/** Closed cores with staggered courses on their actual faces, without hidden
 * stacks of boxes. The complete wall AND shut gate stay below 1k triangles. */
export function frontierWallGeometry() {
  const b = new PartBuilder(0);
  const faces: THREE.BufferGeometry[] = [];
  function masonry(p: WallStone, index: number, rows = 2) {
    const f = frontierRenderedFoundation(p);
    const top = p.buried ? f.bottom + .12 : f.top + p.height;
    const positions: number[] = [], colors: number[] = [];
    const col = new THREE.Color();
    function quad(points: number[][], color: string) {
      col.set(color);
      for (const i of [0, 1, 2, 0, 2, 3]) {
        const [u, y, v] = points[i], q = footprintPoint(p, u, v);
        positions.push(q.x, y, q.z); colors.push(col.r, col.g, col.b);
      }
    }
    const w = p.width / 2, d = p.depth / 2;
    // Unequal surviving stones and staggered colour joints on the solid face.
    for (let row = 0; row < rows; row++) {
      const band = .32 + (index % 3) * .07;
      const y0 = row === 0 ? f.bottom : Math.max(f.bottom, top - (rows - row) * band);
      const y1 = Math.max(f.bottom, top - (rows - row - 1) * band);
      const split = (row % 2 ? -.22 : .2) * p.width;
      for (const [a, c, n] of [[-w, split, 0], [split, w, 1]]) {
        const color = stoneColors[(row + index + n) % 4];
        quad([[a, y0, d], [c, y0, d], [c, y1, d], [a, y1, d]], color);
        quad([[c, y0, -d], [a, y0, -d], [a, y1, -d], [c, y1, -d]], color);
      }
    }
    quad([[-w, f.bottom, -d], [-w, f.bottom, d], [-w, top, d], [-w, top, -d]], "#737b70");
    quad([[w, f.bottom, d], [w, f.bottom, -d], [w, top, -d], [w, top, d]], "#858879");
    quad([[-w, top, d], [w, top, d], [w, top, -d], [-w, top, -d]], "#a1a58b");
    quad([[-w, f.bottom, -d], [w, f.bottom, -d], [w, f.bottom, d], [-w, f.bottom, d]], "#606b60");
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(positions.length / 3 * 2), 2));
    g.computeVertexNormals();
    faces.push(g);
    return top;
  }
  function growth(p: WallStone, top: number) {
    b.box(p.width * .65, .035, p.depth * .82, p.x, top - .012, p.z, "#617d43", p.yaw);
    // Trailing vines on both faces attach to the moss on the crown.
    for (const side of [-1, 1]) {
      const q = footprintPoint(p, -.25, side * (p.depth / 2 + .018));
      const vine = new THREE.PlaneGeometry(.18, .65);
      // Opaque planes lie just outside the solid face, facing away from it.
      b.add(vine, "#557540", [q.x, top - .31, q.z], [0, p.yaw + (side < 0 ? Math.PI : 0), .12]);
    }
  }
  FRONTIER_STONES.forEach((p, i) => {
    const top = masonry(p, i);
    if (p.buried) return;
    // Wide gaps and unequal surviving merlons instead of a continuous rail.
    if (i % 3 === 1) {
      const q = footprintPoint(p, -.25, 0);
      b.box(p.width * .38, .18 + i % 2 * .07, p.depth * .94, q.x, top, q.z, "#909783", p.yaw);
    }
    if (i % 5 === 2) growth(p, top);
  });
  const gateBase = frontierRenderedFoundation(FRONTIER_GATE_FOOTPRINT).top;
  FRONTIER_JAMBS.forEach((p, i) => masonry({ ...p, height: gateBase + p.height - frontierRenderedFoundation(p).top }, i, 3));
  // A chipped lintel and uneven surviving crown above the rope passage.
  b.box(FRONTIER_GATE.width + 2.4, .24, FRONTIER_GATE.depth, FRONTIER_GATE.x, gateBase + FRONTIER_GATE.height - .04, FRONTIER_GATE.z, "#a0a18a");
  b.box(.65, .23, FRONTIER_GATE.depth, FRONTIER_GATE.x - 1.8, gateBase + FRONTIER_GATE.height + .2, FRONTIER_GATE.z, "#858879");
  const towerTop = masonry({ ...FRONTIER_TOWER, height: FRONTIER_TOWER.height - .8 }, 5, 3);
  // Hollow, roofless watchtower: four narrow upper walls with unequal breaks.
  for (const side of [-1, 1]) {
    b.box(FRONTIER_TOWER.width, side < 0 ? .48 : .3, .4, FRONTIER_TOWER.x, towerTop, FRONTIER_TOWER.z + side * 1.15, "#858b7c");
    b.box(.4, side < 0 ? .8 : .55, FRONTIER_TOWER.depth, FRONTIER_TOWER.x + side * 1.25, towerTop, FRONTIER_TOWER.z, "#969c88");
  }
  b.box(.65, .4, .6, FRONTIER_TOWER.x - 1.1, towerTop + .78, FRONTIER_TOWER.z - .95, "#8e9681");
  growth(FRONTIER_TOWER, towerTop);
  // Blind slits on both faces, in the same merged vertex-coloured geometry.
  for (const side of [-1, 1]) b.box(.15, .62, .018, FRONTIER_TOWER.x, towerTop - .85, FRONTIER_TOWER.z + side * (FRONTIER_TOWER.depth / 2 + .012), "#3e4841");
  faces.push(b.build());
  const geometry = mergeGeometries(faces, false);
  faces.forEach(face => face.dispose());
  geometry.computeBoundingSphere();
  return geometry;
}

/** The opaque gate reads the same existing act2.started flag as collision. */
export function frontierGateGeometry(): THREE.BufferGeometry {
  const b = new PartBuilder(0), p = FRONTIER_GATE;
  const f = frontierRenderedFoundation(FRONTIER_GATE_FOOTPRINT), top = f.top + p.height;
  // Four touching planks form the solid door; no redundant backing box.
  for (let i = 0; i < 4; i++) {
    const x = p.x - p.width / 2 + (i + .5) * p.width / 4;
    b.box(p.width / 4, top - f.bottom, p.depth * .3, x, f.bottom, p.z, i % 2 ? "#71644b" : "#655a44");
  }
  for (const y of [f.top + .45, top - .4]) b.box(p.width, .11, p.depth * .34, p.x, y, p.z, "#424c46");
  return b.build();
}
