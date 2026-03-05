/**
 * Voice.js
 * Voix polyphonique type "Juno-ish" (simplifiée)
 * - OSC: SAW + PULSE (PWM)
 * - MIX wave: saw / pulse / mix
 * - VCF: biquad LP + env amount
 * - AMP ADSR
 * - Drive: waveshaper soft clip
 *
 * IMPORTANT: expose this.saw and this.pulse OscillatorNodes
 * pour compatibilité avec SynthEngine qui fait:
 *   voice.saw.detune.setValueAtTime(...)
 *   voice.pulse.detune.setValueAtTime(...)
 */

export class Voice {
  constructor(ctx) {
    this.ctx = ctx;

    // -------- params (defaults) --------
    this.wave = 'saw'; // 'saw' | 'pulse' | 'mix'
    this.pwmDuty = 0.5; // 0.05..0.95 (duty cycle)
    this.driveAmount = 2.0;

    // Filter
    this.cutoff = 2400;        // Hz
    this.resonance = 0.15;     // 0..1 mapped to Q
    this.filterEnvAmt = 0.35;  // 0..1

    // ADSR (seconds)
    this.adsr = {
      a: 0.01,
      d: 0.25,
      s: 0.70,
      r: 0.50,
    };

    // -------- graph --------
    this.output = ctx.createGain();

    this.amp = ctx.createGain();
    this.amp.gain.value = 0.0001;

    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';

    this.drive = ctx.createWaveShaper();
    this.drive.oversample = '2x';
    this._updateDriveCurve();

    // OSC mixer
    this.sawGain = ctx.createGain();
    this.pulseGain = ctx.createGain();

    this.sawGain.gain.value = 1;
    this.pulseGain.gain.value = 0;

    // routing: (osc -> mix) -> filter -> drive -> amp -> output
    this.sawGain.connect(this.filter);
    this.pulseGain.connect(this.filter);
    this.filter.connect(this.drive);
    this.drive.connect(this.amp);
    this.amp.connect(this.output);

    // runtime
    this.saw = null;   // OscillatorNode
    this.pulse = null; // OscillatorNode (PeriodicWave pulse)
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

  // -----------------------
  // PARAM SETTERS
  // -----------------------
  setWave(mode) {
    const m = (mode || '').toLowerCase();
    this.wave = (m === 'pulse' || m === 'mix' || m === 'saw') ? m : 'saw';
    this._applyWaveMix();
  }

  setPWM(pct01_or_0_100) {
    // accept 0..100 or 0..1
    let x = Number(pct01_or_0_100);
    if (!Number.isFinite(x)) x = 50;

    if (x > 1.001) x = x / 100;
    x = Math.max(0, Math.min(1, x));

    // duty 5%..95% to avoid degenerate wave
    const duty = 0.05 + 0.90 * x;
    this.pwmDuty = duty;

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

  setFilter(cutoffHz, resonance01, envAmt01) {
    if (cutoffHz != null) this.cutoff = Math.max(80, Math.min(12000, Number(cutoffHz) || 2400));
    if (resonance01 != null) this.resonance = Math.max(0, Math.min(1, Number(resonance01) || 0));
    if (envAmt01 != null) this.filterEnvAmt = Math.max(0, Math.min(1, Number(envAmt01) || 0));
  }

  setADSR(aMs, dMs, sPct, rMs) {
    const a = Math.max(0, Math.min(2000, Number(aMs) || 0)) / 1000;
    const d = Math.max(0, Math.min(2000, Number(dMs) || 0)) / 1000;
    const s = Math.max(0, Math.min(100, Number(sPct) || 0)) / 100;
    const r = Math.max(0, Math.min(4000, Number(rMs) || 0)) / 1000;

    this.adsr = { a, d, s, r };
  }

  // -----------------------
  // NOTE ON/OFF
  // -----------------------
  noteOn(midiNote, velocity = 1, when = this.ctx.currentTime) {
    const t = Math.max(this.ctx.currentTime, when);
    const vel = Math.max(0, Math.min(1, Number(velocity) || 0));

    this.note = midiNote;
    this._isOn = true;

    const freq = this._midiToFreq(midiNote);
    this._lastFreq = freq;

    // create oscillators
    this.saw = this.ctx.createOscillator();
    this.saw.type = 'sawtooth';
    this.saw.frequency.setValueAtTime(freq, t);

    this.pulse = this.ctx.createOscillator();
    this.pulse.setPeriodicWave(this._makePulseWave(this.pwmDuty));
    this.pulse.frequency.setValueAtTime(freq, t);

    // connect to mixer
    this.saw.connect(this.sawGain);
    this.pulse.connect(this.pulseGain);

    // filter base
    this._applyFilterAt(t);

    // envelopes
    this._applyAmpEnvAt(t, vel);
    this._applyFilterEnvAt(t);

    // start
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
      // start from current value to avoid clicks
      const current = this.amp.gain.value;
      this.amp.gain.setValueAtTime(Math.max(0.0001, current), t);
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
    // smooth-ish (no hard pop)
    const t = this.ctx.currentTime;
    const fade = 0.01;

    let saw = 1, pulse = 0;
    if (this.wave === 'pulse') { saw = 0; pulse = 1; }
    if (this.wave === 'mix') { saw = 0.7; pulse = 0.7; }

    try {
      this.sawGain.gain.cancelScheduledValues(t);
      this.pulseGain.gain.cancelScheduledValues(t);

      this.sawGain.gain.setTargetAtTime(saw, t, fade);
      this.pulseGain.gain.setTargetAtTime(pulse, t, fade);
    } catch {
      this.sawGain.gain.value = saw;
      this.pulseGain.gain.value = pulse;
    }
  }

  _applyFilterAt(t) {
    const cutoff = Math.max(80, Math.min(12000, this.cutoff));
    const q = 0.5 + this.resonance * 18; // simple map

    try {
      this.filter.frequency.cancelScheduledValues(t);
      this.filter.Q.cancelScheduledValues(t);

      this.filter.frequency.setValueAtTime(cutoff, t);
      this.filter.Q.setValueAtTime(q, t);
    } catch {}
  }

  _applyAmpEnvAt(t, velocity) {
    const { a, d, s } = this.adsr;

    // peak gain depends on velocity (very gentle)
    const peak = 0.12 + 0.88 * velocity; // 0.12..1
    const sustain = Math.max(0.0001, peak * s);

    try {
      this.amp.gain.cancelScheduledValues(t);
      this.amp.gain.setValueAtTime(0.0001, t);

      // Attack
      const ta = t + Math.max(0.001, a);
      this.amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), ta);

      // Decay -> sustain
      const td = ta + Math.max(0.001, d);
      this.amp.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain), td);
    } catch {
      this.amp.gain.value = peak;
    }
  }

  _applyFilterEnvAt(t) {
    const { a, d, s } = this.adsr;

    // env opens filter by a fraction of cutoff range
    const base = Math.max(80, Math.min(12000, this.cutoff));
    const maxExtra = 9000 * this.filterEnvAmt; // musical-ish
    const peak = Math.max(80, Math.min(12000, base + maxExtra));
    const sustain = Math.max(80, Math.min(12000, base + maxExtra * s));

    try {
      this.filter.frequency.cancelScheduledValues(t);
      this.filter.frequency.setValueAtTime(base, t);

      const ta = t + Math.max(0.001, a);
      this.filter.frequency.linearRampToValueAtTime(peak, ta);

      const td = ta + Math.max(0.001, d);
      this.filter.frequency.linearRampToValueAtTime(sustain, td);
    } catch {}
  }

  _updateDriveCurve() {
    // Soft clip curve, amount 0..10+
    const amt = Math.max(0, this.driveAmount);
    const n = 1024;
    const curve = new Float32Array(n);

    // if amt=0 => almost linear
    const k = 1 + amt * 4;

    for (let i = 0; i < n; i++) {
      const x = (i * 2) / (n - 1) - 1; // -1..1
      // tanh-ish approximation
      curve[i] = Math.tanh(k * x) / Math.tanh(k);
    }
    this.drive.curve = curve;
  }

  _makePulseWave(duty) {
    // Pulse Fourier series:
    // a_n = (2/(nπ)) * sin(nπduty), for n>=1
    // We create a periodic wave with N harmonics.
    const N = 64;
    const real = new Float32Array(N + 1);
    const imag = new Float32Array(N + 1);

    real[0] = 0;
    imag[0] = 0;

    const d = Math.max(0.05, Math.min(0.95, duty));

    for (let n = 1; n <= N; n++) {
      const an = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * d);
      // put it in sine component for a classic pulse feel
      real[n] = 0;
      imag[n] = an;
    }

    return this.ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  }

  _midiToFreq(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
  }
}
