import { describe, expect, it } from "vitest";
import { PLAYER_R, isWalkable, moveCircle, standY, type Gates } from "./collision";
import { groundY } from "./island";
import {
  panoramaVisible, stageDetailVisible, STAGES, ACT2_OBSTACLE_PLACE, CAMP2, CHESTS, CLIFF_ROPE, ENEMY_SPAWNS, LILY_PADS, PIER2, SERVICES, ZONES, zoneAt, type ZoneId
} from "./lowland";
import { TRANSITIONS, passageLocal, transitionApproach, transitionEntry, transitionTrigger } from "./transitions";
import type { ObstacleId } from "../types";

const PROLOGUE: ObstacleId[] = ["fallenPalm", "river", "bridge", "cliff", "lava", "cave", "gateLeaf", "gateDrop", "gateWing", "gateFlame"];
const gates = (extra: ObstacleId[] = []): Gates => ({ solved: [...PROLOGUE, ...extra], forest: true, volcano: true, act2: true, cleared: [...STAGES] });

/** Flood the lowland from the foot of the rope with real collision moves (optionally keeping out of some areas). */
function reachable(g: Gates, avoid: ZoneId[] = []) {
  const S = 0.6;
  const start = [Math.round(CLIFF_ROPE.foot.x / S), Math.round(CLIFF_ROPE.foot.z / S)];
  const seen = new Set<string>([start.join(",")]);
  const queue = [start];
  while (queue.length) {
    const [i, j] = queue.pop()!;
    // Walking enters the enclosed pocket, then the transition commits the
    // paired landing. There is deliberately no continuous floor across zones.
    const entry = transitionEntry(i*S,j*S,zoneAt(i*S,j*S),g);
    if(entry && !avoid.includes(entry.to.zone)) {
      const landing=transitionApproach(entry.to);
      const ni=Math.round(landing.x/S),nj=Math.round(landing.z/S),key=`${ni},${nj}`;
      if(!seen.has(key) && isWalkable(ni*S,nj*S,g,PLAYER_R) && zoneAt(ni*S,nj*S)===entry.to.zone) {
        seen.add(key);queue.push([ni,nj]);
      }
    }
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj, key = `${ni},${nj}`;
      const x = ni * S, z = nj * S;
      if (seen.has(key) || !isWalkable(x, z, g, PLAYER_R)) continue;
      const zone = zoneAt(x, z);
      if (zone && avoid.includes(zone)) continue;
      const p = moveCircle(i * S, j * S, x, z, PLAYER_R, g);
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
    expect(reachable(gates(), ["grove", "oldTrail"]).near(port.x, port.z, 2.8)).toBe(false);
    expect(reachable(gates(["canopyVines"]), ["grove", "oldTrail"]).near(port.x, port.z, 2.8)).toBe(false);
    expect(reachable(gates(["canopyVines", "canopyRope"]), ["grove", "oldTrail"]).near(port.x, port.z, 2.8)).toBe(true);
    // Without the canopy, the grove alone gets there (Bubbo's lily pads are optional).
    expect(reachable(gates(), ["canopy", "oldTrail"]).near(port.x, port.z, 2.8)).toBe(true);
  });

  it("the shortcut gate joins the camp and the causeway directly once its thorns are burned", () => {
    const causeway = { x: 76, z: -249 };
    expect(reachable(gates(), ["grove", "canopy"]).near(causeway.x, causeway.z)).toBe(false);
    expect(reachable(gates(["causewayGate"]), ["grove", "canopy"]).near(causeway.x, causeway.z)).toBe(true);
    // Its thorns are asked about from the causeway side.
    const g = ACT2_OBSTACLE_PLACE.causewayGate;
    expect(reachable(gates()).near(g.x, g.z, 1)).toBe(true);
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
      expect(isWalkable(e.x, e.z, gates(["canopyVines", "canopyRope", "groveLilies", "causewayGate"]), 0.5), `${e.zone} ${e.x},${e.z}`).toBe(true);
      expect(zoneAt(e.x, e.z), `${e.x},${e.z}`).toBe(e.zone);
    }
  });

  it("fights happen in the forests, causeway and coast; the camp, the old trail and the town are safe", () => {
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
  it("blocks the forest exit with every approach, while the rope and every required enemy remain reachable", () => {
    const g={...gates(),cleared:[]};
    const reach=reachable(g);
    expect(reach.near(CAMP2.rest.x,CAMP2.rest.z)).toBe(false);
    expect(reach.near(CLIFF_ROPE.foot.x,CLIFF_ROPE.foot.z,1)).toBe(true);
    for(const e of ENEMY_SPAWNS.filter(e=>e.zone==="forest1"))expect(reach.near(e.x,e.z,1.5),`${e.x},${e.z}`).toBe(true);
  });
  it("each exit pocket blocks entry until its own first clear, and keeps its backing when open", () => {
    for(const passage of TRANSITIONS.filter(t=>t.clear)) {
      for(const radius of [PLAYER_R,.7]) {
        const g={...gates(["canopyVines","canopyRope"]),cleared:STAGES.filter(id=>id!==passage.clear)};
        const start=transitionApproach(passage.a),target=transitionTrigger(passage.a);
        const closed=moveCircle(start.x,start.z,target.x,target.z,radius,g);
        expect(transitionEntry(closed.x,closed.z,passage.a.zone,g),passage.id).toBeNull();
        const opened=moveCircle(start.x,start.z,target.x,target.z,radius,{...g,cleared:[...STAGES]});
        expect(transitionEntry(opened.x,opened.z,passage.a.zone,{...g,cleared:[...STAGES]})?.def.id).toBe(passage.id);
        expect(passageLocal(passage.a,closed.x,closed.z).depth).toBeLessThan(1.05);
      }
    }
  });
  it("either branch alone unlocks a route to Port Town; the second branch is optional",()=>{
    for(const branch of ["grove","canopy"] as const){
      const g={...gates(["canopyVines","canopyRope"]),cleared:["forest1",branch,"causeway","coast"] as typeof STAGES[number][]};
      const reach=reachable(g,[branch==="grove"?"canopy":"grove","oldTrail"]);
      expect(reach.near(SERVICES.harbor.keeper.x,SERVICES.harbor.keeper.z,2.8),branch).toBe(true);
      for(const e of ENEMY_SPAWNS.filter(e=>["forest1",branch,"causeway","coast"].includes(e.zone)))
        expect(reach.near(e.x,e.z,1.5),`${branch}: enemy ${e.x},${e.z}`).toBe(true);
    }
  });
});

it("the early overlook is before the lair, while stage details belong only to the current zone",()=>{
  expect(panoramaVisible(87,-129,-120)).toBe(true);
  expect(panoramaVisible(70,-117,-110)).toBe(false);
  for(const owner of STAGES) for(const active of STAGES) expect(stageDetailVisible(owner,active)).toBe(owner===active);
  expect(stageDetailVisible("grove",null)).toBe(false);
});
