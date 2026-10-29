import type { FoodId, Text } from "../types";

export interface FoodDef {
  id: FoodId;
  /** The plural used in "Do you like apples?" (fish stays fish). */
  word: string;
  /** "an apple", "a banana", "a fish", "some berries" (for Give). */
  one: string;
  ja: string;
}

export const FOODS: Record<FoodId, FoodDef> = {
  apples: { id: "apples", word: "apples", one: "an apple", ja: "りんご" },
  bananas: { id: "bananas", word: "bananas", one: "a banana", ja: "バナナ" },
  fish: { id: "fish", word: "fish", one: "a fish", ja: "さかな" },
  berries: { id: "berries", word: "berries", one: "some berries", ja: "ベリー" },
  meat: { id: "meat", word: "meat", one: "some meat", ja: "おにく" }
};

/** Foods on the island in this build, in the order the question cards show them. */
export const ISLAND_FOODS: FoodId[] = ["apples", "bananas", "fish", "berries"];

/** Meat question cards unlock with the volcano route, after the Phase 2 ending. */
export function islandFoods(p: { endings: number }): FoodId[] {
  return p.endings >= 2 ? [...ISLAND_FOODS, "meat"] : [...ISLAND_FOODS];
}

/** How many of one food fit in the bag. */
export const BAG_MAX = 99;

export const FOOD_LABEL = (id: FoodId): Text => ({ en: FOODS[id].word, ja: FOODS[id].ja });
