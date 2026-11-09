import { PHRASES, type PhraseId } from "../logic/english";
import { judgeSpeech, type Judgement } from "../logic/speechMatch";
import { makeRng, shuffle } from "../logic/rng";
import { noteSaid } from "../logic/progress";
import { getGame, setGame, updateProgress, type Choice, type Line, type Mode, type PromptUi, type Speaker } from "../store";
import { MONSTERS } from "../data/monsters";
import { NPCS, type NpcId } from "../data/town";
import { FAMILY, type FamilyId } from "../data/family";
import type { MonsterId } from "../types";
import { recognition, HARD_ERRORS, type ListenHandle } from "../../audio/recognition";
import { tts } from "../../audio/tts";
import { audio } from "../../audio/audio";
import { DebugScriptCancelled, debugGuard, debugInputPaused, debugWait, onDebugScriptCancel } from "../debugLifecycle";

/**
 * The English interaction layer. Everything the student says or chooses goes
 * through `ask()`, which resolves with the sentence they produced:
 *
 *  - command: one target sentence ("It's green."). Speech must match it;
 *    mic-free shows it among wrong-but-plausible sentences.
 *  - choice: several sentences, all valid ("Do you like apples / fish ...?",
 *    "Yes, I do. / No, I don't."); whichever is said or tapped is the answer.
 *
 * One press of Space / 🎤 = one bounded listening session. A valid interim
 * result is accepted at once; only recognised wrong/unclear speech is a miss.
 * Miss 1: try again. Miss 2: the sentence is read aloud again. Miss 3: the
 * choices become tappable. Permission/hardware errors switch to tapping at once.
 */

export interface AskRequest {
  /** Chapter 3 always keeps the forgiving Tap path beside speech. */
  tapAlways?: boolean;
  kind: "command" | "choice";
  /** Accepted sentences (a command accepts only the first). */
  options: PhraseId[];
  /** Equivalent spoken questions, accepted without adding extra tap cards. */
  speechAliases?: PhraseId[];
  /** Sentences displayed in speech mode (default: the command target, or every choice). */
  show?: PhraseId[];
  /** Show "before ___ after" with picture slots instead of whole sentences (speech mode). */
  frame?: { before: string; after: string };
  question?: { en: string; ja?: string; by: Speaker };
  /** Japanese help for the task. */
  help?: string;
  picture?: string;
  icons?: Partial<Record<PhraseId, string>>;
  crossed?: PhraseId[];
  /** Shuffle the tappable choices (so the useful one is not always first). */
  shuffle?: boolean;
  cancellable?: boolean;
  readQuestion?: boolean;
  /** Read the target sentence aloud when the prompt opens (speech mode, commands). */
  readSentence?: boolean;
  /** A wrong sentence was tapped (mic-free): the listener can react (a puzzled tilt). */
  onWrong?: (id: PhraseId) => void;
}

interface Active {
  req: AskRequest;
  resolve: (id: PhraseId | null) => void;
  done: boolean;
  listening: ListenHandle | null;
  stopRequested: (() => void) | null;
  lastTransition: number;
  silentSessions: number;
  silenceModelled: boolean;
  back: Mode;
  speechVersion: number;
}

let active: Active | null = null;
let promptId = 1;
/** What the recogniser heard for the last accepted spoken answer ("" when it was tapped). */
let heardForLast = "";
export const lastHeard = () => heardForLast;
let rng = makeRng(Date.now() % 100000);

export function seedChoices(seed: number) {
  rng = makeRng(seed);
}

/** Mic can be used right now (setting on, recogniser present, not blocked). */
export function micUsable(): boolean {
  const g = getGame();
  return g.settings.mic && recognition.supported && g.micState !== "blocked" && g.micState !== "unsupported";
}

function voiceOf(by: Speaker): { pitch: number; rate: number } {
  if (by === "maple") return { pitch: 1.1, rate: 0.9 };
  if (by === "self") return { pitch: 1.3, rate: 0.95 };
  if (by === "game") return { pitch: 1.1, rate: 0.9 };
  if (by in NPCS) return NPCS[by as NpcId].voice;
  if (by in FAMILY) return FAMILY[by as FamilyId].voice;
  return MONSTERS[by as MonsterId].voice;
}

export function speak(text: string, by: Speaker = "game"): Promise<void> {
  if (debugInputPaused()) return Promise.resolve();
  return tts.speak(text, voiceOf(by));
}

