import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { blocked, gatesOf, isWalkable, moveCircle, PLAYER_R, solidsFor, type Gates } from "./collision";
import { groundY, LEDGE, massifY } from "./island";
import { CLIFF_FOOT_Z, CLIFF_ROPE, ENEMY_SPAWNS, lowlandWalkable, STAGES, zoneAt } from "./lowland";
import { ENEMIES } from "../data/combat";
import { FRONTIER_ANCHORS, FRONTIER_GATE, FRONTIER_GATE_FOOTPRINT, FRONTIER_JAMBS, FRONTIER_SOLIDS, FRONTIER_STONES, FRONTIER_TOWER, footprintPoint, frontierTerrainY } from "./frontierWall";
import { frontierGateGeometry, frontierRenderedFoundation, frontierWallGeometry } from "../../scene/models/frontierWall";
import { cliffFaceGeometry } from "../../scene/models/lowland";

const open: Gates = { forest: true, volcano: true, act2: true, cleared: [...STAGES],
  solved: ["fallenPalm", "river", "bridge", "cliff", "lava", "cave", "gateLeaf", "gateDrop", "gateWing", "gateFlame", "groveLilies", "canopyVines", "canopyRope", "causewayGate"] };
const closed = { ...open, act2: false };

describe("the Sanctuary frontier", () => {
  it("uses only act2.started, blocks the exact wall footprint, and retains the open rope landing", () => {
    for (const started of [false, true]) {
      const g = gatesOf({ solved: open.solved, endings: 3, act2: { started, cleared: [...STAGES] } });
      expect(g.act2).toBe(started);
      for (const p of [...FRONTIER_STONES, ...FRONTIER_JAMBS, FRONTIER_TOWER]) {
        for (const u of [-.45, 0, .45]) for (const v of [-.45, 0, .45]) {
          const q = footprintPoint(p, u * p.width, v * p.depth);
          expect(blocked(q.x, q.z, 0, g)).toBe(true);
          expect(isWalkable(q.x, q.z, g, PLAYER_R)).toBe(false);
        }
      }
      expect(isWalkable(FRONTIER_GATE.x, FRONTIER_GATE.z, g, PLAYER_R)).toBe(started);
      expect(isWalkable(CLIFF_ROPE.top.x, CLIFF_ROPE.top.z, g, PLAYER_R)).toBe(started);
    }
    // A continuous trip through the passage works in both directions only open.
    const south = { x: CLIFF_ROPE.x, z: FRONTIER_GATE.z + 1.4 }, north = { x: CLIFF_ROPE.x, z: LEDGE.z0 + PLAYER_R + .01 };
    expect(isWalkable(south.x, south.z, closed, PLAYER_R)).toBe(true);
    expect(isWalkable(north.x, north.z, open, PLAYER_R)).toBe(true);
    const shut = moveCircle(south.x, south.z, north.x, north.z, PLAYER_R, closed);
    expect(shut.z).toBeGreaterThan(FRONTIER_GATE.z + FRONTIER_GATE.depth / 2 + PLAYER_R - .01);
    const out = moveCircle(south.x, south.z, north.x, north.z, PLAYER_R, open);
    expect(out.z).toBeCloseTo(north.z, 5);
    expect(moveCircle(out.x, out.z, south.x, south.z, PLAYER_R, open).z).toBeCloseTo(south.z, 5);
    const withoutWall = solidsFor(open).filter(s => !FRONTIER_SOLIDS.includes(s));
    expect(solidsFor(closed).filter(s => !FRONTIER_SOLIDS.includes(s) && !(s.kind === "box" && s.x === FRONTIER_GATE.x && s.z === FRONTIER_GATE.z))).toEqual(withoutWall);
    for (const [x, z] of [[70, -127.2], [64, -137], [75.5, -147]]) expect(isWalkable(x, z, closed, PLAYER_R)).toBe(true);
  });

  it("has no enemy spawn or reachable chase/leash area on the prologue side, even with the gate open", () => {
    for (const e of ENEMY_SPAWNS) {
      const def = ENEMIES[e.kind];
      expect(zoneAt(e.x, e.z)).toBe(e.zone);
      // Spawn centres are on lowland floor; some existing large shellbacks
      // overlap a prop at full body radius and are projected by moveCircle.
      expect(lowlandWalkable(e.x, e.z, open, 0), `${e.kind} spawn floor`).toBe(true);
      expect(e.z + def.radius).toBeLessThan(CLIFF_FOOT_Z);
      // The leash circle alone can overlap the shelf. Its reachable area must
      // also pass the actual lowland floor and zone restrictions used by stepTo.
      for (let z = LEDGE.z0; z < -125; z += .4) for (let x = 56; x <= 90; x += .4) {
        if (Math.hypot(x - e.x, z - e.z) > def.leash + def.radius) continue;
        expect(zoneAt(x, z)).not.toBe(e.zone);
        expect(lowlandWalkable(x, z, open, def.radius)).toBe(false);
      }
      for (const x of [LEDGE.x0 + PLAYER_R, CLIFF_ROPE.x, LEDGE.x1 - PLAYER_R]) {
        const q = moveCircle(e.x, e.z, x, -147, def.radius, open);
        expect(q.z + def.radius, `${e.kind} from ${e.x},${e.z}`).toBeLessThanOrEqual(CLIFF_FOOT_Z + 1e-6);
      }
    }
  });

  it("embeds every rendered foundation across its footprint and buries both ends in massif rock", () => {
    const wall = frontierWallGeometry(), gate = frontierGateGeometry();
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(wall, material), door = new THREE.Mesh(gate, material);
    const ray = new THREE.Raycaster();
    for (const p of [...FRONTIER_STONES.filter(p => !p.buried), ...FRONTIER_JAMBS, FRONTIER_TOWER, FRONTIER_GATE_FOOTPRINT]) {
      for (const u of [-.45, 0, .45]) for (const v of [-.14, 0, .14]) {
        const q = footprintPoint(p, u * p.width, v * p.depth), y = groundY(q.x, q.z);
        ray.set(new THREE.Vector3(q.x, y - 30, q.z), new THREE.Vector3(0, 1, 0));
        const hits = ray.intersectObject(p === FRONTIER_GATE_FOOTPRINT ? door : mesh);
        expect(hits.length, `${q.x},${q.z}`).toBeGreaterThanOrEqual(2);
        expect(hits[0].point.y, `embedded at ${q.x},${q.z}`).toBeLessThanOrEqual(y);
        expect(hits.at(-1)!.point.y).toBeGreaterThan(y);
      }
    }
    for (const a of FRONTIER_ANCHORS) {
      expect(groundY(a.x, a.z)).toBeCloseTo(massifY(a.x, a.z), 5);
      expect(isWalkable(a.x, a.z, open, PLAYER_R)).toBe(false);
    }
    for (const p of FRONTIER_STONES.filter(p => p.x > 70 && p.x < 81)) expect(p.height + .27).toBeLessThanOrEqual(.82 + 1e-9);
    // Geometry itself is modest; measured per-view renderer stats come from the capture script.
    expect((wall.attributes.position.count + gate.attributes.position.count) / 3).toBeLessThanOrEqual(1000);
    wall.dispose(); gate.dispose(); material.dispose();
  });

  it("keeps both wall runs above the rendered rock shoulders, with embedded tips", () => {
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const cliff = new THREE.Mesh(cliffFaceGeometry(), material);
    const wall = new THREE.Mesh(frontierWallGeometry(), material);
    const ray = new THREE.Raycaster();
    for (const p of FRONTIER_STONES) {
      ray.set(new THREE.Vector3(p.x, 100, p.z), new THREE.Vector3(0, -1, 0));
      const rock = ray.intersectObject(cliff);
      const stone = ray.intersectObject(wall);
      expect(stone.length, `wall at ${p.x},${p.z}`).toBeGreaterThan(0);
      const terrain = Math.max(groundY(p.x, p.z), rock[0]?.point.y ?? -Infinity);
      if (p.buried) expect(stone[0].point.y).toBeLessThan(terrain);
      else {
        expect(stone[0].point.y, `visible on shoulder ${p.x},${p.z}`).toBeGreaterThan(terrain);
        expect(frontierRenderedFoundation(p).bottom).toBeLessThanOrEqual(terrain);
      }
    }
    // This was the visual regression: using groundY alone hid the side runs
    // inside the existing slab and made the parapet appear to stop on grass.
    expect(frontierTerrainY(70, -150.35)).toBeGreaterThan(groundY(70, -150.35) + 1);
    expect(frontierTerrainY(81, -150.35)).toBeGreaterThan(groundY(81, -150.35) + 1);
    cliff.geometry.dispose(); wall.geometry.dispose(); material.dispose();
  });
});
