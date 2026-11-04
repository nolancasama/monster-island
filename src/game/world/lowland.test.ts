import { describe, expect, it } from "vitest";
import { PLAYER_R, isWalkable, moveCircle, standY, type Gates } from "./collision";
import { groundY } from "./island";
import {
  lowlandRegionVisible, forestBankY, STAGE_EXITS, STAGES, ACT2_OBSTACLE_PLACE, CAMP2, CHESTS, CLIFF_ROPE, ENEMY_SPAWNS, LILY_PADS, PIER2, SERVICES, ZONES, zoneAt, type ZoneId,
  FOREST_ARMS, inMesa, lowlandWalkable, lowlandY, nearestOnTrail, trailLength, trailPoint, routeMarker, CANOPY_GAPS, gapDeck,
  RIGHT_ARM_TREES, RIGHT_ARM_BOULDERS, RIGHT_ARM_ROOTS, RIGHT_ARM_SOLIDS, lowlandSolids,
  GROVE_CROSSING, ISLET, POND, POND_Y, LILY_PAD_R, lilyPadRise, CANOPY_HEIGHT, canopyDeckY,
} from "./lowland";
import type { ObstacleId } from "../types";
import { ENEMIES } from "../data/combat";
import { cameraProfileAt, DEFAULT_CAMERA } from "../../scene/cameraProfiles";
import { SECRET_SITES } from "./elementObjects";
import { hazardAt } from "../logic/elements";
import { rt } from "../runtime";
import { MONSTERS } from "../data/monsters";
import { lowlandSpots } from "../../scene/models/lowland";
import { clearStage, remainingEnemies } from "../logic/act2";
import { newProgress } from "../logic/progress";
import { createHash } from "node:crypto";

const PROLOGUE: ObstacleId[] = ["fallenPalm", "river", "bridge", "cliff", "lava", "cave", "gateLeaf", "gateDrop", "gateWing", "gateFlame"];
const gates = (extra: ObstacleId[] = []): Gates => ({ solved: [...PROLOGUE, ...extra], forest: true, volcano: true, act2: true, cleared: [...STAGES] });

/** Flood the lowland from the foot of the rope with real collision moves (optionally keeping out of some areas). */
function reachable(g: Gates, avoid: ZoneId[] = [], radius = PLAYER_R, origin = CLIFF_ROPE.foot) {
  const S = 0.6;
  const start = [Math.round(origin.x / S), Math.round(origin.z / S)];
  const seen = new Set<string>([start.join(",")]);
  const queue = [start];
  while (queue.length) {
    const [i, j] = queue.pop()!;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj, key = `${ni},${nj}`;
      const x = ni * S, z = nj * S;
      if (seen.has(key) || !isWalkable(x, z, g, radius)) continue;
      const zone = zoneAt(x, z);
      if (zone && avoid.includes(zone)) continue;
      const p = moveCircle(i * S, j * S, x, z, radius, g);
      if (Math.hypot(p.x - x, p.z - z) > 0.05) continue;
      seen.add(key);
      queue.push([ni, nj]);
    }
  }
  const near = (x: number, z: number, r = 2.2) => {
    for (const k of seen) {
      const [a, b] = k.split(",").map(Number);
      if (Math.hypot(a * S - x, b * S - z) <= r) return true;
    }
    return false;
  };
  return { seen, near };
}

