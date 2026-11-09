import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recognition, type ListenHandle } from "./recognition";

class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = "";
  interimResults = false;
  maxAlternatives = 0;
  continuous = false;
  onresult: ((event: unknown) => void) | null = null;
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
  abort = vi.fn();
  constructor() { FakeRecognition.instances.push(this); }
  result(text: string, isFinal = false) {
    this.onresult?.({ resultIndex: 0, results: [{ 0: { transcript: text }, length: 1, isFinal }] });
  }
}

describe("recognition sessions", () => {
  let handle: ListenHandle | undefined;
  beforeEach(() => {
    vi.useFakeTimers();
    FakeRecognition.instances = [];
    vi.stubGlobal("window", {
      SpeechRecognition: FakeRecognition,
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout
    });
  });
  afterEach(() => {
    handle?.abort();
    handle = undefined;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("retains a final result arriving after graceful stop and ends only once", () => {
    const onResult = vi.fn();
    const onEnd = vi.fn();
    const onStopping = vi.fn();
    handle = recognition.listen({ onResult, onError: vi.fn(), onEnd, onStopping });
    const rec = FakeRecognition.instances[0];
    handle.stop();
    handle.stop();
    expect(rec.stop).toHaveBeenCalledTimes(1);
    expect(rec.abort).not.toHaveBeenCalled();
    expect(onStopping).toHaveBeenCalledTimes(1);
    rec.result("I like apples", true);
    expect(onResult).toHaveBeenCalledWith(["I like apples"], true);
    rec.onend?.();
    rec.onend?.();
    vi.advanceTimersByTime(2000);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("caps listening at seven seconds and allows one second for pending speech", () => {
    const onEnd = vi.fn();
    handle = recognition.listen({ onResult: vi.fn(), onError: vi.fn(), onEnd });
    const rec = FakeRecognition.instances[0];
    vi.advanceTimersByTime(6999);
    expect(rec.stop).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(rec.stop).toHaveBeenCalledTimes(1);
    expect(onEnd).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(rec.abort).toHaveBeenCalledTimes(1);
  });

  it("cancels previous sessions and discards their stale callbacks", () => {
    const onResult = vi.fn();
    const onEnd = vi.fn();
    handle = recognition.listen({ onResult, onError: vi.fn(), onEnd });
    const old = FakeRecognition.instances[0];
    const nextResult = vi.fn();
    handle = recognition.listen({ onResult: nextResult, onError: vi.fn(), onEnd: vi.fn() });
    expect(old.abort).toHaveBeenCalledTimes(1);
    old.result("old speech", true);
    old.onend?.();
    expect(onResult).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
    FakeRecognition.instances[1].result("new speech");
    expect(nextResult).toHaveBeenCalledWith(["new speech"], false);
  });

  it("reports actual activity and clears it on end", () => {
    const onActivity = vi.fn();
    handle = recognition.listen({ onResult: vi.fn(), onError: vi.fn(), onEnd: vi.fn(), onActivity });
    const rec = FakeRecognition.instances[0];
    rec.onaudiostart?.();
    expect(onActivity).toHaveBeenLastCalledWith({ audio: true, sound: false, speech: false });
    rec.onsoundstart?.();
    expect(onActivity).toHaveBeenLastCalledWith({ audio: true, sound: true, speech: false });
    rec.result("hello");
    expect(onActivity).toHaveBeenLastCalledWith({ audio: true, sound: true, speech: true });
    rec.onend?.();
    expect(onActivity).toHaveBeenLastCalledWith({ audio: false, sound: false, speech: false });
  });
});
