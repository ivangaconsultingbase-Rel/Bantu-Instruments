// js/audio/SynthEngine.js
import { Voice } from "./Voice.js";
import { JunoChorus } from "../fx/JunoChorus.js";

export class SynthEngine {
  constructor() {
    this.ctx = null;

    this.polyphony = 8;
    this.activeVoices = []; // { voice, note, startedAt }

    this.master = null;
    this.chorus = null;

    // UNISON
    this.unisonVoices = 1;
    this.unisonDetune = 10;

    // GLIDE
    this.glideTime = 0.04;

    // SYNTH PARAMS
    this.oscWave = "saw";
    this.pwmPct = 50;

    this.cutoff = 2400;
    this.resonance = 0.15;
    this.filterEnvAmt = 0.25;

    this.adsrMs = { a: 20, d: 350, s: 80, r: 600 };
    this.driveAmount = 1.6;

    // FX params (UI)
    this.fx = {
      chorusMix: 0.25,
      crushAmt: 0,
      driveMix: 0,
      compAmt: 0,
      reverbMix: 0,
    };

    // eco mode (auto on mobile)
    this.ecoMode = false;
  }

  async init() {
    if (this.ctx) return;

    this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    // detect mobile / Safari-ish
    const isMobile =
      ("ontouchstart" in window) ||
      (navigator.maxTouchPoints > 0) ||
      window.matchMedia("(hover: none)").matches;

    this.setEcoMode(isMobile);

    // MASTER
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;

    // CHORUS (light)
    this.chorus = new JunoChorus(this.ctx);
    this.chorus.setMix(this.fx.chorusMix);

    // routing
    this.master.connect(this.chorus.input);
    this.chorus.connect(this.ctx.destination);
  }

  resume() {
    if (this.ctx?.state === "suspended") this.ctx.resume();
  }

  getCurrentTime() {
    return this.ctx?.currentTime || 0;
  }

  // =====================================================
  // ECO MODE
  // =====================================================
  setEcoMode(on) {
    this.ecoMode = !!on;

    // optional: reduce load
    if (this.ecoMode) {
      this.polyphony = 6;
      this.unisonVoices = 1;
    } else {
      this.polyphony = 8;
    }

    // apply to existing voices is handled by Voice itself (it already chose filter at creation)
    // so eco mode affects future voices only (intended).
  }

  // =====================================================
  // UNISON
  // =====================================================
  setUnisonVoices(n) {
    this.unisonVoices = Math.max(1, Math.min(6, parseInt(n, 10) || 1));
  }

  setUnisonDetune(c) {
    this.unisonDetune = Math.max(0, Math.min(50, Number(c) || 0));
  }

  // =====================================================
  // GLIDE
  // =====================================================
  setGlide(sec) {
    this.glideTime = Math.max(0, Math.min(0.3, Number(sec) || 0));
    this._applyToActiveVoices(v => v.setGlide?.(this.glideTime));
  }

  // =====================================================
  // DRIVE
  // =====================================================
  setDrive(amount) {
    this.driveAmount = Math.max(0, Number(amount) || 0);
    this._applyToActiveVoices(v => v.setDrive?.(this.driveAmount));
  }

  // =====================================================
  // OSC
  // =====================================================
  setOscWave(mode) {
    const m = String(mode || "").toLowerCase();
    this.oscWave = (m === "saw" || m === "pulse" || m === "mix") ? m : "saw";
    this._applyToActiveVoices(v => v.setWave?.(this.oscWave));
  }

  setPWM(pct) {
    let x = Number(pct);
    if (!Number.isFinite(x)) x = 50;
    if (x <= 1.001 && x >= 0) x *= 100;
    x = Math.max(0, Math.min(100, x));
    this.pwmPct = x;
    this._applyToActiveVoices(v => v.setPWM?.(this.pwmPct));
  }

  // =====================================================
  // FILTER
  // =====================================================
  setCutoff(hz) {
    const v = Math.max(80, Math.min(12000, Number(hz) || 2400));
    this.cutoff = v;
    this._applyToActiveVoices(vv => vv.setFilter?.(this.cutoff, this.resonance, this.filterEnvAmt));
  }

  setResonance(q01) {
    const v = Math.max(0, Math.min(1, Number(q01) || 0));
    this.resonance = v;
    this._applyToActiveVoices(vv => vv.setFilter?.(this.cutoff, this.resonance, this.filterEnvAmt));
  }

  setFilterEnv(amt01) {
    const v = Math.max(0, Math.min(1, Number(amt01) || 0));
    this.filterEnvAmt = v;
    this._applyToActiveVoices(vv => vv.setFilter?.(this.cutoff, this.resonance, this.filterEnvAmt));
  }

