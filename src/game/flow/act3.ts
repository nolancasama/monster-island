import type { FamilyId } from "../data/family";
import { MONSTERS } from "../data/monsters";
import { COMPANION_IDS } from "../data/combat";
import { cb, hooks, travelCombat, wakeUp } from "../combat";
import { banner, getGame, setGame, toast, updateProgress, type Focus } from "../store";
import { animate, effect, rt } from "../runtime";
import { CANOPY_GLIDE, CLOUD_CHESTS, CLOUD_DOCK, CLOUD_OBSTACLE_PLACE, CLOUD_PICKUPS, CLOUD_PUZZLE_RULES, CLOUD_SPAWNS, CLOUD_ZONES, HOLLOW, cloudZoneAt, cloudY, type CloudPuzzleId } from "../world/cloudisle";
import { PIER2, SERVICES } from "../world/lowland";
import { gatesOf, nearestWalkable, PLAYER_R } from "../world/collision";
import { claimErrand, cloudWakeArea, collectErrandPickup, completeVoyage, cookStew, discoverHollow, eatStew, markFamily, openCloudChest, restCloud, solveCloudPuzzle, travelCloud } from "../logic/act3";
import { rested } from "../logic/act2";
import { canDo, recordCan } from "../logic/progress";
import { CAN_QUESTION, type PhraseId } from "../logic/english";
import { ask, fastMode, say, wait } from "./ask";
import { fadeThrough, frameTwo, run, shot } from "./script";
import { gatherParty } from "./act2";
import { saveNow } from "./story";
import { audio } from "../../audio/audio";

const D = (s: number) => fastMode() ? Math.min(.25, s) : s;
async function over(seconds: number, fn: (k: number) => void) {
  const start = rt.time, duration = D(seconds);
  for (;;) {
    const k = Math.min(1, (rt.time - start) / duration);
    fn(k);
    if (k === 1) return;
    await wait(16);
  }
}
const ease = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * ease(t);
const command = (id: PhraseId, help: string) => ask({ kind: "command", options: [id], readSentence: true, tapAlways: true, help });

