import { afterEach, describe, expect, it, vi } from "vitest";
import { audio } from "../../audio/audio";
import { cb, combatTick, resetCombat } from "../combat";
import { ENEMIES } from "../data/combat";
import { hazardAt } from "../logic/elements";
import { startPanic } from "../logic/panic";
import { newProgress } from "../logic/progress";
import { decodeSave, encodeSave } from "../logic/save";
import { shallowSpeedFactor, waterAt } from "../logic/water";
import { resetRuntime, rt } from "../runtime";
import { setGame } from "../store";
import { gatesOf, isWalkable, PLAYER_R } from "./collision";
import { SECRET_SITES } from "./elementObjects";
import { SHALLOW_KEEP_OUTS, SHALLOW_WATER, SHALLOW_WATER_DEPTH, shallowWaterAt } from "./groveShallows";
import { CAVE_MOUTHS, CHESTS, GROVE_CROSSING, GROVE_DOOR, nearestOnTrail, zoneAt, type WalkShape } from "./lowland";
import { ISLET, POND } from "./hazards";
import { region } from "./region";

vi.mock("../../audio/audio", () => ({ audio: { play: vi.fn(), voice: vi.fn(), cancelPanic: vi.fn(), startMusic: vi.fn() } }));

function chapter() {
  const p = newProgress();
  for (const id of ["leafy", "bubbo", "puff", "ember", "lumo"] as const)
    p.monsters[id] = { discovered: true, friend: true, invited: true, asked: {}, canKnown: {}, described: {} };
  p.endings = 3;
  p.metMaple = true;
  p.act2.started = p.act2.descended = p.act2.lumoTaken = true;
  p.act2.zone = "grove";
  p.act2.cleared = ["forest1"];
  p.solved = ["fallenPalm", "river", "bridge", "cliff", "lava", "cave", "gateLeaf", "gateDrop", "gateWing", "gateFlame", "groveStream", "caveTorches"];
  return p;
}

function inside(s: WalkShape, x: number, z: number) {
  if (s.kind === "disc") return Math.hypot(x - s.x, z - s.z) <= s.r;
  if (s.kind === "rect") return x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1;
  return nearestOnTrail(s.pts, x, z).d <= s.w;
}

function wetFloor(radius = PLAYER_R) {
  const gates = gatesOf(chapter()), points: Array<{ x: number; z: number }> = [];
  for (let z = -240; z <= -187; z += 1) for (let x = 31; x <= 71; x += 1)
    if (shallowWaterAt(x, z) && isWalkable(x, z, gates, radius)) points.push({ x, z });
  return points;
}

afterEach(() => {
  region.world = "home"; region.layer = "ground";
  resetRuntime(); resetCombat(); cb.onScreen = null;
  setGame({ screen: "title", progress: newProgress() });
  vi.clearAllMocks();
});

