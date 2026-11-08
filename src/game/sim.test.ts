import { afterEach, expect, it, vi } from "vitest";
import { MONSTERS } from "./data/monsters";
import { newProgress } from "./logic/progress";
import { resetRuntime, rt } from "./runtime";
import { getGame, setGame } from "./store";
import { tick } from "./sim";
import { PHASE3_PLACE } from "./flow/obstacles";
import { PLAYER_R, gatesOf, isWalkable, moveCircle } from "./world/collision";
import { CLIFF_TOP_SPOT, LAVA } from "./world/island";
import { region } from "./world/region";
import { cb, resetCombat } from "./combat";
import { isAttackHeld, pressAttack, releaseAttack, releaseAllAttacks } from "../input/attackInput";
import type { CompanionId } from "./data/combat";
import { bubbleDescent, pathPoint } from "./flow/summit";
import * as ask from "./flow/ask";
import { BUBBLE_LANDING, SUMMIT_DEPARTURE, summitY } from "./world/upperCanopy";
import { encodeSave } from "./logic/save";

vi.mock("../audio/audio", () => ({ audio: { setNearness: vi.fn(), voice: vi.fn(), play: vi.fn(), startMusic: vi.fn(), setScene: vi.fn() } }));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const slot of ["basic", "special"] as const) for (const source of ["key", "mouse", "touch"] as const) releaseAttack(slot, source);
  releaseAllAttacks();
  vi.unstubAllGlobals();
  region.world = "home";
  resetRuntime();
  setGame({ screen: "title", progress: newProgress() });
});

for (const first of [true, false]) for (const to of ["causeway", "canopy"] as const) {
  it(`ticks a complete ${first ? "first" : "repeat"} bubble ride to ${to} without script timer updates`, async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    vi.spyOn(ask, "say").mockResolvedValue(undefined);
    resetRuntime();
    resetCombat();
    const progress = newProgress();
    progress.act2.started = progress.act2.descended = true;
    progress.act2.cleared = to === "causeway" ? ["grove"] : [];
    progress.active = "bubbo";
    progress.monsters.bubbo.friend = true;
    setGame({ screen: "game", mode: "busy", settingsOpen: false, journalOpen: false, progress });
    rt.time = 30;
    Object.assign(rt.player, { x: SUMMIT_DEPARTURE.x, z: SUMMIT_DEPARTURE.z,
      y: summitY(SUMMIT_DEPARTURE.x, SUMMIT_DEPARTURE.z), layer: "high" });
    const script = bubbleDescent(first);
    await Promise.resolve(); // The fallback's opening dialogue finishes before takeoff.
    const ride = rt.bubbleRide;
    expect(ride.phase).toBe("forming");
    rt.time = ride.t0 + ride.growDur / 2;
    tick(.01);
    expect(ride.k).toBeCloseTo(.5);
    rt.time = ride.t0 + ride.formDur + ride.dur / 2;
    tick(.01);
    const halfway = pathPoint(ride.pts, .5);
    expect(ride.phase).toBe("flying");
    expect(rt.player.x).toBeCloseTo(halfway[0]);
    expect(rt.player.z).toBeCloseTo(halfway[2]);
    expect(rt.player.y).toBe(rt.player.floatY);
    expect(ride.y).toBe(rt.player.y);
    expect(rt.monsters.bubbo.x).toBeCloseTo(ride.x + 1.3);
    expect(ride.bubbo.y).toBeCloseTo(ride.y + .2);
    expect(JSON.parse(encodeSave(progress, rt.player, 1)).player).toMatchObject({
      x: SUMMIT_DEPARTURE.x, z: SUMMIT_DEPARTURE.z, layer: "high"
    });
    // Uneven frames advance the rest of the flight without waking the async script.
    const landingTime = ride.t0 + ride.formDur + ride.dur;
    for (const dt of [.007, .043, .016]) {
      rt.time += dt;
      tick(dt);
      expect(rt.player.x).not.toBe(halfway[0]);
    }
    rt.time = landingTime;
    tick(.01);
    expect(ride.phase).toBe("popping");
    expect(rt.player).toMatchObject({ ...BUBBLE_LANDING[to], layer: "ground", floatY: null });
    rt.time = landingTime + .51;
    tick(.01);
    expect(ride.phase).toBe("idle");
    expect(ride.k).toBe(0);
    await vi.runOnlyPendingTimersAsync();
    await script;
    expect(rt.player.frozen).toBe(false);
    expect(rt.camera.mode).toBe("follow");
  });
}

