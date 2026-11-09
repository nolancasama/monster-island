import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { audio } from "../../audio/audio";
import { tts } from "../../audio/tts";
import { newProgress } from "../logic/progress";
import { DEFAULT_SETTINGS, getGame, setGame } from "../store";
import { ask, cancelAsk, micPress } from "./ask";

vi.mock("../../audio/audio", () => ({ audio: { play: vi.fn(), setListening: vi.fn() } }));
vi.mock("../../audio/tts", () => ({ tts: { speak: vi.fn(async () => {}), cancel: vi.fn() } }));
vi.mock("../debugLifecycle", () => ({
  DebugScriptCancelled: class extends Error {},
  debugGuard: <T>(promise: Promise<T>) => promise,
  debugInputPaused: () => false,
  debugWait: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
  onDebugScriptCancel: vi.fn()
}));

type ResultEvent = {
  resultIndex: number;
  results: { length: number; [index: number]: { length: number; isFinal: boolean; [index: number]: { transcript: string } } };
};

/** No automatic end on stop: Chrome may deliver its final transcript afterwards. */
class FakeSpeechRecognition {
  static instances: FakeSpeechRecognition[] = [];
  lang = "";
  interimResults = false;
  maxAlternatives = 0;
  continuous = false;
  onresult: ((event: ResultEvent) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  onaudiostart: (() => void) | null = null;
  onaudioend: (() => void) | null = null;
  onsoundstart: (() => void) | null = null;
  onsoundend: (() => void) | null = null;
  onspeechstart: (() => void) | null = null;
  onspeechend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn(() => this.onend?.());

  constructor() {
    FakeSpeechRecognition.instances.push(this);
  }

  result(transcript: string, isFinal = false) {
    this.onresult?.(resultEvent(transcript, isFinal));
  }

  error(error: string) {
    this.onerror?.({ error });
  }

  end() {
    this.onend?.();
  }
}

function resultEvent(transcript: string, isFinal = false): ResultEvent {
  return { resultIndex: 0, results: { length: 1, 0: { length: 1, isFinal, 0: { transcript } } } };
}

const current = () => FakeSpeechRecognition.instances.at(-1)!;
const prompt = () => getGame().prompt!;
const settle = () => vi.advanceTimersByTimeAsync(1100);
const transition = () => vi.advanceTimersByTimeAsync(400);

function openPrompt() {
  return ask({ kind: "command", options: ["itsGreen"], cancellable: true });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(10_000);
  vi.clearAllMocks();
  FakeSpeechRecognition.instances = [];
  vi.stubGlobal("window", {
    SpeechRecognition: FakeSpeechRecognition,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout
  });
  setGame({
    screen: "game", mode: "explore", prompt: null, hint: null,
    settings: { ...DEFAULT_SETTINGS, mic: true }, micState: "ready", progress: newProgress()
  });
});

