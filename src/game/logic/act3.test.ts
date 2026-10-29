import { describe, expect, it } from "vitest";
import { newProgress, type Progress } from "./progress";
import { bestFood, findPort, hearLead, markDescended, startAct2 } from "./act2";
import { claimErrand, clearCloudStage, cloudWakeArea, collectErrandPickup, completeVoyage, cookStew, discoverHollow, eatStew, markFamily, newAct3, openCloudChest, restCloud, solveCloudPuzzle, travelCloud } from "./act3";
import { decodeSave, encodeSave } from "./save";
import { CLOUD_DOCK, CLOUD_ENEMY_SPAWNS, CLOUD_PICKUPS, CLOUD_SPAWNS, CLOUD_PUZZLE_RULES, CLOUD_ROUTE_REQUIRED, cloudWalkable, type CloudPuzzleId } from "../world/cloudisle";
import type { MonsterId } from "../types";

function harbor(): Progress {
  const p = newProgress();
  for (const id of ["leafy", "bubbo", "puff", "ember", "lumo"] as MonsterId[]) {
    p.monsters[id] = { discovered: true, asked: {}, friend: true, canKnown: {}, described: { ...(id === "lumo" ? { name: true } : {}), size: true, part: true }, ...(id === "ember" ? { invited: true } : {}) };
  }
  p.endings = 3;
  p.active = "leafy";
  p.solved = ["fallenPalm", "river", "bridge", "cliff", "lava", "cave", "gateLeaf", "gateDrop", "gateWing", "gateFlame"];
  return hearLead(findPort(markDescended(startAct2(p))));
}

function hollow(): Progress {
  let p = travelCloud(completeVoyage(harbor()), "cloud");
  p = clearCloudStage(p, "stormbreakCoast", CLOUD_ENEMY_SPAWNS.map((_, i) => i));
  p = discoverHollow(p);
  for (const milestone of ["met", "trusted", "drawingSeen", "tunnelOpen"] as const) p = markFamily(p, milestone);
  return { ...p, act3: { ...p.act3, area: "hiddenHollow" } };
}

const vitals = (hp = 100, mp = 100) => ({ hp, mp: { leafy: mp, bubbo: mp, puff: mp, ember: mp } });

