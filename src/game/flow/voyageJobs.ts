import { FOODS } from "../data/foods";
import { MONSTERS } from "../data/monsters";
import { PIRATES } from "../data/pirates";
import { COMPANION_IDS, type CompanionId } from "../data/combat";
import { getGame, toast, updateProgress } from "../store";
import { animate, rt } from "../runtime";
import { BUCKET, DECK_Y, FISH_Y, SPOT, SUPPLY_CRATES, shipWorld } from "../world/pirateShip";
import { SEA_Y } from "../world/island";
import { ITEM_NAME, VOYAGE_JOBS, allJobsDone, cargoTasks, finishJob, markHatGiven, obstacleSide, placePhrase, putLine, safeCommand, setVoyageStage, slotFree, steer, taskDone, whereChoices, type CargoItem, type CargoTask, type Furniture, type Lane, type Placement, type Prep, type SteerCommand, type VoyageJob } from "../logic/voyage";
import { giveWearable, wear } from "../logic/wardrobe";
import { vy, type Candidate, type CrewId, type Fish, type Phase } from "../voyageRt";
import { L, SAIL_AIM, activeFriend, aim, cargoSpot, setPhase, sparkleAt, toolFx } from "../voyageSim";
import { ask, say } from "./ask";
import { fadeThrough, frameTwo, shot } from "./script";
import { switchTo } from "./companion";
import { crewWorld, ease, guard, lerp, over, placeOnDeck, scene, until } from "./voyage";
import { startStorm } from "./voyageStorm";
import { saveNow } from "./story";
import { audio } from "../../audio/audio";
import type { FoodId } from "../types";
import type { PhraseId } from "../logic/english";

/**
 * The four jobs on the pirate ship (docs/PIRATE_VOYAGE.md §3), in any order.
 * Each is offered by its pirate, switches to its friend, and runs as a free-play
 * phase (E targets, the J tool, a tick) between short scripted scenes. Nothing
 * can fail: wrong answers and wrong placements get a hint and another try.
 */

export const JOB_NAMES: Record<VoyageJob, string> = { fishing: "fishing", cooking: "cooking", cargo: "the cargo", sailing: "the sails" };
export const JOB_GIVER: Partial<Record<CrewId, VoyageJob>> = { finn: "fishing", pepper: "cooking", bill: "cargo", redbeard: "sailing" };

const NUM = ["zero", "one", "two", "three", "four", "five"];
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const NAME = (id: CrewId) => (id === "gull" ? "Captain Gull" : PIRATES[id].name);

function crewCandidate(id: CrewId, verb = "Talk to"): Candidate {
  const w = crewWorld(id);
  return { focus: { id: `crew:${id}`, kind: "npc", verb, noun: NAME(id), x: w.x, z: w.z }, reach: 2.4 };
}
function placeCandidate(id: string, verb: string, noun: string, local: { x: number; z: number }, reach = 2.1): Candidate {
  const w = L(local.x, local.z);
  return { focus: { id, kind: "obstacle", verb, noun, x: w.x, z: w.z }, reach };
}
export function cheer(...ids: CrewId[]) { for (const id of ids) vy.crew[id].cheer = rt.time + Math.random() * 0.3; }
function friendCheers(f: CompanionId) { animate(f, "yes"); audio.voice(f, "happy"); }

const yesICan = () => ask({ kind: "command", options: ["yesICan"], tapAlways: true, readSentence: true, help: "「Yes, I can!」と こたえよう" });
const say1 = (id: PhraseId, help: string) => ask({ kind: "command", options: [id], tapAlways: true, readSentence: true, help });

/** The job's friend steps up ("Let's ask Bubbo!"). */
async function friendFor(f: CompanionId, giver: CrewId) {
  if (activeFriend() === f) return;
  await say(giver === "gull" ? "harbor" : giver, `Let's ask ${MONSTERS[f].name}!`, `${MONSTERS[f].name}に たのもう!`);
  switchTo(f);
}

/** A once-in-a-while hint (switch friend, come closer…). */
let lastHint = -10;
function hint(en: string, ja: string) {
  if (rt.time - lastHint < 2.5) return;
  lastHint = rt.time;
  toast({ en, ja, tone: "info" }, 2200);
}
const needFriend = (f: CompanionId) => hint(`${MONSTERS[f].name} can do it! Press ${COMPANION_IDS.indexOf(f) + 1}.`, `${MONSTERS[f].name}の でばん! ${COMPANION_IDS.indexOf(f) + 1}を おそう`);

// ------------------------------------------------------------ the job runner

let busy = false;

