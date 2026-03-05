// js/audio/worklets/fx/Chorus.js
// Simple stereo chorus: 2 modulated delay taps with feedback-less mix
// Original implementation (OK for GPL project)

const TAU = Math.PI * 2;

export class Chorus {
  constructor(sampleRate) {
    this.sr = sampleRate;

    // ring buffer (max delay 60ms)
    this.maxDelayMs = 60;
    this.bufLen = Math.ceil((this.maxDelayMs / 1000) * this.sr) + 2;
    this.bufL = new Float32Array(this.bufLen);
    this.bufR = new Float32Array(this.bufLen);
    this.w = 0;

    this.phase = 0;

    // params
    this.rateHz = 0.8;
    this.depthMs = 9;    // modulation depth
    this.baseMs = 14;    // base delay
    this.mix = 0.45;     // wet mix 0..1
    this.enabled = true;
  }

  set(rateHz, depthMs, mix01, enabled = true) {
    this.rateHz = Math.max(0.01, rateHz);
    this.depthMs = Math.max(0, depthMs);
    this.mix = Math.max(0, Math.min(1, mix01));
    this.enabled = !!enabled;
  }

  _read(buf, delaySamples) {
    // fractional delay read (linear interp)
    const len = this.bufLen;
    let r = this.w - delaySamples;
    while (r < 0) r += len;

    const i0 = r | 0;
    const i1 = (i0 + 1) % len;
    const frac = r - i0;

    return buf[i0] * (1 - frac) + buf[i1] * frac;
  }

  process(xL, xR) {
    // write input
    this.bufL[this.w] = xL;
    this.bufR[this.w] = xR;

    let yL = xL;
    let yR = xR;

    if (this.enabled && this.mix > 0) {
      // LFO
      const inc = this.rateHz / this.sr;
      this.phase += inc;
      if (this.phase >= 1) this.phase -= 1;

      // two out-of-phase LFOs
      const lfo1 = Math.sin(TAU * this.phase);
      const lfo2 = Math.sin(TAU * (this.phase + 0.25));

      const d1Ms = this.baseMs + this.depthMs * (0.5 + 0.5 * lfo1);
      const d2Ms = this.baseMs + this.depthMs * (0.5 + 0.5 * lfo2);

      const d1 = (d1Ms / 1000) * this.sr;
      const d2 = (d2Ms / 1000) * this.sr;

      // cross taps to widen stereo
      const wetL = 0.6 * this._read(this.bufL, d1) + 0.4 * this._read(this.bufR, d2);
      const wetR = 0.6 * this._read(this.bufR, d1) + 0.4 * this._read(this.bufL, d2);

      const wet = this.mix;
      const dry = 1 - wet;

      yL = dry * xL + wet * wetL;
      yR = dry * xR + wet * wetR;
    }

    // advance write head
    this.w = (this.w + 1) % this.bufLen;

    return [yL, yR];
  }
}
