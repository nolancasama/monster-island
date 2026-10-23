import type { AbilityId, ColorId, FoodId, MonsterId, PartId, SizeId, Text, Vec2 } from "../types";
import { PUFF_PERCH, PUFF_TREE, FOREST_BERRY_BUSHES } from "../world/island";

/**
 * Every monster is data. Adding one means a definition here, a model in
 * scene/models/monsters.ts and a portrait in ui/Portraits.tsx; the encounter,
 * friendship, journal, companion and obstacle code never names a monster.
 */
export interface MonsterDef {
  id: MonsterId;
  name: string;
  color: ColorId;
  /** "It's small." / "It's big." on its journal page. */
  size: SizeId;
  /** "It has wings." — the body-part line its journal page asks for (null: none). */
  part: PartId | null;
  favorite: FoodId;
  /** Truthful answers to "Can you ___?" (everything else is "No, I can't."). */
  can: AbilityId[];
  /** The ability it uses on obstacles. */
  power: AbilityId;
  /** What it says about its power (journal, companion chat). */
  powerLine: Text;
  habitat: Text;
  /** Where it lives and wanders while it is not following the player. */
  home: Vec2 & { r: number };
  /** The spot it looks at when hinting at its favourite food. */
  foodSpot: Vec2;
  /** Built and placed in this phase of the game (later ones are journal silhouettes). */
  phase: 1 | 2 | 3;
  /** Text-to-speech voice. */
  voice: { pitch: number; rate: number };
  /** Shy monsters hide when first approached; curious ones come closer. */
  temper: "shy" | "curious";
  /** Collision and follow radius (m). */
  radius: number;
  /** Shy fliers wait up here (y = height above the ground) until called down with "Come here!". */
  perch?: Vec2 & { y: number };
}

export const MONSTERS: Record<MonsterId, MonsterDef> = {
  leafy: {
    id: "leafy",
    name: "Leafy",
    size: "small",
    part: null,
    color: "green",
    favorite: "apples",
    can: ["grow", "jump"],
    power: "grow",
    powerLine: { en: "I can grow plants!", ja: "しょくぶつを そだてられるよ" },
    habitat: { en: "Beach: apple trees", ja: "はまべ・りんごの木" },
    home: { x: -15, z: -3.2, r: 3.2 },
    foodSpot: { x: -17.5, z: -6 },
    phase: 1,
    voice: { pitch: 1.6, rate: 1.0 },
    temper: "shy",
    radius: 0.45
  },
  bubbo: {
    id: "bubbo",
    name: "Bubbo",
    size: "big",
    part: null,
    color: "blue",
    favorite: "fish",
    can: ["swim", "jump"],
    power: "swim",
    powerLine: { en: "I can swim!", ja: "およげるよ" },
    habitat: { en: "Beach: river", ja: "はまべ・かわ" },
    home: { x: 17.5, z: 1.5, r: 3 },
    foodSpot: { x: 13.2, z: 6.2 },
    phase: 1,
    voice: { pitch: 0.75, rate: 0.92 },
    temper: "curious",
    radius: 0.55
  },
  puff: {
    id: "puff",
    name: "Puff",
    size: "small",
    part: "wings",
    color: "purple",
    favorite: "berries",
    can: ["fly"],
    power: "fly",
    powerLine: { en: "I can fly!", ja: "とべるよ" },
    habitat: { en: "Forest: hills", ja: "もり・おか" },
    home: { x: PUFF_TREE.x, z: PUFF_TREE.z + 2.2, r: 2.6 },
    foodSpot: FOREST_BERRY_BUSHES[0],
    phase: 2,
    voice: { pitch: 1.4, rate: 0.95 },
    temper: "shy",
    radius: 0.4,
    perch: PUFF_PERCH
  },
  ember: {
    id: "ember",
    name: "Ember",
    size: "big",
    part: "tail",
    color: "orange",
    favorite: "meat",
    can: ["fire", "jump"],
    power: "fire",
    powerLine: { en: "I can make fire!", ja: "ひを つけられるよ" },
    habitat: { en: "Volcano", ja: "かざん" },
    home: { x: 60, z: -50, r: 3 },
    foodSpot: { x: 60, z: -50 },
    phase: 3,
    voice: { pitch: 1.1, rate: 1.0 },
    temper: "curious",
    radius: 0.5
  }
};

/** Journal order. */
export const MONSTER_ORDER: MonsterId[] = ["leafy", "bubbo", "puff", "ember"];

/** Monsters that exist in the world in this build. */
export const BUILT_PHASE = 2;
export const LIVE_MONSTERS: MonsterId[] = MONSTER_ORDER.filter((id) => MONSTERS[id].phase <= BUILT_PHASE);
export const monstersOfPhase = (phase: number): MonsterId[] => MONSTER_ORDER.filter((id) => MONSTERS[id].phase === phase);

export const COLOR_WORD: Record<ColorId, string> = { green: "green", blue: "blue", orange: "orange", purple: "purple" };
export const COLOR_HEX: Record<ColorId, string> = { green: "#5cc24a", blue: "#3f9fe8", orange: "#ff8a2a", purple: "#a070e0" };