/** E on a job's pirate: run that job, then the crew's thanks (and the finale after the fourth). */
export async function startJob(job: VoyageJob): Promise<void> {
  if (busy || getGame().progress.act3.voyage.jobs.includes(job)) return;
  busy = true;
  try {
    await JOBS[job]();
  } finally {
    busy = false;
    setPhase(null);
    vy.carry = null;
  }
  updateProgress((p) => finishJob(p, job));
  saveNow();
  for (const id of ["redbeard", "pepper", "bill", "finn", "tom", "sam", "max"] as CrewId[]) cheer(id);
  for (const f of COMPANION_IDS) friendCheers(f);
  const left = VOYAGE_JOBS.filter((j) => !getGame().progress.act3.voyage.jobs.includes(j));
  if (!left.length) { guard(crewFinale()); return; }
  await scene(async () => {
    frameTwo(rt.player, crewWorld("redbeard"), 1);
    await say("redbeard", left.length === 1 ? `Great job! One more: ${JOB_NAMES[left[0]]}!` : `Great job! ${cap(NUM[left.length])} more jobs!`,
      left.length === 1 ? "すごい! あと ひとつ!" : `すごい! あと ${left.length}つ!`);
  });
}

const JOBS: Record<VoyageJob, () => Promise<void>> = { fishing, cooking, cargo, sailing };

// ------------------------------------------------------------ A. fishing (Bubbo)

/** Where the fish swim (local): beside the fishing deck and behind it. */
const POOLS = [{ cx: -6.6, cz: 17.2, rx: 2.0, rz: 2.3 }, { cx: 6.6, cz: 17.2, rx: 2.0, rz: 2.3 }, { cx: 0, cz: 21.3, rx: 3.0, rz: 1.0 }];
const BUCKET_TOP = { y: FISH_Y + 0.75 };

export function spawnFish() {
  const pools = [0, 0, 1, 1, 2, 2];
  vy.fish = pools.map((pool, i): Fish => ({ id: i, boot: i === 5, pool, speed: 0.32 + (i % 3) * 0.08, phase: i * 2.1 + (i === 5 ? Math.PI : 0),
    state: "swim", t0: 0, x: 0, y: SEA_Y, z: 0, yaw: 0, ax: 0, ay: 0, az: 0 }));
  for (const f of vy.fish) swim(f, 0);
}

function swim(f: Fish, dt: number) {
  const p = POOLS[f.pool];
  f.phase += dt * f.speed * (f.pool === 2 ? 0.7 : 1);
  f.x = p.cx + Math.cos(f.phase) * p.rx;
  f.z = p.cz + Math.sin(f.phase) * p.rz;
  f.yaw = Math.atan2(-Math.sin(f.phase) * p.rx, Math.cos(f.phase) * p.rz);
  // Now and then a fish jumps, so the children can spot them.
  const hop = Math.max(0, Math.sin(rt.time * 1.1 + f.id * 2.3));
  f.y = SEA_Y - 0.14 + (f.boot ? -0.05 : Math.pow(hop, 14) * 0.9);
}

