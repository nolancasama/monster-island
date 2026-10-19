import type { AbilityId, ColorId, FoodId } from "../types";

/**
 * Every sentence the student says or taps. `keys` are the content words that
 * must be heard: one word from each group (accent and recogniser variants
 * included). Articles, "do you", "it's", punctuation and word order are not
 * judged; a false rejection teaches a child that correct English was wrong.
 */
export interface Phrase {
  id: PhraseId;
  en: string;
  keys: string[][];
  /** Hearing any of these rules the phrase out ("no" in a "yes" answer). */
  forbid?: string[];
  /** Wrong-but-plausible sentences for mic-free commands. */
  distractors?: PhraseId[];
}

export type PhraseId =
  | "likeApples"
  | "likeBananas"
  | "likeFish"
  | "likeBerries"
  | "likeMeat"
  | "itsGreen"
  | "itsBlue"
  | "itsOrange"
  | "itsPurple"
  | "yesIDo"
  | "noIDont"
  | "yesICan"
  | "noICant"
  | "canSwim"
  | "canFly"
  | "canJump"
  | "canHelp";

const LIKE = ["like", "likes", "liked", "lake", "lakes", "lik", "lyke", "laik", "rike", "raiku", "bike", "mike", "light", "lie", "lied", "lye", "lime"];
const CAN_Q = ["can", "could", "kan", "ken", "cam", "con", "cane", "cannes", "kenya", "canyon", "canyou", "kenyou", "come"];
const YES = ["yes", "yeah", "yep", "yup", "yea", "yas", "yess", "yesh", "jess", "ies", "guess", "okay", "ok", "sure"];
const NO = ["no", "nope", "nah", "know", "noh", "nou", "nor", "not", "don't", "dont", "can't", "cant", "cannot"];

const FOOD_WORDS: Record<FoodId, string[]> = {
  apples: ["apple", "apples", "apple's", "appel", "appels", "appeal", "appeals", "apollo", "happle", "apps"],
  bananas: ["banana", "bananas", "banana's", "nana", "nanas", "bonanza", "banane", "bananna", "banan"],
  fish: ["fish", "fishes", "fish's", "fishy", "fisch", "fiche", "fischer", "fisher", "feesh", "fishu", "fist", "fishing"],
  berries: ["berries", "berry", "berrys", "berry's", "barry", "barries", "bury", "buries", "very", "verry", "belly", "bellies", "beri", "berri"],
  meat: ["meat", "meats", "meet", "meets", "mead", "mitt", "neat", "meat's"]
};

const COLOR_WORDS: Record<ColorId, string[]> = {
  green: ["green", "greens", "grin", "greene", "clean", "glean", "grean", "gureen"],
  blue: ["blue", "blues", "blew", "bleu", "brew", "brue", "bloo", "bru", "blue's", "buru"],
  orange: ["orange", "oranges", "orrange", "orenji", "orinj", "orange's", "oranje"],
  purple: ["purple", "purples", "papel", "pupple", "purpur", "pupil", "paapuru", "purpel"]
};

const ABILITY_WORDS: Record<AbilityId | "help", string[]> = {
  swim: ["swim", "swims", "swimming", "swin", "sweem", "swing", "swimm", "suim", "twim", "swimmer"],
  fly: ["fly", "flies", "flying", "fry", "fries", "flight", "fla", "frye", "fly's", "furai"],
  jump: ["jump", "jumps", "jumping", "jamp", "jumb", "jumbo", "champ", "chump", "jumped", "janpu"],
  help: ["help", "helps", "helped", "helping", "health", "hep", "herp", "hope", "hellp", "kelp", "hell", "helpu"],
  grow: ["grow", "grows", "glow", "go"],
  fire: ["fire", "fires", "fired", "far", "fight", "fia"]
};

export const LIKE_PHRASE: Record<FoodId, PhraseId> = {
  apples: "likeApples",
  bananas: "likeBananas",
  fish: "likeFish",
  berries: "likeBerries",
  meat: "likeMeat"
};

export const COLOR_PHRASE: Record<ColorId, PhraseId> = {
  green: "itsGreen",
  blue: "itsBlue",
  orange: "itsOrange",
  purple: "itsPurple"
};

/** Which "Can you ___?" question each phrase is (help = whatever the obstacle needs). */
export const CAN_QUESTION: Partial<Record<PhraseId, AbilityId | "help">> = {
  canSwim: "swim",
  canFly: "fly",
  canJump: "jump",
  canHelp: "help"
};

const like = (id: PhraseId, food: FoodId, en: string): Phrase => ({ id, en, keys: [LIKE, FOOD_WORDS[food]] });
const color = (id: PhraseId, c: ColorId, distractors: PhraseId[]): Phrase => ({
  id,
  en: `It's ${c}.`,
  keys: [COLOR_WORDS[c]],
  distractors
});
const can = (id: PhraseId, a: AbilityId | "help", en: string): Phrase => ({ id, en, keys: [CAN_Q, ABILITY_WORDS[a]] });

export const PHRASES: Record<PhraseId, Phrase> = {
  likeApples: like("likeApples", "apples", "Do you like apples?"),
  likeBananas: like("likeBananas", "bananas", "Do you like bananas?"),
  likeFish: like("likeFish", "fish", "Do you like fish?"),
  likeBerries: like("likeBerries", "berries", "Do you like berries?"),
  likeMeat: like("likeMeat", "meat", "Do you like meat?"),
  itsGreen: color("itsGreen", "green", ["itsBlue", "itsOrange"]),
  itsBlue: color("itsBlue", "blue", ["itsGreen", "itsPurple"]),
  itsOrange: color("itsOrange", "orange", ["itsGreen", "itsBlue"]),
  itsPurple: color("itsPurple", "purple", ["itsBlue", "itsOrange"]),
  // Answers are judged on yes / no: the question already fixes "do" or "can".
  yesIDo: { id: "yesIDo", en: "Yes, I do.", keys: [YES], forbid: NO },
  noIDont: { id: "noIDont", en: "No, I don't.", keys: [NO], forbid: ["yes", "yeah", "yep"] },
  yesICan: { id: "yesICan", en: "Yes, I can.", keys: [YES], forbid: NO },
  noICant: { id: "noICant", en: "No, I can't.", keys: [NO], forbid: ["yes", "yeah", "yep"] },
  canSwim: can("canSwim", "swim", "Can you swim?"),
  canFly: can("canFly", "fly", "Can you fly?"),
  canJump: can("canJump", "jump", "Can you jump?"),
  canHelp: can("canHelp", "help", "Can you help me?")
};

export const PHRASE_IDS = Object.keys(PHRASES) as PhraseId[];

export function foodOfPhrase(id: PhraseId): FoodId | null {
  const hit = (Object.keys(LIKE_PHRASE) as FoodId[]).find((f) => LIKE_PHRASE[f] === id);
  return hit ?? null;
}
