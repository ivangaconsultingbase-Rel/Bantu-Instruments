/**
 * AudioEngine.js
 * Poly synth + audible FX chain:
 * - Chorus (simple stereo mod delay)
 * - Drive (waveshaper)
 * - Bitcrusher (ScriptProcessor fallback)
 * - Reverb (simple convolver with generated impulse)
 * - Compressor (DynamicsCompressorNode)
 * - Mix control (dry/wet)
 * + Metronome click
 */

export class AudioEngine {
  constructor() {
    this.ctx = null;

    // master
    this.master = null;
    this.masterLevel = 0.90;

    // synth params
    this.waveform = 'SAW';  // SAW / PULSE / TRI
    this.cutoff = 2200;
    this.res = 0.12;
    this.envAmt = 1200;

    this.envA = 0.008;
    this.envD = 0.14;
    this.envS = 0.70;
    this.envR = 0.12;

    this.glideMs = 40;

    // metronome
    this.metronomeEnabled = false;
    this.metronomeLevel = 0.25;

    // FX params (0..1 mostly)
    this.chorusMix = 0.45;
    this.drive = 0.12;
    this.crush = 0.0;
    this.reverb = 0.18;
    this.comp = 0.25;
    this.fxMix = 0.35;

    // buses
    this._dryBus = null;
    this._wetBus = null;

    // chorus nodes
    this._chorusDry = null;
    this._chorusWet = null;
    this._chorusDelayL = null;
    this._chorusDelayR = null;
    this._chorusLFO = null;
    this._chorusLFOGainL = null;
    this._chorusLFOGainR = null;

    // drive
    this._driveNode = null;

    // crusher
    this._crusher = null;

    // reverb
    this._convolver = null;

    // compressor
    this._compressor = null;

    // for hold chord support (release previous chord)
    this._held = []; // array of {oscs, amp, filter}
  }

  async init() {
    if (this.ctx) return;

    this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    // master out
    this.master = this.ctx.createGain();
    this.master.gain.value = this.masterLevel;

    // dry/wet buses
    this._dryBus = this.ctx.createGain();
    this._wetBus = this.ctx.createGain();
    this._dryBus.gain.value = 1 - this.fxMix;
    this._wetBus.gain.value = this.fxMix;

    // -------- Chorus stage (sends to both dry and wet) --------
    this._chorusDry = this.ctx.createGain();
    this._chorusWet = this.ctx.createGain();
    this._chorusDry.gain.value = 1 - this.chorusMix;
    this._chorusWet.gain.value = this.chorusMix;

    this._chorusDelayL = this.ctx.createDelay(0.05);
    this._chorusDelayR = this.ctx.createDelay(0.05);
    this._chorusDelayL.delayTime.value = 0.012;
    this._chorusDelayR.delayTime.value = 0.017;

    const fbL = this.ctx.createGain(); fbL.gain.value = 0.08;
    const fbR = this.ctx.createGain(); fbR.gain.value = 0.08;
    this._chorusDelayL.connect(fbL).connect(this._chorusDelayL);
    this._chorusDelayR.connect(fbR).connect(this._chorusDelayR);

    this._chorusLFO = this.ctx.createOscillator();
    this._chorusLFO.type = 'sine';
    this._chorusLFO.frequency.value = 0.8;

    this._chorusLFOGainL = this.ctx.createGain();
    this._chorusLFOGainR = this.ctx.createGain();
    this._chorusLFOGainL.gain.value = 0.004;
    this._chorusLFOGainR.gain.value = 0.005;

    this._chorusLFO.connect(this._chorusLFOGainL).connect(this._chorusDelayL.delayTime);
    this._chorusLFO.connect(this._chorusLFOGainR).connect(this._chorusDelayR.delayTime);
    this._chorusLFO.start();

    // -------- Drive --------
    this._driveNode = this.ctx.createWaveShaper();
    this._driveNode.oversample = '2x';
    this._driveNode.curve = this._makeDriveCurve(this.drive);

    // -------- Crusher --------
    this._crusher = this._createBitCrusherNode();

    // -------- Reverb --------
    this._convolver = this.ctx.createConvolver();
    this._convolver.buffer = this._makeImpulseResponse(1.8, 2.2);

    // -------- Compressor --------
    this._compressor = this.ctx.createDynamicsCompressor();
    this._applyComp(this.comp);

    // Routing:
    // Voices -> chorusDry -> dryBus
    // Voices -> chorusWet delays -> wet FX chain -> wetBus
    this._chorusDry.connect(this._dryBus);

    // wet: delays -> drive -> crusher -> convolver -> compressor -> wetBus
    const wetSum = this.ctx.createGain();
    this._chorusDelayL.connect(wetSum);
    this._chorusDelayR.connect(wetSum);

    wetSum.connect(this._driveNode);
    this._driveNode.connect(this._crusher.input);
    this._crusher.output.connect(this._convolver);
    this._convolver.connect(this._compressor);
    this._compressor.connect(this._wetBus);

    // buses -> master
    this._dryBus.connect(this.master);
    this._wetBus.connect(this.master);
    this.master.connect(this.ctx.destination);

    // initial FX mix levels
    this._updateMix();
  }