/** Called inside the harbour's existing script, or the Cloud dock script. */
export async function sailWithGull() {
  const p = getGame().progress;
  if (!p.act2.harbor) return;
  const home = p.act3.world === "home";
  if (p.act3.voyageDone) {
    const answer = await ask({ kind: "command", options: ["yesLetsGo"], tapAlways: true, cancellable: true, readQuestion: true,
      question: { by: "harbor", en: home ? "Sail to Cloud Isle?" : "Sail to Port Town?", ja: home ? "クラウドじまへ いくかい?" : "みなとまちへ かえるかい?" }, help: "じゅんびが できたら こたえよう" });
    if (!answer) return;
    await fadeThrough(() => arrive(home ? "cloud" : "home"), 900);
    return;
  }
  const answer = await ask({ kind: "command", options: ["yesLetsGo"], tapAlways: true, readQuestion: true, cancellable: true,
    question: { by: "harbor", en: "Are you ready? Let's go to Cloud Isle!", ja: "じゅんびは いいかい? クラウドじまへ いこう!" }, help: "ガルせんちょうと ふねに のろう" });
  if (!answer) return;
  const v = rt.voyage;
  v.active = true; v.sail = 0; v.stage = "depart";
  v.x = PIER2.x; v.z = PIER2.z0 - 3; v.y = -.1; v.yaw = Math.PI;
  rt.player.frozen = true;
  audio.startMusic("island");
  boatPose();
  await say("harbor", "Hold on, friends!", "ともだちも いっしょに しゅっぱつだ!");
  await boatLeg(6, v.x, v.z - 7);
  v.stage = "sail";
  await command("raiseSail", "ほを あげよう!「Raise the sail!」");
  await over(2, k => { v.sail = k; boatPose(); });
  await boatLeg(10, v.x, v.z - 20);
  v.stage = "rocks";
  await say("harbor", "Rocks ahead! Turn left!", "まえに いわだ! ひだりへ まがろう!");
  // No fail state: Gull always completes the safe turn after the answer.
  await command("turnLeft", "ひだりへ まがろう!「Turn left!」");
  await boatLeg(10, v.x + 13, v.z - 10);
  v.stage = "weather";
  for (;;) {
    const weather = await ask({ kind: "choice", options: ["itsWindy", "itsSunny", "itsRainy"], tapAlways: true, readQuestion: true,
      question: { by: "harbor", en: "How's the weather?", ja: "どんな てんきかな?" }, picture: "cloudWind", icons: { itsWindy: "cloudWind", itsSunny: "cloudSun", itsRainy: "cloudRain" }, help: "ふくらんだ ほを みて こたえよう" });
    if (weather === "itsWindy") break;
    await say("harbor", "Look at the sail. The wind is strong! Try again.", "ほを みてごらん。かぜが つよいね! もういちど。");
  }
  await boatLeg(8, v.x, v.z - 20);
  v.stage = "look";
  await command("look", "しまが みえてきた!「Look!」");
  // The voyage's only cut: swap the physical worlds while out at sea.
  await fadeThrough(() => {
    rt.world = "cloud";
    v.x = 0; v.z = -29; v.yaw = 0; v.stage = "reveal";
    rt.player.x = v.x; rt.player.z = v.z;
    updateProgress(pr => travelCloud(completeVoyage(pr), "cloud"));
    travelCombat();
    boatPose();
  }, 450);
  rt.ship.visible = true; rt.ship.scale = 1; rt.ship.cage.visible = false;
  await over(13, k => {
    rt.ship.x = lerp(-34, 34, k); rt.ship.z = 28 + k * 5; rt.ship.y = 20; rt.ship.yaw = Math.PI / 2;
    shot({ x: v.x + 6, y: 5.8, z: v.z - 10 }, { x: 0, y: 16, z: 105 });
  });
  rt.ship.visible = false;
  await say("harbor", "Cloud Isle! The beacon is above the storm. Stay close!", "クラウドじまだ! あらしの うえに とうが ある。はなれないで!");
  await boatLeg(9, CLOUD_DOCK.boat.x, CLOUD_DOCK.boat.z);
  v.active = false; v.stage = "done";
  arrive("cloud");
  await say("harbor", "I'll wait here. You can always sail home.", "ここで まっているよ。いつでも みなとまちへ かえれるよ。");
  banner({ title: "Cloud Isle", sub: "Find a way through Stormbreak Coast.", ja: "クラウドじま — あらしの かいがんを すすもう", tone: "place" });
  saveNow();
}

function boatPose() {
  const v = rt.voyage, pl = rt.player;
  pl.x = v.x; pl.z = v.z; pl.y = v.y + .75; pl.yaw = v.yaw;
  COMPANION_IDS.forEach((id, i) => {
    const m = rt.monsters[id]; m.mode = "script";
    const side = (i % 2 ? 1 : -1) * .85, back = .6 + Math.floor(i / 2) * 1.1;
    m.x = v.x + Math.cos(v.yaw) * side - Math.sin(v.yaw) * back;
    m.z = v.z - Math.sin(v.yaw) * side - Math.cos(v.yaw) * back;
    m.air = m.airTarget = 0; m.look = null;
  });
  // A broadside stern view clears the entire sail and keeps the crew, mast
  // and the water ahead together, including while Gull rounds the rocks.
  const forwardX = Math.sin(v.yaw), forwardZ = Math.cos(v.yaw);
  shot({ x: v.x + Math.cos(v.yaw) * 11 - forwardX * 13, y: v.y + 8.5, z: v.z - Math.sin(v.yaw) * 11 - forwardZ * 13 },
    { x: v.x + forwardX * 3, y: v.y + 3, z: v.z + forwardZ * 3 });
}
async function boatLeg(seconds: number, x: number, z: number) {
  const v = rt.voyage, sx = v.x, sz = v.z, yaw = Math.atan2(x - sx, z - sz);
  await over(seconds, k => { v.x = lerp(sx, x, k); v.z = lerp(sz, z, k); v.yaw = yaw; boatPose(); });
}

