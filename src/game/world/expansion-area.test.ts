import { expect, it } from "vitest";
import { isWalkable, moveCircle, PLAYER_R } from "./collision";
import { CLIFF_ROPE, CANOPY_ROPES, CANOPY_DECKS, STAGES, STAGE_EXITS, ZONES, nearestOnTrail, zoneAt } from "./lowland";
import { SECRET_IDS } from "./elementObjects";
import { LILY_ROUTE, hopTarget } from "../logic/lilyHop";
import { GROVE_STREAM_FERRY } from "./groveStream";

/** Baseline measured on d820c80 with this exact 0.5 m collision sampling.
 * Measures traversable floor, excluding solid props, ponds and unresolved
 * puzzle gaps (all permanent puzzle bridges and stage exits are open). */
export const BASELINE_AREA = { forest1: 286, grove: 464.75, canopy: 236.75, causeway: 600.75, coast: 250 };
export function measureAreas() {
  const areas: Record<string, number> = {};
  const necks = STAGE_EXITS.filter(gate => gate.id === "forest1").map(gate => gate.x).sort((a, b) => a - b);
  const gates = { solved: ["groveStream", "groveLilies", "canopyAscentRope", "canopyVines", "canopyRope"] as const, secrets: SECRET_IDS, act2: true, cleared: STAGES };
  const start = [Math.round(CLIFF_ROPE.foot.x * 2), Math.round(CLIFF_ROPE.foot.z * 2)];
  const reachable = new Set<string>([start.join(",")]), queue = [start];
  while (queue.length) {
    const [i, j] = queue.pop()!;
    for (const [from, to] of [[GROVE_STREAM_FERRY.north, GROVE_STREAM_FERRY.south], [GROVE_STREAM_FERRY.south, GROVE_STREAM_FERRY.north]]) {
      if (Math.hypot(i / 2 - from.x, j / 2 - from.z) > 1) continue;
      const ni = Math.round(to.x * 2), nj = Math.round(to.z * 2), key = `${ni},${nj}`;
      if (!reachable.has(key) && isWalkable(ni / 2, nj / 2, gates, PLAYER_R)) { reachable.add(key); queue.push([ni, nj]); }
    }
    for (const [id, rope] of Object.entries(CANOPY_ROPES)) {
      if (id === "entrance" ? !gates.solved.includes("canopyAscentRope") : !gates.cleared.includes("canopy")) continue;
      for (const [from, to] of [[rope.foot, rope.top], [rope.top, rope.foot]]) {
        if (Math.hypot(i / 2 - from.x, j / 2 - from.z) > 1) continue;
        const ni = Math.round(to.x * 2), nj = Math.round(to.z * 2), key = `${ni},${nj}`;
        if (!reachable.has(key) && isWalkable(to.x, to.z, gates, PLAYER_R) && isWalkable(ni / 2, nj / 2, gates, PLAYER_R)) {
          reachable.add(key); queue.push([ni, nj]);
        }
      }
    }
    // The optional islet uses explicit hop edges, never a water walk shape.
    for (const node of LILY_ROUTE) {
      const target = hopTarget(i / 2, j / 2, node.x - i / 2, node.z - j / 2, true, 1);
      if (!target) continue;
      const ni = Math.round(target.x * 2), nj = Math.round(target.z * 2), key = `${ni},${nj}`;
      if (!reachable.has(key) && isWalkable(ni / 2, nj / 2, gates, PLAYER_R)) {
        reachable.add(key); queue.push([ni, nj]);
      }
    }
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj, key = `${ni},${nj}`, x = ni / 2, z = nj / 2;
      if (reachable.has(key) || x < 20 || x >= 134 || z < -338 || z >= -153.6 || !isWalkable(x, z, gates, PLAYER_R)) continue;
      const p = moveCircle(i / 2, j / 2, x, z, PLAYER_R, gates);
      if (Math.hypot(p.x - x, p.z - z) > .05) continue;
      reachable.add(key); queue.push([ni, nj]);
    }
  }
  for (let x = 20; x < 134; x += 0.5)
    for (let z = -338; z < -153.6; z += 0.5) {
      const zone = zoneAt(x, z);
      if (zone && reachable.has(`${x * 2},${z * 2}`) && isWalkable(x, z, gates, PLAYER_R)) {
        areas[zone] = (areas[zone] ?? 0) + 0.25;
        // The old exit flight belonged to Canopy. Its footprint now counts as
        // ordinary Causeway floor; retain the downstream cap outside that rezone.
        if (zone === "causeway" && x >= 92 && x <= 100 && z >= -252 && z <= -239)
          areas.causewayFormerStairs = (areas.causewayFormerStairs ?? 0) + .25;
        if (zone === "forest1") {
          // The approach inherited the old Grove's overlapping raw shapes;
          // it now belongs to Forest until the entrance ferry lands.
          const entrance = ZONES.grove.walk.some(sh => sh.kind === "rect"
            ? x >= sh.x0 && x <= sh.x1 && z >= sh.z0 && z <= sh.z1
            : sh.kind === "disc" ? Math.hypot(x - sh.x, z - sh.z) <= sh.r
              : nearestOnTrail(sh.pts, x, z).d <= sh.w);
          const part = entrance ? "forestEntrance" : x < necks[0] ? "forestLeftArm" : x > necks[1] ? "forestRightArm" : "forestBase";
          areas[part] = (areas[part] ?? 0) + 0.25;
        }
      }
    }
  return areas;
}
it("preserves the base and downstream floor budgets, accounting for the removed branch approaches and new arms", () => {
  const a = measureAreas();
  // The deep channel gates the entrance; explicit
  // ferry edges retain every remaining ground pocket and the optional lily route.
  let groveFloor = 0;
  const groveGates = { solved: ["groveStream", "groveLilies", "canopyAscentRope", "canopyVines", "canopyRope"] as const, secrets: SECRET_IDS, act2: true, cleared: STAGES };
  for (let x = 20; x < 134; x += .5) for (let z = -338; z < -153.6; z += .5)
    if (zoneAt(x, z) === "grove" && isWalkable(x, z, groveGates, PLAYER_R)) groveFloor += .25;
  expect(a.grove).toBe(groveFloor);
  expect(1423 - a.grove - a.forestEntrance).toBeGreaterThan(150);
  expect(1423 - a.grove - a.forestEntrance).toBeLessThan(260);
  // Slice 4 removes stair area; only the authored raised decks remain Canopy.
  // Compare flood-fill reachability against independently sampled deck floor.
  let canopyFloor = 0;
  for (let x = 83; x <= 119; x += .5) for (let z = -241; z <= -200.5; z += .5) {
    if (!CANOPY_DECKS.some(({ walk }) => x >= walk.x0 && x <= walk.x1 && z >= walk.z0 && z <= walk.z1)) continue;
    if (zoneAt(x, z) === "canopy" && isWalkable(x, z, { solved: ["canopyVines", "canopyRope"], act2: true, cleared: STAGES, secrets: SECRET_IDS }, PLAYER_R)) canopyFloor += .25;
  }
  // Bridge spans are puzzle surfaces outside the fixed polygons.
  expect(a.canopy).toBeGreaterThanOrEqual(canopyFloor);
  expect(a.canopy - canopyFloor).toBeLessThan(20);
  // Slice 2 rezones the full former camp disc and removes its prop solids.
  expect(a.forestBase).toBe(778);
  expect(a.canopy).toBeGreaterThanOrEqual(407.75 * 1.7);
  for (const zone of ["forest1", "causeway", "coast"] as const) {
    const area = zone === "forest1" ? a.forestBase : a[zone];
    expect(area / BASELINE_AREA[zone], zone).toBeGreaterThanOrEqual(1.8);
    // Open secret pockets add floor in the forest base; the frozen baseline
    // was measured before those pockets were opened for this flood fill. The
    // forest's open north side (docs/SEVEN_IMPROVEMENTS.md section 2) adds more.
    const unchangedArea = area - (zone === "causeway" ? a.causewayFormerStairs : 0);
    expect(unchangedArea / BASELINE_AREA[zone], zone).toBeLessThanOrEqual(zone === "forest1" ? 2.75 : 2.2);
  }
  expect(a.forestLeftArm).toBeGreaterThan(200);
  expect(a.forestRightArm).toBeGreaterThan(200);
  expect(a.forest1).toBe(a.forestBase + a.forestLeftArm + a.forestRightArm + a.forestEntrance);
});
