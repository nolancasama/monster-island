import { MONSTERS } from "../data/monsters";
import { FOODS } from "../data/foods";
import { COMBAT, PRICES, RECIPES, COMPANION_IDS, type CompanionId } from "../data/combat";
import { NPCS, type NpcId } from "../data/town";
import { NUMBER_PHRASE, WANT_PHRASE, heardQuantity, type PhraseId } from "../logic/english";
import { buy, craft, craftMissing, findPort, hearLead, markDescended, markTutorial, openChest, practise, rested, setCheckpoint, startAct2, addCoins, type Checkpoint } from "../logic/act2";
import { companions } from "../logic/progress";
import { banner, getGame, setGame, toast, updateProgress } from "../store";
import { animate, effect, rt } from "../runtime";
import { cb, hint, hooks, learn, resetCombat, wakeUp } from "../combat";
import { CAMP2, CHESTS, CLIFF_ROPE, MAPLE_PORT, SERVICES, ZONES, type ServiceId, type ZoneId } from "../world/lowland";
import { LEDGE, groundY } from "../world/island";
import { PLAYER_R, gatesOf, nearestWalkable } from "../world/collision";
import { ask, fastMode, lastHeard, say, wait } from "./ask";
import { fadeThrough, frameTwo, run, shot } from "./script";
import { poofTo } from "./companion";
import { saveNow } from "./story";
import { audio } from "../../audio/audio";
import type { FoodId, MonsterId } from "../types";
import { cloudKnockout, sailWithGull } from "./act3";

/**
 * Act 2's scripted moments: the raiders take Lumo (once), the rope down the
 * sanctuary's cliff, chests, resting, the town's services (each a short
 * English conversation), the harbour's lead, and waking up after a
 * knock-out. Fights themselves are in combat.ts.
 */

/** Scene timings shrink in test runs (?fast=1), like `wait`. */
const D = (s: number) => (fastMode() ? Math.min(s, 0.25) : s);

async function over(seconds: number, fn: (k: number) => void) {
  const t0 = rt.time;
  const dur = D(seconds);
  for (;;) {
    const k = Math.min(1, (rt.time - t0) / dur);
    fn(k);
    if (k >= 1) return;
    await wait(16);
  }
}

const ease = (k: number) => k * k * (3 - 2 * k);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Where Maple waits once Lumo is gone: by the lookout until the town is found, then on the quay. */
export const MAPLE_LEDGE = { x: 72.6, z: -144.6, yaw: Math.PI * 0.85 };

export function placeMapleForAct2() {
  const a = getGame().progress.act2;
  if (!a.started) return;
  const m = a.portFound ? MAPLE_PORT : MAPLE_LEDGE;
  rt.maple.x = m.x;
  rt.maple.z = m.z;
  rt.maple.yaw = m.yaw;
}

/** Friends gather round after a scene (the active one beside the player, the rest just behind). */
export function gatherParty() {
  const p = getGame().progress;
  const pl = rt.player;
  companions(p).forEach((id, i) => {
    const m = rt.monsters[id];
    m.look = null;
    m.air = m.airTarget = 0;
    m.mode = id === p.active ? "follow" : "party";
    const back = 1.6 + (i % 2) * 0.9;
    const side = (i % 2 ? 1 : -1) * (1 + i * 0.35);
    const x = pl.x - Math.sin(pl.yaw) * back + Math.cos(pl.yaw) * side;
    const z = pl.z - Math.cos(pl.yaw) * back - Math.sin(pl.yaw) * side;
    if (Math.hypot(m.x - x, m.z - z) > 3) poofTo(id, x, z);
  });
}

// ------------------------------------------------------------ the kidnapping

/**
 * Lumo is taken. Plays inside the finale's script (fromFinale) or from a
 * finished save (Act 2's start). Act 2 is recorded the moment the cage
 * lifts, so a reload after that never replays it.
 */
