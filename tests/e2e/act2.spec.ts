import { expect, test, type Page } from "@playwright/test";
import { boot, chooseMode, hook, state, waitFor } from "./helpers";

/**
 * Act 2, The Hunt for Lumo: the real UI (keys, taps, clicks) in tap mode
 * unless a test says otherwise. The __mi hook only seeds saves, places the
 * player beside things and reads state.
 */

const friend = (asked: Record<string, boolean>, described = {}, extra = {}) => ({ discovered: true, asked, friend: true, canKnown: {}, described, ...extra });
const PROLOGUE = {
  monsters: {
    leafy: friend({ apples: true }), bubbo: friend({ fish: true }), puff: friend({ berries: true }, { size: true, part: true }),
    ember: friend({ meat: true }, { size: true, part: true }, { invited: true }), lumo: friend({}, { name: true, size: true, part: true })
  },
  active: "leafy", bag: {}, solved: ["fallenPalm", "river", "bridge", "cliff", "lava", "cave", "gateLeaf", "gateDrop", "gateWing", "gateFlame"],
  metMaple: true, endings: 3, said: ["itsGreen", "likeApples", "canHelp", "thankYou", "letsGo", "itsYellow", "whatsYourName"]
};
/** A finished original adventure (the last build's save format). */
const DONE_V3 = JSON.stringify({ v: 3, progress: PROLOGUE, player: { x: 70, z: -136, yaw: Math.PI }, seconds: 2400 });

/** Act 2 in progress, standing in the town square with coins and the forest chest's amber. */
function townSave(extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    v: 4,
    progress: {
      ...PROLOGUE,
      bag: { apples: 2 },
      act2: {
        started: true, lumoTaken: true, descended: true, hp: 100, mp: { leafy: 100, bubbo: 100, puff: 100, ember: 100 }, coins: 100,
        items: { amber: 1 }, upgrades: [], chests: ["forestChest"], tutorial: ["attack", "coins", "special", "eat", "rest", "switch"],
        checkpoint: "camp", portFound: true, bought: false, harbor: false, trained: [], zone: "port", ...extra
      }
    },
    player: { x: 77, z: -300, yaw: Math.PI }, seconds: 3000
  });
}

async function seed(page: Page, save: string, key = "mi.save.v4") {
  await page.addInitScript(([text, k]) => {
    if (!sessionStorage.getItem("act2-seeded")) {
      localStorage.setItem(k, text);
      sessionStorage.setItem("act2-seeded", "1");
    }
  }, [save, key] as const);
}

async function answer(page: Page, id: string) {
  const before = await waitFor(page, (s) => Boolean(s.prompt?.buttons && s.prompt.choices.includes(id) && s.prompt.status !== "correct" && s.prompt.status !== "wrong"), 30_000, `tappable ${id}`);
  await page.locator(`[data-testid=choice][data-id=${id}]`).click();
  await waitFor(page, (s) => !s.prompt || s.prompt.id !== before.prompt!.id || s.prompt.status === "wrong", 10_000, `response to ${id}`);
}

async function use(page: Page, target: string, focus = target) {
  await hook(page, "goTo", target, 1.4);
  await waitFor(page, (s) => s.mode === "explore" && s.focus?.id === focus, 15_000, `focus ${focus}`);
  await page.keyboard.press("KeyE");
}

async function select(page: Page, key: number, monster: string) {
  await waitFor(page, (s) => s.mode === "explore", 30_000, `explore before ${monster}`);
  await page.keyboard.press(`Digit${key}`);
  await waitFor(page, (s) => s.progress.active === monster, 5_000, `${monster} active`);
}

/** From the title: the finished save's Act 2 button, through the kidnapping, to the cliff top. */
async function playKidnapping(page: Page) {
  await expect(page.getByTestId("btn-act2")).toBeVisible();
  await page.getByTestId("btn-act2").click();
  const banners = new Set<string>();
  await waitFor(page, (s) => {
    if (s.act2.banner) banners.add(s.act2.banner);
    return s.mode === "explore" && s.act2.scene === "done" && s.progress.act2.started;
  }, 90_000, "kidnapping played");
  return banners;
}

/** Down the cliff rope into the Primeval Forest. */
async function descend(page: Page) {
  await use(page, "cliffDown");
  await waitFor(page, (s) => s.player.climbing, 10_000, "on the rope");
  return waitFor(page, (s) => s.mode === "explore" && !s.player.climbing && s.progress.act2.descended && s.act2.zone === "forest1", 30_000, "landed in the forest");
}

