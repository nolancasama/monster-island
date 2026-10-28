import { describe, expect, it } from "vitest";
import { CAVE_PASSAGE, COURTYARD, GARDEN, SEA_Y, TUNNEL, VOLCANO, VOLCANO_CONE, VOLCANO_PATH, EMBER_SLOPE, forestMask, groundY, inTunnel, massifY, tunnelCoverY, volcanoFloor, volcanoMask } from "./island";
import { PLAYER_R, isWalkable, moveCircle, type Gates } from "./collision";
import { BASIN } from "./lowland";

const all: Gates = { solved: ["fallenPalm", "river", "bridge", "cliff", "lava", "cave", "gateLeaf", "gateDrop", "gateWing", "gateFlame"], forest: true, volcano: true };

describe("the island's north is one landmass", () => {
  it("every spot a player can reach north of the cliff stands on its own floor, never under the massif", () => {
    // Flood fill from the cliff top with real collision moves.
    const S = 0.5;
    const seen = new Set<string>([`${Math.round(34 / S)},${Math.round(-47.6 / S)}`]);
    const queue: number[][] = [[Math.round(34 / S), Math.round(-47.6 / S)]];
    while (queue.length) {
      const [i, j] = queue.pop()!;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj, key = `${ni},${nj}`;
        const x = ni * S, z = nj * S;
        if (seen.has(key) || z > -45 || !isWalkable(x, z, all, PLAYER_R)) continue;
        const p = moveCircle(i * S, j * S, x, z, PLAYER_R, all);
        if (Math.hypot(p.x - x, p.z - z) > 0.05) continue;
        seen.add(key);
        queue.push([ni, nj]);
        // Fully masked: the height is the floor's, whatever the massif does around it.
        expect(Math.max(volcanoMask(x, z), forestMask(x, z)), key).toBeGreaterThan(0.999);
        if (z < -53) expect(groundY(x, z), key).toBeCloseTo(volcanoFloor(x, z), 5);
      }
    }
    expect(seen.size).toBeGreaterThan(3000);
  });

  it("the ridge covers the whole tunnel well above its roof, and the passage stays open", () => {
    const roof = volcanoFloor(TUNNEL.x, TUNNEL.z1) + TUNNEL.roof;
    for (let z = TUNNEL.z1; z >= TUNNEL.z0 + 1; z -= 1) {
      for (let x = TUNNEL.x - 4; x <= TUNNEL.x + 4; x += 1) expect(tunnelCoverY(x, z)!, `${x},${z}`).toBeGreaterThan(roof + 1.5);
      expect(inTunnel(TUNNEL.x, z - 0.5)).toBe(true);
      expect(isWalkable(TUNNEL.x, z - 0.5, all, PLAYER_R)).toBe(true);
    }
    // ...and leads straight on into the courtyard in front of the gate.
    expect(CAVE_PASSAGE.z0).toBeLessThan(COURTYARD.z1 - 1);
  });

  it("has a real volcano with a crater, and falls to the sea all round", () => {
    expect(massifY(VOLCANO.x + VOLCANO_CONE.rim, VOLCANO.z)).toBeGreaterThan(40);
    expect(massifY(VOLCANO.x, VOLCANO.z)).toBeLessThan(massifY(VOLCANO.x + VOLCANO_CONE.rim, VOLCANO.z));
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
      // Far out from the sanctuary, in every direction north of the forest, it is sea.
      const x = 74 + Math.cos(a) * 75, z = -112 + Math.sin(a) * 75;
      // North of the sanctuary the island goes on as Act 2's lowland (tested below).
      if (z > -60 || x < 30 || (x > BASIN.x0 && x < BASIN.x1 && z < -150)) continue;
      expect(massifY(x, z), `${x.toFixed(0)},${z.toFixed(0)}`).toBeLessThan(SEA_Y);
    }
  });

  it("the lowland below the sanctuary is land that ends in the sea on its three open sides", () => {
    for (const [x, z] of [[76, -200], [50, -230], [106, -222], [76, -305]]) expect(groundY(x, z), `${x},${z}`).toBeGreaterThan(SEA_Y + 0.5);
    for (let z = -170; z > BASIN.z0; z -= 20) {
      expect(massifY(BASIN.x0 + 1, z), `west ${z}`).toBeLessThan(SEA_Y);
      expect(massifY(BASIN.x1 - 1, z), `east ${z}`).toBeLessThan(SEA_Y);
    }
    for (let x = BASIN.x0 + 4; x < BASIN.x1; x += 10) expect(massifY(x, BASIN.z0 + 4), `north ${x}`).toBeLessThan(SEA_Y);
  });

  it("the garden stands on a shelf above the land around it", () => {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      const x = GARDEN.x + Math.cos(a) * (GARDEN.r + 6), z = GARDEN.z + Math.sin(a) * (GARDEN.r + 6);
      if (z > COURTYARD.z0) continue;
      expect(groundY(x, z), `${x.toFixed(0)},${z.toFixed(0)}`).toBeLessThan(volcanoFloor(GARDEN.x, GARDEN.z) - 2);
    }
  });

  it("walkable trail edges never sit lower than the land beside them by a hidden step", () => {
    // The floor meets the massif within the 3 m mask fringe: no gap under the edge of walkable land.
    for (const a of [...VOLCANO_PATH, EMBER_SLOPE]) {
      const z = (a.z0 + a.z1) / 2;
      for (const x of [a.x0 - 0.5, a.x1 + 0.5]) expect(Number.isFinite(groundY(x, z))).toBe(true);
    }
  });
});