export async function kidnapScene(fromFinale: boolean) {
  const h = MONSTERS.lumo.home;
  const gy = groundY(h.x, h.z);
  const lumo = rt.monsters.lumo;
  const pl = rt.player;
  const team = companions(getGame().progress);
  pl.frozen = true;
  setGame({ screen: "game", hint: null });
  if (!fromFinale) {
    await fadeThrough(() => {
      pl.x = h.x;
      pl.z = h.z + 5;
      pl.vx = pl.vz = 0;
      pl.yaw = Math.PI;
      rt.maple.x = h.x - 2.6;
      rt.maple.z = h.z + 4.2;
      team.forEach((id, i) => {
        const m = rt.monsters[id];
        m.mode = "script";
        m.x = h.x - 3.6 + i * 2.4;
        m.z = h.z + 2.6 + (i % 2) * 0.5;
        m.look = { x: h.x, z: h.z };
      });
      lumo.mode = "script";
      lumo.x = h.x;
      lumo.z = h.z;
      lumo.air = lumo.airTarget = 1.2;
      shot({ x: h.x + 7, y: gy + 4.4, z: h.z + 9 }, { x: h.x, y: gy + 1.8, z: h.z });
    }, 300);
  } else {
    team.forEach((id, i) => {
      const m = rt.monsters[id];
      m.mode = "script";
      m.x = h.x - 3.6 + i * 2.4;
      m.z = h.z + 2.6 + (i % 2) * 0.5;
      m.look = { x: h.x, z: h.z };
    });
    shot({ x: h.x + 7, y: gy + 4.4, z: h.z + 9 }, { x: h.x, y: gy + 2.2, z: h.z });
  }
  // 1. The celebration: everyone dances, the prologue is complete.
  rt.act2Scene = "celebrate";
  audio.startMusic("celebrate");
  const air0 = lumo.air;
  await over(1.2, (k) => (lumo.air = lumo.airTarget = lerp(air0, 1.2, ease(k))));
  banner({ title: "Prologue Clear!", sub: "All five monsters are your friends!", ja: "プロローグ クリア! 5ひき みんな ともだち!", tone: "clear" }, 3800);
  audio.play("sparkle");
  for (const id of team) {
    animate(id, "friend");
    audio.voice(id, "excited");
  }
  animate("lumo", "spin");
  effect("hearts", h.x, gy + 2.4, h.z);
  await wait(3400);
  // 2. A rumble in the sky.
  rt.act2Scene = "arrive";
  audio.stopMusic();
  audio.play("rumble");
  for (const id of [...team, "lumo" as MonsterId]) animate(id, "notice");
  const look = { x: h.x + 2, y: gy + 7, z: h.z - 2 };
  await over(1.3, (k) => {
    const j = Math.sin(k * 60) * 0.12 * (1 - k);
    shot({ x: h.x + 6 + j, y: gy + 2.2 + j, z: h.z + 9 }, { x: lerp(h.x, look.x, ease(k)), y: lerp(gy + 2, look.y, ease(k)), z: lerp(h.z, look.z, ease(k)) });
  });
  await say("self", "What's that sound?", "なんの おと?");
  audio.startMusic("danger");
  const ship = rt.ship;
  ship.visible = true;
  ship.scale = 1;
  // It sweeps in from the north-east and turns side-on over the garden (its emblem toward us).
  const from = { x: h.x + 45, y: gy + 26, z: h.z - 55 };
  const to = { x: h.x, y: gy + 11, z: h.z - 1.5 };
  const heading = Math.atan2(to.x - from.x, to.z - from.z);
  // Inside the garden (the gate wall stands behind it), low, looking up past the group.
  const cam = { x: h.x + 2.5, y: gy + 1.6, z: h.z + 7.5 };
  await over(4.5, (k) => {
    const e = ease(k);
    ship.x = lerp(from.x, to.x, e);
    ship.y = lerp(from.y, to.y, e) + Math.sin(rt.time * 1.5) * 0.15;
    ship.z = lerp(from.z, to.z, e);
    ship.yaw = heading + (Math.PI / 2 - heading) * ease(Math.max(0, (k - 0.5) / 0.5));
    shot(cam, { x: lerp(ship.x, h.x, 0.35), y: lerp(ship.y, gy + 1, 0.4), z: lerp(ship.z, h.z, 0.35) });
  });
  rt.maple.talking = true;
  await say("maple", "Oh no! Sky raiders!", "たいへん! そらの とうぞくだ!");
  rt.maple.talking = false;
  // 3. The cage drops over Lumo and lifts it up into the airship.
  rt.act2Scene = "capture";
  const cage = ship.cage;
  cage.visible = true;
  cage.closed = 0;
  shot({ x: h.x + 5.5, y: gy + 3.4, z: h.z + 8 }, { x: h.x, y: gy + 3.6, z: h.z });
  audio.play("cage");
  await over(1.6, (k) => {
    ship.chain = ease(k);
    cage.x = h.x;
    cage.z = h.z;
    cage.y = lerp(ship.y - 1.6, gy + lumo.air - 0.2, ease(k));
  });
  await over(0.6, (k) => (cage.closed = k));
  animate("lumo", "no");
  audio.voice("lumo", "sad");
  for (const id of team) {
    animate(id, "no");
    audio.voice(id, "surprised");
    const m = rt.monsters[id];
    m.x += (h.x - m.x) * 0.25;
    m.z += (h.z - m.z) * 0.25;
  }
  await say("self", "Lumo!", "ルモ!");
  await over(2, (k) => {
    cage.y = lerp(gy + 1.0, ship.y - 1.6, ease(k));
    ship.chain = 1 - ease(k);
    lumo.air = lumo.airTarget = cage.y - gy + 0.2;
  });
  // Recorded now: a reload from here on never replays the kidnapping.
  updateProgress((p) => startAct2(p));
  saveNow();
  // 4. The airship escapes north over the cliff; the camera follows and sweeps down over the lowland.
  rt.act2Scene = "escape";
  const sx = ship.x, sy = ship.y, sz = ship.z;
  const shipAt = (k: number) => ({
    x: lerp(sx, 76, ease(Math.min(1, k * 1.4))),
    y: lerp(sy, 26, k),
    z: lerp(sz, -345, k)
  });
  await over(8, (k) => {
    const s = shipAt(k);
    ship.x = s.x;
    ship.y = s.y + Math.sin(rt.time * 1.5) * 0.15;
    ship.z = s.z;
    ship.yaw = Math.PI;
    ship.scale = 1 - Math.max(0, k - 0.85) / 0.15 * 0.6;
    cage.x = ship.x;
    cage.y = ship.y - 1.6;
    cage.z = ship.z;
    lumo.x = cage.x;
    lumo.z = cage.z;
    lumo.air = lumo.airTarget = cage.y - groundY(lumo.x, lumo.z) + 0.2;
    if (k > 0.3) rt.act2Scene = "reveal";
    // From the garden out over the lip of the lookout, then down and north over the forest.
    const c = ease(Math.min(1, k / 0.75));
    const cam = { x: lerp(h.x - 2, 75.5, c), y: lerp(gy + 3, gy - 2.5, c), z: lerp(h.z + 6, -156, c) };
    const tgt = { x: lerp(ship.x, 76, Math.min(1, k * 1.3)), y: lerp(ship.y - 1, 6, Math.min(1, k * 1.2)), z: lerp(ship.z, -290, Math.min(1, k * 1.2)) };
    shot(cam, tgt);
  });
  ship.visible = false;
  cage.visible = false;
  lumo.air = lumo.airTarget = 0;
  lumo.x = h.x;
  lumo.z = h.z;
  await wait(400);
  // 5. Maple explains; the rope goes down the cliff; the new quest.
  await fadeThrough(() => {
    pl.x = CLIFF_ROPE.top.x;
    pl.z = CLIFF_ROPE.top.z + 1.6;
    pl.yaw = Math.PI;
    rt.maple.x = MAPLE_LEDGE.x;
    rt.maple.z = MAPLE_LEDGE.z;
    team.forEach((id, i) => {
      const m = rt.monsters[id];
      m.mode = "script";
      m.x = pl.x + 1.6 + (i % 2) * 1.1;
      m.z = pl.z + 1.2 + Math.floor(i / 2) * 1.4;
      m.look = { x: 76, z: -200 };
      m.air = m.airTarget = 0;
    });
    const ly = groundY(LEDGE.x0 + 2, LEDGE.z0 + 2);
    shot({ x: pl.x - 4.2, y: ly + 3.2, z: pl.z + 5.2 }, { x: 76, y: ly - 6, z: -200 });
  });
  rt.maple.talking = true;
  rt.maple.wave = rt.time;
  await say("maple", "They took Lumo!", "ルモが つれて いかれた!");
  await say("maple", "Look! The airship flew to the north.", "みて! ひこうせんは きたへ とんで いった。");
  await say("maple", "There is a port town by the sea.", "うみの そばに みなとまちが あるよ。");
  await say("maple", "Maybe the raiders went to the port. Let's find out!", "とうぞくは みなとへ いったかも。しらべに いこう!");
  await say("maple", "I have a rope. Climb down the cliff!", "ロープが あるよ。がけを おりよう!");
  rt.maple.talking = false;
  rt.cliffRope = 1;
  effect("poof", CLIFF_ROPE.x, groundY(CLIFF_ROPE.x, CLIFF_ROPE.top.z) + 0.6, CLIFF_ROPE.stakeZ);
  audio.play("whoosh");
  rt.act2Scene = "quest";
  audio.startMusic("island");
  banner({ title: "NEW QUEST: Rescue Lumo!", sub: "Reach the port and find out where Lumo was taken.", ja: "あたらしい クエスト: ルモを たすけよう! みなとへ いって ルモの いばしょを しらべよう", tone: "quest" }, 5200);
  audio.play("chest");
  await wait(1800);
  resetCombat();
  rt.act2Scene = "done";
  gatherParty();
  saveNow();
}

