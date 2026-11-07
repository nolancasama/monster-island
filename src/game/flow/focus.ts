import { MONSTERS, LIVE_MONSTERS } from "../data/monsters";
import { FOODS } from "../data/foods";
import { gateOpen, isSolved, objective } from "../logic/progress";
import { getGame, type Focus } from "../store";
import { rt } from "../runtime";
import { BRIDGE, CLIFF_TOP_SPOT, CROSSING, FALLEN_PALM, FOOD_SOURCES, FOREST_SIGN, INTERACT_RANGE, MONSTER_STONE, ROPE } from "../world/island";
import type { Vec2 } from "../types";
import { ACT2_PLACE, PHASE3_PLACE } from "./obstacles";
import { lumoHidden } from "./act2";
import { cloudCandidates } from "./act3";
import { CLOUD_SPAWNS, HOLLOW } from "../world/cloudisle";
import { CANOPY_ROPES, CHESTS, CLIFF_ROPE, FORK_SIGN, routeMarker, SERVICES, zoneAt, type ServiceId } from "../world/lowland";
import { UPPER_ROPE } from "../world/upperCanopy";
import { obstacleAvailable } from "../logic/progress";
import type { ObstacleId } from "../types";
import { GROVE_STREAM_FERRY } from "../world/groveStream";

/** What E does at each of the town's services. */
const SERVICE_FOCUS: Record<ServiceId, { verb: string; noun: string }> = {
  market: { verb: "Buy", noun: "food" },
  kitchen: { verb: "Make", noun: "a treat" },
  trainer: { verb: "Talk to", noun: "the trainer" },
  inn: { verb: "Rest at", noun: "the inn" },
  harbor: { verb: "Ask about", noun: "the ship" }
};
const ACT2_NOUN: Record<keyof typeof ACT2_PLACE, string> = { caveTorches: "the torch", groveStream: "the stream", groveLilies: "the pond", canopyVines: "the gap", canopyRope: "the gap", canopyAscentRope: "the rope coil" };

/**
 * What E (or the touch action button) would use right now: the nearest usable
 * thing within reach, preferring what is in front of the player.
 */

interface Candidate {
  focus: Focus;
  reach: number;
}

/** Interactions that live on the cave and high layers (filled by their content). */
function layerCandidates(): Candidate[] {
  const p = getGame().progress, out: Candidate[] = [];
  if (rt.player.layer === "high")
    out.push({ focus: { id: "upperCanopyDown", kind: "cliffRope", verb: "Climb down", noun: "the rope", x: UPPER_ROPE.top.x, z: UPPER_ROPE.top.z }, reach: 2.2 });
  for (const c of CHESTS)
    if ((c.layer ?? "ground") === rt.player.layer && !p.act2.chests.includes(c.id) && (!c.secret || p.act2.secrets.includes(c.secret)))
      out.push({ focus: { id: c.id, kind: "chest", verb: "Open", noun: "the chest", x: c.x, z: c.z }, reach: 2.3 });
  return out;
}

