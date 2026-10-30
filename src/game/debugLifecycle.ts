import { debugEnabled } from "./debugAccess";
import { useDebug } from "./debugState";

// Debug travel invalidates pending dialogue and cutscene continuations. Ordinary
// sessions never enter this branch or install cancellation listeners.
let epoch = 0;
const cancellations = new Set<() => void>();
export class DebugScriptCancelled extends Error {}
export const debugScriptEpoch = () => epoch;
export const debugInputPaused = () => debugEnabled && useDebug.getState().open;

export function onDebugScriptCancel(cancel: () => void) {
  if (debugEnabled) cancellations.add(cancel);
}

export function cancelDebugScripts() {
  if (!debugEnabled) return;
  epoch++;
  for (const cancel of [...cancellations]) cancel();
}

export function debugGuard<T>(promise: Promise<T>, generation = epoch): Promise<T> {
  if (!debugEnabled) return promise;
  return new Promise<T>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      cancellations.delete(cancel);
      clearTimeout(timer);
    };
    const cancel = () => {
      cleanup();
      reject(new DebugScriptCancelled());
    };
    const complete = (value: T) => {
      if (generation !== epoch) return cancel();
      if (debugInputPaused()) {
        timer = setTimeout(() => complete(value), 30);
        return;
      }
      cleanup();
      resolve(value);
    };
    cancellations.add(cancel);
    promise.then(complete, (error: unknown) => {
      cleanup();
      reject(error);
    });
    if (generation !== epoch) cancel();
  });
}

export function debugWait(ms: number): Promise<void> {
  if (!debugEnabled) return new Promise((resolve) => window.setTimeout(resolve, ms));
  const generation = epoch;
  let remaining = ms;
  let previous = Date.now();
  return debugGuard(new Promise<void>((resolve) => {
    const tick = () => {
      if (generation !== epoch) return resolve();
      const now = Date.now();
      if (!debugInputPaused()) remaining -= now - previous;
      previous = now;
      if (remaining <= 0) resolve();
      else window.setTimeout(tick, Math.min(30, remaining));
    };
    tick();
  }), generation);
}