/** From a finished prologue save: go to the garden and play the kidnapping. */
export function startAct2Scene(): Promise<void> {
  return run(async () => {
    if (getGame().progress.act2.started) return;
    await kidnapScene(false);
  });
}

// ------------------------------------------------------------ the cliff rope

/** Climb down (or up) the rope on the sanctuary's cliff. The camera follows the climber steadily from the side. */
export function climbCliff(down: boolean): Promise<void> {
  return run(async () => {
    const pl = rt.player;
    const r = CLIFF_ROPE;
    const topY = groundY(r.x, r.top.z);
    const footY = groundY(r.foot.x, r.foot.z);
    // The hands stay on the rope: start just below the lip (going down) or at the foot (going up).
    const high = topY - 1.05;
    const low = footY;
    const from = down ? high : low;
    const to = down ? low : high;
    pl.frozen = true;
    const cam = (y: number) => shot({ x: r.x + 4.6, y: y + 1.6, z: r.bodyZ - 6.2 }, { x: r.x, y: y + 0.7, z: r.faceZ });
    await fadeThrough(() => {
      pl.vx = pl.vz = 0;
      pl.yaw = 0;
      pl.climbY = from;
      pl.x = r.x;
      pl.z = r.bodyZ;
      cam(from);
    }, 250);
    audio.play("whoosh");
    // About 2 m a second; the limbs are driven by the height climbed (rope.ts CLIMB_PULL), so they match the pace.
    const dur = Math.abs(to - from) / 2;
    await over(dur, (k) => {
      const e = k < 0.08 ? (k * k) / 0.16 : k > 0.92 ? 0.92 - ((1 - k) * (1 - k)) / 0.16 : k - 0.04;
      pl.climbY = from + ((to - from) * e) / 0.92;
      pl.x = r.x;
      pl.z = r.bodyZ;
      cam(pl.climbY);
    });
    await fadeThrough(() => {
      pl.climbY = null;
      const spot = down ? r.foot : r.top;
      pl.x = spot.x;
      pl.z = spot.z;
      pl.yaw = Math.PI;
      gatherParty();
    }, 250);
    pl.frozen = false;
    if (down) {
      const first = !getGame().progress.act2.descended;
      updateProgress((p) => markDescended(p));
      if (first) {
        banner({ title: "Primeval Forest", sub: "Enemies are near! Your friend will help you.", ja: "げんしの もり — てきが いるよ! ともだちが たすけて くれる", tone: "place" }, 3600);
      }
    }
  });
}

