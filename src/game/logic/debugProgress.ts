import { MONSTERS } from "../data/monsters";
import { COMPANION_IDS } from "../data/combat";
import { CLOUD_AREAS, CLOUD_ZONES, type CloudAreaId } from "../world/cloudisle";
import { STAGES, ZONES, type ZoneId } from "../world/lowland";
import { newProgress, GATES, type Progress } from "./progress";
import type { MonsterId, ObstacleId } from "../types";

export interface DebugDestination {
  id: string;
  label: string;
  act: "Prologue" | "Act 2" | "Act 3";
  world: "home" | "cloud";
  target: string;
  step: number;
  zone?: ZoneId;
  area?: CloudAreaId;
}

const prologue: Array<[string, string, string, number]> = [
  ["beach", "Start beach", "beach", 0], ["maple", "Maple", "maple", 0],
  ["river", "River crossing", "river", 1], ["stone", "Monster Stone", "stone", 2],
  ["cliff", "Cliff / rope", "cliff", 3], ["courtyard", "Sanctuary courtyard", "gateLeaf", 5],
  ["volcano", "Volcano trail", "volcanoTrail", 4], ["lumo", "Lumo", "lumo", 6],
];
export const DEBUG_DESTINATIONS: DebugDestination[] = [
  ...prologue.map(([id, label, target, step]) => ({ id, label, target, step, act: "Prologue" as const, world: "home" as const })),
  { id: "kidnapping", label: "Kidnapping start", target: "lumo", step: 7, act: "Act 2", world: "home" },
  { id: "ropeTop", label: "Cliff rope top", target: "cliffDown", step: 8, act: "Act 2", world: "home" },
  { id: "ropeFoot", label: "Cliff rope foot", target: "cliffUp", step: 9, act: "Act 2", world: "home" },
  { id: "fernCamp", label: "Fern Camp", target: "campRest", step: 9, zone: "camp", act: "Act 2", world: "home" },
  ...(Object.keys(ZONES) as ZoneId[]).map(zone => ({ id: `zone:${zone}`, label: ZONES[zone].name.en, target: `zone:${zone}`, step: 9, zone, act: "Act 2" as const, world: "home" as const })),
  { id: "shortcut", label: "Shortcut gate", target: "lockedGate", step: 9, zone: "causeway", act: "Act 2", world: "home" },
  ...["market", "kitchen", "trainer", "inn", "harbor"].map(target => ({ id: target, label: `Port Town ${target === "harbor" ? "harbour" : target}`, target, step: 9, zone: "port" as const, act: "Act 2" as const, world: "home" as const })),
  { id: "voyage", label: "Voyage / Port dock", target: "harbor", step: 10, zone: "port", act: "Act 3", world: "home" },
  ...CLOUD_AREAS.map(area => ({ id: `cloud:${area}`, label: CLOUD_ZONES[area].name.en, target: `cloud:${area}`, step: 10, area, act: "Act 3" as const, world: "cloud" as const })),
];

/** A destination is a reproducible story fixture, including prerequisites but
 * leaving its own encounter/puzzle unfinished. Inventory remains a tester choice. */
export function progressForDestination(id: string, previous?: Progress): Progress {
  const d = DEBUG_DESTINATIONS.find(item => item.id === id);
  if (!d) throw new Error(`Unknown debug destination: ${id}`);
  const p = newProgress();
  if (previous) {
    p.bag = { ...previous.bag };
    p.act2.coins = previous.act2.coins;
    p.act2.items = { ...previous.act2.items };
  }
  const friend = (id: MonsterId) => {
    const m = MONSTERS[id];
    p.monsters[id] = { discovered: true, friend: true, asked: { [m.favorite]: true }, canKnown: Object.fromEntries(m.can.map(a => [a, true])), described: { name: true, size: true, part: true }, ...(id === "ember" ? { invited: true } : {}) };
    if (m.companion !== false) p.active ??= id;
  };
  const solve = (...ids: ObstacleId[]) => { p.solved.push(...ids); };
  if (d.step >= 1) { p.metMaple = true; friend("leafy"); friend("bubbo"); solve("fallenPalm"); }
  if (d.step >= 2) solve("river");
  if (d.step >= 3) { p.endings = 1; friend("puff"); solve("bridge"); }
  if (d.step >= 4) { p.endings = 2; solve("cliff"); }
  if (d.step >= 5) { friend("ember"); solve("lava", "cave"); }
  if (d.step >= 6) solve(...GATES);
  if (d.step >= 7) { friend("lumo"); p.endings = 3; }
  if (d.step >= 8) { p.act2.started = true; p.act2.lumoTaken = true; }
  if (d.step >= 9) {
    const zone = d.step >= 10 ? "port" : d.zone;
    p.act2.descended = true;
    p.act2.zone = zone ?? null;
    const before: Partial<Record<ZoneId, number>> = { forest1: 0, camp: 1, grove: 1, canopy: 1, oldTrail: 1, causeway: 3, coast: 4, port: 5 };
    p.act2.cleared = STAGES.slice(0, before[zone ?? "forest1"] ?? 0);
    if (zone && zone !== "forest1") { p.act2.checkpoint = "camp"; p.act2.tutorial = ["attack", "coins", "special", "eat", "rest", "switch"]; }
    if (zone === "causeway" || zone === "coast" || zone === "port") solve("canopyVines", "canopyRope");
    if (zone === "coast" || zone === "port") solve("causewayGate");
    p.act2.portFound = zone === "port";
  }
  if (d.step >= 10) p.act2.harbor = true;
  if (d.area) {
    const a = p.act3;
    a.world = "cloud"; a.voyageDone = true; a.area = d.area;
    const index = CLOUD_AREAS.indexOf(d.area);
    if (index >= 2) { a.cleared.push("stormbreakCoast"); a.puzzles.push("coastWindmill", "coastCrate"); a.hollowFound = true; }
    if (index >= 3) { a.hollowFound = true; a.family = { met: true, trusted: true, drawingSeen: true, tunnelOpen: true, aftermathSeen: false }; a.checkpoint = "hollow"; }
    if (index >= 7) { a.cleared.push("skyrootCanopy", "thunderGrotto"); a.puzzles.push("canopyVine", "canopyGlide", "grottoRaft", "grottoBoiler"); a.checkpoint = "observatory"; }
    if (d.area === "stormBeacon") { a.cleared.push("ancientObservatory"); a.puzzles.push("obsLeafy", "obsBubbo", "obsPuff", "obsEmber"); a.observatoryLamps = [...COMPANION_IDS]; }
  }
  return p;
}

