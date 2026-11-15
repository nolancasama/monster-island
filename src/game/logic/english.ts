import type { AbilityId, ColorId, FoodId, PartId, SizeId } from "../types";

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
  | "itsYellow"
  | "canFire"
  | "whatsYourName"
  | "itsGreen"
  | "itsBlue"
  | "itsOrange"
  | "itsPurple"
  | "yesIDo"
  | "noIDont"
  | "yesICan"
  | "noICant"
  | "yesPlease"
  | "noThankYou"
  | "canSwim"
  | "canFly"
  | "canJump"
  | "canHelp"
  | "comeHere"
  | "letsGo"
  | "thankYou"
  | "itsSmall"
  | "itsBig"
  | "hasWings"
  | "hasTail"
  // Act 2: shopping, the harbour and the friends' commands.
  | "wantApples"
  | "wantBananas"
  | "wantFish"
  | "wantBerries"
  | "wantMeat"
  | "oneP"
  | "twoP"
  | "threeP"
  | "whereShip"
  | "cmdPull"
  | "cmdPush"
  | "cmdBlow"
  | "cmdBurn"
  | "cmdPop"
  | "cmdStop"
  | "cmdSpin"
  | "cmdFly" | "cmdSplash"
  | "yesLetsGo" | "raiseSail" | "turnLeft" | "itsWindy" | "itsSunny" | "itsRainy" | "look"
  | "imAFriend" | "yesItIs" | "whereLumo" | "yesIWill"
  // The pirate voyage (docs/PIRATE_VOYAGE.md §7).
  | "yesIAm" | "iHaveApples" | "iHaveBananas" | "iHaveFish" | "iHaveBerries" | "iHaveMeat" | "noFood"
  | "theyreMyFriends" | "yesTheyCan" | "noTheyCant" | "howManyFish" | "whatDoYouWant" | "hereYouAre"
  | "onTheTable" | "underTheTable" | "onTheShelf" | "underTheShelf" | "inTheBox" | "byTheDoor"
  | "turnRight" | "goStraight" | "leafyHelp" | "bubboHelp" | "puffHelp" | "whereIsHe" | "weNeedWood"
  | "three" | "putItHere" | "where";

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
  purple: ["purple", "purples", "papel", "pupple", "purpur", "pupil", "paapuru", "purpel"],
  yellow: ["yellow", "yello", "yellows", "iero"]
};

const ABILITY_WORDS: Record<AbilityId | "help", string[]> = {
  swim: ["swim", "swims", "swimming", "swin", "sweem", "swing", "swimm", "suim", "twim", "swimmer"],
  fly: ["fly", "flies", "flying", "fry", "fries", "flight", "fla", "frye", "fly's", "furai"],
  jump: ["jump", "jumps", "jumping", "jamp", "jumb", "jumbo", "champ", "chump", "jumped", "janpu"],
  help: ["help", "helps", "helped", "helping", "health", "hep", "herp", "hope", "hellp", "kelp", "hell", "helpu"],
  grow: ["grow", "grows", "glow", "go"],
  fire: ["fire", "fires", "fired", "far", "fight", "fia"]
};

// Requests (Phase 2). Each needs both of its words, so "Let's go" never
// passes as "Come here" and the other way round.
const COME = ["come", "comes", "came", "kamu", "kam", "cum", "calm", "comb", "kom", "gum", "commie", "comma"];
const HERE = ["here", "hear", "hia", "hiya", "hir", "hee", "heer", "near", "ear", "hair", "hii", "comehere", "kamuhia", "commie", "comma"];
const LETS = ["let's", "lets", "let", "letsu", "rettsu", "rets", "ret's", "less", "lad's", "lots", "lex", "letsgo", "letsugo", "lego"];
const GO = ["go", "goes", "going", "gou", "goh", "goal", "gold", "goat", "coat", "ago", "letsgo", "letsugo", "lego"];
const THANK = ["thank", "thanks", "thankyou", "sank", "sankyu", "sankyou", "senkyu", "tenkyu", "tank", "tanks", "think", "thing", "fank", "sanku", "sankyuu", "sake"];