function candidates(): Candidate[] {
  const g = getGame();
  const p = g.progress;
  if (p.act3.world === "cloud") return cloudCandidates();
  // Ground interactions never reach through rock or from a leaf to the deck below.
  if (rt.player.layer !== "ground") return layerCandidates();
  const out: Candidate[] = [];
  const add = (focus: Focus, reach = INTERACT_RANGE) => out.push({ focus, reach });
  if (p.metMaple) add({ id: "maple", kind: "maple", verb: "Talk to", noun: "Maple", x: rt.maple.x, z: rt.maple.z }, 2.5);
  const act2 = p.act2.started;
  for (const id of LIVE_MONSTERS) {
    // The companion is always close by: it never takes E from anything else (its HUD chip chats).
    if (p.active === id) continue;
    // Act 2: friends walk with the party (switch with the chips or 1-4); Lumo has been taken.
    if (act2 && (p.monsters[id].friend || id === "lumo") && (id !== "lumo" || lumoHidden())) continue;
    if (id === "ember" && !isSolved(p, "lava")) continue;
    if (id === "lumo" && !gateOpen(p)) continue;
    const m = rt.monsters[id];
    const r = p.monsters[id];
    const name = r.discovered && (id !== "lumo" || r.described.name) ? MONSTERS[id].name : "???";
    // A flier still up in its tree is reached from below it.
    add({ id, kind: "monster", verb: r.friend && id !== "lumo" ? "Choose" : "Talk to", noun: name, x: m.x, z: m.z }, MONSTERS[id].perch && !r.discovered ? 3.2 : 2.7);
  }
  for (const s of FOOD_SOURCES) {
    // A full bag still focuses the food, so E explains instead of doing nothing.
    if (rt.taken.has(s.id)) continue;
    add({ id: s.id, kind: "food", verb: "Get", noun: FOODS[s.food].one, x: s.x, z: s.z }, 2.4);
  }
  if (!isSolved(p, "fallenPalm")) add({ id: "fallenPalm", kind: "obstacle", verb: "Look at", noun: "the tree", x: FALLEN_PALM.x - 1, z: FALLEN_PALM.z }, 2.9);
  else if (!isSolved(p, "river")) add({ id: "river", kind: "obstacle", verb: "Cross", noun: "the river", x: CROSSING.west.x, z: CROSSING.west.z }, 2.6);
  if (isSolved(p, "river") && p.endings < 1) add({ id: "stone", kind: "stone", verb: "Look at", noun: "the stone", x: MONSTER_STONE.x, z: MONSTER_STONE.z }, 3);
  if (p.endings >= 1 && isSolved(p, "river") && !isSolved(p, "bridge")) add({ id: "bridge", kind: "obstacle", verb: "Look at", noun: "the bridge", x: BRIDGE.x, z: BRIDGE.z1 + 0.6 }, 2.6);
  if (isSolved(p, "bridge") && !isSolved(p, "cliff")) add({ id: "cliff", kind: "obstacle", verb: "Look at", noun: "the cliff", x: ROPE.x, z: ROPE.z + 0.2 }, 2.8);
  if (isSolved(p, "cliff")) {
    add({ id: "ropeUp", kind: "rope", verb: "Climb", noun: "the rope", x: ROPE.x, z: ROPE.z + 0.2 }, 2.4);
    add({ id: "ropeDown", kind: "rope", verb: "Climb down", noun: "the rope", x: CLIFF_TOP_SPOT.x, z: CLIFF_TOP_SPOT.z + 0.8 }, 2.2);
  }
  if (p.endings >= 2) {
    for (const [id, place] of Object.entries(PHASE3_PLACE)) {
      if (p.solved.includes(id as keyof typeof PHASE3_PLACE)) continue;
      if (id !== "lava" && !isSolved(p, "lava")) continue;
      if (id.startsWith("gate") && !isSolved(p, "cave")) continue;
      add({ id, kind: "obstacle", verb: "Look at", noun: id === "lava" ? "the lava" : id === "cave" ? "the cave" : `the ${id === "gateLeaf" ? "leaf" : id === "gateDrop" ? "drop" : id === "gateWing" ? "wing" : "flame"} pillar`, x: place.x, z: place.z }, 2.7);
    }
  }
  add({ id: "sign", kind: "sign", verb: "Read", noun: "the sign", x: FOREST_SIGN.x, z: FOREST_SIGN.z }, 2);
  if (act2) act2Candidates(add);
  return out;
}

function act2Candidates(add: (f: Focus, reach?: number) => void) {
  const p = getGame().progress;
  if (rt.cliffRope > 0.5) {
    add({ id: "cliffDown", kind: "cliffRope", verb: "Climb down", noun: "the rope", x: CLIFF_ROPE.top.x, z: CLIFF_ROPE.top.z - 0.5 }, 2.2);
    add({ id: "cliffUp", kind: "cliffRope", verb: "Climb", noun: "the rope", x: CLIFF_ROPE.foot.x, z: CLIFF_ROPE.foot.z + 0.6 }, 2.2);
  }
  // Nothing else is near the sanctuary; the rest is down in the lowland.
  if (rt.player.z > -152) return;
  for (const [id, rope] of Object.entries(CANOPY_ROPES)) {
    if (id === "entrance" && !isSolved(p, "canopyAscentRope")) continue;
    // The two stands are only a few metres apart horizontally. The face
    // separates them, so only offer the stand on the player's current level.
    const down = id === "entrance" ? rt.player.z < rope.faceZ : rt.player.z > rope.faceZ;
    const spot = down ? rope.top : rope.foot;
    add({ id: `canopy${id === "entrance" ? "Entrance" : "Exit"}${down ? "Down" : "Up"}`, kind: "cliffRope", verb: down ? "Climb down" : "Climb", noun: "the rope", x: spot.x, z: spot.z }, 2.2);
  }
  // The rope up into the treetops, from the lower Canopy's north root walk.
  add({ id: "upperCanopyUp", kind: "cliffRope", verb: "Climb", noun: "the rope", x: UPPER_ROPE.foot.x, z: UPPER_ROPE.foot.z }, 2.2);
  for (const c of CHESTS) if ((c.layer ?? "ground") === "ground" && !p.act2.chests.includes(c.id) && (!c.secret || p.act2.secrets.includes(c.secret))) add({ id: c.id, kind: "chest", verb: "Open", noun: "the chest", x: c.x, z: c.z }, 2.3);
  add({ id: "forkSign", kind: "sign", verb: "Read", noun: "the sign", x: FORK_SIGN.x, z: FORK_SIGN.z }, 2.2);
  for (const id of Object.keys(ACT2_PLACE) as Array<keyof typeof ACT2_PLACE>) {
    if (id === "groveStream" && isSolved(p, id)) {
      for (const point of Object.values(GROVE_STREAM_FERRY))
        add({ id, kind: "obstacle", verb: "Ride", noun: "Bubbo", ja: "バボに のろう", ...point }, 2.6);
      continue;
    }
    if (isSolved(p, id) || !obstacleAvailable(p, id as ObstacleId)) continue;
    const place = ACT2_PLACE[id];
    add({ id, kind: "obstacle", verb: "Look at", noun: ACT2_NOUN[id], ...(id === "groveStream" ? { ja: "かわを みよう" } : id === "caveTorches" ? { ja: "たいまつを みよう" } : {}), x: place.x, z: place.z }, 2.6);
  }
  for (const s of Object.values(SERVICES)) add({ id: s.id, kind: "npc", ...SERVICE_FOCUS[s.id], x: s.keeper.x, z: s.keeper.z }, 2.8);
}

