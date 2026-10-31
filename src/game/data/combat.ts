import type { FoodId, MonsterId, Text } from "../types";
import type { EnemyKind as LowlandEnemyKind } from "../world/lowland";

export type CloudEnemyKind = "stormCrab" | "windSprite" | "raiderDrone" | "raiderShooter" | "thunderBeetle";
export type EnemyKind = LowlandEnemyKind | CloudEnemyKind;

/**
 * Act 2 combat as data: each companion's two moves, the enemies, food
 * recovery, shop prices and the treat recipes. Rules that use these live in
 * logic/act2.ts (pure) and combat.ts (the per-frame simulation).
 */

/** Friends who fight beside the player (Lumo never does). */
export type CompanionId = Exclude<MonsterId, "lumo">;
export const COMPANION_IDS: CompanionId[] = ["leafy", "bubbo", "puff", "ember"];

/**
 * Where a companion goes when a hostile area is entered: on the player's
 * backpack, on a shoulder, or carrying the player (who rides it).
 */
export type Stance = "back" | "shoulder" | "ride";

export interface MoveDef {
  /** The English command shown on the button. */
  word: string;
  /** What the move is called in the trainer's list. */
  name: Text;
  hint: Text;
  shape: "breath" | "inferno" | "trap" | "bomb" | "grab" | "snare" | "blast" | "cyclone";
  damage: number;
  /** Seconds before it can be used again. */
  cooldown: number;
  /** Reach (m): melee reach, projectile range, beam length or burst radius. */
  range: number;
  /** Projectile speed (m/s), for projectile shapes. */
  speed?: number;
  /** Hit radius of a projectile or the width of a beam. */
  radius: number;
  knock: number;
  stun: number;
  /** MP spent (specials only). */
  cost: number;
}

export interface CompanionCombat {
  stance: Stance;
  basic: MoveDef;
  special: MoveDef;
  /** The upgrade a treat teaches, and what it changes. */
  upgrade: { name: Text; damage: number; size: number; twin?: boolean };
}

export const COMBAT: Record<CompanionId, CompanionCombat> = {
  leafy: {
    stance: "back",
    basic: { word: "Grab!", name: { en: "Vine Grab", ja: "つるで つかむ" }, hint: { en: "Grab, swing and fling an enemy ahead.", ja: "まえの てきを つかんで ふりまわす" }, shape: "grab", damage: 8, cooldown: 0.75, range: 4.5, radius: 2.2, knock: 5, stun: 0, cost: 0 },
    special: { word: "Stop!", name: { en: "Root Snare", ja: "ねっこの わな" }, hint: { en: "Roots stop enemies ahead.", ja: "まえの てきを ねっこで とめる" }, shape: "snare", damage: 6, cooldown: 2, range: 4, radius: 3.2, knock: 0, stun: 0, cost: 30 },
    upgrade: { name: { en: "Double Grab", ja: "ダブルグラブ" }, damage: 1, size: 1 }
  },
  bubbo: {
    stance: "ride",
    basic: { word: "Bubble!", name: { en: "Bubble Trap", ja: "あわの わな" }, hint: { en: "Lift an enemy in a bubble, then pop.", ja: "あわで てきを うかせて わる" }, shape: "trap", damage: 0, cooldown: 0.6, range: 10, speed: 10, radius: 0.8, knock: 0, stun: 0, cost: 0 },
    special: { word: "Pop!", name: { en: "Bubble Bomb", ja: "あわの ばくだん" }, hint: { en: "A big bubble bursts over an area.", ja: "おおきな あわが はじける" }, shape: "bomb", damage: 22, cooldown: 1.6, range: 11, speed: 9, radius: 3, knock: 4, stun: 0, cost: 30 },
    upgrade: { name: { en: "Big Bubble", ja: "ビッグバブル" }, damage: 1, size: 1 }
  },
  puff: {
    stance: "shoulder",
    basic: { word: "Blow!", name: { en: "Wind Blast", ja: "かぜの いぶき" }, hint: { en: "Blow enemies and bubbles away.", ja: "かぜで てきや あわを とばす" }, shape: "blast", damage: 5, cooldown: 0.55, range: 5, radius: 0, knock: 9, stun: 0, cost: 0 },
    special: { word: "Spin!", name: { en: "Cyclone", ja: "サイクロン" }, hint: { en: "A travelling whirlwind carries enemies.", ja: "たつまきが てきを はこぶ" }, shape: "cyclone", damage: 4, cooldown: 2.5, range: 7.2, speed: 1.8, radius: 1.4, knock: 0, stun: 0, cost: 30 },
    upgrade: { name: { en: "Big Wind", ja: "ビッグウィンド" }, damage: 1, size: 1.3 }
  },
  ember: {
    stance: "ride",
    basic: { word: "Fire!", name: { en: "Fire Breath", ja: "ほのおの いき" }, hint: { en: "Breathe fire ahead and ignite enemies.", ja: "まえに ほのおを はいて てきを もやす" }, shape: "breath", damage: 7, cooldown: 0.55, range: 4.2, radius: 0, knock: 0, stun: 0, cost: 0 },
    special: { word: "Burn!", name: { en: "Inferno", ja: "インフェルノ" }, hint: { en: "A wide burst of lasting flame.", ja: "ひろい ほのおで もやしつづける" }, shape: "inferno", damage: 6, cooldown: 2.5, range: 6, radius: 0, knock: 0, stun: 0, cost: 15 },
    upgrade: { name: { en: "Big Flame", ja: "ビッグフレイム" }, damage: 1, size: 1.3 }
  }
};