function arrive(world: "cloud" | "home") {
  rt.world = world;
  const target = world === "cloud" ? CLOUD_DOCK.spawn : { x: SERVICES.harbor.keeper.x + 2, z: SERVICES.harbor.keeper.z };
  rt.player.x = target.x; rt.player.z = target.z;
  rt.player.vx = rt.player.vz = 0; rt.player.yaw = world === "cloud" ? 0 : Math.PI;
  rt.player.riding = false; rt.player.climbY = null;
  updateProgress(p => travelCloud(p, world));
  const safe = nearestWalkable(target.x, target.z, PLAYER_R, gatesOf(getGame().progress));
  rt.player.x = safe.x; rt.player.z = safe.z;
  travelCombat(); gatherParty(); rt.camera.mode = "follow"; rt.camera.shot = null; rt.camera.snap = true;
  rt.player.frozen = false;
  saveNow();
}

/** Only Cloud Isle focus candidates are considered while its world is active. */
export function cloudCandidates(): Array<{ focus: Focus; reach: number }> {
  const a = getGame().progress.act3;
  const out: Array<{ focus: Focus; reach: number }> = [];
  const add = (id: string, noun: string, at: {x:number;z:number}, verb = "Talk to", kind: Focus["kind"] = "npc", reach = 2.6) => out.push({focus:{id, noun, verb, kind, ...at},reach});
  add("cloudGull", "Captain Gull", CLOUD_DOCK.gull);
  add("cloudDockRest", "on the boat", CLOUD_DOCK.rest, "Rest", "rest");
  if (a.hollowFound) {
    add("tala", "Tala", HOLLOW.tala); add("bo", "Grandpa Bo", HOLLOW.bo); add("kiko", "Kiko", HOLLOW.kiko);
    add("hollowRest", "at the mats", HOLLOW.rest, "Rest", "rest");
  }
  for (const c of CLOUD_CHESTS) if (!a.chests.includes(c.id)) add(c.id, "the chest", c, "Open", "chest", 2.2);
  for (const pickup of CLOUD_PICKUPS) if (!a.errands.pickups.includes(pickup.id)) add(pickup.id, pickup.kind === "bag" ? "Kiko's bag" : pickup.kind === "moss" ? "glow moss" : "firewood", pickup, "Get", "food", 1.8);
  for (const [id, at] of Object.entries(CLOUD_OBSTACLE_PLACE)) if (!a.puzzles.includes(id as CloudPuzzleId)) add(id, CLOUD_PUZZLE_RULES[id as CloudPuzzleId].noun, at, "Look at", "obstacle");
  if (a.puzzles.includes("canopyGlide")) {
    add("glideForward", "the glide pad", CANOPY_GLIDE.from, "Glide from", "obstacle", 1.5);
    add("glideBack", "the glide pad", CANOPY_GLIDE.to, "Glide from", "obstacle", 1.5);
  }
  add("raiderRoad", "the raider barricade", {x:5,z:55}, "Look at", "sign");
  add("junctionRoutes", "the mountain routes", {x:0,z:96}, "Look at", "sign");
  add("observatoryEntrance", "the closed observatory", {x:0,z:133}, "Look at", "sign");
  return out;
}

export function cloudInteract(f: Focus) {
  if (f.id === "glideForward" || f.id === "glideBack") return run(() => glideCanopy(f.id === "glideBack"));
  if (f.id === "cloudGull") return run(sailWithGull);
  if (f.id === "hollowRest" || f.id === "cloudDockRest") return run(async () => {
    if (f.id === "hollowRest") await say("bo", "Have a rest.", "ゆっくり やすんでね。");
    cb.vitals = rested();
    updateProgress(p => restCloud(p));
    audio.play("rest"); await wait(800);
    toast({en:"HP and every friend's MP are full!",ja:"HPも みんなの MPも まんたん!",tone:"good"}); saveNow();
  });
  if (f.id === "tala" || f.id === "bo" || f.id === "kiko") return run(() => familyTalk(f.id as FamilyId));
  if (f.id in CLOUD_OBSTACLE_PLACE) return cloudObstacle(f.id as CloudPuzzleId);
  if (CLOUD_PICKUPS.some(p => p.id === f.id)) {
    updateProgress(p => collectErrandPickup(p, f.id));
    rt.player.action = { kind: "pick", t0: rt.time };
    effect("sparkle", f.x, cloudY(f.x,f.z)+.5, f.z); audio.play("pick");
    toast({en:`Found ${f.noun}!`,ja:"おてつだいの しなものを みつけた!",tone:"good"}); return;
  }
  if (CLOUD_CHESTS.some(c => c.id === f.id)) return run(async () => {
    const before = getGame().progress;
    updateProgress(p => openCloudChest(p, f.id));
    if (getGame().progress === before) return;
    audio.play("chest"); await over(.6, k => rt.chestLid.set(f.id,k));
    effect("sparkle", f.x, cloudY(f.x,f.z)+1, f.z);
    await say("game", "Treasure! Supplies for the journey!", "たからばこ! たびの じゅんびに つかおう!");
  });
  return run(async () => {
    if (f.id === "observatoryEntrance") {
      await say("self", "The Ancient Observatory. The entrance is closed. Lumo must be inside!", "古代の天文台だ。入口は閉まっている。ルモは中にいるのかな！");
      return;
    }
    await say("self", f.id === "raiderRoad" ? "The raider road is blocked. We need another way." : "Skyroot Canopy to the west. Thunder Grotto to the east. Either route leads to the observatory!",
      f.id === "raiderRoad" ? "とうぞくの みちは とおれない。ほかの みちを さがそう。" : "西は空根の樹冠、東は雷の洞窟。どちらも天文台へ続いている！");
  });
}

