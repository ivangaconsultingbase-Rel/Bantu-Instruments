export class Distortion {
  constructor(ctx){
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();

    this.dry = ctx.createGain();
    this.wet = ctx.createGain();

    this.shaper = ctx.createWaveShaper();
    this._drive = 0.12;

    this.input.connect(this.dry);
    this.input.connect(this.shaper);
    this.shaper.connect(this.wet);

    this.dry.connect(this.output);
    this.wet.connect(this.output);

    this.setDrive(this._drive);
  }

  _curve(k){
    const n = 44100;
    const c = new Float32Array(n);
    for (let i=0;i<n;i++){
      const x = i*2/n - 1;
      c[i] = (1+k)*x/(1+k*Math.abs(x));
    }
    return c;
  }

  setDrive(v01){
    const v = Math.max(0, Math.min(1, Number(v01)||0));
    const k = 2 + v*18;
    this.shaper.curve = this._curve(k);
    this.wet.gain.value = v;
    this.dry.gain.value = 1 - 0.6*v;
  }

  connect(node){
    this.output.connect(node);
  }
}
