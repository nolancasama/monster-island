import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { basicAttack, cb, combatTick, crabDamage, enemyRevealScale, hooks, isRanged, pickTarget, resetBeaconFight, resetCombat, specialAttack, speedScale, travelCombat, wakeUp, type Shot } from "./combat";
import { newProgress } from "./logic/progress";
import { getGame, setGame } from "./store";
import { rt } from "./runtime";
import { region } from "./world/region";
import { COMBAT, ENEMIES, MP_REGEN, type CompanionId, type EnemyKind } from "./data/combat";
import { BEACON_PYLONS } from "./logic/beacon";
import { BEACON, CLOUD_ENEMY_SPAWNS, cloudY } from "./world/cloudisle";
import { ENEMY_SPAWNS, GROVE_DOOR, POND } from "./world/lowland";
import { MONSTERS } from "./data/monsters";
import { PLAYER_R, gatesOf, isWalkable, nearestWalkable, standY } from "./world/collision";
import { run } from "./flow/script";
import { audio } from "../audio/audio";
import { pressAttack, releaseAttack } from "../input/attackInput";
import { hazardAt } from "./logic/elements";
import { ELEMENT_OBJECTS } from "./world/elementObjects";
import { waterAt } from "./logic/water";
import { startPanic } from "./logic/panic";

vi.mock("../audio/audio", () => ({ audio: { play: vi.fn(), voice: vi.fn(), startMusic: vi.fn(), cancelPanic: vi.fn() } }));

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

describe("held Fire Breath and burning panic", () => {
  function setup(controlled = false) {
    const e = loneEnemy("snapjaw", 0, 23);
    e.hp = 1000;
    e.burn = e.panic = e.control = null;
    e.fireTicks = e.panicResistUntil = 0; e.lastFireT = -10;
    if (controlled) e.control = { kind: "snared", t0: rt.time, until: rt.time + 20 };
    setGame(g => ({ progress: { ...g.progress, active: "ember" } }));
    cb.stance.friend = "ember"; cb.stance.k = 1;
    return e;
  }

  it("deals identical held-second damage at 30 fps, 8 fps and frames crossing multiple ticks", () => {
    const damages: number[] = [];
    for (const frames of [Array(30).fill(1 / 30), Array(8).fill(1 / 8), [.6, .4]]) {
      rt.time = 10;
      cb.breath = null; cb.ready.basic = 0;
      const e = setup(true);
      cb.hold = true;
      expect(basicAttack()).toBe(true);
      for (const dt of frames) { rt.time += dt; combatTick(dt); }
      damages.push(1000 - e.hp);
      expect(e.fireTicks).toBe(5);
    }
    expect(damages).toEqual([17, 17, 17]);
  });

  it("a native tap ticks once and releases synchronously without hit sounds or hit FX", () => {
    const e = setup();
    vi.mocked(audio.play).mockClear();
    pressAttack("basic", "key");
    expect(e.hp).toBe(997);
    releaseAttack("basic", "key");
    expect(cb.breath).toBeNull();
    advanceCombat(.4);
    expect(e.hp).toBe(997);
    expect(e.burn).toBeNull();
    expect(cb.fx.some(f => f.kind === "hit" || f.kind === "breath")).toBe(false);
    expect(vi.mocked(audio.play).mock.calls.some(([s]) => s === "hit")).toBe(false);
  });

  it("requires three exposures, resets after a second away, and never extends panic", () => {
    const e = setup();
    cb.hold = true;
    basicAttack();
    advanceCombat(.25);
    expect(e.fireTicks).toBe(2); expect(e.burn).toBeNull();
    rt.player.yaw = Math.PI;
    advanceCombat(1.05);
    expect(e.fireTicks).toBe(0);
    rt.player.yaw = 0;
    advanceCombat(.5);
    expect(e.burn).toBeNull();
    advanceCombat(.25);
    expect(e.panic).not.toBeNull();
    const until = e.panic!.until;
    // Repeated Inferno ignition refreshes burn but cannot restart or extend panic.
    cb.ready.special = 0;
    specialAttack();
    expect(e.panic!.until).toBe(until);
  });

  it("Inferno ignites immediately, cancels a ranged tell and disperses its shot", () => {
    const e = setup();
    e.kind = "forestSpitter"; e.state = "windup"; e.timer = .7;
    cb.shots.push({ id: 999, shape: "hostile", owner: "puff", hostile: true, source: e.i,
      x: 0, y: 1, z: 24, y1: 1, vx: 0, vz: -3, life: 4, age: 0, radius: .4, damage: 5, knock: 0, stun: 0, size: 1 });
    specialAttack();
    expect(e.panic).not.toBeNull(); expect(e.burn).not.toBeNull();
    expect(e.state).toBe("chase"); expect(e.timer).toBe(0);
    expect(cb.shots[0].life).toBe(0);
    expect(e.infernoBlueUntil).toBeCloseTo(rt.time + .6);
    const blueUntil = e.infernoBlueUntil;
    advanceCombat(.3);
    expect(e.infernoBlueUntil).toBe(blueUntil);
    advanceCombat(.35);
    expect(e.infernoBlueUntil).toBeLessThan(rt.time);
    expect(e.burn).not.toBeNull();
  });

  it("pauses panic/exposure, expires under control and grants four-second resistance", () => {
    const e = setup();
    specialAttack();
    const until = e.panic!.until;
    setGame({ journalOpen: true });
    advanceCombat(2);
    expect(e.panic!.until).toBeCloseTo(until + 2);
    expect(cb.inferno).toBeNull();
    setGame({ journalOpen: false });
    e.control = { kind: "snared", t0: rt.time, until: rt.time + 10 };
    advanceCombat(2.55);
    expect(e.panic).toBeNull();
    expect(e.panicResistUntil - rt.time).toBeCloseTo(4, 0);
    e.control = null;
    cb.ready.special = 0;
    specialAttack();
    expect(e.burn).not.toBeNull(); expect(e.panic).toBeNull();
  });

  it("controlled ranged enemies burn without panic or losing their released shots", () => {
    const e = setup(true); e.kind = "forestSpitter";
    const shot: Shot = { id: 998, shape: "hostile", owner: "puff", hostile: true, source: e.i,
      x: 0, y: 4, z: 26, y1: 4, vx: 1, vz: 0, life: 4, age: 0, radius: .4, damage: 5, knock: 0, stun: 0, size: 1 };
    cb.shots.push(shot);
    specialAttack();
    expect(e.panic).toBeNull(); expect(e.burn).not.toBeNull();
    advanceCombat(.4);
    expect(e.hp).toBeLessThan(994);
    expect(shot.life).toBe(4);
  });

  it.each(["release", "friend", "zone", "dialogue", "knockout"])("stops breath on %s and stops a blocked Inferno permanently", reason => {
    setup(); cb.hold = true; basicAttack();
    if (reason === "release") cb.hold = false;
    if (reason === "friend") setGame(g => ({ progress: { ...g.progress, active: "puff" } }));
    if (reason === "zone") rt.player.z = 5;
    if (reason === "dialogue") setGame({ line: { by: "Maple", en: "Wait!", ja: "まって!" } } as never);
    if (reason === "knockout") cb.knockedOut = true;
    combatTick(.01);
    expect(cb.breath).toBeNull();
    setGame({ line: null }); cb.knockedOut = false;
  });

  it("a fire KO still records defeat and drops normal rewards", () => {
    const e = setup(); e.hp = 3;
    basicAttack();
    expect(e.state).toBe("ko"); expect(e.panic).toBeNull();
    expect(cb.cloudZones.defeated.stormbreakCoast).toContain(e.i);
    expect(cb.drops.some(d => d.kind === "coin")).toBe(true);
  });

  it("discards an Inferno burst as soon as dialogue opens, without resuming it", () => {
    setup(); specialAttack();
    expect(cb.inferno).not.toBeNull();
    setGame({ line: { id: 1, by: "maple", en: "Wait!" } });
    expect(cb.inferno).toBeNull();
    setGame({ line: null });
    advanceCombat(.5);
    expect(cb.inferno).toBeNull();
  });
});

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

