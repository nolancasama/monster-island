import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { basicAttack, cb, combatTick, mounted, playerRadius, resetCombat, specialAttack, steed, voyageOwnsCombat } from "./combat";
import { newProgress } from "./logic/progress";
import { getGame, setGame } from "./store";
import { rt } from "./runtime";
import { region } from "./world/region";
import { isAttackHeld, pressAttack, releaseAllAttacks, releaseAttack } from "../input/attackInput";
import { resetVoyageRt, restoreHold, updateHoldView, vy } from "./voyageRt";
import { hand, isPosedToolFx, L, SAIL_AIM, setPhase, toolFx } from "./voyageSim";
import { BOARDED, crewWorld, resumeVoyage, setScene, voyageCandidates, VoyageCancelled, voyageInteract, voyageSavePoint } from "./flow/voyage";
import { itemWorld, startJob } from "./flow/voyageJobs";
import { choose, nextLine } from "./flow/ask";
import { switchTo } from "./flow/companion";
import { run } from "./flow/script";
import { anchors } from "../scene/anchors";
import { bubboEmitter } from "../scene/voyageAnchors";
import { moveCircle, PLAYER_R } from "./world/collision";
import { COUNTER_CUSTOMER, DECK_Y, HOLD_ENTRY, HOLD_PORTAL, HOLD_Y, inShipArea, shipSolidAt, shipWalkable, SPOT } from "./world/pirateShip";
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

  async function resume(below: boolean, at = below ? holdSpot : BOARDED) {
    const progress = getGame().progress;
    const act3 = progress.act3;
    setGame({ progress: { ...progress, active: "leafy", act3: {
      ...act3, voyage: { ...act3.voyage, stage: "jobs", interrogated: true, ...(below ? { inHold: true } : {}) },
    } } });
    resetVoyageRt();
    Object.assign(rt.player, at, { y: DECK_Y });
    await resumeVoyage();
  }

  function frame() {
    rt.time += 1 / 60;
    tick(1 / 60);
    updateHoldView(rt.player.x, rt.player.z, inShipArea(rt.player.x, rt.player.z));
  }

  it("restores the saved hold floor as soon as the ship is available", async () => {
    await resume(true);
    expect(vy.active && vy.inHold).toBe(true);
    expect(rt.player).toMatchObject({ ...holdSpot, y: HOLD_Y });
    expect(shipWalkable(rt.player.x, rt.player.z, PLAYER_R, true)).toBe(true);
    frame();
    expect(rt.player).toMatchObject({ ...holdSpot, y: HOLD_Y, fall: null });
  });

  it("moves an old hold save blocked by the new table to the clear stair foot", async () => {
    const coveredByTable = L(2.6, -7.25);
    expect(shipWalkable(coveredByTable.x, coveredByTable.z, PLAYER_R, true)).toBe(false);
    await resume(true, coveredByTable);
    const entry = L(HOLD_ENTRY.x, HOLD_ENTRY.z);
    expect(vy.inHold).toBe(true);
    expect(rt.player).toMatchObject({ ...entry, y: HOLD_Y });
    expect(shipWalkable(entry.x, entry.z, PLAYER_R, true)).toBe(true);
    frame();
    expect(rt.player).toMatchObject({ ...entry, y: HOLD_Y, fall: null });
  });

  it("saves the stair foot when the hold view is active on the slope", async () => {
    await resume(true);
    const stair = L(HOLD_ENTRY.x, HOLD_PORTAL.enterZ - 0.1);
    placePlayer(stair.x, stair.z, stair.x, stair.z - 1);
    expect(rt.player.y).toBeGreaterThan(HOLD_Y);
    expect(voyageSavePoint()).toEqual(L(HOLD_ENTRY.x, HOLD_ENTRY.z));
  });

  it("offers and interacts with Bill only on the hold floor, even with a phase candidate", async () => {
    await resume(true);
    const candidate = voyageCandidates().find(({ focus }) => focus.id === "crew:bill");
    expect(candidate).toBeDefined();
    const focus = candidate!.focus;
    const interact = vi.fn();
    const approach = L(SPOT.bill.x + 1.5, SPOT.bill.z);
    restoreHold(false);
    placePlayer(approach.x, approach.z, focus.x, focus.z);
    expect(rt.player.y).toBe(DECK_Y);
    expect(voyageCandidates().some(({ focus }) => focus.id === "crew:bill")).toBe(false);
    setPhase({ name: "cargo", candidates: () => [candidate!], interact });
    expect(voyageCandidates()).toEqual([]);
    voyageInteract(focus);
    expect(interact).not.toHaveBeenCalled();
    restoreHold(true);
    expect(voyageCandidates()).toEqual([]);
    placePlayer(approach.x, approach.z, focus.x, focus.z);
    expect(rt.player.y).toBe(HOLD_Y);
    expect(voyageCandidates()).toEqual([candidate]);
    voyageInteract(focus);
    expect(interact).toHaveBeenCalledWith(focus);
  });

  it.each([
    { job: "cooking", crew: "pepper", phase: "cooking", friend: "ember", brief: COUNTER_CUSTOMER,
      at: L(0, -13.7), target: L(SPOT.stove.x, SPOT.stove.z), prompts: ["yesICan", "yesICan", "canFire"] },
    { job: "cargo", crew: "bill", phase: "cargo", friend: "leafy", brief: { x: SPOT.bill.x + 1.5, z: SPOT.bill.z },
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
      if (below) {
        expect(vy.phase?.candidates?.().some(({ focus }) => focus.id === "crew:bill")).toBe(true);
        restoreHold(false);
        placePlayer(intro.x, intro.z, giver.x, giver.z);
        expect(vy.phase?.candidates?.()).toEqual([]);
        restoreHold(true);
      }

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
