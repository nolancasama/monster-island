import type { Text } from "../types";
import type { CompanionId } from "./combat";

/**
 * Ms. Button's clothes: funny hats and glasses for the player and the friends
 * (docs/PORT_TOWN_REVAMP.md §3). Each item is bought once with coins and worn
 * by one character at a time, in the slot the item decides. A bonus helps the
 * whole team while anyone wears the item; each stat is on exactly one item.
 */

export type WearSlot = "head" | "face";
export const WEAR_SLOTS: WearSlot[] = ["head", "face"];
export type Wearer = "player" | CompanionId;
/** Also the order in which a duplicated wearer keeps an item when a save is read. */
export const WEARERS: Wearer[] = ["player", "leafy", "bubbo", "puff", "ember"];
export type WearStat = "power" | "push" | "speed" | "defense" | "coins" | "combo";
export const WEAR_STATS: WearStat[] = ["power", "push", "speed", "defense", "coins", "combo"];

export const WEARABLE_IDS = [
  "partyHat", "bigBow", "flowerCrown", "babyBonnet", "bandana", "explorerHat", "pirateHat", "knightHelmet", "crown",
  "mustache", "sunglasses", "heartGlasses", "goggles",
] as const;
export type WearableId = (typeof WEARABLE_IDS)[number];

export interface WearableDef {
  id: WearableId;
  name: Text;
  /** What Ms. Button says when the item is tapped. */
  line: string;
  slot: WearSlot;
  /** Who may wear it: anyone, the player only, or the friends only. */
  who: "everyone" | "player" | "friends";
  /** Price in Monster Coins. */
  price: number;
  stat: WearStat | null;
  /** Main colours, shared by the 3D model and the shop icon. */
  colors: string[];
}

const def = (id: WearableId, en: string, ja: string, line: string, slot: WearSlot, who: WearableDef["who"], price: number, stat: WearStat | null, colors: string[]): WearableDef =>
  ({ id, name: { en, ja }, line, slot, who, price, stat, colors });

export const WEARABLES: Record<WearableId, WearableDef> = {
  partyHat: def("partyHat", "Party Hat", "パーティーハット", "This is a party hat.", "head", "everyone", 10, null, ["#ff5fa2", "#ffd23f", "#4fc3ff"]),
  bigBow: def("bigBow", "Big Bow", "おおきな リボン", "This is a big bow.", "head", "everyone", 15, null, ["#ff4f8b", "#d93a72"]),
  flowerCrown: def("flowerCrown", "Flower Crown", "はなの かんむり", "This is a flower crown.", "head", "everyone", 15, null, ["#5fb85a", "#ff8fc8", "#ffe15a"]),
  babyBonnet: def("babyBonnet", "Baby Bonnet", "あかちゃんの ぼうし", "This is a baby bonnet.", "head", "friends", 15, null, ["#bfe6ff", "#ffffff", "#ff9db8"]),
  bandana: def("bandana", "Bandana", "バンダナ", "This is a bandana.", "head", "everyone", 30, "power", ["#e8443a", "#ffffff"]),
  explorerHat: def("explorerHat", "Explorer Hat", "たんけんの ぼうし", "This is an explorer hat.", "head", "player", 35, "speed", ["#d8b77a", "#6b4a2b"]),
  pirateHat: def("pirateHat", "Pirate Hat", "かいぞくの ぼうし", "This is a pirate hat.", "head", "everyone", 40, "coins", ["#2a2a33", "#ffd23f", "#ffffff"]),
  knightHelmet: def("knightHelmet", "Knight Helmet", "きしの かぶと", "This is a knight helmet.", "head", "everyone", 45, "defense", ["#c9d2dc", "#e8443a", "#4a5560"]),
  crown: def("crown", "Crown", "おうかん", "This is a crown.", "head", "everyone", 100, "combo", ["#ffcc33", "#e8443a", "#4fc3ff"]),
  mustache: def("mustache", "Funny Mustache", "おもしろい ひげ", "This is a funny mustache.", "face", "everyone", 10, null, ["#5a3a22"]),
  sunglasses: def("sunglasses", "Sunglasses", "サングラス", "These are sunglasses.", "face", "everyone", 20, null, ["#2a2a33", "#3a4660"]),
  heartGlasses: def("heartGlasses", "Heart Glasses", "ハートの めがね", "These are heart glasses.", "face", "everyone", 20, null, ["#ff4f8b", "#ff9dc4"]),
  goggles: def("goggles", "Goggles", "ゴーグル", "These are goggles.", "face", "everyone", 30, "push", ["#8a5a2b", "#bfe6ff", "#c9a44a"]),
};

/** The team-wide bonus of each stat while its item is worn (fractions, except coins per pickup). */
export const STAT_BONUS: Record<WearStat, number> = { power: 0.1, push: 0.25, speed: 0.08, defense: 0.2, coins: 1, combo: 0.5 };

export const STAT_BLURB: Record<WearStat | "none", Text> = {
  power: { en: "Stronger hits!", ja: "こうげき アップ!" },
  push: { en: "Bigger push!", ja: "ふきとばし アップ!" },
  speed: { en: "Walk faster!", ja: "あしが はやく なる!" },
  defense: { en: "Less ouch!", ja: "ダメージ ダウン!" },
  coins: { en: "More coins!", ja: "コインが ふえる!" },
  combo: { en: "Bigger combos!", ja: "コンボ アップ!" },
  none: { en: "Just for fun!", ja: "おしゃれ だけ!" },
};
