import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { basicAttack, canFight, cb, specialAttack } from "../game/combat";
import { setGame } from "../game/store";
import {
  installAttackLifecycle, installMouseAttacks, isAttackHeld,
  pressAttack, releaseAllAttacks, releaseAttack,
} from "./attackInput";

vi.mock("../game/combat", () => ({
  basicAttack: vi.fn(), specialAttack: vi.fn(), canFight: vi.fn(() => true),
  stopBreath: vi.fn(),
  stopFire: vi.fn(),
  cb: { hold: false, holdK: false },
}));

let win: EventTarget;
let doc: EventTarget & { hidden: boolean };
let canvas: HTMLCanvasElement;
let cleanups: (() => void)[];

function pointer(target: EventTarget, type: string, buttons: number, pointerType = "mouse", eventTarget?: EventTarget) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, { buttons, pointerType });
  if (eventTarget) Object.defineProperty(event, "target", { value: eventTarget });
  target.dispatchEvent(event);
  return event;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(canFight).mockReturnValue(true);
  releaseAllAttacks();
  for (const slot of ["basic", "special"] as const) {
    for (const source of ["key", "mouse", "touch"] as const) releaseAttack(slot, source);
  }
  setGame({ screen: "game", mode: "explore", journalOpen: false, settingsOpen: false, panel: null, line: null });
  win = new EventTarget();
  doc = Object.assign(new EventTarget(), { hidden: false });
  canvas = new EventTarget() as HTMLCanvasElement;
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", doc);
  cleanups = [];
});

afterEach(() => {
  for (const cleanup of cleanups) cleanup();
  vi.unstubAllGlobals();
});

describe("shared attack state", () => {
  it("aggregates sources independently and only fires on a fresh source press", () => {
    pressAttack("basic", "key");
    pressAttack("basic", "key");
    pressAttack("basic", "touch");
    pressAttack("special", "mouse");
    expect(basicAttack).toHaveBeenCalledTimes(2);
    expect(specialAttack).toHaveBeenCalledTimes(1);
    releaseAttack("basic", "key");
    expect(isAttackHeld("basic")).toBe(true);
    releaseAttack("basic", "touch");
    expect(isAttackHeld("basic")).toBe(false);
    expect(isAttackHeld("special")).toBe(true);
  });

  it("release-all clears both slots and combat holds but latches physical presses", () => {
    pressAttack("basic", "key");
    pressAttack("special", "touch");
    cb.hold = cb.holdK = true;
    releaseAllAttacks();
    expect([isAttackHeld("basic"), isAttackHeld("special"), cb.hold, cb.holdK]).toEqual([false, false, false, false]);
    pressAttack("basic", "key");
    pressAttack("special", "touch");
    expect(basicAttack).toHaveBeenCalledTimes(1);
    expect(specialAttack).toHaveBeenCalledTimes(1);
    expect(isAttackHeld("basic")).toBe(false);
    releaseAttack("basic", "key");
    pressAttack("basic", "key");
    expect(isAttackHeld("basic")).toBe(true);
    expect(basicAttack).toHaveBeenCalledTimes(2);
  });

  it("requires release and a fresh press after a denied press", () => {
    vi.mocked(canFight).mockReturnValue(false);
    pressAttack("special", "key");
    vi.mocked(canFight).mockReturnValue(true);
    pressAttack("special", "key");
    expect(isAttackHeld("special")).toBe(false);
    expect(specialAttack).not.toHaveBeenCalled();
    releaseAttack("special", "key");
    pressAttack("special", "key");
    expect(specialAttack).toHaveBeenCalledTimes(1);
  });

  it.each([
    { journalOpen: true }, { settingsOpen: true }, { panel: "shop" as const },
    { line: { id: 1, by: "game" as const, en: "Hello" } },
    { mode: "busy" as const }, { screen: "title" as const },
  ])("releases immediately on a disallowed store transition: %j", change => {
    pressAttack("basic", "key");
    setGame(change);
    setGame({ screen: "game", mode: "explore", journalOpen: false, settingsOpen: false, panel: null, line: null });
    expect(isAttackHeld("basic")).toBe(false);
    pressAttack("basic", "key");
    expect(basicAttack).toHaveBeenCalledTimes(1);
  });

  it("releases on blur and hidden visibility and removes lifecycle listeners", () => {
    const cleanup = installAttackLifecycle();
    cleanups.push(cleanup);
    pressAttack("basic", "key");
    win.dispatchEvent(new Event("blur"));
    expect(isAttackHeld("basic")).toBe(false);
    releaseAttack("basic", "key");
    pressAttack("basic", "key");
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(isAttackHeld("basic")).toBe(true);
    doc.hidden = true;
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(isAttackHeld("basic")).toBe(false);
    cleanup();
    releaseAttack("basic", "key");
    pressAttack("basic", "key");
    win.dispatchEvent(new Event("blur"));
    expect(isAttackHeld("basic")).toBe(true);
  });
});