async function familyTalk(id: FamilyId) {
  if (!getGame().progress.act3.family.tunnelOpen) { await familyScene(); return; }
  frameTwo(rt.player, HOLLOW[id], 1);
  if (id === "bo") {
    const hasFish = (getGame().progress.bag.fish ?? 0) > 0;
    const answer = await ask({kind:"choice",options:hasFish ? ["yesIDo","noIDont"] : ["noIDont"],tapAlways:true,readQuestion:true,
      question:{by:"bo",en:"Do you have any fish?",ja:"さかなは あるかい?"},help:"さかな 1ぴきで シチューを つくれるよ"});
    if (answer === "yesIDo") {
      const result = cookStew(getGame().progress);
      if (result.ok) { updateProgress(() => result.progress); audio.play("craft"); await say("bo","Here you are! Stew for all your friends. Eat it from your bag.","はい、シチューだよ! バッグから たべると みんなが げんきに なるよ。"); }
      else await say("bo", result.reason === "full" ? "You can carry three stews. Eat one first." : "Come back with a fish.", result.reason === "full" ? "シチューは 3つまで。ひとつ たべてから おいで。" : "さかなを もって また おいで。");
    } else await say("bo","Come back with a fish.","さかなを もって また おいで。");
  } else if (id === "kiko") {
    await say("kiko", "I lost my bag in the sea cave. Will you find it?", "うみの どうくつで バッグを なくしたの。みつけてくれる?");
    await handIn("bag");
  } else {
    await say("tala", "The back tunnel is safer. We need three logs for the fire, and glow moss for the lantern.", "うらの トンネルなら あんぜんよ。まき 3ぼんと、ランタンの ひかる コケが あると たすかるわ。");
    await handIn("firewood"); await handIn("moss");
  }
}
async function handIn(id: "bag" | "firewood" | "moss") {
  const before = getGame().progress;
  updateProgress(p => claimErrand(p,id));
  if (getGame().progress === before) return;
  audio.play("chest");
  const text = id === "bag" ? ["Thank you! We repaired the storage shelf. +20 coins!", "ありがとう! たなを なおしたよ。コイン 20まい!"] : id === "firewood" ? ["A better cooking fire! Here is an amber.", "りょうりばが よく なったわ! こはくを どうぞ。"] : ["A brighter lantern and extra bedding! +30 coins!", "あかるい ランタンと あたらしい ねどこ! コイン 30まい!"];
  await say(id === "bag" ? "kiko" : "tala",text[0],text[1]);
}

