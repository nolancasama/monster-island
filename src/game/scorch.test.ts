import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SCORCH, pruneScorches, resetScorches, scorchAt, scorchStage, scorchable, scorches } from "./scorch";
import { region } from "./world/region";
import { LILY_PADS, zoneAt } from "./world/lowland";
import { waterAt } from "./logic/water";
import { basicAttack, cb, combatTick, resetCombat } from "./combat";
import { newProgress } from "./logic/progress";
import { getGame, setGame } from "./store";
import { rt } from "./runtime";
import { standY } from "./world/collision";
import { STAGES } from "./world/lowland";

vi.mock("../audio/audio", () => ({ audio: { play: vi.fn(), voice: vi.fn(), startMusic: vi.fn(), stopFlame: vi.fn() } }));

beforeEach(() => { region.world = "home"; region.layer = "ground"; resetScorches(); });
afterEach(() => { region.world = "home"; region.layer = "ground"; resetScorches(); });

describe("what Ember's fire can scorch", () => {
  it("grass, leaves and the canopy's wood char; stone, water, the cave and Cloud Isle never do", () => {
    expect(zoneAt(76.5, -168)).toBe("forest1");
    expect(scorchable(76.5, -168)).toBe(true);
    expect(scorchable(100, -212)).toBe(true);
    expect(zoneAt(76, -255)).toBe("causeway");
    expect(scorchable(76, -255)).toBe(false);
    expect(scorchable(77, -303)).toBe(false);
    // Water (the pond round the islet; the islet itself is grass).
    expect(waterAt(LILY_PADS[1].x, LILY_PADS[1].z, "home")).not.toBe("none");
    expect(scorchable(LILY_PADS[1].x, LILY_PADS[1].z)).toBe(false);
    expect(scorchable(76.5, -168, "cave")).toBe(false);
    region.world = "cloud";
    expect(scorchable(76.5, -168)).toBe(false);
    expect(scorchAt(76.5, -168, 1, 0)).toBeNull();
  });
});

describe("a scorch mark's life", () => {
  it("blackens in, holds, then fades back to the ground's own colour and is gone", () => {
    const s = scorchAt(76.5, -168, 0.8, 100)!;
    expect(scorchStage(s, 100).char).toBe(0);
    expect(scorchStage(s, 100).glow).toBe(1);
    expect(scorchStage(s, 100 + SCORCH.burn / 2).char).toBeCloseTo(0.5, 6);
    const black = scorchStage(s, 100 + SCORCH.burn + SCORCH.hold / 2);
    expect(black.char).toBeCloseTo(1, 9);
    expect(black.glow).toBe(0);
    const half = scorchStage(s, 100 + SCORCH.burn + SCORCH.hold + SCORCH.recover / 2);
    expect(half.char).toBeCloseTo(0.5, 6);
    expect(scorchStage(s, 100 + SCORCH.burn + SCORCH.hold + SCORCH.recover).char).toBeCloseTo(0, 9);
    pruneScorches(100 + SCORCH.burn + SCORCH.hold + SCORCH.recover - 0.01);
    expect(scorches).toHaveLength(1);
    pruneScorches(100 + SCORCH.burn + SCORCH.hold + SCORCH.recover);
    expect(scorches).toHaveLength(0);
  });

  it("fire sweeping the same spot refreshes one mark instead of piling up; the pool never grows past its cap", () => {
    const a = scorchAt(76.5, -168, 0.8, 0)!;
    expect(scorchAt(76.7, -168.2, 0.8, 5)).toBe(a);
    expect(scorches).toHaveLength(1);
    expect(scorchStage(a, 5).char).toBeCloseTo(1, 9);
    // Refreshing never makes a mark spread without bound.
    for (let i = 0; i < 50; i++) scorchAt(76.5, -168, 2, 5 + i);
    expect(a.r).toBeLessThanOrEqual(SCORCH.maxR);
    for (let i = 0; i < SCORCH.max + 10; i++) scorchAt(60 + (i % 10) * 3, -165 - Math.floor(i / 10) * 3, 0.6, 10);
    expect(scorches.length).toBeLessThanOrEqual(SCORCH.max);
  });
});

describe("Ember's breath scorches what it sweeps", () => {
  function emberAt(x: number, z: number, yaw: number) {
    const p = newProgress();
    for (const m of Object.values(p.monsters)) m.friend = m.discovered = true;
    p.endings = 3; p.active = "ember";
    p.act2 = { ...p.act2, started: true, lumoTaken: true, cleared: [...STAGES] };
    setGame({ progress: p, screen: "game", mode: "explore", journalOpen: false, settingsOpen: false, toasts: [] });
    rt.world = "home"; rt.time = 10;
    resetCombat();
    for (const e of cb.enemies) e.state = "gone";
    Object.assign(rt.player, { x, z, yaw, y: standY(x, z, getGame().progress.solved), climbY: null });
    cb.zones.current = zoneAt(x, z);
    cb.stance = { friend: "ember", k: 1, fromX: x, fromZ: z, leaving: null, leaveK: 0 };
    rt.time += 1;
  }

  it("on the forest floor a breath leaves marks ahead of Ember, and they recover", () => {
    emberAt(76.5, -166, Math.PI);
    expect(basicAttack()).toBe(true);
    expect(scorches.length).toBeGreaterThan(0);
    for (const s of scorches) expect(Math.hypot(s.x - 76.5, s.z - -166)).toBeLessThan(6);
    for (const s of scorches) expect(s.z).toBeLessThan(-166);
    cb.hold = false;
    for (let t = 0; t < SCORCH.burn + SCORCH.hold + SCORCH.recover + 1; t += 0.25) { rt.time += 0.25; combatTick(0.25); }
    expect(scorches).toHaveLength(0);
  });

  it("on the Causeway's stone it leaves none", () => {
    emberAt(76, -252, Math.PI);
    expect(basicAttack()).toBe(true);
    expect(scorches).toHaveLength(0);
  });
});