const SIZE_WORDS: Record<SizeId, string[]> = {
  small: ["small", "smaller", "smol", "smoru", "sumoru", "smore", "smalls", "mall", "small's", "smoll", "snow", "smile"],
  big: ["big", "bigger", "biggu", "bigu", "pig", "bick", "beg", "bigs", "bid", "dig", "vig"]
};

const PART_WORDS: Record<PartId, string[]> = {
  wings: ["wing", "wings", "wingu", "wingsu", "ring", "rings", "wink", "winks", "weeks", "wins", "win", "swings", "wingz"],
  tail: ["tail", "tails", "tale", "tales", "teru", "teiru", "tell", "towel", "dale", "taylor", "teal"]
};

// Act 2. "please" and "the" are never judged; the content words are.
export const NUMBER_WORDS: Record<1 | 2 | 3, string[]> = {
  1: ["one", "won", "wan", "juan", "1", "an", "a"],
  2: ["two", "to", "too", "2", "tu", "tsu", "tew"],
  3: ["three", "tree", "free", "3", "sri", "suri", "sree", "threes"]
};
const WHERE = ["where", "where's", "wheres", "wear", "ware", "were", "wair", "whea", "howea", "hair", "air"];
const SHIP = ["ship", "ships", "sheep", "chip", "shipp", "shippu", "sip", "shape", "chips"];
// The pirate voyage: content words, with common recogniser and katakana-English variants.
const FOOD = ["food", "foods", "fudo", "foot", "fool", "mood"];
const FRIENDS = ["friend", "friends", "furendo", "furendozu", "frend", "frends", "fred", "fronds"];
const HOW = ["how", "hau", "hou", "who", "how's"];
const MANY = ["many", "meni", "money", "manny", "menny", "mini", "mane", "mani"];
const WHAT = ["what", "wat", "whot", "watto", "hot", "what's", "watch"];
const WANT = ["want", "wants", "wanna", "wanto", "won't", "wont", "went", "one"];
const HERE_WORDS = ["here", "hear", "hia", "hiya", "hir", "heer", "hiaa"];
const PREP = {
  on: ["on", "own", "onn", "aun", "awn"],
  under: ["under", "anda", "andaa", "undo", "thunder", "wonder", "ander", "honda"],
  in: ["in", "inn", "een", "inside"],
  by: ["by", "bye", "buy", "bai", "beside", "next"]
};
const THING = {
  table: ["table", "tables", "teburu", "tabel", "taber", "cable", "label"],
  shelf: ["shelf", "shelves", "sherufu", "self", "shell", "shelfs"],
  box: ["box", "boxes", "bokkusu", "books", "fox", "bocks", "pox"],
  door: ["door", "doors", "doa", "dore", "dor", "dough"]
};
const TURN = ["turn", "tern", "tan", "turns", "taan", "ton"];
const RIGHT = ["right", "rite", "write", "light", "raito", "rights", "bright", "wright"];
const STRAIGHT = ["straight", "strait", "sutoreeto", "street", "straightu", "straight's", "streat"];
const HELP = ["help", "helps", "herupu", "health", "held", "yelp", "hell"];
const WOOD = ["wood", "woods", "would", "wooden", "uddo", "hood", "good", "wuud"];
const PUT = ["put", "putto", "pot", "but", "pat", "puts", "putt"];
const COMMAND_WORDS: Record<"pull" | "push" | "blow" | "burn", string[]> = {
  pull: ["pull", "pulls", "pool", "pul", "puru", "full", "bull", "paul", "poll", "pulled"],
  push: ["push", "pushes", "pusch", "puss", "pash", "posh", "bush", "pusshu", "pushed", "puch"],
  blow: ["blow", "blows", "bro", "bloh", "burow", "flow", "glow", "blo", "bureau", "below"],
  burn: ["burn", "burns", "bun", "barn", "born", "ban", "bahn", "burned", "bern", "verne", "bahn", "bang"]
};