  resume() {
    if (this.ctx?.state === 'suspended') return this.ctx.resume();
  }

  // ---------- setters ----------
  setWaveform(w) { this.waveform = (w || 'SAW').toUpperCase(); }

  setCutoff(v) { this.cutoff = Math.max(80, Math.min(12000, Number(v))); }
  setResonance(v) { this.res = Math.max(0, Math.min(0.95, Number(v))); }
  setEnvAmt(v) { this.envAmt = Math.max(0, Math.min(6000, Number(v))); }

  setEnvAttack(v) { this.envA = Math.max(0.001, Math.min(1.2, Number(v))); }
  setEnvDecay(v) { this.envD = Math.max(0.001, Math.min(1.5, Number(v))); }
  setEnvSustain(v) { this.envS = Math.max(0, Math.min(1, Number(v))); }
  setEnvRelease(v) { this.envR = Math.max(0.001, Math.min(2.0, Number(v))); }

  setGlide(ms) { this.glideMs = Math.max(0, Math.min(200, Number(ms))); }

  setMaster(level01) {
    this.masterLevel = Math.max(0, Math.min(1, Number(level01)));
    if (this.master) this.master.gain.value = this.masterLevel;
  }

  setChorusMix(mix01) {
    this.chorusMix = Math.max(0, Math.min(1, Number(mix01)));
    if (this._chorusDry && this._chorusWet) {
      this._chorusDry.gain.value = 1 - this.chorusMix;
      this._chorusWet.gain.value = this.chorusMix;
    }
  }

  setFxMix(v) { this.fxMix = Math.max(0, Math.min(1, Number(v))); this._updateMix(); }
  setDrive(v) { this.drive = Math.max(0, Math.min(1, Number(v))); if (this._driveNode) this._driveNode.curve = this._makeDriveCurve(this.drive); }
  setCrush(v) { this.crush = Math.max(0, Math.min(1, Number(v))); if (this._crusher) this._crusher.setAmount(this.crush); }
  setReverb(v) {
    this.reverb = Math.max(0, Math.min(1, Number(v)));
    // re-generate impulse subtly
    if (this._convolver) {
      const len = 0.6 + 2.2 * this.reverb;
      const decay = 1.2 + 2.8 * this.reverb;
      this._convolver.buffer = this._makeImpulseResponse(len, decay);
    }
  }
  setComp(v) { this.comp = Math.max(0, Math.min(1, Number(v))); if (this._compressor) this._applyComp(this.comp); }

  _updateMix() {
    if (!this._dryBus || !this._wetBus) return;
    this._dryBus.gain.value = 1 - this.fxMix;
    this._wetBus.gain.value = this.fxMix;
  }

  // ---------- metronome ----------
  setMetronomeEnabled(on) { this.metronomeEnabled = !!on; }
  setMetronomeLevel(level01) { this.metronomeLevel = Math.max(0, Math.min(1, Number(level01))); }

  playClick(time, accent = false) {
    if (!this.ctx || !this.metronomeEnabled) return;

    const t = Math.max(this.ctx.currentTime, time);
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(accent ? 2200 : 1500, t);

    const level = (accent ? 1.0 : 0.7) * this.metronomeLevel;

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(level, t + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.06);
  }

  // ---------- note helpers ----------
  midiToHz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  _oscTypeForWave() {
    if (this.waveform === 'TRI') return 'triangle';
    if (this.waveform === 'PULSE') return 'square';
    return 'sawtooth';
  }

  // ---------- Hold chord management ----------
  releaseHeldChord(atTime) {
    if (!this.ctx) return;
    const t = Math.max(this.ctx.currentTime, atTime || this.ctx.currentTime);
    const R = this.envR;

    const held = this._held.splice(0);
    held.forEach(v => {
      try {
        v.amp.gain.cancelScheduledValues(t);
        v.amp.gain.setValueAtTime(Math.max(0.0002, v.amp.gain.value || 0.0002), t);
        v.amp.gain.exponentialRampToValueAtTime(0.0001, t + R);
      } catch {}
      try {
        v.oscs.forEach(o => o.stop(t + R + 0.02));
      } catch {}
    });
  }

  // ---------- Play chord ----------
  /**
   * @param {number[]} midiNotes
   * @param {number} time audio time
   * @param {number} velocity 0..1
   * @param {boolean} accent
   * @param {boolean} hold if true, keep until next chord releases
   */
  playChord(midiNotes, time, velocity = 0.9, accent = false, hold = false) {
    if (!this.ctx || !Array.isArray(midiNotes) || midiNotes.length === 0) return;

    const t0 = Math.max(this.ctx.currentTime, time);
    const vel = Math.max(0, Math.min(1, Number(velocity)));
    const v = accent ? Math.min(1, vel * 1.18) : vel;

    // release previous held chord (if any) right before new chord
    if (hold) this.releaseHeldChord(t0);

    // Envelope
    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(0.0001, t0);

    const A = this.envA, D = this.envD, S = this.envS, R = this.envR;

    const peak = 0.45 * v;
    const sustain = Math.max(0.0002, peak * S);

    amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + A);
    amp.gain.exponentialRampToValueAtTime(sustain, t0 + A + D);

