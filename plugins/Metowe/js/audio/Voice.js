/**
 * Voice.js
 * Juno-style poly voice
 *
 * PATCHES:
 * - JunoFilter integration (robust to method signatures)
 * - Portamento / glide
 * - PWM stable update
 * - Filter envelope using audio timeline (no setTimeout)
 */

import { JunoFilter } from "./filters/JunoFilter.js";

export class Voice {
  constructor(ctx) {
    this.ctx = ctx;

    // -------- params --------
    this.wave = "saw";   // 'saw' | 'pulse' | 'mix'
    this.pwmDuty = 0.5;  // 0.05..0.95 duty

    this.driveAmount = 2;

    this.cutoff = 2400;        // Hz
    this.resonance = 0.15;     // 0..1
    this.filterEnvAmt = 0.35;  // 0..1

    this.glideTime = 0.04;     // seconds

    this.adsr = { a: 0.01, d: 0.25, s: 0.7, r: 0.5 }; // seconds

    // -------- graph --------
    this.output = ctx.createGain();

    this.amp = ctx.createGain();
    this.amp.gain.value = 0.0001;

    this.filter = new JunoFilter(ctx);

    this.drive = ctx.createWaveShaper();
    this.drive.oversample = "2x";
    this._updateDriveCurve();

    // OSC mixer
    this.sawGain = ctx.createGain();
    this.pulseGain = ctx.createGain();
    this.sawGain.gain.value = 1;
    this.pulseGain.gain.value = 0;

    // routing: (osc mix) -> filter -> drive -> amp -> output
    this.sawGain.connect(this.filter.input);
    this.pulseGain.connect(this.filter.input);

    this.filter.connect(this.drive);
    this.drive.connect(this.amp);
    this.amp.connect(this.output);

    // runtime
    this.saw = null;
    this.pulse = null;

    this.note = null;
    this._isOn = false;

    this._lastFreq = 440;
  }

  connect(node) {
    this.output.connect(node);
  }

  disconnect() {
    try { this.output.disconnect(); } catch {}
  }

  //////////////////////////////////////////////////////////////////
  // PARAMS
  //////////////////////////////////////////////////////////////////

  setWave(mode) {
    const m = String(mode || "").toLowerCase();
    this.wave = (m === "pulse" || m === "mix" || m === "saw") ? m : "saw";
    this._applyWaveMix();
  }

  setPWM(pct) {
    let x = Number(pct);
    if (!Number.isFinite(x)) x = 50;

    // accept 0..100 or 0..1
    if (x > 1.001) x /= 100;
    x = Math.max(0, Math.min(1, x));

    this.pwmDuty = 0.05 + x * 0.9;

    if (this.pulse) {
      try {
        this.pulse.setPeriodicWave(this._makePulseWave(this.pwmDuty));
      } catch {}
    }
  }

  setDrive(amount) {
    this.driveAmount = Math.max(0, Number(amount) || 0);
    this._updateDriveCurve();
  }

  setFilter(cut, res, env) {
    const now = this.ctx.currentTime;

    if (cut != null) {
      this.cutoff = Math.max(80, Math.min(12000, Number(cut) || 2400));
      this._setCutoffAt(this.cutoff, now);
    }

    if (res != null) {
      this.resonance = Math.max(0, Math.min(1, Number(res) || 0));
      this._setResAt(this.resonance, now);
    }

    if (env != null) {
      this.filterEnvAmt = Math.max(0, Math.min(1, Number(env) || 0));
    }

    // IMPORTANT: update immédiat si note tenue
    if (this._isOn) {
      this._setCutoffAt(this.cutoff, now);
    }
  }

  setADSR(aMs, dMs, sPct, rMs) {
    const a = Math.max(0, Math.min(2000, Number(aMs) || 0)) / 1000;
    const d = Math.max(0, Math.min(2000, Number(dMs) || 0)) / 1000;
    const s = Math.max(0, Math.min(100, Number(sPct) || 0)) / 100;
    const r = Math.max(0, Math.min(4000, Number(rMs) || 0)) / 1000;

    this.adsr = { a, d, s, r };
  }

