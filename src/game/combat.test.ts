import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { basicAttack, cb, combatTick, crabDamage, hooks, isRanged, resetBeaconFight, resetCombat, specialAttack, travelCombat, wakeUp, type Shot } from "./combat";
import { newProgress } from "./logic/progress";
import { getGame, setGame } from "./store";
import { rt } from "./runtime";
import { region } from "./world/region";
import { COMBAT, ENEMIES, type CompanionId, type EnemyKind } from "./data/combat";
import { BEACON_PYLONS } from "./logic/beacon";
import { CLOUD_ENEMY_SPAWNS, cloudY } from "./world/cloudisle";
import { ENEMY_SPAWNS } from "./world/lowland";
import { MONSTERS } from "./data/monsters";
import { PLAYER_R, gatesOf, isWalkable, standY } from "./world/collision";
import { run } from "./flow/script";

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
  cb.onScreen = () => true;
  cb.cloudZones.current = "stormbreakCoast";
});

afterEach(() => { region.world = "home"; cb.onScreen = null; });

function changeWorld(world: "home" | "cloud") {
  setGame(g => ({ progress: { ...g.progress, act3: { ...g.progress.act3, world } } }));
  region.world = world;
  travelCombat();
}

function advanceCombat(seconds: number) {
  const frames = Math.ceil(seconds * 60);
  for (let i = 0; i < frames; i++) {
    rt.time += 1 / 60; rt.playTime += 1 / 60;
    combatTick(1 / 60);
  }
}

function loneEnemy(kind: EnemyKind = "stormCrab", x = 0, z = 27) {
  for (const e of cb.enemies) e.state = "gone";
  const e = cb.enemies[0];
  Object.assign(e, { kind, zone: "stormbreakCoast", x, z, homeX: x, homeZ: z, hp: 100, state: "recover", timer: 99, kx: 0, kz: 0 });
  return e;
}

describe("companions leaving combat", () => {
  const destinations = [
    { name: "Fern Crossing", world: "home", hostile: [76, -183], safe: [76, -188] },
    { name: "Port Town", world: "home", hostile: [76, -287], safe: [76, -293] },
    { name: "Hidden Hollow", world: "cloud", hostile: [-5, 47], safe: [-10, 50] }
  ] as const;

  for (const destination of destinations) for (const friend of ["leafy", "bubbo", "puff", "ember"] as const) {
    it(`${friend} releases its combat script on entering ${destination.name}`, () => {
      changeWorld(destination.world);
      setGame(g => ({ progress: { ...g.progress, active: friend, act2: { ...g.progress.act2, cleared: ["forest1", "grove", "canopy", "causeway", "coast"] } } }));
      for (const e of cb.enemies) e.state = "gone";
      Object.assign(rt.player, { x: destination.hostile[0], z: destination.hostile[1] });
      advanceCombat(.6);
      expect(cb.stance.friend).toBe(friend);
      expect(rt.monsters[friend].mode).toBe("script");
      Object.assign(rt.player, { x: destination.safe[0], z: destination.safe[1] });
      combatTick(.01);
      expect(cb.stance.friend).toBeNull();
      const m = rt.monsters[friend];
      expect(m.mode).toBe("follow");
      expect(m.look).toBeNull();
      expect(m.target).toBeNull();
      expect(isWalkable(m.x, m.z, gatesOf(getGame().progress), MONSTERS[friend].radius, MONSTERS[friend].can.includes("swim"))).toBe(true);
      if (COMBAT[friend].stance === "ride") {
        expect(isWalkable(rt.player.x, rt.player.z, gatesOf(getGame().progress), PLAYER_R)).toBe(true);
        expect(rt.player.y).toBeCloseTo(standY(rt.player.x, rt.player.z, getGame().progress.solved));
      } else {
        expect(cb.stance.leaving).toBe(friend);
        advanceCombat(.6);
        expect(cb.stance.leaving).toBeNull();
      }
    });
  }

  for (const friend of ["leafy", "bubbo", "puff", "ember"] as const) {
    it(`projects ${friend}'s dismount away from the Hollow campfire`, () => {
      setGame(g => ({ progress: { ...g.progress, active: friend } }));
      const perched = COMBAT[friend].stance !== "ride";
      Object.assign(rt.player, perched ? { x: -15.1, z: 57.3 } : { x: -17.2, z: 56 });
      Object.assign(cb.stance, { friend, k: 1 });
      rt.monsters[friend].mode = "script";
      combatTick(.01);
      const m = rt.monsters[friend];
      expect(Math.hypot(m.x + 16, m.z - 56)).toBeGreaterThanOrEqual(.65 + MONSTERS[friend].radius);
      expect(isWalkable(m.x, m.z, gatesOf(getGame().progress), MONSTERS[friend].radius, MONSTERS[friend].can.includes("swim"))).toBe(true);
    });
  }

  for (const mode of ["script", "talk"] as const) {
    it(`preserves ${mode} ownership while a scene runs`, async () => {
      Object.assign(cb.stance, { friend: "leafy", k: 1 });
      rt.monsters.leafy.mode = mode;
      let finish!: () => void;
      const scene = run(() => new Promise<void>(resolve => { finish = resolve; }));
      try {
        combatTick(.01);
        expect(cb.stance.friend).toBeNull();
        expect(rt.monsters.leafy.mode).toBe(mode);
      } finally {
        finish();
        await scene;
      }
    });
  }
});