async function fishing() {
  const n = 2 + Math.floor(Math.random() * 3);
  await scene(async () => {
    frameTwo(rt.player, crewWorld("finn"), 0.85);
    await say("finn", "Ahoy! I'm Fisher Finn. Can you help me?", "やあ! りょうしの フィンだよ。てつだって くれる?");
    await yesICan();
    await friendFor("bubbo", "finn");
    await say("finn", "Bubbo! Can you catch fish?", "バボ! さかなを つかまえられる?");
    await yesICan();
    await say1("howManyFish", "「How many fish?」と きこう");
    await say("finn", `${cap(NUM[n])} fish, please!`, `${n}ひき おねがい!`);
    await say("game", "Face a fish and press J. Bubbo's bubble catches it!", "さかなの ほうを むいて J! バボの あわで つかまえよう");
  });
  vy.bucket = 0;
  spawnFish();
  let bootLine = false;
  const phase: Phase = {
    name: "fishing",
    candidates: () => [crewCandidate("finn")],
    interact: (f) => { if (f.id === "crew:finn") void scene(async () => { await say("finn", `${cap(NUM[Math.max(0, n - vy.bucket)])} more, please!`, `あと ${Math.max(0, n - vy.bucket)}ひき!`); }); },
    tool(friend) {
      if (friend !== "bubbo") { needFriend("bubbo"); return false; }
      const flying = vy.fish.filter((f) => f.state === "caught" && !f.boot).length;
      if (vy.bucket + flying >= n) return false;
      const fish = aim(vy.fish.filter((f) => f.state === "swim"), (f) => L(f.x, f.z), 9, 0.75, 3.2);
      if (!fish) return false;
      const w = L(fish.x, fish.z);
      toolFx("bubbo", { x: w.x, y: fish.y + 0.25, z: w.z });
      fish.state = "caught"; fish.t0 = rt.time + 0.45; fish.ax = fish.x; fish.ay = fish.y; fish.az = fish.z;
      return true;
    },
    tick(dt) {
      for (const f of vy.fish) {
        if (f.state === "swim") { swim(f, dt); continue; }
        if (f.state !== "caught") continue;
        const k = (rt.time - f.t0) / 1.3;
        if (k < 0) continue;
        if (f.boot && k > 0.35) {
          // Not a fish: the boot drops back into the sea.
          f.state = "swim"; f.phase += Math.PI;
          audio.play("splash");
          if (!bootLine) { bootLine = true; void scene(async () => { await say("finn", "That's not a fish! That's a boot!", "それは さかなじゃない! ながぐつだ!"); }); }
          else hint("That's a boot!", "ながぐつだ!");
          continue;
        }
        const e = ease(Math.min(1, k));
        f.x = lerp(f.ax, BUCKET.x, e); f.z = lerp(f.az, BUCKET.z, e);
        f.y = lerp(f.ay, BUCKET_TOP.y, e) + Math.sin(Math.min(1, k) * Math.PI) * 2.4;
        if (k >= 1) {
          f.state = "bucket"; vy.bucket = Math.min(n, vy.bucket + 1);
          const b = L(BUCKET.x, BUCKET.z);
          sparkleAt(b.x, BUCKET_TOP.y, b.z); audio.play("correct");
        }
      }
      vy.hud = { title: "Fish", ja: "さかな", count: [vy.bucket, n], hint: activeFriend() === "bubbo" ? "Face a fish: J · さかなを むいて J" : "Press 2: Bubbo! · 2で バボ" };
    },
  };
  setPhase(phase);
  await until(() => vy.bucket >= n);
  setPhase(null);
  await scene(async () => {
    frameTwo(rt.player, crewWorld("finn"), 0.85);
    await say1("iHaveFish", "「I have fish!」と つたえよう");
    vy.crew.finn.hold = "fish3"; cheer("finn"); audio.play("correct");
    await say("finn", "Thank you! Dinner!", "ありがとう! ばんごはんだ!");
  });
  vy.fish = []; vy.bucket = 0;
}

// ------------------------------------------------------------ B. cooking (Ember)

const HUNGRY: CrewId[] = ["tom", "sam", "max"];
const STOVE = () => L(SPOT.stove.x, SPOT.stove.z);
// Wide enough that one hold-and-release usually cooks a dish (≈1.1 s rising and ≈1.5 s cooling in the band).
const HEAT_BAND: [number, number] = [0.5, 0.9];
const COOK_SECONDS = 2.5;