describe("the lowland below the sanctuary", () => {
  it("fits the real mounted body on the widened flat combat shoulders", () => {
    for (const [x, z] of [[60.5, -166], [32.6, -210], [112, -251], [91, -280]]) {
      for (const radius of [PLAYER_R, MONSTERS.bubbo.radius])
        expect(isWalkable(x, z, gates(), radius), `${x},${z} radius ${radius}`).toBe(true);
    }
  });
  it("enters and leaves camp from the north on foot and mounted, keeping props solid and the alcove safe", () => {
    for (const radius of [PLAYER_R, MONSTERS.bubbo.radius]) {
      for (const [from, to] of [[-170, -160], [-160, -170]]) {
        let p = { x: 85, z: from };
        for (let i = 1; i <= 100; i++) {
          const z = from + (to - from) * i / 100;
          p = moveCircle(p.x, p.z, 85, z, radius, gates());
          expect(p.z).toBeCloseTo(z);
        }
      }
      for (const prop of [CAMP2.tent, CAMP2.fire, CAMP2.bench])
        expect(isWalkable(prop.x, prop.z, gates(), radius)).toBe(false);
    }
    expect(zoneAt(85, -160)).toBe("camp");
    expect(ZONES.camp.hostile).toBe(false);
    expect(zoneAt(85, -170)).toBe("forest1");
  });

  it("keeps scattered trees and all ferns off walking ground unless a solid trunk covers them", () => {
    const spots = lowlandSpots(), solids = lowlandSolids();
    for (const p of [...spots.trees, ...spots.ferns, ...spots.fernTrees]) {
      if (!lowlandWalkable(p.x, p.z, gates(["groveLilies", "canopyVines", "canopyRope"]), 0)) continue;
      expect(solids.some(s => s.kind === "circle" && Math.hypot(s.x - p.x, s.z - p.z) < s.r), `${p.x},${p.z}`).toBe(true);
    }
  });
  it("is closed until Act 2 begins (only the rope leads down)", () => {
    expect(isWalkable(CLIFF_ROPE.foot.x, CLIFF_ROPE.foot.z, { ...gates(), act2: false }, PLAYER_R)).toBe(false);
    expect(isWalkable(CLIFF_ROPE.foot.x, CLIFF_ROPE.foot.z, gates(), PLAYER_R)).toBe(true);
    expect(isWalkable(CLIFF_ROPE.top.x, CLIFF_ROPE.top.z, gates(), PLAYER_R)).toBe(true);
  });

  it("from the foot of the rope: the chest, the camp, both route entrances, the causeway, the coast and every keeper", () => {
    const { near } = reachable(gates());
    const forestChest = CHESTS.find((c) => c.id === "forestChest")!;
    expect(near(forestChest.x, forestChest.z)).toBe(true);
    expect(near(CAMP2.rest.x, CAMP2.rest.z)).toBe(true);
    for (const s of Object.values(SERVICES)) expect(near(s.keeper.x, s.keeper.z, 2.8), s.id).toBe(true);
    expect(near(PIER2.x, PIER2.z0 + 1)).toBe(true);
  });

  it("either route reaches the port: the grove as it is, the canopy once Leafy and Puff have bridged its gaps", () => {
    const port = SERVICES.harbor.keeper;
    // Without the grove, the canopy's gaps stop the way until both are bridged.
    expect(reachable(gates(), ["grove"]).near(port.x, port.z, 2.8)).toBe(false);
    expect(reachable(gates(["canopyVines"]), ["grove"]).near(port.x, port.z, 2.8)).toBe(false);
    expect(reachable(gates(["canopyVines", "canopyRope"]), ["grove"]).near(port.x, port.z, 2.8)).toBe(true);
    // Without the canopy, the grove alone gets there (Bubbo's lily pads are optional).
    expect(reachable(gates(), ["canopy"]).near(port.x, port.z, 2.8)).toBe(true);
  });

  it("the mesa closes the northward route; each arm alone reaches its next stage", () => {
    expect(reachable(gates(), ["grove", "canopy"]).near(76, -249)).toBe(false);
    const left = reachable(gates(), ["canopy"]);
    const right = reachable(gates(["canopyVines", "canopyRope"]), ["grove"]);
    expect(left.near(42, -196)).toBe(true);
    expect(left.near(51, -211)).toBe(true);
    expect(right.near(113, -194)).toBe(true);
    expect(right.near(106, -208)).toBe(true);
  });

  it("the islet's treasure needs Bubbo's lily pads; the canopy's treasure needs Leafy's bridge", () => {
    const islet = CHESTS.find((c) => c.id === "isletChest")!;
    const canopy = CHESTS.find((c) => c.id === "canopyChest")!;
    expect(reachable(gates()).near(islet.x, islet.z)).toBe(false);
    expect(reachable(gates(["groveLilies"])).near(islet.x, islet.z)).toBe(true);
    expect(reachable(gates()).near(canopy.x, canopy.z)).toBe(false);
    expect(reachable(gates(["canopyVines"])).near(canopy.x, canopy.z)).toBe(true);
    // The pads and the bridges are walking surfaces once they are there.
    expect(standY(LILY_PADS[1].x, LILY_PADS[1].z, ["groveLilies"])).toBeGreaterThan(groundY(LILY_PADS[1].x, LILY_PADS[1].z));
  });

  it("each puzzle is asked from reachable ground, and every enemy lives on walkable ground in its own area", () => {
    const { near } = reachable(gates(["canopyVines"]));
    for (const [id, place] of Object.entries(ACT2_OBSTACLE_PLACE)) expect(near(place.x, place.z, 1), id).toBe(true);
    for (const e of ENEMY_SPAWNS) {
      const radius = e.kind === "forestSpitter" || e.kind === "raiderShooter" ? ENEMIES[e.kind].radius : .5;
      expect(isWalkable(e.x, e.z, gates(["canopyVines", "canopyRope", "groveLilies"]), radius), `${e.zone} ${e.x},${e.z}`).toBe(true);
      expect(zoneAt(e.x, e.z), `${e.x},${e.z}`).toBe(e.zone);
    }
  });

  it("fits both dismounted bodies safely inland and walks the raised pads both ways at either radius", () => {
    expect(ISLET.r).toBeGreaterThanOrEqual(3);
    for (const [p, radius] of [[GROVE_CROSSING.landing, PLAYER_R], [GROVE_CROSSING.friendLanding, .55]] as const)
      expect(ISLET.r - Math.hypot(p.x - ISLET.x, p.z - ISLET.z) - radius).toBeGreaterThanOrEqual(1.2);
    expect(Math.hypot(GROVE_CROSSING.near.x - POND.x, GROVE_CROSSING.near.z - POND.z) - POND.r).toBeGreaterThanOrEqual(1.2);
    expect(LILY_PADS.length).toBeGreaterThanOrEqual(5);
    for (const radius of [PLAYER_R, .7]) {
      for (const [start, end] of [[GROVE_CROSSING.near, GROVE_CROSSING.landing], [GROVE_CROSSING.landing, GROVE_CROSSING.near]]) {
        let p = { ...start };
        for (let i = 1; i <= 160; i++) {
          const t = i / 160, x = start.x + (end.x - start.x) * t, z = start.z + (end.z - start.z) * t;
          expect(isWalkable(x, z, gates(["groveLilies"]), radius), `${radius}: ${x},${z}`).toBe(true);
          p = moveCircle(p.x, p.z, x, z, radius, gates(["groveLilies"]));
          expect(Math.hypot(p.x - x, p.z - z)).toBeLessThan(.001);
          // Physical discs overlap by enough for either body, including the seam midpoint.
          if (x < POND.x + POND.r && x > ISLET.x + ISLET.r)
            expect(LILY_PADS.some(pad => Math.hypot(x - pad.x, z - pad.z) <= LILY_PAD_R)).toBe(true);
        }
        expect(p.x).toBeCloseTo(end.x);
      }
    }
  });

  it("keeps water, terrain and island standing heights fixed throughout the sequential rise", () => {
    const previous = rt.act2Unlock.groveLilies;
    const samples = [GROVE_CROSSING.landing, GROVE_CROSSING.friendLanding, GROVE_CROSSING.near, ...LILY_PADS];
    const heights = samples.map(p => groundY(p.x, p.z));
    const land = [GROVE_CROSSING.landing, GROVE_CROSSING.friendLanding, GROVE_CROSSING.near];
    const standing = land.map(p => standY(p.x, p.z, ["groveLilies"]));
    const water = POND_Y;
    try {
      for (const unlock of [0, .1, .2, .45, .8, 1]) {
        rt.act2Unlock.groveLilies = unlock;
        expect(samples.map(p => groundY(p.x, p.z))).toEqual(heights);
        expect(land.map(p => standY(p.x, p.z, ["groveLilies"]))).toEqual(standing);
        expect(POND_Y).toBe(water);
        const rise = LILY_PADS.map((_, i) => lilyPadRise(unlock, i));
        expect(rise.filter(v => v > 0 && v < 1).length).toBeLessThanOrEqual(1);
        expect(rise).toEqual([...rise].sort((a, b) => b - a));
      }
    } finally { rt.act2Unlock.groveLilies = previous; }
  });

  it("keeps the settled pond a splash hazard for enemies thrown off the safe island", () => {
    const solved = ["groveLilies", "canopyVines", "canopyRope"];
    expect(hazardAt(ISLET.x, ISLET.z, "home", solved)).toBeNull();
    // A knock from either the island's north rim or the near bank reaches deep water.
    for (const p of [{ x: ISLET.x, z: ISLET.z - ISLET.r - .5 }, { x: 41, z: -220 }]) {
      expect(Math.hypot(p.x - POND.x, p.z - POND.z)).toBeLessThan(POND.r);
      expect(hazardAt(p.x, p.z, "home", solved)?.kind).toBe("splash");
      expect(hazardAt(p.x, p.z, "home", solved)?.id).toBe("pond");
    }
  });

  it("replaces forest and coast/causeway spawns without changing stage-clear totals", () => {
    expect(STAGES.map(zone => [zone, ENEMY_SPAWNS.filter(e => e.zone === zone && !e.optional).length])).toEqual([
      ["forest1", 5], ["grove", 10], ["canopy", 9], ["causeway", 14], ["coast", 4],
    ]);
    for (const zone of ["forest1", "grove", "canopy"] as const) {
      const ranged = ENEMY_SPAWNS.filter(e => e.zone === zone && e.kind === "forestSpitter");
      expect(ranged.length, zone).toBeGreaterThan(0);
      expect(ranged.every(e => e.replaces === "gloomlet"), zone).toBe(true);
    }
    for (const zone of ["causeway", "coast"] as const) {
      const ranged = ENEMY_SPAWNS.filter(e => e.zone === zone && e.kind === "raiderShooter");
      expect(ranged.length, zone).toBeGreaterThan(0);
      expect(ranged.every(e => e.replaces === "snapjaw"), zone).toBe(true);
    }
  });

  it("requires all fourteen Causeway enemies and keeps their homes walkable", () => {
    const ids = ENEMY_SPAWNS.flatMap((e, i) => e.zone === "causeway" ? [i] : []);
    expect(ids).toHaveLength(14);
    const progress = newProgress(); progress.act2.started = true;
    for (const i of ids) {
      const e = ENEMY_SPAWNS[i];
      expect(e.optional).toBeUndefined();
      expect(isWalkable(e.x, e.z, gates(["canopyVines", "canopyRope", "groveLilies"]), ENEMIES[e.kind].radius), `${i}`).toBe(true);
      expect(e.x >= 92 && e.x <= 100 && e.z >= -252 && e.z <= -239 && i >= ENEMY_SPAWNS.length - 7).toBe(false);
      const defeated = ids.filter(id => id !== i);
      expect(remainingEnemies("causeway", defeated)).toBe(1);
      expect(clearStage(progress, "causeway", defeated).act2.cleared).not.toContain("causeway");
    }
    expect(clearStage(progress, "causeway", ids).act2.cleared).toContain("causeway");
  });

  it("preserves every pre-existing spawn index, including the first seven Causeway enemies", () => {
    const original = ENEMY_SPAWNS.slice(0, 41);
    expect(createHash("sha256").update(JSON.stringify(original)).digest("hex"))
      .toBe("ac5f4ffee6642a215b7ef34600d8a0c357639c63c3067fe7d49487495a4361ac");
  });

  it("fights happen in the forests, causeway and coast; the camp and town are safe", () => {
    const hostile = (Object.keys(ZONES) as ZoneId[]).filter((z) => ZONES[z].hostile).sort();
    expect(hostile).toEqual(["canopy", "causeway", "coast", "forest1", "grove"]);
    expect(zoneAt(CAMP2.rest.x, CAMP2.rest.z)).toBe("camp");
    expect(zoneAt(SERVICES.market.keeper.x + 2, SERVICES.market.keeper.z)).toBe("port");
    expect(zoneAt(CLIFF_ROPE.foot.x, CLIFF_ROPE.foot.z)).toBe("forest1");
  });

  it("the climber hangs in front of the rope and the rope in front of the rock face", () => {
    expect(CLIFF_ROPE.hangZ).toBeLessThan(CLIFF_ROPE.faceZ);
    expect(CLIFF_ROPE.bodyZ).toBeLessThan(CLIFF_ROPE.hangZ - 0.25);
    expect(groundY(CLIFF_ROPE.top.x, CLIFF_ROPE.top.z) - groundY(CLIFF_ROPE.foot.x, CLIFF_ROPE.foot.z)).toBeGreaterThan(12);
  });
});