describe("Flooded Grove ankle-deep floor", () => {
  it("classifies the authored swamp as shallow walkable floor, separately from splash hazards", () => {
    region.world = "home"; region.layer = "ground";
    expect(SHALLOW_WATER.length).toBeGreaterThan(0);
    expect(SHALLOW_WATER_DEPTH).toBeGreaterThanOrEqual(.12);
    expect(SHALLOW_WATER_DEPTH).toBeLessThanOrEqual(.18);
    const points = wetFloor();
    expect(points.length).toBeGreaterThan(200);
    for (const { x, z } of points) {
      expect(waterAt(x, z, "home"), `${x},${z}`).toBe("shallow");
      expect(hazardAt(x, z, "home")).toBeNull();
      expect(waterAt(x, z, "cloud")).toBe("none");
    }
    // The existing golden ground tests retain their hashes: shallow water adds
    // no collision cut-out, height change, save field or relocation rule.
  });

  it("floods most ordinary Grove floor while retaining dry floor", () => {
    const gates = gatesOf(chapter());
    let floor = 0, shallow = 0;
    for (let z = -246; z <= -186; z += .5) for (let x = 27; x <= 74; x += .5) {
      if (zoneAt(x, z) !== "grove" || !isWalkable(x, z, gates, PLAYER_R)) continue;
      floor++;
      if (shallowWaterAt(x, z)) shallow++;
    }
    const fraction = shallow / floor;
    console.info(`Grove ankle-water coverage: ${shallow}/${floor} walkable floor samples (${(fraction * 100).toFixed(1)}%)`);
    expect(fraction, `${shallow}/${floor} Grove floor samples are shallow (${Math.round(fraction * 100)}%)`).toBeGreaterThanOrEqual(.5);
    expect(fraction).toBeLessThan(.8);
  });

  it("keeps the effective shallow footprints out of every protected island, bank and puzzle pocket", () => {
    expect(SHALLOW_KEEP_OUTS.length).toBeGreaterThan(0);
    let protectedSamples = 0, dryFloor = 0;
    const gates = gatesOf(chapter());
    for (let z = -245; z <= -185; z += .5) for (let x = 29; x <= 74; x += .5) {
      if (!SHALLOW_KEEP_OUTS.some(s => inside(s, x, z))) continue;
      protectedSamples++;
      expect(shallowWaterAt(x, z), `keep-out at ${x},${z}`).toBe(false);
      if (isWalkable(x, z, gates, PLAYER_R) && !hazardAt(x, z, "home") && waterAt(x, z, "home") === "none") dryFloor++;
    }
    expect(protectedSamples).toBeGreaterThan(100);
    expect(dryFloor).toBeGreaterThan(50);
    const protectedPoints = [ISLET, POND, GROVE_CROSSING.near, GROVE_CROSSING.landing,
      ...CAVE_MOUTHS.flatMap(m => [{ x: m.portalX, z: m.z }, { x: m.groundX0 + .5, z: m.z }]),
      { x: GROVE_DOOR.x, z: GROVE_DOOR.z + 2 },
      ...CHESTS.filter(c => (c.layer ?? "ground") === "ground" && zoneAt(c.x, c.z) === "grove"),
      ...Object.values(SECRET_SITES).filter(s => s.stage === "grove").flatMap(s => [s.chest, s.approach])];
    for (const { x, z } of protectedPoints) expect(shallowWaterAt(x, z), `protected feature ${x},${z}`).toBe(false);
  });

  it("retains valid player, enemy and mount floor at shallow samples before and after lily unlock", () => {
    const p = chapter(), points = wetFloor(.55);
    expect(points.length).toBeGreaterThan(150);
    for (const lilies of [false, true]) {
      const gates = gatesOf({ ...p, solved: [...p.solved, ...(lilies ? ["groveLilies" as const] : [])] });
      for (const { x, z } of points) for (const radius of [0, PLAYER_R, .55])
        expect(isWalkable(x, z, gates, radius), `${radius} m walker at ${x},${z}`).toBe(true);
    }
  });

  it("round-trips existing v4 shallow-floor positions without relocation or new fields", () => {
    const p = chapter(), points = wetFloor().filter((_, i) => i % 7 === 0);
    expect(points.length).toBeGreaterThan(25);
    for (const point of points) {
      const player = { ...point, yaw: .7 };
      const loaded = decodeSave(encodeSave(p, player, 87));
      expect(loaded).not.toBeNull();
      expect(loaded!.v).toBe(4);
      expect(loaded!.player, `saved shallow floor ${point.x},${point.z}`).toEqual(player);
      expect(loaded!.seconds).toBe(87);
    }
  });

  it("uses a seven-percent speed reduction only on home ground shallow floor", () => {
    region.layer = "ground";
    const wet = wetFloor()[0];
    expect(wet).toBeDefined();
    expect(shallowSpeedFactor(wet.x, wet.z, "home")).toBe(.93);
    expect(shallowSpeedFactor(wet.x, wet.z, "cloud")).toBe(1);
    expect(shallowSpeedFactor(ISLET.x, ISLET.z, "home")).toBe(1);
    for (const layer of ["cave", "high"] as const) {
      region.layer = layer;
      expect(shallowSpeedFactor(wet.x, wet.z, "home")).toBe(1);
      expect(waterAt(wet.x, wet.z, "home")).toBe("none");
    }
  });

  it("applies shallow speed to enemy chase movement while preserving lunge speed", () => {
    resetRuntime();
    const progress = chapter(), gates = gatesOf(progress), radius = ENEMIES.snapjaw.radius;
    setGame({ screen: "game", mode: "explore", settingsOpen: false, journalOpen: false, progress });
    region.world = "home"; region.layer = "ground";
    resetCombat(); cb.onScreen = () => true; rt.time = 10;
    for (const e of cb.enemies) e.state = "gone";
    const wet = wetFloor(radius).find(p => isWalkable(p.x + .5, p.z, gates, radius)
      && isWalkable(p.x + 5, p.z, gates, PLAYER_R) && zoneAt(p.x + 5, p.z) === "grove");
    expect(wet).toBeDefined();
    const e = cb.enemies.find(e => e.zone === "grove")!;
    Object.assign(e, { kind: "snapjaw", ...wet!, homeX: wet!.x, homeZ: wet!.z, hp: 44,
      state: "chase", timer: 0, kx: 0, kz: 0, burn: null, panic: null });
    Object.assign(rt.player, { x: wet!.x + 5, z: wet!.z, climbY: null });
    cb.zones.current = "grove";
    combatTick(.05);
    expect(e.x - wet!.x).toBeCloseTo(ENEMIES.snapjaw.speed * .93 * .05, 5);
    const x = e.x;
    Object.assign(e, { state: "lunge", timer: 1, dx: 1, dz: 0 });
    combatTick(.05);
    expect(e.x - x).toBeCloseTo(ENEMIES.snapjaw.lunge * .05, 5);
  });

  it("extinguishes an enemy entering swamp floor once without a splash KO or forced bank retreat", () => {
    resetRuntime();
    const progress = chapter();
    setGame({ screen: "game", mode: "explore", settingsOpen: false, journalOpen: false, progress });
    region.world = "home"; region.layer = "ground";
    resetCombat(); cb.onScreen = () => true;
    rt.time = 10;
    for (const e of cb.enemies) e.state = "gone";
    const e = cb.enemies.find(e => e.zone === "grove")!;
    const wet = wetFloor(ENEMIES.snapjaw.radius)[0];
    Object.assign(e, { kind: "snapjaw", ...wet, homeX: wet.x, homeZ: wet.z, lastGround: { ...wet },
      hp: 100, state: "recover", timer: 99, kx: 0, kz: 0,
      burn: { until: rt.time + 10, tick: rt.time + 1 }, panic: startPanic("medium", rt.time), infernoBlueUntil: rt.time + 1 });
    Object.assign(rt.player, { ...wet, x: wet.x + 1, climbY: null });
    cb.zones.current = "grove";
    vi.clearAllMocks();
    combatTick(0);
    expect(e.burn).toBeNull(); expect(e.panic).toBeNull();
    expect(e.infernoBlueUntil).toBe(0);
    expect(e.hp).toBe(100); expect(e.state).toBe("recover");
    expect(e.wade).toBeNull(); expect(cb.drops).toHaveLength(0);
    expect(cb.fx.filter(f => f.kind === "steam")).toHaveLength(1);
    expect(audio.cancelPanic).toHaveBeenCalledOnce();
    for (let i = 0; i < 4; i++) combatTick(0);
    expect(cb.fx.filter(f => f.kind === "steam")).toHaveLength(1);
    expect(vi.mocked(audio.play).mock.calls.filter(([sound]) => sound === "sizzle")).toHaveLength(1);
    expect(cb.fx.some(f => f.kind === "splashKo")).toBe(false);
  });
});
