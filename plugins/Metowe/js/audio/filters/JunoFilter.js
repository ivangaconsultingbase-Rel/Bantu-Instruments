// js/audio/filters/JunoFilter.js
export class JunoFilter {
  constructor(ctx) {
    this.ctx = ctx;

    this.input = ctx.createGain();
    this.output = ctx.createGain();

    this.drive = ctx.createWaveShaper();
    this.drive.curve = this._driveCurve();
    this.drive.oversample = "2x";

    this.stage1 = ctx.createBiquadFilter();
    this.stage2 = ctx.createBiquadFilter();
    this.stage3 = ctx.createBiquadFilter();
    this.stage4 = ctx.createBiquadFilter();

    [this.stage1, this.stage2, this.stage3, this.stage4].forEach(f => {
      f.type = "lowpass";
      f.Q.value = 0.8;
    });

    // feedback stabilisé
    this.feedback = ctx.createGain();
    this.feedback.gain.value = 0;

    // routing
    this.input.connect(this.drive);

    this.drive.connect(this.stage1);
    this.stage1.connect(this.stage2);
    this.stage2.connect(this.stage3);
    this.stage3.connect(this.stage4);

    this.stage4.connect(this.output);

    // feedback depuis la sortie
    this.stage4.connect(this.feedback);
    this.feedback.connect(this.input);

    this._cutoff = 2400;
    this._res = 0.15;

    this.setCutoff(this._cutoff, ctx.currentTime);
    this.setResonance(this._res, ctx.currentTime);
  }

  connect(node) {
    this.output.connect(node);
  }

  setCutoff(freq, time = this.ctx.currentTime) {
    const t = Math.max(this.ctx.currentTime, time);
    const f = Math.max(80, Math.min(12000, Number(freq) || 2400));
    this._cutoff = f;

    const tc = 0.015;
    [this.stage1, this.stage2, this.stage3, this.stage4].forEach(s => {
      try {
        s.frequency.cancelScheduledValues(t);
        s.frequency.setTargetAtTime(f, t, tc);
      } catch {}
    });
  }

  setResonance(res01, time = this.ctx.currentTime) {
    const t = Math.max(this.ctx.currentTime, time);
    const r = Math.max(0, Math.min(1, Number(res01) || 0));
    this._res = r;

    // CAP important : au-delà, ça part vite en instabilité / CPU
    const fb = Math.min(0.55, r * 0.45);

    try {
      this.feedback.gain.cancelScheduledValues(t);
      this.feedback.gain.setTargetAtTime(fb, t, 0.02);
    } catch {}
  }

  rampCutoff(targetFreq, durSec = 0.01, startTime = this.ctx.currentTime) {
    const t0 = Math.max(this.ctx.currentTime, startTime);
    const t1 = t0 + Math.max(0.001, durSec);
    const f = Math.max(80, Math.min(12000, Number(targetFreq) || this._cutoff));

    [this.stage1, this.stage2, this.stage3, this.stage4].forEach(s => {
      try {
        s.frequency.cancelScheduledValues(t0);
        s.frequency.setValueAtTime(s.frequency.value, t0);
        s.frequency.linearRampToValueAtTime(f, t1);
      } catch {}
    });
  }

  _driveCurve() {
    const n = 512;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / (n - 1) - 1;
      curve[i] = Math.tanh(x * 1.4);
    }
    return curve;
  }
}
