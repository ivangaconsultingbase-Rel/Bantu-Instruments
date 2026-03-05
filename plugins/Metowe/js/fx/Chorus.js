export class Chorus {
  constructor(ctx){
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();

    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    this.dry.gain.value = 0.75;
    this.wet.gain.value = 0.25;

    this.delay = ctx.createDelay();
    this.delay.delayTime.value = 0.018;

    this.lfo = ctx.createOscillator();
    this.lfo.frequency.value = 0.25;

    this.depth = ctx.createGain();
    this.depth.gain.value = 0.004;

    this.lfo.connect(this.depth);
    this.depth.connect(this.delay.delayTime);

    this.input.connect(this.dry);
    this.input.connect(this.delay);

    this.delay.connect(this.wet);

    this.dry.connect(this.output);
    this.wet.connect(this.output);

    this.lfo.start();
  }

  setMix(v01){
    const v = Math.max(0, Math.min(1, Number(v01)||0));
    this.wet.gain.value = v;
    this.dry.gain.value = 1 - 0.7*v;
  }

  connect(node){
    this.output.connect(node);
  }
}
