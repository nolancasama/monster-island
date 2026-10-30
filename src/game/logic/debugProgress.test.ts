import { describe, expect, it } from "vitest";
import { DEBUG_DESTINATIONS, progressForDestination } from "./debugProgress";
import { gateOpen, newProgress } from "./progress";
import { encodeSave, decodeSave } from "./save";
import { CLOUD_SPAWNS } from "../world/cloudisle";
import { SPAWN } from "../world/island";
import { region } from "../world/region";

describe("debug destination progress", () => {
  it("creates the appropriate prologue prerequisites without completing its encounter", () => {
    const p = progressForDestination("river");
    expect(p.monsters.leafy.friend).toBe(true);
    expect(p.monsters.bubbo.friend).toBe(true);
    expect(p.solved).toEqual(["fallenPalm"]);
    expect(p.endings).toBe(0);
    expect(progressForDestination("beach").metMaple).toBe(false);
    expect(gateOpen(progressForDestination("courtyard"))).toBe(false);
    expect(gateOpen(progressForDestination("lumo"))).toBe(true);
    expect(progressForDestination("lumo").monsters.lumo.friend).toBe(false);
  });
  it("prepares a real Port Town state while preserving tester inventory", () => {
    const previous = newProgress(); previous.bag.apples = 7; previous.act2.coins = 123;
    const p = progressForDestination("market", previous);
    expect(p.act3.world).toBe("home");
    expect(p.act2.started && p.act2.lumoTaken && p.act2.descended && p.act2.portFound).toBe(true);
    expect(p.act2.cleared).toEqual(["forest1", "grove", "canopy", "causeway", "coast"]);
    expect(p.act2.harbor).toBe(false);
    expect(p.bag.apples).toBe(7); expect(p.act2.coins).toBe(123);
    expect(previous.solved).toEqual([]);
  });
  it("prepares Cloud Isle travel, family access and the summit without defeating the boss", () => {
    const p = progressForDestination("cloud:stormBeacon");
    expect(p.act3.world).toBe("cloud");
    expect(p.act3.voyageDone && p.act2.harbor && p.act3.family.tunnelOpen).toBe(true);
    expect(p.act3.observatoryLamps).toHaveLength(4);
    expect(p.act3.cleared).toContain("ancientObservatory");
    expect(p.act3.beaconDefeated).toBe(false);
    expect(progressForDestination("cloud:skyrootCanopy").act3.cleared).not.toContain("skyrootCanopy");
  });
  it("builds every destination independently and rejects unknown destinations", () => {
    for (const d of DEBUG_DESTINATIONS) expect(progressForDestination(d.id).act3.world).toBe(d.world);
    expect(() => progressForDestination("missing")).toThrow();
  });
  it("retains every destination's story prerequisites through save validation", () => {
    const before = region.world;
    try {
      for (const d of DEBUG_DESTINATIONS) {
        const p = progressForDestination(d.id);
        region.world = d.world;
        const at = d.area ? CLOUD_SPAWNS[d.area] : SPAWN;
        const loaded = decodeSave(encodeSave(p, { ...at, yaw: 0 }, 0))!;
        expect(loaded, d.id).not.toBeNull();
        expect(loaded.progress.act3.world, d.id).toBe(d.world);
        expect(loaded.progress.endings, d.id).toBe(p.endings);
        expect(loaded.progress.solved, d.id).toEqual(p.solved);
        expect(loaded.progress.act2, d.id).toEqual(p.act2);
        expect(loaded.progress.act3, d.id).toEqual(p.act3);
      }
    } finally { region.world = before; }
  });
});
