import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { basicAttack, cb, combatTick, crabDamage, hooks, isRanged, pickTarget, resetBeaconFight, resetCombat, specialAttack, speedScale, travelCombat, wakeUp, type Shot } from "./combat";
import { newProgress } from "./logic/progress";
import { getGame, setGame } from "./store";
import { rt } from "./runtime";
import { region } from "./world/region";
import { COMBAT, ENEMIES, MP_REGEN, type CompanionId, type EnemyKind } from "./data/combat";
import { BEACON_PYLONS } from "./logic/beacon";
import { BEACON, CLOUD_ENEMY_SPAWNS, cloudY } from "./world/cloudisle";
import { ENEMY_SPAWNS, POND } from "./world/lowland";
import { MONSTERS } from "./data/monsters";
import { PLAYER_R, gatesOf, isWalkable, nearestWalkable, standY } from "./world/collision";
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
    { name: "Hidden Hollow", world: "cloud", hostile: [0, 151], safe: [-10, 190] }
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
      Object.assign(rt.player, perched ? { x: -15.1, z: 197.3 } : { x: -17.2, z: 196 });
      Object.assign(cb.stance, { friend, k: 1 });
      rt.monsters[friend].mode = "script";
      combatTick(.01);
      const m = rt.monsters[friend];
      expect(Math.hypot(m.x + 16, m.z - 196)).toBeGreaterThanOrEqual(.65 + MONSTERS[friend].radius);
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
  for (const friend of ["leafy", "bubbo", "puff", "ember"] as const) {
    for (const upgrade of [false, true]) {
      it(`${friend}${upgrade ? " upgraded" : ""} uses free J along facing without changing yaw`, () => {
        const e = loneEnemy("snapjaw", 0, 23);
        setGame(g => ({ progress: { ...g.progress, active: friend, act2: { ...g.progress.act2, upgrades: upgrade ? [friend] : [] } } }));
        cb.stance.friend = friend; cb.stance.k = 1;
        cb.vitals.mp[friend] = 37;
        expect(basicAttack()).toBe(true);
        expect(rt.player.yaw).toBe(0);
        expect(cb.vitals.mp[friend]).toBe(37);
        expect(cb.shots).toHaveLength(friend === "bubbo" ? 1 : 0);
        for (const shot of cb.shots) {
          expect(shot.vx).toBeCloseTo(0);
          expect(shot.vz).toBe(COMBAT[friend].basic.speed);
          expect(shot.radius).toBe(.8);
        }
        advanceCombat(.4);
        if (friend === "bubbo") expect(e.control?.kind).toBe("trapped");
        else expect(e.hp).toBeLessThan(100);
      });

      it(`${friend}${upgrade ? " upgraded" : ""} excludes enemies behind the player`, () => {
        const e = loneEnemy("snapjaw", 0, 18.5);
        setGame(g => ({ progress: { ...g.progress, active: friend, act2: { ...g.progress.act2, upgrades: upgrade ? [friend] : [] } } }));
        cb.stance.friend = friend; cb.stance.k = 1;
        expect(basicAttack()).toBe(true);
        expect(e.hp).toBe(100);
        expect(e.control).toBeNull();
        expect(rt.player.yaw).toBe(0);
      });
    }

    it(`${friend} does not snap toward an off-axis enemy when firing`, () => {
      loneEnemy("stormCrab", 4, 24);
      cb.stance.friend = friend; cb.stance.k = 1;
      expect(basicAttack()).toBe(true);
      expect(rt.player.yaw).toBe(0);
      expect(cb.move).toMatchObject({ tx: 0, tz: 20 + COMBAT[friend].basic.range });
      for (const shot of cb.shots) expect(shot.vx).toBeCloseTo(0);
    });
  }

  for (const friend of ["leafy", "bubbo", "puff", "ember"] as const) {
    it(`${friend}'s directional special keeps facing and misses an off-axis enemy`, () => {
      const e = loneEnemy("stormCrab", 4, 20);
      cb.stance.friend = friend; cb.stance.k = 1;
      const mp = cb.vitals.mp[friend];
      expect(specialAttack()).toBe(true);
      expect(rt.player.yaw).toBe(0);
      expect(e.hp).toBe(100);
      expect(cb.move).toMatchObject({ tx: 0, tz: 20 + COMBAT[friend].special.range });
      expect(cb.vitals.mp[friend]).toBe(mp - COMBAT[friend].special.cost);
      expect(cb.ready.special).toBe(rt.time + COMBAT[friend].special.cooldown);
    });
  }

  it("Ember's Inferno starts with a tick in its forward cone", () => {
    const e = loneEnemy("stormCrab", 0, 23);
    cb.stance.friend = "ember"; cb.stance.k = 1;
    expect(specialAttack()).toBe(true);
    expect(e.hp).toBe(94);
  });

  it("Bubbo's projectile never follows a moving target or a later player turn", () => {
    const e = loneEnemy("snapjaw");
    cb.stance.friend = "bubbo"; cb.stance.k = 1;
    expect(basicAttack()).toBe(true);
    const shot = cb.shots[0], velocity = { vx: shot.vx, vy: shot.vy, vz: shot.vz };
    e.x = e.homeX = 5;
    rt.player.yaw = Math.PI / 2;
    advanceCombat(.7);
    expect(e.control).toBeNull();
    expect(e.hp).toBe(100);
    expect({ vx: shot.vx, vy: shot.vy, vz: shot.vz }).toEqual(velocity);
  });
});