describe("facing-directed player attacks", () => {
  for (const friend of ["bubbo", "puff", "ember"] as const) {
    for (const upgrade of [false, true]) {
      it(`${friend}${upgrade ? " upgraded" : ""} hits an enemy in its path without changing yaw`, () => {
        const e = loneEnemy();
        setGame(g => ({ progress: { ...g.progress, active: friend, act2: { ...g.progress.act2, upgrades: upgrade ? [friend] : [] } } }));
        cb.stance.friend = friend; cb.stance.k = 1;
        expect(basicAttack()).toBe(true);
        expect(rt.player.yaw).toBe(0);
        expect(cb.shots).toHaveLength(friend === "puff" && upgrade ? 2 : 1);
        for (const shot of cb.shots) {
          expect(shot.vx).toBeCloseTo(0);
          expect(shot.vz).toBe(COMBAT[friend].basic.speed);
          expect(shot.radius).toBeGreaterThanOrEqual(.8);
        }
        advanceCombat(.7);
        expect(e.hp).toBeLessThan(100);
      });

      it(`${friend}${upgrade ? " upgraded" : ""} misses an enemy that leaves the path after firing`, () => {
        const e = loneEnemy();
        setGame(g => ({ progress: { ...g.progress, active: friend, act2: { ...g.progress.act2, upgrades: upgrade ? [friend] : [] } } }));
        cb.stance.friend = friend; cb.stance.k = 1;
        expect(basicAttack()).toBe(true);
        const shots = [...cb.shots], velocity = shots.map(s => ({ vx: s.vx, vy: s.vy, vz: s.vz }));
        e.x = e.homeX = 5;
        rt.player.yaw = Math.PI / 2;
        advanceCombat(.7);
        expect(e.hp).toBe(100);
        shots.forEach((shot, i) => expect({ vx: shot.vx, vy: shot.vy, vz: shot.vz }).toEqual(velocity[i]));
      });
    }

    it(`${friend} does not snap toward an off-axis enemy when firing`, () => {
      loneEnemy("stormCrab", 4, 24);
      cb.stance.friend = friend; cb.stance.k = 1;
      expect(basicAttack()).toBe(true);
      expect(rt.player.yaw).toBe(0);
      expect(cb.move).toMatchObject({ tx: 0, tz: 20 + COMBAT[friend].basic.range });
      expect(cb.shots[0].vx).toBeCloseTo(0);
    });
  }

  for (const friend of ["bubbo", "puff"] as const) {
    it(`${friend}'s directional special keeps facing and misses an off-axis enemy`, () => {
      const e = loneEnemy("stormCrab", 4, 20);
      cb.stance.friend = friend; cb.stance.k = 1;
      expect(specialAttack()).toBe(true);
      expect(rt.player.yaw).toBe(0);
      expect(e.hp).toBe(100);
      expect(cb.move).toMatchObject({ tx: 0, tz: 20 + COMBAT[friend].special.range });
    });
  }

  it("retains Ember's area burst damage around the player", () => {
    const e = loneEnemy("stormCrab", 3, 20);
    cb.stance.friend = "ember"; cb.stance.k = 1;
    expect(specialAttack()).toBe(true);
    expect(e.hp).toBe(70);
  });
});

