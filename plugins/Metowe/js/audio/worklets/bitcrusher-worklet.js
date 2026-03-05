class BitCrusherProcessor extends AudioWorkletProcessor {

  static get parameterDescriptors() {
    return [

      { name: "bits", defaultValue: 12, minValue: 1, maxValue: 16 },

      { name: "rate", defaultValue: 1, minValue: 0.01, maxValue: 1 },

      { name: "mix", defaultValue: 0.5, minValue: 0, maxValue: 1 }

    ];
  }

  constructor() {

    super();

    this.phase = 0;
    this.lastSampleL = 0;
    this.lastSampleR = 0;

  }

  process(inputs, outputs, parameters) {

    const input = inputs[0];
    const output = outputs[0];

    if (!input.length) return true;

    const inL = input[0];
    const inR = input[1] || input[0];

    const outL = output[0];
    const outR = output[1];

    const bits = parameters.bits[0];
    const rate = parameters.rate[0];
    const mix = parameters.mix[0];

    const step = Math.pow(0.5, bits);

    for (let i = 0; i < inL.length; i++) {

      this.phase += rate;

      if (this.phase >= 1) {

        this.phase -= 1;

        this.lastSampleL = step * Math.floor(inL[i] / step + 0.5);
        this.lastSampleR = step * Math.floor(inR[i] / step + 0.5);

      }

      outL[i] =
        inL[i] * (1 - mix) +
        this.lastSampleL * mix;

      outR[i] =
        inR[i] * (1 - mix) +
        this.lastSampleR * mix;

    }

    return true;
  }

}

registerProcessor("bitcrusher", BitCrusherProcessor);
