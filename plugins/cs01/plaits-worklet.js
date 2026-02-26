/* global registerProcessor */

class PlaitsProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ready = false;

    // Synth state (mono)
    this.gate = 0;
    this.freq = 110;
    this.model = 0;     // engine/model index
    this.timbre = 0.5;
    this.morph = 0.5;
    this.harmonics = 0.5;
    this.level = 0.8;

    this._dsp = null;

    this.port.onmessage = async (e) => {
      const msg = e.data || {};
      if (msg.type === "load") {
        // msg.moduleUrl points to the wasm-pack JS glue
        const mod = await import(msg.moduleUrl);
        await mod.default(); // initializes wasm
        this._dsp = mod;     // expects exported functions you provide in Rust
        this._dsp.init(sampleRate);
        this.ready = true;
        this.port.postMessage({ type: "ready", sampleRate });
      }

      if (msg.type === "param") {
        const { name, value } = msg;
        if (name in this) this[name] = value;
      }

      if (msg.type === "noteOn") {
        this.freq = msg.freq;
        this.gate = 1;
      }

      if (msg.type === "noteOff") {
        this.gate = 0;
      }
    };
  }

  process(inputs, outputs) {
    const out = outputs[0];
    const L = out[0];
    const R = out[1] || out[0];

    // Safety: if not ready, output silence
    if (!this.ready || !this._dsp) {
      L.fill(0);
      R.fill(0);
      return true;
    }

    // Fill a mono buffer, then copy to stereo
    // Expect your wasm module to expose `renderBlock(...)` returning Float32Array
    // Example signature: renderBlock(frames, gate, freq, model, harmonics, timbre, morph, level)
    const mono = this._dsp.renderBlock(
      L.length,
      this.gate,
      this.freq,
      this.model,
      this.harmonics,
      this.timbre,
      this.morph,
      this.level
    );

    for (let i = 0; i < L.length; i++) {
      const s = mono[i] || 0;
      L[i] = s;
      R[i] = s;
    }
    return true;
  }
}

registerProcessor("plaits", PlaitsProcessor);