async function cooking() {
  const menu = (["fish", "meat", "bananas", "apples"] as FoodId[]).sort(() => Math.random() - 0.5).slice(0, 3);
  await scene(async () => {
    frameTwo(rt.player, crewWorld("pepper"), 0.85);
    await say("pepper", "Ahoy! I'm Cook Pepper. Can you help me?", "やあ! コックの ペッパーよ。てつだって くれる?");
    await yesICan();
    await say("pepper", "Can you cook?", "りょうりが できる?");
    await yesICan();
    await friendFor("ember", "pepper");
    await say1("canFire", "エンバーに「Can you make fire?」");
    animate("ember", "yes"); audio.voice("ember", "excited");
    await say("ember", "Yes, I can!", "できるよ!");
    await say("game", "Stand at the stove and press J!", "コンロの まえで J!");
  });
  const cook = vy.cook;
  Object.assign(cook, { lit: false, heat: 0, done: 0, pot: null, dish: null, order: null, orders: [] });
  const orders = cook.orders;
  let step: "light" | "order" | "fetch" | "heat" | "serve" = "light";
  let current: { who: CrewId; food: FoodId } | null = null;
  const setCurrent = (o: { who: CrewId; food: FoodId } | null) => { current = o; cook.order = o; };
  let lastFlame = -10;
  const nearStove = (r: number) => Math.hypot(rt.player.x - STOVE().x, rt.player.z - STOVE().z) < r;
  const say2 = (id: CrewId, en: string, ja: string) => scene(async () => { frameTwo(rt.player, crewWorld(id), 0.85); await say(id === "gull" ? "harbor" : id, en, ja); });

  const phase: Phase = {
    name: "cooking",
    candidates() {
      const out: Candidate[] = [];
      if (step === "order") for (const id of HUNGRY) if (!orders.some((o) => o.who === id)) out.push(crewCandidate(id, "Ask"));
      if (step === "fetch") {
        if (!vy.carry) for (const c of SUPPLY_CRATES) out.push(placeCandidate(`crate:${c.food}`, "Take", FOODS[c.food].word, c, 1.7));
        else out.push(placeCandidate("pot", "Put it in", "the pot", SPOT.stove, 2.2));
      }
      if (step === "serve") {
        if (!vy.carry && cook.dish) out.push(placeCandidate("pot", "Take", "the dish", SPOT.stove, 2.2));
        else if (vy.carry?.kind === "dish" && current) out.push(crewCandidate(current.who, "Give it to"));
      }
      out.push(crewCandidate("pepper"));
      return out;
    },
    interact(f) {
      if (f.id.startsWith("crate:") && step === "fetch" && !vy.carry) {
        const food = f.id.slice(6) as FoodId;
        vy.carry = { kind: "food", food }; audio.play("pick");
        toast({ en: `You have ${FOODS[food].word}.`, ja: `${FOODS[food].ja}を もった`, icon: food, tone: "info" }, 1600);
        return;
      }
      if (f.id === "pot" && step === "fetch" && vy.carry?.kind === "food") {
        const food = vy.carry.food;
        void scene(async () => {
          frameTwo(rt.player, crewWorld("pepper"), 0.85);
          for (;;) {
            const said = await ask({ kind: "choice", options: ["yesIDo", "noIDont"], tapAlways: true, readQuestion: true, picture: food,
              question: { by: "pepper", en: `Do you have ${FOODS[food].word}?`, ja: `${FOODS[food].ja}を もってる?` }, help: "てに もっている ものを みよう" });
            if (said === "yesIDo") break;
            await say("pepper", `Look! You have ${FOODS[food].word}!`, `みて! ${FOODS[food].ja}を もってるよ!`);
          }
          cook.pot = food; vy.carry = null; cook.heat = 0; cook.done = 0; step = "heat";
          audio.play("give");
          await say("pepper", "Into the pot! Ember, hold J to keep the fire hot!", "おなべに いれて! エンバー、Jを おしつづけて ひを つよく!");
        });
        return;
      }
      if (f.id === "pot" && step === "serve" && !vy.carry && cook.dish) {
        vy.carry = { kind: "dish", food: cook.dish }; cook.dish = null; audio.play("pick");
        return;
      }
      if (f.id.startsWith("crew:")) {
        const id = f.id.slice(5) as CrewId;
        if (step === "order" && HUNGRY.includes(id) && !orders.some((o) => o.who === id)) {
          void scene(async () => {
            frameTwo(rt.player, crewWorld(id), 0.85);
            await say1("whatDoYouWant", "「What do you want?」と きこう");
            const food = menu[orders.length];
            await say(id as Exclude<CrewId, "gull">, `I want ${FOODS[food].word}!`, `${FOODS[food].ja}が ほしい!`);
            orders.push({ who: id, food, served: false });
            setCurrent({ who: id, food }); step = "fetch";
          });
          return;
        }
        if (step === "serve" && vy.carry?.kind === "dish" && current && id === current.who) {
          const dish = vy.carry.food, want = current;
          void scene(async () => {
            frameTwo(rt.player, crewWorld(id), 0.85);
            await say1("hereYouAre", "「Here you are!」と わたそう");
            vy.carry = null;
            if (dish === want.food) {
              vy.crew[id].hold = dish; cheer(id); audio.play("munch");
              await say(id as Exclude<CrewId, "gull">, "Thank you! Yummy!", "ありがとう! おいしい!");
              orders.find((o) => o.who === id)!.served = true;
              setCurrent(null); step = "order";
            } else {
              await say(id as Exclude<CrewId, "gull">, `That's not ${FOODS[want.food].word}! I want ${FOODS[want.food].word}!`, `それは ${FOODS[want.food].ja}じゃない! ${FOODS[want.food].ja}が ほしい!`);
              await say("pepper", "I'll eat it! Cook again!", "それは わたしが たべる! もう いちど つくろう!");
              step = "fetch";
            }
          });
          return;
        }
        if (id === "pepper") {
          const line = step === "light" ? ["Ember! Press J at the stove!", "エンバー! コンロで J!"]
            : step === "order" ? ["Ask the crew: What do you want?", "クルーに きいて: What do you want?"]
            : step === "fetch" ? [vy.carry ? "Put it in the pot!" : `Get ${FOODS[current!.food].word} from the boxes!`, vy.carry ? "おなべに いれて!" : "はこから とってきて!"]
            : step === "heat" ? ["Hold J! Keep the fire green!", "Jを おしつづけて! みどりを キープ!"]
            : ["Take the dish to the crew!", "おさらを クルーに もっていって!"];
          void say2("pepper", line[0], line[1]);
        }
      }
    },
    tool(friend) {
      if (friend !== "ember") { needFriend("ember"); return false; }
      if (!nearStove(3.6)) return false;
      const st = STOVE();
      toolFx("ember", { x: st.x, y: DECK_Y + 0.6, z: st.z });
      if (step === "light" && !cook.lit) {
        cook.lit = true; step = "order";
        sparkleAt(st.x, DECK_Y + 1.2, st.z);
        void say2("pepper", "The fire is on! Now ask the crew. What do they want?", "ひが ついた! クルーに なにが ほしいか きいてね!");
      }
      return true;
    },
    tick(dt) {
      if (step === "heat") {
        const working = vy.hold && activeFriend() === "ember" && nearStove(4.2);
        cook.heat = working ? Math.min(1, cook.heat + dt * 0.36) : Math.max(0, cook.heat - dt * 0.26);
        if (working && rt.time - lastFlame > 0.3) { lastFlame = rt.time; const st = STOVE(); toolFx("ember", { x: st.x, y: DECK_Y + 0.5, z: st.z }); }
        if (cook.heat >= HEAT_BAND[0] && cook.heat <= HEAT_BAND[1]) cook.done += dt;
        if (cook.done >= COOK_SECONDS && cook.pot) {
          cook.dish = cook.pot; cook.pot = null; step = "serve";
          const st = STOVE(); sparkleAt(st.x, DECK_Y + 1.4, st.z); audio.play("correct");
          void say2("pepper", "It's ready! Take the dish!", "できあがり! おさらを もっていって!");
        }
        vy.hud = { title: "Fire", ja: "ひ", value: cook.heat, band: HEAT_BAND, hint: `Hold J: keep it green! ${Math.round(Math.min(1, cook.done / COOK_SECONDS) * 100)}% · Jで みどりを キープ` };
      } else {
        const served = orders.filter((o) => o.served).length;
        const what = step === "light" ? "Ember: J at the stove · コンロで J"
          : step === "order" ? "Ask a hungry pirate · はらぺこの かいぞくに きこう"
          : step === "fetch" ? `${NAME(current!.who)} wants ${FOODS[current!.food].word} · ${FOODS[current!.food].ja}`
          : `Give the dish to ${NAME(current?.who ?? "tom")} · おさらを わたそう`;
        vy.hud = { title: "Dinner", ja: "ばんごはん", count: [served, 3], hint: what };
      }
    },
  };
  setPhase(phase);
  await until(() => orders.filter((o) => o.served).length >= 3);
  setPhase(null);
  await scene(async () => {
    frameTwo(rt.player, crewWorld("pepper"), 0.85);
    cheer("pepper", "tom", "sam", "max");
    await say("pepper", "Thank you! You are a great cook!", "ありがとう! りょうりの てんさいね!");
  });
  for (const id of HUNGRY) vy.crew[id].hold = null;
  Object.assign(cook, { heat: 0, done: 0 });
}