describe("Grove door combat boundary and retired Causeway encounters", () => {
  it.each([
    { from: -247, to: -239, before: "causeway", after: "grove", threshold: GROVE_DOOR.z + 1, direction: 1 },
    { from: -239, to: -247, before: "grove", after: "causeway", threshold: GROVE_DOOR.z - 1, direction: -1 },
  ] as const)("retains $before until one metre through the door toward $after", ({ from, to, before, after, threshold, direction }) => {
    changeWorld("home");
    region.layer = "ground";
    setGame({ settingsOpen: true }); // Zone transitions still run; enemy AI stays paused.
    Object.assign(rt.player, { x: 56, z: from });
    cb.zones.current = before;
    const e = cb.enemies.find(e => e.zone === before && !e.retired)!;
    Object.assign(e, { state: "idle", x: e.homeX + .5, hp: 1 });
    for (let i = 0; i <= 80; i++) {
      const z = from + (to - from) * i / 80;
      rt.player.z = z;
      combatTick(0);
      expect(cb.zones.current, `${z}`).toBe((z - threshold) * direction > 1e-9 ? after : before);
      if ((z - threshold) * direction <= 1e-9) expect(e.hp).toBe(1);
    }
    expect(e.x).toBe(e.homeX);
    expect(e.hp).toBe(ENEMIES[e.kind].hp);
    e.hp = 2;
    // Returning to and hovering on the plane retains the new zone without sendHome.
    for (const z of [GROVE_DOOR.z, GROVE_DOOR.z + .01, GROVE_DOOR.z - .01, GROVE_DOOR.z]) {
      rt.player.z = z;
      combatTick(0);
      expect(cb.zones.current).toBe(after);
      expect(e.hp).toBe(2);
    }
  });

  it("keeps retired slots inert through reset, zone activation, respawn and world travel", () => {
    changeWorld("home");
    region.layer = "ground";
    resetCombat();
    const retired = cb.enemies.filter(e => e.retired);
    expect(retired.map(e => e.i)).toEqual([17, 20, 21, 44, 46, 47]);
    for (const e of retired) {
      Object.assign(rt.player, { x: e.x, z: e.z });
      combatTick(.2);
      expect(e.state).toBe("gone");
      expect(e.spawnT).toBeNull();
      expect(enemyRevealScale(e)).toBe(0);
    }
    cb.zones.current = "grove";
    cb.zones.leftAt.causeway = rt.playTime - 13;
    cb.zones.defeated.causeway = retired.map(e => e.i);
    Object.assign(rt.player, { x: 84.5, z: -254.5 });
    combatTick(0);
    expect(cb.enemies.filter(e => e.retired).every(e => e.state === "gone")).toBe(true);
    changeWorld("cloud");
    changeWorld("home");
    expect(cb.enemies.filter(e => e.retired).every(e => e.state === "gone")).toBe(true);
  });
});

function loneEnemy(kind: EnemyKind = "stormCrab", x = 0, z = 27) {
  for (const e of cb.enemies) e.state = "gone";
  const e = cb.enemies[0];
  Object.assign(e, { kind, zone: "stormbreakCoast", x, z, homeX: x, homeZ: z, hp: 100, state: "recover", timer: 99, kx: 0, kz: 0 });
  return e;
}

