export class JunoFilter {

  constructor(ctx) {

    this.ctx = ctx;

    this.filter = ctx.createBiquadFilter();

    this.filter.type = "lowpass";

    this.filter.frequency.value = 8000;
    this.filter.Q.value = 0.7;

    // envelope

    this.envAmount = 0.5;
    this.keyTrack = 0.4;

  }

  connect(dest) {
    this.filter.connect(dest);
  }

  get input() {
    return this.filter;
  }

  setCutoff(freq) {

    this.filter.frequency.setValueAtTime(
      freq,
      this.ctx.currentTime
    );

  }

  setResonance(value) {

    this.filter.Q.setValueAtTime(
      value,
      this.ctx.currentTime
    );

  }

  applyEnvelope(baseFreq, env) {

    const now = this.ctx.currentTime;

    this.filter.frequency.cancelScheduledValues(now);

    this.filter.frequency.setValueAtTime(baseFreq, now);

    this.filter.frequency.linearRampToValueAtTime(
      baseFreq + env * this.envAmount * baseFreq,
      now + 0.05
    );

  }

}
