/**
 * SynthEngine.js
 * Moteur du synthé polyphonique + scheduling
 *
 * PATCH:
 * - Setters complets pour UI:
 *   setOscWave(mode), setPWM(pct), setCutoff(hz), setResonance(q01),
 *   setFilterEnv(amt01), setADSR(aMs,dMs,sPct,rMs)
 * - Propagation aux voix actives + futures
 * - FX setters "placeholders" (stockage params) pour UI:
 *   setChorusMix, setCrushAmt, setDriveMix, setCompAmt, setReverbMix
 *
 * NOTE:
 * - Toujours routé directement vers destination.
 * - Les FX Worklets (chorus/bitcrusher/dist/comp/rev) viendront ensuite.
 */

import { Voice } from './Voice.js';

export class SynthEngine {
  constructor() {
    this.ctx = null;

    // polyphony counts "Voice instances" (so unison consumes polyphony)
    this.polyphony = 8;
    this.activeVoices = []; // { voice, note, startedAt }

    this.master = null;

    // UNISON
    this.unisonVoices = 1;     // 1..6
    this.unisonDetune = 10;    // cents per spread step

    // ----------------------------
    // GLOBAL SYNTH PARAMS (defaults)
    // ----------------------------
    this.oscWave = 'saw';   // 'saw' | 'pulse' | 'mix'
    this.pwmPct = 50;       // 0..100

    // Filter
    this.cutoff = 2400;        // Hz
    this.resonance = 0.15;     // 0..1
    this.filterEnvAmt = 0.35;  // 0..1

    // ADSR in UI units (ms/%/ms)
    this.adsrMs = { a: 10, d: 250, s: 70, r: 500 };

    // Drive (inside Voice waveshaper)
    this.driveAmount = 2.0;

    // ----------------------------
    // FX PLACEHOLDERS (0..1)
    // (worklets will use these later)
    // ----------------------------
    this.fx = {
      chorusMix: 0.0,
      crushAmt: 0.0,
      driveMix: 0.0,
      compAmt: 0.0,
      reverbMix: 0.0,
    };
  }

