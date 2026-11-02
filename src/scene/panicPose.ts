import { ENEMIES, type EnemyKind } from "../game/data/combat";
import type { EnemyRt } from "../game/combat";

export interface PanicPose { hop: number; lean: number; roll: number; squash: number; shake: number }
export interface EnemyBodyPose extends PanicPose { scale: number; spin: number }
export const emptyBodyPose = (): EnemyBodyPose => ({ hop: 0, lean: 0, roll: 0, squash: 1, shake: 0, scale: 1, spin: 0 });

/** Caller-owned output lets body, attached flames, limbs and bubble share one pose. */
export function panicPose(kind: EnemyKind, i: number, age: number, step: number, out: PanicPose = emptyBodyPose()): PanicPose {
  const beat = Math.sin(step * Math.PI), fast = Math.sin(age * 23 + i);
  out.shake = fast * .025;
  out.squash = 1 + beat * .075;
  out.roll = beat * .12;
  out.lean = .13;
  out.hop = Math.abs(beat) * .23;
  if (kind === "snapjaw") {
    out.hop = Math.abs(beat) * .36; out.lean = -.26; out.roll = beat * .17;
  } else if (kind === "shellback" || kind === "thunderBeetle") {
    out.hop = Math.abs(beat) * .07; out.roll = beat * .19; out.lean = .06; out.squash = 1 + beat * .035;
  } else if (kind === "stormCrab") {
    out.hop = Math.abs(beat) * .09; out.lean = 0; out.roll = beat * .18;
  } else if (kind === "raiderShooter") {
    out.hop = Math.abs(beat) * .12; out.lean = -.1; out.roll = beat * .08;
  } else if (kind === "raiderDrone" || kind === "windSprite") {
    out.hop = .12 + Math.sin(age * 13 + i) * .12; out.lean = .26; out.roll = fast * .16; out.squash = 1;
  }
  return out;
}

/** Also owns the ordinary hop, so plain burning enemies keep attached flames. */
export function enemyBodyPose(e: EnemyRt, t: number, out: EnemyBodyPose): EnemyBodyPose {
  const kind = e.kind, def = ENEMIES[kind];
  const hovering = kind === "windSprite" || kind === "raiderDrone" || kind === "raiderShooter";
  const ranged = kind === "windSprite" || kind === "forestSpitter" || kind === "raiderShooter";
  out.squash = 1 + Math.sin(t * 3 + e.i) * .04;
  out.hop = hovering ? Math.sin(t * 4 + e.i) * .13 : Math.abs(Math.sin(e.step * Math.PI)) * .12;
  out.lean = out.roll = out.shake = out.spin = 0; out.scale = 1;
  if (e.state === "windup") {
    const k = 1 - e.timer / def.windup;
    out.squash = ranged ? 1 + .12 * k : 1 - .22 * Math.min(1, k * 1.6);
    out.scale = ranged ? 1 + .22 * k : 1;
    out.shake = Math.sin(t * 40) * .05 * k;
    out.lean = ranged ? -.06 * k : -.25 * k;
  } else if (e.state === "lunge") { out.squash = 1.15; out.lean = .45;
  } else if (e.state === "stun") { out.lean = Math.sin(t * 9) * .15;
  } else if (e.plunge) {
    // Tips over the lip, then tumbles.
    const age = t - e.plunge.t0;
    out.hop = 0; out.lean = Math.min(1.4, age * 3.2); out.roll = age * 2.4; out.squash = 1;
  } else if (e.state === "ko") {
    const k = 1 - Math.max(0, e.timer) / .9;
    out.hop = Math.sin(k * Math.PI) * .9; out.scale = 1 - k * .6;
  } else if (e.state === "alert") out.hop = Math.sin(((t - e.alertT) / .55) * Math.PI) * .35;
  if (e.panic && e.panic.until > t && e.state !== "ko") panicPose(kind, e.i, t - e.panic.t0, e.step, out);
  const trapped = e.control?.kind === "trapped", carried = e.control?.kind === "carried";
  if (trapped || carried || e.control?.kind === "grabbed") out.hop = 0;
  if (trapped) { out.shake += Math.sin(t * 8 + e.i) * .1; out.roll = Math.sin(t * 7 + e.i) * .12; }
  if (carried) { out.spin = t * 7; out.roll = Math.sin(t * 6) * .3; }
  return out;
}

type LimbDef = { color: string; count: number; height: number; length: number; width: number; style: "arms" | "paddle" | "legs" | "pincers" | "wings" };
export const PANIC_LIMBS: Record<EnemyKind, LimbDef> = {
  gloomlet: { color: "#b58df0", count: 2, height: .62, length: .46, width: .1, style: "arms" },
  forestSpitter: { color: "#a4d268", count: 2, height: .6, length: .46, width: .1, style: "arms" },
  snapjaw: { color: "#3faa8a", count: 2, height: .48, length: .3, width: .09, style: "paddle" },
  shellback: { color: "#4a3a36", count: 4, height: .25, length: .3, width: .12, style: "legs" },
  thunderBeetle: { color: "#39364e", count: 4, height: .25, length: .26, width: .1, style: "legs" },
  stormCrab: { color: "#a5bbcc", count: 2, height: .65, length: .4, width: .12, style: "pincers" },
  raiderShooter: { color: "#9da7b9", count: 2, height: .9, length: .42, width: .09, style: "arms" },
  raiderDrone: { color: "#9da7b9", count: 2, height: .94, length: .28, width: .075, style: "wings" },
  windSprite: { color: "#c4e7ec", count: 2, height: 1.02, length: .28, width: .065, style: "wings" }
};