/** Attack an enemy with J until it is knocked out (the real key). */
async function defeat(page: Page, i: number) {
  for (let n = 0; n < 30; n++) {
    const s = await state(page);
    const e = s.act2.enemies[i];
    if (e.state === "ko" || e.state === "gone") return;
    await hook(page, "nearEnemy", i, 1.8);
    await hook(page, "setHp", 100);
    await page.keyboard.press("KeyJ");
    await page.waitForTimeout(500);
  }
  throw new Error(`enemy ${i} was not knocked out`);
}

test("a finished adventure starts Act 2 once: Lumo is taken, the save keeps everything, a reload does not replay it", async ({ page }) => {
  test.setTimeout(180_000);
  await seed(page, DONE_V3, "mi.save.v3");
  const errors = await boot(page);
  await chooseMode(page, "tap");
  const banners = await playKidnapping(page);
  expect([...banners]).toEqual(expect.arrayContaining(["Prologue Clear!", "NEW QUEST: Rescue Lumo!"]));
  let s = await state(page);
  expect(s.screen).toBe("game");
  await expect(page.getByTestId("results")).toHaveCount(0);
  expect(s.progress.act2).toMatchObject({ started: true, lumoTaken: true });
  expect(s.progress.monsters.lumo.friend).toBe(true);
  expect(s.progress.endings).toBe(3);
  expect(s.progress.solved).toHaveLength(10);
  expect(s.objective).toEqual({ id: "descend" });
  expect(s.act2.cliffRope).toBe(1);
  // All four friends are still companions; Lumo never is.
  for (const id of ["leafy", "bubbo", "puff", "ember"]) await expect(page.getByTestId(`team-${id}`)).toBeVisible();
  await expect(page.getByTestId("team-lumo")).toHaveCount(0);
  await page.waitForTimeout(400);

  await page.reload();
  await expect(page.getByTestId("btn-continue")).toBeVisible();
  await expect(page.getByTestId("btn-act2")).toHaveCount(0);
  // The old completed save is still there, untouched; the new chapter is saved beside it.
  const keys = await page.evaluate(() => ({ v3: localStorage.getItem("mi.save.v3"), v4: localStorage.getItem("mi.save.v4") }));
  expect(keys.v3).toBe(DONE_V3);
  expect(keys.v4).toContain('"started":true');
  await page.getByTestId("btn-continue").click();
  s = await waitFor(page, (x) => x.screen === "game" && x.mode === "explore", 15_000, "continued");
  await page.waitForTimeout(800);
  s = await state(page);
  expect(s.act2.scene).toBe("done");
  expect(s.act2.ship.visible).toBe(false);
  expect(s.objective).toEqual({ id: "descend" });
  expect(errors).toEqual([]);
});

