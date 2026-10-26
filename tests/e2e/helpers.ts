import { expect, type Page } from "@playwright/test";
import { BROWSER_STUBS } from "./stubs";

export interface MiState {
  screen: string;
  mode: string;
  micState: string;
  progress: {
    monsters: Record<string, { discovered: boolean; asked: Record<string, boolean>; friend: boolean; invited?: boolean; canKnown: Record<string, boolean>; described: { name?: boolean; size?: boolean; part?: boolean } }>;
    active: string | null;
    bag: Record<string, number>;
    solved: string[];
    metMaple: boolean;
    endings: number;
    said: string[];
  };
  objective: { id: string; [k: string]: unknown };
  focus: { id: string; kind: string } | null;
  journalOpen: boolean;
  discovering: { monster: string; colored: boolean } | null;
  friendCard: string | null;
  prompt: {
    id: number;
    kind: string;
    status: string;
    buttons: boolean;
    misses: number;
    sentences: string[];
    choices: string[];
    question: string | null;
  } | null;
  line: { by: string; en: string } | null;
  player: { x: number; z: number; y: number; riding: boolean; climbing: boolean };
  monsters: Record<string, { x: number; z: number; mode: string; air: number }>;
  palm: number;
  stones: number;
  bridge: number;
  rope: number;
  bramble: number;
  stoneGlow: Record<string, number>;
  lava: number;
  cave: number;
  pillars: Record<string, number>;
  gate: number;
  starGlow: number;
  finale: "idle" | "rise" | "maple" | "complete";
  camera: { pos: { x: number; y: number; z: number }; target: { x: number; y: number; z: number } };
  perf: { calls: number; triangles: number; fps: number };
}

/** Open the game with speech stubs and the test hook. Returns collected page errors. */
export async function boot(page: Page, query = "fast=1"): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.addInitScript(BROWSER_STUBS);
  await page.goto(`/?e2e=1&${query}`);
  await expect(page.getByTestId("title")).toBeVisible();
  return errors;
}

export const state = (page: Page): Promise<MiState> => page.evaluate(() => (window as never as { __mi: { state(): MiState } }).__mi.state());

export async function hook(page: Page, name: string, ...args: unknown[]) {
  return page.evaluate(([n, a]) => (window as never as Record<string, Record<string, (...x: unknown[]) => unknown>>).__mi[n as string](...(a as unknown[])), [name, args] as const);
}

export async function waitFor(page: Page, pred: (s: MiState) => boolean, timeout = 30_000, label = "condition"): Promise<MiState> {
  const t0 = Date.now();
  let s = await state(page);
  while (!pred(s)) {
    if (Date.now() - t0 > timeout) throw new Error(`timed out waiting for ${label}: ${JSON.stringify({ mode: s.mode, line: s.line, prompt: s.prompt, objective: s.objective, player: s.player, fps: s.perf.fps })}`);
    await page.waitForTimeout(60);
    s = await state(page);
  }
  return s;
}

/**
 * Choose how answers are given, through Settings (a teacher setting; the
 * title screen no longer shows a Speak/Tap switch). Leaves Settings closed.
 */
export async function chooseMode(page: Page, mode: "tap" | "speak") {
  await page.getByTestId("title-settings").click();
  const toggle = page.getByTestId("toggle-mic");
  await expect(toggle).toBeVisible();
  if ((await toggle.getAttribute("aria-checked")) !== String(mode === "speak")) await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", String(mode === "speak"));
  await page.getByTestId("settings-close").click();
  await expect(page.getByTestId("settings")).toHaveCount(0);
}

/** Start a new game in tap (mic-free) or speech mode and wait for exploration after Maple's intro. */
export async function startGame(page: Page, mode: "tap" | "speak") {
  await chooseMode(page, mode);
  await page.getByTestId("btn-start").click();
  await waitFor(page, (s) => s.mode === "explore" && s.progress.metMaple, 30_000, "intro done");
}

/** Wait for a prompt offering this sentence as a button, and tap it. */
export async function tap(page: Page, phraseId: string) {
  const s = await waitFor(page, (x) => Boolean(x.prompt?.buttons && x.prompt.choices.includes(phraseId) && x.prompt.status !== "correct" && x.prompt.status !== "wrong"), 30_000, `button ${phraseId}`);
  // Observe in the browser before clicking: a slow renderer/round trip can
  // otherwise miss the wrong-answer feedback before its 700ms reset.
  await Promise.all([
    page.waitForFunction((id) => {
      const p = (window as unknown as { __mi: { state(): MiState } }).__mi.state().prompt;
      return !p || p.id !== id || p.status === "wrong";
    }, s.prompt!.id, { timeout: 10_000, polling: 50 }),
    page.locator(`[data-testid=choice][data-id=${phraseId}]`).click()
  ]);
}

/** Speak into the stub recogniser for the open prompt (one Space press = one session). */
export async function speak(page: Page, text: string | null, error: string | null = null) {
  await waitFor(page, (x) => Boolean(x.prompt && x.prompt.status !== "listening" && x.prompt.status !== "correct"), 30_000, "prompt to speak to");
  await page.evaluate(([say, err]) => {
    const w = window as never as { __speech: { say: string | null; error: string | null } };
    w.__speech.say = say;
    w.__speech.error = err;
  }, [text, error] as const);
  await page.keyboard.press("Space");
  await waitFor(page, (x) => !x.prompt || x.prompt.status !== "listening", 10_000, "listening to end");
  await page.waitForTimeout(80);
}

/** Walk up to a named thing (test hook) and press E on it. */
export async function use(page: Page, target: string, focusId: string, dist = 1.4) {
  await hook(page, "goTo", target, dist);
  await waitFor(page, (s) => s.focus?.id === focusId && s.mode === "explore", 10_000, `focus ${focusId}`);
  await page.keyboard.press("KeyE");
}