function update(patch: Partial<PromptUi>) {
  const p = getGame().prompt;
  if (!p) return;
  setGame({ prompt: { ...p, ...patch } });
}

const choice = (req: AskRequest, id: PhraseId): Choice => ({
  id,
  en: PHRASES[id].en,
  icon: req.icons?.[id],
  crossed: req.crossed?.includes(id) || undefined
});

function choicesFor(req: AskRequest): Choice[] {
  if (req.kind === "choice") {
    const list = req.options.map((id) => choice(req, id));
    return req.shuffle ? shuffle(list, rng) : list;
  }
  const target = req.options[0];
  const ids = [target, ...(PHRASES[target].distractors ?? [])].slice(0, 3);
  return shuffle(ids, rng).map((id) => choice(req, id));
}

export function ask(req: AskRequest): Promise<PhraseId | null> {
  if (active && !active.done) finish(null);
  const g = getGame();
  const mic = micUsable();
  const show = req.show ?? (req.kind === "command" ? [req.options[0]] : req.options);
  const prompt: PromptUi = {
    id: promptId++,
    kind: req.kind,
    question: req.question ?? null,
    help: req.help ?? null,
    picture: req.picture ?? null,
    sentences: show.map((id) => choice(req, id)),
    frame: req.frame ? { ...req.frame, slots: req.options.map((id) => choice(req, id)) } : null,
    choices: choicesFor(req),
    status: "ready",
    soundDetected: false,
    speechDetected: false,
    heard: "",
    misses: 0,
    buttons: !mic || req.tapAlways === true,
    wrongId: null,
    matched: null,
    cancellable: Boolean(req.cancellable),
    reading: false
  };
  const back: Mode = g.mode === "busy" ? "busy" : "explore";
  setGame({ prompt, mode: "ask", line: null });
  return debugGuard(new Promise<PhraseId | null>((resolve) => {
    active = { req, resolve, done: false, listening: null, stopRequested: null, lastTransition: -Infinity,
      silentSessions: 0, silenceModelled: false, back, speechVersion: 0 };
    void readOpening(req, prompt.id);
  }));
}

async function readOpening(req: AskRequest, id: number) {
  if (req.readQuestion && req.question) await speak(req.question.en, req.question.by);
  if (getGame().prompt?.id !== id) return;
  // Mic-free: the student must read; reading the right answer aloud would give it away.
  if (req.readSentence && req.kind === "command" && micUsable()) await readSentences(id);
}

async function readSentences(id: number) {
  const p = getGame().prompt;
  if (!p || p.id !== id) return;
  update({ reading: true });
  const list = p.frame ? p.frame.slots : p.sentences;
  for (const s of list) {
    if (getGame().prompt?.id !== id) return;
    await speak(s.en, "self");
  }
  if (getGame().prompt?.id === id) update({ reading: false });
}

/** Replay (🔊): the sentence to say, or in mic-free mode every choice in order (listening, not a give-away). */
export async function replay() {
  if (debugInputPaused()) return;
  const p = getGame().prompt;
  if (!p || p.status === "listening" || p.status === "processing") return;
  tts.cancel();
  if (p.buttons) {
    if (p.question) await speak(p.question.en, p.question.by);
    for (const c of p.choices) {
      if (getGame().prompt?.id !== p.id) return;
      await speak(c.en, "self");
    }
    return;
  }
  void readSentences(p.id);
}

function finish(id: PhraseId | null) {
  const a = active;
  if (!a || a.done) return;
  a.done = true;
  a.speechVersion++;
  a.listening?.abort();
  a.listening = null;
  a.stopRequested = null;
  audio.setListening(false);
  active = null;
  setGame({ prompt: null, mode: a.back });
  a.resolve(id);
}

function succeed(id: PhraseId) {
  const a = active;
  if (!a || a.done) return;
  // One success = one action: everything after this is ignored.
  a.done = true;
  a.speechVersion++;
  a.listening?.abort();
  a.listening = null;
  a.stopRequested = null;
  audio.setListening(false);
  tts.cancel();
  audio.play("correct");
  update({ status: "correct", matched: id, wrongId: null, soundDetected: false, speechDetected: false, inputLevel: undefined });
  updateProgress((p) => noteSaid(p, id));
  void debugWait(fastMode() ? 60 : 600).then(() => {
    if (active !== a) return;
    active = null;
    if (getGame().prompt?.status === "correct") setGame({ prompt: null, mode: a.back });
    a.resolve(id);
  }).catch(ignoreDebugCancellation);
}

