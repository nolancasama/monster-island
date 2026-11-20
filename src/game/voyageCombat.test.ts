import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { basicAttack, cb, combatTick, mounted, playerRadius, resetCombat, specialAttack, steed, voyageOwnsCombat } from "./combat";
import { newProgress } from "./logic/progress";
import { getGame, setGame } from "./store";
import { rt } from "./runtime";
import { region } from "./world/region";
import { isAttackHeld, pressAttack, releaseAllAttacks, releaseAttack } from "../input/attackInput";
import { resetVoyageRt, updateHoldView, vy } from "./voyageRt";
import { hand, isPosedToolFx, L, SAIL_AIM, setPhase, toolFx } from "./voyageSim";
import { BOARDED, crewWorld, resumeVoyage, setScene, VoyageCancelled, voyageAttack } from "./flow/voyage";
import { itemWorld, startJob } from "./flow/voyageJobs";
import { startStorm } from "./flow/voyageStorm";
import { choose, nextLine, say } from "./flow/ask";
import { switchTo } from "./flow/companion";
import { run } from "./flow/script";
import { anchors } from "../scene/anchors";
import { bubboEmitter } from "../scene/voyageAnchors";
import { moveCircle, PLAYER_R } from "./world/collision";
import { COUNTER_CUSTOMER, COUNTER_SOLID, DECK_Y, HOLD_Y, inShipArea, SHIP, shipSolidAt, shipWalkable, SPOT, STOVE_SOLID, SUPPLY_CRATES, touches } from "./world/pirateShip";
import { tick } from "./sim";
import { placePlayer } from "./travel";
import type { PhraseId } from "./logic/english";

vi.mock("../audio/audio", () => ({ audio: { play: vi.fn(), voice: vi.fn(), startMusic: vi.fn(), cancelPanic: vi.fn(), stopFlame: vi.fn(), setListening: vi.fn(), setNearness: vi.fn() } }));
vi.mock("../audio/tts", () => ({ tts: { speak: vi.fn(async () => {}), cancel: vi.fn() } }));

/** Aboard the pirate ship (docs/PIRATE_VOYAGE.md): J is the job tool, never ordinary combat. */
beforeEach(() => {
  const progress = newProgress();
  progress.act2.started = progress.act2.harbor = true;
  progress.act2.descended = true;
  progress.active = "ember";
  for (const id of ["leafy", "bubbo", "puff", "ember"] as const) progress.monsters[id] = { ...progress.monsters[id], discovered: true, friend: true };
  setGame({ screen: "game", mode: "explore", journalOpen: false, settingsOpen: false, panel: null, line: null, progress });
  region.world = "home";
  region.layer = "ground";
  rt.world = "home";
  rt.time = rt.playTime = 10;
  resetVoyageRt();
  resetCombat();
  releaseAllAttacks();
  setScene();
  Object.assign(rt.player, { x: BOARDED.x, z: BOARDED.z, y: 3, yaw: Math.PI, speed: 0, climbY: null, floatY: null, frozen: false });
});

afterEach(() => {
  for (const slot of ["basic", "special"] as const) for (const s of ["key", "mouse", "touch"] as const) releaseAttack(slot, s);
  setPhase(null);
  resetVoyageRt();
});

