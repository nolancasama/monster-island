import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { basicAttack, cb, combatTick, resetCombat, specialAttack, voyageOwnsCombat } from "./combat";
import { newProgress } from "./logic/progress";
import { setGame } from "./store";
import { rt } from "./runtime";
import { region } from "./world/region";
import { isAttackHeld, pressAttack, releaseAllAttacks, releaseAttack } from "../input/attackInput";
import { resetVoyageRt, vy } from "./voyageRt";
import { setPhase } from "./voyageSim";
import { BOARDED, setScene } from "./flow/voyage";

vi.mock("../audio/audio", () => ({ audio: { play: vi.fn(), voice: vi.fn(), startMusic: vi.fn(), cancelPanic: vi.fn(), stopFlame: vi.fn() } }));

/** Aboard the pirate ship (docs/PIRATE_VOYAGE.md): J is the job tool, never ordinary combat. */
beforeEach(() => {
  const progress = newProgress();
  progress.act2.started = progress.act2.harbor = true;
  progress.act2.descended = true;
  progress.active = "ember";
  for (const id of ["leafy", "bubbo", "puff", "ember"] as const) progress.monsters[id] = { ...progress.monsters[id], friend: true };
  setGame({ screen: "game", mode: "explore", journalOpen: false, settingsOpen: false, panel: null, line: null, progress });
  region.world = "home";
  region.layer = "ground";
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

  it("a held J stays held for the job (Ember's stove) and never becomes an attack", () => {
    pressAttack("basic", "key");
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
