// macro-osc.worklet.js  (100% JS, pas de build)
// Mono macro oscillator for WebAudio AudioWorklet

class MacroOscProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "mode", defaultValue: 0 },         // 0..4
      { name: "freq", defaultValue: 440 },       // Hz
      { name: "gain", defaultValue: 0.8 },       // 0..1
      { name: "pw", defaultValue: 0.5 },         // 0.05..0.95 (pulse width)
      { name: "detune", defaultValue: 0.15 },    // supersaw amount 0..1
      { name: "fm", defaultValue: 0.0 },         // FM index 0..1
      { name: "timbre", defaultValue: 0.5 },     // generic timbre 0..1
    ];
  }

  constructor() {
    super();
    this.phase = 0;
    this.phase2 = 0;
    this.lastOut = 0;

    // supersaw phases
    this.sawPh = new Float32Array(7);
    for (let i = 0; i < 7; i++) this.sawPh[i] = Math.random();

    // simple DC blocker
    this.dc_x1 = 0; this.dc_y1 = 0;

    this.port.onmessage = (e) => {
      if (e.data?.reset) {
        this.phase = 0; this.phase2 = 0;
        for (let i = 0; i < 7; i++) this.sawPh[i] = 0;
      }
    };
  }

  // PolyBLEP helper
  polyBlep(t, dt) {
    if (t < dt) {
      t /= dt;
      return t + t - t*t - 1.0;
    }
    if (t > 1.0 - dt) {
      t = (t - 1.0) / dt;
      return t*t + t + t + 1.0;
    }
    return 0.0;
  }

  // Band-limited saw
  blSaw(phase, dt) {
    let y = 2.0 * phase - 1.0;
    y -= this.polyBlep(phase, dt);
    return y;
  }

  // Band-limited pulse
  blPulse(phase, dt, pw) {
    let y = phase < pw ? 1.0 : -1.0;
    y += this.polyBlep(phase, dt);
    let t2 = (phase - pw);
    if (t2 < 0) t2 += 1.0;
    y -= this.polyBlep(t2, dt);
    return y;
  }

  // soft clip
  softClip(x) {
    // tanh-ish cheap
    const a = 1.5;
    return x / (1 + a * Math.abs(x));
  }

  dcBlock(x) {
    // y[n] = x[n] - x[n-1] + R*y[n-1]
    const R = 0.995;
    const y = x - this.dc_x1 + R * this.dc_y1;
    this.dc_x1 = x;
    this.dc_y1 = y;
    return y;
  }

  process(_inputs, outputs, parameters) {
    const out = outputs[0][0];
    const sr = sampleRate;
    for (let i = 0; i < out.length; i++) {
      const mode = Math.max(0, Math.min(4, Math.floor(parameters.mode.length > 1 ? parameters.mode[i] : parameters.mode[0])));
      const freq = parameters.freq.length > 1 ? parameters.freq[i] : parameters.freq[0];
      const gain = parameters.gain.length > 1 ? parameters.gain[i] : parameters.gain[0];
      const pw0 = parameters.pw.length > 1 ? parameters.pw[i] : parameters.pw[0];
      const det = parameters.detune.length > 1 ? parameters.detune[i] : parameters.detune[0];
      const fm = parameters.fm.length > 1 ? parameters.fm[i] : parameters.fm[0];
      const timbre = parameters.timbre.length > 1 ? parameters.timbre[i] : parameters.timbre[0];

      const f = Math.max(1, Math.min(freq, sr * 0.45));
      const dt = f / sr;

      let y = 0;

      // advance phase
      this.phase += dt;
      if (this.phase >= 1) this.phase -= 1;

      if (mode === 0) {
        // VA Saw (band-limited)
        y = this.blSaw(this.phase, dt);
      } else if (mode === 1) {
        // VA PWM Pulse (band-limited)
        const pw = Math.max(0.05, Math.min(0.95, pw0));
        y = this.blPulse(this.phase, dt, pw);
      } else if (mode === 2) {
        // SuperSaw (7 detuned band-limited saw)
        const spread = 0.003 + det * 0.02; // detune depth
        const detunes = [-3, -2, -1, 0, 1, 2, 3];
        let s = 0;
        for (let k = 0; k < 7; k++) {
          const df = f * (1 + detunes[k] * spread);
          const dtk = df / sr;
          this.sawPh[k] += dtk;
          if (this.sawPh[k] >= 1) this.sawPh[k] -= 1;
          s += this.blSaw(this.sawPh[k], dtk);
        }
        y = s / 7;
      } else if (mode === 3) {
        // FM 2-op (carrier modulated by mod osc)
        const ratio = 0.5 + timbre * 6.0; // 0.5..6.5
        const modF = Math.max(1, Math.min(f * ratio, sr * 0.45));
        const dt2 = modF / sr;

        this.phase2 += dt2;
        if (this.phase2 >= 1) this.phase2 -= 1;

        const mod = Math.sin(2 * Math.PI * this.phase2);
        const idx = fm * (2.0 + 10.0 * timbre); // index
        const carPhase = this.phase + (mod * idx) * dt; // phase modulation
        const p = carPhase - Math.floor(carPhase);
        y = Math.sin(2 * Math.PI * p);
        y = this.softClip(y * (1 + fm * 2));
      } else {
        // Phase Distortion + mild fold
        // PD: distort sine phase with timbre
        const a = 0.05 + timbre * 0.9;
        let p = this.phase;
        // non-linear phase warp
        p = p < a ? (p / a) * 0.5 : 0.5 + ((p - a) / (1 - a)) * 0.5;
        y = Math.sin(2 * Math.PI * p);
        // fold amount from fm
        const fold = 1 + fm * 6;
        let z = y * fold;
        // triangle fold
        z = 2 * (z - Math.floor(z + 0.5));
        y = this.softClip(z);
      }

      y = this.dcBlock(y);
      out[i] = y * gain;
    }
    return true;
  }
}

registerProcessor("macro-osc", MacroOscProcessor);
