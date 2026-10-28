/**
 * Procedural Web Audio: no files, no network. Surf, the river, birds, a
 * cheerful steel-drum tune, monster voices and every effect are synthesised.
 *
 * Buses: music and ambience duck under spoken English and go silent while the
 * microphone listens (classroom speakers bleed into the mic).
 */

import type { MonsterId } from "../game/types";

type Wave = OscillatorType;
export type Tune = "island" | "celebrate" | "forest" | "port" | "danger";
export type Scene = "island" | "forest" | "port";

const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

export type SfxName =
  | "correct"
  | "error"
  | "tick"
  | "micOn"
  | "micOff"
  | "pick"
  | "give"
  | "munch"
  | "discover"
  | "journal"
  | "friend"
  | "vines"
  | "thud"
  | "splash"
  | "stones"
  | "sparkle"
  | "stone"
  | "poof"
  | "switch"
  | "bump"
  | "whoosh"
  // Act 2: fights, rewards, the town and the raiders.
  | "mount"
  | "whip"
  | "bubble"
  | "wind"
  | "fireball"
  | "burst"
  | "hit"
  | "ko"
  | "alert"
  | "snap"
  | "hurt"
  | "coin"
  | "chest"
  | "buy"
  | "craft"
  | "rest"
  | "rumble"
  | "cage";

/** Monster moods for vocalisations (the English itself is TTS). */
export type Mood = "hello" | "happy" | "sad" | "excited" | "sleepy" | "surprised";

