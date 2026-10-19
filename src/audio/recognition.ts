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
}

/** Errors that mean speech cannot work here (switch to buttons). */
export const HARD_ERRORS = new Set(["not-allowed", "service-not-allowed", "audio-capture", "unsupported", "start-failed"]);

export const recognition = {
  get supported(): boolean {
    return ctor() !== null;
  },

  /** Start one listening session. Returns a function that cancels it. */
  listen(h: ListenHandlers, maxMs = 8000): () => void {
    const Ctor = ctor();
    let ended = false;
    let timer = 0;
    const end = () => {
      if (ended) return;
      ended = true;
      window.clearTimeout(timer);
      h.onEnd();
    };
    if (!Ctor) {
      h.onError("unsupported");
      end();
      return () => {};
    }
    const rec = new Ctor();
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
      h.onResult(alts, res.isFinal);
    };
    rec.onerror = (e) => {
      if (!ended) h.onError(e.error);
    };
    rec.onend = end;
    // Safety cap: some recognisers never fire onend.
    timer = window.setTimeout(() => {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
      window.setTimeout(end, 700);
    }, maxMs);
    try {
      rec.start();
    } catch {
      h.onError("start-failed");
      end();
    }
    return () => {
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
      end();
    };
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
