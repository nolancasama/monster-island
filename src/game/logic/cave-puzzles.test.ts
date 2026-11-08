import { describe, expect, it } from "vitest";
import { OBSTACLES, newProgress, type Progress } from "./progress";
import { ACT2_OBSTACLES, openChest } from "./act2";
import { secretEvent } from "./secrets";
import { decodeSave, encodeSave } from "./save";
import { CAVE_BRAZIERS, CAVE_CHEST, CAVE_SEAL, CAVE_TORCHES, CAVE_CHAMBER_S, CAVE_ROUTE_LENGTH, caveWalkable, isCaveFlame } from "../world/cave";
import { ELEMENT_OBJECTS } from "../world/elementObjects";
import { isWalkable, type Gates } from "../world/collision";
import { CHESTS } from "../world/lowland";

function act2(): Progress {
  const p = newProgress();
  for (const id of ["leafy", "bubbo", "puff", "ember", "lumo"] as const)
    p.monsters[id] = { discovered: true, friend: true, asked: {}, canKnown: {}, described: { name: true, size: true, part: true }, invited: true };
  p.active = "ember"; p.metMaple = true; p.endings = 3;
  p.solved = ["fallenPalm", "river", "bridge", "cliff", "lava", "cave", "gateLeaf", "gateDrop", "gateWing", "gateFlame", "groveStream"];
  p.act2 = { ...p.act2, started: true, lumoTaken: true, descended: true, zone: "grove", checkpoint: "cliff", cleared: ["forest1"], tutorial: ["attack", "coins", "special", "eat", "rest", "switch"] };
  return p;
}

describe("Ember's cave torches", () => {
  it("is asked with Can you make fire? and is optional", () => {
    expect(OBSTACLES.caveTorches).toEqual({ id: "caveTorches", needs: "fire", question: "canFire", others: ["canSwim", "canFly"], after: [] });
    expect(ACT2_OBSTACLES).toContain("caveTorches");
  });

  it("allows local fire reactions on each layer without granting the environmental solve", () => {
    const braziers = ELEMENT_OBJECTS.filter(o => o.id.startsWith("caveBrazier"));
    const torches = ELEMENT_OBJECTS.filter(o => o.id.startsWith("caveTorch"));
    expect(braziers).toHaveLength(CAVE_BRAZIERS.length);
    expect(torches).toHaveLength(CAVE_TORCHES.length);
    expect(braziers.every(o => (o.layer ?? "ground") === "ground" && o.tags.includes("flammable"))).toBe(true);
    expect(torches.every(o => o.layer === "cave" && o.tags.includes("flammable"))).toBe(true);
    for (const o of [...braziers, ...torches]) {
      expect(isCaveFlame(o.id)).toBe(true);
      const next = secretEvent(o.id, "burn", { secrets: [], objects: {} });
      expect(next.objects[o.id]).toEqual({ state: "lit" });
      expect(next.secrets).toEqual([]);
      expect(isWalkable(70.1, -227, { solved: [], act2: true }, .35, false, "ground")).toBe(false);
    }
    expect(isCaveFlame("emberThicket")).toBe(false);
    expect(isCaveFlame("comboFurnace")).toBe(false);
  });

  it("stands its torches by the walls, in route order, with two in the chamber", () => {
    for (const t of CAVE_TORCHES) {
      expect(caveWalkable(t.x, t.z, 0), t.id).toBe(true);
      expect(isWalkable(t.x, t.z, { solved: [], act2: true }, .35, false, "cave"), `${t.id} stays clear of the walking line`).toBe(false);
    }
    const s = CAVE_TORCHES.map(t => t.s);
    expect([...s].sort((a, b) => a - b)).toEqual(s);
    expect(s.filter(v => v === CAVE_CHAMBER_S)).toHaveLength(2);
    expect(s.some(v => v > CAVE_CHAMBER_S + 15)).toBe(true);
    expect(CAVE_BRAZIERS.map(b => b.s)).toEqual([0, 0, CAVE_ROUTE_LENGTH, CAVE_ROUTE_LENGTH]);
  });
});

describe("Leafy's root seal and the cave chest", () => {
  it("opens the alcove only once Leafy pulls the seal (lit or not)", () => {
    const seal = ELEMENT_OBJECTS.find(o => o.id === "caveRootSeal")!;
    expect(seal).toMatchObject({ layer: "cave", tags: ["grabbable", "heavy"] });
    const pulled = secretEvent("caveRootSeal", "grab", { secrets: [], objects: {} });
    expect(pulled.secrets).toEqual(["caveRootSeal"]);
    // Fire and wind do nothing to it.
    expect(secretEvent("caveRootSeal", "burn", { secrets: [], objects: {} }).secrets).toEqual([]);
    const shut: Gates = { solved: [], act2: true, secrets: [] };
    const stand = { x: CAVE_SEAL.x + .5 * Math.sin(CAVE_SEAL.yaw), z: CAVE_SEAL.z + .5 * Math.cos(CAVE_SEAL.yaw) };
    expect(isWalkable(stand.x, stand.z, shut, .35, false, "cave")).toBe(false);
    expect(isWalkable(stand.x, stand.z, { ...shut, secrets: ["caveRootSeal"] }, .35, false, "cave")).toBe(true);
    expect(Math.hypot(stand.x - CAVE_CHEST.x, stand.z - CAVE_CHEST.z)).toBeLessThan(1);
    expect(CHESTS.find(c => c.id === "caveRootSealChest")).toMatchObject(CAVE_CHEST);
  });

  it("hides its treasure until the seal is open, and gives the Glow Crystal once", () => {
    const chest = CHESTS.find(c => c.id === "caveRootSealChest")!;
    expect(chest).toMatchObject({ secret: "caveRootSeal", layer: "cave", coins: 45, amber: 2, relic: "caveCrystal" });
    let p = act2();
    expect(openChest(p, chest.id)).toBe(p);
    p = { ...p, act2: { ...p.act2, secrets: ["caveRootSeal"] } };
    const opened = openChest(p, chest.id);
    expect(opened.act2.coins).toBe(p.act2.coins + 45);
    expect(opened.act2.items.amber).toBe((p.act2.items.amber ?? 0) + 2);
    expect(opened.act2.relics).toEqual(["caveCrystal"]);
    expect(openChest(opened, chest.id)).toBe(opened);
  });

  it("keeps the lights, the seal and the relic across a save, dropping unknown relics", () => {
    const p = act2();
    p.solved.push("caveTorches");
    p.act2 = { ...p.act2, secrets: ["caveRootSeal", "emberThicket"], relics: ["caveCrystal"], chests: ["caveRootSealChest"] };
    const saved = JSON.parse(encodeSave(p, { x: 64, z: -227, yaw: 0 }, 10));
    saved.progress.act2.relics.push("dragonEgg");
    const loaded = decodeSave(JSON.stringify(saved))!;
    expect(loaded.progress.solved).toContain("caveTorches");
    expect(loaded.progress.act2.secrets).toEqual(expect.arrayContaining(["caveRootSeal", "emberThicket"]));
    expect(loaded.progress.act2.relics).toEqual(["caveCrystal"]);
    // Saves from before relics existed load with none.
    delete saved.progress.act2.relics;
    expect(decodeSave(JSON.stringify(saved))!.progress.act2.relics).toEqual([]);
  });
});