/** Runs automatically upon entering the waterfall room, and resumes safely if interrupted by reload. */
async function familyScene() {
  updateProgress(p => discoverHollow(p));
  if (!getGame().progress.act3.hollowFound) return;
  rt.act3Scene = "discovery";
  frameTwo(rt.player,HOLLOW.tala,1.1);
  const milestones = () => getGame().progress.act3.family;
  if (!milestones().met) {
    await ask({kind:"command",options:["imAFriend"],tapAlways:true,readQuestion:true,question:{by:"tala",en:"Who are you?",ja:"あなたは だれ?"},help:"ともだちだと つたえよう"});
    updateProgress(p => markFamily(p,"met"));
  }
  if (!milestones().trusted) {
    rt.act3Scene = "trust";
    await ask({kind:"command",options:["yesItIs"],tapAlways:true,readQuestion:true,question:{by:"kiko",en:"Is that your monster?",ja:"あなたの モンスター?"},help:"そうだよ、と こたえよう"});
    await ask({kind:"command",options:["yesICan"],tapAlways:true,readQuestion:true,question:{by:"tala",en:"Can you help us?",ja:"わたしたちを たすけてくれる?"},help:"おてつだい できるよ、と こたえよう"});
    updateProgress(p => markFamily(p,"trusted")); gatherParty();
    await say("tala","Welcome. You and your friends are safe here.","ようこそ。あなたも ともだちも ここなら あんぜんよ。");
  }
  if (!milestones().drawingSeen) {
    rt.act3Scene = "drawing";
    await say("kiko","I saw a shining monster in a cage!", "かごに はいった ひかる モンスターを みたよ!");
    setGame({ drawing: true });
    await command("whereLumo", "キコの えを みて ルモの ばしょを きこう");
    await say("tala","They took the cage up the mountain, to the old observatory.","かごを やまの うえの ふるい てんもんだいへ はこんでいったわ。");
    setGame({ drawing: false }); updateProgress(p => markFamily(p,"drawingSeen"));
  }
  if (!milestones().tunnelOpen) {
    rt.act3Scene = "tunnel";
    await say("tala","The raiders blocked the road. Take our back tunnel. It leads to Windfall Junction.","とうぞくが みちを ふさいだの。うらの トンネルから かぜの わかれみちへ いけるわ。");
    updateProgress(p => markFamily(p,"tunnelOpen")); audio.play("stones");
    banner({title:"Reach the Ancient Observatory and find Lumo",ja:"こだいの てんもんだいへ いって ルモを さがそう",tone:"quest"});
    await say("bo","Have a rest at the mats. Bring a fish if you would like some stew.","ねどこで やすんでね。さかなが あれば シチューも つくるよ。");
    await say("kiko","My bag is in the sea cave. Can you find it?", "バッグを うみの どうくつに おとしたの。さがしてくれる?");
    await say("tala","Three logs and some glow moss would help our shelter, too.","まき 3ぼんと ひかる コケも、かくれがに あると たすかるわ。");
  }
  rt.act3Scene = "done"; saveNow();
}

function cloudObstacle(id: CloudPuzzleId) {
  return run(async () => {
    const p = getGame().progress, active = p.active;
    const rule = CLOUD_PUZZLE_RULES[id], required = rule.friend;
    frameTwo(rt.player,CLOUD_OBSTACLE_PLACE[id].face,1);
    if (!active || !p.monsters[active].friend) { await say("self","A friend can help here.","ともだちに たすけて もらおう。"); return; }
    const needs = rule.need;
    const answer = await ask({kind:"choice",options:["canHelp","canSwim","canFire"],tapAlways:true,cancellable:true,help:"ともだちに「Can you help me?」と きこう"});
    if (!answer) return;
    const ability = CAN_QUESTION[answer];
    const yes = canDo(MONSTERS[active], ability === "help" ? needs : ability!);
    updateProgress(pr => recordCan(pr,active,ability === "help" ? needs : ability!));
    animate(active,yes ? "yes" : "no");
    await say(active,yes ? "Yes, I can!" : "No, I can't.",yes ? "できるよ!" : "できないよ!");
    if (!yes || active !== required || answer !== "canHelp") return;
    await command(rule.command, `${MONSTERS[required].name}に お願いしよう`);
    // Environmental abilities are free, including at zero MP.
    animate(active,"power"); audio.play("vines");
    updateProgress(pr => solveCloudPuzzle(pr,id));
    if (id === "canopyGlide") await glideCanopy(false);
    else await wait(1100);
    await say("game",rule.result.en,rule.result.ja ?? "道が開いた！");
    await command("thankYou","ともだちに おれいを いおう");
  });
}

/** One authored hop between two pads. There is no aerial steering, MP cost,
 * or persistent flying state; the reverse pad always permits retreat. */