describe("first-clear exit collision", () => {
  it("cannot route around any uncleared exit, including either forest neck", () => {
    for (const radius of [PLAYER_R, MONSTERS.bubbo.radius]) {
      for (const exit of STAGE_EXITS) {
        const forest = exit.id === "forest1", left = exit.x < 76;
        const origin = forest ? CLIFF_ROPE.foot : exit.id === "grove" ? { x: 51, z: -237 }
          : exit.id === "canopy" ? { x: 96, z: -236.7 } : { x: 76, z: exit.z + 4 };
        const target = forest ? { x: left ? 47 : 104, z: -175 } : exit.id === "grove" ? { x: 61, z: -248 }
          : exit.id === "canopy" ? { x: 93, z: -248 }
          // The boulder at (76.5, -269.5), r=2.2, blocks the straight-ahead target.
          : exit.id === "causeway" ? { x: 72, z: -267 } : { x: 76, z: exit.z - 4 };
        const avoid: ZoneId[] = exit.id === "grove" ? ["canopy"] : exit.id === "canopy" ? ["grove"] : [];
        const g = { ...gates(["canopyVines", "canopyRope", "groveLilies"]), cleared: STAGES.filter(id => id !== exit.id) };
        expect(reachable(g, avoid, radius, origin).near(target.x, target.z, 1), `${exit.id} ${exit.x} radius ${radius}`).toBe(false);
        expect(reachable({ ...g, cleared: [...STAGES] }, avoid, radius, origin).near(target.x, target.z, 1), `open ${exit.id} ${exit.x} radius ${radius}`).toBe(true);
      }
    }
  }, 60000);
  it("keeps the expanded stages separate and both puzzle bridges required at walking and mounted radii", () => {
    const open = gates(["groveLilies", "canopyVines", "canopyRope"]);
    for (const radius of [PLAYER_R, .7]) {
      const grove = reachable(open, ["forest1", "causeway", "coast", "port"], radius, { x: 51, z: -211 });
      for (const key of grove.seen) {
        const [i, j] = key.split(",").map(Number);
        expect(zoneAt(i * .6, j * .6), `direct Grove crossing at radius ${radius}`).not.toBe("canopy");
      }
      expect(reachable(open, ["grove", "canopy"], radius).near(76, -249), `arm shortcut ${radius}`).toBe(false);
      for (const solved of [[], ["canopyVines"], ["canopyRope"]] as ObstacleId[][])
        expect(reachable(gates(solved), ["grove"], radius).near(80.5, -317.5, 2.8), `bridge bypass ${radius}: ${solved}`).toBe(false);
      const canopy = reachable(open, ["grove"], radius);
      expect(canopy.near(80.5, -317.5, 2.8), `Canopy route ${radius}`).toBe(true);
      const groveRoute = reachable(gates(), ["canopy"], radius);
      expect(groveRoute.near(80.5, -317.5, 2.8), `Grove needs no Bubbo ${radius}`).toBe(true);
    }
  }, 60000);
  it("blocks the forest exit with every approach, while the rope and every required enemy remain reachable", () => {
    const g={...gates(),cleared:[]};
    const reach=reachable(g);
    expect(reach.near(CAMP2.rest.x,CAMP2.rest.z)).toBe(true);
    expect(reach.near(CLIFF_ROPE.foot.x,CLIFF_ROPE.foot.z,1)).toBe(true);
    for(const e of ENEMY_SPAWNS.filter(e=>e.zone==="forest1" && !e.optional))expect(reach.near(e.x,e.z,1.5),`${e.x},${e.z}`).toBe(true);
    for(const e of ENEMY_SPAWNS.filter(e=>e.optional))expect(reach.near(e.x,e.z,1.5),`${e.x},${e.z}`).toBe(false);
  });
  it("each gate cuts walking and mounted approaches and opens only for its own first-clear flag", () => {
    for(const exit of STAGE_EXITS) {
      for(const radius of [PLAYER_R,.7]) {
        const g={...gates(["canopyVines","canopyRope"]),cleared:STAGES.filter(id=>id!==exit.id)};
        for(let t=exit.orientation==="x"?exit.cut.x0:exit.cut.z0;t<(exit.orientation==="x"?exit.cut.x1:exit.cut.z1);t+=.3)
          expect(isWalkable(exit.orientation==="x"?t:exit.x,exit.orientation==="x"?exit.z:t,g,radius),`${exit.id} bypass at ${t}`).toBe(false);
        const axis=exit.orientation==="x"?"z":"x";
        const direction=exit.id==="forest1" && exit.x<76 ? -1 : exit.id==="forest1" ? 1 : -1;
        const start={x:exit.x,z:exit.z},end={...start};
        start[axis]-=direction*1.8; end[axis]+=direction*1.8;
        const closed=moveCircle(start.x,start.z,end.x,end.z,radius,g);
        expect((closed[axis]-exit[axis])*direction).toBeLessThan(0);
        const opened=moveCircle(start.x,start.z,end.x,end.z,radius,{...g,cleared:[...STAGES]});
        expect((opened[axis]-exit[axis])*direction,exit.id).toBeGreaterThan(0);
        // Retreat south toward the previous area remains possible before clearing.
        const retreatEnd={...start};retreatEnd[axis]-=direction*1.2;
        const retreat=moveCircle(start.x,start.z,retreatEnd.x,retreatEnd.z,radius,g);
        expect((retreat[axis]-exit[axis])*direction,exit.id).toBeLessThan(-2);
      }
    }
  });
  it("either branch alone unlocks a route to Port Town; the second branch is optional",()=>{
    for(const branch of ["grove","canopy"] as const){
      const g={...gates(["canopyVines","canopyRope"]),cleared:["forest1",branch,"causeway","coast"] as typeof STAGES[number][]};
      const reach=reachable(g,[branch==="grove"?"canopy":"grove"]);
      expect(reach.near(SERVICES.harbor.keeper.x,SERVICES.harbor.keeper.z,2.8),branch).toBe(true);
      for(const e of ENEMY_SPAWNS.filter(e=>["forest1",branch,"causeway","coast"].includes(e.zone)))
        expect(reach.near(e.x,e.z,1.5),`${branch}: enemy ${e.x},${e.z}`).toBe(true);
    }
  });
});

