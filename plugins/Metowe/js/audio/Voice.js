/**
 * Voice.js
 * Juno-style poly voice
 *
 * PATCHES:
 * - JunoFilter integration
 * - Portamento / glide
 * - PWM stable update
 * - Filter envelope using audio timeline (no setTimeout)
 * - Less “drum punch”, more “Juno sustain”
 */

import { JunoFilter } from "./filters/JunoFilter.js";

export class Voice {
  constructor(ctx) {
    this.ctx = ctx;

    // -------- params --------
    this.wave = "saw";
    this.pwmDuty = 0.5;

    this.driveAmount = 2;

    this.cutoff = 2400;
    this.resonance = 0.15;
    this.filterEnvAmt = 0.25; // ✅ calmer par défaut (35% -> 25%)

    this.glideTime = 0.04;

    // ADSR (seconds)
    this.adsr = {
      a: 0.02, // ✅ 10ms -> 20ms (moins “click”)
      d: 0.35, // ✅ plus long
      s: 0.80, // ✅ plus sustain
      r: 0.60,
    };

    // -------- graph --------
    this.output = ctx.createGain();

    this.amp = ctx.createGain();
    this.amp.gain.value = 0.0001;

    this.filter = new JunoFilter(ctx);

    this.drive = ctx.createWaveShaper();
    this.drive.oversample = "2x";
    this._updateDriveCurve();

    this.sawGain = ctx.createGain();
    this.pulseGain = ctx.createGain();

    this.sawGain.gain.value = 1;
    this.pulseGain.gain.value = 0;

    // routing
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
    try {
      this.output.disconnect();
    } catch {}
  }

  //////////////////////////////////////////////////////////////
  // PARAMS
  //////////////////////////////////////////////////////////////

  setWave(mode) {
    const m = (mode || "").toLowerCase();
    this.wave = m === "pulse" || m === "mix" || m === "saw" ? m : "saw";
    this._applyWaveMix();
  }

  setPWM(pct) {
    let x = Number(pct);
    if (x > 1) x /= 100;
    x = Math.max(0, Math.min(1, x));

    this.pwmDuty = 0.05 + x * 0.9;

    if (this.pulse) {
      this.pulse.setPeriodicWave(this._makePulseWave(this.pwmDuty));
    }
  }

  setDrive(amount) {
    this.driveAmount = Math.max(0, Number(amount) || 0);
    this._updateDriveCurve();
  }

  setFilter(cut, res, env) {
    if (cut != null) {
      this.cutoff = Math.max(80, Math.min(12000, Number(cut) || 2400));
      this.filter.setCutoff(this.cutoff, this.ctx.currentTime);
    }

    if (res != null) {
      this.resonance = Math.max(0, Math.min(1, Number(res) || 0));
      this.filter.setResonance(this.resonance, this.ctx.currentTime);
    }

    if (env != null) {
      this.filterEnvAmt = Math.max(0, Math.min(1, Number(env) || 0));
    }
  }

  setADSR(aMs, dMs, sPct, rMs) {
    const a = Math.max(0, Math.min(2000, aMs)) / 1000;
    const d = Math.max(0, Math.min(2000, dMs)) / 1000;
    const s = Math.max(0, Math.min(100, sPct)) / 100;
    const r = Math.max(0, Math.min(4000, rMs)) / 1000;

    this.adsr = { a, d, s, r };
  }

  setGlide(sec) {
    this.glideTime = Math.max(0, Math.min(0.3, Number(sec) || 0));
  }

  //////////////////////////////////////////////////////////////
  // NOTE ON
  //////////////////////////////////////////////////////////////

