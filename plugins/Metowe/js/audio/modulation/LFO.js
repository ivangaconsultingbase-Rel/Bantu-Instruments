export class LFO {

  constructor(ctx) {

    this.ctx = ctx;

    this.osc = ctx.createOscillator();
    this.gain = ctx.createGain();

    this.osc.type = "triangle";
    this.osc.frequency.value = 3;

    this.gain.gain.value = 50;

    this.osc.connect(this.gain);

    this.osc.start();

  }

  connect(param) {
    this.gain.connect(param);
  }

  setRate(rate) {
    this.osc.frequency.setValueAtTime(
      rate,
      this.ctx.currentTime
    );
  }

  setDepth(depth) {
    this.gain.gain.setValueAtTime(
      depth,
      this.ctx.currentTime
    );
  }

}