it("draws one real lowland from the overlook, rope and every stage, while keeping the prologue isolated",()=>{
  for(const [x,z] of [[87,-129],[75.5,-149.8],[75.5,-152.15],[75.5,-154.4],...Object.values(ZONES).map(zone=>{
    const sh=zone.walk[0];
    return sh.kind==="disc"?[sh.x,sh.z]:sh.kind==="trail"?sh.pts[0]:[sh.x0,sh.z0];
  })]) expect(lowlandRegionVisible(x,z),`${x},${z}`).toBe(true);
  expect(lowlandRegionVisible(87,-129)).toBe(true);
  expect(lowlandRegionVisible(70,-127)).toBe(true);
  expect(lowlandRegionVisible(70,-127,true)).toBe(false);
  for(const [x,z] of [[0,0],[0,-60],[70,-117],[70,-125]]) expect(lowlandRegionVisible(x,z),`${x},${z}`).toBe(false);
});

it("opens low visual shoulders beside every crossing without widening gate collision",()=>{
  for(const exit of STAGE_EXITS.filter(exit=>exit.id!=="forest1")) {
    for(const dx of [-exit.half-2,0,exit.half+2])
      for(const dz of [-5,0,5]) expect(forestBankY(exit.x+dx,exit.z+dz),`${exit.id} ${dx},${dz}`).toBeLessThanOrEqual(.41);
    const locked={...gates(),cleared:STAGES.filter(id=>id!==exit.id)};
    expect(isWalkable(exit.x,exit.z,locked,.7),exit.id).toBe(false);
  }
  for(const [x,z] of [[40,-159],[40,-288],[30,-210],[123,-210]]) {
    const boundary=forestBankY(x,z);
    expect(boundary).toBe(0);
    for(const [dx,dz] of [[.01,0],[-.01,0],[0,.01],[0,-.01]])
      expect(Math.abs(forestBankY(x+dx,z+dz)-boundary)).toBeLessThan(.001);
  }
});

