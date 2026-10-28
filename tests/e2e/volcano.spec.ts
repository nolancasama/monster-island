import { expect, test, type Page } from "@playwright/test";
import { boot, chooseMode, hook, state, type MiState } from "./helpers";

/**
 * Executor-owned acceptance: real mic-free UI, with only the starting save and
 * collision-aware positioning supplied by the existing __mi test hook.
 * Negative probe: temporarily remove `swim` from Bubbo's `can` in monsters.ts,
 * run `npx playwright test tests/e2e/volcano.spec.ts`, and restore the change.
 * The route case detects the missing helper; the speech case establishes the
 * lava response and fails its solved-lava assertion. Do not change the seed,
 * rules, or assertions for that probe.
 */
const friend = (asked: Record<string, boolean>, described = {}) => ({ discovered: true, asked, friend: true, canKnown: {}, described });
const empty = { discovered: false, asked: {}, friend: false, canKnown: {}, described: {} };
const V2_SAVE = JSON.stringify({
  v: 2,
  progress: {
    monsters: {
      leafy: friend({ apples: true }), bubbo: friend({ fish: true }),
      puff: friend({ berries: true }, { size: true, part: true }), ember: empty
    },
    active: "puff", bag: {}, solved: ["fallenPalm", "river", "bridge", "cliff"], metMaple: true, endings: 2,
    said: ["itsGreen", "likeApples", "canHelp", "itsBlue", "likeFish", "canSwim", "comeHere", "itsPurple", "itsSmall", "hasWings", "likeBerries", "letsGo", "canFly", "thankYou"]
  },
  player: { x: 34.5, z: -49.2, yaw: Math.PI }, seconds: 1800
});

/** A missing setup condition is a harness failure, never a product verdict. */
async function precondition(page: Page, label: string, pred: (s: MiState) => boolean, timeout = 30_000) {
  await expect.poll(async () => pred(await state(page)), { timeout, message: `HARNESS_PRECONDITION_FAILED: ${label}` }).toBe(true);
  return state(page);
}

async function answer(page: Page, id: string) {
  const before = await precondition(page, `tappable ${id}`, (s) => Boolean(s.prompt?.buttons && s.prompt.choices.includes(id) && s.prompt.status !== "correct" && s.prompt.status !== "wrong"));
  await page.locator(`[data-testid=choice][data-id=${id}]`).click();
  await precondition(page, `response to ${id}`, (s) => !s.prompt || s.prompt.id !== before.prompt!.id || s.prompt.status === "wrong");
}

async function approach(page: Page, target: string, focus = target, dist = 1.6) {
  await hook(page, "goTo", target, dist);
  await precondition(page, `exploring beside ${focus}`, (s) => s.mode === "explore" && s.focus?.id === focus);
  await page.keyboard.press("KeyE");
}

async function select(page: Page, key: number, monster: string) {
  await precondition(page, `can switch to ${monster}`, (s) => s.mode === "explore" && s.progress.monsters[monster].friend);
  await page.keyboard.press(`Digit${key}`);
  await precondition(page, `${monster} selected`, (s) => s.progress.active === monster);
}

async function solve(page: Page, obstacle: string, question: string) {
  await precondition(page, `${obstacle} still unsolved`, (s) => !s.progress.solved.includes(obstacle));
  await approach(page, obstacle);
  await answer(page, question);
  // Both the successful animation and a truthful "No" have completed before
  // judging the product. A broken ability reaches this outcome, then fails.
  await precondition(page, `${obstacle} response completed`, (s) => s.mode === "explore" || Boolean(s.prompt?.choices.includes("thankYou")), 40_000);
  expect((await state(page)).progress.solved, `${obstacle} must be solved by its companion's ability`).toContain(obstacle);
  await answer(page, "thankYou");
  await precondition(page, `explore after ${obstacle}`, (s) => s.mode === "explore");
}