describe("combat is suppressed at sea", () => {
  it("J and K never start an ordinary attack aboard, from any input source", () => {
    expect(voyageOwnsCombat()).toBe(true);
    // Even with a friend's combat stance carried aboard (a debug jump from a fight).
    cb.stance.friend = "ember"; cb.stance.k = 1;
    for (const source of ["key", "mouse", "touch"] as const) {
      pressAttack("basic", source);
      pressAttack("special", source);
    }
    expect(cb.move).toBeNull();
    expect(cb.breath).toBeNull();
    expect(cb.inferno).toBeNull();
    expect(cb.shots).toEqual([]);
    expect(basicAttack()).toBe(false);
    expect(specialAttack()).toBe(false);
    expect(cb.move).toBeNull();
  });

  it.each(["key", "touch"] as const)("held %s input works for Ember's stove without starting an attack", (source) => {
    setPhase({ name: "cooking", stance: () => "ember" });
    combatTick(.5);
    expect(mounted("ember")).toBe(true);
    pressAttack("basic", source);
    expect(isAttackHeld("basic")).toBe(true);
    cb.hold = true;
    let attacked = false;
    for (let i = 0; i < 30; i++) {
      rt.time += 1 / 30;
      combatTick(1 / 30);
      attacked ||= cb.move !== null || cb.breath !== null;
    }
    expect(attacked).toBe(false);
    expect(isAttackHeld("basic")).toBe(true);
  });

  it("only the running phase's tool answers J; with no contextual action nothing happens", () => {
    const tool = vi.fn(() => true);
    setPhase({ name: "test", tool });
    pressAttack("basic", "key");
    expect(tool).toHaveBeenCalledWith("ember");
    releaseAttack("basic", "key");
    setPhase(null);
    const fx = vy.fx.length;
    pressAttack("basic", "key");
    expect(vy.fx.length).toBe(fx);
    expect(cb.move).toBeNull();
  });

  it("fire carried aboard is put out on the first frame at sea", () => {
    cb.inferno = { age: 0 } as unknown as typeof cb.inferno;
    cb.move = { friend: "ember", kind: "special", t0: rt.time, tx: 0, tz: 0 };
    combatTick(1 / 60);
    expect(cb.inferno).toBeNull();
    expect(cb.move).toBeNull();
  });

  it("ordinary combat comes back once the voyage lets go of the sea", () => {
    vy.sea = false;
    expect(voyageOwnsCombat()).toBe(false);
    region.world = "cloud";
    expect(voyageOwnsCombat()).toBe(false);
  });
});

