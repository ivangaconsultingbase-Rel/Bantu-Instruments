export class Compressor {
  constructor(ctx){
    this.ctx = ctx;

    // Placeholder: native dynamics compressor.
    // Replace with Squeezer DSP via AudioWorklet/WASM later.
    this.input = ctx.createDynamicsCompressor();
    this.output = this.input;

    this._amount = 0.25;
    this._apply();
  }

  setAmount(v01){
    this._amount = Math.max(0, Math.min(1, Number(v01)||0));
    this._apply();
  }

  _apply(){
    const a = this._amount;
    // map to sensible ranges
    this.input.threshold.value = -10 - a*22; // -10..-32
    this.input.ratio.value = 2 + a*10;       // 2..12
    this.input.attack.value = 0.002 + a*0.01;
    this.input.release.value = 0.12 + a*0.25;
  }

  connect(node){
    this.output.connect(node);
  }
}