describe("shared ranged enemy rules", () => {
  it("retains the replaced spawn's health in both worlds and after returning", () => {
    const expectOriginalHealth = (spawns: typeof ENEMY_SPAWNS | typeof CLOUD_ENEMY_SPAWNS) => {
      spawns.forEach((spawn, i) => {
        if (spawn.replaces) expect(cb.enemies[i].hp, `${spawn.zone} ${i}`).toBe(ENEMIES[spawn.replaces].hp);
      });
    };
    expectOriginalHealth(CLOUD_ENEMY_SPAWNS);
    changeWorld("home");
    expectOriginalHealth(ENEMY_SPAWNS);
    changeWorld("cloud");
    expectOriginalHealth(CLOUD_ENEMY_SPAWNS);
  });

  for (const kind of ["forestSpitter", "raiderShooter", "windSprite"] as const) {
    it(`${kind} warns for 0.8 seconds, aims at fire time, then pauses for 2.5 seconds`, () => {
      const e = loneEnemy(kind);
      e.state = "chase";
      combatTick(.01);
      expect(e.state).toBe("windup");
      expect(e.timer).toBeCloseTo(.8);
      advanceCombat(.6);
      expect(cb.shots).toHaveLength(0);
      if (kind === "windSprite") expect(Math.abs(e.x)).toBeGreaterThan(.01);
      rt.player.x = 2;
      advanceCombat(.21);
      expect(e.state).toBe("recover");
      expect(cb.shots).toHaveLength(1);
      const shot = cb.shots[0], speed = Math.hypot(shot.vx, shot.vz);
      expect(speed).toBeCloseTo(3.2);
      expect(shot.vx / shot.vz).toBeCloseTo((rt.player.x - e.x) / (rt.player.z - e.z));
      expect(e.timer).toBeCloseTo(2.5, 1);
      const velocity = { vx: shot.vx, vy: shot.vy, vz: shot.vz };
      rt.player.x = -2;
      advanceCombat(.3);
      expect({ vx: shot.vx, vy: shot.vy, vz: shot.vz }).toEqual(velocity);
      advanceCombat(2);
      expect(e.state).toBe("recover");
      expect(e.timer).toBeGreaterThan(0);
    });

    it(`${kind} approaches from beyond nine metres and backs off below three, including recovery`, () => {
      const e = loneEnemy(kind, 0, 31);
      e.state = "chase";
      combatTick(.1);
      expect(e.z).toBeLessThan(31);
      expect(e.state).toBe("chase");
      Object.assign(e, { x: 0, z: 22, homeX: 0, homeZ: 22, state: "recover", timer: 2 });
      combatTick(.1);
      expect(e.z).toBeGreaterThan(22);
      expect(cb.shots).toHaveLength(0);
      Object.assign(e, { z: 22, state: "windup", timer: .01 });
      combatTick(.02);
      expect(e.state).not.toBe("windup");
      expect(cb.shots).toHaveLength(0);
    });
  }

  it("keeps at most two ranged awake, including re-entry and a basic hit", () => {
    loneEnemy();
    for (let i = 0; i < 3; i++) Object.assign(cb.enemies[i], { kind: "windSprite", x: i - 1, z: 27, homeX: i - 1, homeZ: 27, state: "idle", zone: "stormbreakCoast", hp: 100 });
    combatTick(.01);
    const awake = () => cb.enemies.filter(e => isRanged(e.kind) && !["idle", "return", "gone", "ko"].includes(e.state));
    expect(awake()).toHaveLength(2);
    cb.enemies[2].state = "return";
    combatTick(.01);
    expect(awake()).toHaveLength(2);
    // A direct shot can still damage the sleeper without granting another attack slot.
    Object.assign(cb.enemies[2], { x: 0, z: 22, homeX: 0, homeZ: 22, state: "idle" });
    cb.stance.friend = "leafy"; cb.stance.k = 1;
    expect(basicAttack()).toBe(true);
    expect(cb.enemies[2].hp).toBeLessThan(100);
    expect(awake()).toHaveLength(2);
  });

  for (const blockedBy of ["off screen", "unreachable ground", "solid line of sight", "other zone"] as const) {
    it(`does not wake or fire from ${blockedBy}`, () => {
      const e = loneEnemy("raiderShooter");
      if (blockedBy === "off screen") cb.onScreen = () => false;
      if (blockedBy === "unreachable ground") Object.assign(e, { x: -6, z: 18, homeX: -6, homeZ: 18 });
      if (blockedBy === "solid line of sight") {
        Object.assign(rt.player, { x: -6, z: 15, y: cloudY(-6, 15) });
        Object.assign(e, { x: -6, z: 23, homeX: -6, homeZ: 23 });
      }
      if (blockedBy === "other zone") Object.assign(e, { x: 0, z: 8, homeX: 0, homeZ: 8 });
      e.state = "idle"; e.timer = 99;
      combatTick(.01);
      expect(e.state).toBe("idle");
      e.state = "windup"; e.timer = .001;
      combatTick(.01);
      expect(cb.shots).toHaveLength(0);
    });
  }

  function hostileShot(x: number, z: number, vx: number, vz: number): Shot {
    return { id: 9000, shape: "wind", owner: "puff", hostile: true, source: 0, x, y: 10, z, y1: 10,
      vx, vz, life: 5, age: 0, radius: .42, damage: 5, knock: 0, stun: 0, size: 1 };
  }

  it("blocks a hostile shot on a solid even when one frame would carry it through", () => {
    loneEnemy().state = "gone";
    Object.assign(rt.player, { x: -6, z: 15 });
    cb.shots.push(hostileShot(-6, 21, 0, -3.2));
    combatTick(2);
    expect(cb.shots).toHaveLength(0);
    expect(cb.vitals.hp).toBe(100);
  });

  it("blocks hostile shots at a closed stage barrier", () => {
    loneEnemy().state = "gone";
    Object.assign(rt.player, { x: 0, z: 40 });
    cb.shots.push(hostileShot(0, 42, 0, 3.2));
    combatTick(1.5);
    expect(cb.shots).toHaveLength(0);
  });

  it("removes hostile shots at the border into the safe dock", () => {
    loneEnemy().state = "gone";
    Object.assign(rt.player, { x: 0, z: 12 });
    cb.shots.push(hostileShot(0, 10.5, 0, -3.2));
    combatTick(1);
    expect(cb.shots).toHaveLength(0);
    expect(cb.vitals.hp).toBe(100);
  });
});