describe("ship job stances", () => {
  const frame = () => combatTick(.5);
  const useFriend = (active: "ember" | "leafy" | "bubbo" | "puff") => {
    setGame({ progress: { ...getGame().progress, active } });
  };

  it("mounts for a job and releases on a switch, job end and ship exit", () => {
    frame();
    expect(cb.stance.friend).toBeNull();
    setPhase({ name: "cooking", stance: () => "ember" });
    frame();
    expect(steed()).toBe("ember");
    useFriend("leafy");
    frame();
    expect(cb.stance.friend).toBeNull();
    expect(rt.monsters.ember.mode).toBe("party");
    useFriend("ember");
    frame();
    expect(mounted("ember")).toBe(true);
    setPhase(null);
    frame();
    expect(cb.stance.friend).toBeNull();
    expect(rt.monsters.ember.mode).toBe("follow");
    setPhase({ name: "cooking", stance: () => "ember" });
    frame();
    expect(mounted("ember")).toBe(true);
    vy.active = false;
    frame();
    expect(cb.stance.friend).toBeNull();
    expect(playerRadius()).toBe(PLAYER_R);
  });

  it("releases for dialogue, with an opt-in for a cargo placement prompt", async () => {
    useFriend("leafy");
    let choosing = false;
    setPhase({ name: "cargo", stance: () => "leafy", keepStanceDuringScene: () => choosing });
    frame();
    expect(mounted("leafy")).toBe(true);
    await run(async () => {
      frame();
      expect(cb.stance.friend).toBeNull();
      expect(rt.monsters.leafy.mode).toBe("follow");
    });
    frame();
    expect(mounted("leafy")).toBe(true);
    choosing = true;
    await run(async () => {
      frame();
      expect(mounted("leafy")).toBe(true);
    });
  });

  it("suppresses the stance while climbing or knocked out and resets it on load", () => {
    setPhase({ name: "cooking", stance: () => "ember" });
    frame();
    expect(mounted("ember")).toBe(true);
    rt.player.climbY = 1;
    frame();
    expect(cb.stance.friend).toBeNull();
    rt.player.climbY = null;
    cb.knockedOut = true;
    frame();
    expect(cb.stance.friend).toBeNull();
    cb.knockedOut = false;
    frame();
    expect(mounted("ember")).toBe(true);
    resetVoyageRt();
    resetCombat();
    setScene();
    frame();
    expect(cb.stance).toMatchObject({ friend: null, k: 0, leaving: null });
    expect(vy.phase).toBeNull();
  });

  it("keeps Ember's footprint clear of the galley solids and rejects mounting in tight space", () => {
    setPhase({ name: "cooking", stance: () => "ember" });
    Object.assign(rt.player, L(0, -14));
    frame();
    expect(steed()).toBe("ember");
    const radius = playerRadius();
    expect(radius).toBeGreaterThan(1);
    for (const spot of [SPOT.stove, SPOT.supplies, SPOT.counter]) {
      const goal = L(spot.x, spot.z);
      expect(shipSolidAt(goal.x, goal.z, PLAYER_R)).toBe(true);
      const moved = moveCircle(rt.player.x, rt.player.z, goal.x, goal.z, radius);
      expect(shipWalkable(moved.x, moved.z, radius)).toBe(true);
    }
    Object.assign(rt.player, L(0, -15.2));
    expect(shipWalkable(rt.player.x, rt.player.z, PLAYER_R)).toBe(true);
    frame();
    expect(cb.stance.friend).toBeNull();
    expect(rt.player.z).toBe(L(0, -15.2).z);
  });

  it.each([
    ["ember", anchors.emberMouth, () => { anchors.emberMouthValid = true; }, () => { anchors.emberMouthValid = false; }],
    ["leafy", anchors.leafyHandR, () => { anchors.leafyHandRValid = true; }, () => { anchors.leafyHandRValid = false; }],
    ["bubbo", bubboEmitter.mouth, () => { bubboEmitter.valid = true; }, () => { bubboEmitter.valid = false; }],
    ["puff", anchors.puffBeak, () => { anchors.puffBeakValid = true; }, () => { anchors.puffBeakValid = false; }],
  ] as const)("starts %s's tool at the rendered emitter when posed", (friend, emitter, show, hide) => {
    useFriend(friend);
    const to = { x: rt.player.x + 2, y: 1, z: rt.player.z };
    emitter.set(rt.player.x - .5, rt.player.y + .55, rt.player.z + 1);
    show();
    try {
      expect(toolFx(friend, to)).toMatchObject(hand());
      setPhase({ name: "test", stance: () => friend });
      const standingFx = toolFx(friend, to);
      expect(isPosedToolFx(standingFx)).toBe(false);
      expect(standingFx).toMatchObject({ x: emitter.x, y: emitter.y, z: emitter.z });
      frame();
      expect(mounted(friend)).toBe(true);
      const fx = toolFx(friend, to);
      expect(isPosedToolFx(fx)).toBe(true);
      expect(fx).toMatchObject({ x: emitter.x, y: emitter.y, z: emitter.z, tx: to.x, ty: to.y, tz: to.z });
    } finally {
      hide();
    }
  });
});