// ------------------------------------------------------------ chests and resting

export function openChestScene(id: string): Promise<void> {
  return run(async () => {
    const c = CHESTS.find((x) => x.id === id);
    if (!c || getGame().progress.act2.chests.includes(id)) return;
    frameTwo(rt.player, c, 0.9);
    rt.player.yaw = Math.atan2(c.x - rt.player.x, c.z - rt.player.z);
    audio.play("chest");
    await over(0.6, (k) => rt.chestLid.set(id, ease(k)));
    effect("sparkle", c.x, groundY(c.x, c.z) + 0.9, c.z);
    rt.player.action = { kind: "cheer", t0: rt.time };
    updateProgress((p) => openChest(p, id));
    const parts = [`${c.coins} coins`];
    if (c.amber) parts.push(`${c.amber} amber`);
    if (c.food) parts.push(`${c.food.n} ${FOODS[c.food.id].word}`);
    await say("game", `Treasure! ${parts.join(", ")}!`, `たからばこ! コイン ${c.coins}まい${c.amber ? "・こはく" : ""}${c.food ? `・${FOODS[c.food.id].ja}` : ""}`);
    if (id === "forestChest") {
      await say("game", "Food gives HP and MP! Press F to eat. (Tap the food in your bag.)", "たべものを たべると HPと MPが ふえるよ! F キー (または バッグの たべもの を タップ)");
      await say("game", "Amber is for monster treats. Keep it for the town!", "こはくは モンスターの おやつの ざいりょう。まちまで もっていこう!");
      hint("eat");
    }
  });
}

