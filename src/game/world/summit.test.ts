import { afterEach, describe, expect, it } from "vitest";
import { BUBBLE_LANDING, SUMMIT_BRIDGE, SUMMIT_CHEST, SUMMIT_DEPARTURE, UPPER_ROPE, onSummit, summitY } from "./upperCanopy";
import { gatesOf, isWalkable, standY } from "./collision";
import { ENEMY_SPAWNS, CHESTS, zoneAt } from "./lowland";
import { mesaFloorY } from "./mesa";
import { region } from "./region";
import { OBSTACLES, newProgress } from "../logic/progress";
import { decodeSave } from "../logic/save";
import { bubbleCamera, bubbleDestination, bubblePath, causewayLens, pathPoint } from "../flow/summit";

const gates = { solved: [] as const, act2: true };
afterEach(() => { region.layer = "ground"; });

function reach(fromX: number, fromZ: number, layer: "ground" | "cave" | "high", r = .35) {
  const step = .4, key = (i: number, j: number) => `${i},${j}`, seen = new Set<string>();
  const start: [number, number] = [Math.round(fromX / step), Math.round(fromZ / step)], queue = [start];
  seen.add(key(...start));
  while (queue.length) {
    const [i, j] = queue.shift()!;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj, k = key(ni, nj);
      if (seen.has(k) || !isWalkable(ni * step, nj * step, gates, r, false, layer)) continue;
      seen.add(k);
      queue.push([ni, nj]);
    }
  }
  return (x: number, z: number) => [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]].some(([a, b]) => seen.has(key(Math.round(x / step) + a, Math.round(z / step) + b)));
}

describe("the mountain summit", () => {
  it("stands on the rendered plateau, and is reached only along the treetops", () => {
    expect(zoneAt(SUMMIT_DEPARTURE.x, SUMMIT_DEPARTURE.z, "high")).toBe("summit");
    expect(standY(SUMMIT_DEPARTURE.x, SUMMIT_DEPARTURE.z, [], "high")).toBeCloseTo(summitY(SUMMIT_DEPARTURE.x, SUMMIT_DEPARTURE.z), 6);
    expect(summitY(77, -209)).toBeGreaterThan(22);
    for (const r of [.35, .55]) {
      const fromTop = reach(UPPER_ROPE.top.x, UPPER_ROPE.top.z, "high", r);
      expect(fromTop(SUMMIT_DEPARTURE.x, SUMMIT_DEPARTURE.z + 1), `radius ${r}`).toBe(true);
      expect(fromTop(SUMMIT_CHEST.x + 1.2, SUMMIT_CHEST.z + .6)).toBe(true);
    }
    // The ground and the cave never touch the summit floor.
    expect(isWalkable(SUMMIT_DEPARTURE.x, SUMMIT_DEPARTURE.z, gates, .35, false, "ground")).toBe(false);
    expect(isWalkable(SUMMIT_DEPARTURE.x, SUMMIT_DEPARTURE.z, gates, .35, false, "cave")).toBe(false);
    expect(onSummit(SUMMIT_BRIDGE.pts[1][0], SUMMIT_BRIDGE.pts[1][1], .55)).toBe(true);
  });

  it("holds an ornate chest with the Summit Star, once only", () => {
    expect(CHESTS.find(c => c.id === "summitChest")).toMatchObject({ layer: "high", coins: 60, amber: 3, relic: "summitStar" });
    expect(isWalkable(SUMMIT_CHEST.x, SUMMIT_CHEST.z, gates, 0, false, "high")).toBe(false);
  });
});