test("volcano and sanctuary: lava, Ember, cave, four powers, Lumo and The End (mic-free, migrated v2 save)", async ({ page }) => {
  test.setTimeout(240_000);
  await page.addInitScript((save) => {
    if (!sessionStorage.getItem("volcano-seeded")) {
      localStorage.setItem("mi.save.v2", save);
      sessionStorage.setItem("volcano-seeded", "1");
    }
  }, V2_SAVE);
  const errors = await boot(page);
  await expect(page.getByTestId("btn-continue")).toBeVisible();
  await chooseMode(page, "tap");
  await page.getByTestId("btn-continue").click();
  let s = await precondition(page, "continued Phase 2 save", (x) => x.screen === "game" && x.mode === "explore");
  expect(s.progress.endings).toBe(2);
  expect(s.progress.monsters.lumo.friend).toBe(false);
  expect(s.objective).toMatchObject({ id: "obstacle", obstacle: "lava", helper: "bubbo" });

  // Puff cannot cool lava. A real switch to Bubbo is required.
  await approach(page, "lava");
  await answer(page, "canHelp");
  s = await precondition(page, "Puff's lava response complete", (x) => x.mode === "explore");
  expect(s.progress.solved).not.toContain("lava");
  expect(s.progress.monsters.puff.canKnown.swim).toBe(false);
  await select(page, 2, "bubbo");
  await solve(page, "lava", "canHelp");
  // The cooled crust is a surface: stand on top of it (not sunk into it) and
  // walk across it with the keyboard, toward Ember.
  await hook(page, "teleport", 34.5, -49.4, Math.PI);
  await page.waitForTimeout(500);
  const bank = (await state(page)).player.y;
  await hook(page, "teleport", 34.5, -51.6, Math.PI);
  // Height follows on the next simulated frame after the teleport.
  s = await precondition(page, "standing on the cooled lava's top", (x) => Math.abs(x.player.z + 51.6) < 0.2 && x.player.y > bank + 0.15);
  expect(s.player.y, "on the crust, not sunk into it").toBeLessThan(bank + 0.4);
  await hook(page, "teleport", 34.5, -49.4, Math.PI);
  await hook(page, "setCamera", 0, 0.5, 9);
  await page.keyboard.down("KeyW");
  await precondition(page, "crossed the cooled lava on foot", (x) => x.player.z < -54);
  await page.keyboard.up("KeyW");

  // Ember's description and all five question cards, including meat.
  await hook(page, "goTo", "ember", 2);
  await answer(page, "itsOrange");
  await answer(page, "itsBig");
  await answer(page, "hasTail");
  await precondition(page, "Ember food question", (x) => Boolean(x.prompt?.choices.includes("likeMeat")));
  expect((await state(page)).prompt!.choices).toEqual(expect.arrayContaining(["likeApples", "likeBananas", "likeFish", "likeBerries", "likeMeat"]));
  await answer(page, "likeFish");
  await precondition(page, "Ember's truthful dislike recorded", (x) => x.progress.monsters.ember.asked.fish === false && Boolean(x.prompt?.choices.includes("likeMeat")));
  await answer(page, "likeMeat");
  await precondition(page, "Ember wants meat", (x) => x.mode === "explore" && x.progress.monsters.ember.asked.meat === true);
  expect((await state(page)).progress.monsters.ember.described).toMatchObject({ size: true, part: true });
  await approach(page, "meat", "meat");
  await precondition(page, "meat picked up", (x) => (x.progress.bag.meat ?? 0) === 1);
  await approach(page, "ember");
  await precondition(page, "Ember asks back about meat", (x) => x.prompt?.question === "Do you like meat?");
  await answer(page, "yesIDo");
  await precondition(page, "Ember invitation", (x) => Boolean(x.prompt?.choices.includes("letsGo")));
  expect((await state(page)).progress.monsters.ember.friend).toBe(true);
  expect((await state(page)).progress.active).toBe("bubbo");
  await answer(page, "letsGo");
  await precondition(page, "Ember follows", (x) => x.mode === "explore" && x.progress.active === "ember");
  await expect(page.getByTestId("team-ember")).toBeVisible();
  await solve(page, "cave", "canFire");

  // Pillars accept any order; use a different order from the objective list.
  expect((await state(page)).progress.monsters.lumo.discovered).toBe(false);
  await solve(page, "gateFlame", "canFire");
  await select(page, 3, "puff");
  await solve(page, "gateWing", "canFly");
  await select(page, 1, "leafy");
  await solve(page, "gateLeaf", "canHelp");
  expect((await state(page)).progress.monsters.lumo.discovered).toBe(false);
  await select(page, 2, "bubbo");
  await solve(page, "gateDrop", "canSwim");
  expect((await state(page)).progress.solved).toEqual(expect.arrayContaining(["lava", "cave", "gateLeaf", "gateDrop", "gateWing", "gateFlame"]));
  await precondition(page, "open gate before Lumo discovery", (x) => x.mode === "explore" && !x.progress.monsters.lumo.discovered && x.objective.id === "findMonster" && x.objective.monster === "lumo");
  await expect(page.getByText("Meet the legendary monster!", { exact: true })).toBeVisible();

  await hook(page, "goTo", "lumo", 2);
  await answer(page, "itsYellow");
  await answer(page, "whatsYourName");
  await answer(page, "itsBig");
  await answer(page, "hasWings");
  await precondition(page, "Lumo asks back", (x) => x.prompt?.question === "Do you like monsters?");
  // A student's No is just as valid as Yes and still finishes the game.
  await answer(page, "noIDont");
  // The prologue is complete: no results card any more, the raiders take Lumo (Act 2).
  s = await precondition(page, "prologue complete", (x) => x.progress.endings === 3, 60_000);
  expect(s.progress.monsters.lumo).toMatchObject({ friend: true, described: { name: true, size: true, part: true } });
  expect(s.stoneGlow.ember).toBe(1);
  s = await precondition(page, "the kidnapping plays and play resumes at the cliff", (x) => x.screen === "game" && x.mode === "explore" && x.progress.act2.started, 90_000);
  await expect(page.getByTestId("results")).toHaveCount(0);
  expect(s.progress.act2.lumoTaken).toBe(true);
  expect(s.progress.monsters.lumo.friend).toBe(true);
  expect(s.progress.active).toBe("bubbo");
  expect(s.objective).toEqual({ id: "descend" });
  expect(s.player.z).toBeLessThan(-140);
  await expect(page.getByTestId("team-lumo")).toHaveCount(0);
  for (const id of ["leafy", "bubbo", "puff", "ember"]) await expect(page.getByTestId(`team-${id}`)).toBeVisible();
  for (const sentence of ["It's orange.", "It has a tail.", "Can you make fire?", "It's yellow.", "What's your name?"]) {
    expect(s.progress.said.map(String)).toContain(({ "It's orange.": "itsOrange", "It has a tail.": "hasTail", "Can you make fire?": "canFire", "It's yellow.": "itsYellow", "What's your name?": "whatsYourName" } as Record<string, string>)[sentence]);
  }
  expect(errors).toEqual([]);
});

