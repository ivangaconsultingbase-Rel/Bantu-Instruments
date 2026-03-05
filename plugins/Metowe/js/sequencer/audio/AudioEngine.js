// js/audio/AudioEngine.js
// WebAudio + AudioWorklet synth engine (poly)
// - noteOn(time, midi, vel, gateSec, accent)
// - setParam(name, value)
// GPL project: keep THIRD_PARTY_NOTICES for any imported code later.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.node = null;
    this.isInitialized = false;
  }

  async init() {
    if (this.isInitialized) return;

    this.ctx = new (window.AudioContext || window.webkitAudioContext)({
      latencyHint: "interactive",
    });

    // Load worklet
    await this.ctx.audioWorklet.addModule("js/audio/worklets/SynthProcessor.js");

    // Create node
    this.node = new AudioWorkletNode(this.ctx, "akomga-synth", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2], // stereo
    });

    this.node.connect(this.ctx.destination);

    // Default params (safe)
    this.setParam("master", 0.9);
    this.setParam("cutoff", 2200);
    this.setParam("res", 0.12);      // soft resonance (MVP)
    this.setParam("envAmt", 1200);   // filter env amount (Hz)
    this.setParam("attack", 0.008);
    this.setParam("decay", 0.14);
    this.setParam("sustain", 0.55);
    this.setParam("release", 0.12);

    this.setParam("waveMix", 0.65);  // 0..1 (saw->pulse)
    this.setParam("pulseWidth", 0.55);
    this.setParam("sub", 0.25);
    this.setParam("noise", 0.03);

    // LFO
    this.setParam("lfoRate", 0.6);
    this.setParam("lfoToPitch", 0.0);
    this.setParam("lfoToCutoff", 0.12);
    this.setParam("lfoToPW", 0.10);

    this.isInitialized = true;
  }

  resume() {
    try {
      if (this.ctx && this.ctx.state !== "running") {
        return this.ctx.resume();
      }
    } catch {}
    return Promise.resolve();
  }

  getCurrentTime() {
    return this.ctx?.currentTime ?? 0;
  }

  /**
   * Schedule a note event
   * @param {number} time audio time (sec)
   * @param {number} midi 0..127
   * @param {number} vel 0..1
   * @param {number} gateSec duration in seconds
   * @param {boolean} accent accent boost
   */
  noteOn(time, midi, vel = 0.9, gateSec = 0.12, accent = false) {
    if (!this.node) return;
    this.node.port.postMessage({
      type: "noteOn",
      time,
      midi,
      vel: Math.max(0, Math.min(1, Number(vel))),
      gate: Math.max(0.01, Number(gateSec)),
      accent: !!accent,
    });
  }

  /**
   * Set synth param (processor side)
   */
  setParam(name, value) {
    if (!this.node) return;
    this.node.port.postMessage({ type: "param", name, value: Number(value) });
  }
}