  setGlide(sec) {
    this.glideTime = Math.max(0, Math.min(0.3, Number(sec) || 0));
  }

  //////////////////////////////////////////////////////////////////
  // NOTE ON
  //////////////////////////////////////////////////////////////////

  noteOn(note, vel = 1, when = this.ctx.currentTime) {
    const t = Math.max(this.ctx.currentTime, when);
    const velocity = Math.max(0, Math.min(1, Number(vel) || 0));

    this.note = note;
    this._isOn = true;

    const freq = this._midiToFreq(note);
    this._lastFreq = freq;

    // OSC
    this.saw = this.ctx.createOscillator();
    this.saw.type = "sawtooth";

    this.pulse = this.ctx.createOscillator();
    this.pulse.setPeriodicWave(this._makePulseWave(this.pwmDuty));

    // PORTAMENTO (glide)
    if (this.glideTime > 0) {
      // setTargetAtTime uses a "timeConstant": glideTime feels musical enough here
      this.saw.frequency.setTargetAtTime(freq, t, this.glideTime);
      this.pulse.frequency.setTargetAtTime(freq, t, this.glideTime);
    } else {
      this.saw.frequency.setValueAtTime(freq, t);
      this.pulse.frequency.setValueAtTime(freq, t);
    }

    this.saw.connect(this.sawGain);
    this.pulse.connect(this.pulseGain);

    this._applyWaveMix();

    // base filter values at t
    this._applyFilterAt(t);

    // envelopes
    this._applyAmpEnvAt(t, velocity);
    this._applyFilterEnvAt(t);

    this.saw.start(t);
    this.pulse.start(t);
  }

  //////////////////////////////////////////////////////////////////
  // NOTE OFF
  //////////////////////////////////////////////////////////////////

