/**
 * Voice.js
 * Architecture inspirée Juno
 *
 * SAW
 * PULSE + PWM
 * SUB
 * NOISE
 * ↓
 * MIX
 * ↓
 * VCF + ENV
 * ↓
 * VCA + ENV
 */

export class Voice {

  constructor(ctx) {

    this.ctx = ctx;
    this.note = null;

    /* -------------------------
       OSCILLATORS
    ------------------------- */

    this.saw = ctx.createOscillator();
    this.saw.type = "sawtooth";

    this.pulse = ctx.createOscillator();
    this.pulse.type = "square";

    this.sub = ctx.createOscillator();
    this.sub.type = "square";

    this.noise = this.createNoise();


    /* -------------------------
       MIXER
    ------------------------- */

    this.sawGain = ctx.createGain();
    this.pulseGain = ctx.createGain();
    this.subGain = ctx.createGain();
    this.noiseGain = ctx.createGain();

    this.sawGain.gain.value = 0.6;
    this.pulseGain.gain.value = 0.5;
    this.subGain.gain.value = 0.35;
    this.noiseGain.gain.value = 0.05;


    /* -------------------------
       PWM
    ------------------------- */

    this.pwmGain = ctx.createGain();
    this.pwmGain.gain.value = 120;

    this.pwmGain.connect(this.pulse.detune);


    /* -------------------------
       FILTER
    ------------------------- */

    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 12000;
    this.filter.Q.value = 0.8;


    /* -------------------------
       AMP
    ------------------------- */

    this.amp = ctx.createGain();
    this.amp.gain.value = 0;


    /* -------------------------
       ROUTING
    ------------------------- */

    this.saw.connect(this.sawGain);
    this.pulse.connect(this.pulseGain);
    this.sub.connect(this.subGain);
    this.noise.connect(this.noiseGain);

    this.sawGain.connect(this.filter);
    this.pulseGain.connect(this.filter);
    this.subGain.connect(this.filter);
    this.noiseGain.connect(this.filter);

    this.filter.connect(this.amp);


    /* -------------------------
       ENVELOPES
    ------------------------- */

    this.env = {
      attack: 0.01,
      decay: 0.15,
      sustain: 0.7,
      release: 0.25
    };

    this.filterEnvAmount = 2500;


    /* -------------------------
       START OSC
    ------------------------- */

    this.saw.start();
    this.pulse.start();
    this.sub.start();

  }


  /* =========================
     NOISE GENERATOR
  ========================= */

  createNoise() {

    const bufferSize = this.ctx.sampleRate * 2;

    const buffer = this.ctx.createBuffer(
      1,
      bufferSize,
      this.ctx.sampleRate
    );

    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    noise.start();

    return noise;

  }


  /* =========================
     MIDI -> FREQUENCY
  ========================= */

  midiToFreq(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
  }


  /* =========================
     NOTE ON
  ========================= */

  noteOn(note, velocity = 1) {

    const now = this.ctx.currentTime;

    this.note = note;

    const freq = this.midiToFreq(note);

    this.saw.frequency.setValueAtTime(freq, now);
    this.pulse.frequency.setValueAtTime(freq, now);
    this.sub.frequency.setValueAtTime(freq / 2, now);


    /* ---------- FILTER ENV ---------- */

    const baseCutoff = this.filter.frequency.value;

    this.filter.frequency.cancelScheduledValues(now);

    this.filter.frequency.setValueAtTime(baseCutoff, now);

    this.filter.frequency.linearRampToValueAtTime(
      baseCutoff + this.filterEnvAmount,
      now + this.env.attack
    );

    this.filter.frequency.linearRampToValueAtTime(
      baseCutoff + (this.filterEnvAmount * this.env.sustain),
      now + this.env.attack + this.env.decay
    );


    /* ---------- AMP ENV ---------- */

    this.amp.gain.cancelScheduledValues(now);

    this.amp.gain.setValueAtTime(0, now);

    this.amp.gain.linearRampToValueAtTime(
      velocity,
      now + this.env.attack
    );

    this.amp.gain.linearRampToValueAtTime(
      velocity * this.env.sustain,
      now + this.env.attack + this.env.decay
    );

  }


  /* =========================
     NOTE OFF
  ========================= */

  noteOff() {

    const now = this.ctx.currentTime;

    this.amp.gain.cancelScheduledValues(now);

    this.amp.gain.setValueAtTime(
      this.amp.gain.value,
      now
    );

    this.amp.gain.linearRampToValueAtTime(
      0,
      now + this.env.release
    );

  }


  /* =========================
     CONNECT
  ========================= */

  connect(destination) {
    this.amp.connect(destination);
  }


  /* =========================
     LFO MODULATION
  ========================= */

  connectPWM(source) {
    source.connect(this.pwmGain);
  }

  connectFilterLFO(source) {
    source.connect(this.filter.frequency);
  }

  connectPitchLFO(source) {
    source.connect(this.saw.detune);
    source.connect(this.pulse.detune);
  }

}
