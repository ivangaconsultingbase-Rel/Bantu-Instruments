export class Bitcrusher {
  constructor(ctx){
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();

    // For now: ScriptProcessor (works everywhere)
    // When you integrate "sound-of-music" DSP, replace by AudioWorklet.
    this.proc = ctx.createScriptProcessor(512, 1, 1);

    this._amount = 0; // 0..1
    let ph = 0, last = 0;

    this.proc.onaudioprocess = (e) => {
      const inp = e.inputBuffer.getChannelData(0);
      const out = e.outputBuffer.getChannelData(0);

      const amt = this._amount;
      const bits = Math.max(4, Math.round(16 - amt*12));   // 16..4
      const freq = Math.max(0.08, 1 - amt*0.92);           // 1..0.08
      const step = Math.pow(2, bits);

      for (let i=0;i<inp.length;i++){
        ph += freq;
        if (ph >= 1){
          ph -= 1;
          last = Math.round(inp[i]*step)/step;
        }
        out[i] = last;
      }
    };

    this.input.connect(this.proc);
    this.proc.connect(this.output);
  }

  setAmount(v01){
    this._amount = Math.max(0, Math.min(1, Number(v01)||0));
  }

  connect(node){
    this.output.connect(node);
  }
}