export const WANT_PHRASE: Record<FoodId, PhraseId> = { apples: "wantApples", bananas: "wantBananas", fish: "wantFish", berries: "wantBerries", meat: "wantMeat" };
export const NUMBER_PHRASE: Record<1 | 2 | 3, PhraseId> = { 1: "oneP", 2: "twoP", 3: "threeP" };

export const SIZE_PHRASE: Record<SizeId, PhraseId> = { small: "itsSmall", big: "itsBig" };
export const PART_PHRASE: Record<PartId, PhraseId> = { wings: "hasWings", tail: "hasTail" };

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
  purple: "itsPurple",
  yellow: "itsYellow"
};

/** Which "Can you ___?" question each phrase is (help = whatever the obstacle needs). */
export const CAN_QUESTION: Partial<Record<PhraseId, AbilityId | "help">> = {
  canSwim: "swim",
  canFly: "fly",
  canJump: "jump",
  canHelp: "help",
  canFire: "fire"
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
  yesIWill: { id: "yesIWill", en: "Yes, I will!", keys: [YES], forbid: NO },
  yesLetsGo: { id: "yesLetsGo", en: "Yes, let's go!", keys: [YES, GO], forbid: NO },
  raiseSail: { id: "raiseSail", en: "Raise the sail!", keys: [["raise", "rays", "rise", "reis", "raiseu"], ["sail", "sale", "sails", "sell", "seiru"]] },
  turnLeft: { id: "turnLeft", en: "Turn left!", keys: [["turn", "tern", "tan", "turns"], ["left", "leff", "refuto", "lift"]] },
  itsWindy: { id: "itsWindy", en: "It's windy.", keys: [["windy", "wind", "windi", "window", "uindi"]] },
  itsSunny: { id: "itsSunny", en: "It's sunny.", keys: [["sunny", "sun", "sani", "sonny"]] },
  itsRainy: { id: "itsRainy", en: "It's rainy.", keys: [["rainy", "rain", "reini", "raining"]] },
  look: { id: "look", en: "Look!", keys: [["look", "looks", "luk", "rook", "ruku"]] },
  imAFriend: { id: "imAFriend", en: "I'm a friend.", keys: [["friend", "friends", "frend", "furendo"]] },
  yesItIs: { id: "yesItIs", en: "Yes, it is!", keys: [YES], forbid: NO },
  whereLumo: { id: "whereLumo", en: "Where is Lumo?", keys: [WHERE, ["lumo", "lumo's", "lumi", "r umo", "rumo", "luminous"]] },
  itsYellow: color("itsYellow", "yellow", ["itsOrange", "itsPurple"]),
  canFire: can("canFire", "fire", "Can you make fire?"),
  whatsYourName: {
    id: "whatsYourName", en: "What's your name?",
    keys: [["what", "what's", "whats", "wat"], ["name", "names", "nem", "neimu"]],
    distractors: ["likeApples", "thankYou"]
  },
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
  yesPlease: { id: "yesPlease", en: "Yes, please.", keys: [YES], forbid: NO },
  noThankYou: { id: "noThankYou", en: "No, thank you.", keys: [NO], forbid: YES },
  canSwim: can("canSwim", "swim", "Can you swim?"),
  canFly: can("canFly", "fly", "Can you fly?"),
  canJump: can("canJump", "jump", "Can you jump?"),
  canHelp: can("canHelp", "help", "Can you help me?"),
  comeHere: { id: "comeHere", en: "Come here!", keys: [COME, HERE], distractors: ["letsGo", "thankYou"] },
  letsGo: { id: "letsGo", en: "Let's go!", keys: [LETS, GO], distractors: ["comeHere", "thankYou"] },
  thankYou: { id: "thankYou", en: "Thank you!", keys: [THANK], distractors: ["comeHere", "letsGo"] },
  itsSmall: { id: "itsSmall", en: "It's small.", keys: [SIZE_WORDS.small], forbid: SIZE_WORDS.big, distractors: ["itsBig"] },
  itsBig: { id: "itsBig", en: "It's big.", keys: [SIZE_WORDS.big], forbid: SIZE_WORDS.small, distractors: ["itsSmall"] },
  // "has" is not judged: "It wings" from a beginner still names the right part.
  hasWings: { id: "hasWings", en: "It has wings.", keys: [PART_WORDS.wings], distractors: ["hasTail"] },
  hasTail: { id: "hasTail", en: "It has a tail.", keys: [PART_WORDS.tail], distractors: ["hasWings"] },
  // "I want ___, please." needs only the food: the shop offers one food per sentence.
  wantApples: { id: "wantApples", en: "I want apples, please.", keys: [FOOD_WORDS.apples] },
  wantBananas: { id: "wantBananas", en: "I want bananas, please.", keys: [FOOD_WORDS.bananas] },
  wantFish: { id: "wantFish", en: "I want fish, please.", keys: [FOOD_WORDS.fish] },
  wantBerries: { id: "wantBerries", en: "I want berries, please.", keys: [FOOD_WORDS.berries] },
  wantMeat: { id: "wantMeat", en: "I want meat, please.", keys: [FOOD_WORDS.meat] },
  oneP: { id: "oneP", en: "One, please.", keys: [NUMBER_WORDS[1].slice(0, 5)], forbid: [...NUMBER_WORDS[2], ...NUMBER_WORDS[3]] },
  twoP: { id: "twoP", en: "Two, please.", keys: [NUMBER_WORDS[2]], forbid: [...NUMBER_WORDS[3]] },
  threeP: { id: "threeP", en: "Three, please.", keys: [NUMBER_WORDS[3]], forbid: [...NUMBER_WORDS[2]] },
  whereShip: { id: "whereShip", en: "Where is the ship?", keys: [WHERE, SHIP], distractors: ["thankYou", "letsGo"] },
  // Two foods name the recipe; "Mix the" is not judged.
  cmdPull: { id: "cmdPull", en: "Pull!", keys: [COMMAND_WORDS.pull], distractors: ["cmdPush", "cmdBlow"] },
  cmdPush: { id: "cmdPush", en: "Push!", keys: [COMMAND_WORDS.push], distractors: ["cmdPull", "cmdBurn"] },
  cmdBlow: { id: "cmdBlow", en: "Blow!", keys: [COMMAND_WORDS.blow], distractors: ["cmdBurn", "cmdPull"] },
  cmdBurn: { id: "cmdBurn", en: "Burn!", keys: [COMMAND_WORDS.burn], distractors: ["cmdBlow", "cmdPush"] },
  cmdPop: { id: "cmdPop", en: "Pop!", keys: [["pop", "pops", "poppu"]], distractors: ["cmdStop", "cmdSpin"] },
  cmdStop: { id: "cmdStop", en: "Stop!", keys: [["stop", "stops", "sutoppu"]], distractors: ["cmdPop", "cmdBurn"] },
  cmdSpin: { id: "cmdSpin", en: "Spin!", keys: [["spin", "spins", "supin"]], distractors: ["cmdBurn", "cmdStop"] },
  cmdFly: { id: "cmdFly", en: "Fly!", keys: [ABILITY_WORDS.fly], distractors: ["cmdPull", "cmdBurn"] },
  cmdSplash: { id: "cmdSplash", en: "Splash!", keys: [["splash", "splashes", "splashu", "supurasshu", "splish", "sprash"]], distractors: ["cmdPull", "cmdFly"] },
  // The pirate voyage. Answers about the bag are judged against the real bag by the flow.
  yesIAm: { id: "yesIAm", en: "Yes, I am!", keys: [YES], forbid: NO },
  iHaveApples: { id: "iHaveApples", en: "I have apples.", keys: [FOOD_WORDS.apples], forbid: NO },
  iHaveBananas: { id: "iHaveBananas", en: "I have bananas.", keys: [FOOD_WORDS.bananas], forbid: NO },
  iHaveFish: { id: "iHaveFish", en: "I have fish!", keys: [FOOD_WORDS.fish], forbid: NO },
  iHaveBerries: { id: "iHaveBerries", en: "I have berries.", keys: [FOOD_WORDS.berries], forbid: NO },
  iHaveMeat: { id: "iHaveMeat", en: "I have meat.", keys: [FOOD_WORDS.meat], forbid: NO },
  noFood: { id: "noFood", en: "I don't have any food.", keys: [NO, FOOD] },
  theyreMyFriends: { id: "theyreMyFriends", en: "No! They're my friends!", keys: [FRIENDS] },
  yesTheyCan: { id: "yesTheyCan", en: "Yes, they can!", keys: [YES], forbid: NO },
  noTheyCant: { id: "noTheyCant", en: "No, they can't.", keys: [NO] },
  howManyFish: { id: "howManyFish", en: "How many fish?", keys: [HOW, MANY] },
  whatDoYouWant: { id: "whatDoYouWant", en: "What do you want?", keys: [WHAT, WANT] },
  hereYouAre: { id: "hereYouAre", en: "Here you are!", keys: [HERE_WORDS] },
  onTheTable: { id: "onTheTable", en: "It's on the table.", keys: [PREP.on, THING.table], forbid: PREP.under },
  underTheTable: { id: "underTheTable", en: "It's under the table.", keys: [PREP.under, THING.table] },
  onTheShelf: { id: "onTheShelf", en: "It's on the shelf.", keys: [PREP.on, THING.shelf], forbid: PREP.under },
  underTheShelf: { id: "underTheShelf", en: "It's under the shelf.", keys: [PREP.under, THING.shelf] },
  inTheBox: { id: "inTheBox", en: "It's in the box.", keys: [PREP.in, THING.box] },
  byTheDoor: { id: "byTheDoor", en: "It's by the door.", keys: [PREP.by, THING.door] },
  turnRight: { id: "turnRight", en: "Turn right!", keys: [TURN, RIGHT] },
  goStraight: { id: "goStraight", en: "Go straight!", keys: [STRAIGHT] },
  leafyHelp: { id: "leafyHelp", en: "Leafy! Can you help me?", keys: [HELP] },
  bubboHelp: { id: "bubboHelp", en: "Bubbo! Can you help me?", keys: [HELP] },
  puffHelp: { id: "puffHelp", en: "Puff! Can you help me?", keys: [HELP] },
  whereIsHe: { id: "whereIsHe", en: "Where is he?", keys: [WHERE] },
  weNeedWood: { id: "weNeedWood", en: "We need wood!", keys: [WOOD] },
  three: { id: "three", en: "Three!", keys: [NUMBER_WORDS[3]] },
  putItHere: { id: "putItHere", en: "Put it here!", keys: [PUT, HERE_WORDS] },
  where: { id: "where", en: "Where?", keys: [WHERE] }
};

/** The quantity in a heard shopping sentence ("I want three apples"), if any. */
export function heardQuantity(text: string): 1 | 2 | 3 | null {
  const words = text.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/);
  for (const n of [3, 2] as const) if (words.some((w) => NUMBER_WORDS[n].includes(w))) return n;
  // "one" (not "a"/"an", which every sentence has) only counts when said as a number.
  if (words.some((w) => ["one", "1"].includes(w))) return 1;
  return null;
}

export const PHRASE_IDS = Object.keys(PHRASES) as PhraseId[];

export function foodOfPhrase(id: PhraseId): FoodId | null {
  const hit = (Object.keys(LIKE_PHRASE) as FoodId[]).find((f) => LIKE_PHRASE[f] === id);
  return hit ?? null;
}
