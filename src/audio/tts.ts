/**
 * Browser text-to-speech for Maple, the monsters and the English prompts.
 * - Never blocks the game: if speech is missing or never reports "end", the
 *   promise resolves after a time based on the text length.
 * - Reports speaking state so music can duck and the microphone never opens
 *   while the game itself is talking.
 */

type Listener = (speaking: boolean) => void;

const synth: SpeechSynthesis | null = typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;

let voice: SpeechSynthesisVoice | null = null;
let rateScale = 1;
let speaking = 0;
const listeners = new Set<Listener>();
const live = new Set<SpeechSynthesisUtterance>(); // keep references: Chrome drops events of GC'd utterances
const pending = new Set<() => void>();
let finishBark: (() => void) | null = null;
let cancelGeneration = 0;

const PREFERRED = [/Google US English/i, /Samantha/i, /Microsoft (Aria|Jenny|Ana|Zira)/i, /en[-_]US/i];

function chooseVoice(): void {
  if (!synth) return;
  const voices = synth.getVoices();
  if (!voices.length) return;
  const english = voices.filter((v) => /^en([-_]|$)/i.test(v.lang));
  for (const re of PREFERRED) {
    const v = english.find((x) => re.test(x.name) || re.test(x.lang));
    if (v) {
      voice = v;
      return;
    }
  }
  voice = english[0] ?? null;
}

if (synth) {
  chooseVoice();
  synth.addEventListener?.("voiceschanged", chooseVoice);
}

function setSpeaking(delta: number) {
  const before = speaking > 0;
  speaking = Math.max(0, speaking + delta);
  const now = speaking > 0;
  if (before !== now) listeners.forEach((l) => l(now));
}

export const tts = {
  available: Boolean(synth),

  onSpeakingChange(l: Listener): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },

  isSpeaking(): boolean {
    return speaking > 0;
  },

  /** 1 = normal classroom speed, < 1 = slower. */
  setRate(scale: number) {
    rateScale = scale;
  },

  speak(text: string, opts: { pitch?: number; rate?: number; transient?: boolean } = {}): Promise<void> {
    // Dialogue always takes precedence over an incidental combat bark.
    if (!opts.transient) this.cancelBark();
    const generation = cancelGeneration;
    const estimate = 900 + text.length * 75 / rateScale;
    return new Promise((resolve) => {
      let done = false;
      let timer = 0;
      let utterance: SpeechSynthesisUtterance | null = null;
      setSpeaking(+1);
      const finish = () => {
        if (done) return;
        done = true;
        window.clearTimeout(timer);
        if (utterance) live.delete(utterance);
        pending.delete(finish);
        if (finishBark === finish) finishBark = null;
        setSpeaking(-1);
        resolve();
      };
      pending.add(finish);
      if (opts.transient) finishBark = finish;
      if (!synth) {
        timer = window.setTimeout(finish, opts.transient ? 0 : estimate);
        return;
      }
      if (!voice) chooseVoice();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = voice?.lang ?? "en-US";
      if (voice) u.voice = voice;
      u.rate = (opts.rate ?? 0.92) * rateScale;
      u.pitch = opts.pitch ?? 1.15;
      u.volume = opts.transient ? .65 : 1;
      utterance = u;
      live.add(u);
      u.onend = finish;
      u.onerror = finish;
      // Watchdog: some Chromebooks never fire onend.
      // A bark gets a short deadline, including browser startup latency.
      timer = window.setTimeout(() => {
        if (opts.transient) this.cancelBark();
        else finish();
      }, opts.transient ? 1800 : estimate * 2.2 + 1500);
      if (generation !== cancelGeneration) {
        finish();
        return;
      }
      try {
        synth.speak(u);
      } catch {
        finish();
      }
    });
  },

  /** Cancels only incidental speech, so a microphone need never wait for it. */
  cancelBark() {
    if (!finishBark) return;
    const finish = finishBark;
    try {
      synth?.cancel();
    } catch {
      /* unsupported or unavailable speech */
    }
    finish();
  },

  cancel() {
    cancelGeneration++;
    try {
      synth?.cancel();
    } catch {
      /* ignore */
    }
    // Browser cancel does not reliably report onend. Release duck/mic state now.
    pending.forEach((finish) => finish());
  }
};