  async init() {
    if (this.ctx) return;

    this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);
  }

  resume() {
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }

  getCurrentTime() {
    return this.ctx?.currentTime || 0;
  }

  // =====================================================
  // PARAMS — UNISON / DRIVE
  // =====================================================
  setUnisonVoices(n) {
    this.unisonVoices = Math.max(1, Math.min(6, parseInt(n, 10) || 1));
  }

  setUnisonDetune(cents) {
    this.unisonDetune = Math.max(0, Math.min(50, Number(cents) || 0));
  }

  setDrive(amount) {
    this.driveAmount = Math.max(0, Number(amount) || 0);
    this._applyToActiveVoices((v) => v.setDrive?.(this.driveAmount));
  }

  // =====================================================
  // PARAMS — OSC / PWM
  // =====================================================
  setOscWave(mode) {
    const m = String(mode || '').toLowerCase();
    const ok = (m === 'saw' || m === 'pulse' || m === 'mix') ? m : 'saw';
    this.oscWave = ok;

    this._applyToActiveVoices((v) => v.setWave?.(this.oscWave));
  }

  // UI provides 0..100 (%). Accept also 0..1.
  setPWM(pct) {
    let x = Number(pct);
    if (!Number.isFinite(x)) x = 50;
    if (x <= 1.001 && x >= 0) x = x * 100;

    x = Math.max(0, Math.min(100, x));
    this.pwmPct = x;

    this._applyToActiveVoices((v) => v.setPWM?.(this.pwmPct));
  }

  // =====================================================
  // PARAMS — FILTER
  // =====================================================
  setCutoff(hz) {
    const v = Math.max(80, Math.min(12000, Number(hz) || 2400));
    this.cutoff = v;
    this._applyToActiveVoices((voice) => {
      voice.setFilter?.(this.cutoff, this.resonance, this.filterEnvAmt);
    });
  }

  setResonance(q01) {
    const v = Math.max(0, Math.min(1, Number(q01)));
    this.resonance = v;
    this._applyToActiveVoices((voice) => {
      voice.setFilter?.(this.cutoff, this.resonance, this.filterEnvAmt);
    });
  }

  setFilterEnv(amt01) {
    const v = Math.max(0, Math.min(1, Number(amt01)));
    this.filterEnvAmt = v;
    this._applyToActiveVoices((voice) => {
      voice.setFilter?.(this.cutoff, this.resonance, this.filterEnvAmt);
    });
  }

  // =====================================================
  // PARAMS — ADSR
  // =====================================================
  setADSR(aMs, dMs, sPct, rMs) {
    const a = Math.max(0, Math.min(2000, Number(aMs) || 0));
    const d = Math.max(0, Math.min(2000, Number(dMs) || 0));
    const s = Math.max(0, Math.min(100, Number(sPct) || 0));
    const r = Math.max(0, Math.min(4000, Number(rMs) || 0));

    this.adsrMs = { a, d, s, r };

    this._applyToActiveVoices((voice) => {
      voice.setADSR?.(this.adsrMs.a, this.adsrMs.d, this.adsrMs.s, this.adsrMs.r);
    });
  }

  // =====================================================
  // FX SETTERS — placeholders (no DSP yet)
  // =====================================================
  setChorusMix(mix01) {
    this.fx.chorusMix = this._clamp01(mix01);
    // Later: route into chorus worklet param
  }

  setCrushAmt(amt01) {
    this.fx.crushAmt = this._clamp01(amt01);
  }

  setDriveMix(mix01) {
    this.fx.driveMix = this._clamp01(mix01);
  }

  setCompAmt(amt01) {
    this.fx.compAmt = this._clamp01(amt01);
  }

  setReverbMix(mix01) {
    this.fx.reverbMix = this._clamp01(mix01);
  }

  // =====================================================
  // VOICE ALLOCATION
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
    try { stolen.voice.noteOff(); } catch {}
    return stolen;
  }

  _configureNewVoice(voice) {
    // Apply ALL current global params to this voice
    voice.setDrive?.(this.driveAmount);
    voice.setWave?.(this.oscWave);
    voice.setPWM?.(this.pwmPct);
    voice.setFilter?.(this.cutoff, this.resonance, this.filterEnvAmt);
    voice.setADSR?.(this.adsrMs.a, this.adsrMs.d, this.adsrMs.s, this.adsrMs.r);
  }

  _allocateVoice(note) {
    while (this.activeVoices.length >= this.polyphony) {
      this._stealOneVoice();
    }

    const v = new Voice(this.ctx);
    this._configureNewVoice(v);

    v.connect(this.master);

    const entry = { voice: v, note, startedAt: this.getCurrentTime() };
    this.activeVoices.push(entry);
    return entry;
  }

  _applyToActiveVoices(fn) {
    for (const entry of this.activeVoices) {
      try { fn(entry.voice); } catch {}
    }
  }

  _clamp01(x) {
    return Math.max(0, Math.min(1, Number(x) || 0));
  }

  // =====================================================
  // NOTE API
  // =====================================================
  noteOn(note, velocity = 1) {
    this.resume();
    const vel = this._clamp01(velocity);

    const u = this.unisonVoices;
    const center = (u - 1) / 2;

    const created = [];

    for (let i = 0; i < u; i++) {
      const entry = this._allocateVoice(note);
      const spread = (i - center) * this.unisonDetune;

      // detune cents (compat with your earlier code)
      try { entry.voice.saw?.detune?.setValueAtTime(spread, this.getCurrentTime()); } catch {}
      try { entry.voice.pulse?.detune?.setValueAtTime(spread, this.getCurrentTime()); } catch {}

      entry.voice.noteOn(note, vel);
      created.push(entry.voice);
    }

    return created;
  }

  noteOff(note) {
    const remaining = [];
    for (const entry of this.activeVoices) {
      if (entry.note === note) {
        try { entry.voice.noteOff(); } catch {}
        // voice finishes its own release, but we remove it from pool
      } else {
        remaining.push(entry);
      }
    }
    this.activeVoices = remaining;
  }

  // scheduling helper (for sequencer)
  playNoteAt(note, time, velocity = 1, duration = 0.2) {
    const t = Math.max(this.getCurrentTime(), time);
    const delayMs = (t - this.getCurrentTime()) * 1000;

    setTimeout(() => {
      const voices = this.noteOn(note, velocity);
      setTimeout(() => {
        voices.forEach(v => {
          try { v.noteOff(); } catch {}
        });
      }, Math.max(0, duration * 1000));
    }, Math.max(0, delayMs));
  }

  playChordAt(notes, time, velocity = 1, duration = 0.3) {
    (notes || []).forEach(n => this.playNoteAt(n, time, velocity, duration));
  }
}