export function findFocus(): Focus | null {
  const p = rt.player;
  const fx = Math.sin(p.yaw);
  const fz = Math.cos(p.yaw);
  let best: Focus | null = null;
  let bestScore = Infinity;
  for (const c of candidates()) {
    const dx = c.focus.x - p.x;
    const dz = c.focus.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > c.reach) continue;
    // In front counts as up to a metre closer. Food is a small target beside
    // monsters that wander over it, and picking it up is instant and harmless.
    const facing = d > 0.01 ? (dx * fx + dz * fz) / d : 1;
    const score = d - facing * 1 - (c.focus.kind === "food" ? 0.9 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = c.focus;
    }
  }
  return best;
}

/** Where the ★ marker floats for the current objective (null = no marker). */
export function objectiveTarget(): (Vec2 & { y: number }) | null {
  // The optional cave and treetops carry no story marker: it would float over the ground below.
  if (rt.player.layer !== "ground") return null;
  const g = getGame();
  const p = g.progress;
  const o = objective(p);
  switch (o.id) {
    case "act2Done": return { ...SERVICES.harbor.keeper, y: 2.4 };
    case "cloudCoast": return { ...CLOUD_SPAWNS.stormbreakCoast, y: 2.4 };
    case "cloudHollow": return { ...HOLLOW.entrance, y: 2.4 };
    case "cloudFamily": return { ...HOLLOW.tala, y: 2.4 };
    case "cloudObservatory": return { ...CLOUD_SPAWNS.windfallJunction, y: 2.4 };
    case "cloudDial": return { x: 0, z: 145, y: 2.4 };
    case "cloudBeacon": return { x: 0, z: 155, y: 2.4 };
    case "skyFortress": return null;
    case "meetMaple":
      return null;
    case "findMonster":
      // Discovery is the fun part: the star appears only if the student wanders a while.
      if (rt.idle < 20) return null;
      return { x: rt.monsters[o.monster].x, z: rt.monsters[o.monster].z, y: 1.9 + rt.monsters[o.monster].air };
    case "describe":
    case "askFood":
    case "giveFood":
    case "letsGo":
    case "askBack":
      return { x: rt.monsters[o.monster].x, z: rt.monsters[o.monster].z, y: 1.9 + rt.monsters[o.monster].air };
    case "getFood": {
      const sources = FOOD_SOURCES.filter((s) => s.food === o.food);
      let best = sources[0];
      for (const s of sources) if (Math.hypot(s.x - rt.player.x, s.z - rt.player.z) < Math.hypot(best.x - rt.player.x, best.z - rt.player.z)) best = s;
      return { x: best.x, z: best.z, y: o.food === "fish" ? 1.6 : 1.4 };
    }
    case "obstacle":
      if (o.obstacle in PHASE3_PLACE) return { ...PHASE3_PLACE[o.obstacle as keyof typeof PHASE3_PLACE], y: 2.5 };
      if (o.obstacle === "fallenPalm") return { x: FALLEN_PALM.x, z: FALLEN_PALM.z, y: 2.6 };
      if (o.obstacle === "river") return { x: CROSSING.west.x + 0.4, z: CROSSING.west.z, y: 1.8 };
      if (o.obstacle === "bridge") return { x: BRIDGE.x, z: BRIDGE.z1 + 0.4, y: 1.8 };
      return { x: ROPE.x, z: ROPE.z, y: 2.4 };
    case "stone":
      return { x: MONSTER_STONE.x, z: MONSTER_STONE.z, y: 3.6 };
    case "cliffTop":
      return { x: ROPE.x, z: ROPE.z, y: 2.4 };
    case "finale":
    case "act2Start":
      return { x: rt.monsters.lumo.x, z: rt.monsters.lumo.z, y: 3 };
    case "descend":
      return { x: CLIFF_ROPE.top.x, z: CLIFF_ROPE.top.z - 0.6, y: 1.6 };
    case "openChest": {
      const c = CHESTS.find((x) => x.id === "forestChest")!;
      return { x: c.x, z: c.z, y: 1.5 };
    }
    case "reachPort": {
      const zone = zoneAt(rt.player.x, rt.player.z);
      const t = zone ? routeMarker(zone, rt.player.x) : CLIFF_ROPE.top;
      return t ? { x: t.x, z: t.z, y: 2.2 } : null;
    }
    case "market":
    case "kitchen":
    case "harbor": {
      const k = SERVICES[o.id].keeper;
      return { x: k.x, z: k.z, y: 2.4 };
    }
    default:
      return null;
  }
}