describe("Cloud Isle travel and family", () => {
  it("requires the harbour lead and never completes the voyage through ordinary travel", () => {
    const fresh = newProgress();
    expect(completeVoyage(fresh)).toBe(fresh);
    expect(travelCloud(fresh, "cloud")).toBe(fresh);
    const p = harbor();
    expect(travelCloud(p, "cloud")).toBe(p);
    const arrived = travelCloud(completeVoyage(p), "cloud");
    expect(arrived.act3).toMatchObject({ voyageDone: true, world: "cloud", area: "cloudDock" });
    expect(travelCloud(arrived, "home").act3.world).toBe("home");
  });

  it("clears all six registered coast enemies once, independently of duplicate defeats", () => {
    const p = completeVoyage(harbor());
    expect(clearCloudStage(p, "stormbreakCoast", [0, 0, 1, 2, 3, 4, 99])).toBe(p);
    const done = clearCloudStage(p, "stormbreakCoast", [0, 1, 2, 3, 4, 5]);
    expect(done.act3.cleared).toEqual(["stormbreakCoast"]);
    expect(clearCloudStage(done, "stormbreakCoast", [])).toBe(done);
    expect(discoverHollow(p)).toBe(p);
  });

  it("orders trust, the drawing and the tunnel; finding the Hollow changes wake destination", () => {
    let p = travelCloud(completeVoyage(harbor()), "cloud");
    expect(cloudWakeArea(p)).toBe("dock");
    expect(markFamily(p, "tunnelOpen")).toBe(p);
    p = discoverHollow(clearCloudStage(p, "stormbreakCoast", [0, 1, 2, 3, 4, 5]));
    expect(cloudWakeArea(p)).toBe("hollow");
    expect(markFamily(p, "trusted")).toBe(p);
    p = markFamily(markFamily(markFamily(p, "met"), "trusted"), "drawingSeen");
    expect(p.act3.family).toMatchObject({ trusted: true, drawingSeen: true, tunnelOpen: false });
    expect(markFamily(p, "tunnelOpen").act3.family.tunnelOpen).toBe(true);
    p = { ...p, act3: { ...p.act3, area: "hiddenHollow" }, act2: { ...p.act2, ...vitals(5, 0) } };
    const rested = restCloud(p);
    expect(rested.act2).toMatchObject(vitals());
    expect(rested.act3.checkpoint).toBe("hollow");
    expect(rested.act3.family).toEqual(p.act3.family);
  });

  it("checks the friend for free coast abilities and opens each chest once", () => {
    const p = completeVoyage(harbor());
    expect(solveCloudPuzzle({ ...p, monsters: { ...p.monsters, puff: { ...p.monsters.puff, friend: false } } }, "coastWindmill").act3.puzzles).toEqual([]);
    const solved = solveCloudPuzzle({ ...p, act2: { ...p.act2, ...vitals(50, 0) } }, "coastWindmill");
    expect(solved.act3.puzzles).toEqual(["coastWindmill"]);
    expect(solved.act2.mp.puff).toBe(0);
    const opened = openCloudChest(solved, "cloudSeaChest");
    expect(opened.act2.coins).toBe(p.act2.coins + 20);
    expect(openCloudChest(opened, "cloudSeaChest")).toBe(opened);
  });

  it("uses each route puzzle's own friend without spending MP", () => {
    for (const id of ["canopyVine", "canopyGlide", "canopyGust", "grottoRaft", "grottoBoiler"] as const) {
      const p = hollow(), friend = CLOUD_PUZZLE_RULES[id].friend;
      const tired = { ...p, act2: { ...p.act2, ...vitals(50, 0) } };
      const absent = { ...tired, monsters: { ...p.monsters, [friend]: { ...p.monsters[friend], friend: false } } };
      expect(solveCloudPuzzle(absent, id)).toBe(absent);
      const solved = solveCloudPuzzle(tired, id);
      expect(solved.act3.puzzles).toContain(id);
      expect(solved.act2.mp).toEqual(tired.act2.mp);
      expect(solveCloudPuzzle(solved, id)).toBe(solved);
    }
  });

  it("clears each six-enemy branch independently and keeps its exit open", () => {
    for (const route of ["skyrootCanopy", "thunderGrotto"] as const) {
      const p = hollow();
      const ids = CLOUD_ENEMY_SPAWNS.flatMap((spawn, i) => spawn.zone === route ? [i] : []);
      expect(ids).toHaveLength(6);
      expect(clearCloudStage(p, route, [...ids.slice(0, 5), ids[0]])).toBe(p);
      const cleared = clearCloudStage(p, route, ids);
      expect(cleared.act3.cleared).toEqual(["stormbreakCoast", route]);
      expect(clearCloudStage(cleared, route, [])).toBe(cleared);
    }
    const junction = CLOUD_ENEMY_SPAWNS.filter(s => s.zone === "windfallJunction");
    expect(junction).toHaveLength(3);
    expect(junction.every(s => s.kind === "windSprite")).toBe(true);
  });

  it("keeps the canopy chest behind Puff's optional gust puzzle", () => {
    const p = hollow();
    expect(openCloudChest(p, "cloudCanopyChest")).toBe(p);
    const solved = solveCloudPuzzle(p, "canopyGust");
    const opened = openCloudChest(solved, "cloudCanopyChest");
    expect(opened.act2.coins).toBe(p.act2.coins + 30);
    expect(openCloudChest(opened, "cloudCanopyChest")).toBe(opened);
    expect(openCloudChest(p, "cloudCrystalChest").act3.chests).toContain("cloudCrystalChest");
  });
});

describe("Grandpa Bo's stew and world errands", () => {
  it("costs exactly one fish per stew, carries three, and refuses to waste fish", () => {
    let p: Progress = { ...hollow(), bag: { fish: 5 } };
    expect(cookStew(completeVoyage(harbor()))).toEqual({ ok: false, reason: "family" });
    for (let i = 0; i < 3; i++) {
      const cooked = cookStew(p);
      expect(cooked.ok).toBe(true);
      if (cooked.ok) p = cooked.progress;
    }
    expect(p.bag.fish).toBe(2);
    expect(p.act3.stew).toBe(3);
    expect(cookStew(p)).toEqual({ ok: false, reason: "full" });
    expect(cookStew({ ...hollow(), bag: {} })).toEqual({ ok: false, reason: "fish" });
  });

  it("deliberately feeds every friend +40 MP and +50 HP, clamps and does not enter quick-eat", () => {
    const base = hollow();
    const p = { ...base, act3: { ...base.act3, stew: 2 } };
    const result = eatStew(p, { hp: 40, mp: { leafy: 0, bubbo: 70, puff: 95, ember: 5 } })!;
    expect(result.vitals).toEqual({ hp: 90, mp: { leafy: 40, bubbo: 100, puff: 100, ember: 45 } });
    expect(result.progress.act3.stew).toBe(1);
    expect(eatStew(p, vitals())).toBeNull();
    expect(bestFood(vitals(1, 0), {}, "leafy")).toBeNull();
    expect(eatStew({ ...base, act3: { ...base.act3, stew: 0 } }, vitals(1))).toBeNull();
  });

  it("uses unique world pickups, rewards once and retains permanent shelf/fire/lantern upgrades", () => {
    let p: Progress = { ...hollow(), bag: { fish: 4 }, act2: { ...hollow().act2, items: { amber: 5 } } };
    expect(collectErrandPickup(p, "fish")).toBe(p);
    expect(claimErrand(p, "bag")).toBe(p);
    for (const pickup of CLOUD_PICKUPS) {
      p = collectErrandPickup(p, pickup.id);
      expect(collectErrandPickup(p, pickup.id)).toBe(p);
    }
    const beforeCoins = p.act2.coins;
    for (const id of ["bag", "firewood", "moss"] as const) {
      p = claimErrand(p, id);
      expect(claimErrand(p, id)).toBe(p);
    }
    expect(p.act2.coins).toBe(beforeCoins + 50);
    expect(p.act2.items.amber).toBe(6);
    expect(p.bag.fish).toBe(4);
    expect(p.act3.errands).toMatchObject({ bagRewarded: true, firewoodRewarded: true, mossRewarded: true, firewood: 3 });
  });
});