  noteOn(note, vel = 1, when = this.ctx.currentTime) {
    const t = Math.max(this.ctx.currentTime, when);
    const velocity = Math.max(0, Math.min(1, vel));

    this.note = note;
    this._isOn = true;

    const freq = this._midiToFreq(note);
    this._lastFreq = freq;

    // OSC
    this.saw = this.ctx.createOscillator();
    this.saw.type = "sawtooth";

    this.pulse = this.ctx.createOscillator();
    this.pulse.setPeriodicWave(this._makePulseWave(this.pwmDuty));

    // PORTAMENTO
    if (this.glideTime > 0) {
      this.saw.frequency.setTargetAtTime(freq, t, this.glideTime);
      this.pulse.frequency.setTargetAtTime(freq, t, this.glideTime);
    } else {
      this.saw.frequency.setValueAtTime(freq, t);
      this.pulse.frequency.setValueAtTime(freq, t);
    }

    this.saw.connect(this.sawGain);
    this.pulse.connect(this.pulseGain);

    this._applyWaveMix();

    // Filter base params
    this.filter.setCutoff(this.cutoff, t);
    this.filter.setResonance(this.resonance, t);

    // Envelopes
    this._applyAmpEnvAt(t, velocity);
    this._applyFilterEnvAt(t);

    this.saw.start(t);
    this.pulse.start(t);
  }

  //////////////////////////////////////////////////////////////
  // NOTE OFF
  //////////////////////////////////////////////////////////////

  noteOff(when = this.ctx.currentTime) {
    if (!this._isOn) return;

    const t = Math.max(this.ctx.currentTime, when);
    this._isOn = false;

    const r = this.adsr.r;

    try {
      this.amp.gain.cancelScheduledValues(t);
      const current = Math.max(0.0001, this.amp.gain.value);
      this.amp.gain.setValueAtTime(current, t);
      this.amp.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.01, r));
    } catch {}

    const stopT = t + r + 0.03;

    try {
      this.saw?.stop(stopT);
    } catch {}
    try {
      this.pulse?.stop(stopT);
    } catch {}

    setTimeout(() => {
      try {
        this.saw?.disconnect();
      } catch {}
      try {
        this.pulse?.disconnect();
      } catch {}
      this.saw = null;
      this.pulse = null;
    }, Math.max(0, (stopT - this.ctx.currentTime) * 1000) + 10);
  }

  //////////////////////////////////////////////////////////////
  // INTERNALS
  //////////////////////////////////////////////////////////////

  _applyWaveMix() {
    const t = this.ctx.currentTime;

    let saw = 1;
    let pulse = 0;

    if (this.wave === "pulse") {
      saw = 0;
      pulse = 1;
    }
    if (this.wave === "mix") {
      saw = 0.7;
      pulse = 0.7;
    }

    this.sawGain.gain.setTargetAtTime(saw, t, 0.01);
    this.pulseGain.gain.setTargetAtTime(pulse, t, 0.01);
  }

  _applyAmpEnvAt(t, velocity) {
    const { a, d, s } = this.adsr;

    // ✅ moins “punch”: peak plus bas
    const peak = 0.10 + 0.55 * velocity; // avant: 0.12 + 0.88*vel
    const sustain = Math.max(0.0001, peak * s);

    this.amp.gain.cancelScheduledValues(t);
    this.amp.gain.setValueAtTime(0.0001, t);

    const ta = t + Math.max(0.001, a);
    this.amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), ta);

    const td = ta + Math.max(0.001, d);
    this.amp.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain), td);
  }

  _applyFilterEnvAt(t) {
    const { a, d, s } = this.adsr;

    const base = this.cutoff;

    // ✅ plus “Juno”: ouverture moins extrême
    const maxExtra = 6500 * this.filterEnvAmt; // avant 9000
    const peak = Math.min(12000, base + maxExtra);
    const sustain = Math.min(12000, base + maxExtra * s);

    // base at time
    this.filter.setCutoff(base, t);

    // attack: ramp to peak
    this.filter.rampCutoff(peak, Math.max(0.001, a), t);

    // decay: ramp to sustain
    this.filter.rampCutoff(sustain, Math.max(0.001, d), t + Math.max(0.001, a));
  }

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