/** A full rest: HP and every friend's MP back to full, nothing lost. */
async function restHere(checkpoint: Checkpoint, line: [string, string]) {
  await fadeThrough(async () => {
    cb.vitals = rested();
    audio.play("rest");
    updateProgress((p) => setCheckpoint(markTutorial(p, "rest"), checkpoint));
    await wait(400);
  }, 600);
  toast({ en: "HP and MP are full!", ja: "HPも MPも まんたん!", icon: "heart", tone: "good" }, 2200);
  await say("game", line[0], line[1]);
}

export function restAtCamp(): Promise<void> {
  return run(async () => {
    const first = !getGame().progress.act2.tutorial.includes("rest");
    await restHere("camp", ["You rested at the camp.", "キャンプで やすんだ。たおれても ここに もどれるよ"]);
    if (first) {
      await say("game", "Two paths! Left: the Flooded Grove. Right: the Ancient Canopy. Both go to the port.", "みちが ふたつ! ひだり: みずびたしの もり。みぎ: こだいの きのうえ。どちらも みなとへ いけるよ");
      hint("switch");
    }
  });
}

export function readForkSign(): Promise<void> {
  return run(async () => {
    await say("self", "Left: Flooded Grove. Right: Ancient Canopy. To the Port!", "ひだり: みずびたしの もり。みぎ: こだいの きのうえ。みなとへ!");
  });
}

export function lookAtLockedGate(): Promise<void> {
  return run(async () => {
    await say("self", "The gate is shut! Thorns hold it on the other side.", "とびらが しまっている! むこうがわに いばらが からまっている");
  });
}

// ------------------------------------------------------------ knock-out

const CHECKPOINT_SPOT: Record<Checkpoint, { x: number; z: number; yaw: number }> = {
  cliff: { ...CLIFF_ROPE.foot, yaw: Math.PI },
  camp: { x: CAMP2.rest.x, z: CAMP2.rest.z - 0.4, yaw: Math.PI },
  port: { x: SERVICES.inn.keeper.x - 2, z: SERVICES.inn.keeper.z, yaw: -Math.PI / 2 }
};

hooks.knockout = () => {
  if (cloudKnockout()) return;
  void run(async () => {
    const pl = rt.player;
    pl.frozen = true;
    pl.action = { kind: "ko", t0: rt.time };
    audio.play("ko");
    for (let i = 0; i < 3; i++) effect("notes", pl.x, pl.y + 1.4, pl.z);
    await wait(1400);
    await say("game", "Oh no! You need a rest.", "たいへん! ひと やすみ しよう");
    const at = CHECKPOINT_SPOT[getGame().progress.act2.checkpoint];
    await fadeThrough(() => {
      const s = nearestWalkable(at.x, at.z, PLAYER_R, gatesOf(getGame().progress));
      pl.x = s.x;
      pl.z = s.z;
      pl.yaw = at.yaw;
      pl.action = null;
      wakeUp();
      gatherParty();
    }, 600);
    toast({ en: "You're OK! Coins and items are safe.", ja: "だいじょうぶ! コインも どうぐも そのまま", icon: "heart", tone: "info" }, 3000);
  });
};

// ------------------------------------------------------------ entering areas

let lastZoneToast = "";
hooks.enterZone = (zone: ZoneId) => {
  const z = ZONES[zone];
  audio.setScene(zone === "port" ? "port" : "forest");
  audio.startMusic(z.hostile ? "forest" : zone === "port" ? "port" : "island");
  if (lastZoneToast !== zone) {
    lastZoneToast = zone;
    toast({ en: z.name.en, ja: z.name.ja, icon: z.hostile ? "star" : "heart", tone: "info" }, 2200);
  }
  if (zone === "port" && !getGame().progress.act2.portFound) void arriveAtPort();
};

