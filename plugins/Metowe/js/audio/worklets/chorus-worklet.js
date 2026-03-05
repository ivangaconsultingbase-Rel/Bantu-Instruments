/**
 * Juno Style Chorus
 * AudioWorkletProcessor
 */

class JunoChorus extends AudioWorkletProcessor {

  static get parameterDescriptors() {
    return [

      { name: "rate", defaultValue: 0.35, minValue: 0.05, maxValue: 5 },
      { name: "depth", defaultValue: 0.003, minValue: 0, maxValue: 0.02 },
      { name: "mix", defaultValue: 0.5, minValue: 0, maxValue: 1 }

    ];
  }

  constructor() {

    super();

    this.phase = 0;

    this.bufferSize = 44100;
    this.bufferL = new Float32Array(this.bufferSize);
    this.bufferR = new Float32Array(this.bufferSize);

    this.writeIndex = 0;

  }

  process(inputs, outputs, parameters) {

    const input = inputs[0];
    const output = outputs[0];

    if (!input.length) return true;

    const inL = input[0];
    const inR = input[1] || input[0];

    const outL = output[0];
    const outR = output[1];

    const rate = parameters.rate[0];
    const depth = parameters.depth[0];
    const mix = parameters.mix[0];

    for (let i = 0; i < inL.length; i++) {

      const lfo = Math.sin(this.phase);

      const delay = 200 + (lfo * depth * 44100);

      const readIndex =
        (this.writeIndex - delay + this.bufferSize) % this.bufferSize;

      const delayedL = this.bufferL[Math.floor(readIndex)];
      const delayedR = this.bufferR[Math.floor(readIndex)];

      this.bufferL[this.writeIndex] = inL[i];
      this.bufferR[this.writeIndex] = inR[i];

      outL[i] = inL[i] * (1 - mix) + delayedL * mix;
      outR[i] = inR[i] * (1 - mix) + delayedR * mix;

      this.writeIndex = (this.writeIndex + 1) % this.bufferSize;

      this.phase += rate / sampleRate;

      if (this.phase > 2 * Math.PI)
        this.phase -= 2 * Math.PI;

    }

    return true;
  }
}

registerProcessor("juno-chorus", JunoChorus);
