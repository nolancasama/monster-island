import { basicAttack, canFight, cb, specialAttack, stopBreath, stopFire } from "../game/combat";
import { getGame, useGame } from "../game/store";

export type AttackSlot = "basic" | "special";
export type AttackSource = "key" | "mouse" | "touch";

const down = { basic: new Set<AttackSource>(), special: new Set<AttackSource>() };
const held = { basic: new Set<AttackSource>(), special: new Set<AttackSource>() };

export function pressAttack(slot: AttackSlot, source: AttackSource): void {
  if (down[slot].has(source)) return;
  down[slot].add(source);
  if (!canFight()) return;
  held[slot].add(source);
  if (slot === "basic") basicAttack();
  else specialAttack();
}

export function releaseAttack(slot: AttackSlot, source: AttackSource): void {
  down[slot].delete(source);
  held[slot].delete(source);
  if (slot === "basic" && !held.basic.size) { cb.hold = false; stopBreath(); }
}

export function releaseAllAttacks(): void {
  held.basic.clear();
  held.special.clear();
  cb.hold = cb.holdK = false;
  stopFire();
}

export const isAttackHeld = (slot: AttackSlot): boolean => held[slot].size > 0;

// Observe transitions immediately, including panels opened and closed between frames.
useGame.subscribe((g, before) => {
  if (g.progress.active !== before.progress.active) stopFire();
  if (g.screen !== "game" || g.mode !== "explore" || g.journalOpen || g.settingsOpen || g.panel || g.line) releaseAllAttacks();
});

export function installAttackLifecycle(): () => void {
  const hidden = () => { if (document.hidden) releaseAllAttacks(); };
  window.addEventListener("blur", releaseAllAttacks);
  document.addEventListener("visibilitychange", hidden);
  return () => {
    window.removeEventListener("blur", releaseAllAttacks);
    document.removeEventListener("visibilitychange", hidden);
    releaseAllAttacks();
  };
}

/** Mouse chords only emit one pointerdown: reconcile the button bitmask on moves too. */
export function installMouseAttacks(canvas: HTMLCanvasElement): () => void {
  let tracking = false;
  let buttons = 0;
  const update = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" || !tracking) return;
    for (const [slot, bit] of [["basic", 1], ["special", 2]] as const) {
      if (!(e.buttons & bit)) releaseAttack(slot, "mouse");
      else if (!(buttons & bit) && e.target === canvas) pressAttack(slot, "mouse");
    }
    buttons = e.buttons;
    if (!(e.buttons & 3)) tracking = false;
  };
  const start = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" || e.target !== canvas) return;
    // Mouse pointerdown is the transition from no buttons to a fresh chord.
    // Recover from a pointerup lost while the window was blurred.
    releaseAttack("basic", "mouse");
    releaseAttack("special", "mouse");
    buttons = 0;
    tracking = true;
    update(e);
  };
  const cancel = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    tracking = false;
    releaseAttack("basic", "mouse");
    releaseAttack("special", "mouse");
  };
  const context = (e: MouseEvent) => { if (getGame().screen === "game") e.preventDefault(); };
  canvas.addEventListener("pointerdown", start);
  canvas.addEventListener("contextmenu", context);
  window.addEventListener("pointermove", update);
  window.addEventListener("pointerup", update);
  window.addEventListener("pointercancel", cancel);
  return () => {
    canvas.removeEventListener("pointerdown", start);
    canvas.removeEventListener("contextmenu", context);
    window.removeEventListener("pointermove", update);
    window.removeEventListener("pointerup", update);
    window.removeEventListener("pointercancel", cancel);
    releaseAttack("basic", "mouse");
    releaseAttack("special", "mouse");
  };
}
