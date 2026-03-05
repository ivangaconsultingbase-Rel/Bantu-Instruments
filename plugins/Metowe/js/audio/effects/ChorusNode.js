/**
 * ChorusNode
 * Wrapper pour AudioWorklet Chorus (StoneMistress style)
 */

export class ChorusNode {

  constructor(ctx) {

    this.ctx = ctx;

    this.node = new AudioWorkletNode(ctx, "juno-chorus", {
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

  setRate(value) {
    this.node.parameters.get("rate").setValueAtTime(value, this.ctx.currentTime);
  }

  setDepth(value) {
    this.node.parameters.get("depth").setValueAtTime(value, this.ctx.currentTime);
  }

  setMix(value) {
    this.node.parameters.get("mix").setValueAtTime(value, this.ctx.currentTime);
  }

}
