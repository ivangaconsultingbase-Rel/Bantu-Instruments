// js/audio/AudioEngine.js
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

    // IMPORTANT: Chorus module is imported by SynthProcessor, so only add SynthProcessor
    await this.ctx.audioWorklet.addModule("js/audio/worklets/SynthProcessor.js");

    this.node = new AudioWorkletNode(this.ctx, "akomga-synth", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });

    this.node.connect(this.ctx.destination);

    // Defaults (match UI)
    this.setParam("master", 0.9);
    this.setParam("cutoff", 2200);
    this.setParam("res", 0.12);
    this.setParam("envAmt", 1200);

    this.setParam("attack", 0.008);
    this.setParam("decay", 0.14);
    this.setParam("sustain", 0.55);
    this.setParam("release", 0.12);

    this.setParam("waveMix", 0.65);
    this.setParam("pulseWidth", 0.55);
    this.setParam("sub", 0.25);
    this.setParam("noise", 0.03);

    this.setParam("lfoRate", 0.6);
    this.setParam("lfoToPitch", 0.0);
    this.setParam("lfoToCutoff", 0.12);
    this.setParam("lfoToPW", 0.10);

    // Chorus defaults
    this.setParam("chorusOn", 1);
    this.setParam("chorusRate", 0.8);
    this.setParam("chorusDepth", 9.0);
    this.setParam("chorusMix", 0.45);

    this.isInitialized = true;
  }

  resume() {
    try {
      if (this.ctx && this.ctx.state !== "running") return this.ctx.resume();
    } catch {}
    return Promise.resolve();
  }

  getCurrentTime() { return this.ctx?.currentTime ?? 0; }

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

  setParam(name, value) {
    if (!this.node) return;
    this.node.port.postMessage({ type: "param", name, value: Number(value) });
  }
}