describe("elemental J simulation", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { setTimeout: vi.fn(() => 1), clearTimeout: vi.fn() });
  });
  afterEach(() => vi.unstubAllGlobals());

  function friend(id: CompanionId) {
    setGame(g => ({ progress: { ...g.progress, active: id } }));
    cb.stance.friend = id; cb.stance.k = 1; cb.ready.basic = 0;
  }
  function extra(i: number, kind: EnemyKind, x: number, z: number) {
    const e = cb.enemies[i];
    Object.assign(e, { kind, x, z, homeX: x, homeZ: z, zone: "stormbreakCoast", hp: 100, state: "recover", timer: 99 });
    return e;
  }

  for (const scenario of [
    { world: "home", i: 18, distance: 1.5, attempts: 20, interval: .48 },
    { world: "cloud", i: 0, distance: 1.4, attempts: 30, interval: .65 },
    { world: "cloud", i: 1, distance: 1.4, attempts: 30, interval: .65 },
  ] as const) for (const approach of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    it(`Leafy defeats ${scenario.world} enemy ${scenario.i} from ${scenario.distance} m, approach ${approach}`, () => {
      changeWorld(scenario.world);
      setGame(g => ({ progress: { ...g.progress, solved: [...g.progress.solved, "canopyVines", "canopyRope"] } }));
      const e = cb.enemies[scenario.i];
      for (const other of cb.enemies) if (other !== e) other.state = "gone";
      Object.assign(rt.player, { x: e.x + Math.sin(approach) * scenario.distance, z: e.z + Math.cos(approach) * scenario.distance, yaw: approach + Math.PI });
      combatTick(0);
      friend("leafy");
      expect(e.hp).toBeGreaterThan(0);
      for (let n = 0; n < scenario.attempts && e.hp > 0; n++) {
        // Same approach as nearEnemy: retain the direction from the enemy.
        const a = Math.atan2(rt.player.x - e.x, rt.player.z - e.z);
        const p = nearestWalkable(e.x + Math.sin(a) * scenario.distance, e.z + Math.cos(a) * scenario.distance, PLAYER_R, gatesOf(getGame().progress));
        Object.assign(rt.player, { ...p, yaw: Math.atan2(e.x - p.x, e.z - p.z) });
        cb.vitals.hp = 100;
        if (scenario.world === "cloud") cb.hold = true;
        else basicAttack();
        advanceCombat(scenario.interval);
        cb.hold = false;
      }
      expect(e.hp).toBeLessThanOrEqual(0);
    });
  }

  for (const scenario of [
    { world: "home", i: 18, x: 50.03, z: -258.4, distance: 1.5, side: 1, damage: 8 },
    { world: "cloud", i: 0, x: 10.97, z: 25, distance: 1.4, side: -1, damage: 4 },
    { world: "cloud", i: 1, x: 10.97, z: 25, distance: 1.4, side: -1, damage: 8 },
  ] as const) {
    it(`Vine Grab hits ${scenario.world} enemy ${scenario.i} at the walkable rim after forced motion`, () => {
      changeWorld(scenario.world);
      const e = cb.enemies[scenario.i];
      for (const other of cb.enemies) if (other !== e) other.state = "gone";
      Object.assign(e, { x: scenario.x, z: scenario.z, state: "recover", timer: 99, resistUntil: rt.time + 20, yaw: scenario.side * Math.PI / 2 });
      Object.assign(rt.player, { x: e.x + scenario.side * scenario.distance, z: e.z, yaw: -scenario.side * Math.PI / 2 });
      combatTick(0);
      friend("leafy");
      const gates = gatesOf(getGame().progress), hp = e.hp;
      expect(isWalkable(rt.player.x, rt.player.z, gates, PLAYER_R)).toBe(true);
      expect(isWalkable(e.x, e.z, gates, 0)).toBe(true);
      expect(isWalkable(e.x, e.z, gates, .08)).toBe(false);
      expect(basicAttack()).toBe(true);
      expect(e.hp).toBe(hp - scenario.damage);
    });
  }

  for (const kind of ["shellback", "snapjaw", "stormCrab"] as const) {
    it(`Bubble Trap deals six contact damage on every resisted ${kind} hit`, () => {
      const e = loneEnemy(kind, 0, 23);
      e.yaw = Math.PI; // Include the crab's armoured front.
      e.resistUntil = rt.time + 20;
      friend("bubbo");
      for (let n = 1; n <= 2; n++) {
        expect(basicAttack()).toBe(true);
        advanceCombat(.65);
        expect(e.hp).toBe(100 - 6 * n);
        expect(e.control).toBeNull();
      }
    });
  }

  it("Vine Grab still rejects a target behind a real coast rock", () => {
    const e = loneEnemy("stormCrab", -3, 34.3);
    Object.assign(rt.player, { x: -3, z: 30.3, yaw: 0 });
    friend("leafy");
    const gates = gatesOf(getGame().progress);
    expect(isWalkable(rt.player.x, rt.player.z, gates, PLAYER_R)).toBe(true);
    expect(isWalkable(e.x, e.z, gates, ENEMIES[e.kind].radius)).toBe(true);
    expect(basicAttack()).toBe(true);
    expect(e.hp).toBe(100);
    expect(e.control).toBeNull();
  });

  it("Bubble Trap damages only the first enemy touched and a contact KO does not lift it", () => {
    const e = loneEnemy("snapjaw", 0, 23);
    const behind = extra(1, "snapjaw", 0, 25);
    e.hp = 6;
    friend("bubbo");
    expect(basicAttack()).toBe(true);
    advanceCombat(.4);
    expect(e.hp).toBe(0);
    expect(e.state).toBe("ko");
    expect(e.control).toBeNull();
    expect(behind.hp).toBe(100);
    expect(behind.control).toBeNull();
    expect(cb.shots).toHaveLength(0);
  });

  it("Fire Breath ignites once, refreshes without extra ticks, and upgrades burn/range", () => {
    const e = loneEnemy("snapjaw", 0, 23);
    friend("ember");
    expect(basicAttack()).toBe(true);
    expect(e.hp).toBe(93);
    expect(e.burn).not.toBeNull();
    advanceCombat(.3);
    expect(e.hp).toBe(93);
    advanceCombat(.05);
    expect(e.hp).toBe(91);
    advanceCombat(.25);
    expect(basicAttack()).toBe(true);
    expect(e.hp).toBe(84);
    advanceCombat(.1);
    expect(e.hp).toBe(82);
    Object.assign(e, { z: 25, hp: 100, burn: null, state: "recover", timer: 99 });
    setGame(g => ({ progress: { ...g.progress, act2: { ...g.progress.act2, upgrades: ["ember"] } } }));
    cb.ready.basic = 0;
    expect(basicAttack()).toBe(true);
    expect(e.hp).toBe(93);
    advanceCombat(.35);
    expect(e.hp).toBe(90);
  });

  for (const kind of ["shellback", "thunderBeetle"] as const) {
    it(`${kind} is never lifted by a trap or grab, and a grab tugs it one metre`, () => {
      const e = loneEnemy(kind, 0, 23);
      friend("bubbo");
      expect(basicAttack()).toBe(true);
      advanceCombat(.4);
      expect(e.control).toBeNull(); expect(e.air).toBe(0);
      friend("leafy");
      const z = e.z;
      expect(basicAttack()).toBe(true);
      expect(e.z).toBeCloseTo(z - 1);
      expect(e.hp).toBe(86); // six bubble contact + eight vine contact
      expect(e.control).toBeNull(); expect(e.air).toBe(0);
    });
  }

  for (const upgrade of [false, true]) {
    it(`medium bubble ${upgrade ? "upgraded" : "basic"} has the specified peak and lifetime`, () => {
      const e = loneEnemy("snapjaw", 0, 23);
      friend("bubbo");
      if (upgrade) setGame(g => ({ progress: { ...g.progress, act2: { ...g.progress.act2, upgrades: ["bubbo"] } } }));
      expect(basicAttack()).toBe(true);
      advanceCombat(.3);
      expect(e.control).toMatchObject({ kind: "trapped", peak: upgrade ? 2.4 : .8 });
      const duration = e.control!.until - e.control!.t0;
      expect(duration).toBeCloseTo(upgrade ? 1.9 : 1);
      advanceCombat(upgrade ? 2 : 1.1);
      expect(e.control).toBeNull();
      expect(e.hp).toBe(upgrade ? 69 : 82); // six contact plus fall damage
      expect(e.resistUntil).toBeGreaterThan(rt.time);
    });
  }

  it("trapping cancels ranged wind-ups and stops enemy actions while rising", () => {
    const e = loneEnemy("forestSpitter", 0, 23.5);
    e.state = "windup"; e.timer = .7;
    friend("bubbo");
    expect(basicAttack()).toBe(true);
    advanceCombat(.35);
    expect(e.control?.kind).toBe("trapped");
    const location = { x: e.x, z: e.z };
    advanceCombat(.6);
    expect(e).toMatchObject(location);
    expect(e.air).toBeGreaterThan(0);
    expect(cb.shots.some(s => s.hostile)).toBe(false);
    expect(cb.vitals.hp).toBe(100);
  });

  it("a fourth actual trap pops the oldest using its current height", () => {
    const e = loneEnemy("gloomlet", 0, 23);
    const older = extra(1, "gloomlet", 2, 25), mid = extra(2, "gloomlet", -2, 25), newest = extra(3, "gloomlet", 3, 26);
    for (const [i, target] of [older, mid, newest].entries()) {
      target.control = { kind: "trapped", t0: rt.time - .6 + i * .1, until: rt.time + 1.3 + i * .1, peak: 2.4 };
      target.air = 2.4 * (.6 - i * .1) / 1.1;
    }
    friend("bubbo");
    expect(basicAttack()).toBe(true);
    advanceCombat(.2);
    expect(e.control?.kind).toBe("trapped");
    expect(older.control).toBeNull();
    expect(older.hp).toBeLessThan(100);
    expect(cb.enemies.filter(e => e.control?.kind === "trapped")).toHaveLength(3);
  });

  it("a resisted control still takes damage and knock, emits shrug, and keeps acting", () => {
    const e = loneEnemy("snapjaw", 0, 23);
    e.resistUntil = rt.time + 2;
    friend("puff");
    expect(basicAttack()).toBe(true);
    expect(e.hp).toBe(95);
    expect(e.control).toBeNull();
    expect(e.kz).toBe(6);
    expect(cb.fx.some(f => f.kind === "shrug")).toBe(true);
    advanceCombat(.1);
    expect(e.z).toBeGreaterThan(23);
  });

  it("burn and control clocks pause with the journal rather than catching up on resume", () => {
    const e = loneEnemy("snapjaw", 0, 23);
    friend("bubbo");
    expect(basicAttack()).toBe(true);
    advanceCombat(.3);
    expect(e.control?.kind).toBe("trapped");
    friend("ember");
    expect(basicAttack()).toBe(true);
    const hp = e.hp, air = e.air;
    setGame({ journalOpen: true });
    advanceCombat(3);
    expect(e.hp).toBe(hp); expect(e.air).toBe(air);
    setGame({ journalOpen: false });
    advanceCombat(.1);
    expect(e.hp).toBe(hp);
    expect(e.control?.kind).toBe("trapped");
    advanceCombat(.25);
    expect(e.hp).toBe(hp - 2);
  });

  for (const [kind, knock] of [["gloomlet", 9], ["snapjaw", 6], ["shellback", 2], ["thunderBeetle", 2]] as const) {
    it(`Wind Blast gives ${kind} its weight-class knock without lifting it`, () => {
      const e = loneEnemy(kind, 0, 23);
      friend("puff");
      expect(basicAttack()).toBe(true);
      expect(e.hp).toBe(95); expect(e.kz).toBe(knock);
      expect(e.control?.kind).toBe("flung"); expect(e.air).toBe(0);
    });
  }

  it("Vine Grab excludes behind and through-solid targets", () => {
    const e = loneEnemy("snapjaw", 0, 19);
    friend("leafy");
    expect(pickTarget(4.5)).toBeNull();
    expect(basicAttack()).toBe(true);
    expect(e.hp).toBe(100);
    // A coast rock at (-6,32), radius 2.2, blocks this four-metre segment.
    Object.assign(rt.player, { x: -6, z: 30, yaw: 0 });
    Object.assign(e, { x: -6, z: 34 });
    cb.ready.basic = 0;
    expect(pickTarget(4.5)).toBeNull();
    expect(basicAttack()).toBe(true);
    expect(e.hp).toBe(100);
    expect(e.control).toBeNull();
  });

  it("one Vine Grab press swings then flings along the locked tangent", () => {
    const e = loneEnemy("snapjaw", 0, 23);
    friend("leafy");
    expect(basicAttack()).toBe(true);
    expect(e.hp).toBe(92); expect(e.control?.kind).toBe("grabbed");
    rt.player.yaw = Math.PI;
    advanceCombat(.46);
    expect(e.control?.kind).toBe("flung");
    expect(e.kx).toBeGreaterThan(0); expect(e.kz).toBeLessThan(0);
    advanceCombat(.55);
    expect(e.control).toBeNull();
    expect(e.resistUntil).toBeGreaterThan(rt.time);
  });

  it("Double Grab bashes the nearest two for fourteen and a second of stun", () => {
    const a = loneEnemy("snapjaw", -.5, 23), b = extra(1, "snapjaw", .5, 23);
    friend("leafy");
    setGame(g => ({ progress: { ...g.progress, act2: { ...g.progress.act2, upgrades: ["leafy"] } } }));
    expect(basicAttack()).toBe(true);
    expect([a.control?.kind, b.control?.kind]).toEqual(["grabbed", "grabbed"]);
    advanceCombat(.36);
    expect([a.hp, b.hp]).toEqual([86, 86]);
    expect([a.state, b.state]).toEqual(["stun", "stun"]);
    expect(a.timer).toBeGreaterThan(.95);
  });

  it("flung weapons hit each victim once and take recoil damage", () => {
    const weapon = loneEnemy("snapjaw", 0, 22.5), victim = extra(1, "snapjaw", 0, 25.6);
    friend("puff");
    expect(basicAttack()).toBe(true);
    expect(weapon.control?.kind).toBe("flung");
    expect(victim.hp).toBe(100); // outside the five metre blast
    advanceCombat(.6);
    expect(weapon.hp).toBe(89);
    expect(victim.hp).toBe(90);
  });

  it("fast wall impacts add eight damage and .6 seconds stun", () => {
    const e = loneEnemy("snapjaw", -6, 28.5);
    Object.assign(rt.player, { x: -6, z: 25.5, yaw: 0 });
    friend("puff");
    expect(basicAttack()).toBe(true);
    advanceCombat(.4);
    expect(e.hp).toBe(87);
    expect(e.control).toBeNull();
    expect(e.state).toBe("stun");
    expect(e.timer).toBeGreaterThan(0);
    expect(e.kx).toBe(0); expect(e.kz).toBe(0);
  });

  it("Wind Blast pops a pushed bubble on another enemy, using its current air", () => {
    const e = loneEnemy("snapjaw", 0, 23), other = extra(1, "snapjaw", 0, 25.6);
    e.control = { kind: "trapped", t0: rt.time - .4, until: rt.time + 1.5, peak: 2.4 }; e.air = .8;
    friend("puff");
    expect(basicAttack()).toBe(true);
    expect(e.control).toBeNull();
    expect(e.hp).toBe(83); // five direct plus round(6+8*.8)
    expect(e.air).toBe(.8); expect(e.fall).not.toBeNull();
    expect(other.hp).toBe(92);
    advanceCombat(.4);
    expect(e.air).toBe(0);
  });

  it("Wind Blast pops a pushed bubble on a solid without losing its current height", () => {
    const e = loneEnemy("snapjaw", -6, 28.5);
    Object.assign(rt.player, { x: -6, z: 25.5, yaw: 0 });
    e.control = { kind: "trapped", t0: rt.time - .4, until: rt.time + 1.5, peak: 2.4 }; e.air = .8;
    friend("puff");
    expect(basicAttack()).toBe(true);
    expect(e.control).toBeNull(); expect(e.air).toBe(.8); expect(e.hp).toBe(83);
    expect(e.z).toBeLessThan(29.5);
  });

  it("hazard KO records the original stage credit and produces ordinary rewards", () => {
    changeWorld("home");
    for (const enemy of cb.enemies) enemy.state = "gone";
    const e = cb.enemies.find(e => e.zone === "grove")!;
    Object.assign(e, { kind: "snapjaw", x: POND.x + POND.r + .2, z: POND.z, hp: 100, state: "recover", timer: 99 });
    Object.assign(rt.player, { x: e.x + 2, z: e.z, yaw: -Math.PI / 2 });
    cb.zones.current = "grove";
    cb.zones.defeated.grove = cb.enemies.filter(o => o.zone === "grove" && o !== e).map(o => o.i);
    friend("puff");
    expect(basicAttack()).toBe(true);
    advanceCombat(.15);
    expect(e.state).toBe("ko");
    expect(cb.zones.defeated.grove).toContain(e.i);
    expect(getGame().progress.act2.cleared).toContain("grove");
    expect(cb.drops.some(d => d.kind === "coin")).toBe(true);
    expect(cb.fx.some(f => f.kind === "splashKo")).toBe(true);
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
      if (blockedBy === "unreachable ground") {
        Object.assign(e, { x: 8, z: 17, homeX: 8, homeZ: 17 });
        expect(isWalkable(e.x,e.z,gatesOf(getGame().progress),ENEMIES[e.kind].radius)).toBe(false);
      }
      if (blockedBy === "solid line of sight") {
        // The coast rock at (-6, 32) stands between them.
        Object.assign(rt.player, { x: -1, z: 34, y: cloudY(-1, 34) });
        Object.assign(e, { x: -9, z: 28, homeX: -9, homeZ: 28 });
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
    return { id: 9000, shape: "hostile", owner: "puff", hostile: true, source: 0, x, y: 10, z, y1: 10,
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
    expect(e.hp).toBe(44);
    expect(e.control?.kind).toBe("grabbed");
  });

  it("keeps electric panels safe before their pulse, then deals light damage without knock-back", () => {
    for (const e of cb.enemies) e.state = "gone";
    Object.assign(rt.player, { x: 32.5, z: 370 }); // the first electric panel
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
    expect(rt.player).toMatchObject({ x: 32.5, z: 370 });
  });

  it("damages a fifth sleeping enemy without waking a fifth attacker", () => {
    cb.enemies.forEach((e, i) => Object.assign(e, { kind: "stormCrab", x: 0, z: 22, yaw: 0, hp: 100, state: i < 4 ? "windup" : i === 4 ? "idle" : "gone" }));
    cb.stance.friend = "ember";
    cb.stance.k = 1;
    expect(basicAttack()).toBe(true);
    expect(cb.enemies[4].hp).toBe(93);
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

describe("elemental K simulation and shared combinations", () => {
  beforeEach(() => vi.stubGlobal("window", { setTimeout: vi.fn(() => 1), clearTimeout: vi.fn() }));
  afterEach(() => vi.unstubAllGlobals());

  function friend(id: CompanionId) {
    setGame(g => ({ progress: { ...g.progress, active: id } }));
    cb.stance.friend = id; cb.stance.k = 1; cb.ready.basic = cb.ready.special = 0;
  }
  function extra(i: number, kind: EnemyKind, x: number, z: number) {
    const e = cb.enemies[i];
    Object.assign(e, { kind, x, z, homeX: x, homeZ: z, zone: "stormbreakCoast", hp: 100, state: "recover", timer: 99 });
    return e;
  }
  function bubble(e: ReturnType<typeof loneEnemy>, air: number) {
    const t0 = rt.time - air / 2.4 * 1.1;
    e.control = { kind: "trapped", t0, until: t0 + 1.9, peak: 2.4 };
    e.air = air;
  }
  /** Launch a real bomb, then put it at the end of its authored range. */
  function bombAt(x: number, z: number) {
    friend("bubbo");
    expect(specialAttack()).toBe(true);
    const s = cb.shots.find(s => s.shape === "bomb")!;
    Object.assign(s, { x, z, vx: 0, vz: 0, age: s.life - .001 });
    combatTick(.001);
  }

  it("Inferno tap lasts 1.2 seconds, ticks every quarter second and halves walking speed", () => {
    const e = loneEnemy("snapjaw", 0, 23);
    friend("ember");
    const speed = speedScale();
    expect(specialAttack()).toBe(true);
    expect(cb.vitals.mp.ember).toBe(85);
    expect(speedScale()).toBe(speed * .5);
    expect(e.hp).toBe(94);
    advanceCombat(.2);
    expect(e.hp).toBe(94);
    advanceCombat(.05);
    expect(e.hp).toBe(88);
    advanceCombat(.9);
    expect(cb.inferno).not.toBeNull();
    advanceCombat(.07);
    expect(cb.inferno).toBeNull();
    expect(e.hp).toBe(64); // five flame ticks plus three burn ticks
    expect(speedScale()).toBe(speed);
  });

  it("held Inferno follows current facing, drains MP and ends at three seconds", () => {
    const a = loneEnemy("snapjaw", 0, 23), b = extra(1, "snapjaw", 3, 20);
    a.hp = b.hp = 1000;
    friend("ember"); cb.holdK = true;
    expect(specialAttack()).toBe(true);
    advanceCombat(.5);
    const hp = a.hp;
    rt.player.yaw = Math.PI / 2;
    advanceCombat(.25);
    expect(b.hp).toBe(994);
    expect(a.hp).toBe(hp - 2); // burn continues outside the cone
    advanceCombat(2.25);
    expect(cb.inferno).toBeNull();
    expect(cb.vitals.mp.ember).toBeCloseTo(100 - 15 - 36 + MP_REGEN * 3);
    const remaining = b.hp;
    b.burn = null;
    advanceCombat(.3);
    expect(b.hp).toBe(remaining);
  });

  it("Inferno spends available held MP but preserves the prepaid minimum burst", () => {
    loneEnemy(); friend("ember"); cb.holdK = true; cb.vitals.mp.ember = 15;
    expect(specialAttack()).toBe(true);
    advanceCombat(1);
    expect(cb.inferno).not.toBeNull();
    advanceCombat(.22);
    expect(cb.inferno).toBeNull();
    expect(cb.vitals.mp.ember).toBeLessThan(.2);
  });

  it("Bubble Bomb pops each overlapping bubble once and applies only one burst hit per chain", () => {
    const a = loneEnemy("snapjaw", 0, 24), b = extra(1, "snapjaw", 1, 24), victim = extra(2, "snapjaw", .5, 25);
    bubble(a, .8); bubble(b, 2.4);
    bombAt(0, 24);
    expect(a.hp).toBe(100 - 12 - 22 - 8);
    expect(b.hp).toBe(100 - 25 - 22 - 8);
    expect(victim.hp).toBe(100 - 22 - 8);
    expect(a.control).toBeNull(); expect(b.control).toBeNull();
    expect(a.fall?.from).toBeCloseTo(.8); expect(b.fall?.from).toBeCloseTo(2.4);
    expect(cb.bombChain?.pops).toHaveLength(2);
    expect(new Set(cb.bombChain?.victims).size).toBe(cb.bombChain?.victims.length);
    expect(Math.hypot(victim.kx, victim.kz)).toBeCloseTo(4);
  });

  it("ends a bomb after its first detonation under trapped bubbles", () => {
    const a = loneEnemy("gloomlet", 0, 24), b = extra(1, "gloomlet", 1, 24);
    bubble(a, .8); bubble(b, .8);
    friend("bubbo");
    expect(specialAttack()).toBe(true);
    const shot = cb.shots.find(s => s.shape === "bomb")!;
    Object.assign(shot, { x: 0, z: 24, vx: 0, vz: 0 });
    combatTick(.01);
    const id = cb.bombChain?.id;
    expect(id).toBeDefined();
    expect(cb.bombChain?.pops).toHaveLength(2);
    expect(cb.shots).not.toContain(shot);
    advanceCombat(1);
    expect(cb.bombChain?.id).toBe(id);
    expect(cb.shots).not.toContain(shot);
  });

  it("Bubble Bomb propagates beyond the bomb radius through three generations", () => {
    const a = loneEnemy("snapjaw", 0, 24), b = extra(1, "snapjaw", 0, 26), c = extra(2, "snapjaw", 0, 28);
    for (const e of [a, b, c]) bubble(e, .8);
    bombAt(0, 22);
    expect(cb.bombChain?.pops).toEqual([{ i: a.i, depth: 1 }, { i: b.i, depth: 2 }, { i: c.i, depth: 3 }]);
    expect(c.control).toBeNull(); expect(c.hp).toBe(80);
  });

  it("Root Snare cannot be extended or knocked back and holds targets in Ember's cone", () => {
    const e = loneEnemy("gloomlet", 0, 24);
    friend("leafy");
    expect(specialAttack()).toBe(true);
    const until = e.control!.until;
    expect(until - rt.time).toBe(3.5);
    advanceCombat(.3);
    cb.ready.special = 0;
    expect(specialAttack()).toBe(true);
    expect(e.control?.until).toBe(until);
    friend("puff"); expect(basicAttack()).toBe(true);
    expect(e.control?.kind).toBe("snared");
    expect(e.kx).toBe(0); expect(e.kz).toBe(0);
    friend("ember"); expect(specialAttack()).toBe(true);
    advanceCombat(.6);
    expect(e.z).toBe(24); expect(e.hp).toBeLessThan(70);
    advanceCombat(2.7);
    expect(e.control).toBeNull();
    expect(e.resistUntil).toBeGreaterThan(rt.time);
  });

  it("Root Snare cancels ranged wind-up and gives medium enemies 2.5 seconds", () => {
    const e = loneEnemy("raiderShooter", 0, 24);
    e.state = "windup"; e.timer = .1;
    friend("leafy"); expect(specialAttack()).toBe(true);
    expect(e.control!.until - rt.time).toBe(2.5);
    advanceCombat(.2);
    expect(cb.shots).toHaveLength(0);
    expect(e.z).toBe(24);
  });

  it("heavy Root Snare slows walking by 60 percent without preventing attacks", () => {
    const e = loneEnemy("shellback", 0, 26);
    e.state = "chase";
    friend("leafy"); expect(specialAttack()).toBe(true);
    expect(e.control).toBeNull(); expect(e.slowUntil).toBe(rt.time + 2);
    const until = e.slowUntil;
    cb.ready.special = 0;
    expect(specialAttack()).toBe(true);
    expect(e.slowUntil).toBe(until);
    const z = e.z;
    advanceCombat(.1);
    expect(z - e.z).toBeCloseTo(ENEMIES.shellback.speed * .4 * .1);
    Object.assign(e, { z: 21.8, state: "windup", timer: .01, dx: 0, dz: -1 });
    advanceCombat(.04);
    expect(e.state).toBe("lunge");
    advanceCombat(2);
    expect(e.slowUntil).toBe(0); expect(e.resistUntil).toBeGreaterThan(rt.time);
  });

  it("Cyclone carries at most three lights, keeps its launch direction, then flings passengers", () => {
    const a = loneEnemy("gloomlet", 0, 22);
    extra(1, "gloomlet", .2, 22); extra(2, "gloomlet", -.2, 22); const fourth = extra(3, "gloomlet", 0, 22.2);
    friend("puff"); expect(specialAttack()).toBe(true);
    expect(cb.enemies.filter(e => e.control?.kind === "carried")).toHaveLength(3);
    expect(fourth.control).toBeNull(); expect(a.air).toBe(1.2);
    rt.player.yaw = Math.PI / 2;
    advanceCombat(1);
    expect(cb.cyclone?.x).toBeCloseTo(0); expect(cb.cyclone?.z).toBeCloseTo(23.8);
    fourth.state = "gone";
    advanceCombat(3);
    expect(cb.cyclone).toBeNull();
    expect(a.control?.kind).toBe("flung");
    const start = { x: a.x, z: a.z };
    advanceCombat(.58);
    expect(Math.hypot(a.x - start.x, a.z - start.z)).toBeGreaterThan(3.5);
  });

  it("Cyclone reflects hostile shots into six-damage friendly shots", () => {
    loneEnemy("snapjaw", 0, 26);
    friend("puff"); expect(specialAttack()).toBe(true);
    const shot: Shot = { id: 999, shape: "hostile", owner: "puff", hostile: true, source: 1, x: 0, z: 22, y: 3, y1: 3, vx: 0, vz: -3.2, life: 4, age: 0, radius: .42, damage: 10, knock: 0, stun: 0, size: 1 };
    cb.shots.push(shot);
    advanceCombat(.01);
    expect(shot.hostile).toBe(false); expect(shot.vz).toBe(3.2); expect(shot.damage).toBe(6);
    expect(shot.source).toBeUndefined();
    const target = cb.enemies[0];
    target.z = 25; target.homeZ = 25;
    advanceCombat(.7);
    expect(target.hp).toBe(94); expect(cb.vitals.hp).toBe(100);
  });

  it("Cyclone pushes medium enemies with four damage per second and heavies at one metre per second", () => {
    const medium = loneEnemy("snapjaw", 1, 22), heavy = extra(1, "shellback", -1, 22);
    friend("puff"); expect(specialAttack()).toBe(true);
    advanceCombat(.05);
    expect(medium.hp).toBeCloseTo(99.8); expect(medium.x).toBeGreaterThan(1);
    expect(heavy.hp).toBe(100); expect(heavy.x).toBeCloseTo(-1.05, 2);
    expect(medium.control).toBeNull(); expect(heavy.control).toBeNull(); expect(heavy.air).toBe(0);
  });

  it("Wind Blast can redirect Vine Grab's fling, but cannot extend it during resistance", () => {
    const e = loneEnemy("snapjaw", 0, 23);
    friend("leafy"); expect(basicAttack()).toBe(true);
    advanceCombat(.46);
    expect(e.control?.kind).toBe("flung");
    Object.assign(rt.player, { x: e.x, z: e.z - 3, yaw: 0 });
    friend("puff"); expect(basicAttack()).toBe(true);
    expect(e.kx).toBe(0); expect(e.kz).toBe(6);
    expect(e.control?.until).toBeCloseTo(rt.time + .6);
    e.resistUntil = rt.time + 2;
    const until = e.control!.until;
    cb.ready.basic = 0;
    rt.player.yaw = .1;
    expect(basicAttack()).toBe(true);
    expect(e.control?.until).toBe(until);
    expect(e.hp).toBe(82);
  });

  it("Cyclone carries a trapped bubble past its ordinary expiry and pops on replacement", () => {
    const e = loneEnemy("snapjaw", 0, 22);
    bubble(e, .8); e.control!.until = rt.time + .1;
    friend("puff"); expect(specialAttack()).toBe(true);
    expect(cb.cyclone?.bubbles).toEqual([e.i]);
    advanceCombat(.5);
    expect(e.control?.kind).toBe("trapped"); expect(e.air).toBe(.8);
    const id = cb.cyclone!.id;
    cb.ready.special = 0;
    expect(specialAttack()).toBe(true);
    expect(cb.cyclone!.id).not.toBe(id);
    expect(e.control).toBeNull(); expect(e.hp).toBe(88);
  });

  it("Cyclone stops at a solid and pops its carried bubble there", () => {
    const e = loneEnemy("snapjaw", -6, 27.5);
    Object.assign(rt.player, { x: -6, z: 25.5 }); bubble(e, .8);
    friend("puff"); expect(specialAttack()).toBe(true);
    expect(cb.cyclone?.bubbles).toContain(e.i);
    // Observe the pop itself before the now-free medium takes cyclone damage.
    for (let n = 0; n < 120 && e.control?.kind === "trapped"; n++) advanceCombat(1 / 60);
    expect(e.control).toBeNull(); expect(e.hp).toBe(88);
    expect(e.fall?.from).toBeCloseTo(.8);
    for (let n = 0; n < 120 && !cb.cyclone?.stopped; n++) advanceCombat(1 / 60);
    expect(cb.cyclone?.stopped).toBe(true);
    expect(e.control).toBeNull(); expect(e.hp).toBeLessThanOrEqual(88);
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
    Object.assign(rt.player, { x: -7, z: BEACON_PYLONS[0].z - 5, y: BEACON.y, yaw: 0, speed: 0 });
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
    advance(.65);
    expect(cb.beacon.power).toBe(3);
    expect(cb.beacon.pylons[0].phase).toBe("shielded");
    expect(cb.shots).toHaveLength(0);
    cb.beacon.pylons[0].phase = "charging";
    expect(basicAttack()).toBe(true);
    expect(cb.beacon.pylons[0].phase).toBe("charging");
    advance(.65);
    expect(cb.beacon.pylons[0]).toMatchObject({ phase: "exposed", shorted: true });
    expect(cb.beacon.power).toBe(3);
    expect(basicAttack()).toBe(true);
    advance(.65);
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
      advance(.65);
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
    Object.assign(rt.player, { x: -7, z: BEACON_PYLONS[0].z - 2.5 });
    cb.beacon.pylons[0].phase = "exposed";
    expect(basicAttack()).toBe(true);
    expect(cb.beacon.power).toBe(2);
    expect(cb.shots).toHaveLength(0);
  });

  it("Puff's attack must point along the gust to cancel its real push", () => {
    enterArena("puff");
    // Far enough from pylons to preserve the intended attack direction.
    Object.assign(rt.player, { x: 0, z: BEACON.z - 12, yaw: -Math.PI / 2 });
    cb.beacon.attack = "gustTell"; cb.beacon.timer = 1; cb.beacon.gust = { x: 1, z: 0 };
    expect(basicAttack()).toBe(true);
    expect(cb.beacon.gustCancelled).toBe(false);
    advance(.6);
    rt.player.yaw = Math.PI / 2;
    expect(basicAttack()).toBe(true);
    expect(cb.beacon.gustCancelled).toBe(true);
    const position = { x: rt.player.x, z: rt.player.z };
    advance(.7);
    expect(cb.beacon.attack).toBe("calm");
    expect(rt.player).toMatchObject(position);
  });

  it("Bubble Bomb shorts a charging pylon only when its projectile arrives", () => {
    enterArena("bubbo"); cb.vitals.mp.bubbo = 0;
    cb.beacon.pylons[0].phase = "charging";
    expect(specialAttack()).toBe(true);
    expect(cb.beacon.pylons[0].phase).toBe("charging");
    advance(.5);
    expect(cb.beacon.pylons[0]).toMatchObject({ phase: "exposed", shorted: true });
    expect(cb.beacon.power).toBe(3);
    expect(cb.bombChain).not.toBeNull();
  });

  for (const friend of ["leafy", "bubbo", "ember", "puff"] as const) {
    it(`${friend}'s K area downs an exposed pylon with zero MP`, () => {
      enterArena(friend);
      Object.assign(rt.player, { x: -7, z: BEACON_PYLONS[0].z - 4 });
      cb.vitals.mp[friend] = 0; cb.beacon.pylons[0].phase = "exposed";
      expect(specialAttack()).toBe(true);
      advance(.6);
      expect(cb.beacon.pylons[0].phase).toBe("down");
      expect(cb.beacon.power).toBe(2);
    });
  }

  it("Cyclone cancels a gust only along its firing direction and held Inferno stays free", () => {
    enterArena("puff");
    Object.assign(rt.player, { x: 0, z: BEACON.z - 9, yaw: -Math.PI / 2 });
    cb.beacon.attack = "gustTell"; cb.beacon.timer = 99; cb.beacon.gust = { x: 1, z: 0 };
    expect(specialAttack()).toBe(true);
    expect(cb.beacon.gustCancelled).toBe(false);
    rt.player.yaw = Math.PI / 2; cb.ready.special = 0;
    expect(specialAttack()).toBe(true);
    expect(cb.beacon.gustCancelled).toBe(true);
    setGame(g => ({ progress: { ...g.progress, active: "ember" } }));
    cb.stance.friend = "ember"; cb.ready.special = 0; cb.holdK = true; cb.vitals.mp.ember = 0;
    expect(specialAttack()).toBe(true);
    advance(2);
    expect(cb.inferno?.age).toBeCloseTo(2);
    expect(cb.vitals.mp.ember).toBeCloseTo(MP_REGEN * 2);
  });

  it("keeps beacon specials free while spending MP on the coast", () => {
    enterArena("leafy");
    Object.assign(rt.player, { x: -7, z: BEACON_PYLONS[0].z - 4 });
    cb.vitals.mp.leafy = 0; cb.beacon.pylons[0].phase = "exposed";
    expect(specialAttack()).toBe(true);
    expect(cb.beacon.power).toBe(2);
    expect(cb.vitals.mp.leafy).toBe(0);
    Object.assign(rt.player, { x: 0, z: 20, y: 2 });
    cb.cloudZones.current = "stormbreakCoast";
    cb.ready.special = 0;
    expect(specialAttack()).toBe(false);
    cb.vitals.mp.leafy = 30;
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