// ------------------------------------------------------------ C. cargo (Leafy)

const FURNITURE: Array<{ id: Furniture; noun: string; at: { x: number; z: number } }> = [
  { id: "table", noun: "the table", at: SPOT.table }, { id: "shelf", noun: "the shelf", at: SPOT.shelf },
  { id: "box", noun: "the box", at: SPOT.box }, { id: "door", noun: "the door", at: SPOT.door },
];
const ITEM_JA: Record<CargoItem, string> = { barrel: "あかい たる", bag: "あおい ふくろ", bottle: "みどりの びん" };
const PREP_JA: Record<Prep, string> = { on: "の うえ", under: "の した", in: "の なか", by: "の そば" };
const FURN_JA: Record<Furniture, string> = { table: "テーブル", shelf: "たな", box: "はこ", door: "ドア" };
const jaPut = (t: Extract<CargoTask, { kind: "put" }>) => `${ITEM_JA[t.item]}を ${FURN_JA[t.furniture]}${PREP_JA[t.prep]}に おいて!`;
export const itemWorld = (item: CargoItem) => { const s = cargoSpot(item, vy.cargo[item]); return { ...L(s.x, s.z), y: s.y }; };

async function cargo() {
  await scene(async () => {
    frameTwo(rt.player, crewWorld("bill"), 0.85);
    await say("bill", "Ahoy! I'm Bosun Bill. Can you help me?", "やあ! ボースンの ビルだ。てつだって くれる?");
    await yesICan();
    await friendFor("leafy", "bill");
    await say("bill", "Leafy's vine can lift things. Stand near a thing and press J!", "リーフィーの つるで もちあげよう。ものの そばで J!");
    await say("bill", "Then press E at the table, the shelf, the box or the door.", "それから テーブル・たな・はこ・ドアで E!");
  });
  vy.cargo = { barrel: null, bag: null, bottle: null };
  vy.carry = null;
  for (const task of cargoTasks()) {
    if (task.kind === "where") await whereTask(task.item);
    else await putTask(task);
  }
  await scene(async () => {
    frameTwo(rt.player, crewWorld("bill"), 0.85);
    cheer("bill");
    await say("bill", "Thank you! The hold looks great!", "ありがとう! にもつが きれいに なった!");
  });
}

