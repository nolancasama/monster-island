import { describe, expect, it } from "vitest";
import { BEACON } from "../world/cloudisle";
import { cancelBeaconGust, newBeacon, strikeBeaconPylon, tickBeacon } from "./beacon";

const player = { x: 0, z: (BEACON.z - 5) };
const live = () => Object.assign(newBeacon(), { active: true });
describe("Storm Beacon", () => {
  it("telegraphs charge, opens for six seconds, and re-shields if missed", () => {
    const b = live();
    expect(strikeBeaconPylon(b, 0, "leafy")).toBe("blocked");
    tickBeacon(b, 1.5, player); expect(b.pylons[0].phase).toBe("charging");
    tickBeacon(b, 2.4, player); expect(b.pylons[0].phase).toBe("exposed");
    tickBeacon(b, 6, player); expect(b.pylons[0].phase).toBe("shielded");
  });
  it("removes exactly one third per manually hit exposed pylon, idempotently", () => {
    const b = live();
    for (let i = 0; i < 3; i++) {
      b.pylons[i].phase = "exposed";
      expect(strikeBeaconPylon(b, i, "ember")).toBe("down");
      expect(b.power).toBe(2 - i);
      expect(strikeBeaconPylon(b, i, "ember")).toBe("blocked");
    }
  });
  it("Bubbo shorts a charging shield early; the next manual hit breaks it", () => {
    const b = live(); b.pylons[0].phase = "charging";
    expect(strikeBeaconPylon(b, 0, "puff")).toBe("blocked");
    expect(strikeBeaconPylon(b, 0, "bubbo")).toBe("shorted");
    expect(b.power).toBe(3);
    expect(strikeBeaconPylon(b, 0, "bubbo")).toBe("down");
  });
  it("requires Puff aiming along the gust and honors the full one-second tell", () => {
    const b = live(); tickBeacon(b, 2.5, player);
    expect(b.attack).toBe("gustTell");
    tickBeacon(b, .99, player); expect(b.attack).toBe("gustTell");
    expect(cancelBeaconGust(b, "bubbo", { x: 1, z: 0 })).toBe(false);
    expect(cancelBeaconGust(b, "puff", { x: -1, z: 0 })).toBe(false);
    expect(cancelBeaconGust(b, "puff", { x: 1, z: 0 })).toBe(true);
    tickBeacon(b, .02, player); expect(b.attack).toBe("calm");
  });
  it("locks lightning circles for a 1.2-second escape window", () => {
    const b = live(); b.turn = 1; b.timer = 0; tickBeacon(b, 0, player);
    expect(b.attack).toBe("lightningTell");
    expect(b.rings[0]).toEqual(player);
    tickBeacon(b, 1.19, { x: 6, z: (BEACON.z - 1) }); expect(b.attack).toBe("lightningTell");
    expect(b.rings[0]).toEqual(player);
    tickBeacon(b, .02, player); expect(b.attack).toBe("lightning");
  });
  it("a failed attempt restores all pylons and the machine power", () => {
    const b = live(); b.pylons[0].phase = "exposed"; strikeBeaconPylon(b, 0, "leafy");
    const retry = newBeacon();
    expect(retry.power).toBe(3); expect(retry.active).toBe(false);
    expect(retry.pylons.every(p => p.phase === "shielded")).toBe(true);
  });
});
