/**
 * Thin wrapper around the browser SpeechRecognition API (Chrome / Chromebook / Android).
 * One press = one bounded listening session. The caller judges results.
 */

interface RecAlternative {
  transcript: string;
}
interface RecResult {
  readonly length: number;
  readonly isFinal: boolean;
  [index: number]: RecAlternative;
}
interface RecEvent {
  resultIndex: number;
  results: { readonly length: number; [index: number]: RecResult };
}
interface Rec {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((e: RecEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onaudiostart: (() => void) | null;
  onaudioend: (() => void) | null;
  onsoundstart: (() => void) | null;
  onsoundend: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecCtor = new () => Rec;

function ctor(): RecCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface ListenHandlers {
  /** Ranked alternatives of the latest result. */
  onResult(alternatives: string[], isFinal: boolean): void;
  onError(error: string): void;
  /** Called exactly once when the session is over. */
  onEnd(): void;
  onActivity?(activity: ListenActivity): void;
  /** The cap or caller has requested a graceful stop. */
  onStopping?(): void;
}

export interface ListenActivity {
  sound: boolean;
  speech: boolean;
  audio?: boolean;
  level?: number;
}

export interface ListenHandle {
  /** Finish speaking, retaining results delivered before the recogniser ends. */
  stop(): void;
  /** Cancel and discard all subsequent callbacks. */
  abort(): void;
}

let active: ListenHandle | null = null;

/** Errors that mean speech cannot work here (switch to buttons). */
export const HARD_ERRORS = new Set(["not-allowed", "service-not-allowed", "audio-capture", "unsupported", "start-failed"]);

export const recognition = {
  get supported(): boolean {
    return ctor() !== null;
  },

  /** Start one bounded session. Starting another cancels the previous session. */
  listen(h: ListenHandlers, maxMs = 7000): ListenHandle {
    active?.abort();
    const Ctor = ctor();
    let ended = false;
    let timer = 0;
    let stopTimer = 0;
    let stopping = false;
    let rec: Rec | null = null;
    let activity: ListenActivity = { sound: false, speech: false, audio: false };
    const updateActivity = (patch: Partial<ListenActivity>) => {
      if (ended) return;
      activity = { ...activity, ...patch };
      h.onActivity?.(activity);
    };
    const end = (cancelled = false, abortNative = false) => {
      if (ended) return;
      ended = true;
      window.clearTimeout(timer);
      window.clearTimeout(stopTimer);
      if (active === handle) active = null;
      if (abortNative) {
        try { rec?.abort(); } catch { /* already stopped */ }
      }
      if (!cancelled) {
        h.onActivity?.({ sound: false, speech: false, audio: false });
        h.onEnd();
      }
    };
    const handle: ListenHandle = {
      stop() {
        if (ended || stopping) return;
        stopping = true;
        window.clearTimeout(timer);
        h.onStopping?.();
        if (ended) return;
        // A final result may arrive after stop(), even when there was no interim.
        stopTimer = window.setTimeout(() => end(false, true), 1000);
        try { rec?.stop(); } catch { end(false, true); }
      },
      abort() { end(true, true); }
    };
    active = handle;
    if (!Ctor) {
      h.onError("unsupported");
      end();
      return handle;
    }
    rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.maxAlternatives = 8;
    rec.continuous = false;
    rec.onresult = (e) => {
      if (ended) return;
      const res = e.results[e.results.length - 1];
      if (!res) return;
      const alts: string[] = [];
      for (let k = 0; k < res.length; k++) alts.push(res[k].transcript);
      if (alts.some((text) => text.trim())) updateActivity({ sound: true, speech: true });
      h.onResult(alts, res.isFinal);
    };
    rec.onerror = (e) => {
      if (!ended) h.onError(e.error);
    };
    rec.onend = () => end();
    rec.onaudiostart = () => updateActivity({ audio: true });
    rec.onaudioend = () => updateActivity({ audio: false, sound: false, speech: false });
    rec.onsoundstart = () => updateActivity({ sound: true });
    rec.onsoundend = () => updateActivity({ sound: false, speech: false });
    rec.onspeechstart = () => updateActivity({ sound: true, speech: true });
    rec.onspeechend = () => updateActivity({ speech: false });
    // Safety cap: some recognisers never fire onend.
    timer = window.setTimeout(() => handle.stop(), maxMs);
    try {
      rec.start();
    } catch {
      h.onError("start-failed");
      end();
    }
    return handle;
  }
};

export type MicPermission = "granted" | "denied" | "timeout" | "unavailable";

/** Ask for the microphone once, up front. Never waits more than `timeoutMs`. */
export async function requestMicPermission(timeoutMs = 8000): Promise<MicPermission> {
  if (!navigator.mediaDevices?.getUserMedia) return "unavailable";
  const ask = navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then((stream) => {
      stream.getTracks().forEach((t) => t.stop());
      return "granted" as const;
    })
    .catch((err: unknown) => {
      const name = (err as { name?: string })?.name ?? "";
      return name === "NotFoundError" || name === "NotReadableError" ? ("unavailable" as const) : ("denied" as const);
    });
  const timeout = new Promise<MicPermission>((resolve) => window.setTimeout(() => resolve("timeout"), timeoutMs));
  return Promise.race([ask, timeout]);
}