describe("water extinguishing", () => {
  function pondEnemy(offset: number) {
    changeWorld("home");
    for (const enemy of cb.enemies) enemy.state = "gone";
    const e = cb.enemies.find(enemy => enemy.zone === "grove")!;
    const x = POND.x + POND.r + offset, z = POND.z;
    Object.assign(e, { kind: "snapjaw", x, z, homeX: x, homeZ: z, lastGround: { x, z }, hp: 100,
      state: "recover", timer: 99, burn: { until: rt.time + 10, tick: rt.time + 1 },
      panic: startPanic("medium", rt.time), infernoBlueUntil: rt.time + 1 });
    Object.assign(rt.player, { x: POND.x + POND.r + 3, z, yaw: -Math.PI / 2 });
    cb.zones.current = "grove";
    vi.mocked(audio.play).mockClear();
    vi.mocked(audio.cancelPanic).mockClear();
    return e;
  }

  it("clears grounded fire, panic, blue flame and bark once, with recovery and resistance", () => {
    const e = pondEnemy(-.3);
    combatTick(0);
    expect(e.burn).toBeNull(); expect(e.panic).toBeNull();
    expect(e.infernoBlueUntil).toBe(0); expect(e.state).toBe("recover");
    expect(e.panicResistUntil).toBeCloseTo(rt.time + 4);
    expect(cb.fx.filter(f => f.kind === "steam")).toHaveLength(1);
    expect(audio.cancelPanic).toHaveBeenCalledOnce();
    combatTick(0);
    expect(vi.mocked(audio.play).mock.calls.filter(([s]) => s === "sizzle")).toHaveLength(1);
    advanceCombat(.4);
    expect(e.state).not.toBe("recover");
  });

  it.each(["air", "grabbed", "trapped", "carried"] as const)("waits for landing/release from %s", kind => {
    const e = pondEnemy(-.3);
    e.air = kind === "air" ? .5 : 0;
    if (kind !== "air") e.control = { kind, t0: rt.time, until: rt.time + 10 };
    combatTick(0);
    expect(e.burn).not.toBeNull();
    e.control = null;
    e.air = .2;
    combatTick(0);
    expect(e.burn).toBeNull();
  });

  it("allows only the panic rim step and walks straight back over half a second", () => {
    const e = pondEnemy(.05), startX = e.x;
    Object.assign(e.panic!, { hx: -1, hz: 0, turnAt: rt.time + 10 });
    rt.time += .1; combatTick(.1);
    expect(e.x).toBeLessThan(POND.x + POND.r);
    expect(e.state).not.toBe("ko"); expect(e.burn).toBeNull();
    expect(e.wade).not.toBeNull();
    const targetX = e.wade!.x, wetX = e.x;
    rt.time += .25; combatTick(.25);
    expect(e.x).toBeCloseTo((wetX + targetX) / 2);
    rt.time += .25; combatTick(.25);
    expect(e.wade).toBeNull(); expect(e.x).toBeCloseTo(targetX);
    expect(e.x).toBeLessThanOrEqual(startX);
    expect(hazardAt(e.x, e.z, "home")).toBeNull();
    expect(cb.drops).toHaveLength(0);
  });

  it("reaches the rim from normal body clearance in short panic steps", () => {
    const e = pondEnemy(ENEMIES.snapjaw.radius + .2);
    Object.assign(e.panic!, { hx: -1, hz: 0, turnAt: rt.time + 10 });
    for (let i = 0; i < 60 && !e.wade; i++) {
      rt.time += 1 / 60; combatTick(1 / 60);
    }
    expect(e.wade).not.toBeNull();
    expect(e.burn).toBeNull(); expect(e.state).not.toBe("ko");
  });

  it("keeps ordinary chase steps out of the pond", () => {
    const e = pondEnemy(ENEMIES.snapjaw.radius + .2);
    e.burn = e.panic = null;
    e.state = "chase";
    // Put the target across the pond; the existing chase collision must stop it.
    rt.player.x = POND.x - POND.r - 1;
    advanceCombat(.5);
    expect(hazardAt(e.x, e.z, "home")).toBeNull();
    expect(e.wade).toBeNull();
  });

  it.each(["pond", "stream"])("keeps forced %s splash KOs and rewards, adding one steam and sizzle", water => {
    const e = pondEnemy(.2);
    e.kx = -12;
    if (water === "stream") {
      Object.assign(e, { x: 56, z: -230.45, homeX: 56, homeZ: -230.45, lastGround: { x: 56, z: -230.45 }, kx: 0, kz: -28 });
      Object.assign(rt.player, { x: 56, z: -228.45 });
    }
    rt.time += .1; combatTick(.1);
    expect(e.state).toBe("ko");
    expect(cb.zones.defeated.grove).toContain(e.i);
    expect(cb.drops.some(d => d.kind === "coin")).toBe(true);
    expect(cb.fx.filter(f => f.kind === "steam")).toHaveLength(1);
    expect(cb.fx.some(f => f.kind === "splashKo")).toBe(true);
  });

  it("uses the existing panic wade and extinguish rules at the new stream rim", () => {
    const e = pondEnemy(.2);
    // The east bank has a dry approach. Beside the ferry, the separate
    // walkable tributary extinguishes fire before the enemy reaches this lip.
    Object.assign(e, { x: 66, z: -231.5, homeX: 66, homeZ: -231.5, lastGround: { x: 66, z: -231.5 } });
    Object.assign(rt.player, { x: 66, z: -229.5 });
    Object.assign(e.panic!, { hx: 0, hz: -1, turnAt: rt.time + 10 });
    for (let i = 0; i < 60 && !e.wade; i++) { rt.time += 1 / 60; combatTick(1 / 60); }
    expect(e.wade).not.toBeNull();
    expect(e.burn).toBeNull(); expect(e.panic).toBeNull();
    expect(e.state).not.toBe("ko");
    expect(cb.fx.filter(f => f.kind === "steam")).toHaveLength(1);
    advanceCombat(.6);
    expect(e.wade).toBeNull();
    expect(hazardAt(e.x, e.z, "home")).toBeNull();
    expect(cb.drops).toHaveLength(0);
  });

  it("blocks both fire ignitions in walkable stream water while preserving direct damage", () => {
    changeWorld("home");
    // A submerged point on the first tributary's southern segment, separate
    // from the deep ferry channel at the door.
    let wet: { x: number; z: number } | undefined;
    for (let t = 0; t <= 1; t += .05) {
      const point = { x: 49 + 7 * t, z: -216 + t };
      if (waterAt(point.x, point.z, "home") === "shallow" && isWalkable(point.x, point.z, gatesOf(getGame().progress), ENEMIES.snapjaw.radius)) { wet = point; break; }
    }
    expect(wet).toBeDefined();
    for (const enemy of cb.enemies) enemy.state = "gone";
    const e = cb.enemies.find(enemy => enemy.zone === "grove")!;
    Object.assign(e, { ...wet!, homeX: wet!.x, homeZ: wet!.z, kind: "snapjaw", state: "recover", timer: 99, hp: 1000 });
    Object.assign(rt.player, { x: e.x, z: e.z + 2, yaw: Math.PI });
    cb.zones.current = "grove";
    setGame(g => ({ progress: { ...g.progress, active: "ember" } }));
    cb.stance.friend = "ember"; cb.stance.k = 1;
    for (let i = 0; i < 3; i++) { cb.ready.basic = 0; expect(basicAttack()).toBe(true); }
    expect(e.hp).toBeLessThan(1000);
    expect(e.burn).toBeNull(); expect(e.panic).toBeNull();
    const hp = e.hp;
    expect(specialAttack()).toBe(true);
    expect(e.hp).toBeLessThan(hp);
    expect(e.burn).toBeNull(); expect(e.panic).toBeNull(); expect(e.infernoBlueUntil).toBe(0);
    expect(cb.fx.some(f => f.kind === "steam")).toBe(false);
    // The same attacks ignite normally once back on dry ground.
    e.x = rt.player.x; e.z = rt.player.z - .9;
    expect(waterAt(e.x, e.z, "home")).toBe("none");
    cb.ready.special = 0; cb.inferno = null; specialAttack();
    expect(e.burn).not.toBeNull();
  });
});

describe("enemy smoke reveals", () => {
  it("activates only nearby enemies in the current zone, staggered by .12 seconds", () => {
    for (const e of cb.enemies) e.state = "gone";
    const [a, b, far, other] = cb.enemies;
    for (const e of [a, b, far, other]) Object.assign(e, { state: "dormant", zone: "stormbreakCoast", homeX: 0, homeZ: 21, x: 0, z: 21 });
    far.homeZ = 40.01; other.zone = "thunderGrotto";
    combatTick(0);
    expect(a.state).toBe("materialising");
    expect([b.state, far.state, other.state]).toEqual(["dormant", "dormant", "dormant"]);
    rt.time += .119; combatTick(.119); expect(b.state).toBe("dormant");
    rt.time += .001; combatTick(.001); expect(b.state).toBe("materialising");
  });

  it.each(["dormant", "materialising"] as const)("%s cannot participate in combat or separation", state => {
    const e = loneEnemy("snapjaw", 0, 20.5);
    e.state = state; e.spawnT = rt.time; e.homeZ = 40.01;
    const hp = e.hp, playerHp = cb.vitals.hp, z = e.z;
    expect(pickTarget(10)).toBeNull();
    basicAttack();
    rt.time += .15; combatTick(.15);
    expect(e.hp).toBe(hp); expect(cb.vitals.hp).toBe(playerHp); expect(e.z).toBe(z);
    expect(enemyRevealScale(e)).toBe(0);
    if (state === "materialising") {
      rt.time += .03; expect(enemyRevealScale(e)).toBe(0);
      rt.time += .01; expect(enemyRevealScale(e)).toBeGreaterThan(0);
      rt.time += .30; combatTick(.34);
      expect(e.state).toBe("materialising"); expect(e.hp).toBe(hp);
      rt.time += .01; combatTick(.01); expect(e.state).toBe("idle");
    }
  });

  it("does not replay smoke on a boundary crossing, but does on a real respawn", () => {
    for (const e of cb.enemies) e.state = "gone";
    const e = cb.enemies[0];
    Object.assign(e, { state: "idle", zone: "stormbreakCoast", x: 0, z: 21, homeX: 0, homeZ: 21 });
    rt.effects = []; vi.mocked(audio.play).mockClear();
    const count = cb.enemies.length;
    rt.player.z = 5; combatTick(0);
    rt.player.z = 20; combatTick(0);
    expect(e.state).not.toBe("dormant");
    expect(cb.enemies).toHaveLength(count);
    expect(rt.effects.filter(f => f.kind === "smoke")).toHaveLength(0);
    rt.player.z = 5; combatTick(0);
    cb.cloudZones.defeated.stormbreakCoast = [e.i];
    rt.playTime += 12;
    rt.player.z = 20; combatTick(0);
    expect(e.state).toBe("materialising");
    expect(rt.effects.some(f => f.kind === "smoke")).toBe(true);
  });
});

