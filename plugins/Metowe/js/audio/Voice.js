/**
 * Voice.js
 * Voix polyphonique inspirée Juno :
 * - SAW + PULSE (PWM) + SUB + NOISE
 * - DRIVE (soft clip) -> VCF -> VCA
 * - ADSR AMP + ADSR FILTER
 *
 * Notes:
 * - La PWM est faite en modulant detune du pulse (simple et efficace)
 * - Drive via WaveShaper tanh, amount contrôlable
 */

export class Voice {
  constructor(ctx) {
    this.ctx = ctx;
    this.note = null;

    // =========================
    // OSCILLATORS
    // =========================
    this.saw = ctx.createOscillator();
    this.saw.type = 'sawtooth';

    this.pulse = ctx.createOscillator();
    this.pulse.type = 'square';

    this.sub = ctx.createOscillator();
    this.sub.type = 'square';

    this.noise = this._createNoise();

    // =========================
    // MIX GAINS
    // =========================
    this.sawGain = ctx.createGain();
    this.pulseGain = ctx.createGain();
    this.subGain = ctx.createGain();
    this.noiseGain = ctx.createGain();

    // niveaux par défaut
    this.sawGain.gain.value = 0.65;
    this.pulseGain.gain.value = 0.55;
    this.subGain.gain.value = 0.35;
    this.noiseGain.gain.value = 0.04;

    // =========================
    // PWM
    // =========================
    this.pwmGain = ctx.createGain();
    this.pwmGain.gain.value = 120; // cents of detune modulation depth
    this.pwmGain.connect(this.pulse.detune);

    // =========================
    // DRIVE (soft clip)
    // =========================
    this.drive = ctx.createWaveShaper();
    this.drive.oversample = '2x';
    this.driveAmount = 2.0;
    this.drive.curve = this.makeDriveCurve(this.driveAmount);

    // =========================
    // FILTER (VCF)
    // =========================
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 9000;
    this.filter.Q.value = 0.8;

    // base cutoff (pour env filter)
    this.baseCutoff = 9000;

    // =========================
    // AMP (VCA)
    // =========================
    this.amp = ctx.createGain();
    this.amp.gain.value = 0;

    // =========================
    // ENVELOPES
    // =========================
    this.ampEnv = { attack: 0.01, decay: 0.14, sustain: 0.72, release: 0.25 };
    this.filtEnv = { attack: 0.01, decay: 0.16, sustain: 0.35, release: 0.22 };

    // amount en Hz ajouté au cutoff
    this.filterEnvAmount = 2500;

    // =========================
    // ROUTING
    // =========================
    this.saw.connect(this.sawGain);
    this.pulse.connect(this.pulseGain);
    this.sub.connect(this.subGain);
    this.noise.connect(this.noiseGain);

    // vers DRIVE
    this.sawGain.connect(this.drive);
    this.pulseGain.connect(this.drive);
    this.subGain.connect(this.drive);
    this.noiseGain.connect(this.drive);

    // drive -> filter -> amp
    this.drive.connect(this.filter);
    this.filter.connect(this.amp);

    // =========================
    // START OSC
    // =========================
    this.saw.start();
    this.pulse.start();
    this.sub.start();
  }

  // =========================
  // UTIL
  // =========================
  midiToFreq(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
  }

  // bruit loop
  _createNoise() {
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.start();
    return src;
  }

  // soft clipping curve
  makeDriveCurve(amount = 2) {
    const n = 44100;
    const curve = new Float32Array(n);
    const a = Math.max(0, Number(amount) || 0);

    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      // tanh: soft clip
      curve[i] = Math.tanh(a * x);
    }
    return curve;
  }

  setDrive(amount) {
    this.driveAmount = Math.max(0, Number(amount) || 0);
    this.drive.curve = this.makeDriveCurve(this.driveAmount);
  }

  // =========================
  // NOTE ON / OFF
  // =========================
  noteOn(note, velocity = 1) {
    const now = this.ctx.currentTime;
    this.note = note;

    const freq = this.midiToFreq(note);

    this.saw.frequency.setValueAtTime(freq, now);
    this.pulse.frequency.setValueAtTime(freq, now);
    this.sub.frequency.setValueAtTime(freq / 2, now);

    // ----- FILTER ENV -----
    const base = this.baseCutoff;
    const peak = Math.max(20, base + this.filterEnvAmount);
    const sus = Math.max(20, base + this.filterEnvAmount * this.filtEnv.sustain);

    this.filter.frequency.cancelScheduledValues(now);
    this.filter.frequency.setValueAtTime(base, now);

    this.filter.frequency.linearRampToValueAtTime(peak, now + this.filtEnv.attack);
    this.filter.frequency.linearRampToValueAtTime(sus, now + this.filtEnv.attack + this.filtEnv.decay);

    // ----- AMP ENV -----
    const vel = Math.max(0, Math.min(1, Number(velocity) || 0));

    this.amp.gain.cancelScheduledValues(now);
    this.amp.gain.setValueAtTime(0.0001, now);

    this.amp.gain.linearRampToValueAtTime(vel, now + this.ampEnv.attack);
    this.amp.gain.linearRampToValueAtTime(
      vel * this.ampEnv.sustain,
      now + this.ampEnv.attack + this.ampEnv.decay
    );
  }

  noteOff() {
    const now = this.ctx.currentTime;

    // AMP release
    this.amp.gain.cancelScheduledValues(now);
    this.amp.gain.setValueAtTime(this.amp.gain.value, now);
    this.amp.gain.linearRampToValueAtTime(0.0001, now + this.ampEnv.release);

    // FILTER release back to base
    this.filter.frequency.cancelScheduledValues(now);
    this.filter.frequency.setValueAtTime(this.filter.frequency.value, now);
    this.filter.frequency.linearRampToValueAtTime(this.baseCutoff, now + this.filtEnv.release);
  }

  // =========================
  // CONNECTIONS
  // =========================
  connect(destination) {
    this.amp.connect(destination);
  }

  disconnect() {
    try { this.amp.disconnect(); } catch {}
  }

  // =========================
  // MOD CONNECTORS
  // =========================
  connectPWM(lfoSignal) {
    // lfoSignal: AudioNode
    lfoSignal.connect(this.pwmGain);
  }

  connectPitchLFO(lfoSignal) {
    lfoSignal.connect(this.saw.detune);
    lfoSignal.connect(this.pulse.detune);
  }

  connectFilterLFO(lfoSignal) {
    // ATTENTION: pour moduler cutoff via AudioParam,
    // mieux vaut passer par un GainNode, mais ok si ton LFO est déjà scaled.
    lfoSignal.connect(this.filter.frequency);
  }
}