function accepted(id: PhraseId): boolean {
  const a = active;
  if (!a) return false;
  return a.req.kind === "choice" ? a.req.options.includes(id) || (a.req.speechAliases?.includes(id) ?? false) : a.req.options[0] === id;
}

/** Space / 🎤: start one listening session (or end the current one early). */
export function micPress() {
  if (debugInputPaused()) return;
  const a = active;
  const p = getGame().prompt;
  if (!a || a.done || !p) return;
  if (Date.now() - a.lastTransition < 350 || p.status === "processing") return;
  if (p.status === "listening") {
    a.lastTransition = Date.now();
    a.stopRequested?.();
    return;
  }
  if (!micUsable()) {
    update({ buttons: true });
    return;
  }
  tts.cancel();
  const speechOptions = [...new Set(a.req.kind === "choice" ? [...a.req.options, ...(a.req.speechAliases ?? [])] : [a.req.options[0]])].map((id) => PHRASES[id]);
  a.lastTransition = Date.now();
  let best: string[] = [];
  let hasFinal = false;
  let error: string | null = null;
  let userStopped = false;
  let decided = false;
  const speechVersion = ++a.speechVersion;
  const current = () => active === a && !a.done && !decided && a.speechVersion === speechVersion && getGame().prompt?.id === p.id && !debugInputPaused();
  // Every terminal path uses this one guarded decision, including synchronous errors.
  const decide = (match?: Extract<Judgement, { kind: "match" }>) => {
    if (!current()) return;
    const j = match ?? judgeSpeech(best, speechOptions);
    const outcome: NonNullable<PromptUi["outcome"]> = error && HARD_ERRORS.has(error) ? "hardware"
      : j.kind === "match" ? "success"
      : error === "no-speech" || error === "aborted" || error === "network" ? "silence"
      : best.some((s) => s.trim()) ? j.kind === "unclear" ? "unclear" : "mismatch"
      : userStopped ? "userStopped" : "silence";
    decided = true;
    a.speechVersion++;
    const handle = a.listening;
    a.listening = null;
    a.stopRequested = null;
    a.lastTransition = Date.now();
    audio.setListening(false);
    update({ outcome, soundDetected: false, speechDetected: false, inputLevel: undefined });
    if (outcome === "success" && j.kind === "match") {
      handle?.stop();
      heardForLast = j.heard;
      succeed(j.id);
      return;
    }
    applyOutcome(outcome);
  };
  audio.setListening(true);
  audio.play("micOn");
  update({ status: "listening", heard: "", reading: false, wrongId: null, speechHint: null, outcome: undefined,
    soundDetected: false, speechDetected: false, inputLevel: undefined });
  a.stopRequested = () => {
    if (!current()) return;
    userStopped = true;
    update({ status: "processing" });
    a.listening?.stop();
  };
  let handle: ListenHandle | undefined;
  handle = recognition.listen(
    {
      onResult(alts, isFinal) {
        if (!current()) return;
        const j = judgeSpeech(alts, speechOptions);
        if (alts[0]) update({ heard: alts[0] });
        if (j.kind === "match" && accepted(j.id)) {
          decide(j);
          return;
        }
        if (alts.some((s) => s.trim()) && (isFinal || !hasFinal)) best = alts;
        if (isFinal && alts.some((s) => s.trim())) hasFinal = true;
      },
      onError(err) {
        if (!current()) return;
        error = err;
        update({ status: "processing" });
        decide();
        handle?.abort();
      },
      onStopping() {
        if (current()) update({ status: "processing", soundDetected: false, speechDetected: false, inputLevel: undefined });
      },
      onActivity(activity) {
        if (current()) update({ soundDetected: activity.sound, speechDetected: activity.speech, inputLevel: activity.level });
      },
      onEnd() {
        if (!current()) return;
        update({ status: "processing" });
        decide();
      }
    },
    7000
  );
  if (current()) a.listening = handle;
  else handle.abort();
}

