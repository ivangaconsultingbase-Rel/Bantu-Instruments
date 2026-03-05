export class EcoFilter {
  constructor(ctx) {
    this.ctx = ctx;

    this.input = ctx.createGain();
    this.output = ctx.createGain();

    this.lp = ctx.createBiquadFilter();
    this.lp.type = "lowpass";
    this.lp.Q.value = 0.707;

    // Optional gentle drive (very cheap)
    this.drive = ctx.createWaveShaper();
    this.drive.curve = this._driveCurve(1.3);

    // routing: input -> drive -> lp -> output
    this.input.connect(this.drive);
    this.drive.connect(this.lp);
    this.lp.connect(this.output);

    this.setCutoff(2400, ctx.currentTime);
    this.setResonance(0.15, ctx.currentTime);
  }

  connect(node) {
    this.output.connect(node);
  }

  // Keep same API shape as JunoFilter where possible
  setCutoff(freq, t = this.ctx.currentTime) {
    const f = Math.max(80, Math.min(12000, Number(freq) || 2400));
    const tc = 0.02;
    try {
      this.lp.frequency.cancelScheduledValues(t);
      this.lp.frequency.setTargetAtTime(f, t, tc);
    } catch {
      this.lp.frequency.value = f;
    }
  }

  rampCutoff(freq, dur = 0.05, t0 = this.ctx.currentTime) {
    const f = Math.max(80, Math.min(12000, Number(freq) || 2400));
    const d = Math.max(0.001, Number(dur) || 0.05);
    try {
      const ap = this.lp.frequency;
      ap.cancelScheduledValues(t0);
      const cur = Math.max(80, ap.value || 2400);
      ap.setValueAtTime(cur, t0);
      ap.exponentialRampToValueAtTime(Math.max(80, f), t0 + d);
    } catch {
      this.lp.frequency.value = f;
    }
  }

  setResonance(res, t = this.ctx.currentTime) {
    const r = Math.max(0, Math.min(1, Number(res) || 0));
    const q = 0.6 + r * 12.0; // 0.6 .. 12.6
    const tc = 0.03;
    try {
      this.lp.Q.cancelScheduledValues(t);
      this.lp.Q.setTargetAtTime(q, t, tc);
    } catch {
      this.lp.Q.value = q;
    }
  }

  _driveCurve(amount = 1.3) {
    const n = 512;
    const curve = new Float32Array(n);
    const k = Math.max(0.01, amount);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / (n - 1) - 1;
      curve[i] = Math.tanh(k * x);
    }
    return curve;
  }
}