describe("canvas mouse attacks", () => {
  it("reconciles a left/right chord from buttons on window moves and releases", () => {
    cleanups.push(installMouseAttacks(canvas));
    pointer(canvas, "pointerdown", 1);
    pointer(win, "pointermove", 3, "mouse", canvas);
    pointer(win, "pointermove", 3, "mouse", canvas);
    expect(basicAttack).toHaveBeenCalledTimes(1);
    expect(specialAttack).toHaveBeenCalledTimes(1);
    pointer(win, "pointerup", 2);
    expect(isAttackHeld("basic")).toBe(false);
    expect(isAttackHeld("special")).toBe(true);
    pointer(win, "pointerup", 0);
    expect(isAttackHeld("special")).toBe(false);
    pointer(win, "pointermove", 1);
    expect(isAttackHeld("basic")).toBe(false);
  });

  it("ignores touch and presses outside the canvas", () => {
    cleanups.push(installMouseAttacks(canvas));
    pointer(canvas, "pointerdown", 1, "touch");
    pointer(win, "pointerdown", 1);
    pointer(win, "pointermove", 3);
    expect(basicAttack).not.toHaveBeenCalled();
    expect(specialAttack).not.toHaveBeenCalled();
  });

  it("does not start a chord button over the HUD or rearm held buttons after release-all", () => {
    cleanups.push(installMouseAttacks(canvas));
    pointer(canvas, "pointerdown", 1);
    pointer(win, "pointermove", 3); // the second button started outside the canvas
    pointer(win, "pointermove", 3, "mouse", canvas);
    expect(specialAttack).not.toHaveBeenCalled();
    releaseAllAttacks();
    pointer(win, "pointermove", 3, "mouse", canvas);
    expect(isAttackHeld("basic")).toBe(false);
    pointer(win, "pointerup", 0);
    pointer(canvas, "pointerdown", 3);
    expect(basicAttack).toHaveBeenCalledTimes(2);
    expect(specialAttack).toHaveBeenCalledTimes(1);
  });

  it("releases on pointer cancellation and removes mouse listeners on cleanup", () => {
    const cleanup = installMouseAttacks(canvas);
    cleanups.push(cleanup);
    pointer(canvas, "pointerdown", 3);
    pointer(win, "pointercancel", 0);
    expect([isAttackHeld("basic"), isAttackHeld("special")]).toEqual([false, false]);
    pointer(canvas, "pointerdown", 3);
    cleanup();
    expect([isAttackHeld("basic"), isAttackHeld("special")]).toEqual([false, false]);
    pointer(canvas, "pointerdown", 3);
    expect(basicAttack).toHaveBeenCalledTimes(2);
    expect(specialAttack).toHaveBeenCalledTimes(2);
  });

  it("suppresses context menus only on the game canvas and removes the listener", () => {
    const cleanup = installMouseAttacks(canvas);
    cleanups.push(cleanup);
    expect(pointer(canvas, "contextmenu", 2).defaultPrevented).toBe(true);
    expect(pointer(win, "contextmenu", 2).defaultPrevented).toBe(false);
    setGame({ screen: "title" });
    expect(pointer(canvas, "contextmenu", 2).defaultPrevented).toBe(false);
    setGame({ screen: "game" });
    cleanup();
    expect(pointer(canvas, "contextmenu", 2).defaultPrevented).toBe(false);
  });
});
