export class Voice {

  constructor(ctx) {

    this.ctx = ctx;

    this.note = null;

    // OSCILLATORS

    this.saw = ctx.createOscillator();
    this.pulse = ctx.createOscillator();
    this.sub = ctx.createOscillator();

    this.noise = ctx.createBufferSource();

    // GAINS

    this.sawGain = ctx.createGain();
    this.pulseGain = ctx.createGain();
    this.subGain = ctx.createGain();
    this.noiseGain = ctx.createGain();

    this.vca = ctx.createGain();

    // default mix

    this.sawGain.gain.value = 0.6;
    this.pulseGain.gain.value = 0.4;
    this.subGain.gain.value = 0.5;
    this.noiseGain.gain.value = 0.1;

    this.vca.gain.value = 0;

    // oscillator types

    this.saw.type = "sawtooth";
    this.pulse.type = "square";
    this.sub.type = "square";

    // routing

    this.saw.connect(this.sawGain);
    this.pulse.connect(this.pulseGain);
    this.sub.connect(this.subGain);
    this.noise.connect(this.noiseGain);

    this.sawGain.connect(this.vca);
    this.pulseGain.connect(this.vca);
    this.subGain.connect(this.vca);
    this.noiseGain.connect(this.vca);

    // start oscillators

    this.saw.start();
    this.pulse.start();
    this.sub.start();

    this.initNoise();

  }

  connect(dest) {
    this.vca.connect(dest);
  }

  initNoise() {

    const bufferSize = this.ctx.sampleRate * 2;

    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);

    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    this.noise.buffer = buffer;
    this.noise.loop = true;
    this.noise.start();

  }

  noteOn(note, velocity = 1) {

    this.note = note;

    const freq = 440 * Math.pow(2, (note - 69) / 12);

    const now = this.ctx.currentTime;

    this.saw.frequency.setValueAtTime(freq, now);
    this.pulse.frequency.setValueAtTime(freq, now);
    this.sub.frequency.setValueAtTime(freq / 2, now);

    // envelope

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
      now + 0.25
    );

  }

}