describe("Bubbo's bubble descent", () => {
  it("is asked with Can you help me? and goes to the Causeway only when a walking route opens it", () => {
    expect(OBSTACLES.summitBubble).toEqual({ id: "summitBubble", needs: "swim", question: "canHelp", others: ["canFly", "canFire"], after: [] });
    expect(bubbleDestination(["forest1"])).toBe("canopy");
    expect(bubbleDestination(["forest1", "grove"])).toBe("causeway");
    expect(bubbleDestination(["forest1", "canopy"])).toBe("causeway");
  });

  it("lands on open floor 7 m or more from every Causeway enemy, and the fallback on the rope foot", () => {
    const c = BUBBLE_LANDING.causeway;
    expect(zoneAt(c.x, c.z)).toBe("causeway");
    expect(isWalkable(c.x, c.z, gatesOf({ ...newProgress(), act2: { ...newProgress().act2, started: true } }), .55, false, "ground")).toBe(true);
    const live = ENEMY_SPAWNS.filter(s => s.zone === "causeway" && !s.retired);
    expect(live).toHaveLength(8);
    for (const s of live) expect(Math.hypot(s.x - c.x, s.z - c.z), `${s.x},${s.z}`).toBeGreaterThanOrEqual(7);
    expect(zoneAt(BUBBLE_LANDING.canopy.x, BUBBLE_LANDING.canopy.z)).toBe("canopy");
  });

  it("flies a smooth path whose camera never enters the mountain and ends on the ordinary Causeway view", () => {
    const from = { x: SUMMIT_DEPARTURE.x, y: summitY(SUMMIT_DEPARTURE.x, SUMMIT_DEPARTURE.z), z: SUMMIT_DEPARTURE.z };
    for (const to of ["causeway", "canopy"] as const) {
      const pts = bubblePath(from, to);
      let prev = pathPoint(pts, .09);
      for (let u = .1; u <= 1.0001; u += .01) {
        const p = pathPoint(pts, u);
        expect(Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]), `${to} step ${u.toFixed(2)}`).toBeLessThan(2.5);
        // The bubble itself stays above the mesa's rock and the ground.
        expect(p[1], `${to} bubble ${u.toFixed(2)}`).toBeGreaterThan(Math.max(mesaFloorY(p[0], p[2]) - .3, standY(p[0], p[2], [], "ground") - .05));
        const { cam } = bubbleCamera(pts, u, to);
        expect(cam[1], `${to} lens ${u.toFixed(2)}`).toBeGreaterThan(Math.max(mesaFloorY(cam[0], cam[2]), standY(cam[0], cam[2], [], "ground")) + .5);
        prev = p;
      }
    }
    const pts = bubblePath(from, "causeway"), end = pts[pts.length - 1];
    expect(bubbleCamera(pts, 1, "causeway").cam).toEqual(causewayLens(end[0], end[1], end[2]).cam);
  });

  it("loads a summit save on the summit, and a mid-descent save on the departure stone", () => {
    const p = newProgress();
    for (const id of ["leafy", "bubbo", "puff", "ember", "lumo"] as const)
      p.monsters[id] = { discovered: true, friend: true, asked: {}, canKnown: {}, described: { name: true, size: true, part: true }, invited: true };
    p.active = "bubbo"; p.metMaple = true; p.endings = 3;
    p.solved = ["fallenPalm", "river", "bridge", "cliff", "lava", "cave", "gateLeaf", "gateDrop", "gateWing", "gateFlame", "canopyAscentRope", "canopyVines", "canopyRope"];
    p.act2 = { ...p.act2, started: true, lumoTaken: true, descended: true, zone: "canopy", checkpoint: "cliff", cleared: ["forest1"], tutorial: ["attack", "coins", "special", "eat", "rest", "switch"] };
    const loaded = decodeSave(JSON.stringify({ v: 4, progress: p, player: { x: SUMMIT_DEPARTURE.x, z: SUMMIT_DEPARTURE.z, yaw: 0, layer: "high" }, seconds: 1 }))!;
    expect(loaded.player).toMatchObject({ x: SUMMIT_DEPARTURE.x, z: SUMMIT_DEPARTURE.z, layer: "high" });
    expect(loaded.progress.act2.zone).toBe("summit");
  });
});