export interface EnemyDef {
  name: Text;
  weightClass: "light" | "medium" | "heavy";
  hp: number;
  /** Damage to the player's HP per landed attack. */
  damage: number;
  /** Walking and chasing speed (m/s); snapjaws charge faster when they lunge. */
  speed: number;
  lunge: number;
  /** Notices the player within this distance; gives up beyond `leash` from home. */
  notice: number;
  leash: number;
  /** Starts its wind-up within this distance; the hit lands within `reach`. */
  windupAt: number;
  reach: number;
  /** Seconds of the visible wind-up before the attack. */
  windup: number;
  recover: number;
  coins: [number, number];
  /** Chance of also dropping food, and of dropping amber. */
  foodChance: number;
  amberChance: number;
  radius: number;
  /** Knock-back multiplier (heavy enemies barely move). */
  weight: number;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  gloomlet: { name: { en: "Gloomlet", ja: "グルームレット" }, weightClass: "light", hp: 20, damage: 6, speed: 2.2, lunge: 4.2, notice: 7, leash: 13, windupAt: 2, reach: 1.3, windup: 0.75, recover: 1.1, coins: [2, 4], foodChance: 0.08, amberChance: 0.02, radius: 0.42, weight: 1 },
  snapjaw: { name: { en: "Snapjaw", ja: "スナップジョー" }, weightClass: "medium", hp: 44, damage: 10, speed: 2.7, lunge: 6.5, notice: 8, leash: 14, windupAt: 3, reach: 1.5, windup: 0.85, recover: 1.3, coins: [5, 7], foodChance: 0.12, amberChance: 0.04, radius: 0.55, weight: 0.8 },
  shellback: { name: { en: "Shellback", ja: "シェルバック" }, weightClass: "heavy", hp: 80, damage: 14, speed: 1.5, lunge: 3.5, notice: 7, leash: 12, windupAt: 2.2, reach: 1.8, windup: 1.0, recover: 1.5, coins: [10, 14], foodChance: 0.2, amberChance: 0.15, radius: 0.75, weight: 0.35 },
  forestSpitter: { name: { en: "Forest Spitter", ja: "もりのスピッター" }, weightClass: "light", hp: 20, damage: 5, speed: 2, lunge: 0, notice: 10, leash: 16, windupAt: 9, reach: 0.6, windup: 0.8, recover: 2.5, coins: [2, 4], foodChance: 0.08, amberChance: 0.02, radius: 0.42, weight: 1 },
  raiderShooter: { name: { en: "Raider Shooter", ja: "レイダーシューター" }, weightClass: "medium", hp: 44, damage: 6, speed: 2, lunge: 0, notice: 10, leash: 16, windupAt: 9, reach: 0.6, windup: 0.8, recover: 2.5, coins: [5, 7], foodChance: 0.12, amberChance: 0.04, radius: 0.5, weight: 0.85 },
  stormCrab: { name: { en: "Storm Crab", ja: "ストームクラブ" }, weightClass: "medium", hp: 48, damage: 10, speed: 2.1, lunge: 7, notice: 8, leash: 15, windupAt: 3.6, reach: 1.5, windup: 0.85, recover: 1.4, coins: [5, 8], foodChance: 0.12, amberChance: 0.04, radius: 0.62, weight: 0.65 },
  windSprite: { name: { en: "Wind Sprite", ja: "かぜのせい" }, weightClass: "light", hp: 30, damage: 5, speed: 2, lunge: 0, notice: 10, leash: 15, windupAt: 9, reach: 0.6, windup: 0.8, recover: 2.5, coins: [4, 7], foodChance: 0.12, amberChance: 0.03, radius: 0.42, weight: 1.1 },
  raiderDrone: { name: { en: "Raider Drone", ja: "レイダードローン" }, weightClass: "medium", hp: 45, damage: 10, speed: 2.5, lunge: 10, notice: 9, leash: 16, windupAt: 5.5, reach: 1.2, windup: 1.05, recover: 1.6, coins: [6, 9], foodChance: 0.08, amberChance: 0.06, radius: 0.5, weight: 0.85 },
  thunderBeetle: { name: { en: "Thunder Beetle", ja: "サンダービートル" }, weightClass: "heavy", hp: 65, damage: 12, speed: 1.6, lunge: 0, notice: 8, leash: 13, windupAt: 3, reach: 2.8, windup: 1.1, recover: 1.8, coins: [8, 12], foodChance: 0.16, amberChance: 0.1, radius: 0.7, weight: 0.45 }
};

