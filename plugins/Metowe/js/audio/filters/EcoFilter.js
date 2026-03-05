// js/audio/filters/EcoFilter.js
export class EcoFilter {
  constructor(ctx) {
    this.ctx = ctx;

    this.input = ctx.createGain();
    this.output = ctx.createGain();

    this.f = ctx.createBiquadFilter();
    this.f.type = "lowpass";

    this.input.connect(this.f);
    this.f.connect(this.output);

    this._cutoff = 2400;
    this._res = 0.15;

    this.setCutoff(this._cutoff, ctx.currentTime);
    this.setResonance(this._res, ctx.currentTime);
  }

  connect(node) {
    this.output.connect(node);
  }

  // “cutoff perceptuel” : on garde l’échelle Hz, mais on smooth et on limite proprement
  setCutoff(freq, time = this.ctx.currentTime) {
    const t = Math.max(this.ctx.currentTime, time);
    const f = Math.max(60, Math.min(16000, Number(freq) || 2400));
    this._cutoff = f;

    try {
      this.f.frequency.cancelScheduledValues(t);
      this.f.frequency.setTargetAtTime(f, t, 0.015);
    } catch {}
  }

  setResonance(res01, time = this.ctx.currentTime) {
    const t = Math.max(this.ctx.currentTime, time);
    const r = Math.max(0, Math.min(1, Number(res01) || 0));
    this._res = r;

    // stable & light: Q raisonnable
    const q = 0.7 + r * 10.0;

    try {
      this.f.Q.cancelScheduledValues(t);
      this.f.Q.setTargetAtTime(q, t, 0.02);
    } catch {}
  }

  // ramp linéaire sur la timeline (utile pour envelope)
  rampCutoff(targetFreq, durSec = 0.01, startTime = this.ctx.currentTime) {
    const t0 = Math.max(this.ctx.currentTime, startTime);
    const t1 = t0 + Math.max(0.001, durSec);
    const f = Math.max(60, Math.min(16000, Number(targetFreq) || this._cutoff));

    try {
      // on part de la valeur courante (au mieux)
      this.f.frequency.cancelScheduledValues(t0);
      this.f.frequency.setValueAtTime(this.f.frequency.value, t0);
      this.f.frequency.linearRampToValueAtTime(f, t1);
    } catch {}
  }
}
