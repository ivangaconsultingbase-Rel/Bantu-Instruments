/**
 * Voice.js — LITE (stable / mobile friendly)
 * - OSC: SAW + PULSE (PWM) + MIX
 * - VCF: single Biquad LP (log mapping)
 * - AMP ADSR (audio timeline)
 * - Filter env (audio timeline)
 * - Glide/portamento
 * - Drive waveshaper
 *
 * Exposes:
 *   this.saw, this.pulse (OscillatorNodes)
 */

export class Voice {
  constructor(ctx, opts = {}) {
    this.ctx = ctx;

    // -------- params --------
    this.wave = "saw";         // saw | pulse | mix
    this.pwmDuty = 0.5;        // 0.05..0.95
    this.driveAmount = 1.6;

    this.cutoff = 2400;        // Hz
    this.resonance = 0.15;     // 0..1
    this.filterEnvAmt = 0.25;  // 0..1

    this.glideTime = 0.04;

    this.adsr = { a: 0.02, d: 0.35, s: 0.8, r: 0.6 }; // seconds

    // eco
    this.eco = !!opts.useEcoFilter;

    // -------- graph --------
    this.output = ctx.createGain();

    this.amp = ctx.createGain();
    this.amp.gain.value = 0.0001;

    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";

    this.drive = ctx.createWaveShaper();
    this.drive.oversample = this.eco ? "none" : "2x";
    this._updateDriveCurve();

    // OSC mixer
    this.sawGain = ctx.createGain();
    this.pulseGain = ctx.createGain();
    this.sawGain.gain.value = 1;
    this.pulseGain.gain.value = 0;

    // routing: (osc->mix) -> filter -> drive -> amp -> output
    this.sawGain.connect(this.filter);
    this.pulseGain.connect(this.filter);
    this.filter.connect(this.drive);
    this.drive.connect(this.amp);
    this.amp.connect(this.output);

    // runtime
    this.saw = null;
    this.pulse = null;
    this.note = null;
    this._isOn = false;
  }

  connect(node) { this.output.connect(node); }
  disconnect() { try { this.output.disconnect(); } catch {} }

  // -----------------------
  // PARAMS
  // -----------------------
  setWave(mode) {
    const m = String(mode || "").toLowerCase();
    this.wave = (m === "pulse" || m === "mix" || m === "saw") ? m : "saw";
    this._applyWaveMix();
  }

  setPWM(pct) {
    let x = Number(pct);
    if (!Number.isFinite(x)) x = 50;
    if (x > 1.001) x /= 100;        // accept 0..100 or 0..1
    x = Math.max(0, Math.min(1, x));
    this.pwmDuty = 0.05 + x * 0.90;

    if (this.pulse) {
      try { this.pulse.setPeriodicWave(this._makePulseWave(this.pwmDuty)); } catch {}
    }
  }

  setDrive(amount) {
    this.driveAmount = Math.max(0, Number(amount) || 0);
    this._updateDriveCurve();
  }

  setFilter(cut, res, env) {
    if (cut != null) this.cutoff = Math.max(80, Math.min(12000, Number(cut) || 2400));
    if (res != null) this.resonance = Math.max(0, Math.min(1, Number(res) || 0));
    if (env != null) this.filterEnvAmt = Math.max(0, Math.min(1, Number(env) || 0));

    // apply immediately (use timeline smoothing)
    const t = this.ctx.currentTime;
    this._applyFilterAt(t);
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

  // -----------------------
  // NOTE ON/OFF (audio time)
  // -----------------------
  noteOn(midiNote, velocity = 1, when = this.ctx.currentTime) {
    const t = Math.max(this.ctx.currentTime, when);
    const vel = Math.max(0, Math.min(1, Number(velocity) || 0));

    this.note = midiNote;
    this._isOn = true;

    const freq = this._midiToFreq(midiNote);

    // create oscillators
    this.saw = this.ctx.createOscillator();
    this.saw.type = "sawtooth";

    this.pulse = this.ctx.createOscillator();
    this.pulse.setPeriodicWave(this._makePulseWave(this.pwmDuty));

    // glide
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

    // base filter
    this._applyFilterAt(t);

    // envelopes
    this._applyAmpEnvAt(t, vel);
    this._applyFilterEnvAt(t);

    this.saw.start(t);
    this.pulse.start(t);
  }

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

    // stop OSC after release
    const stopT = t + Math.max(0.05, r) + 0.02;
    try { this.saw?.stop(stopT); } catch {}
    try { this.pulse?.stop(stopT); } catch {}

    // cleanup
    setTimeout(() => {
      try { this.saw?.disconnect(); } catch {}
      try { this.pulse?.disconnect(); } catch {}
      this.saw = null;
      this.pulse = null;
    }, Math.max(0, (stopT - this.ctx.currentTime) * 1000) + 10);
  }