describe("resumed voyage jobs in the frame loop", () => {
  const holdSpot = L(-2.8, -5.7);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { setTimeout, clearTimeout });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function resume(below: boolean) {
    const progress = getGame().progress;
    const act3 = progress.act3;
    setGame({ progress: { ...progress, active: "leafy", act3: {
      ...act3, voyage: { ...act3.voyage, stage: "jobs", interrogated: true, ...(below ? { inHold: true } : {}) },
    } } });
    resetVoyageRt();
    Object.assign(rt.player, below ? holdSpot : BOARDED, { y: DECK_Y });
    await resumeVoyage();
  }

  function frame() {
    rt.time += 1 / 60;
    tick(1 / 60);
    updateHoldView(rt.player.x, rt.player.z, inShipArea(rt.player.x, rt.player.z));
  }

  async function advanceUntil(ready: () => boolean) {
    for (let i = 0; i < 600; i++) {
      if (ready()) return;
      const { line, prompt } = getGame();
      if (line) nextLine();
      if (prompt?.status === "ready") choose(prompt.sentences[0].id);
      frame();
      await vi.advanceTimersByTimeAsync(20);
    }
    throw new Error("Voyage did not reach the expected phase");
  }

  function tapTool() {
    pressAttack("basic", "key");
    releaseAttack("basic", "key");
  }

  function interact(id: string) {
    const candidate = vy.phase?.candidates?.().find((c) => c.focus.id === id);
    if (!candidate) throw new Error(`No voyage interaction for ${id}`);
    vy.phase?.interact?.(candidate.focus);
  }

  it("walks from the pot, mounts Ember before the heat instruction, and keeps the pose until the dish is ready", async () => {
    await resume(false);
    const stove = L(SPOT.stove.x, SPOT.stove.z);
    const running = startJob("cooking").catch((error: unknown) => {
      if (!(error instanceof VoyageCancelled)) throw error;
    });
    try {
      await advanceUntil(() => vy.phase?.name === "cooking");
      placePlayer(stove.x, stove.z + 2.8, stove.x, stove.z);
      tapTool();
      await advanceUntil(() => Boolean(vy.phase?.candidates?.().some((c) => c.focus.id === "crew:tom")) && getGame().mode === "explore");
      interact("crew:tom");
      await advanceUntil(() => vy.cook.order !== null && getGame().mode === "explore");
      switchTo("leafy", true);
      const crate = SUPPLY_CRATES.find((c) => c.food === vy.cook.order?.food)!;
      interact(`crate:${crate.food}`);
      frame();
      expect(cb.stance.friend).toBeNull();

      const bowSide = L(0, -17.8);
      placePlayer(bowSide.x, bowSide.z, stove.x, stove.z);
      interact("pot");
      await advanceUntil(() => vy.cook.pot !== null);
      expect(getGame().progress.active).toBe("ember");
      expect(rt.player).toMatchObject(bowSide);
      expect(cb.stance.friend).toBeNull();
      expect(vy.hud?.hint).not.toMatch(/^Hold J/);

      let moved = false;
      for (let i = 0; i < 240 && !getGame().line; i++) {
        const { x, z } = rt.player;
        frame();
        const distance = Math.hypot(rt.player.x - x, rt.player.z - z);
        moved ||= distance > .01;
        expect(distance).toBeLessThan(.1);
        expect(shipWalkable(rt.player.x, rt.player.z, PLAYER_R)).toBe(true);
        if (cb.stance.k < .99) expect(vy.hud?.hint).not.toMatch(/^Hold J/);
        await vi.advanceTimersByTimeAsync(20);
      }
      expect(moved).toBe(true);
      expect(getGame().line?.en).toContain("hold J");
      expect(cb.stance.friend).toBe("ember");
      expect(cb.stance.k).toBeGreaterThanOrEqual(.99);
      expect(rt.player).toMatchObject(L(0, STOVE_SOLID.z1 + 1.35));
      expect(Math.cos(rt.player.yaw)).toBeCloseTo(-1);
      for (const solid of [STOVE_SOLID, COUNTER_SOLID]) {
        expect(touches(solid, rt.player.x - SHIP.x, rt.player.z - SHIP.z, playerRadius())).toBe(false);
      }
      frame();
      expect(cb.stance.friend).toBe("ember");
      nextLine();
      await advanceUntil(() => getGame().mode === "explore");
      expect(vy.hud?.hint).toMatch(/^Hold J/);
      pressAttack("basic", "key");
      frame();
      expect(vy.cook.heat).toBeGreaterThan(0);
      expect(vy.fx.some((fx) => fx.kind === "flame" && isPosedToolFx(fx))).toBe(true);

      // Heat retains the pose even away from the original proximity trigger.
      const seat = { x: rt.player.x, z: rt.player.z };
      const outside = L(0, -12);
      placePlayer(outside.x, outside.z, stove.x, stove.z);
      const previousHeat = vy.cook.heat;
      frame();
      expect(cb.stance.friend).toBe("ember");
      expect(vy.cook.heat).toBeLessThan(previousHeat);
      placePlayer(seat.x, seat.z, stove.x, stove.z);
      for (let i = 0; i < 360 && !vy.cook.dish; i++) {
        if (vy.cook.heat > .8) releaseAttack("basic", "key");
        if (vy.cook.heat < .62) pressAttack("basic", "key");
        frame();
        expect(cb.stance.friend).toBe("ember");
      }
      expect(vy.cook.dish).toBe(crate.food);
      releaseAttack("basic", "key");
      frame();
      expect(cb.stance.friend).toBeNull();
      await advanceUntil(() => getGame().mode === "explore");
    } finally {
      resetVoyageRt();
      await vi.advanceTimersByTimeAsync(600);
      await running;
    }
  });

  it("gates all four storm tools on their pose and re-takes it after dialogue", async () => {
    const running = startStorm().catch((error: unknown) => {
      if (!(error instanceof VoyageCancelled)) throw error;
    });
    const tasks = [
      { name: "storm-barrels", friend: "leafy", kind: "vine", at: L(0, 5.5) },
      { name: "storm-fires", friend: "bubbo", kind: "bubble", at: L(0, 4) },
      { name: "storm-sail", friend: "puff", kind: "gust", at: L(0, 5.2) },
      { name: "storm-spar", friend: "leafy", kind: "vine", at: L(-1.6, -9.6) },
    ] as const;
    try {
      for (const { name, friend, kind, at } of tasks) {
        await advanceUntil(() => vy.phase?.name === name && getGame().mode === "explore");
        const phase = vy.phase!;
        const targets = () => name === "storm-barrels" ? vy.barrels.filter((b) => !b.tied)
          : name === "storm-fires" ? vy.fires.filter((f) => !f.t0)
          : name === "storm-sail" ? [SAIL_AIM[1]] : [vy.spar!];
        const face = (target: { x: number; z: number }) => {
          const to = L(target.x, target.z);
          placePlayer(at.x, at.z, to.x, to.z);
        };
        face(targets()[0]);
        expect(getGame().progress.active).toBe(friend);
        const before = vy.fx.at(-1)?.id ?? 0;
        pressAttack("basic", "key");
        frame();
        expect(cb.stance.friend).toBe(friend);
        expect(cb.stance.k).toBeLessThan(.99);
        expect(phase.tool?.(friend)).toBe(false);
        expect(vy.fx.some((fx) => fx.id > before && fx.kind === kind)).toBe(false);
        if (name === "storm-sail") expect(vy.sails[1]).toBe(.1);
        releaseAttack("basic", "key");
        await advanceUntil(() => cb.stance.friend === friend && cb.stance.k === 1);

        const dialogue = run(() => say("game", "Hold on!"));
        expect(getGame().line).not.toBeNull();
        frame();
        expect(cb.stance.friend).toBeNull();
        expect(vy.phase).toBe(phase);
        expect(phase.tool?.(friend)).toBe(false);
        nextLine();
        await dialogue;
        expect(phase.tool?.(friend)).toBe(false);
        await advanceUntil(() => cb.stance.friend === friend && cb.stance.k === 1);
        expect(vy.phase).toBe(phase);

        if (name === "storm-sail") {
          pressAttack("basic", "key");
          frame();
          expect(vy.sails[1]).toBeGreaterThan(.1);
        } else {
          face(targets()[0]);
          voyageAttack("basic");
        }
        expect(vy.fx.some((fx) => fx.id > before && fx.kind === kind && isPosedToolFx(fx))).toBe(true);
        if (name === "storm-barrels" || name === "storm-fires") {
          for (const target of targets()) {
            face(target);
            tapTool();
          }
        }
        if (name === "storm-sail") {
          await advanceUntil(() => vy.sewn >= 1);
          releaseAttack("basic", "key");
        }
      }
    } finally {
      releaseAttack("basic", "key");
      resetVoyageRt();
      await vi.advanceTimersByTimeAsync(600);
      await running;
    }
  });

  it("restores the saved hold floor as soon as the ship is available", async () => {
    await resume(true);
    expect(vy.active && vy.inHold).toBe(true);
    expect(rt.player).toMatchObject({ ...holdSpot, y: HOLD_Y });
  });

  it.each([
    { job: "cooking", crew: "pepper", phase: "cooking", friend: "ember", brief: COUNTER_CUSTOMER,
      at: L(0, -13.7), target: L(SPOT.stove.x, SPOT.stove.z), prompts: ["yesICan", "yesICan", "canFire"] },
    { job: "cargo", crew: "bill", phase: "cargo", friend: "leafy", brief: { x: SPOT.bill.x + 1.5, z: -3.9 },
      at: L(-.1, -3.8), target: itemWorld("bag"), prompts: ["yesICan"] },
    { job: "fishing", crew: "finn", phase: "fishing", friend: "bubbo", brief: { x: SPOT.finn.x + 1.3, z: 16.7 },
      at: L(-1.7, 16.75), target: L(-8, 17), prompts: ["yesICan", "yesICan", "howManyFish"] },
    { job: "sailing", crew: "redbeard", phase: "sails", friend: "puff", brief: { x: SPOT.captain.x + 1, z: 10.3 },
      at: L(0, 7.3), target: L(SAIL_AIM[0].x, SAIL_AIM[0].z), prompts: ["yesICan"] },
  ] as const)("poses $friend during the real $job flow", async ({ job, crew, phase, friend, brief, at, target, prompts }) => {
    const below = job === "cargo";
    await resume(below);
    const giver = crewWorld(crew);
    const intro = L(brief.x, brief.z);
    placePlayer(intro.x, intro.z, giver.x, giver.z);
    const running = startJob(job).catch((error: unknown) => {
      if (!(error instanceof VoyageCancelled)) throw error;
    });
    try {
      const answers: PhraseId[] = [];
      for (let i = 0; i < 20 && !vy.phase; i++) {
        const { line, prompt } = getGame();
        if (line) nextLine();
        if (prompt?.status === "ready") {
          const answer = prompt.sentences[0].id;
          answers.push(answer);
          choose(answer);
        }
        await vi.advanceTimersByTimeAsync(600);
      }
      expect(answers).toEqual(prompts);
      expect(vy.phase?.name).toBe(phase);
      expect(getGame()).toMatchObject({ mode: "explore", line: null, progress: { active: friend } });

      placePlayer(at.x, at.z, target.x, target.z);
      frame();
      expect(vy.hud).not.toBeNull();
      expect(vy.inHold).toBe(below);
      if (friend === "puff") {
        expect(cb.stance.friend).toBeNull();
        pressAttack("basic", "key");
        releaseAttack("basic", "key");
      }
      for (let i = 0; i < 30; i++) {
        frame();
        if (below) expect(rt.player.y).toBe(HOLD_Y);
      }
      expect(cb.stance).toMatchObject({ friend, k: 1 });
      if (friend === "puff") expect(vy.fx.some((fx) => fx.kind === "gust" && isPosedToolFx(fx))).toBe(true);
      if (friend === "leafy") {
        pressAttack("basic", "key");
        releaseAttack("basic", "key");
        expect(vy.carry).toEqual({ kind: "cargo", item: "bag" });
        expect(rt.player.y).toBe(HOLD_Y);
      }

      switchTo(friend === "leafy" ? "ember" : "leafy", true);
      for (let i = 0; i < 30; i++) {
        frame();
        if (below) expect(rt.player.y).toBe(HOLD_Y);
      }
      expect(cb.stance).toMatchObject({ friend: null, k: 0, leaving: null });
    } finally {
      resetVoyageRt();
      await vi.advanceTimersByTimeAsync(600);
      await running;
    }
  });
});