describe("Leafy's snap-timed whip", () => {
  afterEach(() => setGame({ line: null }));

  function leafy() {
    cb.stance.friend = "leafy"; cb.stance.k = 1;
    vi.mocked(audio.play).mockClear();
  }

  for (const fps of [60, 8]) {
    it(`strikes once on the first frame crossing .15 seconds at ${fps} fps`, () => {
      const e = loneEnemy("snapjaw", 0, 23);
      leafy();
      const start = rt.time;
      expect(basicAttack()).toBe(true);
      expect(e.hp).toBe(100);
      expect(cb.whip?.struck).toBe(false);
      expect(vi.mocked(audio.play).mock.calls.some(([sound]) => sound === "whip")).toBe(false);
      const step = 1 / fps;
      while (rt.time - start + step < .15 - 1e-9) {
        rt.time += step; combatTick(step);
        expect(e.hp).toBe(100);
      }
      rt.time += step; combatTick(step);
      expect(e.hp).toBe(92);
      expect(cb.whip?.struck).toBe(true);
      expect(e.control?.t0).toBeCloseTo(start + .15);
      expect(cb.ready.basic).toBeCloseTo(start + .75);
      rt.time += step; combatTick(step);
      expect(e.hp).toBe(92);
      expect(vi.mocked(audio.play).mock.calls.filter(([sound]) => sound === "whip")).toHaveLength(1);
    });
  }

  it("samples live position and facing at snap without steering the player", () => {
    const e = loneEnemy("snapjaw", 0, 23);
    leafy(); basicAttack();
    Object.assign(rt.player, { x: 1, z: 20, yaw: Math.PI / 2 });
    Object.assign(e, { x: 4, z: 20, homeX: 4, homeZ: 20 });
    advanceCombat(.1);
    expect(e.hp).toBe(100);
    expect(cb.whip?.strands[0].enemy).toBe(e.i);
    advanceCombat(.05);
    expect(e.hp).toBe(92);
    expect(e.flight).toMatchObject({ x: 1, z: 20, yaw: Math.PI / 2 });
    expect(rt.player.yaw).toBe(Math.PI / 2);
  });

  for (const reason of ["switch", "stop"] as const) {
    it(`cancels before snap on ${reason}, spends cooldown and retracts in .1 seconds`, () => {
      const e = loneEnemy("snapjaw", 0, 23);
      leafy(); basicAttack();
      const ready = cb.ready.basic;
      advanceCombat(.05);
      if (reason === "switch") setGame(g => ({ progress: { ...g.progress, active: "puff" } }));
      else setGame({ journalOpen: true });
      combatTick(0);
      expect(cb.whip?.cancelAt).toBe(rt.time);
      advanceCombat(.1);
      expect(cb.whip).toBeNull();
      expect(e.hp).toBe(100); expect(e.control).toBeNull();
      expect(cb.ready.basic).toBe(ready);
      expect(vi.mocked(audio.play).mock.calls.some(([sound]) => sound === "whip")).toBe(false);
    });
  }

  it.each(["switch", "menu", "dialogue", "zone", "knockout"])("%s interrupts an existing swing cleanly", reason => {
    const e = loneEnemy("snapjaw", 0, 23);
    leafy(); basicAttack(); advanceCombat(.15);
    expect(e.control?.kind).toBe("grabbed");
    if (reason === "switch") setGame(g => ({ progress: { ...g.progress, active: "puff" } }));
    if (reason === "menu") setGame({ journalOpen: true });
    if (reason === "dialogue") setGame({ line: { id: 1, by: "maple", en: "Wait!" } });
    if (reason === "zone") rt.player.z = 5;
    if (reason === "knockout") cb.knockedOut = true;
    combatTick(0);
    expect(e.control).toBeNull(); expect(e.flight).toBeNull();
    expect(e.kx).toBe(0); expect(e.kz).toBe(0);
    advanceCombat(.12);
    expect(cb.whip).toBeNull();
  });
});