async function putTask(task: Extract<CargoTask, { kind: "put" }>) {
  let done = false;
  await scene(async () => {
    frameTwo(rt.player, crewWorld("bill"), 0.95);
    await say("bill", putLine(task), jaPut(task));
  });
  const phase: Phase = {
    name: "cargo",
    candidates() {
      const out: Candidate[] = [crewCandidate("bill")];
      if (vy.carry?.kind === "cargo") for (const f of FURNITURE) out.push(placeCandidate(`furn:${f.id}`, "Put it at", f.noun, f.at, 2.2));
      return out;
    },
    interact(f) {
      if (f.id === "crew:bill") { void scene(async () => { await say("bill", putLine(task), jaPut(task)); }); return; }
      if (!f.id.startsWith("furn:") || vy.carry?.kind !== "cargo") return;
      const furniture = f.id.slice(5) as Furniture, item = vy.carry.item;
      void scene(async () => {
        let prep: Prep = furniture === "box" ? "in" : furniture === "door" ? "by" : "on";
        if (furniture === "table" || furniture === "shelf") {
          const options: PhraseId[] = furniture === "table" ? ["onTheTable", "underTheTable"] : ["onTheShelf", "underTheShelf"];
          const said = await ask({ kind: "choice", options, tapAlways: true, readQuestion: true,
            question: { by: "bill", en: `On or under the ${furniture}?`, ja: `${FURN_JA[furniture]}の うえ? した?` }, help: "on (うえ) か under (した) を えらぼう" });
          if (!said) return;
          prep = said === options[0] ? "on" : "under";
        }
        const pl: Placement = { furniture, prep };
        if (!slotFree(vy.cargo, item, pl)) { await say("bill", "Something is there! Try another place.", "そこには もう ある! ほかの ばしょに しよう"); return; }
        vy.cargo[item] = pl; vy.carry = null;
        audio.play("thud");
        const at = itemWorld(item); sparkleAt(at.x, at.y + 0.5, at.z);
        if (taskDone(task, vy.cargo)) {
          cheer("bill"); friendCheers("leafy"); audio.play("correct");
          await say("bill", "Good job!", "よくできた!");
          done = true;
          return;
        }
        if (item === task.item) {
          await say("bill", `Hmm, ${ITEM_NAME[item]} is ${prep} the ${furniture}. Put it ${task.prep} the ${task.furniture}!`,
            `${ITEM_JA[item]}は ${FURN_JA[furniture]}${PREP_JA[prep]}。${FURN_JA[task.furniture]}${PREP_JA[task.prep]}に おいて!`);
        } else await say("bill", `Hmm! ${putLine(task)}`, jaPut(task));
      });
    },
    tool(friend) {
      if (friend !== "leafy") { needFriend("leafy"); return false; }
      if (vy.carry) return false;
      const item = aim(["barrel", "bag", "bottle"] as CargoItem[], (it) => itemWorld(it), 6, 0.9, 3);
      if (!item) return false;
      const at = itemWorld(item);
      toolFx("leafy", { x: at.x, y: at.y + 0.4, z: at.z });
      vy.cargo[item] = null; vy.carry = { kind: "cargo", item };
      return true;
    },
    tick() {
      const holding = vy.carry?.kind === "cargo" ? `${cap(ITEM_NAME[vy.carry.item].slice(4))}: E at a place · Eで おく` : "Leafy: J lifts a thing · Jで もちあげる";
      vy.hud = { title: putLine(task), ja: jaPut(task), hint: activeFriend() === "leafy" ? holding : "Press 1: Leafy! · 1で リーフィー" };
    },
  };
  setPhase(phase);
  await until(() => done);
  setPhase(null);
}

async function whereTask(item: CargoItem) {
  await scene(async () => {
    const at = itemWorld(item);
    shot({ x: at.x + 3.5, y: DECK_Y + 4.5, z: at.z + 5 }, { x: at.x, y: at.y + 0.3, z: at.z });
    const truth = vy.cargo[item] ? placePhrase(vy.cargo[item]!) : null;
    for (;;) {
      const said = await ask({ kind: "choice", options: whereChoices(vy.cargo, item), tapAlways: true, readQuestion: true,
        question: { by: "bill", en: `Where is ${ITEM_NAME[item]}?`, ja: `${ITEM_JA[item]}は どこ?` }, help: "よく みて こたえよう" });
      if (!said || said === truth) break;
      await say("bill", "Hmm... look again!", "よく みてごらん!");
    }
    cheer("bill"); audio.play("correct");
    await say("bill", "Yes! Good job!", "そう! よくできた!");
  });
}

// ------------------------------------------------------------ D. sailing (Puff), then steering

