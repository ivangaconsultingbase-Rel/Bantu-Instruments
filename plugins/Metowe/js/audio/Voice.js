/**
 * Voice.js
 * Une voix du synthé (polyphonique)
 * Inspiré architecture Juno :
 *
 * DCO (saw + pulse PWM)
 * + SUB
 * + NOISE
 * ↓
 * MIX
 * ↓
 * VCF (lowpass)
 * ↓
 * VCA
 */

export class Voice {

  constructor(ctx) {

    this.ctx = ctx;

    this.note = null;

    /* -----------------------------
       Oscillateurs
    ----------------------------- */

    // SAW
    this.saw = ctx.createOscillator();
    this.saw.type = "sawtooth";

    // PULSE (PWM)
    this.pulse = ctx.createOscillator();
    this.pulse.type = "square";

    // SUB
    this.sub = ctx.createOscillator();
    this.sub.type = "square";

    // NOISE
    this.noise = this.createNoise();


    /* -----------------------------
       Gains oscillateurs
    ----------------------------- */

    this.sawGain = ctx.createGain();
    this.pulseGain = ctx.createGain();
    this.subGain = ctx.createGain();
    this.noiseGain = ctx.createGain();

    this.sawGain.gain.value = 0.6;
    this.pulseGain.gain.value = 0.5;
    this.subGain.gain.value = 0.4;
    this.noiseGain.gain.value = 0.05;


    /* -----------------------------
       PWM
    ----------------------------- */

    // modulation du duty cycle
    this.pwmGain = ctx.createGain();

    // profondeur PWM
    this.pwmGain.gain.value = 100;

    // PWM agit sur detune
    this.pwmGain.connect(this.pulse.detune);


    /* -----------------------------
       Mixer
    ----------------------------- */

    this.mixer = ctx.createGain();


    /* -----------------------------
       Filtre
    ----------------------------- */

    this.filter = ctx.createBiquadFilter();

    this.filter.type = "lowpass";
    this.filter.frequency.value = 12000;
    this.filter.Q.value = 0.7;


    /* -----------------------------
       Amplificateur
    ----------------------------- */

    this.amp = ctx.createGain();
    this.amp.gain.value = 0;


    /* -----------------------------
       Routing
    ----------------------------- */

    this.saw.connect(this.sawGain);
    this.pulse.connect(this.pulseGain);
    this.sub.connect(this.subGain);
    this.noise.connect(this.noiseGain);

    this.sawGain.connect(this.mixer);
    this.pulseGain.connect(this.mixer);
    this.subGain.connect(this.mixer);
    this.noiseGain.connect(this.mixer);

    this.mixer.connect(this.filter);
    this.filter.connect(this.amp);

    /* -----------------------------
       Start oscillators
    ----------------------------- */

    this.saw.start();
    this.pulse.start();
    this.sub.start();

  }


  /* ============================
     NOISE GENERATOR
  ============================ */

  createNoise() {

    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);

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


  /* ============================
     MIDI -> frequency
  ============================ */

  midiToFreq(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
  }


  /* ============================
     NOTE ON
  ============================ */

  noteOn(note, velocity = 1) {

    const now = this.ctx.currentTime;

    this.note = note;

    const freq = this.midiToFreq(note);

    this.saw.frequency.setValueAtTime(freq, now);
    this.pulse.frequency.setValueAtTime(freq, now);
    this.sub.frequency.setValueAtTime(freq / 2, now);

    // simple envelope
    this.amp.gain.cancelScheduledValues(now);
    this.amp.gain.setValueAtTime(0, now);
    this.amp.gain.linearRampToValueAtTime(velocity, now + 0.01);

  }


  /* ============================
     NOTE OFF
  ============================ */

  noteOff() {

    const now = this.ctx.currentTime;

    this.amp.gain.cancelScheduledValues(now);
    this.amp.gain.setValueAtTime(this.amp.gain.value, now);
    this.amp.gain.linearRampToValueAtTime(0, now + 0.2);

  }


  /* ============================
     CONNECTION
  ============================ */

  connect(destination) {
    this.amp.connect(destination);
  }


  /* ============================
     PWM CONTROL
  ============================ */

  connectPWM(source) {
    source.connect(this.pwmGain);
  }

}