afterEach(() => {
  cancelAsk();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("speaking session outcomes", () => {
  it("ten rapid presses never unlock rescue, and recognition still accepts speech afterwards", async () => {
    const answer = openPrompt();
    micPress();
    for (let i = 0; i < 10; i++) {
      micPress();
      await vi.advanceTimersByTimeAsync(20);
    }
    expect(FakeSpeechRecognition.instances).toHaveLength(1);
    expect(prompt()).toMatchObject({ status: "listening", misses: 0, buttons: false });
    await transition();
    micPress();
    expect(current().stop).toHaveBeenCalledOnce();
    expect(current().abort).not.toHaveBeenCalled();
    await settle();
    expect(prompt()).toMatchObject({ status: "ready", misses: 0, buttons: false });

    // Also exercise repeated genuine start/stop sessions, beyond the debounce window.
    for (let i = 0; i < 10; i++) {
      await transition();
      micPress();
      await transition();
      micPress();
      await settle();
      expect(prompt()).toMatchObject({ status: "ready", misses: 0, buttons: false });
    }
    await transition();
    micPress();
    current().result("It's green.");
    expect(prompt().status).toBe("correct");
    await settle();
    await expect(answer).resolves.toBe("itsGreen");
    expect(audio.play).not.toHaveBeenCalledWith("error");
  });

  it("accepts a matching interim immediately without waiting for end", () => {
    void openPrompt();
    micPress();
    current().result("It's green.");
    expect(prompt()).toMatchObject({ status: "correct", matched: "itsGreen", misses: 0 });
    expect(audio.play).toHaveBeenCalledWith("correct");
  });

  it("processes a final result arriving after the student presses Stop", async () => {
    const answer = openPrompt();
    micPress();
    const rec = current();
    rec.result("It's gr");
    await transition();
    micPress();
    expect(rec.stop).toHaveBeenCalledOnce();
    expect(rec.abort).not.toHaveBeenCalled();
    expect(prompt().status).toBe("processing");
    await vi.advanceTimersByTimeAsync(150);
    rec.result("It's green.", true);
    expect(prompt().status).toBe("correct");
    rec.end();
    await settle();
    await expect(answer).resolves.toBe("itsGreen");
  });

  it("judges captured interim speech if Stop produces no final result", async () => {
    void openPrompt();
    micPress();
    current().result("It's blue.");
    await transition();
    micPress();
    await settle();
    expect(prompt()).toMatchObject({ misses: 1, buttons: false });
    current().end();
    expect(prompt().misses).toBe(1);
  });

  it("three genuine wrong answers reveal choices and the second models the sentence", async () => {
    void openPrompt();
    for (let miss = 1; miss <= 3; miss++) {
      await transition();
      micPress();
      current().result("It's blue.", true);
      current().end();
      await settle();
      expect(prompt().misses).toBe(miss);
      expect(prompt().buttons).toBe(miss === 3);
      expect(tts.speak).toHaveBeenCalledTimes(miss >= 2 ? 1 : 0);
    }
    expect(tts.speak).toHaveBeenCalledWith("It's green.", expect.any(Object));
  });

  it.each(["no-speech", "aborted", "network"])("%s is silence, with no miss or error sound", async (error) => {
    void openPrompt();
    micPress();
    current().error(error);
    current().end();
    await settle();
    expect(prompt()).toMatchObject({ status: "ready", misses: 0, buttons: false });
    expect(audio.play).not.toHaveBeenCalledWith("error");
  });

  it("the seven-second cap never turns silence into a miss", async () => {
    void openPrompt();
    micPress();
    await vi.advanceTimersByTimeAsync(8100);
    expect(current().stop).toHaveBeenCalledOnce();
    expect(prompt()).toMatchObject({ status: "ready", misses: 0, buttons: false });
  });

  it("permission denial opens tap choices without counting a miss", async () => {
    void openPrompt();
    micPress();
    current().error("not-allowed");
    current().end();
    await settle();
    expect(getGame().micState).toBe("blocked");
    expect(prompt()).toMatchObject({ misses: 0, buttons: true });
    expect(audio.play).not.toHaveBeenCalledWith("error");
  });

  it("ignores result/error/end callbacks belonging to a replaced prompt", async () => {
    const oldAnswer = openPrompt();
    micPress();
    const old = current();
    const oldResult = old.onresult;
    const oldError = old.onerror;
    const oldEnd = old.onend;
    cancelAsk();
    await expect(oldAnswer).resolves.toBeNull();
    void openPrompt();
    await transition();
    micPress();
    oldResult?.(resultEvent("It's green.", true));
    oldError?.({ error: "not-allowed" });
    oldEnd?.();
    expect(prompt()).toMatchObject({ status: "listening", misses: 0, buttons: false });
    expect(getGame().micState).toBe("ready");
    current().result("It's green.");
    expect(prompt().status).toBe("correct");
  });

  it("models once after two consecutive silent/stopped sessions without revealing choices", async () => {
    void openPrompt();
    for (let session = 1; session <= 4; session++) {
      await transition();
      micPress();
      if (session % 2 === 0) {
        await transition();
        micPress();
      } else current().end();
      await settle();
      expect(prompt()).toMatchObject({ status: "ready", misses: 0, buttons: false });
      expect(tts.speak).toHaveBeenCalledTimes(session >= 2 ? 1 : 0);
    }
    expect(audio.play).not.toHaveBeenCalledWith("error");
  });

  it("an ambiguous recognised answer counts as unclear", async () => {
    void ask({ kind: "choice", options: ["likeApples", "likeFish"], cancellable: true });
    micPress();
    current().result("Do you like apples and fish?", true);
    current().end();
    await settle();
    expect(prompt()).toMatchObject({ status: "unclear", misses: 1, buttons: false });
  });
});
