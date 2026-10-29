import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { basicAttack, cb, combatTick, crabDamage, resetCombat, travelCombat } from "./combat";
import { newProgress } from "./logic/progress";
import { setGame } from "./store";
import { rt } from "./runtime";
import { region } from "./world/region";
import { ENEMIES } from "./data/combat";

vi.mock("../audio/audio", () => ({ audio: { play: vi.fn(), voice: vi.fn(), startMusic: vi.fn() } }));

beforeEach(() => {
  const progress = newProgress();
  progress.act2.started = progress.act2.harbor = true;
  progress.act3.world = "cloud";
  progress.act3.voyageDone = true;
  progress.active = "leafy";
  setGame({ screen: "game", mode: "explore", journalOpen: false, settingsOpen: false, progress });
  region.world = "cloud";
  rt.time = rt.playTime = 10;
  Object.assign(rt.player, { x: 0, z: 20, y: 2, yaw: 0, speed: 0, climbY: null });
  resetCombat();
  cb.cloudZones.current = "stormbreakCoast";
});

afterEach(() => { region.world = "home"; });

function changeWorld(world: "home" | "cloud") {
  setGame(g => ({ progress: { ...g.progress, act3: { ...g.progress.act3, world } } }));
  region.world = world;
  travelCombat();
}

describe("Cloud Isle combat", () => {
  it("armours the crab's front only against basic attacks", () => {
    expect(crabDamage("stormCrab", 11, true, 0, 0, -1)).toBe(5.5);
    expect(crabDamage("stormCrab", 11, true, 0, 1, 0)).toBe(11);
    expect(crabDamage("stormCrab", 11, true, 0, 0, 1)).toBe(11);
    expect(crabDamage("stormCrab", 22, false, 0, 0, -1)).toBe(22);
    expect(crabDamage("shellback", 11, true, 0, 0, -1)).toBe(11);
  });

  it("keeps at most four coast enemies awake", () => {
    for (const e of cb.enemies) Object.assign(e, { x: 0, z: 22, state: "idle" });
    combatTick(0.016);
    expect(cb.enemies.filter(e => e.state === "alert")).toHaveLength(4);
    expect(cb.enemies.filter(e => e.state === "idle")).toHaveLength(2);
  });

  it("a basic hit interrupts a crab charge while retaining its frontal armour", () => {
    for (const e of cb.enemies) e.state = "gone";
    const e = cb.enemies[0];
    Object.assign(e, { x: 0, z: 22, state: "windup", timer: 0.4, yaw: Math.PI, hp: 48 });
    cb.stance.friend = "leafy";
    cb.stance.k = 1;
    expect(basicAttack()).toBe(true);
    expect(e.state).toBe("stun");
    expect(e.hp).toBe(42.5);
  });

  it("damages a fifth sleeping enemy without waking a fifth attacker", () => {
    cb.enemies.forEach((e, i) => Object.assign(e, { x: 0, z: 22, yaw: 0, hp: 100, state: i < 4 ? "windup" : i === 4 ? "idle" : "gone" }));
    cb.stance.friend = "leafy";
    cb.stance.k = 1;
    expect(basicAttack()).toBe(true);
    expect(cb.enemies[4].hp).toBe(89);
    expect(cb.enemies[4].state).toBe("idle");
    expect(cb.enemies[4].waiting).toBe(true);
    expect(cb.enemies.filter(e => !["idle", "return", "ko", "gone"].includes(e.state))).toHaveLength(4);
  });

  it("a returning enemy waits for an awake slot", () => {
    cb.enemies.forEach((e, i) => Object.assign(e, { x: 0, z: 22, homeX: 0, homeZ: 22, state: i < 4 ? "windup" : i === 4 ? "return" : "gone" }));
    combatTick(0.016);
    expect(cb.enemies.filter(e => !["idle", "return", "ko", "gone"].includes(e.state))).toHaveLength(4);
    expect(cb.enemies[4].state).toBe("idle");
  });

  it("preserves live vitals and encounter memory over boat trips, then respawns after twelve seconds away", () => {
    cb.vitals.hp = 47;
    cb.vitals.mp.leafy = 37;
    cb.enemies[0].state = "gone";
    cb.cloudZones.defeated.stormbreakCoast = [0];
    changeWorld("home");
    expect(cb.vitals).toMatchObject({ hp: 47, mp: { leafy: 37 } });
    rt.playTime = 16;
    changeWorld("cloud");
    combatTick(0.016);
    expect(cb.enemies[0].state).toBe("gone");
    expect(cb.cloudZones.defeated.stormbreakCoast).toEqual([0]);
    changeWorld("home");
    rt.playTime = 30;
    changeWorld("cloud");
    combatTick(0.016);
    expect(cb.enemies[0].state).not.toBe("gone");
    expect(cb.cloudZones.defeated.stormbreakCoast).toEqual([]);
  });

  it("clears cached encounters on a fresh game or continue reset", () => {
    cb.enemies[0].state = "gone";
    cb.cloudZones.defeated.stormbreakCoast = [0];
    changeWorld("home");
    resetCombat();
    changeWorld("cloud");
    expect(cb.enemies[0].state).toBe("idle");
    expect(cb.cloudZones.defeated.stormbreakCoast).toBeUndefined();
  });

  it("fires a slow drifting wind puff that damages without moving the player", () => {
    for (const e of cb.enemies) e.state = "gone";
    const e = cb.enemies[1];
    Object.assign(e, { x: 0, z: 22, kind: "windSprite", state: "windup", timer: 0, dx: 0, dz: -1 });
    combatTick(0.016);
    expect(e.state).toBe("recover");
    expect(cb.shots).toHaveLength(1);
    expect(Math.hypot(cb.shots[0].vx, cb.shots[0].vz)).toBeCloseTo(3.2, 1);
    cb.shots[0].x = rt.player.x;
    cb.shots[0].z = rt.player.z;
    combatTick(0.016);
    expect(cb.vitals.hp).toBeLessThan(100);
    expect(Math.hypot(cb.knock.x, cb.knock.z)).toBe(0);
  });

  it("locks the drone dash direction after its red-line windup", () => {
    for (const e of cb.enemies) e.state = "gone";
    const e = cb.enemies[0];
    Object.assign(e, { kind: "raiderDrone", x: 0, z: 25, homeX: 0, homeZ: 25, state: "windup", timer: 0.01, dx: 0, dz: -1 });
    combatTick(0.02);
    expect(e.state).toBe("lunge");
    rt.player.x = 4;
    combatTick(0.05);
    expect(e.x).toBe(0);
    expect(e.z).toBeLessThan(25);
  });

  it("gives the beetle a full second of warning before its stationary electric ring", () => {
    for (const e of cb.enemies) e.state = "gone";
    const e = cb.enemies[0];
    Object.assign(e, { kind: "thunderBeetle", x: 0, z: 22, state: "windup", timer: ENEMIES.thunderBeetle.windup });
    combatTick(1);
    expect(e.state).toBe("windup");
    combatTick(0.11);
    expect(e.state).toBe("lunge");
    combatTick(0.016);
    expect(e.x).toBe(0);
    expect(e.z).toBe(22);
    expect(cb.vitals.hp).toBe(88);
  });
});