test("the cliff rope, the forest tutorial: manual attacks, coins, MP, riding, the chest, food and the camp", async ({ page }) => {
  test.setTimeout(240_000);
  await seed(page, DONE_V3, "mi.save.v3");
  const errors = await boot(page);
  await chooseMode(page, "tap");
  await playKidnapping(page);
  let s = await descend(page);
  expect(s.objective).toEqual({ id: "openChest" });
  s = await waitFor(page, (x) => x.act2.stance.friend === "leafy" && x.act2.stance.k > 0.99, 5_000, "Leafy on the backpack");

  // Friends never attack by themselves: standing by an enemy without pressing anything does nothing to it.
  await hook(page, "nearEnemy", 0, 2.4);
  await page.waitForTimeout(3000);
  s = await state(page);
  expect(s.act2.enemies[0].hp).toBe(20);
  expect(s.act2.shots).toBe(0);
  expect(s.act2.enemies[0].state).not.toBe("idle");

  // J: the vine whip knocks it out; its coins come to the player.
  await defeat(page, 0);
  s = await waitFor(page, (x) => x.progress.act2.coins > 0, 10_000, "coins collected");
  expect(s.progress.act2.tutorial).toEqual(expect.arrayContaining(["attack", "coins"]));
  expect(s.act2.mp.leafy).toBe(100);

  // K: the special uses MP (25 for Vine Pull) and hurts the enemy it catches.
  await hook(page, "nearEnemy", 3, 4);
  await page.keyboard.press("KeyK");
  s = await waitFor(page, (x) => x.act2.mp.leafy < 100, 3_000, "MP spent");
  expect(s.act2.mp.leafy).toBeGreaterThanOrEqual(75);
  expect(s.act2.mp.leafy).toBeLessThan(80);
  expect(s.act2.enemies[3].hp).toBeLessThan(44);
  // Each friend keeps its own MP.
  expect(s.act2.mp.bubbo).toBe(100);

  // Switching friends switches the combat position: riding Bubbo, Ember piggyback, Puff on a shoulder.
  for (const [key, id, ride] of [[2, "bubbo", true], [4, "ember", true], [3, "puff", false], [1, "leafy", false]] as const) {
    await select(page, key, id);
    s = await waitFor(page, (x) => x.act2.stance.friend === id && x.act2.stance.k > 0.99, 5_000, `${id} in position`);
    // Riders carry the player (seated well above the ground); perched friends ride on the player.
    if (ride) expect(s.player.y - s.player.ground).toBeGreaterThan(0.6);
    else expect(s.player.y - s.player.ground).toBeLessThan(0.1);
    expect(s.monsters[id].mode).toBe("script");
  }
  expect((await state(page)).progress.act2.tutorial).toContain("switch");

  // The tutorial chest: coins, the first amber and two apples; F eats one (HP and Leafy's MP).
  await use(page, "forestChest");
  s = await waitFor(page, (x) => x.mode === "explore" && x.progress.act2.chests.includes("forestChest"), 30_000, "chest opened");
  expect(s.progress.act2.items.amber).toBe(1);
  expect(s.progress.bag.apples).toBe(2);
  expect(s.objective).toEqual({ id: "crossing" });
  await hook(page, "setHp", 50);
  await hook(page, "setMp", "leafy", 10);
  await page.keyboard.press("KeyF");
  s = await waitFor(page, (x) => x.progress.bag.apples === 1, 5_000, "ate an apple");
  expect(s.act2.hp).toBeGreaterThanOrEqual(65);
  expect(s.act2.mp.leafy).toBeGreaterThanOrEqual(40);
  expect(s.progress.act2.tutorial).toContain("eat");

  // First-clear progression now requires every forest enemy before camp.
  for (const e of (await state(page)).act2.enemies.filter(e => e.zone === "forest1")) await defeat(page,e.i);
  expect((await state(page)).progress.act2.cleared).toContain("forest1");

  // Fern Crossing is safe and records the wake point without healing.
  const hpBeforeCrossing = (await state(page)).act2.hp;
  await hook(page, "teleport", 75.6, -189.2, Math.PI);
  s = await waitFor(page, (x) => x.mode === "explore" && x.progress.act2.tutorial.includes("rest"), 30_000, "reached Crossing");
  expect(s.act2.hp).toBe(hpBeforeCrossing);
  expect(s.focus?.id).not.toBe("campRest");
  expect(s.act2.zone).toBe("camp");
  expect(s.act2.stance.friend).toBeNull();
  expect(s.progress.act2.checkpoint).toBe("camp");
  expect(s.objective).toEqual({ id: "reachPort" });

  // And back up the cliff.
  await hook(page, "goTo", "cliffUp", 0.4);
  await use(page, "cliffUp");
  s = await waitFor(page, (x) => x.mode === "explore" && !x.player.climbing && x.player.z > -152, 30_000, "back on the ledge");
  expect(s.act2.zone).toBeNull();
  expect(errors).toEqual([]);
});

