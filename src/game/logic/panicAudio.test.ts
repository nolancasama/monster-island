import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { barkReady, yelpReady } from "./panicAudio";

describe("panic audio priority and global cooldowns", () => {
  it("allows the first yelp and spaces subsequent yelps by .8 seconds", () => {
    expect(yelpReady(0, -Infinity)).toBe(true);
    expect(yelpReady(.799, 0)).toBe(false);
    expect(yelpReady(.8, 0)).toBe(true);
  });

  it("spaces barks by four seconds", () => {
    expect(barkReady(0, -Infinity, false, true, false, false, true)).toBe(true);
    expect(barkReady(3.999, 0, false, true, false, false, true)).toBe(false);
    expect(barkReady(4, 0, false, true, false, false, true)).toBe(true);
  });

  it("gives speech, dialogue and microphone priority and skips unavailable speech", () => {
    expect(barkReady(10, 0, true, true, false, false, true)).toBe(false);
    expect(barkReady(10, 0, false, false, false, false, true)).toBe(false);
    expect(barkReady(10, 0, false, true, true, false, true)).toBe(false);
    expect(barkReady(10, 0, false, true, false, true, true)).toBe(false);
    expect(barkReady(10, 0, false, true, false, false, false)).toBe(false);
  });
});

describe("incidental speech cancellation", () => {
  const synth = { getVoices: () => [], addEventListener: vi.fn(), speak: vi.fn(), cancel: vi.fn() };

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    synth.speak.mockClear();
    synth.cancel.mockClear();
    vi.stubGlobal("window", { speechSynthesis: synth, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout });
    vi.stubGlobal("SpeechSynthesisUtterance", class { constructor(public text: string) {} });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("preempts a bark when dialogue starts, even without browser end events", async () => {
    const { tts } = await import("../../audio/tts");
    const bark = tts.speak("I'm on fire!", { pitch: 1.7, rate: 1.25, transient: true });
    const dialogue = tts.speak("Hello!");
    await bark;
    expect(synth.cancel).toHaveBeenCalledOnce();
    expect(synth.speak).toHaveBeenCalledTimes(2);
    expect(tts.isSpeaking()).toBe(true);
    tts.cancel();
    await dialogue;
    expect(tts.isSpeaking()).toBe(false);
  });

  it("releases microphone and ducking state immediately on cancellation", async () => {
    const { tts } = await import("../../audio/tts");
    const bark = tts.speak("I'm on fire!", { transient: true });
    tts.cancelBark();
    expect(tts.isSpeaking()).toBe(false);
    await bark;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cuts off a stalled bark after its short deadline", async () => {
    const { tts } = await import("../../audio/tts");
    const bark = tts.speak("I'm on fire!", { transient: true });
    vi.advanceTimersByTime(1800);
    await bark;
    expect(synth.cancel).toHaveBeenCalledOnce();
    expect(tts.isSpeaking()).toBe(false);
  });
});