class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private musicDuck!: GainNode;
  private ambBus!: GainNode;
  private ambDuck!: GainNode;
  private sfxBus!: GainNode;
  private noise!: AudioBuffer;
  private musicVolume = 0.35;
  private sfxVolume = 0.75;
  private speaking = false;
  private listening = false;
  private ocean: GainNode | null = null;
  private river: GainNode | null = null;
  private musicTimer = 0;
  private music: { next: number; step: number; tune: Tune } | null = null;

  /** Must be called from a user gesture (Start button). */
  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0.9;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master.connect(comp).connect(ctx.destination);
      this.musicDuck = ctx.createGain();
      this.musicBus = ctx.createGain();
      this.musicBus.connect(this.musicDuck).connect(this.master);
      this.ambDuck = ctx.createGain();
      this.ambBus = ctx.createGain();
      this.ambBus.connect(this.ambDuck).connect(this.master);
      this.sfxBus = ctx.createGain();
      this.sfxBus.connect(this.master);
      this.noise = this.makeNoise(3);
      this.applyVolumes();
      document.addEventListener("visibilitychange", () => {
        if (!this.ctx) return;
        if (document.hidden) void this.ctx.suspend();
        else void this.ctx.resume();
      });
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  private makeNoise(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      last = last * 0.6 + (Math.random() * 2 - 1) * 0.4;
      data[i] = last * 1.6;
    }
    return buf;
  }

  setVolumes(music: number, sfx: number) {
    this.musicVolume = music;
    this.sfxVolume = sfx;
    this.applyVolumes();
  }

  private applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(this.musicVolume * 0.3, t, 0.05);
    this.ambBus.gain.setTargetAtTime(Math.max(this.musicVolume, 0.25) * 0.6, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.sfxVolume * 0.9, t, 0.05);
    this.applyDuck();
  }

  private applyDuck() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const music = this.listening ? 0 : this.speaking ? 0.28 : 1;
    const amb = this.listening ? 0.04 : this.speaking ? 0.45 : 1;
    this.musicDuck.gain.setTargetAtTime(music, t, 0.08);
    this.ambDuck.gain.setTargetAtTime(amb, t, 0.08);
  }

  /** English is being spoken: duck the background. */
  setSpeaking(on: boolean) {
    this.speaking = on;
    this.applyDuck();
  }

  /** Microphone open: silence the background. */
  setListening(on: boolean) {
    this.listening = on;
    this.applyDuck();
  }

  // ------------------------------------------------------------------ helpers

  private env(gain: GainNode, t: number, peak: number, attack: number, decay: number) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private tone(freq: number, t: number, opts: { type?: Wave; peak?: number; attack?: number; decay?: number; to?: number; bus?: AudioNode }) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = opts.type ?? "sine";
    osc.frequency.setValueAtTime(freq, t);
    const attack = opts.attack ?? 0.008;
    const decay = opts.decay ?? 0.3;
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t + attack + decay);
    this.env(g, t, opts.peak ?? 0.2, attack, decay);
    osc.connect(g).connect(opts.bus ?? this.sfxBus);
    osc.start(t);
    osc.stop(t + attack + decay + 0.05);
  }

  private noiseBurst(
    t: number,
    opts: { filter?: BiquadFilterType; freq?: number; to?: number; q?: number; peak?: number; attack?: number; decay?: number; bus?: AudioNode }
  ) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = opts.filter ?? "lowpass";
    f.frequency.setValueAtTime(opts.freq ?? 1200, t);
    f.Q.value = opts.q ?? 0.8;
    const attack = opts.attack ?? 0.01;
    const decay = opts.decay ?? 0.2;
    if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, t + attack + decay);
    const g = ctx.createGain();
    this.env(g, t, opts.peak ?? 0.2, attack, decay);
    src.connect(f).connect(g).connect(opts.bus ?? this.sfxBus);
    src.start(t, Math.random() * 2, attack + decay + 0.1);
  }

  private get now(): number {
    return this.ctx ? this.ctx.currentTime + 0.01 : 0;
  }

  private ready(): boolean {
    return Boolean(this.ctx && this.ctx.state === "running");
  }

  // --------------------------------------------------------------- one-shots

  play(name: SfxName) {
    if (!this.ready()) return;
    const t = this.now;
    switch (name) {
      case "correct":
        this.tone(midi(79), t, { peak: 0.14, decay: 0.3, type: "triangle" });
        this.tone(midi(84), t + 0.11, { peak: 0.14, decay: 0.5, type: "triangle" });
        break;
      case "error":
        this.tone(midi(64), t, { peak: 0.07, decay: 0.16, type: "triangle" });
        this.tone(midi(60), t + 0.17, { peak: 0.07, decay: 0.24, type: "triangle" });
        break;
      case "tick":
        this.tone(1250, t, { peak: 0.05, decay: 0.03 });
        break;
      case "micOn":
        this.tone(880, t, { to: 1320, peak: 0.09, decay: 0.08 });
        break;
      case "micOff":
        this.tone(1100, t, { to: 700, peak: 0.06, decay: 0.08 });
        break;
      case "pick":
        this.tone(midi(84), t, { peak: 0.1, decay: 0.12, type: "triangle" });
        this.tone(midi(91), t + 0.07, { peak: 0.08, decay: 0.25, type: "triangle" });
        this.noiseBurst(t, { filter: "bandpass", freq: 2200, q: 1.2, peak: 0.05, decay: 0.08 });
        break;
      case "give":
        this.noiseBurst(t, { filter: "bandpass", freq: 600, to: 1800, q: 0.8, peak: 0.08, attack: 0.05, decay: 0.2 });
        this.tone(midi(76), t + 0.1, { peak: 0.08, decay: 0.3, type: "triangle" });
        break;
      case "munch":
        for (let i = 0; i < 5; i++) this.noiseBurst(t + i * 0.13, { filter: "bandpass", freq: 1900 + (i % 2) * 400, q: 1.5, peak: 0.13, decay: 0.05 });
        this.tone(midi(81), t + 0.72, { peak: 0.08, decay: 0.3 });
        break;
      case "discover":
        this.tone(midi(88), t, { peak: 0.12, decay: 0.15, type: "triangle" });
        this.tone(midi(93), t + 0.1, { peak: 0.14, decay: 0.5, type: "triangle" });
        break;
      case "journal":
        this.noiseBurst(t, { filter: "bandpass", freq: 3000, to: 1200, q: 0.9, peak: 0.07, attack: 0.02, decay: 0.16 });
        [79, 83, 86].forEach((m, i) => this.tone(midi(m), t + 0.12 + i * 0.07, { peak: 0.06, decay: 0.35 }));
        break;
      case "friend":
        [72, 76, 79, 84].forEach((m, i) => this.tone(midi(m), t + i * 0.12, { peak: 0.15, decay: 0.25, type: "triangle" }));
        this.tone(midi(88), t + 0.5, { peak: 0.16, attack: 0.02, decay: 1.4, type: "triangle" });
        this.tone(midi(84), t + 0.5, { peak: 0.08, attack: 0.02, decay: 1.4 });
        this.tone(midi(79), t + 0.5, { peak: 0.08, attack: 0.02, decay: 1.4 });
        for (let i = 0; i < 10; i++) this.tone(2000 + Math.random() * 2600, t + 0.55 + i * 0.07, { peak: 0.022, decay: 0.3 });
        break;
      case "vines":
        for (let i = 0; i < 10; i++) {
          this.noiseBurst(t + i * 0.12, { filter: "bandpass", freq: 900 + i * 160, q: 1.1, peak: 0.06, attack: 0.03, decay: 0.16 });
        }
        [60, 64, 67, 72, 76].forEach((m, i) => this.tone(midi(m), t + i * 0.22, { peak: 0.06, attack: 0.04, decay: 0.5, type: "triangle" }));
        break;
      case "thud":
        this.tone(90, t, { to: 50, peak: 0.42, decay: 0.3 });
        this.noiseBurst(t, { filter: "lowpass", freq: 500, to: 120, peak: 0.28, decay: 0.35 });
        break;
      case "splash":
        this.noiseBurst(t, { filter: "bandpass", freq: 2200, to: 500, q: 0.6, peak: 0.22, attack: 0.015, decay: 0.4 });
        [460, 620, 780].forEach((f, i) => this.tone(f, t + i * 0.05, { to: f * 0.45, peak: 0.06, decay: 0.12 }));
        break;
      case "stones":
        this.noiseBurst(t, { filter: "lowpass", freq: 300, to: 90, peak: 0.32, attack: 0.1, decay: 1.2 });
        for (let i = 0; i < 4; i++) {
          this.tone(520 - i * 40, t + 0.3 + i * 0.28, { to: 160, peak: 0.12, decay: 0.15 });
          this.noiseBurst(t + 0.3 + i * 0.28, { filter: "bandpass", freq: 1400, to: 500, peak: 0.08, decay: 0.15 });
        }
        break;
      case "sparkle":
        [84, 88, 91, 96].forEach((m, i) => this.tone(midi(m), t + i * 0.06, { peak: 0.05, attack: 0.02, decay: 0.6 }));
        break;
      case "stone":
        // A deep, old chord for the Monster Stone.
        [48, 55, 60, 64, 67].forEach((m, i) => this.tone(midi(m), t + i * 0.15, { peak: 0.08, attack: 0.3, decay: 2.4, type: "triangle" }));
        break;
      case "poof":
        this.noiseBurst(t, { filter: "bandpass", freq: 900, to: 3000, q: 0.7, peak: 0.12, attack: 0.02, decay: 0.25 });
        break;
      case "switch":
        this.tone(midi(76), t, { peak: 0.08, decay: 0.12, type: "triangle" });
        this.tone(midi(83), t + 0.08, { peak: 0.08, decay: 0.2, type: "triangle" });
        break;
      case "bump":
        this.tone(140, t, { to: 90, peak: 0.12, decay: 0.12, type: "triangle" });
        break;
      case "whoosh":
        // Wing beats rising into a rush of air.
        for (let i = 0; i < 6; i++) this.noiseBurst(t + i * 0.1, { filter: "bandpass", freq: 700 + i * 120, q: 1.4, peak: 0.07, attack: 0.02, decay: 0.07 });
        this.noiseBurst(t + 0.5, { filter: "bandpass", freq: 500, to: 2600, q: 0.7, peak: 0.12, attack: 0.15, decay: 0.6 });
        break;
      case "mount":
        this.tone(midi(72), t, { to: midi(79), peak: 0.07, decay: 0.16, type: "triangle" });
        this.tone(midi(84), t + 0.12, { peak: 0.05, decay: 0.12, type: "triangle" });
        break;
      case "whip":
        this.noiseBurst(t, { filter: "bandpass", freq: 1800, to: 5200, q: 1.2, peak: 0.11, attack: 0.01, decay: 0.12 });
        this.tone(900, t + 0.06, { to: 300, peak: 0.05, decay: 0.08, type: "square" });
        break;
      case "bubble":
        this.tone(500, t, { to: 1300, peak: 0.08, decay: 0.12 });
        this.tone(800, t + 0.05, { to: 1800, peak: 0.05, decay: 0.08 });
        break;
      case "wind":
        this.noiseBurst(t, { filter: "bandpass", freq: 900, to: 2400, q: 2, peak: 0.1, attack: 0.03, decay: 0.2 });
        break;
      case "fireball":
        this.noiseBurst(t, { filter: "lowpass", freq: 2400, to: 500, peak: 0.13, attack: 0.02, decay: 0.3 });
        this.tone(220, t, { to: 110, peak: 0.06, decay: 0.2, type: "sawtooth" });
        break;
      case "burst":
        this.noiseBurst(t, { filter: "lowpass", freq: 3000, to: 300, peak: 0.22, attack: 0.02, decay: 0.7 });
        this.tone(160, t, { to: 60, peak: 0.12, decay: 0.5, type: "triangle" });
        break;
      case "hit":
        this.tone(320, t, { to: 140, peak: 0.12, decay: 0.09, type: "square" });
        this.noiseBurst(t, { filter: "bandpass", freq: 1500, q: 1, peak: 0.09, decay: 0.07 });
        break;
      case "ko":
        // A cartoon "boing" and a falling whistle: knocked out, not hurt.
        this.tone(midi(84), t, { to: midi(60), peak: 0.07, decay: 0.45, type: "triangle" });
        this.tone(midi(91), t + 0.32, { peak: 0.05, decay: 0.3 });
        break;
      case "alert":
        this.tone(midi(81), t, { peak: 0.06, decay: 0.08, type: "square" });
        this.tone(midi(86), t + 0.09, { peak: 0.06, decay: 0.12, type: "square" });
        break;
      case "snap":
        this.noiseBurst(t, { filter: "highpass", freq: 2500, peak: 0.1, attack: 0.005, decay: 0.06 });
        this.tone(180, t, { to: 90, peak: 0.07, decay: 0.12, type: "triangle" });
        break;
      case "hurt":
        this.tone(330, t, { to: 160, peak: 0.12, decay: 0.22, type: "sawtooth" });
        break;
      case "coin":
        this.tone(midi(88), t, { peak: 0.07, decay: 0.08, type: "square" });
        this.tone(midi(95), t + 0.07, { peak: 0.06, decay: 0.25, type: "square" });
        break;
      case "chest":
        [72, 76, 79, 84].forEach((m, i) => this.tone(midi(m), t + i * 0.09, { peak: 0.08, decay: 0.4, type: "triangle" }));
        break;
      case "buy":
        this.tone(midi(84), t, { peak: 0.07, decay: 0.1, type: "square" });
        this.tone(midi(88), t + 0.08, { peak: 0.07, decay: 0.1, type: "square" });
        this.tone(midi(91), t + 0.16, { peak: 0.07, decay: 0.3, type: "square" });
        break;
      case "craft":
        [67, 72, 76, 79, 84, 88].forEach((m, i) => this.tone(midi(m), t + i * 0.07, { peak: 0.06, attack: 0.01, decay: 0.5 }));
        break;
      case "rest":
        [60, 64, 67, 72].forEach((m, i) => this.tone(midi(m), t + i * 0.25, { peak: 0.07, attack: 0.08, decay: 1.4, type: "triangle" }));
        break;
      case "rumble":
        // Distant engines: a low growl rising and falling.
        this.noiseBurst(t, { filter: "lowpass", freq: 160, to: 70, q: 1.2, peak: 0.4, attack: 0.6, decay: 2.6 });
        this.tone(55, t, { to: 48, peak: 0.12, attack: 0.5, decay: 2.5, type: "sawtooth" });
        break;
      case "cage":
        [96, 91, 98, 93].forEach((m, i) => this.tone(midi(m), t + i * 0.06, { peak: 0.04, attack: 0.01, decay: 0.5 }));
        this.noiseBurst(t, { filter: "highpass", freq: 4000, peak: 0.05, decay: 0.6 });
        break;
    }
  }

  /** A monster's own voice (no words: the English is spoken by TTS). */
  voice(id: MonsterId, mood: Mood) {
    if (!this.ready()) return;
    const t = this.now;
    const up = mood === "happy" || mood === "excited" || mood === "hello" || mood === "surprised";
    if (id === "leafy") {
      // Leafy: high, squeaky chirps.
      const n = mood === "excited" ? 5 : mood === "sad" ? 2 : 3;
      for (let i = 0; i < n; i++) {
        const f = midi(86 + (up ? i * 2 : -i * 3));
        this.tone(f, t + i * 0.09, { to: f * (up ? 1.25 : 0.8), peak: 0.07, attack: 0.01, decay: 0.08, type: "square" });
      }
    } else if (id === "bubbo") {
      // Bubbo: bubbly blubs that drop in pitch.
      const n = mood === "excited" ? 5 : 3;
      for (let i = 0; i < n; i++) {
        const f = midi((up ? 64 : 58) + (up ? i * 3 : -i * 2));
        this.tone(f * 1.6, t + i * 0.11, { to: f * 0.7, peak: 0.12, attack: 0.008, decay: 0.1 });
        this.tone(f * 3.2, t + i * 0.11, { to: f * 1.6, peak: 0.03, attack: 0.004, decay: 0.05 });
      }
    } else if (id === "puff") {
      // Puff: soft cooing trills, rising when happy, falling when sad.
      const n = mood === "excited" ? 5 : mood === "sad" ? 2 : 3;
      for (let i = 0; i < n; i++) {
        const f = midi((up ? 88 : 84) + (up ? i * 3 : -i * 3));
        this.tone(f, t + i * 0.13, { to: f * (up ? 1.12 : 0.88), peak: 0.06, attack: 0.03, decay: 0.16, type: "triangle" });
        this.tone(f * 2, t + i * 0.13 + 0.03, { peak: 0.015, attack: 0.02, decay: 0.1 });
      }
    } else {
      for (let i = 0; i < 3; i++) this.tone(midi(55 + i * 4), t + i * 0.1, { to: midi(60 + i * 4), peak: 0.1, decay: 0.1, type: "sawtooth" });
    }
    if (mood === "sleepy") this.noiseBurst(t, { filter: "bandpass", freq: 500, q: 1.5, peak: 0.04, attack: 0.3, decay: 0.8 });
  }

  // ------------------------------------------------------------- ambience

  startAmbience() {
    if (!this.ctx || this.ocean) return;
    const ctx = this.ctx;
    const loop = (type: BiquadFilterType, freq: number, q: number) => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      src.connect(f).connect(g);
      src.start(0, Math.random() * 2);
      return g;
    };
    // Surf: a low swell rising and falling every ~7 s.
    const surf = loop("lowpass", 420, 0.6);
    surf.gain.value = 0.9;
    const near = ctx.createGain();
    near.gain.value = 0.6;
    const swell = ctx.createGain();
    swell.gain.value = 0.5;
    surf.connect(swell).connect(near).connect(this.ambBus);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.14;
    const depth = ctx.createGain();
    depth.gain.value = 0.32;
    lfo.connect(depth).connect(swell.gain);
    lfo.start();
    this.ocean = near;
    // River: a brighter, steady babble that only plays near the river.
    const river = loop("bandpass", 1100, 0.7);
    river.gain.value = 0;
    river.connect(this.ambBus);
    this.river = river;
    window.setInterval(() => this.critters(), 900);
  }

  /** 0 = far, 1 = right beside: surf and river loudness from the player's position. */
  setNearness(sea: number, river: number) {
    if (!this.ctx || !this.ocean || !this.river) return;
    const t = this.ctx.currentTime;
    this.ocean.gain.setTargetAtTime(0.35 + 0.65 * Math.max(0, Math.min(1, sea)), t, 0.5);
    this.river.gain.setTargetAtTime(0.32 * Math.max(0, Math.min(1, river)), t, 0.5);
  }

  private scene: Scene = "island";

  /** Which creatures fill the background: island birds, the prehistoric forest, or the harbour. */
  setScene(scene: Scene) {
    this.scene = scene;
  }

  /** Tropical birds: sparse, randomised, never while listening. */
  private critters() {
    if (!this.ready() || this.listening) return;
    if (Math.random() > 0.22) return;
    const t = this.now;
    if (this.scene === "forest") {
      // Insects, frogs and, now and then, a far-off friendly dinosaur hoot.
      if (Math.random() < 0.25) {
        this.tone(140 + Math.random() * 40, t, { to: 90, peak: 0.03, attack: 0.15, decay: 0.7, bus: this.ambBus, type: "triangle" });
        this.tone(190 + Math.random() * 40, t + 0.5, { to: 120, peak: 0.025, attack: 0.15, decay: 0.6, bus: this.ambBus, type: "triangle" });
      } else {
        const f = 3200 + Math.random() * 1800;
        for (let i = 0; i < 6; i++) this.tone(f, t + i * 0.035, { peak: 0.012, attack: 0.005, decay: 0.025, bus: this.ambBus, type: "square" });
      }
      return;
    }
    if (this.scene === "port") {
      // Gulls and the harbour bell.
      if (Math.random() < 0.2) this.tone(midi(79), t, { peak: 0.03, attack: 0.005, decay: 1.6, bus: this.ambBus, type: "triangle" });
      else for (let i = 0; i < 2; i++) this.tone(1500 + Math.random() * 400, t + i * 0.22, { to: 900, peak: 0.025, attack: 0.02, decay: 0.18, bus: this.ambBus });
      return;
    }
    const base = 1800 + Math.random() * 1600;
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const tt = t + i * (0.1 + Math.random() * 0.07);
      this.tone(base * (1 + Math.random() * 0.15), tt, { to: base * 1.4, peak: 0.02, attack: 0.01, decay: 0.07, bus: this.ambBus });
    }
  }

  // ------------------------------------------------------------------ music

  startMusic(tune: Tune = "island") {
    if (!this.ctx) return;
    if (this.music?.tune === tune) return;
    window.clearInterval(this.musicTimer);
    this.music = { next: this.ctx.currentTime + 0.2, step: 0, tune };
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 60);
  }

  stopMusic() {
    window.clearInterval(this.musicTimer);
    this.music = null;
  }

  private scheduleMusic() {
    const ctx = this.ctx;
    const m = this.music;
    if (!ctx || !m) return;
    const bpm = m.tune === "celebrate" ? 118 : m.tune === "forest" ? 126 : m.tune === "port" ? 96 : m.tune === "danger" ? 88 : 104;
    const eighth = 60 / bpm / 2;
    while (m.next < ctx.currentTime + 0.3) {
      this.playStep(m.step, m.next, eighth, m.tune);
      m.step++;
      m.next += eighth;
    }
  }

  /** Steel drum: a sine with quick inharmonic partials. */
  private pan(f: number, t: number, peak: number) {
    const bus = this.musicBus;
    this.tone(f, t, { peak, attack: 0.004, decay: 0.45, bus });
    this.tone(f * 2.01, t, { peak: peak * 0.35, attack: 0.002, decay: 0.18, bus });
    this.tone(f * 2.98, t, { peak: peak * 0.12, attack: 0.002, decay: 0.08, bus });
  }

  /**
   * Act 2's tunes: a light, bouncy adventure march in the hostile forest
   * (minor, but never scary), a gentle accordion-like waltz in the town, and
   * a low pulsing ostinato for the raiders' arrival.
   */
  private playAct2Step(step: number, t: number, eighth: number, tune: Tune) {
    const bus = this.musicBus;
    const s = step % 8;
    const bar = Math.floor(step / 8) % 8;
    if (tune === "forest") {
      const MEL = [
        [69, 0, 72, 0, 76, 0, 74, 72],
        [71, 0, 0, 67, 69, 0, 0, 0],
        [69, 0, 72, 0, 77, 0, 76, 74],
        [76, 0, 0, 0, 0, 0, 0, 0],
        [77, 0, 76, 0, 74, 0, 72, 0],
        [71, 0, 72, 0, 74, 0, 0, 0],
        [72, 0, 71, 0, 69, 0, 68, 0],
        [69, 0, 0, 0, 0, 0, 0, 0]
      ];
      const ROOT = [45, 43, 45, 40, 41, 43, 40, 45];
      const n = MEL[bar][s];
      if (n) this.tone(midi(n), t, { peak: 0.07, attack: 0.005, decay: 0.22, bus, type: "square" });
      if (s % 2 === 0) this.tone(midi(ROOT[bar] + (s === 4 ? 7 : 0)), t, { peak: 0.1, attack: 0.01, decay: eighth * 1.6, bus, type: "triangle" });
      // Wooden drums: a kick on the beat, a rim on the off-beat.
      if (s % 4 === 0) this.tone(110, t, { to: 50, peak: 0.12, decay: 0.12, bus, type: "sine" });
      if (s % 4 === 2) this.noiseBurst(t, { filter: "bandpass", freq: 1800, q: 2, peak: 0.04, decay: 0.05, bus });
      return;
    }
    if (tune === "port") {
      // Three-four feel inside the eighth grid: bass on 0, chords on 2 and 4.
      const MEL = [
        [76, 0, 0, 0, 79, 0, 77, 0],
        [76, 0, 0, 0, 74, 0, 0, 0],
        [74, 0, 0, 0, 77, 0, 76, 0],
        [74, 0, 0, 0, 72, 0, 0, 0],
        [72, 0, 76, 0, 79, 0, 84, 0],
        [83, 0, 0, 0, 81, 0, 79, 0],
        [77, 0, 76, 0, 74, 0, 71, 0],
        [72, 0, 0, 0, 0, 0, 0, 0]
      ];
      const ROOT = [48, 48, 43, 43, 48, 45, 43, 48];
      const n = MEL[bar][s];
      if (n) {
        this.tone(midi(n), t, { peak: 0.06, attack: 0.03, decay: 0.5, bus, type: "triangle" });
        this.tone(midi(n) * 1.004, t, { peak: 0.03, attack: 0.03, decay: 0.5, bus, type: "sawtooth" });
      }
      const root = ROOT[bar];
      if (s === 0) this.tone(midi(root), t, { peak: 0.1, attack: 0.01, decay: eighth * 3, bus, type: "triangle" });
      if (s === 2 || s === 4 || s === 6) for (const k of [root + 16, root + 19, root + 24]) this.tone(midi(k), t, { peak: 0.018, attack: 0.01, decay: 0.2, bus });
      return;
    }
    // danger
    const pulse = [38, 0, 38, 0, 38, 0, 41, 39][s];
    if (pulse) this.tone(midi(pulse), t, { peak: 0.13, attack: 0.01, decay: eighth * 1.4, bus, type: "sawtooth" });
    if (s === 0 && bar % 2 === 0) this.tone(midi(62 + (bar % 4 === 0 ? 0 : 1)), t, { peak: 0.05, attack: 0.3, decay: eighth * 7, bus, type: "triangle" });
    if (s % 4 === 0) this.tone(90, t, { to: 40, peak: 0.13, decay: 0.2, bus });
  }

  private playStep(step: number, t: number, eighth: number, tune: Tune) {
    if (tune === "forest" || tune === "port" || tune === "danger") return this.playAct2Step(step, t, eighth, tune);
    // 8 bars of 8 eighths, calypso feel: notes on 0, 3, 4, 6.
    const MELODY: number[][] =
      tune === "celebrate"
        ? [
            [72, 0, 0, 76, 79, 0, 84, 0],
            [83, 0, 0, 79, 76, 0, 79, 0],
            [77, 0, 0, 81, 84, 0, 81, 0],
            [79, 0, 0, 0, 74, 0, 0, 0],
            [76, 0, 0, 79, 84, 0, 88, 0],
            [86, 0, 0, 84, 81, 0, 79, 0],
            [77, 0, 76, 74, 0, 72, 74, 0],
            [72, 0, 0, 0, 0, 0, 0, 0]
          ]
        : [
            [76, 0, 0, 79, 0, 0, 76, 0],
            [74, 0, 0, 72, 0, 0, 74, 0],
            [76, 0, 0, 79, 81, 0, 79, 0],
            [76, 0, 0, 0, 0, 0, 0, 0],
            [77, 0, 0, 81, 0, 0, 77, 0],
            [76, 0, 0, 79, 0, 0, 76, 0],
            [74, 0, 72, 74, 0, 76, 74, 0],
            [72, 0, 0, 0, 0, 0, 0, 0]
          ];
    const ROOT = [48, 43, 48, 48, 41, 48, 43, 48];
    const bar = Math.floor(step / 8) % 8;
    const s = step % 8;
    const note = MELODY[bar][s];
    if (note) this.pan(midi(note), t, tune === "celebrate" ? 0.13 : 0.1);
    const root = ROOT[bar];
    // Bass on 1 and the "and" of 2 (calypso).
    if (s === 0 || s === 3 || s === 4) {
      this.tone(midi(s === 3 ? root + 7 : root) - 0, t, { peak: 0.11, attack: 0.01, decay: eighth * 2.5, bus: this.musicBus, type: "triangle" });
    }
    // Off-beat chord plucks.
    if (s === 2 || s === 6) {
      for (const n of [root + 16, root + 19, root + 24]) this.tone(midi(n), t, { peak: 0.022, attack: 0.005, decay: 0.16, bus: this.musicBus });
    }
    // Shaker.
    if (s % 2 === 1) this.noiseBurst(t, { filter: "highpass", freq: 5200, peak: 0.018, attack: 0.004, decay: 0.05, bus: this.musicBus });
  }
}

export const audio = new AudioEngine();