describe("companions leaving combat", () => {
  const destinations = [
    { name: "Port Town", world: "home", hostile: [76, -287], safe: [76, -293] },
    { name: "Hidden Hollow", world: "cloud", hostile: [0, 151], safe: [-10, 190] }
  ] as const;

  for (const friend of ["leafy", "bubbo", "puff", "ember"] as const) {
    it(`${friend} stays in combat stance on the former camp's forest floor`, () => {
      changeWorld("home");
      setGame(g => ({ progress: { ...g.progress, active: friend, act2: { ...g.progress.act2, cleared: ["forest1"] } } }));
      for (const e of cb.enemies) e.state = "gone";
      Object.assign(rt.player, { x: 76, z: -168 });
      advanceCombat(.6);
      expect(cb.stance.friend).toBe(friend);
      Object.assign(rt.player, { x: 88, z: -160 });
      combatTick(.01);
      expect(cb.zones.current).toBe("forest1");
      expect(cb.stance.friend).toBe(friend);
      expect(rt.monsters[friend].mode).toBe("script");
    });
  }

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
    { world: "home", i: 18, x: 50.03, z: -258.4, distance: 1.5, side: 1, damage: 14 },
    { world: "cloud", i: 0, x: 10.97, z: 25, distance: 1.4, side: -1, damage: 4 },
    { world: "cloud", i: 1, x: 10.97, z: 25, distance: 1.4, side: -1, damage: 8 },
  ] as const) {
    it(`Vine Grab hits ${scenario.world} enemy ${scenario.i} at the walkable rim after forced motion`, () => {
      changeWorld(scenario.world);
      const e = cb.enemies[scenario.i];
      for (const other of cb.enemies) if (other !== e) other.state = "gone";
      Object.assign(e, { x: scenario.x, z: scenario.z, state: "recover", timer: 99, resistUntil: rt.time + 20, yaw: scenario.side * Math.PI / 2 });
      // Keep this ray/rim assertion separate from resisted-knock wall damage,
      // which now runs in the same simulation frame as the scheduled snap.
      e.control = { kind: "snared", t0: rt.time, until: rt.time + 20 };
      Object.assign(rt.player, { x: e.x + scenario.side * scenario.distance, z: e.z, yaw: -scenario.side * Math.PI / 2 });
      combatTick(0);
      friend("leafy");
      const gates = gatesOf(getGame().progress), hp = e.hp;
      expect(isWalkable(rt.player.x, rt.player.z, gates, PLAYER_R)).toBe(true);
      expect(isWalkable(e.x, e.z, gates, 0)).toBe(true);
      expect(isWalkable(e.x, e.z, gates, .08)).toBe(false);
      expect(basicAttack()).toBe(true);
      advanceCombat(.15);
      expect(e.hp).toBe(hp - scenario.damage);
    });

    // Every cone shares the rim rule: a pushed enemy must stay hittable by the push itself.
    for (const by of ["puff", "ember"] as const) {
      it(`${by === "puff" ? "Wind Blast" : "Fire Breath"} hits ${scenario.world} enemy ${scenario.i} at the walkable rim`, () => {
        changeWorld(scenario.world);
        const e = cb.enemies[scenario.i];
        for (const other of cb.enemies) if (other !== e) other.state = "gone";
        Object.assign(e, { x: scenario.x, z: scenario.z, state: "recover", timer: 99, resistUntil: rt.time + 20, yaw: scenario.side * Math.PI / 2 });
        Object.assign(rt.player, { x: e.x + scenario.side * scenario.distance, z: e.z, yaw: -scenario.side * Math.PI / 2 });
        combatTick(0);
        friend(by);
        const hp = e.hp;
        expect(isWalkable(e.x, e.z, gatesOf(getGame().progress), .08)).toBe(false);
        expect(basicAttack()).toBe(true);
        expect(e.hp).toBeLessThan(hp);
      });
    }
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
    advanceCombat(.15);
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

  it("Fire Breath taps once, ignites on third exposure, and upgrades burn/range", () => {
    const e = loneEnemy("snapjaw", 0, 23);
    friend("ember");
    expect(basicAttack()).toBe(true);
    expect(e.hp).toBe(97);
    expect(e.burn).toBeNull();
    advanceCombat(.3);
    expect(e.hp).toBe(97);
    expect(cb.breath).toBeNull();
    expect(basicAttack()).toBe(true);
    expect(e.hp).toBe(94);
    advanceCombat(.25);
    expect(basicAttack()).toBe(true);
    expect(e.hp).toBe(91);
    expect(e.burn).not.toBeNull();
    expect(e.panic).not.toBeNull();
    releaseAttack("basic", "key");
    // Resist panic here so range and upgraded burn can be measured in place.
    Object.assign(e, { z: 25, hp: 100, burn: null, panic: null, panicResistUntil: Infinity, fireTicks: 2, state: "recover", timer: 99 });
    setGame(g => ({ progress: { ...g.progress, act2: { ...g.progress.act2, upgrades: ["ember"] } } }));
    cb.ready.basic = 0;
    expect(basicAttack()).toBe(true);
    expect(e.hp).toBe(97);
    advanceCombat(.35);
    expect(e.hp).toBe(94);
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
      advanceCombat(.15);
      expect(e.z).toBeCloseTo(z - 1);
      expect(e.hp).toBe(80); // six bubble contact + fourteen heavy vine tug
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
    expect(e.hp).toBe(92);
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
    expect(specialAttack()).toBe(true);
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
      expect(e.hp).toBe(92); expect(e.kz).toBe(knock);
      expect(e.control?.kind).toBe("flung"); expect(e.air).toBe(0);
    });
  }

  it("Wind Blast keeps the visual yaw and player-centred hit cone on the same aim", () => {
    rt.player.yaw = Math.PI / 2;
    const front = loneEnemy("snapjaw", 3, 20), behind = extra(1, "snapjaw", -2, 20);
    // This edge of the cone is measured from the player, despite Puff's offset perch.
    const edge = extra(2, "snapjaw", 3 * Math.cos(Math.PI / 6 - .01), 20 + 3 * Math.sin(Math.PI / 6 - .01));
    friend("puff"); expect(basicAttack()).toBe(true);
    const visual = cb.fx.find(f => f.kind === "blast")!;
    expect(visual.yaw).toBe(rt.player.yaw);
    expect(visual.ax).toBeCloseTo(Math.sin(rt.player.yaw));
    expect(visual.az).toBeCloseTo(Math.cos(rt.player.yaw));
    expect(front.hp).toBe(92); expect(edge.hp).toBe(92); expect(behind.hp).toBe(100);
  });

  it("Vine Grab excludes behind and through-solid targets", () => {
    const e = loneEnemy("snapjaw", 0, 19);
    friend("leafy");
    expect(pickTarget(4.5)).toBeNull();
    expect(basicAttack()).toBe(true);
    advanceCombat(.15);
    expect(e.hp).toBe(100);
    // A coast rock at (-6,32), radius 2.2, blocks this four-metre segment.
    Object.assign(rt.player, { x: -6, z: 30, yaw: 0 });
    Object.assign(e, { x: -6, z: 34 });
    cb.ready.basic = 0;
    expect(pickTarget(4.5)).toBeNull();
    expect(basicAttack()).toBe(true);
    advanceCombat(.15);
    expect(e.hp).toBe(100);
    expect(e.control).toBeNull();
  });

  it("one Vine Grab press completes its orbit then flings along the live aim", () => {
    const e = loneEnemy("snapjaw", 0, 23);
    friend("leafy");
    expect(basicAttack()).toBe(true);
    advanceCombat(.15);
    expect(e.hp).toBe(92); expect(e.control?.kind).toBe("grabbed");
    rt.player.yaw = Math.PI;
    advanceCombat(.95);
    expect(e.control?.kind).toBe("flung");
    expect(e.flight?.swing?.sweep).toBeGreaterThanOrEqual(Math.PI * 2 - 1e-8);
    expect(e.kx).toBeCloseTo(0); expect(e.kz).toBeCloseTo(-11);
    advanceCombat(.55);
    expect(e.control).toBeNull();
    expect(e.resistUntil).toBeGreaterThan(rt.time);
  });

  it.each([10, 30, 60])("sweeps fully around a moving and turning player at %i fps", fps => {
    const e = loneEnemy("snapjaw", 0, 23);
    friend("leafy"); basicAttack();
    const start = rt.time;
    let measured = 0, previous = 0, sawPull = false, sawOrbit = false;
    for (let frame = 1; frame <= Math.ceil(1.1 * fps); frame++) {
      const age = frame / fps;
      Object.assign(rt.player, { x: Math.max(0, age - .2) * .35, z: 20 + Math.max(0, age - .2) * .15,
        yaw: Math.max(0, age - .2) * .5 });
      rt.time = start + age; rt.playTime += 1 / fps; combatTick(1 / fps);
      if (!e.flight?.swing) continue;
      const swing = e.flight.swing;
      const angle = Math.atan2(e.x - rt.player.x, e.z - rt.player.z);
      measured += Math.atan2(Math.sin(angle - previous), Math.cos(angle - previous));
      previous = angle;
      if (e.control?.kind === "grabbed") {
        sawPull ||= swing.phase === "pull";
        sawOrbit ||= swing.phase === "orbit";
        expect(e.air).toBeCloseTo(.7);
        expect(Math.hypot(e.x - rt.player.x, e.z - rt.player.z)).toBeCloseTo(swing.radius);
      }
    }
    expect(sawPull && sawOrbit).toBe(true);
    expect(e.control?.kind).toBe("flung");
    expect(e.flight?.swing?.sweep).toBeGreaterThanOrEqual(Math.PI * 2);
    expect(measured).toBeGreaterThanOrEqual(Math.PI * 2);
    expect(e.control!.t0 - (start + .15)).toBeCloseTo(.95);
    expect(Math.atan2(e.kx, e.kz)).toBeCloseTo(rt.player.yaw);
    expect(Math.hypot(e.kx, e.kz)).toBeCloseTo(11);
  });

  it.each([10, 30, 60])("has the same release point and complete throw distance at %i fps", fps => {
    const e = loneEnemy("snapjaw", 0, 23);
    friend("leafy"); basicAttack();
    const start = rt.time;
    for (let frame = 1; frame <= Math.ceil(1.65 * fps); frame++) {
      rt.time = start + frame / fps; rt.playTime += 1 / fps; combatTick(1 / fps);
    }
    expect(e.control).toBeNull();
    expect(e.x).toBeCloseTo(0);
    expect(e.z).toBeCloseTo(23 + 11 * (1 - Math.exp(-1.5 * .55)) / 1.5);
  });

  it("tightens around a solid and deals wall damage at most once without ending the swing", () => {
    Object.assign(rt.player, { x: -6, z: 27.5, yaw: Math.PI });
    const e = loneEnemy("snapjaw", -6, 24.5);
    friend("leafy"); expect(basicAttack()).toBe(true); advanceCombat(.15);
    expect(e.control?.kind).toBe("grabbed");
    let minimum = Infinity;
    for (let frame = 0; frame < 56; frame++) {
      advanceCombat(1 / 60);
      expect(e.control?.kind).toBe("grabbed");
      minimum = Math.min(minimum, e.flight!.swing!.radius);
      expect(e.hp).toBeGreaterThanOrEqual(84);
      expect(Math.hypot(e.x - rt.player.x, e.z - rt.player.z)).toBeGreaterThanOrEqual(1.2);
    }
    expect(minimum).toBeLessThan(2.1);
    expect(e.flight?.swing?.wallHit).toBe(true);
    expect(e.hp).toBe(84);
    advanceCombat(1 / 60);
    expect(e.control?.kind).toBe("flung");
    expect(e.flight?.swing?.sweep).toBeGreaterThanOrEqual(Math.PI * 2 - 1e-8);
  });

  it("shares the once-per-victim ledger between a low-fps orbit and its fling", () => {
    const e = loneEnemy("snapjaw", 0, 23), victim = extra(1, "snapjaw", 2.2, 20);
    e.hp = 1000;
    victim.control = { kind: "snared", t0: rt.time, until: rt.time + 20 };
    friend("leafy"); basicAttack();
    for (let frame = 0; frame < 11; frame++) { rt.time += .1; combatTick(.1); }
    expect(e.control?.kind).toBe("flung");
    expect(victim.hp).toBe(90);
    expect(e.hp).toBe(986);
    const ledger = e.flight!.victims;
    expect(ledger).toEqual([victim.i]);
    Object.assign(victim, { x: e.x, z: e.z + .3 });
    const next = extra(2, "snapjaw", e.x, e.z + 1.8);
    next.control = { kind: "snared", t0: rt.time, until: rt.time + 20 };
    advanceCombat(.2);
    expect(victim.hp).toBe(90); expect(next.hp).toBe(90);
    expect(e.hp).toBe(980);
    expect(e.flight!.victims).toEqual([victim.i, next.i]);
  });

  it("ignores a real pond throughout the orbit and applies its hazard at release", () => {
    changeWorld("home");
    for (const enemy of cb.enemies) enemy.state = "gone";
    const e = cb.enemies.find(enemy => enemy.zone === "grove")!;
    Object.assign(e, { kind: "snapjaw", x: POND.x + POND.r + .2, z: POND.z, hp: 100, state: "recover", timer: 99 });
    Object.assign(rt.player, { x: e.x + 2, z: e.z, yaw: -Math.PI / 2 });
    cb.zones.current = "grove";
    friend("leafy"); expect(basicAttack()).toBe(true); advanceCombat(.15);
    expect(e.control?.kind).toBe("grabbed");
    let crossedHazard = false;
    for (let frame = 0; frame < 56; frame++) {
      advanceCombat(1 / 60);
      crossedHazard ||= !!hazardAt(e.x, e.z, "home", getGame().progress.solved);
      expect(e.state).not.toBe("ko");
      expect(e.control?.kind).toBe("grabbed");
    }
    expect(crossedHazard).toBe(true);
    advanceCombat(1 / 60);
    expect(e.state).toBe("ko");
    expect(cb.zones.defeated.grove).toContain(e.i);
  });

  it("rejects a new basic or special throughout the swing, including held J after its cooldown", () => {
    const e = loneEnemy("snapjaw", 0, 23);
    friend("leafy"); basicAttack(); cb.hold = true;
    advanceCombat(.8);
    expect(e.control?.kind).toBe("grabbed");
    expect(rt.time).toBeGreaterThan(cb.ready.basic);
    const whip = cb.whip, mp = cb.vitals.mp.leafy;
    expect(basicAttack()).toBe(false); expect(specialAttack()).toBe(false);
    advanceCombat(.2);
    expect(cb.whip).toBe(whip);
    expect(cb.whip?.t0).toBeCloseTo(10);
    expect(cb.vitals.mp.leafy).toBeGreaterThanOrEqual(mp);
    expect(e.hp).toBe(92);
    cb.hold = false;
  });

  for (const target of ["none", "behind", "occluded"] as const) {
    it(`held Vine Grab skips a ${target} target without consuming cooldown; a fresh press still whips`, () => {
      const e = loneEnemy("snapjaw", 0, 19);
      friend("leafy");
      if (target === "none") e.state = "gone";
      if (target === "occluded") {
        Object.assign(rt.player, { x: -6, z: 30, yaw: 0 });
        Object.assign(e, { x: -6, z: 34 });
      }
      const ready = cb.ready.basic, fx = cb.fx.length;
      expect(basicAttack({ repeat: true })).toBe(false);
      expect(cb.ready.basic).toBe(ready);
      expect(cb.fx).toHaveLength(fx);
      expect(basicAttack()).toBe(true);
      expect(cb.ready.basic).toBeGreaterThan(ready);
      expect(cb.whip).not.toBeNull();
    });
  }

  it("held Vine Grab attacks an eligible enemy and a reachable grabbable object", () => {
    const e = loneEnemy("snapjaw", 0, 23);
    friend("leafy");
    expect(basicAttack({ repeat: true })).toBe(true);
    advanceCombat(.15);
    expect(e.hp).toBe(92);
    changeWorld("home");
    for (const enemy of cb.enemies) enemy.state = "gone";
    Object.assign(rt.player, { x: 66, z: -249.5, yaw: Math.PI });
    combatTick(0); // Enter causeway before scheduling a strike; entry cancels pending moves.
    friend("leafy");
    expect(basicAttack({ repeat: true })).toBe(true);
    advanceCombat(.15);
    expect(cb.elementObjects.leafyStatues?.state).toBe("pulled");
    cb.ready.basic = 0;
    expect(basicAttack({ repeat: true })).toBe(false);
  });

  it("Double Grab bashes the nearest two for fourteen and a second of stun", () => {
    const a = loneEnemy("snapjaw", -.5, 23), b = extra(1, "snapjaw", .5, 23);
    friend("leafy");
    setGame(g => ({ progress: { ...g.progress, act2: { ...g.progress.act2, upgrades: ["leafy"] } } }));
    expect(basicAttack()).toBe(true);
    advanceCombat(.15);
    expect([a.control?.kind, b.control?.kind]).toEqual(["grabbed", "grabbed"]);
    expect(cb.whip?.strands).toEqual([
      { hand: "R", enemy: b.i, object: null },
      { hand: "L", enemy: a.i, object: null }
    ]);
    advanceCombat(.36);
    expect([a.hp, b.hp]).toEqual([86, 86]);
    expect([a.state, b.state]).toEqual(["stun", "stun"]);
    expect(a.timer).toBeGreaterThan(.95);
    expect(cb.fx.some(f => f.kind === "hit" && Math.abs(f.x) < 1e-9 && Math.abs(f.z - 23) < 1e-9)).toBe(true);
  });

  it("flung weapons hit each victim once and take recoil damage", () => {
    const weapon = loneEnemy("snapjaw", 0, 22.5), victim = extra(1, "snapjaw", 0, 25.6);
    friend("puff");
    expect(basicAttack()).toBe(true);
    expect(weapon.control?.kind).toBe("flung");
    expect(victim.hp).toBe(100); // outside the five metre blast
    advanceCombat(.6);
    expect(weapon.hp).toBe(86);
    expect(victim.hp).toBe(90);
  });

  it("fast wall impacts add eight damage and .6 seconds stun", () => {
    const e = loneEnemy("snapjaw", -6, 28.5);
    Object.assign(rt.player, { x: -6, z: 25.5, yaw: 0 });
    friend("puff");
    expect(basicAttack()).toBe(true);
    advanceCombat(.4);
    expect(e.hp).toBe(84);
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
    expect(e.hp).toBe(80); // eight direct plus round(6+8*.8)
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
    expect(e.control).toBeNull(); expect(e.air).toBe(.8); expect(e.hp).toBe(80);
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
    for (const drop of cb.drops) {
      expect(hazardAt(drop.x, drop.z, "home", getGame().progress.solved)).toBeNull();
      expect(isWalkable(drop.x, drop.z, gatesOf(getGame().progress), 0)).toBe(true);
      expect(drop.x).toBeCloseTo(e.lastGround.x);
      expect(drop.z).toBeCloseTo(e.lastGround.z);
    }
    expect(cb.fx.some(f => f.kind === "splashKo")).toBe(true);
  });

  it("a release over a bank sets the enemy down on real ground, where it can be hit again", () => {
    changeWorld("home");
    for (const enemy of cb.enemies) enemy.state = "gone";
    const e = cb.enemies.find(e => e.zone === "canopy")!;
    Object.assign(e, { kind: "snapjaw", x: 115.8, z: -207.5, hp: 100, state: "recover", timer: 99 });
    Object.assign(rt.player, { x: 118, z: -207.5, yaw: -Math.PI / 2 });
    cb.zones.current = "canopy";
    friend("leafy");
    expect(basicAttack()).toBe(true);
    advanceCombat(.15);
    expect(e.control?.kind).toBe("grabbed");
    rt.player.yaw = Math.PI / 2;
    const before = e.hp;
    advanceCombat(.95);
    expect(e.control).toBeNull();
    expect(e.state).not.toBe("ko");
    expect(e.hp).toBeLessThan(before);
    expect(isWalkable(e.x, e.z, gatesOf(getGame().progress), .55)).toBe(true);
  });

  it("an interrupted swing over a void sets the enemy down instead of stranding it", () => {
    changeWorld("home");
    for (const enemy of cb.enemies) enemy.state = "gone";
    const e = cb.enemies.find(e => e.zone === "canopy")!;
    Object.assign(e, { kind: "snapjaw", x: 100, z: -212.5, hp: 100, state: "recover", timer: 99 });
    Object.assign(rt.player, { x: 100, z: -214.8, yaw: 0 });
    cb.zones.current = "canopy";
    friend("leafy");
    basicAttack();
    advanceCombat(.15);
    let overVoid = false;
    for (let i = 0; i < 40 && !overVoid; i++) {
      advanceCombat(.02);
      overVoid = hazardAt(e.x, e.z, "home") !== null;
    }
    expect(overVoid).toBe(true);
    expect(e.control?.kind).toBe("grabbed");
    friend("puff");
    advanceCombat(.05);
    expect(e.control?.kind).not.toBe("grabbed");
    expect(hazardAt(e.x, e.z, "home")).toBeNull();
    expect(isWalkable(e.x, e.z, gatesOf(getGame().progress), .55)).toBe(true);
  });

  describe("on the Upper Canopy (high layer)", () => {
    const leaf = { x: 104.4, z: -226.2, r: 3.6 }; // Broadleaf Clearing
    afterEach(() => { region.layer = "ground"; });
    function upperEnemy(kind: EnemyKind = "snapjaw") {
      changeWorld("home");
      region.layer = "high";
      for (const enemy of cb.enemies) enemy.state = "gone";
      const e = cb.enemies.find(e => e.zone === "upperCanopy")!;
      cb.zones.current = "upperCanopy";
      Object.assign(e, { kind, x: leaf.x + leaf.r - .7, z: leaf.z, hp: 100, state: "recover", timer: 99 });
      return e;
    }

    it("Wind Blast pushes an enemy off a giant leaf: a plunge KO, counted once, reward on the leaf", () => {
      const e = upperEnemy();
      Object.assign(rt.player, { x: leaf.x + leaf.r - 2.7, z: leaf.z, yaw: Math.PI / 2 });
      friend("puff");
      expect(hazardAt(e.x, e.z, "home")).toBeNull();
      expect(basicAttack()).toBe(true);
      advanceCombat(.15);
      expect(e.state).toBe("ko");
      expect(e.plunge).not.toBeNull();
      expect(hazardAt(e.x, e.z, "home")?.id).toBe("upperCanopyFall");
      expect(cb.zones.defeated.upperCanopy).toEqual([e.i]);
      advanceCombat(.5);
      expect(cb.zones.defeated.upperCanopy).toEqual([e.i]);
      for (const drop of cb.drops) expect(isWalkable(drop.x, drop.z, gatesOf(getGame().progress), 0)).toBe(true);
    });

    it("Leafy's Vine Grab swings a light enemy out over the drop", () => {
      const e = upperEnemy("gloomlet");
      Object.assign(e, { x: leaf.x + 1.2, z: leaf.z });
      Object.assign(rt.player, { x: leaf.x, z: leaf.z, yaw: Math.PI / 2 });
      friend("leafy");
      basicAttack();
      advanceCombat(.15);
      let overEdge = false;
      for (let i = 0; i < 60 && !overEdge; i++) {
        advanceCombat(.02);
        overEdge = hazardAt(e.x, e.z, "home")?.id === "upperCanopyFall";
      }
      expect(overEdge).toBe(true);
    });

    it("ground enemies never wake while the player is up here, and Ember sets no leaf alight", () => {
      upperEnemy();
      const ground = cb.enemies.filter(e => e.zone === "canopy");
      combatTick(.1);
      expect(ground.every(e => e.state === "gone" || e.state === "dormant")).toBe(true);
      expect(ELEMENT_OBJECTS.some(o => o.layer === "high")).toBe(false);
    });
  });

  it("a Canopy void uses the same forced-motion KO and leaves its reward on the last floor", () => {
    changeWorld("home");
    for (const enemy of cb.enemies) enemy.state = "gone";
    const e = cb.enemies.find(e => e.zone === "canopy")!;
    Object.assign(e, { kind: "snapjaw", x: 106, z: -215.7, hp: 100, state: "recover", timer: 99 });
    Object.assign(rt.player, { x: 106, z: -213.7, yaw: Math.PI });
    cb.zones.current = "canopy";
    friend("puff");
    expect(hazardAt(e.x, e.z, "home")).toBeNull();
    expect(basicAttack()).toBe(true);
    advanceCombat(.15);
    expect(e.state).toBe("ko");
    expect(cb.zones.defeated.canopy).toContain(e.i);
    expect(hazardAt(e.x, e.z, "home")?.kind).toBe("fall");
    expect(e.plunge).not.toBeNull();
    expect(cb.drops.length).toBeGreaterThan(0);
    for (const drop of cb.drops) {
      expect(hazardAt(drop.x, drop.z, "home")).toBeNull();
      expect(isWalkable(drop.x, drop.z, gatesOf(getGame().progress), 0)).toBe(true);
      // The body keeps tumbling away; the reward stays where it left the floor.
      expect(Math.hypot(drop.x - e.lastGround.x, drop.z - e.lastGround.z)).toBeLessThan(.01);
    }
  });

  it.each(["chase", "lunge", "return"] as const)("autonomous %s motion stops at a Canopy void", state => {
    changeWorld("home");
    for (const enemy of cb.enemies) enemy.state = "gone";
    const e = cb.enemies.find(e => e.zone === "canopy")!;
    Object.assign(e, { kind: "snapjaw", x: 106, z: -215.3, homeX: 106, homeZ: -220.2,
      hp: 100, state, timer: 2, dx: 0, dz: -1, kx: 0, kz: 0 });
    Object.assign(rt.player, { x: 106, z: -220.2, yaw: 0 });
    cb.zones.current = "canopy";
    for (let frame = 0; frame < 30; frame++) {
      advanceCombat(1 / 30);
      expect(hazardAt(e.x, e.z, "home")).toBeNull();
      expect(e.state).not.toBe("ko");
      expect(e.z).toBeGreaterThan(-216);
    }
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
    advanceCombat(.15);
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
    expect(cb.enemies[4].hp).toBe(97);
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
    expect(cb.enemies[0].state).toBe("dormant");
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

  it("pauses only Inferno's owner through the frame it expires, then resumes regen", () => {
    loneEnemy(); friend("ember");
    cb.vitals.mp = { leafy: 40, bubbo: 40, puff: 40, ember: 40 };
    expect(specialAttack()).toBe(true);
    rt.time += 1.2;
    combatTick(1.2);
    expect(cb.inferno).toBeNull();
    expect(cb.vitals.mp).toEqual({ leafy: 42.4, bubbo: 42.4, puff: 42.4, ember: 25 });
    advanceCombat(.25);
    expect(cb.vitals.mp.ember).toBeCloseTo(25 + MP_REGEN * .25);
  });

  it("pauses Cyclone's owner after switching friends, including alongside paid Inferno", () => {
    loneEnemy(); friend("puff");
    cb.vitals.mp = { leafy: 40, bubbo: 40, puff: 40, ember: 40 };
    expect(specialAttack()).toBe(true);
    const puffMp = cb.vitals.mp.puff;
    friend("leafy");
    advanceCombat(.25);
    expect(cb.vitals.mp.puff).toBe(puffMp);
    expect(cb.vitals.mp.leafy).toBeCloseTo(40 + MP_REGEN * .25);
    friend("ember");
    expect(specialAttack()).toBe(true);
    const emberMp = cb.vitals.mp.ember;
    advanceCombat(.25);
    expect(cb.cyclone).not.toBeNull();
    expect(cb.inferno).not.toBeNull();
    expect(cb.vitals.mp.puff).toBe(puffMp);
    expect(cb.vitals.mp.ember).toBe(emberMp);
    expect(cb.vitals.mp.leafy).toBeCloseTo(40 + MP_REGEN * .5);
  });

  it("instant Bubble Bomb and free basic attacks leave every friend's regen running", () => {
    loneEnemy(); friend("bubbo");
    cb.vitals.mp = { leafy: 40, bubbo: 40, puff: 40, ember: 40 };
    expect(specialAttack()).toBe(true);
    const spent = cb.vitals.mp.bubbo;
    friend("ember");
    cb.hold = true;
    expect(basicAttack()).toBe(true);
    advanceCombat(.25);
    expect(cb.vitals.mp.bubbo).toBeCloseTo(spent + MP_REGEN * .25);
    expect(cb.vitals.mp.ember).toBeCloseTo(40 + MP_REGEN * .25);
    expect(cb.vitals.mp.leafy).toBeCloseTo(40 + MP_REGEN * .25);
    expect(cb.vitals.mp.puff).toBeCloseTo(40 + MP_REGEN * .25);
  });

  it("Inferno tap lasts 1.2 seconds, ticks every quarter second and halves walking speed", () => {
    const e = loneEnemy("snapjaw", 0, 23);
    e.panicResistUntil = Infinity;
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

  it("held Inferno follows current facing, drains MP beyond three seconds and stops on release", () => {
    const a = loneEnemy("snapjaw", 0, 23), b = extra(1, "snapjaw", 3, 20);
    a.hp = b.hp = 1000;
    a.panicResistUntil = b.panicResistUntil = Infinity;
    friend("ember"); cb.holdK = true;
    expect(specialAttack()).toBe(true);
    advanceCombat(.5);
    const hp = a.hp;
    rt.player.yaw = Math.PI / 2;
    advanceCombat(.25);
    expect(b.hp).toBe(994);
    expect(a.hp).toBe(hp - 2); // burn continues outside the cone
    advanceCombat(3.25);
    expect(cb.inferno?.age).toBeCloseTo(4);
    expect(cb.vitals.mp.ember).toBeCloseTo(100 - 15 - 48);
    const heldHp = b.hp;
    advanceCombat(.25);
    expect(b.hp).toBeLessThan(heldHp); // flame ticks continue after the old cap
    cb.holdK = false;
    advanceCombat(1 / 60);
    expect(cb.inferno).toBeNull();
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

  it("held Inferno ends when MP runs out after the prepaid minimum", () => {
    loneEnemy(); friend("ember"); cb.holdK = true; cb.vitals.mp.ember = 36;
    expect(specialAttack()).toBe(true);
    advanceCombat(1.5);
    expect(cb.inferno).not.toBeNull();
    advanceCombat(.25);
    expect(cb.inferno).toBeNull();
    expect(cb.vitals.mp.ember).toBeLessThan(1);
    advanceCombat(.5);
    expect(cb.inferno).toBeNull(); // a held special never restarts itself
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
    advanceCombat(1.11);
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
    expect(e.hp).toBe(76);
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

  it("returns reinforcements to alert after their smoke", () => {
    enterArena(); cb.beacon.power = 1;
    combatTick(0);
    const sprites = cb.enemies.filter(e => e.i >= 10000);
    expect(sprites).toHaveLength(2);
    expect(sprites.every(e => e.state === "materialising")).toBe(true);
    advance(.5);
    expect(sprites.every(e => e.state === "alert")).toBe(true);
  });

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
    advance(.15);
    expect(cb.beacon.power).toBe(2);
    expect(cb.shots).toHaveLength(0);
  });

  it("a cone that touches a pylon's body hits it, even after the gust pushed the player aside", () => {
    enterArena("leafy");
    // Logged from the Act 3 spec: the gust moved the player 2.1 m right of a pylon it still faces past.
    Object.assign(rt.player, { x: -4.88, z: BEACON_PYLONS[0].z - 2.3, yaw: 0 });
    cb.beacon.pylons[0].phase = "exposed";
    expect(basicAttack()).toBe(true);
    advance(.15);
    expect(cb.beacon.pylons[0].phase).toBe("down");
  });

  it("a pylon behind the player is still missed", () => {
    enterArena("leafy");
    Object.assign(rt.player, { x: -7, z: BEACON_PYLONS[0].z + 2.5, yaw: 0 });
    cb.beacon.pylons[0].phase = "exposed";
    expect(basicAttack()).toBe(true);
    expect(cb.beacon.pylons[0].phase).toBe("exposed");
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
    advance(1.05);
    expect(cb.inferno).toBeNull();
    expect(cb.vitals.mp.ember).toBeCloseTo(MP_REGEN * 3.05);
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