function arriveAtPort(): Promise<void> {
  return run(async () => {
    updateProgress((p) => findPort(p));
    placeMapleForAct2();
    banner({ title: "Port Town", sub: "A safe place. Shops, food and friends!", ja: "みなとまち — あんぜんな まち。おみせが あるよ!", tone: "place" }, 3800);
    audio.play("chest");
    frameTwo(rt.player, rt.maple, 1.4);
    rt.maple.talking = true;
    rt.maple.wave = rt.time;
    await say("maple", "You made it! I came by boat.", "ついたね! わたしは ふねで きたよ。");
    await say("maple", "Let's get ready. Buy food at the market.", "じゅんびを しよう。おみせで たべものを かおう。");
    await say("maple", "Then make a monster treat in the kitchen.", "それから キッチンで モンスターの おやつを つくろう。");
    await say("maple", "Then ask at the harbor office: Where is the ship?", "そして みなとの じむしょで「Where is the ship?」と きこう。");
    rt.maple.talking = false;
    saveNow();
  });
}

// ------------------------------------------------------------ the town

export function talkToKeeper(service: ServiceId): Promise<void> {
  if (service === "market") return market();
  if (service === "kitchen") return kitchen();
  if (service === "trainer") return trainer();
  if (service === "inn") return inn();
  return harborOffice();
}

function faceKeeper(id: NpcId) {
  const k = SERVICES[NPCS[id].service].keeper;
  rt.player.yaw = Math.atan2(k.x - rt.player.x, k.z - rt.player.z);
  frameTwo(rt.player, k, 0.85);
}

/** The food market: the full English exchange the first time, the quick-buy panel after that. */
function market(): Promise<void> {
  return run(async () => {
    faceKeeper("shopkeeper");
    if (getGame().progress.act2.bought) {
      await say("shopkeeper", "Hello again! What do you want?", "いらっしゃい! なにが ほしい?");
      setGame({ panel: "shop" });
      return;
    }
    await say("shopkeeper", "Hello! Welcome to my shop!", "いらっしゃいませ!");
    await shopConversation();
  });
}

const SHOP_FOODS: FoodId[] = ["apples", "bananas", "fish", "berries", "meat"];

async function shopConversation() {
  const food = await askWhichFood();
  if (!food) return;
  let n = heardQuantity(lastHeard());
  if (!n) {
    const said = await ask({
      kind: "choice",
      options: [NUMBER_PHRASE[1], NUMBER_PHRASE[2], NUMBER_PHRASE[3]],
      question: { en: "How many?", ja: "いくつ?", by: "shopkeeper" },
      readQuestion: true,
      help: `${FOODS[food].ja}を いくつ かう? (${PRICES[food]}コイン ずつ)`,
      cancellable: true
    });
    if (!said) return;
    n = said === "oneP" ? 1 : said === "twoP" ? 2 : 3;
  }
  const res = buy(getGame().progress, food, n);
  if (!res.ok) {
    if (res.reason === "coins") await say("shopkeeper", `Sorry! That's ${PRICES[food] * n} coins.`, `ごめんね! ${PRICES[food] * n}コイン ひつようだよ。てきを たおして コインを あつめよう`);
    else await say("shopkeeper", "Your bag is full!", "バッグが いっぱいだよ!");
    return;
  }
  updateProgress(() => res.progress);
  audio.play("buy");
  rt.player.action = { kind: "give", t0: rt.time };
  await say("shopkeeper", `Here you are! ${n} ${FOODS[food].word}.`, `はい、どうぞ! ${FOODS[food].ja} ${n}こ`, { food });
  await ask({ kind: "command", options: ["thankYou"], readSentence: true, help: "おれいを いおう" });
  await say("shopkeeper", "You're welcome! Next time, just tap and buy.", "どういたしまして! つぎからは タップで かえるよ");
}

async function askWhichFood(): Promise<FoodId | null> {
  const said = await ask({
    kind: "choice",
    options: SHOP_FOODS.map((f) => WANT_PHRASE[f]),
    frame: { before: "I want", after: ", please." },
    question: { en: "What do you want?", ja: "なにが ほしい?", by: "shopkeeper" },
    readQuestion: true,
    icons: Object.fromEntries(SHOP_FOODS.map((f) => [WANT_PHRASE[f], f])),
    help: "ほしい たべものを えいごで いおう (かずも いえるよ: three apples)",
    cancellable: true
  });
  if (!said) return null;
  return SHOP_FOODS.find((f) => WANT_PHRASE[f] === said) ?? null;
}