async function glideCanopy(back: boolean) {
  const from = back ? CANOPY_GLIDE.to : CANOPY_GLIDE.from, to = back ? CANOPY_GLIDE.from : CANOPY_GLIDE.to;
  const p = rt.player, puff = rt.monsters.puff;
  // The transport pad calls Puff back as the one active friend in this
  // hostile route, including when returning after exploring with another.
  if (getGame().progress.active !== "puff") updateProgress(pr => ({ ...pr, active: "puff" }));
  p.frozen = true; p.vx = p.vz = 0;
  puff.mode = "script";
  try {
    await over(1.8, k => {
      p.x = lerp(from.x, to.x, k); p.z = lerp(from.z, to.z, k);
      p.climbY = cloudY(p.x, p.z) + Math.sin(k * Math.PI) * 2;
      puff.x = p.x + .8; puff.z = p.z; puff.air = 1 + Math.sin(k * Math.PI);
      shot({x:p.x + 7,y:cloudY(p.x,p.z)+6,z:p.z-7},{x:p.x,y:p.climbY+1,z:p.z});
    });
  } finally {
    p.climbY = null; p.frozen = false; puff.air = 0; puff.mode = "follow";
    rt.camera.mode = "follow"; rt.camera.shot = null; rt.camera.snap = true;
  }
}

export function eatCloudStew() {
  const g = getGame();
  if (g.mode !== "explore" || g.journalOpen || g.settingsOpen) return;
  const result = eatStew(g.progress,cb.vitals);
  if (!result) return;
  cb.vitals = result.vitals; updateProgress(() => result.progress); audio.play("munch");
  toast({en:"Stew! +50 HP, +40 MP for every friend",ja:"シチュー! HP +50、みんなの MP +40",tone:"good"});
}

/** Story triggers are separate from collision and never run in fights. */
export function cloudTriggers() {
  const a = getGame().progress.act3;
  if (a.puzzles.includes("canopyGlide") && Math.abs(rt.player.x - CANOPY_GLIDE.from.x) < 1.6) {
    const p = rt.player;
    if (p.z > 117.2 && p.z < 118.7 && p.vz > .1) { void run(() => glideCanopy(false)); return; }
    if (p.z > 120.3 && p.z < 121.8 && p.vz < -.1) { void run(() => glideCanopy(true)); return; }
  }
  if (a.cleared.includes("stormbreakCoast") && !a.hollowFound && rt.kikoTrail === 0) {
    void run(async () => {
      rt.act3Scene = "trail";
      await over(2.5,k => { rt.kikoTrail = Math.max(.001,k); });
      await say("self","A child! They went behind the waterfall. Follow the footprints!", "こどもだ! たきの うらへ はしっていった。あしあとを たどろう!");
    });
    return;
  }
  if (a.cleared.includes("stormbreakCoast") && !a.family.tunnelOpen && cloudZoneAt(rt.player.x,rt.player.z) === "hiddenHollow") void run(familyScene);
}

hooks.cloudEnterZone = zone => {
  updateProgress(p => ({...p,act3:{...p.act3,area:zone}}));
  const z = CLOUD_ZONES[zone];
  audio.setScene("forest"); audio.startMusic(z.hostile ? "danger" : "island");
  toast({en:z.name.en,ja:z.name.ja,tone:"info"},2200);
};

/** Called by the existing KO hook before it handles home checkpoints. */
export function cloudKnockout(): boolean {
  if (getGame().progress.act3.world !== "cloud") return false;
  void run(async () => {
    rt.player.frozen = true; rt.player.action = {kind:"ko",t0:rt.time}; audio.play("ko"); await wait(1400);
    await say("game","Oh no! You need a rest.","ひとやすみ しよう。");
    const wake = cloudWakeArea(getGame().progress);
    const target = wake === "dock" ? CLOUD_DOCK.spawn : CLOUD_SPAWNS.hiddenHollow;
    const safe = nearestWalkable(target.x,target.z,PLAYER_R,gatesOf(getGame().progress));
    rt.player.x = safe.x; rt.player.z = safe.z; rt.player.action = null; rt.camera.snap = true;
    wakeUp(); gatherParty(); saveNow();
    await say("game",wake === "dock" ? "You wake at Gull's boat. Your items are safe." : "You wake in the Hidden Hollow. Your items are safe.",wake === "dock" ? "ガルの ふねで めが さめた。どうぐは そのままだよ。" : "かくれがで めが さめた。どうぐは そのままだよ。");
  });
  return true;
}