describe("the U around the reserved mesa", () => {
  it("keeps the new canopy trunks, roots and rocks outside a four-metre mounted corridor and enemy homes", () => {
    expect(RIGHT_ARM_TREES).toHaveLength(3);
    expect(RIGHT_ARM_TREES.map(t => t.r)).toEqual([...RIGHT_ARM_TREES.map(t => t.r)].sort((a, b) => a - b));
    expect(RIGHT_ARM_SOLIDS).toHaveLength(RIGHT_ARM_TREES.length + RIGHT_ARM_ROOTS.length + RIGHT_ARM_BOULDERS.length);
    const solids = lowlandSolids();
    for (const solid of RIGHT_ARM_SOLIDS) {
      expect(solids).toContainEqual(solid);
      if (solid.kind === "box") throw new Error("Canopy dressing uses circles and capsules");
      const pts: Array<[number, number]> = solid.kind === "circle" ? [[solid.x, solid.z]] : [[solid.ax, solid.az], [solid.bx, solid.bz]];
      const length = trailLength(pts);
      // Include both ends and every 5 cm of an exposed root, including the
      // full visible radius. An extra .7 m leaves a 4 m mounted corridor.
      const samples = Math.max(1, Math.ceil(length / .05));
      for (let sample = 0; sample <= samples; sample++) {
        const s = length * sample / samples;
        const p = pts.length === 1 ? { x: pts[0][0], z: pts[0][1] } : trailPoint(pts, s);
        for (const arm of Object.values(FOREST_ARMS))
          expect(nearestOnTrail(arm, p.x, p.z).d - solid.r, `${JSON.stringify(solid)} at ${s}`).toBeGreaterThanOrEqual(2.7);
      }
      for (const home of ENEMY_SPAWNS.filter(e => e.optional)) {
        const distance = solid.kind === "circle" ? Math.hypot(home.x - solid.x, home.z - solid.z)
          : nearestOnTrail(pts, home.x, home.z).d;
        expect(distance - solid.r, `enemy home ${home.x},${home.z}`).toBeGreaterThan(ENEMIES[home.kind].radius + .7);
      }
    }
  });

  it("still moves a mounted body along both complete arm centrelines with the new scenery solids", () => {
    const g = gates(["canopyVines", "canopyRope"]);
    for (const side of ["left", "right"] as const) {
      const pts = FOREST_ARMS[side], length = trailLength(pts);
      let previous = trailPoint(pts, 0);
      for (let s = .25; s <= length + .25; s += .25) {
        const next = trailPoint(pts, Math.min(s, length));
        expect(isWalkable(next.x, next.z, g, .7), `${side} at ${s}`).toBe(true);
        const actual = moveCircle(previous.x, previous.z, next.x, next.z, .7, g);
        expect(Math.hypot(actual.x - next.x, actual.z - next.z), `${side} at ${s}`).toBeLessThan(.01);
        previous = actual;
      }
    }
  });

  it("has two independent first-clear necks leading to the Grove and the new Canopy stair foot", () => {
    expect(STAGE_EXITS.filter(gate => gate.id === "forest1").map(gate => gate.orientation)).toEqual(["z", "z"]);
    for (const side of ["left", "right"] as const) {
      const pts = FOREST_ARMS[side], next = side === "left" ? "grove" : "canopy";
      let boundary = 0;
      for (; boundary < trailLength(pts); boundary += .05) {
        const p = trailPoint(pts, boundary);
        if (zoneAt(p.x, p.z) === next) break;
      }
      // The right arm now stops at the stair foot, sixteen metres before
      // the deck. The left arm retains its original forty-metre approach.
      expect(boundary, side).toBeGreaterThanOrEqual(side === "left" ? 40 : 28);
      expect(boundary, side).toBeLessThan(trailLength(pts) + .05);
      if (side === "right") expect(trailPoint(pts, trailLength(pts))).toEqual({ x: 107.5, z: -184.5 });
    }
    expect(routeMarker("forest1", 58)).toEqual({ x: 47, z: -175 });
    expect(routeMarker("forest1", 94)).toEqual({ x: 104, z: -174 });
    expect(routeMarker("camp", CAMP2.rest.x)).toEqual(routeMarker("forest1", CAMP2.rest.x));
  });

  it("leaves no raw walk shape within 1.5 metres of the mesa footprint", () => {
    for (let x = 63.5; x <= 90.5; x += .25) for (let z = -232.5; z <= -185.5; z += .25) {
      if (!inMesa(x, z, 1.49)) continue;
      for (const zone of Object.values(ZONES)) for (const sh of zone.walk) {
        const inside = sh.kind === "disc" ? Math.hypot(x - sh.x, z - sh.z) <= sh.r
          : sh.kind === "trail" ? nearestOnTrail(sh.pts, x, z).d <= sh.w
          : x >= sh.x0 && x <= sh.x1 && z >= sh.z0 && z <= sh.z1;
        expect(inside, `${zone.id} shape at ${x},${z}`).toBe(false);
      }
      expect(lowlandWalkable(x, z, gates(["canopyVines", "canopyRope"]), 0), `${x},${z}`).toBe(false);
    }
  });

  it("keeps the actual follow-camera position outside the mesa over every walkable sample", () => {
    const g = gates(["canopyVines", "canopyRope", "groveLilies"]);
    for (let x = 30; x <= 124; x += .4) for (let z = -338; z <= -154; z += .4) {
      if (!lowlandWalkable(x, z, g, 0)) continue;
      const p = { x, z, y: lowlandY(x, z), climbing: false, cloud: false };
      const profile = cameraProfileAt(p), frame = profile.resolve?.(p, DEFAULT_CAMERA) ?? profile;
      // Check the actual ahead-adjusted lens and the full distance envelope
      // specified for the mesa, so either framing remains outside rock.
      for (const ahead of [frame.ahead, 0]) {
        const horizontal = frame.dist * Math.cos(frame.pitch) - ahead;
        const cx = x + horizontal * Math.sin(frame.yaw), cz = z + horizontal * Math.cos(frame.yaw);
        expect(inMesa(cx, cz), `camera at ${cx},${cz}; player at ${x},${z}`).toBe(false);
      }
    }
  });

  it("has continuous terrain through every forest, camp and stage boundary and keeps both root decks in place", () => {
    const g = gates(["canopyVines", "canopyRope", "groveLilies"]);
    for (let x = 33; x <= 119; x += .4) for (let z = -247; z <= -154; z += .4) {
      if (!lowlandWalkable(x, z, g, PLAYER_R)) continue;
      for (const [dx, dz] of [[.05, 0], [0, .05]]) {
        if (!lowlandWalkable(x + dx, z + dz, g, PLAYER_R) || zoneAt(x, z) === zoneAt(x + dx, z + dz)) continue;
        expect(Math.abs(lowlandY(x + dx, z + dz) - lowlandY(x, z)), `${x},${z}`).toBeLessThan(.08);
      }
    }
    expect(CANOPY_GAPS).toEqual({ canopyVines: { x: 106, z0: -219.5, z1: -216 }, canopyRope: { x: 106, z0: -229, z1: -225.5 } });
    for (const id of ["canopyVines", "canopyRope"] as const) {
      const deck = gapDeck(id), gap = CANOPY_GAPS[id];
      expect(deck).toEqual({ kind: "rect", x0: 105.05, x1: 106.95, z0: gap.z0 - 1, z1: gap.z1 + 1 });
      for (const z of [deck.z0, deck.z1]) expect(canopyDeckY(gap.x, z) - lowlandY(gap.x, z)).toBeCloseTo(CANOPY_HEIGHT);
    }
  });

  it("keeps the tutorial's five required enemies in the base and three optional enemies on each arm", () => {
    const required = ENEMY_SPAWNS.filter(e => e.zone === "forest1" && !e.optional);
    expect(required).toHaveLength(5);
    expect(required.every(e => e.z >= -183 && e.x > 60 && e.x < 90)).toBe(true);
    for (const side of ["left", "right"] as const) {
      const optional = ENEMY_SPAWNS.filter(e => e.optional && (side === "left" ? e.x < 76 : e.x > 76));
      expect(optional).toHaveLength(3);
      for (const e of optional) {
        expect(e.zone).toBe("forest1");
        // The last right-arm enemy retains its identity in the ground
        // pocket beside the stairs after the old diagonal trail is removed.
        if (side === "right" && e.z < -184.5)
          expect(isWalkable(e.x, e.z, gates(), ENEMIES[e.kind].radius)).toBe(true);
        else expect(nearestOnTrail(FOREST_ARMS[side], e.x, e.z).d).toBeLessThan(2);
      }
    }
    const reach = reachable(gates());
    for (const id of ["forestChest", "rootHollowChest"]) {
      const chest = CHESTS.find(chest => chest.id === id)!;
      expect(reach.near(chest.x, chest.z), id).toBe(true);
    }
    const approach = SECRET_SITES.emberThicket.approach;
    expect(reach.near(approach.x, approach.z, 1)).toBe(true);
  });
});
