import type { Text } from "../types";
import type { CompanionId } from "./combat";

/**
 * Coach Rex's combos (docs/PORT_TOWN_REVAMP.md §4): one per friend, a bonus on
 * an event the fight already has. A lesson also teaches the friend's bigger
 * move (the old treat upgrade in COMBAT[f].upgrade).
 */

export type ComboKind = "bonk" | "splash" | "slam" | "blaze";

export interface ComboDef {
  friend: CompanionId;
  kind: ComboKind;
  name: Text;
  /** The English sound word in the popup ("Bonk!"; counts become "Bonk x2!"). */
  call: string;
  rule: Text;
  /** The bigger move that comes with the lesson. */
  extra: Text;
  color: string;
  /** Amber a lesson costs. */
  amber: number;
}

export const COMBOS: Record<CompanionId, ComboDef> = {
  leafy: {
    friend: "leafy", kind: "bonk", name: { en: "Bonk Combo", ja: "ボンク コンボ" }, call: "Bonk!",
    rule: { en: "Leafy combo! Hit one enemy into another enemy!", ja: "リーフィの コンボ! てきを べつの てきに ぶつけよう!" },
    extra: { en: "Leafy can grab two enemies, too!", ja: "リーフィは てきを 2ひき つかめるよ!" },
    color: "#5fd35a", amber: 1,
  },
  bubbo: {
    friend: "bubbo", kind: "splash", name: { en: "Splash Combo", ja: "スプラッシュ コンボ" }, call: "Splash!",
    rule: { en: "Bubbo combo! Hit many enemies at the same time!", ja: "バボの コンボ! いちどに たくさんの てきに あてよう!" },
    extra: { en: "Bubbo can lift bigger enemies, too!", ja: "バボは おおきな てきも あわで うかせるよ!" },
    color: "#4fc3ff", amber: 1,
  },
  puff: {
    friend: "puff", kind: "slam", name: { en: "Slam Combo", ja: "スラム コンボ" }, call: "Slam!",
    rule: { en: "Puff combo! Push enemies into walls!", ja: "パフの コンボ! てきを かべに ぶつけよう!" },
    extra: { en: "Puff's wind gets bigger, too!", ja: "パフの かぜが おおきく なるよ!" },
    color: "#eef3ff", amber: 1,
  },
  ember: {
    friend: "ember", kind: "blaze", name: { en: "Blaze Combo", ja: "ブレイズ コンボ" }, call: "Blaze!",
    rule: { en: "Ember combo! Burn many enemies!", ja: "エンバーの コンボ! たくさんの てきを もやそう!" },
    extra: { en: "Ember's fire gets bigger, too!", ja: "エンバーの ほのおが おおきく なるよ!" },
    color: "#ffb02e", amber: 1,
  },
};

export const COMBO_FRIEND: Record<ComboKind, CompanionId> = { bonk: "leafy", splash: "bubbo", slam: "puff", blaze: "ember" };

/** The only place combo numbers live. */
export const COMBO_TUNING = {
  /** Leafy: a thrown/swung enemy hits another. */
  bonk: { struck: 8, thrown: 4, stun: 0.8 },
  /** Bubbo: one Bubble Bomb damages `min`+ enemies. */
  splash: { min: 2, each: 6, stun: 0.6 },
  /** Puff: a Puff push ends against a solid or a bank faster than `minSpeed`. */
  slam: { minSpeed: 3, damage: 10, stun: 1.0, bounce: 2.5 },
  /** Ember: one fire action sets `min`+ enemies on fire. */
  blaze: { min: 2, flare: 8, extend: 1 },
} as const;

/** The popup text for a combo event that counted `n` victims. */
export function comboCall(kind: ComboKind, n: number): string {
  const call = COMBOS[COMBO_FRIEND[kind]].call;
  return n > 1 ? `${call.slice(0, -1)} x${n}!` : call;
}
