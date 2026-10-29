import type { FoodId, MonsterId, Text } from "../types";
import type { EnemyKind } from "../world/lowland";

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
  /** The English command shown on the button ("Whip!"). */
  word: string;
  /** What the move is called in the trainer's list. */
  name: Text;
  shape: "whip" | "bubble" | "wind" | "fireball" | "pull" | "jet" | "gust" | "burst";
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
    basic: { word: "Whip!", name: { en: "Vine Whip", ja: "つるの ムチ" }, shape: "whip", damage: 11, cooldown: 0.45, range: 3.1, radius: 1.2, knock: 2.2, stun: 0.3, cost: 0 },
    special: { word: "Pull!", name: { en: "Vine Pull", ja: "つるで ひっぱる" }, shape: "pull", damage: 22, cooldown: 1.4, range: 8.5, radius: 0.8, knock: 0, stun: 1.6, cost: 25 },
    upgrade: { name: { en: "Super Whip", ja: "スーパームチ" }, damage: 1.6, size: 1.35 }
  },
  bubbo: {
    stance: "ride",
    basic: { word: "Splash!", name: { en: "Water Bubble", ja: "みずの あわ" }, shape: "bubble", damage: 10, cooldown: 0.45, range: 10, speed: 12, radius: 0.45, knock: 2.5, stun: 0.3, cost: 0 },
    special: { word: "Push!", name: { en: "Water Jet", ja: "みずの ジェット" }, shape: "jet", damage: 26, cooldown: 1.6, range: 9, radius: 0.9, knock: 7, stun: 0.9, cost: 30 },
    upgrade: { name: { en: "Big Bubble", ja: "ビッグバブル" }, damage: 1.6, size: 1.7 }
  },
  puff: {
    stance: "shoulder",
    basic: { word: "Fly!", name: { en: "Wind Shot", ja: "かぜの たま" }, shape: "wind", damage: 9, cooldown: 0.4, range: 11, speed: 14, radius: 0.4, knock: 3, stun: 0.25, cost: 0 },
    special: { word: "Blow!", name: { en: "Strong Gust", ja: "つよい かぜ" }, shape: "gust", damage: 14, cooldown: 1.5, range: 7, radius: 1.2, knock: 9, stun: 1.3, cost: 25 },
    upgrade: { name: { en: "Twin Wind", ja: "ダブルウィンド" }, damage: 1, size: 1.15, twin: true }
  },
  ember: {
    stance: "ride",
    basic: { word: "Fire!", name: { en: "Fireball", ja: "ファイアボール" }, shape: "fireball", damage: 12, cooldown: 0.5, range: 10, speed: 11, radius: 0.45, knock: 2.5, stun: 0.3, cost: 0 },
    special: { word: "Burn!", name: { en: "Flame Burst", ja: "ほのおの バースト" }, shape: "burst", damage: 30, cooldown: 1.6, range: 4.6, radius: 4.6, knock: 4.5, stun: 0.8, cost: 30 },
    upgrade: { name: { en: "Big Fireball", ja: "ビッグファイア" }, damage: 1.6, size: 1.7 }
  }
};

export interface EnemyDef {
  name: Text;
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
  gloomlet: { name: { en: "Gloomlet", ja: "グルームレット" }, hp: 20, damage: 6, speed: 2.2, lunge: 4.2, notice: 7, leash: 13, windupAt: 2, reach: 1.3, windup: 0.75, recover: 1.1, coins: [2, 4], foodChance: 0.08, amberChance: 0.02, radius: 0.42, weight: 1 },
  snapjaw: { name: { en: "Snapjaw", ja: "スナップジョー" }, hp: 44, damage: 10, speed: 2.7, lunge: 6.5, notice: 8, leash: 14, windupAt: 3, reach: 1.5, windup: 0.85, recover: 1.3, coins: [5, 7], foodChance: 0.12, amberChance: 0.04, radius: 0.55, weight: 0.8 },
  shellback: { name: { en: "Shellback", ja: "シェルバック" }, hp: 80, damage: 14, speed: 1.5, lunge: 3.5, notice: 7, leash: 12, windupAt: 2.2, reach: 1.8, windup: 1.0, recover: 1.5, coins: [10, 14], foodChance: 0.2, amberChance: 0.15, radius: 0.75, weight: 0.35 }
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