  // =====================================================
  // ADSR
  // =====================================================
  setADSR(a, d, s, r) {
    const A = Math.max(0, Math.min(2000, Number(a) || 0));
    const D = Math.max(0, Math.min(2000, Number(d) || 0));
    const S = Math.max(0, Math.min(100, Number(s) || 0));
    const R = Math.max(0, Math.min(4000, Number(r) || 0));

    this.adsrMs = { a: A, d: D, s: S, r: R };
    this._applyToActiveVoices(v => v.setADSR?.(A, D, S, R));
  }

  // =====================================================
  // FX
  // =====================================================
  setChorusMix(v) {
    this.fx.chorusMix = this._clamp01(v);
    this.chorus?.setMix?.(this.fx.chorusMix);
  }

  setCrushAmt(v) { this.fx.crushAmt = this._clamp01(v); }
  setDriveMix(v) { this.fx.driveMix = this._clamp01(v); }
  setCompAmt(v) { this.fx.compAmt = this._clamp01(v); }
  setReverbMix(v) { this.fx.reverbMix = this._clamp01(v); }

  // =====================================================
  // VOICE MANAGEMENT
  // =====================================================
  _stealOneVoice() {
    if (this.activeVoices.length === 0) return null;

    let idx = 0;
    let oldest = this.activeVoices[0].startedAt;

    for (let i = 1; i < this.activeVoices.length; i++) {
      if (this.activeVoices[i].startedAt < oldest) {
        oldest = this.activeVoices[i].startedAt;
        idx = i;
      }
    }

    const stolen = this.activeVoices.splice(idx, 1)[0];
    try { stolen.voice.noteOff(this.getCurrentTime()); } catch {}
    return stolen;
  }

  _configureNewVoice(v) {
    v.setDrive?.(this.driveAmount);
    v.setWave?.(this.oscWave);
    v.setPWM?.(this.pwmPct);
    v.setFilter?.(this.cutoff, this.resonance, this.filterEnvAmt);
    v.setADSR?.(this.adsrMs.a, this.adsrMs.d, this.adsrMs.s, this.adsrMs.r);
    v.setGlide?.(this.glideTime);
  }

  _allocateVoice(note, startTime = this.getCurrentTime()) {
    while (this.activeVoices.length >= this.polyphony) {
      this._stealOneVoice();
    }

    const v = new Voice(this.ctx, { useEcoFilter: this.ecoMode });
    this._configureNewVoice(v);
    v.connect(this.master);

    const entry = { voice: v, note, startedAt: startTime };
    this.activeVoices.push(entry);
    return entry;
  }

  _applyToActiveVoices(fn) {
    for (const e of this.activeVoices) {
      try { fn(e.voice); } catch {}
    }
  }

  _clamp01(x) {
    return Math.max(0, Math.min(1, Number(x) || 0));
  }

  // =====================================================
  // NOTE API (immediate)
  // =====================================================
  noteOn(note, vel = 1) {
    return this.noteOnAt(note, this.getCurrentTime(), vel);
  }

  noteOff(note) {
    return this.noteOffAt(note, this.getCurrentTime());
  }

  // =====================================================
  // NOTE API (scheduled) — IMPORTANT: no setTimeout
  // =====================================================
  noteOnAt(note, time, vel = 1) {
    this.resume();

    const t = Math.max(this.getCurrentTime(), Number(time) || this.getCurrentTime());
    const velocity = this._clamp01(vel);

    const u = this.unisonVoices;
    const center = (u - 1) / 2;

    const created = [];

    for (let i = 0; i < u; i++) {
      const entry = this._allocateVoice(note, t);
      const spread = (i - center) * this.unisonDetune;

      // detune cents
      try { entry.voice.saw?.detune?.setValueAtTime(spread, t); } catch {}
      try { entry.voice.pulse?.detune?.setValueAtTime(spread, t); } catch {}

      entry.voice.noteOn(note, velocity, t);
      created.push(entry.voice);
    }

    return created;
  }

  noteOffAt(note, time) {
    const t = Math.max(this.getCurrentTime(), Number(time) || this.getCurrentTime());

    const remaining = [];
    for (const e of this.activeVoices) {
      if (e.note === note) {
        try { e.voice.noteOff(t); } catch {}
      } else {
        remaining.push(e);
      }
    }
    this.activeVoices = remaining;
  }

  // =====================================================
  // SEQUENCER HELPERS (scheduled)
  // =====================================================
  playNoteAt(note, time, vel = 1, duration = 0.2) {
    const t = Math.max(this.getCurrentTime(), Number(time) || this.getCurrentTime());
    const dur = Math.max(0.02, Number(duration) || 0.2);

    // schedule on timeline
    const voices = this.noteOnAt(note, t, vel);
    // voice.noteOff(time) is supported, so we can schedule release:
    voices.forEach(v => {
      try { v.noteOff(t + dur); } catch {}
    });
  }

  playChordAt(notes, time, vel = 1, duration = 0.3) {
    (notes || []).forEach(n => this.playNoteAt(n, time, vel, duration));
  }
}
