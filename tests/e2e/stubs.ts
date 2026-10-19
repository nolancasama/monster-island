/**
 * Browser stubs for automated runs: instant text-to-speech, a scripted
 * SpeechRecognition and a granted microphone. Injected with addInitScript.
 *
 * Tests steer recognition through window.__speech:
 *   { say: "do you like apples" } -> one interim + final result
 *   { error: "not-allowed" }       -> a permission error
 *   { say: null }                  -> silence (no-speech)
 */
export const BROWSER_STUBS = `
(() => {
  const w = window;
  w.__speech = { say: null, error: null, starts: 0 };
  const synth = w.speechSynthesis;
  if (synth) {
    // Like Chrome: speaking ends after a while, and cancel() ends it at once.
    const pending = new Set();
    const end = (u) => { if (!pending.has(u)) return; pending.delete(u); u.onend && u.onend(); };
    synth.speak = (u) => { pending.add(u); setTimeout(() => end(u), w.__ttsMs ?? 120); };
    synth.cancel = () => { [...pending].forEach(end); };
    synth.getVoices = () => [];
  }
  class FakeRecognition {
    constructor() { this.lang = ''; this.interimResults = false; this.maxAlternatives = 1; this.continuous = false; this._done = false; }
    start() {
      w.__speech.starts++;
      const plan = { ...w.__speech };
      setTimeout(() => {
        if (this._done) return;
        if (plan.error) {
          this.onerror && this.onerror({ error: plan.error });
          this._finish();
          return;
        }
        if (plan.say == null) {
          this.onerror && this.onerror({ error: 'no-speech' });
          this._finish();
          return;
        }
        const words = String(plan.say).split(' ');
        const emit = (text, isFinal) => {
          const result = [{ transcript: text }];
          result.isFinal = isFinal;
          this.onresult && this.onresult({ resultIndex: 0, results: [result] });
        };
        emit(words.slice(0, Math.max(1, words.length - 1)).join(' '), false);
        setTimeout(() => {
          if (this._done) return;
          emit(plan.say, true);
          setTimeout(() => this._finish(), 60);
        }, 150);
      }, 250);
    }
    _finish() { if (this._done) return; this._done = true; this.onend && this.onend(); }
    stop() { setTimeout(() => this._finish(), 30); }
    abort() { this._finish(); }
  }
  w.SpeechRecognition = FakeRecognition;
  w.webkitSpeechRecognition = FakeRecognition;
  if (navigator.mediaDevices) {
    navigator.mediaDevices.getUserMedia = async () => ({ getTracks: () => [] });
  }
})();
`;