function applyOutcome(outcome: NonNullable<PromptUi["outcome"]>) {
  const p = getGame().prompt;
  const a = active;
  if (!p || !a) return;
  if (outcome === "hardware") {
    a.silentSessions = 0;
    setGame({ micState: "blocked", hint: "micBlocked" });
    update({ status: "ready", buttons: true });
    return;
  }
  if (outcome === "silence" || outcome === "userStopped") {
    a.silentSessions++;
    update({ status: "ready", speechHint: outcome });
    if (a.silentSessions >= 2 && !a.silenceModelled) {
      a.silenceModelled = true;
      void readSentences(p.id);
    }
    return;
  }
  a.silentSessions = 0;
  const misses = p.misses + 1;
  audio.play("error");
  update({ status: outcome === "unclear" ? "unclear" : "miss", misses, buttons: p.buttons || misses >= 3 });
  if (misses === 2) void readSentences(p.id);
}

/** Tap / click / number key on a sentence. */
export function choose(id: PhraseId) {
  if (debugInputPaused()) return;
  const a = active;
  const p = getGame().prompt;
  if (!a || a.done || !p || (!p.buttons && micUsable()) || p.status === "listening" || p.status === "processing") return;
  if (accepted(id)) {
    heardForLast = "";
    succeed(id);
    return;
  }
  audio.play("error");
  update({ status: "wrong", wrongId: id });
  a.req.onWrong?.(id);
  window.setTimeout(() => {
    const now = getGame().prompt;
    if (now && now.id === p.id && now.wrongId === id) update({ wrongId: null, status: "ready" });
  }, 700);
}

export function chooseIndex(i: number) {
  const p = getGame().prompt;
  const c = p?.choices[i];
  if (c) choose(c.id);
}

export function cancelAsk() {
  if (debugInputPaused()) return;
  const p = getGame().prompt;
  if (!p?.cancellable || p.status === "correct") return;
  tts.cancel();
  audio.setListening(false);
  finish(null);
}

export function isAsking() {
  return Boolean(active && !active.done);
}

// ---------------------------------------------------------------- dialogue

let lineId = 1;
let lineDone: (() => void) | null = null;

/** Show a line of dialogue, read it aloud, wait for Next. */
export function say(by: Speaker, en: string, ja?: string, extra: Partial<Line> = {}): Promise<void> {
  const line: Line = { id: lineId++, by, en, ja, ...extra };
  setGame({ line, mode: getGame().mode === "busy" ? "busy" : "talk", prompt: null });
  void speak(en, by);
  return debugGuard(new Promise<void>((resolve) => {
    lineDone = () => {
      lineDone = null;
      resolve();
    };
    if (fastMode()) void debugWait(30).then(() => {
      if (getGame().line?.id === line.id) nextLine();
    }).catch(ignoreDebugCancellation);
  }));
}

/** Next ▶ (click, E, Space, Enter). */
export function nextLine() {
  if (debugInputPaused()) return;
  if (!getGame().line || !lineDone) return;
  tts.cancel();
  audio.play("tick");
  setGame({ line: null });
  lineDone();
}

export function hasLine() {
  return Boolean(getGame().line && lineDone);
}

/** Test runs (?fast=1) skip pauses and auto-advance dialogue. */
export function fastMode(): boolean {
  return typeof location !== "undefined" && new URLSearchParams(location.search).get("fast") === "1";
}

/** A pause that test runs skip. */
export function wait(ms: number): Promise<void> {
  return debugWait(fastMode() ? Math.min(ms, 40) : ms);
}

/** Stop an in-flight microphone session when the tester opens the menu. */
export function suspendDebugSpeech() {
  tts.cancel();
  discardSpeech();
}

/** Real cancellation: discard pending results when the prompt UI leaves. */
export function discardSpeech() {
  const handle = active?.listening;
  if (active) {
    active.speechVersion++;
    active.listening = null;
    active.stopRequested = null;
    active.lastTransition = Date.now();
  }
  handle?.abort();
  audio.setListening(false);
  const prompt = getGame().prompt;
  if (prompt) update({ status: prompt.status === "listening" || prompt.status === "processing" ? "ready" : prompt.status,
    reading: false, soundDetected: false, speechDetected: false, inputLevel: undefined });
}

function ignoreDebugCancellation(error: unknown) {
  if (!(error instanceof DebugScriptCancelled)) throw error;
}

onDebugScriptCancel(() => {
  if (active) {
    active.done = true;
    active.speechVersion++;
    active.listening?.abort();
    active.resolve(null);
    active = null;
  }
  lineDone = null;
  tts.cancel();
  audio.setListening(false);
});
