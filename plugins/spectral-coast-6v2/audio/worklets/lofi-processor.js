class LofiProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'bits', defaultValue: 12, minValue: 4, maxValue: 16, automationRate: 'k-rate' },
      { name: 'hold', defaultValue: 1, minValue: 1, maxValue: 32, automationRate: 'k-rate' },
      { name: 'jitter', defaultValue: 0, minValue: 0, maxValue: 0.2, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();
    this.phase = 0;
    this.last = [0, 0];
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input?.length) return true;

    const bits = parameters.bits[0] ?? 12;
    const hold = Math.max(1, Math.floor(parameters.hold[0] ?? 1));
    const jitter = parameters.jitter[0] ?? 0;
    const step = 1 / Math.pow(2, bits - 1);

    for (let ch = 0; ch < output.length; ch++) {
      const inCh = input[ch] || input[0];
      const outCh = output[ch];
      for (let i = 0; i < outCh.length; i++) {
        const localHold = Math.max(1, hold + Math.floor((Math.random() * 2 - 1) * jitter * 20));
        if (this.phase % localHold === 0) {
          this.last[ch] = Math.round((inCh[i] || 0) / step) * step;
        }
        outCh[i] = this.last[ch];
        this.phase++;
      }
    }
    return true;
  }
}

registerProcessor('lofi-processor', LofiProcessor);
