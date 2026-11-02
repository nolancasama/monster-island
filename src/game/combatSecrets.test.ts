import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { basicAttack, cb, combatTick, elementObjectStates, resetCombat, specialAttack } from "./combat";
import { newProgress } from "./logic/progress";
import { getGame, setGame } from "./store";
import { rt } from "./runtime";
import { ELEMENT_OBJECTS, SECRET_IDS, SECRET_SITES, secretOf } from "./world/elementObjects";
import { STAGES, zoneAt } from "./world/lowland";
import { standY } from "./world/collision";
import { audio } from "../audio/audio";
import type { CompanionId } from "./data/combat";

vi.mock("../audio/audio", () => ({ audio: { play: vi.fn(), voice: vi.fn(), startMusic: vi.fn() } }));

function approach(id: string, friend: CompanionId) {
  const o = ELEMENT_OBJECTS.find(o => o.id === id)!;
  const at = id === "leafyStatuesEast" ? { x: 72, z: -249.5 } : SECRET_SITES[secretOf(o)].approach;
  rt.player.x = at.x; rt.player.z = at.z;
  rt.player.y = standY(at.x, at.z, getGame().progress.solved);
  rt.player.yaw = Math.atan2(o.x - at.x, o.z - at.z);
  setGame(s => ({ progress: { ...s.progress, active: friend } }));
  cb.zones.current = zoneAt(at.x, at.z);
  cb.stance = { friend, k: 1, fromX: at.x, fromZ: at.z, leaving: null, leaveK: 0 };
  rt.time += 1;
}
function advance(seconds: number) {
  for (let t = 0; t < seconds - 1e-9; t += .05) {
    const dt = Math.min(.05, seconds - t);
    rt.time += dt;
    combatTick(dt);
  }
}
const state = (id: string) => elementObjectStates().find(o => o.id === id)!;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("window", { setTimeout });
  const p = newProgress();
  for (const m of Object.values(p.monsters)) m.friend = m.discovered = true;
  p.endings = 3;
  p.act2 = { ...p.act2, started: true, lumoTaken: true, cleared: [...STAGES] };
  setGame({ progress: p, screen: "game", mode: "explore", journalOpen: false, settingsOpen: false, toasts: [] });
  rt.world = "home"; rt.time = 10; rt.effects = [];
  resetCombat();
  for (const e of cb.enemies) e.state = "gone";
  vi.clearAllMocks();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("shared move/object dispatch", () => {
  it("solves every secret with one free J per elemental step", () => {
    approach("emberThicket", "ember");
    expect(basicAttack()).toBe(true);
    expect(state("emberThicket").state).toBe("burning");
    expect(cb.breath).toMatchObject({ age: 0, tick: .25 });
    // A tap releases before the next simulation frame; object ignition already landed.
    cb.hold = false;
    advance(1.5);
    expect(cb.breath).toBeNull();
    expect(getGame().progress.act2.secrets).toContain("emberThicket");

    approach("bubboLedgeKey", "bubbo");
    expect(basicAttack()).toBe(true);
    advance(.5);
    expect(getGame().progress.act2.secrets).toContain("bubboLedgeKey");

    approach("leafyStatues", "leafy");
    expect(basicAttack()).toBe(true);
    advance(.15);
    expect(state("leafyStatues").state).toBe("pulled");
    approach("leafyStatuesEast", "leafy");
    expect(basicAttack()).toBe(true);
    advance(.15);
    expect(getGame().progress.act2.secrets).toContain("leafyStatues");

    approach("puffLeaves", "puff");
    expect(basicAttack()).toBe(true);
    expect(state("puffLeaves").state).toBe("cleared");
    rt.player.x = 112; rt.player.z = -208;
    advance(.05);
    expect(getGame().progress.act2.secrets).toContain("puffLeaves");

    approach("comboCrateLift", "leafy");
    expect(basicAttack()).toBe(true);
    advance(.15);
    expect(state("comboCrateLift").state).toBe("onPad");
    approach("comboCrateLift", "bubbo");
    expect(basicAttack()).toBe(true);
    advance(.5);
    expect(getGame().progress.act2.secrets).toContain("comboCrateLift");

    approach("comboFurnace", "ember");
    expect(basicAttack()).toBe(true);
    expect(state("comboFurnace")).toMatchObject({ state: "lit", remaining: 8 });
    approach("comboFurnace", "puff");
    expect(basicAttack()).toBe(true);
    for (const id of ["groveDryReeds", "canopyDryReeds"]) {
      approach(id, "ember");
      expect(basicAttack()).toBe(true);
      expect(state(id).state).toBe("burning");
      cb.hold = false;
      advance(1.5);
      expect(getGame().progress.act2.secrets).toContain(id);
    }
    expect(getGame().progress.act2.secrets).toHaveLength(SECRET_IDS.length);
    expect(cb.vitals.mp).toEqual({ ember: 100, bubbo: 100, leafy: 100, puff: 100 });
    expect(rt.effects.filter(e => e.kind === "sparkle")).toHaveLength(SECRET_IDS.length);
    expect(vi.mocked(audio.play).mock.calls.filter(([name]) => name === "sparkle")).toHaveLength(SECRET_IDS.length);
    expect(getGame().toasts.at(-1)).toMatchObject({ en: "Secret found!", ja: "ひみつを みつけた!" });
    const completed = getGame().progress.act2.secrets;
    resetCombat();
    expect(cb.elementObjects).toEqual({});
    expect(elementObjectStates().every(o => o.state === "complete")).toBe(true);
    expect(getGame().progress.act2.secrets).toBe(completed);
  });

  it("Vine Grab chooses a closer object, and chooses an enemy when it is closer", () => {
    approach("comboCrateLift", "leafy");
    const e = cb.enemies[9];
    Object.assign(e, { state: "chase", zone: "grove", x: 43, z: -227, hp: 100 });
    expect(basicAttack()).toBe(true);
    advance(.15);
    expect(state("comboCrateLift").state).toBe("onPad");
    expect(e.hp).toBe(100);
    cb.elementObjects = {};
    rt.time += 1;
    e.x = 43; e.z = -230;
    expect(basicAttack()).toBe(true);
    advance(.15);
    expect(state("comboCrateLift").state).toBe("intact");
    expect(e.hp).toBeLessThan(100);
  });

  it("the wrong friend's J, and objects outside the facing cone, remain unchanged", () => {
    approach("emberThicket", "puff");
    expect(basicAttack()).toBe(true);
    expect(state("emberThicket").state).toBe("intact");
    approach("emberThicket", "ember");
    rt.player.yaw += Math.PI;
    expect(basicAttack()).toBe(true);
    expect(state("emberThicket").state).toBe("intact");
  });

  it("K cones, root circles, travelling cyclones and bomb paths share the dispatch", () => {
    approach("emberThicket", "ember");
    expect(specialAttack()).toBe(true);
    expect(state("emberThicket").state).toBe("burning");
    cb.inferno = null;
    approach("comboCrateLift", "leafy");
    rt.time += 3;
    expect(specialAttack()).toBe(true);
    expect(state("comboCrateLift").state).toBe("onPad");
    // Root Snare's circle reaches the crate, but its elemental event cannot lift it.
    expect(getGame().progress.act2.secrets).not.toContain("comboCrateLift");
    rt.time += 3;
    approach("puffLeaves", "puff");
    expect(specialAttack()).toBe(true);
    advance(.2);
    expect(state("puffLeaves").state).toBe("cleared");
    approach("bubboLedgeKey", "bubbo");
    rt.time += 3;
    expect(specialAttack()).toBe(true);
    advance(1.5);
    expect(state("bubboLedgeKey").state).toBe("intact");
  });

  it("pauses transient clocks with gameplay and clears partial steps on load/reset", () => {
    approach("comboFurnace", "ember");
    basicAttack();
    setGame({ journalOpen: true });
    advance(10);
    expect(state("comboFurnace").remaining).toBe(8);
    setGame({ journalOpen: false });
    advance(8);
    expect(state("comboFurnace").state).toBe("intact");
    approach("leafyStatues", "leafy");
    basicAttack();
    resetCombat();
    expect(state("leafyStatues").state).toBe("intact");
    expect(getGame().progress.act2.secrets).toEqual([]);
  });
});