describe("Cloud Isle combat", () => {
  it("armours the crab's front only against basic attacks", () => {
    expect(crabDamage("stormCrab", 11, true, 0, 0, -1)).toBe(5.5);
    expect(crabDamage("stormCrab", 11, true, 0, 1, 0)).toBe(11);
    expect(crabDamage("stormCrab", 11, true, 0, 0, 1)).toBe(11);
    expect(crabDamage("stormCrab", 22, false, 0, 0, -1)).toBe(22);
    expect(crabDamage("shellback", 11, true, 0, 0, -1)).toBe(11);
  });

  it("keeps at most four coast enemies awake", () => {
    for (const e of cb.enemies) Object.assign(e, { kind: "stormCrab", x: 0, z: 22, state: "idle" });
    combatTick(0.016);
    expect(cb.enemies.filter(e => e.state === "alert")).toHaveLength(4);
    expect(cb.enemies.filter(e => e.zone === "stormbreakCoast" && e.state === "idle")).toHaveLength(2);
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

  it("keeps electric panels safe before their pulse, then deals light damage without knock-back", () => {
    for (const e of cb.enemies) e.state = "gone";
    Object.assign(rt.player, { x: 17, z: 115 });
    cb.safeUntil = 0;
    rt.time = 4;
    combatTick(.016);
    expect(cb.vitals.hp).toBe(100);
    rt.time = 6.39;
    combatTick(.016);
    expect(cb.vitals.hp).toBe(100);
    rt.time = 6.41;
    combatTick(.016);
    expect(cb.vitals.hp).toBe(95);
    expect(cb.knock).toEqual({ x: 0, z: 0 });
    // Ordinary hit protection also prevents frame-rate-dependent damage.
    rt.time = 6.5;
    combatTick(.016);
    expect(cb.vitals.hp).toBe(95);
    expect(rt.player).toMatchObject({ x: 17, z: 115 });
  });

  it("damages a fifth sleeping enemy without waking a fifth attacker", () => {
    cb.enemies.forEach((e, i) => Object.assign(e, { kind: "stormCrab", x: 0, z: 22, yaw: 0, hp: 100, state: i < 4 ? "windup" : i === 4 ? "idle" : "gone" }));
    cb.stance.friend = "leafy";
    cb.stance.k = 1;
    expect(basicAttack()).toBe(true);
    expect(cb.enemies[4].hp).toBe(89);
    expect(cb.enemies[4].state).toBe("idle");
    expect(cb.enemies[4].waiting).toBe(true);
    expect(cb.enemies.filter(e => !["idle", "return", "ko", "gone"].includes(e.state))).toHaveLength(4);
  });

  it("a returning enemy waits for an awake slot", () => {
    cb.enemies.forEach((e, i) => Object.assign(e, { kind: "stormCrab", x: 0, z: 22, homeX: 0, homeZ: 22, state: i < 4 ? "windup" : i === 4 ? "return" : "gone" }));
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

  it("fires a slow straight wind puff that damages without moving the player", () => {
    for (const e of cb.enemies) e.state = "gone";
    const e = cb.enemies[1];
    Object.assign(e, { x: 0, z: 27, homeX: 0, homeZ: 27, kind: "windSprite", state: "windup", timer: 0, dx: 0, dz: -1 });
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

describe("Storm Beacon world combat integration", () => {
  beforeEach(() => {
    // Toast dismissal is UI housekeeping; keep it outside the simulated fight clock.
    vi.stubGlobal("window", { setTimeout: vi.fn(() => 1), clearTimeout: vi.fn() });
  });
  afterEach(() => { hooks.knockout = null; hooks.beaconDefeated = null; vi.unstubAllGlobals(); });

  function enterArena(friend: CompanionId = "bubbo") {
    setGame(g => ({ progress: { ...g.progress, active: friend, act3: { ...g.progress.act3, area: "stormBeacon",
      cleared: ["ancientObservatory"], observatoryLamps: ["leafy", "bubbo", "puff", "ember"], checkpoint: "observatory" } } }));
    for (const e of cb.enemies) e.state = "gone";
    Object.assign(rt.player, { x: -7, z: 163, y: 37, yaw: 0, speed: 0 });
    cb.cloudZones.current = "stormBeacon";
    cb.stance.friend = friend;
    cb.stance.k = 1;
    cb.beacon.active = true;
    cb.beacon.timer = 99;
    for (const p of cb.beacon.pylons) p.timer = 99;
  }

  /** Run the real projectile simulation, keeping the cooldown clock in step. */
  function advance(seconds: number) {
    const frames = Math.ceil(seconds * 60);
    for (let i = 0; i < frames; i++) {
      rt.time += 1 / 60; rt.playTime += 1 / 60;
      combatTick(1 / 60);
    }
  }

  it("Bubbo's real bubble is blocked by a shield, shorts charging early, then breaks the exposed pylon", () => {
    enterArena();
    expect(basicAttack()).toBe(true);
    expect(cb.shots).toHaveLength(1);
    advance(.55);
    expect(cb.beacon.power).toBe(3);
    expect(cb.beacon.pylons[0].phase).toBe("shielded");
    expect(cb.shots).toHaveLength(0);
    cb.beacon.pylons[0].phase = "charging";
    expect(basicAttack()).toBe(true);
    expect(cb.beacon.pylons[0].phase).toBe("charging");
    advance(.55);
    expect(cb.beacon.pylons[0]).toMatchObject({ phase: "exposed", shorted: true });
    expect(cb.beacon.power).toBe(3);
    expect(basicAttack()).toBe(true);
    advance(.55);
    expect(cb.beacon.pylons[0].phase).toBe("down");
    expect(cb.beacon.power).toBe(2);
  });

  it("three real ranged attacks remove bar thirds and trigger resolution exactly once", () => {
    enterArena();
    const completed = vi.fn(() => setGame(g => ({ progress: { ...g.progress, act3: { ...g.progress.act3, beaconDefeated: true } } })));
    hooks.beaconDefeated = completed;
    for (let i = 0; i < 3; i++) {
      const p = BEACON_PYLONS[i];
      Object.assign(rt.player, { x: p.x, z: p.z - 4, yaw: 0 });
      cb.beacon.pylons[i].phase = "exposed";
      expect(basicAttack()).toBe(true);
      advance(.55);
      expect(cb.beacon.power).toBe(2 - i);
      expect(cb.beacon.pylons[i].phase).toBe("down");
      if (i < 2) expect(completed).not.toHaveBeenCalled();
    }
    expect(completed).toHaveBeenCalledTimes(1);
    expect(cb.beacon.active).toBe(false);
    expect(cb.enemies.some(e => e.i >= 10000)).toBe(false);
  });

  it("Leafy's actual sweep hits an exposed pylon without a projectile or battle screen", () => {
    enterArena("leafy");
    Object.assign(rt.player, { x: -7, z: 165.5 });
    cb.beacon.pylons[0].phase = "exposed";
    expect(basicAttack()).toBe(true);
    expect(cb.beacon.power).toBe(2);
    expect(cb.shots).toHaveLength(0);
  });

  it("Puff's attack must point along the gust to cancel its real push", () => {
    enterArena("puff");
    // Far enough from pylons to preserve the intended attack direction.
    Object.assign(rt.player, { x: 0, z: 157, yaw: -Math.PI / 2 });
    cb.beacon.attack = "gustTell"; cb.beacon.timer = 1; cb.beacon.gust = { x: 1, z: 0 };
    expect(basicAttack()).toBe(true);
    expect(cb.beacon.gustCancelled).toBe(false);
    advance(.45);
    rt.player.yaw = Math.PI / 2;
    expect(basicAttack()).toBe(true);
    expect(cb.beacon.gustCancelled).toBe(true);
    const position = { x: rt.player.x, z: rt.player.z };
    advance(.7);
    expect(cb.beacon.attack).toBe("calm");
    expect(rt.player).toMatchObject(position);
  });

  it("uses free boss specials at zero MP while retaining ordinary coast MP costs", () => {
    enterArena("leafy");
    Object.assign(rt.player, { x: -7, z: 164 });
    cb.vitals.mp.leafy = 0; cb.beacon.pylons[0].phase = "exposed";
    expect(specialAttack()).toBe(true);
    expect(cb.beacon.power).toBe(2);
    expect(cb.vitals.mp.leafy).toBe(0);
    Object.assign(rt.player, { x: 0, z: 20, y: 2 });
    cb.cloudZones.current = "stormbreakCoast";
    cb.ready.special = 0;
    expect(specialAttack()).toBe(false);
    cb.vitals.mp.leafy = 25;
    expect(specialAttack()).toBe(true);
    expect(cb.vitals.mp.leafy).toBe(0);
  });

  it("resets failed-attempt pylons and sprites on a real lightning knockout, preserving chapter progress", () => {
    enterArena("leafy");
    cb.beacon.pylons[0].phase = "down"; cb.beacon.pylons[1].phase = "down"; cb.beacon.power = 1;
    advance(.02);
    expect(cb.enemies.filter(e => e.i >= 10000)).toHaveLength(2);
    const progress = getGame().progress, knockedOut = vi.fn(); hooks.knockout = knockedOut;
    cb.vitals.hp = 1; cb.safeUntil = 0;
    cb.beacon.attack = "lightning"; cb.beacon.timer = .3; cb.beacon.rings = [{ x: rt.player.x, z: rt.player.z }];
    advance(.02);
    expect(knockedOut).toHaveBeenCalledTimes(1);
    expect(cb.knockedOut).toBe(true);
    expect(cb.beacon).toMatchObject({ active: false, power: 3, spritesAdded: false });
    expect(cb.beacon.pylons.every(p => p.phase === "shielded")).toBe(true);
    expect(cb.enemies.some(e => e.i >= 10000)).toBe(false);
    expect(getGame().progress).toBe(progress);
    wakeUp();
    expect(cb.vitals.hp).toBeGreaterThanOrEqual(60);
    expect(cb.knockedOut).toBe(false);
    resetBeaconFight();
    expect(cb.beacon.power).toBe(3);
  });
});