async function sailing() {
  await scene(async () => {
    frameTwo(rt.player, crewWorld("redbeard"), 0.85);
    await say("redbeard", "The wind is gone! Can you make wind?", "かぜが ない! かぜを おこせる?");
    await yesICan();
    await friendFor("puff", "redbeard");
    await say("redbeard", "Fill the three sails! Face a sail and press J.", "3まいの ほを ふくらませて! ほの ほうを むいて J!");
  });
  vy.sails = [0.12, 0.12, 0.12];
  vy.flow = 0.15;
  const full = () => vy.sails.filter((s) => s >= 0.99).length;
  const phase: Phase = {
    name: "sails",
    candidates: () => [crewCandidate("redbeard")],
    interact: () => { void scene(async () => { await say("redbeard", `${cap(NUM[3 - full()])} more! Face a sail and press J!`, "ほの ほうを むいて J!"); }); },
    tool(friend) {
      if (friend !== "puff") { needFriend("puff"); return false; }
      const i = aim([0, 1, 2].filter((k) => vy.sails[k] < 0.99), (k) => L(SAIL_AIM[k].x, SAIL_AIM[k].z), 9, 0.9, 5);
      if (i === null) return false;
      const s = SAIL_AIM[i], w = L(s.x, s.z);
      toolFx("puff", { x: w.x, y: s.y, z: w.z });
      vy.sails[i] = Math.min(1, vy.sails[i] + 0.34);
      if (vy.sails[i] >= 0.99) { vy.sails[i] = 1; sparkleAt(w.x, s.y, w.z); audio.play("whoosh"); }
      vy.flow = 0.15 + full() * 0.45;
      return true;
    },
    tick() {
      // A broadside view while the sails fill (they are edge-on to the stern camera).
      const p = rt.player;
      shot({ x: p.x + 15, y: DECK_Y + 7.5, z: p.z + 3.5 }, { x: p.x - 1.5, y: DECK_Y + 3.2, z: p.z - 1 });
      vy.hud = { title: "Sails", ja: "ほ", count: [full(), 3], hint: activeFriend() === "puff" ? "Face a sail: J · ほを むいて J" : "Press 3: Puff! · 3で パフ" };
    },
  };
  // Seen broadside, the sails no longer stand between the camera and the player: keep them whole.
  vy.cut = false;
  setPhase(phase);
  await until(() => full() === 3);
  setPhase(null);
  vy.cut = true;
  vy.flow = 2;
  await scene(async () => {
    cheer("redbeard", "gull"); friendCheers("puff");
    frameTwo(rt.player, crewWorld("redbeard"), 0.85);
    await say("redbeard", "Full sails! We are fast now! Come to the helm!", "ほが いっぱい! はやいぞ! かじの ところへ!");
  });
  await steering();
}

const OBSTACLE_JA = { rock: "いわ", barrel: "たる" };

async function steering() {
  await scene(async () => {
    await fadeThrough(() => {
      placeOnDeck(shipWorld({ x: 0.9, z: 12.4 }));
      rt.player.yaw = Math.PI;
    }, 400);
    rt.player.frozen = true;
    vy.lane = 0; vy.laneVis = 0; vy.obstacles = [];
    const kinds: Array<"rock" | "barrel"> = ["rock", "barrel", "rock", "barrel"];
    for (let i = 0; i < kinds.length; i++) {
      for (;;) if (await steerOne(kinds[i], i)) break;
    }
    steerShot();
    await say("redbeard", "We're here! Say: Stop!", "ついたぞ! 「Stop!」と いおう!");
    await say1("cmdStop", "「Stop!」と いおう");
    await over(1.5, (k) => { vy.flow = lerp(2, 0.5, k); });
    cheer("redbeard", "gull"); friendCheers("puff");
    await say("redbeard", "It's windy! Great job!", "かぜが いっぱい! よくやった!");
  });
}

const steerShot = () => shot(
  { x: L(0, 0).x, y: DECK_Y + 13, z: L(0, 34).z },
  { x: L(0, 0).x, y: 0, z: L(0, -34).z });