export const MAX_HP = 100;
export const MAX_MP = 100;
/** MP every companion regains per second. */
export const MP_REGEN = 2;
/** HP after a knock-out (back at the last rest point). */
export const KO_HP = 60;

/**
 * Food restores the player's HP and the MP of the friend who loves it
 * (the favourites from the prologue). Bananas are nobody's favourite.
 */
export const FOOD_RESTORE: Record<FoodId, { hp: number; mp: number; friend: CompanionId | null }> = {
  apples: { hp: 15, mp: 30, friend: "leafy" },
  fish: { hp: 15, mp: 30, friend: "bubbo" },
  berries: { hp: 15, mp: 30, friend: "puff" },
  meat: { hp: 15, mp: 30, friend: "ember" },
  bananas: { hp: 20, mp: 0, friend: null }
};

/** Market prices in Monster Coins. */
export const PRICES: Record<FoodId, number> = { apples: 5, bananas: 4, fish: 8, berries: 6, meat: 10 };
/** The Seaside Inn's price, paid only after accepting a room. */
export const INN_PRICE = 10;

export interface Recipe {
  friend: CompanionId;
  treat: Text;
  foods: [FoodId, FoodId];
  amber: number;
}
/** One treat per friend: two foods and one amber. Eating it teaches the friend's upgrade. */
export const RECIPES: Record<CompanionId, Recipe> = {
  leafy: { friend: "leafy", treat: { en: "Leaf Cake", ja: "はっぱケーキ" }, foods: ["apples", "berries"], amber: 1 },
  bubbo: { friend: "bubbo", treat: { en: "Bubble Pie", ja: "あわパイ" }, foods: ["fish", "bananas"], amber: 1 },
  puff: { friend: "puff", treat: { en: "Cloud Candy", ja: "くもキャンディ" }, foods: ["berries", "bananas"], amber: 1 },
  ember: { friend: "ember", treat: { en: "Fire Stew", ja: "ほのおシチュー" }, foods: ["meat", "apples"], amber: 1 }
};
