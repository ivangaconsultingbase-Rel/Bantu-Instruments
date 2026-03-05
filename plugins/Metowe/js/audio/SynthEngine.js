/**
 * SynthEngine.js
 * Polyphonic synth engine
 *
 * PATCH:
 * - EcoFilter mode (auto on mobile)
 * - Scheduling en "audio time" (NO setTimeout for note timing)
 * - Cleanup automatique des voix après release
 * - Chorus mix live
 */

import { Voice } from "./Voice.js";
import { JunoChorus } from "../fx/JunoChorus.js";

export class SynthEngine {
  constructor() {
    this.ctx = null;

    this.isMobile =
      ("ontouchstart" in window) ||
      (navigator.maxTouchPoints > 0) ||
      (window.matchMedia?.("(hover: none)")?.matches ?? false);

    // Eco ON by default on mobile
    this.ecoMode = !!this.isMobile;

    // Polyphony (reduce on mobile)
    this.polyphony = this.ecoMode ? 6 : 8;
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

    this.driveAmount = 2;

    // FX parameters
    this.fx = {
      chorusMix: 0.25,
      crushAmt: 0,
      driveMix: 0,
      compAmt: 0,
      reverbMix: 0,
    };

    // coalescing flags (UI slider spam)
    this._pendingFilterApply = false;
    this._pendingOscApply = false;
    this._pendingEnvApply = false;
  }

  async init() {
    if (this.ctx) return;

    this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    this.master = this.ctx.createGain();
    this.master.gain.value = this.ecoMode ? 0.80 : 0.85;

    this.chorus = new JunoChorus(this.ctx);
    this.chorus.setMix?.(this.fx.chorusMix);

    this.master.connect(this.chorus.input);
    this.chorus.connect(this.ctx.destination);
  }

  resume() {
    if (this.ctx?.state === "suspended") this.ctx.resume();
  }

  getCurrentTime() {
    return this.ctx?.currentTime || 0;
  }

  // ---------------------------------------------------------
  // ECO MODE
  // ---------------------------------------------------------
  setEcoMode(on) {
    this.ecoMode = !!on;
    this.polyphony = this.ecoMode ? 6 : 8;
    if (this.ecoMode && this.unisonVoices > 3) this.unisonVoices = 3;
  }

  // ---------------------------------------------------------
  // UNISON
  // ---------------------------------------------------------
  setUnisonVoices(n) {
    const wanted = Math.max(1, Math.min(6, parseInt(n) || 1));
    this.unisonVoices = this.ecoMode ? Math.min(3, wanted) : wanted;
  }

  setUnisonDetune(c) {
    this.unisonDetune = Math.max(0, Math.min(50, Number(c) || 0));
  }

  // ---------------------------------------------------------
  // GLIDE
  // ---------------------------------------------------------
  setGlide(sec) {
    this.glideTime = Math.max(0, Math.min(0.3, Number(sec) || 0));
    this._applyToActiveVoices((v) => v.setGlide?.(this.glideTime));
  }

  // ---------------------------------------------------------
  // DRIVE
  // ---------------------------------------------------------
  setDrive(amount) {
    this.driveAmount = Math.max(0, Number(amount) || 0);
    this._applyToActiveVoices((v) => v.setDrive?.(this.driveAmount));
  }

  // ---------------------------------------------------------
  // OSC (coalesced)
  // ---------------------------------------------------------
  setOscWave(mode) {
    const m = String(mode || "").toLowerCase();
    this.oscWave = m === "saw" || m === "pulse" || m === "mix" ? m : "saw";
    this._deferOscApply();
  }

  setPWM(pct) {
    let x = Number(pct);
    if (!Number.isFinite(x)) x = 50;
    if (x <= 1.001 && x >= 0) x *= 100;
    this.pwmPct = Math.max(0, Math.min(100, x));
    this._deferOscApply();
  }

  _deferOscApply() {
    if (this._pendingOscApply) return;
    this._pendingOscApply = true;
    requestAnimationFrame(() => {
      this._pendingOscApply = false;
      this._applyToActiveVoices((v) => {
        v.setWave?.(this.oscWave);
        v.setPWM?.(this.pwmPct);
      });
    });
  }

  // ---------------------------------------------------------
  // FILTER (coalesced)
  // ---------------------------------------------------------
  setCutoff(hz) {
    this.cutoff = Math.max(80, Math.min(12000, Number(hz) || 2400));
    this._deferFilterApply();
  }

  setResonance(q) {
    this.resonance = Math.max(0, Math.min(1, Number(q) || 0));
    this._deferFilterApply();
  }

  setFilterEnv(amt) {
    this.filterEnvAmt = Math.max(0, Math.min(1, Number(amt) || 0));
    this._deferFilterApply();
  }