describe("additive Cloud Isle v4 saves", () => {
  const save = (p: Progress, player = { ...CLOUD_SPAWNS.hiddenHollow, yaw: 1 }) => decodeSave(encodeSave(p, player, 90))!;

  it("loads old v4 unchanged with default Act 3, and rejects every Act 3 field without the lead", () => {
    const p = harbor();
    const old = JSON.parse(encodeSave(p, { x: 76, z: -300, yaw: 0 }, 90));
    delete old.progress.act3;
    expect(decodeSave(JSON.stringify(old))!.progress).toEqual(p);
    const forged = { ...hollow(), act2: { ...p.act2, harbor: false } };
    expect(save(forged).progress.act3).toEqual(newAct3());
  });

  it("round-trips Cloud Isle, family, stew, pickups, upgrades, and checkpoint without replay", () => {
    let p = hollow();
    for (const pickup of CLOUD_PICKUPS) p = collectErrandPickup(p, pickup.id);
    p = claimErrand(claimErrand(claimErrand(p, "bag"), "firewood"), "moss");
    p = restCloud({ ...p, act3: { ...p.act3, stew: 2 } });
    expect(save(p).progress).toEqual(p);
    expect(save(p).player).toEqual({ ...CLOUD_SPAWNS.hiddenHollow, yaw: 1 });
    expect(save(p).progress.act3).toMatchObject({ world: "cloud", voyageDone: true });
  });

  it("sanitizes milestone order, pickups, duplicates, numbers and invalid ground", () => {
    const p = completeVoyage(harbor());
    const raw = JSON.parse(encodeSave(p, { x: 9999, z: 9999, yaw: 1 }, 0));
    raw.progress.act3 = { ...raw.progress.act3, world: "cloud", area: "windfallJunction", hollowFound: true,
      family: { met: true, trusted: true, drawingSeen: true, tunnelOpen: true, aftermathSeen: true },
      stew: 999, cleared: ["bad"], puzzles: ["coastWindmill", "coastWindmill", "bad"],
      errands: { bag: true, firewood: 999, moss: true, bagRewarded: true, pickups: ["bad", "junctionWood1", "junctionWood1"] },
      beaconDefeated: true, skyFortressClue: true, observatoryLamps: ["bad"] };
    const loaded = decodeSave(JSON.stringify(raw))!;
    expect(loaded.progress.act3).toMatchObject({ hollowFound: false, stew: 0, beaconDefeated: false, skyFortressClue: false,
      family: { met: false, trusted: false, drawingSeen: false, tunnelOpen: false, aftermathSeen: false },
      errands: { bag: false, firewood: 1, moss: false, bagRewarded: false, pickups: ["junctionWood1"] }, puzzles: ["coastWindmill"] });
    expect(cloudWalkable(loaded.player.x, loaded.player.z, { solved: ["coastWindmill"] }, .35)).toBe(true);
    expect(loaded.player.z).toBeLessThan(43.7);
    const nonfinite = JSON.parse(JSON.stringify(raw)); nonfinite.player = {};
    expect(decodeSave(JSON.stringify(nonfinite))!.player).toEqual({ ...CLOUD_DOCK.spawn, yaw: 0 });
  });

  it("round-trips each route, its clear, required abilities, chest and moss", () => {
    for (const route of ["skyrootCanopy", "thunderGrotto"] as const) {
      let p = hollow();
      for (const id of CLOUD_ROUTE_REQUIRED[route]) p = solveCloudPuzzle(p, id);
      if (route === "skyrootCanopy") p = solveCloudPuzzle(p, "canopyGust");
      p = clearCloudStage(p, route, CLOUD_ENEMY_SPAWNS.map((_, i) => i));
      p = collectErrandPickup(p, route === "skyrootCanopy" ? "canopyMoss" : "grottoMoss");
      p = collectErrandPickup(p, route === "skyrootCanopy" ? "canopyWood" : "grottoWood");
      p = openCloudChest(p, route === "skyrootCanopy" ? "cloudCanopyChest" : "cloudCrystalChest");
      p = { ...p, act3: { ...p.act3, area: route } };
      const point = { x: route === "skyrootCanopy" ? -20 : 20, z: 124, yaw: 1 };
      expect(save(p, point).progress).toEqual(p);
      expect(save(p, point).player).toEqual(point);
      const approach = { ...p, act3: { ...p.act3, area: "observatoryApproach" as const } };
      expect(save(approach, { x: 0, z: 132, yaw: 1 }).progress.act3.area).toBe("observatoryApproach");
    }
  });

  it("validates the new puzzle friends individually on reload", () => {
    const base = hollow();
    const all: CloudPuzzleId[] = ["canopyVine", "canopyGlide", "canopyGust", "grottoRaft", "grottoBoiler"];
    for (const friend of ["leafy", "puff", "bubbo", "ember"] as const) {
      const p = { ...base, monsters: { ...base.monsters, [friend]: { ...base.monsters[friend], friend: false } },
        act3: { ...base.act3, puzzles: [...all, ...all] } };
      // Ember is also a prerequisite of the prologue cave. Removing that
      // friendship invalidates the harbour lead and therefore this chapter.
      expect(save(p).progress.act3.puzzles).toEqual(friend === "ember" ? [] : all.filter(id => CLOUD_PUZZLE_RULES[id].friend !== friend));
    }
  });

  it("rejects route progress before the tunnel while retaining slice A pickup semantics", () => {
    const base = travelCloud(completeVoyage(harbor()), "cloud");
    const raw = JSON.parse(encodeSave(base, { x: 20, z: 124, yaw: 1 }, 0));
    Object.assign(raw.progress.act3, { area: "thunderGrotto", cleared: ["skyrootCanopy", "thunderGrotto"],
      puzzles: ["grottoRaft", "grottoBoiler"], chests: ["cloudCrystalChest", "cloudCanopyChest", "bad"],
      errands: { pickups: ["grottoMoss", "canopyMoss", "canopyWood", "grottoWood", "junctionWood1"] } });
    const loaded = decodeSave(JSON.stringify(raw))!;
    expect(loaded.progress.act3).toMatchObject({ cleared: [], puzzles: [], chests: [], area: "stormbreakCoast",
      errands: { pickups: ["junctionWood1"], firewood: 1, moss: false } });
    expect(loaded.player.z).toBeLessThan(43.7);
  });

  it("projects saves behind every missing required puzzle back to that route's entrance", () => {
    for (const route of ["skyrootCanopy", "thunderGrotto"] as const) {
      const point = { x: route === "skyrootCanopy" ? -20 : 20, z: 124, yaw: 1 };
      for (const missing of CLOUD_ROUTE_REQUIRED[route]) {
        let p = hollow();
        for (const id of CLOUD_ROUTE_REQUIRED[route]) if (id !== missing) p = solveCloudPuzzle(p, id);
        p = { ...p, act3: { ...p.act3, area: route } };
        const loaded = save(p, point);
        expect(loaded.player).toEqual({ ...CLOUD_SPAWNS[route], yaw: 1 });
      }
    }
  });

  it("keeps the shared approach locked until a clear route and all its required puzzles", () => {
    const base = hollow();
    const approach = { x: 0, z: 132, yaw: 1 };
    let p: Progress = { ...base, act3: { ...base.act3, area: "observatoryApproach" } };
    expect(save(p, approach).player).toEqual({ ...CLOUD_SPAWNS.windfallJunction, yaw: 1 });
    p = clearCloudStage(p, "skyrootCanopy", CLOUD_ENEMY_SPAWNS.map((_, i) => i));
    expect(save(p, approach).player.z).toBeLessThan(100);
    p = solveCloudPuzzle(solveCloudPuzzle(p, "canopyVine"), "canopyGlide");
    expect(save(p, approach).player).toEqual(approach);
    expect(save(p, { x: 12, z: 130, yaw: 1 }).player).toEqual({ x: 12, z: 130, yaw: 1 });
  });

  it("resumes an interrupted glide on a marked pad rather than over the gap", () => {
    let p = hollow();
    p = solveCloudPuzzle(solveCloudPuzzle(p, "canopyVine"), "canopyGlide");
    p = { ...p, act3: { ...p.act3, area: "skyrootCanopy" } };
    expect(save(p, { x: -20, z: 119, yaw: 1 }).player).toEqual({ x: -20, z: 117.4, yaw: 1 });
    expect(save(p, { x: -20, z: 120, yaw: 1 }).player).toEqual({ x: -20, z: 121.6, yaw: 1 });
  });
});