  noteOff(when = this.ctx.currentTime) {
    if (!this._isOn) return;

    const t = Math.max(this.ctx.currentTime, when);
    this._isOn = false;

    const r = this.adsr.r;

    // amp release
    try {
      this.amp.gain.cancelScheduledValues(t);
      const current = Math.max(0.0001, this.amp.gain.value);
      this.amp.gain.setValueAtTime(current, t);
      this.amp.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.01, r));
    } catch {}

    const stopT = t + Math.max(0.05, r) + 0.03;

    try { this.saw?.stop(stopT); } catch {}
    try { this.pulse?.stop(stopT); } catch {}

    setTimeout(() => {
      try { this.saw?.disconnect(); } catch {}
      try { this.pulse?.disconnect(); } catch {}
      this.saw = null;
      this.pulse = null;
    }, Math.max(0, (stopT - this.ctx.currentTime) * 1000) + 10);
  }

  //////////////////////////////////////////////////////////////////
  // INTERNALS
  //////////////////////////////////////////////////////////////////

  _applyWaveMix() {
    const t = this.ctx.currentTime;

    let saw = 1;
    let pulse = 0;

    if (this.wave === "pulse") { saw = 0; pulse = 1; }
    if (this.wave === "mix")   { saw = 0.7; pulse = 0.7; }

    try {
      this.sawGain.gain.setTargetAtTime(saw, t, 0.01);
      this.pulseGain.gain.setTargetAtTime(pulse, t, 0.01);
    } catch {
      this.sawGain.gain.value = saw;
      this.pulseGain.gain.value = pulse;
    }
  }

  _applyFilterAt(t) {
    this._setCutoffAt(this.cutoff, t);
    this._setResAt(this.resonance, t);
  }

  _applyAmpEnvAt(t, velocity) {
    const { a, d, s } = this.adsr;

    const peak = 0.12 + 0.88 * velocity;
    const sustain = Math.max(0.0001, peak * s);

    try {
      this.amp.gain.cancelScheduledValues(t);
      this.amp.gain.setValueAtTime(0.0001, t);

      const ta = t + Math.max(0.001, a);
      this.amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), ta);

      const td = ta + Math.max(0.001, d);
      this.amp.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain), td);
    } catch {
      this.amp.gain.value = peak;
    }
  }

  ////////////////////////////////////////////////////////////////
  // FILTER ENVELOPE (audio timeline version)
  ////////////////////////////////////////////////////////////////

  _applyFilterEnvAt(t) {
    const { a, d, s } = this.adsr;

    const base = this.cutoff;
    const maxExtra = 9000 * this.filterEnvAmt;

    const peak = Math.min(12000, base + maxExtra);
    const sustain = Math.min(12000, base + maxExtra * s);

    // base at t
    this._setCutoffAt(base, t);

    // attack to peak over a seconds (starts at t)
    this._rampCutoffTo(peak, a, t);

    // decay to sustain over d seconds (starts at t + a)
    this._rampCutoffTo(sustain, d, t + a);
  }

  ////////////////////////////////////////////////////////////////
  // FILTER CALLS (robust to JunoFilter signatures)
  ////////////////////////////////////////////////////////////////

  _setCutoffAt(freq, time) {
    const f = Math.max(80, Math.min(12000, Number(freq) || 2400));
    const t = Number.isFinite(time) ? time : this.ctx.currentTime;

    // If JunoFilter supports time argument: setCutoff(freq, time)
    try {
      if (typeof this.filter.setCutoff === "function") {
        if (this.filter.setCutoff.length >= 2) this.filter.setCutoff(f, t);
        else this.filter.setCutoff(f);
      }
    } catch {}
  }

  _setResAt(res, time) {
    const r = Math.max(0, Math.min(1, Number(res) || 0));
    const t = Number.isFinite(time) ? time : this.ctx.currentTime;

    try {
      if (typeof this.filter.setResonance === "function") {
        if (this.filter.setResonance.length >= 2) this.filter.setResonance(r, t);
        else this.filter.setResonance(r);
      }
    } catch {}
  }

  _rampCutoffTo(freq, durSec, startTime) {
    const f = Math.max(80, Math.min(12000, Number(freq) || 2400));
    const d = Math.max(0, Number(durSec) || 0);
    const t0 = Number.isFinite(startTime) ? startTime : this.ctx.currentTime;

    // Preferred: JunoFilter.rampCutoff(target, durationSec, startTime)
    try {
      if (typeof this.filter.rampCutoff === "function") {
        // accept (target,dur) or (target,dur,start)
        if (this.filter.rampCutoff.length >= 3) this.filter.rampCutoff(f, d, t0);
        else this.filter.rampCutoff(f, d);
        return;
      }
    } catch {}

    // Fallback: approximate with setCutoff at start and end
    // (not as smooth, but avoids breaking if rampCutoff is missing)
    try {
      this._setCutoffAt(f, t0 + d);
    } catch {}
  }

  ////////////////////////////////////////////////////////////////
  // DRIVE
  ////////////////////////////////////////////////////////////////

  _updateDriveCurve() {
    const n = 1024;
    const curve = new Float32Array(n);

    const k = 1 + this.driveAmount * 4;

    for (let i = 0; i < n; i++) {
      const x = (i * 2) / (n - 1) - 1;
      curve[i] = Math.tanh(k * x) / Math.tanh(k);
    }

    this.drive.curve = curve;
  }

  ////////////////////////////////////////////////////////////////
  // PWM WAVE
  ////////////////////////////////////////////////////////////////

  _makePulseWave(duty) {
    const N = 64;

    const real = new Float32Array(N + 1);
    const imag = new Float32Array(N + 1);

    const d = Math.max(0.05, Math.min(0.95, duty));

    for (let n = 1; n <= N; n++) {
      const an = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * d);
      real[n] = 0;
      imag[n] = an;
    }

    return this.ctx.createPeriodicWave(real, imag);
  }

  _midiToFreq(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
  }
}