  _deferFilterApply() {
    if (this._pendingFilterApply) return;
    this._pendingFilterApply = true;
    requestAnimationFrame(() => {
      this._pendingFilterApply = false;
      this._applyToActiveVoices((v) => {
        v.setFilter?.(this.cutoff, this.resonance, this.filterEnvAmt);
      });
    });
  }

  // ---------------------------------------------------------
  // ADSR (coalesced)
  // ---------------------------------------------------------
  setADSR(a, d, s, r) {
    const A = Math.max(0, Math.min(2000, a || 0));
    const D = Math.max(0, Math.min(2000, d || 0));
    const S = Math.max(0, Math.min(100, s || 0));
    const R = Math.max(0, Math.min(4000, r || 0));

    this.adsrMs = { a: A, d: D, s: S, r: R };
    this._deferEnvApply();
  }

  _deferEnvApply() {
    if (this._pendingEnvApply) return;
    this._pendingEnvApply = true;
    requestAnimationFrame(() => {
      this._pendingEnvApply = false;
      this._applyToActiveVoices((v) => {
        v.setADSR?.(this.adsrMs.a, this.adsrMs.d, this.adsrMs.s, this.adsrMs.r);
      });
    });
  }

  // ---------------------------------------------------------
  // FX
  // ---------------------------------------------------------
  setChorusMix(v) {
    this.fx.chorusMix = this._clamp01(v);
    this.chorus?.setMix?.(this.fx.chorusMix);
  }
  setCrushAmt(v) { this.fx.crushAmt = this._clamp01(v); }
  setDriveMix(v) { this.fx.driveMix = this._clamp01(v); }
  setCompAmt(v) { this.fx.compAmt = this._clamp01(v); }
  setReverbMix(v) { this.fx.reverbMix = this._clamp01(v); }

  // ---------------------------------------------------------
  // VOICE MANAGEMENT
  // ---------------------------------------------------------
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

  _allocateVoice(note) {
    while (this.activeVoices.length >= this.polyphony) this._stealOneVoice();

    const v = new Voice(this.ctx, { useEcoFilter: this.ecoMode });
    this._configureNewVoice(v);
    v.connect(this.master);

    const entry = { voice: v, note, startedAt: this.getCurrentTime() };
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

  _scheduleCleanup(entry, endTimeSec) {
    // only manages JS arrays (audio already scheduled)
    const now = this.getCurrentTime();
    const delayMs = Math.max(0, (endTimeSec - now) * 1000);

    setTimeout(() => {
      const idx = this.activeVoices.indexOf(entry);
      if (idx !== -1) this.activeVoices.splice(idx, 1);
    }, delayMs + 30);
  }

  // ---------------------------------------------------------
  // NOTE API (immediate)
  // ---------------------------------------------------------
  noteOn(note, vel = 1) {
    return this.noteOnAt(note, this.getCurrentTime(), vel);
  }

  // ✅ new: schedule noteOn at an audio time
  noteOnAt(note, time, vel = 1) {
    this.resume();

    const t = Math.max(this.getCurrentTime(), Number(time) || this.getCurrentTime());
    const velocity = this._clamp01(vel);

    const u = this.unisonVoices;
    const center = (u - 1) / 2;

    const createdEntries = [];

    for (let i = 0; i < u; i++) {
      const entry = this._allocateVoice(note);
      const spread = (i - center) * this.unisonDetune;

      // detune scheduled at t (not now)
      try { entry.voice.saw?.detune?.setValueAtTime(spread, t); } catch {}
      try { entry.voice.pulse?.detune?.setValueAtTime(spread, t); } catch {}

      entry.voice.noteOn(note, velocity, t);
      createdEntries.push(entry);
    }

    return createdEntries;
  }

  noteOff(note) {
    const remaining = [];
    for (const e of this.activeVoices) {
      if (e.note === note) {
        try { e.voice.noteOff(this.getCurrentTime()); } catch {}
      } else {
        remaining.push(e);
      }
    }
    this.activeVoices = remaining;
  }

  // ---------------------------------------------------------
  // SEQUENCER SCHEDULING (audio-time)
  // ---------------------------------------------------------
  playNoteAt(note, time, vel = 1, duration = 0.2) {
    const t0 = Math.max(this.getCurrentTime(), Number(time) || this.getCurrentTime());
    const dur = Math.max(0.01, Number(duration) || 0.2);

    const entries = this.noteOnAt(note, t0, vel);

    // schedule noteOff at audio time (no timeout)
    const tOff = t0 + dur;
    for (const e of entries) {
      try { e.voice.noteOff(tOff); } catch {}
      // cleanup after release (adsr.r is seconds)
      const rel = Math.max(0.05, Number(e.voice?.adsr?.r) || 0.3);
      this._scheduleCleanup(e, tOff + rel + 0.08);
    }
  }

  playChordAt(notes, time, vel = 1, duration = 0.3) {
    (notes || []).forEach((n) => this.playNoteAt(n, time, vel, duration));
  }
}
