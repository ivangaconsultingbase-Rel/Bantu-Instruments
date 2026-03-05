export class BitCrusherNode {

  constructor(ctx) {

    this.ctx = ctx;

    this.node = new AudioWorkletNode(ctx, "bitcrusher", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2]
    });

    this.input = this.node;
    this.output = this.node;

  }

  connect(dest) {
    this.output.connect(dest);
  }

  disconnect() {
    this.output.disconnect();
  }

  setBits(bits) {
    this.node.parameters.get("bits")
      .setValueAtTime(bits, this.ctx.currentTime);
  }

  setRate(rate) {
    this.node.parameters.get("rate")
      .setValueAtTime(rate, this.ctx.currentTime);
  }

  setMix(mix) {
    this.node.parameters.get("mix")
      .setValueAtTime(mix, this.ctx.currentTime);
  }

}