function inputFight(friend: CompanionId = "ember") {
  vi.stubGlobal("window", { setTimeout: () => 0, clearTimeout: () => undefined });
  resetRuntime();
  const progress = newProgress();
  progress.active = friend;
  progress.act2.started = progress.act2.descended = progress.act2.harbor = progress.act2.lumoTaken = true;
  progress.act2.tutorial = ["attack", "coins", "special", "eat", "rest", "switch"];
  progress.act3.world = "cloud";
  progress.act3.hollowFound = true;
  for (const id of ["leafy", "bubbo", "puff", "ember"] as const) progress.monsters[id].friend = true;
  setGame({ screen: "game", mode: "explore", panel: null, line: null, settingsOpen: false, journalOpen: false, progress });
  region.world = "cloud";
  rt.act2Scene = rt.act3Scene = "done";
  Object.assign(rt.player, { x: 0, z: 20, yaw: 0, climbY: null });
  resetCombat();
  cb.cloudZones.current = "stormbreakCoast";
  for (const e of cb.enemies) e.state = "gone";
  Object.assign(cb.stance, { friend, k: 1 });
}

it("routes touch special hold into Inferno past three seconds, then stops on release", () => {
  inputFight();
  pressAttack("special", "touch");
  for (let i = 0; i < 32; i++) { rt.time += .1; tick(.1); }
  expect(cb.holdK).toBe(true);
  expect(cb.inferno?.age).toBeCloseTo(3.2);
  expect(cb.vitals.mp.ember).toBeLessThan(85);
  releaseAttack("special", "touch");
  tick(.1);
  expect(cb.holdK).toBe(false);
  expect(cb.inferno).toBeNull();
});

it("does not repeat a held one-press special after its cooldown", () => {
  inputFight("bubbo");
  pressAttack("special", "mouse");
  const ready = cb.ready.special;
  for (let i = 0; i < 60; i++) { rt.time += .1; tick(.1); }
  expect(cb.holdK).toBe(true);
  expect(cb.ready.special).toBe(ready);
});

for (const interruption of ["journal", "settings", "panel", "line", "mode", "screen", "knockout"] as const) {
  it(`latches held input across ${interruption} until a fresh press`, () => {
    inputFight();
    pressAttack("basic", "key");
    if (interruption === "journal") setGame({ journalOpen: true });
    if (interruption === "settings") setGame({ settingsOpen: true });
    if (interruption === "panel") setGame({ panel: "trainer" });
    if (interruption === "line") setGame({ line: { id: 1, by: "maple", en: "Hello" } });
    if (interruption === "mode") setGame({ mode: "busy" });
    if (interruption === "screen") setGame({ screen: "title" });
    if (interruption === "knockout") cb.knockedOut = true;
    tick(.01);
    expect(isAttackHeld("basic")).toBe(false);
    setGame({ screen: "game", mode: "explore", journalOpen: false, settingsOpen: false, panel: null, line: null });
    cb.knockedOut = false;
    pressAttack("basic", "key");
    tick(.01);
    expect(cb.hold).toBe(false);
    releaseAttack("basic", "key");
    pressAttack("basic", "key");
    tick(.01);
    expect(cb.hold).toBe(true);
  });
}

it("keeps basic held through a friend hop without firing the new friend's special", () => {
  inputFight();
  pressAttack("basic", "key");
  pressAttack("special", "key");
  setGame(g => ({ progress: { ...g.progress, active: "bubbo" } }));
  for (let i = 0; i < 20; i++) { rt.time += .1; tick(.1); }
  expect(cb.hold).toBe(true);
  expect(cb.holdK).toBe(true);
  expect(cb.stance.friend).toBe("bubbo");
  expect(cb.move).toMatchObject({ friend: "bubbo", kind: "basic" });
  expect(cb.shots.some(s => s.shape === "bomb")).toBe(false);
  expect(cb.inferno).toBeNull();
  expect(cb.vitals.mp.bubbo).toBe(100);
});