  // -----------------------
  // INTERNALS
  // -----------------------
  _applyWaveMix() {
    const t = this.ctx.currentTime;
    const tc = 0.01;

    let saw = 1, pulse = 0;
    if (this.wave === "pulse") { saw = 0; pulse = 1; }
    if (this.wave === "mix") { saw = 0.7; pulse = 0.7; }

    try {
      this.sawGain.gain.setTargetAtTime(saw, t, tc);
      this.pulseGain.gain.setTargetAtTime(pulse, t, tc);
    } catch {
      this.sawGain.gain.value = saw;
      this.pulseGain.gain.value = pulse;
    }
  }

  _applyFilterAt(t) {
    // perceptual mapping: slider feels “active” both low & high
    const f = Math.max(80, Math.min(12000, this.cutoff));
    const q = 0.7 + this.resonance * 12.0; // stable range

    try {
      this.filter.frequency.cancelScheduledValues(t);
      this.filter.Q.cancelScheduledValues(t);

      this.filter.frequency.setTargetAtTime(f, t, 0.015);
      this.filter.Q.setTargetAtTime(q, t, 0.02);
    } catch {}
  }

  _applyAmpEnvAt(t, velocity) {
    const { a, d, s } = this.adsr;

    const peak = 0.10 + 0.90 * velocity;   // soften a bit (less “drum”)
    const sustain = Math.max(0.0001, peak * s);

    try {
      this.amp.gain.cancelScheduledValues(t);
      this.amp.gain.setValueAtTime(0.0001, t);

      const ta = t + Math.max(0.001, a);
      this.amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), ta);

      const td = ta + Math.max(0.001, d);
      this.amp.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain), td);
    } catch {}
  }

  _applyFilterEnvAt(t) {
    const { a, d, s } = this.adsr;

    const base = Math.max(80, Math.min(12000, this.cutoff));
    const maxExtra = (this.eco ? 6000 : 9000) * this.filterEnvAmt;

    const peak = Math.min(12000, base + maxExtra);
    const sustain = Math.min(12000, base + maxExtra * s);

    try {
      // base at t
      this.filter.frequency.cancelScheduledValues(t);
      this.filter.frequency.setValueAtTime(base, t);

      // attack
      const ta = t + Math.max(0.001, a);
      this.filter.frequency.linearRampToValueAtTime(peak, ta);

      // decay
      const td = ta + Math.max(0.001, d);
      this.filter.frequency.linearRampToValueAtTime(sustain, td);
    } catch {}
  }

  _updateDriveCurve() {
    const amt = Math.max(0, this.driveAmount);
    const n = this.eco ? 512 : 1024;
    const curve = new Float32Array(n);

    const k = 1 + amt * 3.2; // softer than before

    for (let i = 0; i < n; i++) {
      const x = (i * 2) / (n - 1) - 1;
      curve[i] = Math.tanh(k * x) / Math.tanh(k);
    }
    this.drive.curve = curve;
  }

  _makePulseWave(duty) {
    const N = this.eco ? 32 : 64; // eco reduces harmonics
    const real = new Float32Array(N + 1);
    const imag = new Float32Array(N + 1);

    const d = Math.max(0.05, Math.min(0.95, duty));
    for (let n = 1; n <= N; n++) {
      const an = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * d);
      real[n] = 0;
      imag[n] = an;
    }
    return this.ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  }

  _midiToFreq(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
  }
}