/** One obstacle: the captain calls it, the student steers; a wrong lane is a gentle bump and a retry. */
async function steerOne(kind: "rock" | "barrel", i: number): Promise<boolean> {
  steerShot();
  const lane = vy.lane as Lane;
  const options: Lane[] = lane === 0 ? [-1, 0, 1] : [lane, 0];
  const at = options[(i * 2 + 1) % options.length];
  const o = { id: i, kind, lane: at, z: -110, hit: 0 };
  vy.obstacles = [o];
  await over(2.6, (k) => { o.z = lerp(-110, -58, k); });
  const side = obstacleSide(lane, at);
  const word = kind === "rock" ? "Rocks" : "A barrel";
  const call = side === "ahead" ? `${word} ahead!` : `${word} on the ${side}!`;
  const ja = side === "ahead" ? `まえに ${OBSTACLE_JA[kind]}!` : side === "left" ? `ひだりに ${OBSTACLE_JA[kind]}!` : `みぎに ${OBSTACLE_JA[kind]}!`;
  const said = (await ask({ kind: "choice", options: ["turnLeft", "goStraight", "turnRight"], tapAlways: true, readQuestion: true,
    question: { by: "redbeard", en: call, ja }, help: "ぶつからない ほうへ!" })) as SteerCommand | null;
  const cmd: SteerCommand = said ?? "goStraight";
  const safe = safeCommand(lane, at, cmd);
  vy.lane = steer(lane, cmd);
  audio.play("creak");
  await over(2.2, (k) => { o.z = lerp(-58, safe ? 30 : -25, k); });
  if (!safe) {
    o.hit = rt.time; audio.play("bump");
    await over(0.6, (k) => { vy.shipRoll = Math.sin(k * Math.PI * 3) * 0.05 * (1 - k); });
    vy.shipRoll = 0;
    vy.obstacles = [];
    await say("redbeard", "Bump! Oops! Try again!", "ゴツン! もう いちど!");
    return false;
  }
  vy.obstacles = [];
  audio.play("correct");
  await say("redbeard", i % 2 ? "Phew! Good!" : "Good steering!", "よし! いいぞ!");
  return true;
}

// ------------------------------------------------------------ the crew's thanks, the hat, thunder

async function crewFinale() {
  await scene(async () => {
    rt.player.frozen = true;
    await fadeThrough(() => {
      placeOnDeck(shipWorld({ x: 0, z: 5.6 }));
      rt.player.yaw = 0;
      const spots: Array<[CrewId, number, number]> = [["redbeard", 0, 9.2], ["pepper", 1.6, 8.4], ["bill", -1.6, 8.4], ["finn", -2.6, 9.6], ["gull", 2.6, 9.6], ["tom", 3.0, 6.4], ["sam", -3.0, 6.6], ["max", 3.2, 4.4]];
      for (const [id, x, z] of spots) { vy.crew[id].x = x; vy.crew[id].z = z; vy.crew[id].yaw = Math.PI; vy.crew[id].hold = null; }
    }, 400);
    shot({ x: L(4.5, 0).x, y: DECK_Y + 4.2, z: L(0, 1.8).z }, { x: L(0, 0).x, y: DECK_Y + 1.2, z: L(0, 8).z });
    audio.startMusic("celebrate");
    await say("redbeard", "Your monsters are amazing!", "きみの モンスターは すごい!");
    cheer("pepper");
    await say("pepper", "No monster soup!", "モンスタースープは なし!");
    for (const f of COMPANION_IDS) friendCheers(f);
    await say("redbeard", "You're part of my crew now! This is for you!", "きみも なかまだ! これを あげよう!");
    const had = getGame().progress.act3.voyage.hat;
    updateProgress((p) => markHatGiven(giveWearable(p, "captainHat")));
    if (!had) { audio.play("chest"); toast({ en: "Captain Hat!", ja: "せんちょうの ぼうし!", icon: "captainHat", tone: "good" }, 2600); }
    const wearIt = await ask({ kind: "choice", options: ["yesPlease", "noThankYou"], tapAlways: true, readQuestion: true,
      question: { by: "redbeard", en: "Do you want to wear it?", ja: "かぶってみる?" }, help: "かぶる? かぶらない?" });
    if (wearIt === "yesPlease") updateProgress((p) => wear(p, "captainHat", "player"));
    await say("redbeard", wearIt === "yesPlease" ? "You look great, Captain!" : "Okay! Keep it!", wearIt === "yesPlease" ? "にあってる!" : "わかった! もっていてね!");
    // Thunder: the weather turns.
    vy.flash = rt.time; audio.play("rumble");
    await over(1.4, (k) => { vy.storm = 0.35 * k; });
    await say("harbor", "Oh no... Look at the sky!", "あっ… そらを みて!");
    for (const [id, p] of [["redbeard", SPOT.captain], ["pepper", SPOT.cook], ["bill", SPOT.bill], ["finn", SPOT.finn], ["gull", SPOT.gull]] as Array<[CrewId, { x: number; z: number }]>) { vy.crew[id].x = p.x; vy.crew[id].z = p.z; }
    vy.crew.tom.x = SPOT.crew[0].x; vy.crew.tom.z = SPOT.crew[0].z; vy.crew.sam.x = SPOT.crew[1].x; vy.crew.sam.z = SPOT.crew[1].z; vy.crew.max.x = SPOT.crew[2].x; vy.crew.max.z = SPOT.crew[2].z;
  });
  updateProgress((p) => setVoyageStage(p, "storm"));
  saveNow();
  await startStorm();
}

/** True when every job is finished (the storm may begin). */
export const crewWarm = () => allJobsDone(getGame().progress.act3.voyage);