/** The quick-buy panel's Buy button. */
export function quickBuy(food: FoodId, n: number): boolean {
  const res = buy(getGame().progress, food, n);
  if (!res.ok) {
    audio.play("error");
    toast(res.reason === "coins" ? { en: "Not enough coins!", ja: "コインが たりない!", icon: "coin", tone: "warn" } : { en: "Your bag is full!", ja: "バッグが いっぱい!", icon: food, tone: "info" }, 1800);
    return false;
  }
  updateProgress(() => res.progress);
  audio.play("buy");
  toast({ en: `+${n} ${FOODS[food].word}`, ja: `${FOODS[food].ja} ${n}こ`, icon: food, tone: "good" }, 1400);
  return true;
}

const MIX_PHRASE: Record<CompanionId, PhraseId> = { leafy: "mixLeafy", bubbo: "mixBubbo", puff: "mixPuff", ember: "mixEmber" };

/** The kitchen: name the two foods to mix; the treat teaches its friend an upgrade. */
function kitchen(): Promise<void> {
  return run(async () => {
    faceKeeper("cook");
    const p = getGame().progress;
    const left = COMPANION_IDS.filter((f) => p.monsters[f].friend && !p.act2.upgrades.includes(f));
    if (!left.length) {
      await say("cook", "Your friends ate all my treats! They are super strong now!", "ともだちは みんな おやつを たべたよ! とても つよく なった!");
      return;
    }
    await say("cook", "Hi! I make monster treats. Two foods and one amber!", "やあ! モンスターの おやつを つくるよ。たべもの 2つと こはく 1つ!");
    const said = await ask({
      kind: "choice",
      options: left.map((f) => MIX_PHRASE[f]),
      question: { en: "What do you want to make?", ja: "なにを つくる?", by: "cook" },
      readQuestion: true,
      help: left.map((f) => `${RECIPES[f].treat.ja}(${MONSTERS[f].name})`).join("・"),
      cancellable: true
    });
    if (!said) return;
    const friend = left.find((f) => MIX_PHRASE[f] === said)!;
    const r = RECIPES[friend];
    const missing = craftMissing(getGame().progress, friend);
    if (missing.length) {
      const names = missing.map((m) => (m === "amber" ? "amber" : FOODS[m as FoodId].word));
      const ja = missing.map((m) => (m === "amber" ? "こはく" : FOODS[m as FoodId].ja)).join("と ");
      await say("cook", `You need ${names.join(" and ")}.`, `${ja}が ひつようだよ。${missing.includes("amber") ? "こはくは たからばこや てきから みつかるよ" : "おみせで かえるよ"}`);
      return;
    }
    updateProgress((pr) => craft(pr, friend));
    audio.play("craft");
    const s = SERVICES.kitchen.house;
    effect("sparkle", s.x - 2, groundY(s.x, s.z) + 1.2, s.z);
    await wait(600);
    await say("cook", `Here you are! ${r.treat.en}!`, `はい、どうぞ! ${r.treat.ja}!`);
    // The friend eats it and learns its upgrade, there and then.
    const m = rt.monsters[friend];
    if (Math.hypot(m.x - rt.player.x, m.z - rt.player.z) > 4) poofTo(friend, rt.player.x + 1.2, rt.player.z + 0.8);
    m.mode = "script";
    m.look = { x: rt.player.x, z: rt.player.z };
    animate(friend, "eat");
    audio.play("munch");
    await wait(1300);
    animate(friend, "friend");
    audio.voice(friend, "excited");
    effect("sparkle", m.x, groundY(m.x, m.z) + 1.2, m.z);
    const up = COMBAT[friend].upgrade.name;
    banner({ title: `${MONSTERS[friend].name} learned ${up.en}!`, sub: friend === "puff" ? "Two wind shots at once!" : "A bigger, stronger basic attack!", ja: `${MONSTERS[friend].name}は ${up.ja}を おぼえた!`, tone: "clear" }, 3600);
    await say(friend, "Yummy! I feel strong!", "おいしい! ちからが わいてきた!");
    await ask({ kind: "command", options: ["thankYou"], readSentence: true, help: "コックさんに おれいを いおう" });
    m.mode = friend === getGame().progress.active ? "follow" : "party";
    m.look = null;
  });
}