test("enemies return only after a real absence; both routes' puzzles and the shortcut; the town is reached", async ({ page }) => {
  test.setTimeout(240_000);
  await seed(page, DONE_V3, "mi.save.v3");
  const errors = await boot(page);
  await chooseMode(page, "tap");
  await playKidnapping(page);
  await descend(page);

  // Knock out the first enemy, step out and straight back: still gone. After 12 s away: back.
  await defeat(page, 0);
  await waitFor(page, (x) => x.act2.enemies[0].state === "gone", 5_000, "enemy gone");
  await hook(page, "teleport", 75.6, -189.2, Math.PI);
  await waitFor(page, (x) => x.act2.zone === "camp", 5_000, "in the camp");
  await hook(page, "teleport", 76, -184, Math.PI);
  let s = await waitFor(page, (x) => x.act2.zone === "forest1", 5_000, "back in the forest");
  expect(s.act2.enemies[0].state).toBe("gone");
  await hook(page, "teleport", 75.6, -189.2, Math.PI);
  // 12 s of play away (the clock is play time, which a slow software renderer stretches).
  const away = (await waitFor(page, (x) => x.act2.zone === "camp", 5_000, "away in the camp")).playTime;
  await waitFor(page, (x) => x.playTime > away + 12.5, 60_000, "12 s of play away");
  await hook(page, "teleport", 76, -184, Math.PI);
  s = await waitFor(page, (x) => x.act2.zone === "forest1" && x.act2.enemies[0].state === "idle", 5_000, "respawned");
  expect(s.act2.enemies[0].hp).toBe(20);

  // The canopy: Leafy's vines over the first gap, Puff's rope bridge over the second.
  for (const [key, id, target, question] of [[1, "leafy", "canopyVines", "canHelp"], [3, "puff", "canopyRope", "canFly"], [2, "bubbo", "groveLilies", "canSwim"], [4, "ember", "causewayGate", "canFire"]] as const) {
    await hook(page, "setHp", 100);
    await select(page, key, id);
    await use(page, target);
    await answer(page, question);
    await waitFor(page, (x) => Boolean(x.prompt?.choices.includes("thankYou")) || x.mode === "explore", 40_000, `${target} power`);
    expect((await state(page)).progress.solved).toContain(target);
    await answer(page, "thankYou");
    await waitFor(page, (x) => x.mode === "explore", 20_000, `explore after ${target}`);
  }
  s = await state(page);
  expect(s.act2.unlock).toMatchObject({ canopyVines: 1, canopyRope: 1, groveLilies: 1, causewayGate: 1 });

  // Into the town: a safe place (everyone follows), Maple is waiting, the objective moves on.
  await hook(page, "teleport", 76, -286, Math.PI);
  await hook(page, "teleport", 76, -294, Math.PI);
  s = await waitFor(page, (x) => x.mode === "explore" && x.progress.act2.portFound, 30_000, "arrived in the town");
  expect(s.act2.zone).toBe("port");
  expect(s.act2.stance.friend).toBeNull();
  expect(s.objective).toEqual({ id: "market" });
  expect(s.progress.act2.checkpoint).toBe("camp");
  expect(errors).toEqual([]);
});

test("the town in English: buying (then quick buying), the first treat upgrade, the trainer, the inn and the harbour's lead", async ({ page }) => {
  test.setTimeout(240_000);
  await seed(page, townSave());
  const errors = await boot(page);
  await chooseMode(page, "tap");
  await page.getByTestId("btn-continue").click();
  await waitFor(page, (x) => x.screen === "game" && x.mode === "explore" && x.act2.zone === "port", 15_000, "in the town");

  // The market's first visit is the whole conversation.
  await use(page, "market");
  await answer(page, "wantBerries");
  let s = await waitFor(page, (x) => Boolean(x.prompt?.question === "How many?"), 15_000, "How many?");
  await answer(page, "twoP");
  await answer(page, "thankYou");
  s = await waitFor(page, (x) => x.mode === "explore" && x.progress.act2.bought, 15_000, "bought");
  expect(s.progress.bag.berries).toBe(2);
  expect(s.progress.act2.coins).toBe(100 - 12);
  expect(s.objective).toEqual({ id: "kitchen" });
  // Afterwards: the quick shop, its button still says the sentence.
  await use(page, "market");
  await waitFor(page, (x) => x.act2.panel === "shop", 15_000, "quick shop");
  await page.getByTestId("qty-fish-3").click();
  await expect(page.getByTestId("buy-fish")).toHaveText("I want three fish, please.");
  await page.getByTestId("buy-fish").click();
  s = await waitFor(page, (x) => x.progress.bag.fish === 3, 5_000, "quick buy");
  expect(s.progress.act2.coins).toBe(88 - 24);
  await page.getByTestId("shop-close").click();

  // The kitchen: "Mix the apples and berries." makes Leafy's treat and teaches Super Whip.
  await use(page, "kitchen");
  await answer(page, "mixLeafy");
  await answer(page, "thankYou");
  s = await waitFor(page, (x) => x.mode === "explore" && x.progress.act2.upgrades.includes("leafy"), 30_000, "treat made");
  expect(s.progress.act2.items.amber ?? 0).toBe(0);
  expect(s.progress.bag).toMatchObject({ apples: 1, berries: 1 });
  expect(s.objective).toEqual({ id: "harbor" });

  // The trainer lists the moves; practising "Pull!" earns coins once.
  await use(page, "trainer");
  await waitFor(page, (x) => x.act2.panel === "trainer", 15_000, "trainer's list");
  await expect(page.getByTestId("trainer-leafy")).toContainText("Super Whip");
  await page.getByTestId("practise-leafy").click();
  await answer(page, "cmdPull");
  s = await waitFor(page, (x) => x.mode === "explore" && x.progress.act2.trained.includes("leafy"), 15_000, "practised");
  expect(s.progress.act2.coins).toBe(64 + 10);

  // The inn: accepting a room buys a full rest once.
  await hook(page, "setHp", 30);
  await use(page, "inn");
  await answer(page, "yesPlease");
  s = await waitFor(page, (x) => x.mode === "explore" && x.act2.hp === 100, 30_000, "rested at the inn");
  expect(s.progress.act2.coins).toBe(64);
  expect(s.progress.act2.checkpoint).toBe("port");

  // The harbour: "Where is the ship?" — the lead about Lumo.
  await use(page, "harbor");
  await answer(page, "whereShip");
  s = await waitFor(page, (x) => x.mode === "explore" && x.progress.act2.harbor, 30_000, "the lead");
  expect(s.objective).toEqual({ id: "act2Done" });

  // The upgrade is visible in a fight: Super Whip knocks a gloomlet out with one hit less.
  await hook(page, "teleport", 70, -272, Math.PI);
  await waitFor(page, (x) => x.act2.zone === "coast" && x.act2.stance.friend === "leafy" && x.act2.stance.k > 0.99, 10_000, "Leafy in position on the coast");
  await hook(page, "nearEnemy", 24, 1.8);
  await page.keyboard.press("KeyJ");
  s = await waitFor(page, (x) => x.act2.enemies[24].hp < 20, 5_000, "hit");
  expect(20 - s.act2.enemies[24].hp).toBeGreaterThan(15);
  expect(errors).toEqual([]);
});

