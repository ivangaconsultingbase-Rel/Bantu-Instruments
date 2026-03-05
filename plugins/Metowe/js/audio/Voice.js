import { JunoFilter } from "./filters/JunoFilter.js";

export class Voice {

  constructor(ctx) {

    this.ctx = ctx;

    this.note = null;

    // oscillators

    this.saw = ctx.createOscillator();
    this.pulse = ctx.createOscillator();
    this.sub = ctx.createOscillator();

    this.saw.type = "sawtooth";
    this.pulse.type = "square";
    this.sub.type = "square";

    // noise

    this.noise = this.createNoise();

    // mixer

    this.sawGain = ctx.createGain();
    this.pulseGain = ctx.createGain();
    this.subGain = ctx.createGain();
    this.noiseGain = ctx.createGain();

    this.sawGain.gain.value = 0.6;
    this.pulseGain.gain.value = 0.4;
    this.subGain.gain.value = 0.5;
    this.noiseGain.gain.value = 0.1;

    // filter

    this.filter = new JunoFilter(ctx);

    // VCA

    this.vca = ctx.createGain();
    this.vca.gain.value = 0;

    // routing

    this.saw.connect(this.sawGain);
    this.pulse.connect(this.pulseGain);
    this.sub.connect(this.subGain);

    this.noise.connect(this.noiseGain);

    this.sawGain.connect(this.filter.input);
    this.pulseGain.connect(this.filter.input);
    this.subGain.connect(this.filter.input);
    this.noiseGain.connect(this.filter.input);

    this.filter.connect(this.vca);

    this.saw.start();
    this.pulse.start();
    this.sub.start();

  }

  connect(dest) {
    this.vca.connect(dest);
  }

  createNoise() {

    const buffer = this.ctx.createBuffer(
      1,
      this.ctx.sampleRate * 2,
      this.ctx.sampleRate
    );

    const data = buffer.getChannelData(0);

    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    src.start();

    return src;

  }

  noteOn(note, velocity = 1) {

    this.note = note;

    const freq = 440 * Math.pow(2, (note - 69) / 12);

    const now = this.ctx.currentTime;

    this.saw.frequency.setValueAtTime(freq, now);
    this.pulse.frequency.setValueAtTime(freq, now);
    this.sub.frequency.setValueAtTime(freq / 2, now);

    // filter envelope

    this.filter.applyEnvelope(1500, 1);

    // VCA envelope

    this.vca.gain.cancelScheduledValues(now);
    this.vca.gain.setValueAtTime(0, now);

    this.vca.gain.linearRampToValueAtTime(
      velocity,
      now + 0.01
    );

  }

  noteOff() {

    const now = this.ctx.currentTime;

    this.vca.gain.cancelScheduledValues(now);

    this.vca.gain.linearRampToValueAtTime(
      0,
      now + 0.3
    );

  }

}