/** The trainer: explains the moves (panel) and lets each special's command be practised aloud. */
function trainer(): Promise<void> {
  return run(async () => {
    faceKeeper("trainer");
    await say("trainer", "Hi! I'm Coach Rex. I know every monster move!", "やあ! コーチの レックスだ。モンスターの わざは なんでも しってるぞ!");
    await say("trainer", "Press J for a basic attack. Press K for a special move!", "J で ふつうの こうげき。K で とくべつな わざ!");
    setGame({ panel: "trainer" });
  });
}

const COMMAND_PHRASE: Record<CompanionId, PhraseId> = { leafy: "cmdPull", bubbo: "cmdPush", puff: "cmdBlow", ember: "cmdBurn" };

/** Practise one friend's special command with the trainer (the first time gives coins). */
export function practiseCommand(friend: CompanionId): Promise<void> {
  setGame({ panel: null });
  return run(async () => {
    faceKeeper("trainer");
    const said = await ask({
      kind: "command",
      options: [COMMAND_PHRASE[friend]],
      question: { en: `Tell ${MONSTERS[friend].name} the special move!`, ja: `${MONSTERS[friend].name}に とくべつな わざの ことばを いおう`, by: "trainer" },
      readSentence: true,
      help: `${COMBAT[friend].special.name.ja}: 「${COMBAT[friend].special.word}」`,
      cancellable: true
    });
    if (!said) return;
    const first = !getGame().progress.act2.trained.includes(friend);
    animate(friend, "power");
    audio.voice(friend, "excited");
    await say("trainer", `Great! ${COMBAT[friend].special.word} That's ${COMBAT[friend].special.name.en}!`, `いいね! それが ${COMBAT[friend].special.name.ja}だ!`);
    if (first) {
      updateProgress((p) => addCoins(practise(p, friend), 10));
      audio.play("coin");
      toast({ en: "+10 coins!", ja: "コイン 10まい!", icon: "coin", tone: "good" }, 1800);
    }
  });
}

function inn(): Promise<void> {
  return run(async () => {
    faceKeeper("innkeeper");
    await say("innkeeper", "Welcome to the Seaside Inn! Have a rest. It's free!", "うみべの やどへ ようこそ! ゆっくり やすんでね。むりょうだよ!");
    await restHere("port", ["You rested at the inn.", "やどで やすんだ。たおれても ここに もどれるよ"]);
  });
}

/** The harbour: "Where is the ship?" — the lead about Lumo. */
function harborOffice(): Promise<void> {
  return run(async () => {
    faceKeeper("harbor");
    const a = getGame().progress.act2;
    if (a.harbor) {
      await sailWithGull();
      return;
    }
    await say("harbor", "Ahoy! I'm Captain Gull. Can I help you?", "やあ! キャプテン・ガルだ。なにか ようかな?");
    const said = await ask({
      kind: "command",
      options: ["whereShip"],
      question: { en: "Ask about the raiders' ship!", ja: "とうぞくの ふねの ことを きこう", by: "harbor" },
      readSentence: true,
      help: "「Where is the ship?」と きこう",
      cancellable: true
    });
    if (!said) return;
    await say("harbor", "The raiders' airship? It flew over the sea.", "とうぞくの ひこうせん? うみの うえを とんで いったよ。");
    await say("harbor", "It went to Cloud Isle! I saw a shining monster in a cage.", "クラウドじまへ いった! かごの なかに ひかる モンスターが いたよ。");
    rt.maple.talking = true;
    await say("maple", "That's Lumo! We must go to Cloud Isle!", "ルモだ! クラウドじまへ いかなくちゃ!");
    rt.maple.talking = false;
    await say("harbor", "My boat leaves soon. Get ready, then come back!", "わたしの ふねが もうすぐ でる。じゅんびを して、また きてね!");
    updateProgress((p) => hearLead(p));
    banner({ title: "NEW LEAD: Cloud Isle!", sub: "Sail with Captain Gull to find Lumo!", ja: "ガルせんちょうと クラウドじまへ! ルモを さがそう!", tone: "quest" }, 5200);
    audio.play("chest");
    saveNow();
  });
}

/** Mark the friend-switch lesson once a friend is switched in the lowland. */
export function noteSwitch() {
  if (getGame().progress.act2.started) learn("switch");
}

/** Lumo is in the raiders' cage: hidden from the garden (except while the scene shows the cage). */
export function lumoHidden(): boolean {
  const s = rt.act2Scene;
  return getGame().progress.act2.lumoTaken && s !== "capture" && s !== "escape" && s !== "reveal";
}