    // Filter + env
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.setValueAtTime(Math.max(0.0001, this.res * 14), t0);

    const baseCut = this.cutoff;
    const envCut = Math.max(80, Math.min(14000, baseCut + this.envAmt * v));

    filter.frequency.setValueAtTime(envCut, t0);
    filter.frequency.exponentialRampToValueAtTime(Math.max(80, baseCut), t0 + A + D);

    // Route into chorus stage
    filter.connect(amp);

    // dry feed
    amp.connect(this._chorusDry);

    // wet feed (chorus)
    // NOTE: we route the raw amp into delays; chorusMix is handled by chorusDry/chorusWet levels
    amp.connect(this._chorusDelayL);
    amp.connect(this._chorusDelayR);

    // Oscillators
    const type = this._oscTypeForWave();
    const oscs = [];

    const glideS = Math.max(0, this.glideMs) / 1000;

    // small detune spread
    const detunes = [-6, +4, 0, +2];

    midiNotes.forEach((m, idx) => {
      const osc = this.ctx.createOscillator();
      osc.type = type;

      const f = this.midiToHz(m);
      osc.frequency.setValueAtTime(f, t0);

      // (glide) if we were holding something, glide is more useful on continuous playing,
      // here we keep it subtle:
      if (glideS > 0.001) {
        osc.frequency.setTargetAtTime(f, t0, glideS);
      }

      osc.detune.setValueAtTime(detunes[idx % detunes.length], t0);

      osc.connect(filter);
      osc.start(t0);
      oscs.push(osc);
    });

    // If not hold => stop after short gate + release
    if (!hold) {
      const stopAt = t0 + A + D + 0.10;
      amp.gain.setValueAtTime(sustain, stopAt);
      amp.gain.exponentialRampToValueAtTime(0.0001, stopAt + R);
      oscs.forEach(o => o.stop(stopAt + R + 0.02));
    } else {
      // keep voice reference so we can release on next chord
      this._held.push({ oscs, amp, filter });
    }
  }

  // ---------- Keyboard preview ----------
  /**
   * Short note preview (used by keyboard)
   */
  playNote(midi, time = 0, velocity = 0.9) {
    if (!this.ctx) return;
    const t0 = time > 0 ? Math.max(this.ctx.currentTime, time) : this.ctx.currentTime;

    const chord = [midi];
    this.playChord(chord, t0, velocity, false, false);
  }

  // ---------- FX internals ----------
  _makeDriveCurve(amount01) {
    const k = 5 + 55 * Math.max(0, Math.min(1, amount01));
    const n = 1024;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / (n - 1) - 1;
      // smooth soft clip
      curve[i] = Math.tanh(k * x) / Math.tanh(k);
    }
    return curve;
  }

  _createBitCrusherNode() {
    // ScriptProcessor fallback (works on iOS Safari)
    const input = this.ctx.createGain();
    const output = this.ctx.createGain();
    const sp = this.ctx.createScriptProcessor(1024, 1, 1);

    let amount = this.crush; // 0..1
    let phase = 0;
    let last = 0;

    const setAmount = (a) => { amount = Math.max(0, Math.min(1, a)); };

    sp.onaudioprocess = (e) => {
      const inp = e.inputBuffer.getChannelData(0);
      const out = e.outputBuffer.getChannelData(0);

      // amount -> step size (bigger = more crush)
      const step = 1 + Math.floor(amount * 18); // 1..19
      const bits = 16 - Math.floor(amount * 12); // 16..4
      const q = Math.pow(2, bits);

      for (let i = 0; i < inp.length; i++) {
        phase++;
        if (phase >= step) {
          phase = 0;
          // sample & hold + bit depth reduce
          last = Math.round(inp[i] * q) / q;
        }
        out[i] = last;
      }
    };

    input.connect(sp);
    sp.connect(output);

    return { input, output, setAmount };
  }

  _makeImpulseResponse(seconds = 1.8, decay = 2.2) {
    const rate = this.ctx.sampleRate;
    const length = Math.max(1, Math.floor(rate * seconds));
    const impulse = this.ctx.createBuffer(2, length, rate);

    for (let c = 0; c < 2; c++) {
      const ch = impulse.getChannelData(c);
      for (let i = 0; i < length; i++) {
        const t = i / length;
        // noise * exponential decay
        ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
      }
    }
    return impulse;
  }

  _applyComp(amount01) {
    // map 0..1 to musically sane ranges
    const a = Math.max(0, Math.min(1, amount01));
    // more amount = lower threshold, higher ratio
    this._compressor.threshold.value = -10 - 26 * a; // -10..-36
    this._compressor.ratio.value = 2 + 10 * a;       // 2..12
    this._compressor.attack.value = 0.003 + 0.02 * (1 - a);
    this._compressor.release.value = 0.12 + 0.2 * a;
    this._compressor.knee.value = 18;
  }
}
