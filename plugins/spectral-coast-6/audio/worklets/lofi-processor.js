class LofiProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'bitDepth', defaultValue: 16, minValue: 4, maxValue: 16, automationRate: 'k-rate' },
      { name: 'downsample', defaultValue: 1, minValue: 1, maxValue: 24, automationRate: 'k-rate' },
      { name: 'mix', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'jitter', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }
  constructor() {
    super();
    this.phase = 0;
    this.lastL = 0;
    this.lastR = 0;
  }
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input.length) return true;
    const inL = input[0];
    const inR = input[1] || input[0];
    const outL = output[0];
    const outR = output[1] || output[0];
    const bitDepth = parameters.bitDepth[0];
    const dsBase = parameters.downsample[0];
    const mix = parameters.mix[0];
    const jitter = parameters.jitter[0];
    const steps = Math.pow(2, Math.max(1, bitDepth) - 1);

    for (let i = 0; i < outL.length; i++) {
      const localDs = Math.max(1, Math.floor(dsBase + (Math.random() - 0.5) * jitter * 4));
      if (this.phase++ % localDs === 0) {
        this.lastL = Math.round(inL[i] * steps) / steps;
        this.lastR = Math.round(inR[i] * steps) / steps;
      }
      outL[i] = inL[i] * (1 - mix) + this.lastL * mix;
      outR[i] = inR[i] * (1 - mix) + this.lastR * mix;
    }
    return true;
  }
}
registerProcessor('lofi-processor', LofiProcessor);
