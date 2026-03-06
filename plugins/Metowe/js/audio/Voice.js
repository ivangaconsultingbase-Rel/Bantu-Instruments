export class Voice {
  constructor(ctx, out, engine, midi, velocity, time, length){
    this.ctx = ctx;
    this.out = out;
    this.engine = engine;

    this.midi = midi;
    this.velocity = velocity;
    this.time = time;
    this.length = length;
  }

  mtof(n){
    return 440 * Math.pow(2, (n - 69) / 12);
  }

  start(){
    const e = this.engine;
    const ctx = this.ctx;
    const t0 = this.time;
    const tOff = t0 + Math.max(0.02, this.length);

    // OSC1
    const o1 = ctx.createOscillator();
    o1.type = e.osc1Type;
    o1.frequency.setValueAtTime(this.mtof(this.midi), t0);

    // OSC2 (detune)
    const o2 = ctx.createOscillator();
    o2.type = e.osc2Type;
    o2.frequency.setValueAtTime(this.mtof(this.midi), t0);
    o2.detune.setValueAtTime(e.detune, t0);

    // SUB (1 octave lower, square)
    const sub = ctx.createOscillator();
    sub.type = "square";
    sub.frequency.setValueAtTime(this.mtof(this.midi - 12), t0);

    // NOISE (looped buffer)
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = this._noiseBuffer(ctx);
    noiseSrc.loop = true;

    // mixer gains
    const g1 = ctx.createGain(); g1.gain.value = 0.60;
    const g2 = ctx.createGain(); g2.gain.value = 0.55;
    const gSub = ctx.createGain(); gSub.gain.value = e.subMix;
    const gNoise = ctx.createGain(); gNoise.gain.value = e.noiseMix;

    // filter
    const vcf = ctx.createBiquadFilter();
    vcf.type = "lowpass";
    vcf.Q.setValueAtTime(0.5 + e.res * 18, t0);

    // env -> VCF
    const baseCutoff = e.cutoff;
    const peakCutoff = Math.min(12000, baseCutoff * (1 + 2.2 * e.envAmt));

    vcf.frequency.setValueAtTime(baseCutoff, t0);
    vcf.frequency.linearRampToValueAtTime(peakCutoff, t0 + e.a);
    vcf.frequency.linearRampToValueAtTime(
      baseCutoff + (peakCutoff - baseCutoff) * e.s,
      t0 + e.a + e.d
    );
    vcf.frequency.setValueAtTime(
      baseCutoff + (peakCutoff - baseCutoff) * e.s,
      tOff
    );
    vcf.frequency.linearRampToValueAtTime(baseCutoff, tOff + e.r);

    // amp env
    const vca = ctx.createGain();
    const vel = this.velocity;
    vca.gain.setValueAtTime(0.0001, t0);
    vca.gain.linearRampToValueAtTime(vel, t0 + e.a);
    vca.gain.linearRampToValueAtTime(Math.max(0.0001, vel * e.s), t0 + e.a + e.d);
    vca.gain.setValueAtTime(Math.max(0.0001, vel * e.s), tOff);
    vca.gain.linearRampToValueAtTime(0.0001, tOff + e.r);

    // route
    o1.connect(g1); o2.connect(g2);
    sub.connect(gSub);
    noiseSrc.connect(gNoise);

    g1.connect(vcf);
    g2.connect(vcf);
    gSub.connect(vcf);
    gNoise.connect(vcf);

    vcf.connect(vca);
    vca.connect(this.out);

    // start/stop
    o1.start(t0); o2.start(t0);
    sub.start(t0);
    noiseSrc.start(t0);

    const stopAt = tOff + e.r + 0.05;
    o1.stop(stopAt); o2.stop(stopAt);
    sub.stop(stopAt);
    noiseSrc.stop(stopAt);
  }

  _noiseBuffer(ctx){
    // simple cached white noise buffer
    if (ctx.__noiseBuf) return ctx.__noiseBuf;
    const len = ctx.sampleRate * 1.0;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i=0;i<len;i++) ch[i] = (Math.random()*2-1) * 0.5;
    ctx.__noiseBuf = buf;
    return buf;
  }
}