for (const world of ["home", "cloud"] as const) {
  it(`poofs unreachable active and party friends onto walkable safe ground in ${world}`, () => {
    vi.stubGlobal("window", { setTimeout: () => 0, clearTimeout: () => undefined });
    resetRuntime();
    const progress = newProgress();
    progress.active = "leafy";
    progress.act2.started = progress.act2.descended = progress.act2.portFound = progress.act2.harbor = true;
    progress.act2.lumoTaken = true;
    progress.act2.tutorial = ["attack", "coins", "special", "eat", "rest", "switch"];
    progress.act3.world = world;
    progress.act3.hollowFound = true;
    progress.act3.family = { met: true, trusted: true, drawingSeen: true, tunnelOpen: true, aftermathSeen: false };
    for (const id of ["leafy", "bubbo", "puff", "ember"] as const) progress.monsters[id].friend = progress.monsters[id].discovered = true;
    setGame({ screen: "game", mode: "explore", settingsOpen: false, journalOpen: false, progress });
    region.world = world;
    rt.act2Scene = "done";
    rt.act3Scene = "done";
    Object.assign(rt.player, world === "cloud" ? { x: -13, z: 57, yaw: 0 } : { x: 76, z: -300, yaw: 0 });
    resetCombat();
    for (const e of cb.enemies) e.state = "gone";
    for (const id of ["leafy", "bubbo", "puff", "ember"] as const) {
      Object.assign(rt.monsters[id], { mode: id === "leafy" ? "follow" : "party", x: 500, z: 500, poofT0: -1 });
    }
    rt.time = 25;
    tick(.1);
    for (const id of ["leafy", "bubbo", "puff", "ember"] as const) {
      const m = rt.monsters[id];
      expect(m.poofT0).toBe(25);
      expect(Math.hypot(m.x - rt.player.x, m.z - rt.player.z)).toBeLessThan(6);
      expect(isWalkable(m.x, m.z, gatesOf(progress), MONSTERS[id].radius, MONSTERS[id].can.includes("swim"))).toBe(true);
    }
  });
}

it("keeps Ember at home behind hot lava, then allows him to wander after cooling", () => {
  resetRuntime();
  const progress = { ...newProgress(), endings: 2, solved: ["fallenPalm", "river", "bridge", "cliff"] as const };
  setGame({ screen: "game", mode: "busy", progress: { ...progress, solved: [...progress.solved] } });
  Object.assign(rt.player, CLIFF_TOP_SPOT);
  const m = rt.monsters.ember;
  const home = MONSTERS.ember.home;
  const target = { x: home.x + 1, z: home.z };
  m.mode = "wander";
  m.target = target;
  m.until = rt.time + 10;
  tick(0.1);
  expect({ x: m.x, z: m.z }).toEqual({ x: home.x, z: home.z });

  setGame({ progress: { ...getGame().progress, solved: [...progress.solved, "lava"] } });
  m.mode = "wander";
  m.target = target;
  tick(0.1);
  // Solid rocks may project the first step away from the nominal home point.
  expect(Math.hypot(m.x - home.x, m.z - home.z)).toBeGreaterThan(0);
  expect(Math.hypot(m.x - home.x, m.z - home.z)).toBeLessThan(home.r);
  expect(isWalkable(m.x, m.z, gatesOf(getGame().progress), MONSTERS.ember.radius)).toBe(true);
});

it("can approach hot lava from the cliff top and cross only after cooling", () => {
  const gates = gatesOf({ endings: 2, solved: ["fallenPalm", "river", "bridge", "cliff"] });
  const place = PHASE3_PLACE.lava;
  const approach = moveCircle(CLIFF_TOP_SPOT.x, CLIFF_TOP_SPOT.z, place.x, place.z, PLAYER_R, gates);
  expect(approach.x).toBeCloseTo(place.x);
  expect(approach.z).toBeCloseTo(place.z);
  const hot = moveCircle(approach.x, approach.z, LAVA.x, LAVA.z0 - 1, PLAYER_R, gates);
  expect(hot.z).toBeGreaterThanOrEqual(LAVA.z1 + PLAYER_R);
  expect(isWalkable(LAVA.x, LAVA.z, gates, PLAYER_R)).toBe(false);
  const cooled = { ...gates, solved: [...gates.solved, "lava" as const] };
  const crossed = moveCircle(approach.x, approach.z, LAVA.x, LAVA.z0 - 1, PLAYER_R, cooled);
  expect(crossed.z).toBeCloseTo(LAVA.z0 - 1);
});