test("lava also accepts the spoken swim question", async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript((save) => localStorage.setItem("mi.save.v2", save), V2_SAVE);
  const errors = await boot(page);
  await chooseMode(page, "speak");
  await page.getByTestId("btn-continue").click();
  await precondition(page, "continued Phase 2 save for speech", (s) => s.screen === "game" && s.mode === "explore");
  await select(page, 2, "bubbo");
  await approach(page, "lava");
  const before = await precondition(page, "live lava speech prompt", (s) => Boolean(s.prompt?.choices.includes("canHelp") && !s.prompt.buttons));
  expect(before.prompt!.choices).not.toContain("canSwim");
  await page.evaluate(() => {
    const stub = (window as unknown as { __speech: { say: string; error: string | null } }).__speech;
    stub.say = "Can you swim?";
    stub.error = null;
  });
  await page.keyboard.press("Space");
  const response = await precondition(page, "recognition returned a lava answer", (s) => !s.prompt || s.prompt.id !== before.prompt!.id || ["correct", "miss", "unclear"].includes(s.prompt.status));
  expect(response.progress.said).toContain("canSwim");
  await precondition(page, "lava ability animation finished", (s) => Boolean(s.prompt?.choices.includes("thankYou")) || s.mode === "explore", 40_000);
  expect((await state(page)).progress.solved).toContain("lava");
  expect(errors).toEqual([]);
});
