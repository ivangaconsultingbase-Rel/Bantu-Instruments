export class JunoFilter {
  constructor(ctx) {
    this.ctx = ctx;

    this.input = ctx.createGain();
    this.output = ctx.createGain();

    // Soft drive pre-filter (Juno-ish “thick”)
    this.drive = ctx.createWaveShaper();
    this.drive.curve = this._driveCurve(2.0);

    // 4-pole-ish cascade (CPU heavy but ok if we throttle updates)
    this.stage1 = ctx.createBiquadFilter();
    this.stage2 = ctx.createBiquadFilter();
    this.stage3 = ctx.createBiquadFilter();
    this.stage4 = ctx.createBiquadFilter();

    [this.stage1, this.stage2, this.stage3, this.stage4].forEach((f) => {
      f.type = "lowpass";
      f.Q.value = 0.707; // will be overridden
    });

    // Resonance feedback loop
    this.feedback = ctx.createGain();

    // Light saturation in feedback path to avoid runaway / harsh clicks
    this.fbSat = ctx.createWaveShaper();
    this.fbSat.curve = this._driveCurve(1.4);

    // routing
    this.input.connect(this.drive);

    this.drive.connect(this.stage1);
    this.stage1.connect(this.stage2);
    this.stage2.connect(this.stage3);
    this.stage3.connect(this.stage4);

    this.stage4.connect(this.output);

    // feedback: stage4 -> fbSat -> feedback gain -> input
    this.stage4.connect(this.fbSat);
    this.fbSat.connect(this.feedback);
    this.feedback.connect(this.input);

    // defaults
    this._cutoff = 2400;
    this._res = 0.15;

    this.setCutoff(2400, ctx.currentTime);
    this.setResonance(0.15, ctx.currentTime);
  }

  connect(node) {
    this.output.connect(node);
  }

  // =========================
  // API used by Voice.js
  // =========================

  setCutoff(freq, t = this.ctx.currentTime) {
    const f = Math.max(80, Math.min(12000, Number(freq) || 2400));
    this._cutoff = f;

    // Smooth changes (prevents zipper + reduces crackles)
    const tc = 0.02; // 20ms smoothing

    [this.stage1, this.stage2, this.stage3, this.stage4].forEach((s) => {
      try {
        s.frequency.cancelScheduledValues(t);
        s.frequency.setTargetAtTime(f, t, tc);
      } catch {
        s.frequency.value = f;
      }
    });
  }

  // rampCutoff(targetHz, durationSec, startTime)
  // Used by Voice filter envelope (attack/decay)
  rampCutoff(freq, dur = 0.05, t0 = this.ctx.currentTime) {
    const f = Math.max(80, Math.min(12000, Number(freq) || 2400));
    const d = Math.max(0.001, Number(dur) || 0.05);

    // Use exponential ramps when possible (needs >0)
    [this.stage1, this.stage2, this.stage3, this.stage4].forEach((s) => {
      try {
        const ap = s.frequency;
        ap.cancelScheduledValues(t0);
        // ensure we start from current value
        const cur = Math.max(80, ap.value || this._cutoff || 2400);
        ap.setValueAtTime(cur, t0);
        ap.exponentialRampToValueAtTime(Math.max(80, f), t0 + d);
      } catch {
        s.frequency.value = f;
      }
    });

    this._cutoff = f;
  }

  setResonance(res, t = this.ctx.currentTime) {
    const r = Math.max(0, Math.min(1, Number(res) || 0));
    this._res = r;

    // More “musical” resonance mapping:
    // - keep stable and avoid max feedback that explodes CPU/peaks
    const fb = this._mapResToFeedback(r); // 0..~0.72

    const tc = 0.03;

    try {
      this.feedback.gain.cancelScheduledValues(t);
      this.feedback.gain.setTargetAtTime(fb, t, tc);
    } catch {
      this.feedback.gain.value = fb;
    }

    // Also shape Q a bit across stages
    const q = 0.6 + r * 10.0; // 0.6 .. 10.6
    [this.stage1, this.stage2, this.stage3, this.stage4].forEach((s) => {
      try {
        s.Q.cancelScheduledValues(t);
        s.Q.setTargetAtTime(q, t, 0.03);
      } catch {
        s.Q.value = q;
      }
    });
  }

  // =========================
  // Helpers
  // =========================

  _mapResToFeedback(r) {
    // Stable curve: lots of usable range without hitting self-osc too hard
    // r=0 -> 0
    // r=1 -> ~0.72
    const shaped = Math.pow(r, 1.25);
    return 0.72 * shaped;
  }

  _driveCurve(amount = 2.0) {
    const n = 1024;
    const curve = new Float32Array(n);
    const k = Math.max(0.01, amount);

    for (let i = 0; i < n; i++) {
      const x = (i * 2) / (n - 1) - 1;
      curve[i] = Math.tanh(k * x);
    }
    return curve;
  }
}
