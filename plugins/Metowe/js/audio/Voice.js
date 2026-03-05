export class Voice {

  constructor(ctx) {

    this.ctx = ctx;

    this.note = null;

    this.osc = ctx.createOscillator();

    this.vca = ctx.createGain();

    this.vca.gain.value = 0;

    this.osc.type = "sawtooth";

    this.osc.connect(this.vca);

    this.osc.start();

  }

  connect(dest) {
    this.vca.connect(dest);
  }

  noteOn(note, velocity) {

    this.note = note;

    const freq = 440 * Math.pow(2, (note - 69) / 12);

    this.osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

    const now = this.ctx.currentTime;

    this.vca.gain.cancelScheduledValues(now);
    this.vca.gain.setValueAtTime(0, now);
    this.vca.gain.linearRampToValueAtTime(velocity, now + 0.01);

  }

  noteOff() {

    const now = this.ctx.currentTime;

    this.vca.gain.cancelScheduledValues(now);
    this.vca.gain.linearRampToValueAtTime(0, now + 0.2);

  }

}
