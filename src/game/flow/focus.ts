import { MONSTERS, LIVE_MONSTERS } from "../data/monsters";
import { FOODS } from "../data/foods";
import { isSolved, objective } from "../logic/progress";
import { getGame, type Focus } from "../store";
import { rt } from "../runtime";
import { BRIDGE, CLIFF_TOP_SPOT, CROSSING, FALLEN_PALM, FOOD_SOURCES, FOREST_SIGN, INTERACT_RANGE, MONSTER_STONE, ROPE } from "../world/island";
import type { Vec2 } from "../types";

/**
 * What E (or the touch action button) would use right now: the nearest usable
 * thing within reach, preferring what is in front of the player.
 */

interface Candidate {
  focus: Focus;
  reach: number;
}

function candidates(): Candidate[] {
  const g = getGame();
  const p = g.progress;
  const out: Candidate[] = [];
  const add = (focus: Focus, reach = INTERACT_RANGE) => out.push({ focus, reach });
  if (p.metMaple) add({ id: "maple", kind: "maple", verb: "Talk to", noun: "Maple", x: rt.maple.x, z: rt.maple.z }, 2.5);
  for (const id of LIVE_MONSTERS) {
    // The companion is always close by: it never takes E from anything else (its HUD chip chats).
    if (p.active === id) continue;
    const m = rt.monsters[id];
    const r = p.monsters[id];
    const name = r.discovered ? MONSTERS[id].name : "???";
    // A flier still up in its tree is reached from below it.
    add({ id, kind: "monster", verb: r.friend ? "Choose" : "Talk to", noun: name, x: m.x, z: m.z }, MONSTERS[id].perch && !r.discovered ? 3.2 : 2.7);
  }
  for (const s of FOOD_SOURCES) {
    if (rt.taken.has(s.id)) continue;
    if ((p.bag[s.food] ?? 0) >= 3) continue;
    add({ id: s.id, kind: "food", verb: "Get", noun: FOODS[s.food].one, x: s.x, z: s.z }, 2.1);
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
  add({ id: "sign", kind: "sign", verb: "Read", noun: "the sign", x: FOREST_SIGN.x, z: FOREST_SIGN.z }, 2);
  return out;
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
    const score = d - facing * 1 - (c.focus.kind === "food" ? 0.6 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = c.focus;
    }
  }
  return best;
}

/** Where the ★ marker floats for the current objective (null = no marker). */
export function objectiveTarget(): (Vec2 & { y: number }) | null {
  const g = getGame();
  const p = g.progress;
  const o = objective(p);
  switch (o.id) {
    case "meetMaple":
      return null;
    case "findMonster":
      // Discovery is the fun part: the star appears only if the student wanders a while.
      if (rt.idle < 20) return null;
      return { x: rt.monsters[o.monster].x, z: rt.monsters[o.monster].z, y: 1.9 + rt.monsters[o.monster].air };
    case "describe":
    case "askFood":
    case "giveFood":
      return { x: rt.monsters[o.monster].x, z: rt.monsters[o.monster].z, y: 1.9 + rt.monsters[o.monster].air };
    case "getFood": {
      const sources = FOOD_SOURCES.filter((s) => s.food === o.food);
      let best = sources[0];
      for (const s of sources) if (Math.hypot(s.x - rt.player.x, s.z - rt.player.z) < Math.hypot(best.x - rt.player.x, best.z - rt.player.z)) best = s;
      return { x: best.x, z: best.z, y: o.food === "fish" ? 1.6 : 1.4 };
    }
    case "obstacle":
      if (o.obstacle === "fallenPalm") return { x: FALLEN_PALM.x, z: FALLEN_PALM.z, y: 2.6 };
      if (o.obstacle === "river") return { x: CROSSING.west.x + 0.4, z: CROSSING.west.z, y: 1.8 };
      if (o.obstacle === "bridge") return { x: BRIDGE.x, z: BRIDGE.z1 + 0.4, y: 1.8 };
      return { x: ROPE.x, z: ROPE.z, y: 2.4 };
    case "stone":
      return { x: MONSTER_STONE.x, z: MONSTER_STONE.z, y: 3.6 };
    case "cliffTop":
      return { x: ROPE.x, z: ROPE.z, y: 2.4 };
    default:
      return null;
  }
}
