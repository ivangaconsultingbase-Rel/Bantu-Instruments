// js/audio/filters/JunoFilter.js
export class JunoFilter {
  constructor(ctx) {
    this.ctx = ctx;

    this.input = ctx.createGain();
    this.output = ctx.createGain();

    // gentle drive pre-filter (Juno-ish bite)
    this.drive = ctx.createWaveShaper();
    this.drive.curve = this._driveCurve();
    this.drive.oversample = "2x";

    // 4-pole style: 4 cascaded biquads
    this.stage1 = ctx.createBiquadFilter();
    this.stage2 = ctx.createBiquadFilter();
    this.stage3 = ctx.createBiquadFilter();
    this.stage4 = ctx.createBiquadFilter();

    [this.stage1, this.stage2, this.stage3, this.stage4].forEach((f) => {
      f.type = "lowpass";
      // Optional: keep Q low-ish per stage; resonance handled by feedback loop
      f.Q.value = 0.707;
    });

    // feedback for resonance
    this.feedback = ctx.createGain();
    this.feedback.gain.value = 0.0;

    // routing
    this.input.connect(this.drive);

    this.drive.connect(this.stage1);
    this.stage1.connect(this.stage2);
    this.stage2.connect(this.stage3);
    this.stage3.connect(this.stage4);

    this.stage4.connect(this.output);

    // feedback loop (stage4 -> feedback -> input)
    this.stage4.connect(this.feedback);
    this.feedback.connect(this.input);

    // "proxy param" concept (not a real AudioParam)
    // We'll schedule changes on every stage frequency.
    this.cutoffParam = { value: 2400 };
    this._lastCutoff = 2400;

    // defaults
    this.setCutoff(2400);
    this.setResonance(0.15);
  }

  connect(node) {
    this.output.connect(node);
  }

  disconnect() {
    try { this.output.disconnect(); } catch {}
  }

  // -------------------------------------------------------
  // Helpers for stable automation across all 4 stages
  // -------------------------------------------------------
  _eachStageFreq(fn) {
    [this.stage1, this.stage2, this.stage3, this.stage4].forEach((s) => {
      try { fn(s.frequency); } catch {}
    });
  }

  _clampFreq(freq) {
    const f = Number(freq);
    return Math.max(80, Math.min(12000, Number.isFinite(f) ? f : 2400));
  }

  _clamp01(x) {
    const v = Number(x);
    return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
  }

  // -------------------------------------------------------
  // Public API
  // -------------------------------------------------------

  /**
   * Immediate-ish cutoff set (smoothed).
   * @param {number} freq Hz
   * @param {number} when optional audio time
   */
  setCutoff(freq, when = this.ctx.currentTime) {
    const f = this._clampFreq(freq);
    const t = Math.max(this.ctx.currentTime, when);

    this.cutoffParam.value = f;
    this._lastCutoff = f;

    // Use setTargetAtTime for gentle smoothing (avoid zipper noise)
    const tc = 0.012;

    this._eachStageFreq((p) => {
      p.cancelScheduledValues(t);
      // Make sure we start from something defined at time t
      try { p.setValueAtTime(p.value, t); } catch {}
      p.setTargetAtTime(f, t, tc);
    });
  }

  /**
   * Linear ramp cutoff to target over timeSec.
   * No setTimeout; schedules in audio timeline.
   * @param {number} targetHz
   * @param {number} timeSec
   * @param {number} when optional start time
   */
  rampCutoff(targetHz, timeSec = 0.05, when = this.ctx.currentTime) {
    const target = this._clampFreq(targetHz);
    const dur = Math.max(0.0, Number(timeSec) || 0);
    const t0 = Math.max(this.ctx.currentTime, when);
    const t1 = t0 + dur;

    this.cutoffParam.value = target;
    this._lastCutoff = target;

    this._eachStageFreq((p) => {
      // Cancel future automation from t0 onward
      p.cancelScheduledValues(t0);

      // Start ramp from current value at t0
      // Use setValueAtTime(p.value,t0) to lock start point
      const start = p.value;
      p.setValueAtTime(start, t0);

      if (dur <= 0.0005) {
        p.setValueAtTime(target, t0);
      } else {
        p.linearRampToValueAtTime(target, t1);
      }
    });
  }

  /**
   * Resonance (feedback gain)
   * @param {number} res 0..1
   * @param {number} when optional audio time
   */
  setResonance(res, when = this.ctx.currentTime) {
    const r = this._clamp01(res);
    const t = Math.max(this.ctx.currentTime, when);

    // mapping: keep stable; too high will self-oscillate & blow up on 4 biquads
    // You can tweak max from 0.85 to 0.95 if you want more scream (watch volume!)
    const maxFb = 0.88;
    const fb = r * maxFb;

    try {
      this.feedback.gain.cancelScheduledValues(t);
      this.feedback.gain.setTargetAtTime(fb, t, 0.015);
    } catch {
      this.feedback.gain.value = fb;
    }
  }

  // -------------------------------------------------------
  // Internal drive curve
  // -------------------------------------------------------
  _driveCurve() {
    const n = 1024;
    const curve = new Float32Array(n);

    // mild pre-saturation: helps resonance not spike too harshly
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / (n - 1) - 1; // -1..1
      curve[i] = Math.tanh(x * 1.8);
    }
    return curve;
  }
}
