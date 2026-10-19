import { create } from "zustand";
import type { FoodId, MonsterId } from "./types";
import type { PhraseId } from "./logic/english";
import { newProgress, type Progress } from "./logic/progress";

export type Screen = "title" | "game" | "results";

/**
 * explore: walking around.  ask: an English prompt is open.  talk: a line of
 * dialogue is showing.  busy: a scripted moment (intro, a power, the ending).
 */
export type Mode = "explore" | "ask" | "talk" | "busy";

export interface Settings {
  /** Speak into the microphone (off = tap the sentences). A teacher setting. */
  mic: boolean;
  music: number;
  sfx: number;
  /** Japanese help for instructions and story lines (never for target English). */
  japanese: boolean;
  slowVoice: boolean;
  cameraSensitivity: number;
}

export type MicState = "unknown" | "ready" | "blocked" | "unsupported";

export type Speaker = "maple" | "self" | "game" | MonsterId;

export interface Choice {
  id: PhraseId;
  en: string;
  /** A food or ability picture on the button. */
  icon?: string;
  /** Already answered "No" (shown crossed out, still allowed). */
  crossed?: boolean;
}

/** "Do you like ___?" shown as a sentence frame with picture slots. */
export interface Frame {
  before: string;
  after: string;
  slots: Choice[];
}

export interface PromptUi {
  id: number;
  kind: "command" | "choice";
  question: { en: string; ja?: string; by: Speaker } | null;
  /** Japanese help line for the task (not a translation of the English). */
  help: string | null;
  picture: string | null;
  /** Sentences shown to read aloud in speech mode. */
  sentences: Choice[];
  frame: Frame | null;
  /** Tappable sentences (mic-free, or the rescue after three misses). */
  choices: Choice[];
  status: "ready" | "listening" | "miss" | "unclear" | "correct" | "wrong";
  heard: string;
  misses: number;
  buttons: boolean;
  wrongId: PhraseId | null;
  matched: PhraseId | null;
  cancellable: boolean;
  /** The sentence is being read aloud (it pulses). */
  reading: boolean;
}

export interface Line {
  id: number;
  by: Speaker;
  en: string;
  ja?: string;
  /** Target English (a question to understand): never glossed in Japanese. */
  target?: boolean;
  /** A food shown with the line. */
  food?: FoodId;
  /** Yes/no colour for monster answers. */
  tone?: "yes" | "no";
}

export interface Focus {
  id: string;
  kind: "monster" | "food" | "maple" | "obstacle" | "stone" | "sign";
  verb: string;
  noun: string;
  x: number;
  z: number;
}

export interface Toast {
  id: number;
  en: string;
  ja?: string;
  icon?: string;
  tone: "good" | "info" | "warn";
}

export type HintKey = "move" | "talk" | "journal" | "switch" | "micBlocked" | null;

export interface GameState {
  screen: Screen;
  mode: Mode;
  settings: Settings;
  micState: MicState;
  touch: boolean;
  settingsOpen: boolean;
  journalOpen: boolean;
  journalPage: MonsterId;
  fade: number;
  hasSave: boolean;

  progress: Progress;

  focus: Focus | null;
  prompt: PromptUi | null;
  line: Line | null;
  toasts: Toast[];
  hint: HintKey;
  /** The "New monster!" journal card while it is being described. */
  discovering: { monster: MonsterId; colored: boolean } | null;
  /** The "is your friend!" card. */
  friendCard: MonsterId | null;
  /** The journal button glows (something new was written). */
  journalPulse: boolean;
  /** Seconds played, for the results card. */
  seconds: number;
}

const SETTINGS_KEY = "mi.settings.v1";

export const DEFAULT_SETTINGS: Settings = {
  mic: true,
  music: 0.35,
  sfx: 0.75,
  japanese: true,
  slowVoice: false,
  cameraSensitivity: 1
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* storage blocked on some managed devices */
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export const useGame = create<GameState>(() => ({
  screen: "title",
  mode: "busy",
  settings: loadSettings(),
  micState: "unknown",
  touch: false,
  settingsOpen: false,
  journalOpen: false,
  journalPage: "leafy",
  fade: 0,
  hasSave: false,
  progress: newProgress(),
  focus: null,
  prompt: null,
  line: null,
  toasts: [],
  hint: null,
  discovering: null,
  friendCard: null,
  journalPulse: false,
  seconds: 0
}));

export const setGame = useGame.setState;
export const getGame = useGame.getState;

/** Apply a pure progress change. */
export function updateProgress(fn: (p: Progress) => Progress) {
  setGame((s) => ({ progress: fn(s.progress) }));
}

let toastId = 1;
/** Short message in the top-centre stack; disappears by itself. */
export function toast(t: Omit<Toast, "id">, ms = 2800) {
  const id = toastId++;
  setGame((s) => ({ toasts: [...s.toasts.slice(-2), { ...t, id }] }));
  window.setTimeout(() => setGame((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), ms);
}