test("spoken shopping: 'I want three apples, please.' skips 'How many?'", async ({ page }) => {
  test.setTimeout(120_000);
  await seed(page, townSave());
  const errors = await boot(page);
  await chooseMode(page, "speak");
  await page.getByTestId("btn-continue").click();
  await waitFor(page, (x) => x.screen === "game" && x.mode === "explore", 15_000, "in the town");
  await use(page, "market");
  const before = await waitFor(page, (x) => Boolean(x.prompt?.choices.includes("wantApples") && !x.prompt.buttons), 15_000, "speech prompt");
  await page.evaluate(() => {
    const w = window as unknown as { __speech: { say: string; error: string | null } };
    w.__speech.say = "I want three apples please";
    w.__speech.error = null;
  });
  await page.keyboard.press("Space");
  await waitFor(page, (x) => !x.prompt || x.prompt.id !== before.prompt!.id, 10_000, "answered");
  const s = await waitFor(page, (x) => (x.progress.bag.apples ?? 0) === 5 || Boolean(x.prompt?.question === "How many?"), 15_000, "bought or asked");
  expect(s.prompt?.question ?? null).not.toBe("How many?");
  expect(s.progress.act2.coins).toBe(100 - 15);
  expect(errors).toEqual([]);
});

test("touch: big attack buttons fight, the special button spends MP, the eat button eats", async ({ page }) => {
  test.setTimeout(180_000);
  await seed(page, townSave({ portFound: false, checkpoint: "cliff", zone: "forest1" }));
  const errors = await boot(page);
  await chooseMode(page, "tap");
  await page.getByTestId("btn-continue").click();
  await waitFor(page, (x) => x.screen === "game" && x.mode === "explore", 15_000, "continued");
  await hook(page, "set", { touch: true });
  await hook(page, "teleport", 76, -166, Math.PI);
  await waitFor(page, (x) => x.act2.zone === "forest1" && x.act2.stance.k > 0.99, 10_000, "in the forest, Leafy ready");
  await expect(page.getByTestId("btn-basic")).toBeVisible();
  await expect(page.getByTestId("btn-basic")).toContainText("Whip!");
  await expect(page.getByTestId("btn-special")).toContainText("Pull!");
  const box = await page.getByTestId("btn-basic").boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(100);
  await hook(page, "nearEnemy", 1, 1.8);
  await page.getByTestId("btn-basic").dispatchEvent("pointerdown");
  await page.waitForTimeout(200);
  await page.getByTestId("btn-basic").dispatchEvent("pointerup");
  let s = await waitFor(page, (x) => x.act2.enemies[1].hp < 20, 5_000, "hit by touch");
  await hook(page, "nearEnemy", 1, 3);
  await page.getByTestId("btn-special").dispatchEvent("pointerdown");
  s = await waitFor(page, (x) => x.act2.mp.leafy < 100, 5_000, "special by touch");
  await hook(page, "setHp", 40);
  await page.getByTestId("btn-eat").dispatchEvent("pointerdown");
  s = await waitFor(page, (x) => (x.progress.bag.apples ?? 0) === 1, 5_000, "ate by touch");
  expect(s.act2.hp).toBeGreaterThan(40);
  expect(errors).toEqual([]);
});
