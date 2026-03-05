export class Reverb {
  constructor(ctx){
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();

    this.dry = ctx.createGain();
    this.wet = ctx.createGain();

    this.conv = ctx.createConvolver();
    this.conv.buffer = this._impulse(1.8);

    this.input.connect(this.dry);
    this.input.connect(this.conv);
    this.conv.connect(this.wet);

    this.dry.connect(this.output);
    this.wet.connect(this.output);

    this.setMix(0.18);
  }

  setMix(v01){
    const v = Math.max(0, Math.min(1, Number(v01)||0));
    this.wet.gain.value = v;
    this.dry.gain.value = 1 - 0.7*v;
  }

  _impulse(seconds=2.0){
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * seconds);
    const buf = this.ctx.createBuffer(2, len, sr);
    for (let c=0;c<2;c++){
      const ch = buf.getChannelData(c);
      for (let i=0;i<len;i++){
        ch[i] = (Math.random()*2-1) * Math.pow(1 - i/len, 2.2);
      }
    }
    return buf;
  }

  connect(node){
    this.output.connect(node);
  }
}
