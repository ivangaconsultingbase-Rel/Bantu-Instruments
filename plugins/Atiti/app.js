(() => {
  'use strict';
  const qs = (s, el = document) => el.querySelector(s);
  const qsa = (s, el = document) => Array.from(el.querySelectorAll(s));
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  // ── MUSIC THEORY ────────────────────────────────────────────────────────────
  const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const SCALE_MAP = {
    Major:      [0,2,4,5,7,9,11],
    Minor:      [0,2,3,5,7,8,10],
    Dorian:     [0,2,3,5,7,9,10],
    Mixolydian: [0,2,4,5,7,9,10],
    Pentatonic: [0,3,5,7,10],
    Lydian:     [0,2,4,6,7,9,11],
    Phrygian:   [0,1,3,5,7,8,10],
  };
  // Triades de 3 notes uniquement (pad, musical)
  const CHORDS = {
    triad:  [0, 2, 4],       // do-mi-sol
    sus2:   [0, 1, 4],       // do-ré-sol
    sus4:   [0, 3, 4],       // do-fa-sol
    open5:  [0, 0, 4],       // power + quinte
    stack4: [0, 3, 6],       // quartes empilées
    add9:   [0, 2, 6],       // couleur add9 légère
  };
  const MOTION_TARGETS = ['none','cutoff','lfoDepth','space','morph','warp','chorus'];
  const COMPUTER_KEYS = ['a','w','s','e','d','f','t','g','y','h','u','j','k'];
  const MODELS = ['silk','bell','reed','voice','choir','glass','organ','cosmic'];

  // ── WAVETABLE HELPERS ────────────────────────────────────────────────────────
  function makeDriveCurve(amt) {
    const n = 512, c = new Float32Array(n), k = 2 + amt * 40;
    for (let i = 0; i < n; i++) { const x = i * 2 / (n - 1) - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); }
    return c;
  }
  function makeFoldCurve(amt) {
    const n = 512, c = new Float32Array(n), folds = 1 + Math.floor(amt * 4), gain = 1 + amt * 3;
    for (let i = 0; i < n; i++) {
      let x = (i * 2 / (n - 1) - 1) * gain;
      for (let j = 0; j < folds; j++) { if (x > 1) x = 2 - x; else if (x < -1) x = -2 - x; }
      c[i] = clamp(x, -1, 1);
    }
    return c;
  }
  function makeLoFiCurve(amt) {
    const n = 256, c = new Float32Array(n), steps = Math.max(8, Math.floor(64 - amt * 54));
    for (let i = 0; i < n; i++) { const x = i * 2 / (n - 1) - 1; c[i] = Math.round(x * steps) / steps; }
    return c;
  }

  // ── PAD VOICE ───────────────────────────────────────────────────────────────
  class PadVoice {
    constructor(ctx, output) { this.ctx = ctx; this.output = output; this.active = false; this.endTimer = 0; }

    start(freq, velocity, p, when = this.ctx.currentTime, gateTime = 0.6) {
      this.stop(when);
      this.active = true;
      const ctx = this.ctx;

      // Model spectral shapes
      const modelName = MODELS[Math.min(MODELS.length - 1, Math.floor(p.model * MODELS.length))];
      const shapes = {
        silk:   [1, 0.55, 0.28, 0.12, 0.06],
        bell:   [1, 0.28, 0.68, 0.14, 0.08],
        reed:   [1, 0.60, 0.38, 0.18, 0.09],
        voice:  [1, 0.52, 0.32, 0.22, 0.12],
        choir:  [1, 0.46, 0.28, 0.18, 0.10],
        glass:  [1, 0.20, 0.58, 0.32, 0.16],
        organ:  [1, 0.88, 0.60, 0.40, 0.24],
        cosmic: [1, 0.38, 0.72, 0.48, 0.26],
      };
      const shape = shapes[modelName] || shapes.silk;

      // Main mix bus
      const mix   = ctx.createGain();
      const shaper = ctx.createWaveShaper();
      const filt   = ctx.createBiquadFilter();
      const vca    = ctx.createGain();

      shaper.curve = makeFoldCurve(p.fold * 0.7 + p.complexity * 0.25);
      shaper.oversample = '4x';
      filt.type = 'lowpass';
      filt.Q.setValueAtTime(0.4 + p.resonance * 10, when);

      // 5 partials + 2 detuned subs for pad width
      const numPartials = 5;
      this.oscs = [];
      for (let i = 0; i < numPartials; i++) {
        const osc  = ctx.createOscillator();
        const ogain = ctx.createGain();
        const n = i + 1;
        const det = (Math.random() * 2 - 1) * (p.drift + p.organic * 0.5) * 6;
        osc.type = i === 0 ? 'sine' : (i % 2 === 0 ? 'triangle' : 'sine');
        osc.frequency.setValueAtTime(freq * n * (1 + p.inharmonic * 0.06 * i), when);
        osc.detune.setValueAtTime(det + p.index * i * 6, when);
        const tilt = Math.pow(1 - p.tilt * 0.7, i);
        const amp = Math.max(0, (shape[i] || 1 / n) * tilt * (0.78 + p.morph * 0.32));
        ogain.gain.setValueAtTime(amp, when);
        osc.connect(ogain); ogain.connect(mix);
        osc.start(when); osc.stop(when + gateTime + 10);
        this.oscs.push(osc);
      }
      // Unison detuned copies for width
      for (let u = 0; u < 2; u++) {
        const osc = ctx.createOscillator();
        const og  = ctx.createGain();
        osc.type = 'sine';
        const detCents = (u === 0 ? 1 : -1) * (4 + p.drift * 8 + p.organic * 10);
        osc.frequency.setValueAtTime(freq, when);
        osc.detune.setValueAtTime(detCents, when);
        og.gain.setValueAtTime(0.18 + p.morph * 0.12, when);
        osc.connect(og); og.connect(mix);
        osc.start(when); osc.stop(when + gateTime + 10);
        this.oscs.push(osc);
      }

      mix.connect(shaper); shaper.connect(filt); filt.connect(vca); vca.connect(this.output);
      this.vca = vca; this.filt = filt;

      // ── Enveloppe pad longue ─────────────────────────────────────────────
      const attack  = clamp(p.padAttack || (0.02 + (1 - p.focus) * 0.4 + p.space * 0.3), 0.01, 8);
      const decay   = 0.2 + p.space * 0.8 + p.grain * 0.4;
      const sustain = 0.35 + p.morph * 0.35 + p.space * 0.18;
      const release = clamp(p.padRelease || (0.2 + p.space * 1.2 + p.age * 1.0), 0.1, 10);
      const level   = velocity * (0.62 + p.drive * 0.14 + (p.accentBoost || 0));

      vca.gain.setValueAtTime(0.00001, when);
      vca.gain.linearRampToValueAtTime(level, when + attack);
      vca.gain.linearRampToValueAtTime(level * sustain, when + attack + decay);
      vca.gain.setValueAtTime(level * sustain, when + gateTime);
      vca.gain.exponentialRampToValueAtTime(0.00001, when + gateTime + release);

      // ── Filtre avec enveloppe et LFO baked-in ───────────────────────────
      const baseCutoff = Math.max(80, 100 + p.cutoff * 5200 + p.focus * 1200 - p.lofi * 400);
      const envPeak    = baseCutoff + p.env * 3000 + (p.accentBoost || 0) * 1200;
      filt.frequency.setValueAtTime(baseCutoff * 0.5, when);
      filt.frequency.linearRampToValueAtTime(envPeak, when + attack * 0.6 + 0.02);
      filt.frequency.exponentialRampToValueAtTime(Math.max(80, baseCutoff * (0.6 + sustain * 0.4)), when + gateTime + Math.max(0.1, release * 0.7));

      this.endTimer = when + gateTime + release + 0.2;
    }

    stop(when = this.ctx.currentTime) {
      if (!this.active) return;
      try {
        if (this.vca) { this.vca.gain.cancelScheduledValues(when); this.vca.gain.setTargetAtTime(0.00001, when, 0.04); }
        this.oscs?.forEach(o => { try { o.stop(when + 0.08); } catch (_) {} });
      } catch (_) {}
      this.active = false;
    }
  }

  // ── SYNTH ENGINE ─────────────────────────────────────────────────────────────
  class SynthEngine {
    constructor() {
      this.ctx = null; this.master = null; this.input = null;
      this.voices = []; this.started = false;
      this.lfoNodes = [];
      this.params = {
        harmonics:0.32, tilt:0.58, inharmonic:0.04, drift:0.22,
        fold:0.06, index:0.10, model:0.12, morph:0.54,
        blur:0.32, warp:0.18, freeze:0.08, grain:0.14,
        cutoff:0.44, resonance:0.08, drive:0.06, env:0.12,
        tape:0.22, lofi:0.02, echo:0.32, space:0.72,
        organic:0.62, complexity:0.14, focus:0.32, age:0.18,
        lfoRate:0.18, lfoDepth:0.42, lfoShape:'sine',
        chorusDepth:0.48, chorusMix:0.38,
        padAttack:2.8, padRelease:4.2,
        accentBoost:0
      };
      this.masterValue = 0.78;
    }

    async start() {
      if (this.started) { if (this.ctx.state === 'suspended') await this.ctx.resume(); return; }
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();

      // Signal chain: voices → lfo filter → chorus → tape → delay → reverb → master
      this.input          = this.ctx.createGain();
      this.lfoFilterNode  = this.ctx.createBiquadFilter();
      this.chorusDelay1   = this.ctx.createDelay(0.05);
      this.chorusDelay2   = this.ctx.createDelay(0.05);
      this.chorusMixNode  = this.ctx.createGain();
      this.chorusGain1    = this.ctx.createGain();
      this.chorusGain2    = this.ctx.createGain();
      this.chorusDryGain  = this.ctx.createGain();
      this.tapePre        = this.ctx.createGain();
      this.tapeDrive      = this.ctx.createWaveShaper();
      this.lofiNode       = this.ctx.createWaveShaper();
      this.toneFilter     = this.ctx.createBiquadFilter();
      this.delay          = this.ctx.createDelay(2.0);
      this.delayFeedback  = this.ctx.createGain();
      this.delayMix       = this.ctx.createGain();
      this.delayLP        = this.ctx.createBiquadFilter();
      this.reverbDelay    = this.ctx.createDelay(0.18);
      this.reverbFeedback = this.ctx.createGain();
      this.reverbWet      = this.ctx.createGain();
      this.reverbHP       = this.ctx.createBiquadFilter();
      this.shimmerDelay   = this.ctx.createDelay(0.08);
      this.shimmerGain    = this.ctx.createGain();
      this.master         = this.ctx.createGain();
      const dry           = this.ctx.createGain();

      this.lfoFilterNode.type = 'lowpass';
      this.toneFilter.type    = 'lowpass';
      this.delayLP.type       = 'lowpass';
      this.reverbHP.type      = 'highpass';

      // ── LFO → filtre global ──────────────────────────────────────────────
      this.lfoNode = this.ctx.createOscillator();
      this.lfoGain = this.ctx.createGain();
      this.lfoNode.type = 'sine';
      this.lfoNode.frequency.value = this.params.lfoRate * 2.0;
      this.lfoGain.gain.value = this.params.lfoDepth * 2800;
      this.lfoNode.connect(this.lfoGain);
      this.lfoGain.connect(this.lfoFilterNode.frequency);
      this.lfoFilterNode.frequency.value = 800 + this.params.cutoff * 4000;
      this.lfoNode.start();

      // ── LFO → chorus ─────────────────────────────────────────────────────
      this.chorusLfo1 = this.ctx.createOscillator();
      this.chorusLfo2 = this.ctx.createOscillator();
      this.chorusLfoGain1 = this.ctx.createGain();
      this.chorusLfoGain2 = this.ctx.createGain();
      this.chorusLfo1.type = 'sine';
      this.chorusLfo2.type = 'sine';
      this.chorusLfo1.frequency.value = 0.22;
      this.chorusLfo2.frequency.value = 0.31;
      this.chorusLfoGain1.gain.value = 0.008;
      this.chorusLfoGain2.gain.value = 0.01;
      this.chorusLfo1.connect(this.chorusLfoGain1); this.chorusLfoGain1.connect(this.chorusDelay1.delayTime);
      this.chorusLfo2.connect(this.chorusLfoGain2); this.chorusLfoGain2.connect(this.chorusDelay2.delayTime);
      this.chorusDelay1.delayTime.value = 0.012;
      this.chorusDelay2.delayTime.value = 0.018;
      this.chorusLfo1.start(); this.chorusLfo2.start();

      // ── Graph de connexions ───────────────────────────────────────────────
      // voices → lfo filter
      this.input.connect(this.lfoFilterNode);

      // lfo filter → chorus (dry + wet)
      this.lfoFilterNode.connect(this.chorusDryGain);
      this.lfoFilterNode.connect(this.chorusDelay1); this.chorusDelay1.connect(this.chorusGain1);
      this.lfoFilterNode.connect(this.chorusDelay2); this.chorusDelay2.connect(this.chorusGain2);
      this.chorusDryGain.connect(this.chorusMixNode);
      this.chorusGain1.connect(this.chorusMixNode);
      this.chorusGain2.connect(this.chorusMixNode);

      // chorus → tape → tone
      this.chorusMixNode.connect(this.tapePre);
      this.tapePre.connect(this.tapeDrive);
      this.tapeDrive.connect(this.lofiNode);
      this.lofiNode.connect(this.toneFilter);

      // tone → dry
      this.toneFilter.connect(dry); dry.connect(this.master);

      // delay path
      this.toneFilter.connect(this.delay);
      this.delay.connect(this.delayLP);
      this.delayLP.connect(this.delayFeedback);
      this.delayFeedback.connect(this.delay);
      this.delayLP.connect(this.delayMix);
      this.delayMix.connect(this.master);

      // reverb path (Schroeder-inspired allpass network)
      this.toneFilter.connect(this.reverbDelay);
      this.reverbDelay.connect(this.reverbHP);
      this.reverbHP.connect(this.reverbFeedback);
      this.reverbFeedback.connect(this.reverbDelay);
      this.reverbHP.connect(this.shimmerDelay);
      this.shimmerDelay.connect(this.shimmerGain);
      this.shimmerGain.connect(this.reverbDelay);
      this.reverbHP.connect(this.reverbWet);
      this.reverbWet.connect(this.master);

      this.master.connect(this.ctx.destination);

      // 8 voices poly pour les pads
      for (let i = 0; i < 8; i++) this.voices.push(new PadVoice(this.ctx, this.input));

      this.started = true;
      this.updateFx();
    }

    panic() { this.voices.forEach(v => v.stop(this.ctx?.currentTime ?? 0)); }

    setParam(name, value) { this.params[name] = value; this.updateFx(); }
    setMaster(value) { this.masterValue = value; if (this.master) this.master.gain.value = value; }

    updateFx() {
      if (!this.started) return;
      const p = this.params;

      // LFO filtre global
      if (this.lfoNode) {
        this.lfoNode.frequency.setTargetAtTime(Math.max(0.02, p.lfoRate * 2.2), this.ctx.currentTime, 0.3);
        this.lfoGain.gain.setTargetAtTime(p.lfoDepth * 3200, this.ctx.currentTime, 0.3);
        this.lfoFilterNode.frequency.setTargetAtTime(200 + p.cutoff * 5000, this.ctx.currentTime, 0.3);
        this.lfoFilterNode.Q.value = 0.3 + p.resonance * 5;
        if (p.lfoShape && this.lfoNode.type !== p.lfoShape) {
          try { this.lfoNode.type = p.lfoShape; } catch(_) {}
        }
      }

      // Chorus
      const cDepth = p.chorusDepth || 0.3;
      const cMix   = p.chorusMix   || 0.25;
      this.chorusLfoGain1.gain.setTargetAtTime(0.005 + cDepth * 0.018, this.ctx.currentTime, 0.2);
      this.chorusLfoGain2.gain.setTargetAtTime(0.006 + cDepth * 0.022, this.ctx.currentTime, 0.2);
      this.chorusGain1.gain.setTargetAtTime(cMix * 0.6, this.ctx.currentTime, 0.2);
      this.chorusGain2.gain.setTargetAtTime(cMix * 0.5, this.ctx.currentTime, 0.2);
      this.chorusDryGain.gain.setTargetAtTime(1.0, this.ctx.currentTime, 0.2);

      // Tape
      this.tapePre.gain.value = 1 + p.tape * 1.6 + p.age * 0.5;
      this.tapeDrive.curve = makeDriveCurve(p.tape * 0.7 + p.drive * 0.4 + p.age * 0.2);
      this.lofiNode.curve  = makeLoFiCurve(p.lofi * 0.8 + p.age * 0.18);
      this.toneFilter.frequency.value = Math.max(800, 14000 - p.lofi * 7000 - p.age * 2000 + p.focus * 1400);

      // Echo / Delay
      this.delay.delayTime.setTargetAtTime(0.16 + p.echo * 0.72, this.ctx.currentTime, 0.1);
      this.delayFeedback.gain.setTargetAtTime(0.06 + p.echo * 0.76, this.ctx.currentTime, 0.1);
      this.delayMix.gain.setTargetAtTime(p.echo * 0.44, this.ctx.currentTime, 0.1);
      this.delayLP.frequency.value = 1800 + (1 - p.lofi) * 2800;

      // Reverb / Space
      this.reverbDelay.delayTime.setTargetAtTime(0.05 + p.space * 0.13, this.ctx.currentTime, 0.2);
      this.reverbFeedback.gain.setTargetAtTime(0.1 + p.space * 0.82, this.ctx.currentTime, 0.2);
      this.reverbWet.gain.setTargetAtTime(p.space * 0.42, this.ctx.currentTime, 0.2);
      this.reverbHP.frequency.value = 180 + p.age * 280;
      this.shimmerGain.gain.setTargetAtTime(p.warp * 0.18, this.ctx.currentTime, 0.2);

      this.master.gain.value = this.masterValue;
    }

    noteOn(midi, velocity = 0.8, duration = 0.5, when = null, accentBoost = 0) {
      if (!this.started) return;
      const time = when ?? this.ctx.currentTime;
      const freq = 440 * Math.pow(2, (midi - 69) / 12);
      const voice = this.voices.find(v => !v.active) ||
                    this.voices.reduce((a, b) => (a.endTimer || 0) < (b.endTimer || 0) ? a : b);
      const params = { ...this.params, accentBoost };
      voice.start(freq, velocity, params, time, duration);
    }
  }

  // ── SEQUENCER ────────────────────────────────────────────────────────────────
  class Sequencer {
    constructor(engine) {
      this.engine = engine;
      this.steps = Array.from({ length: 32 }, (_, i) => this.makeStep(i));
      this.page = 0; this.chainMode = true; this.selected = 0;
      this.playing = false; this.current = -1; this.nextTick = 0;
      this.timer = null; this.copiedStep = null;
      this.key = 'F'; this.scale = 'Dorian'; this.globalOctave = 0;
      this.gate = 0.82; this.humanize = 0.012; this.swing = 0.04; this.bpm = 72;
      this.loadPattern('pad_drift');
    }

    makeStep(i) {
      return {
        active: i % 4 === 0, degree: (i % 7) + 1, chord: 'triad',
        octave: 0, velocity: 0.70, probability: 1.0,
        ratchet: 1, micro: 0, tie: 0, accent: false,
        motionTarget: 'none', motionAmount: 0
      };
    }

    loadPattern(name) {
      const pat = window.SPECTRAL_SEQ_PATTERNS?.[name];
      if (!pat) return;
      pat.steps.forEach((s, i) => {
        if (i < 16) Object.assign(this.steps[i], s);
      });
      // Page B = variation légère de A
      for (let i = 0; i < 16; i++) {
        this.steps[16 + i] = { ...this.steps[i] };
        // Quelques variations probabilistes sur B
        if (Math.random() > 0.7) this.steps[16 + i].probability = Math.max(0.55, this.steps[i].probability - 0.15);
        if (Math.random() > 0.8) this.steps[16 + i].velocity    = Math.max(0.4,  this.steps[i].velocity - 0.1);
      }
    }

    stepDuration() { return 60 / this.bpm / 4; }
    visibleStart()  { return this.page * 16; }
    visibleEnd()    { return this.visibleStart() + 16; }
    pageIndices()   { const s = this.visibleStart(); return Array.from({ length: 16 }, (_, i) => s + i); }

    start() {
      if (!this.engine.started) return;
      this.playing = true;
      this.current = this.chainMode ? -1 : this.visibleStart() - 1;
      this.nextTick = this.engine.ctx.currentTime + 0.04;
      if (this.timer) clearInterval(this.timer);
      this.timer = setInterval(() => this.scheduler(), 22);
    }

    stop() {
      this.playing = false;
      clearInterval(this.timer);
      this.timer = null;
      this.current = -1;
      renderStepGrid();
    }

    scheduler() {
      const lookAhead = 0.14, stepDur = this.stepDuration();
      while (this.nextTick < this.engine.ctx.currentTime + lookAhead) {
        let absIndex;
        if (this.chainMode) absIndex = (this.current + 1 + 32) % 32;
        else { const start = this.visibleStart(); const rel = ((this.current + 1 - start) % 16 + 16) % 16; absIndex = start + rel; }
        this.current = absIndex;
        this.scheduleStep(absIndex, this.nextTick);
        const isSwing = absIndex % 2 === 1;
        this.nextTick += stepDur + (isSwing ? stepDur * this.swing : 0);
      }
      renderStepGrid();
    }

    scheduleStep(index, when) {
      const step = this.steps[index];
      if (!step.active) return;
      if (Math.random() > step.probability) return;

      const scale = SCALE_MAP[this.scale];
      const degIdx = clamp(step.degree - 1, 0, scale.length - 1);
      const rootMidi = 60 + NOTE_NAMES.indexOf(this.key) + 12 * (this.globalOctave + step.octave);
      const baseMidi = rootMidi + scale[degIdx];
      const intervals = CHORDS[step.chord] || CHORDS.triad;
      const gateTime = this.stepDuration() * this.gate;
      const velocity = clamp(step.velocity + (step.accent ? 0.12 : 0), 0.05, 1);
      const accentBoost = step.accent ? 0.14 : 0;
      const micro = step.micro + (Math.random() * 2 - 1) * this.humanize;
      const motionRestore = applyMotion(step, this.engine);

      for (let r = 0; r < step.ratchet; r++) {
        const subTime = when + micro + (r * gateTime / step.ratchet);
        intervals.forEach(deg => {
          const octJump = Math.floor(deg / scale.length);
          const note = baseMidi + scale[deg % scale.length] + octJump * 12;
          this.engine.noteOn(
            note, velocity,
            Math.max(0.08, gateTime / step.ratchet * (step.tie ? 1.9 : 0.92)),
            subTime, accentBoost
          );
        });
      }
      if (motionRestore) setTimeout(motionRestore, Math.max(40, gateTime * 1000));
    }

    save(slot) {
      localStorage.setItem(`spectral-v9-pat-${slot}`, JSON.stringify({
        steps: this.steps, key: this.key, scale: this.scale,
        globalOctave: this.globalOctave, gate: this.gate,
        humanize: this.humanize, bpm: this.bpm, swing: this.swing
      }));
    }

    load(slot) {
      const raw = localStorage.getItem(`spectral-v9-pat-${slot}`);
      if (!raw) return false;
      try {
        const d = JSON.parse(raw);
        this.steps = d.steps || this.steps;
        this.key = d.key || this.key; this.scale = d.scale || this.scale;
        this.globalOctave = d.globalOctave ?? this.globalOctave;
        this.gate = d.gate ?? this.gate; this.humanize = d.humanize ?? this.humanize;
        this.bpm = d.bpm ?? this.bpm; this.swing = d.swing ?? this.swing;
        return true;
      } catch (_) { return false; }
    }

    clearPage()  { this.pageIndices().forEach(i => this.steps[i].active = false); }
    fillPage()   { this.pageIndices().forEach((i, idx) => { this.steps[i].active = true; this.steps[i].degree = (idx % SCALE_MAP[this.scale].length) + 1; }); }
    copyAToB()   { for (let i = 0; i < 16; i++) this.steps[16 + i] = { ...this.steps[i] }; }
    shiftPage(dir) {
      const ids = this.pageIndices(), snap = ids.map(i => ({ ...this.steps[i] }));
      ids.forEach((i, idx) => { this.steps[i] = { ...snap[(idx - dir + 16) % 16] }; });
    }

    randomize() {
      const chords = Object.keys(CHORDS);
      this.steps.forEach((s, i) => {
        s.active = Math.random() > 0.45;
        s.degree = 1 + Math.floor(Math.random() * SCALE_MAP[this.scale].length);
        s.chord  = chords[Math.floor(Math.random() * chords.length)];
        s.velocity = 0.48 + Math.random() * 0.46;
        s.probability = 0.5 + Math.random() * 0.5;
        s.ratchet = 1;
        s.micro = (Math.random() * 2 - 1) * 0.022;
        s.accent = i % 8 === 4 ? true : Math.random() > 0.82;
      });
    }
  }

  // ── MOTION ────────────────────────────────────────────────────────────────────
  function applyMotion(step, engine) {
    if (step.motionTarget === 'none' || Math.abs(step.motionAmount) < 0.001) return null;
    const t = step.motionTarget, orig = engine.params[t];
    const next = clamp(orig + step.motionAmount * 0.3, 0, 1);
    engine.setParam(t, next); syncControl(t, next, false);
    return () => { engine.setParam(t, orig); syncControl(t, orig, false); };
  }

  // ── ENGINE + SEQUENCER ───────────────────────────────────────────────────────
  const engine = new SynthEngine();
  const sequencer = new Sequencer(engine);
  const uiState = { keyboardOctave: 4 };

  // ── CONTROL SETS ─────────────────────────────────────────────────────────────
  const CONTROL_SETS = {
    sourceControls:  [['harmonics','HARMONICS'],['tilt','SPECTRAL TILT'],['inharmonic','INHARMONIC'],['drift','DRIFT'],['fold','WAVEFOLD'],['index','FM INDEX'],['model','MODEL'],['morph','MORPH']],
    textureControls: [['blur','BLUR'],['warp','WARP / SHIMMER'],['freeze','FREEZE'],['grain','GRAIN']],
    toneControls:    [['cutoff','CUTOFF'],['resonance','RESONANCE'],['drive','DRIVE'],['env','FILTER ENV']],
    fxControls:      [['tape','TAPE SAT'],['lofi','LO-FI'],['echo','ECHO'],['space','REVERB SPACE']],
    macroControls:   [['organic','ORGANIC'],['complexity','COMPLEXITY'],['focus','FOCUS'],['age','AGE']],
    padControls:     [['lfoRate','LFO RATE'],['lfoDepth','LFO DEPTH'],['chorusDepth','CHORUS DEPTH'],['chorusMix','CHORUS MIX'],['padAttack','PAD ATTACK'],['padRelease','PAD RELEASE']]
  };

  function makeControl(targetId, param, label) {
    const isAttack  = param === 'padAttack';
    const isRelease = param === 'padRelease';
    const isLfo     = param === 'lfoRate';
    const max = isAttack || isRelease ? 8 : isLfo ? 2 : 1;
    const step = isAttack || isRelease ? 0.05 : 0.01;
    const wrap = document.createElement('div');
    wrap.className = 'knob-card';
    wrap.innerHTML = `<div class="knob-head"><span class="knob-title">${label}</span><span class="readout" data-readout="${param}"></span></div><input data-param="${param}" type="range" min="0" max="${max}" step="${step}" value="${engine.params[param] ?? 0}">`;
    qs(`#${targetId}`).appendChild(wrap);
  }

  Object.entries(CONTROL_SETS).forEach(([target, list]) => {
    if (qs(`#${target}`)) list.forEach(([param, label]) => makeControl(target, param, label));
  });

  qsa('input[data-param]').forEach(inp => {
    const param = inp.dataset.param;
    inp.addEventListener('input', () => syncControl(param, parseFloat(inp.value), true));
    syncControl(param, parseFloat(inp.value), false);
  });

  // ── SYNC CONTROLS ────────────────────────────────────────────────────────────
  function syncControl(param, value, pushToEngine = true) {
    qsa(`input[data-param="${param}"]`).forEach(el => el.value = value);
    qsa(`[data-readout="${param}"]`).forEach(el => {
      if (param === 'model') {
        el.textContent = MODELS[Math.min(MODELS.length - 1, Math.floor(value * MODELS.length))].toUpperCase();
      } else if (param === 'padAttack' || param === 'padRelease') {
        el.textContent = `${value.toFixed(1)}s`;
      } else if (param === 'lfoRate') {
        el.textContent = `${(value * 2.2).toFixed(2)} Hz`;
      } else {
        el.textContent = `${Math.round(value * 100)}%`;
      }
    });
    if (pushToEngine) engine.setParam(param, value);
  }

  // ── PRESET APPLY ──────────────────────────────────────────────────────────────
  function applyPreset(name) {
    const preset = window.SPECTRAL_PRESETS?.[name];
    if (!preset) return;
    Object.entries(preset).forEach(([k, v]) => {
      if (k in engine.params && typeof v !== 'string') syncControl(k, v, true);
      else if (k in engine.params) engine.params[k] = v;
    });
    // Appliquer les paramètres séquenceur du preset
    if (preset.seqBpm)   { sequencer.bpm = preset.seqBpm; qs('#bpm').value = preset.seqBpm; }
    if (preset.seqKey)   { sequencer.key = preset.seqKey; qs('#seqKey').value = preset.seqKey; }
    if (preset.seqScale) { sequencer.scale = preset.seqScale; qs('#seqScale').value = preset.seqScale; renderScaleNotes(); }
    if (preset.seqGate)  { sequencer.gate = preset.seqGate; qs('#gateLength').value = preset.seqGate; }
    if (preset.seqSwing) { sequencer.swing = preset.seqSwing; qs('#swing').value = preset.seqSwing; }
    if (preset.seqPattern) { sequencer.loadPattern(preset.seqPattern); renderStepGrid(); updateStepEditor(); }
    updateReadouts();
  }

  // ── SELECT POPULATION ─────────────────────────────────────────────────────────
  function populateSelect(select, values) {
    values.forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; select.appendChild(o); });
  }
  populateSelect(qs('#seqKey'), NOTE_NAMES);
  populateSelect(qs('#seqScale'), Object.keys(SCALE_MAP));
  populateSelect(qs('#stepDegree'), Array.from({ length: 8 }, (_, i) => String(i + 1)));
  populateSelect(qs('#stepChord'), Object.keys(CHORDS));
  populateSelect(qs('#motionTarget'), MOTION_TARGETS);
  populateSelect(qs('#presetSelect'), Object.keys(window.SPECTRAL_PRESETS || {}));

  qs('#seqKey').value    = sequencer.key;
  qs('#seqScale').value  = sequencer.scale;
  qs('#bpm').value       = sequencer.bpm;
  qs('#octaveShift').value = sequencer.globalOctave;
  qs('#gateLength').value  = sequencer.gate;
  qs('#humanize').value    = sequencer.humanize;
  qs('#swing').value       = sequencer.swing;
  qs('#presetSelect').value = '✦ Drift Silk';

  // ── STEP GRID ─────────────────────────────────────────────────────────────────
  function stepLabel(step) {
    const chordShort = { triad:'△', sus2:'SU2', sus4:'SU4', open5:'P5', stack4:'4th', add9:'9' };
    return `${step.degree} ${chordShort[step.chord] || step.chord}`;
  }

  function renderStepGrid() {
    const grid = qs('#stepGrid'); grid.innerHTML = '';
    const start = sequencer.visibleStart(), end = sequencer.visibleEnd();
    for (let i = start; i < end; i++) {
      const step = sequencer.steps[i];
      const btn = document.createElement('button');
      btn.className = [
        'step-btn',
        step.active ? 'active' : 'off',
        sequencer.selected === i ? 'selected' : '',
        sequencer.current === i ? 'playing' : ''
      ].join(' ').trim();

      const probPct = Math.round(step.probability * 100);
      btn.innerHTML = `
        <div class="step-top">
          <span class="step-num">${i - start + 1}</span>
          <span class="step-state">${step.active ? '●' : '○'}</span>
        </div>
        <div class="step-note">${stepLabel(step)}</div>
        <div class="step-flags">
          ${step.accent ? '<span class="badge badge-acc">ACC</span>' : ''}
          ${step.ratchet > 1 ? `<span class="badge">R${step.ratchet}</span>` : ''}
          ${step.tie ? '<span class="badge">TIE</span>' : ''}
        </div>
        <div class="prob-bar"><i style="width:${probPct}%"></i></div>
      `;
      btn.addEventListener('click', () => { sequencer.selected = i; updateStepEditor(); renderStepGrid(); });
      btn.addEventListener('dblclick', () => { step.active = !step.active; updateStepEditor(); renderStepGrid(); });
      grid.appendChild(btn);
    }
    qs('#stepSummary').textContent = `16 steps / ${sequencer.chainMode ? 'A→B 32 actifs' : 'boucle page'}`;
    qs('#pageABtn').classList.toggle('active', sequencer.page === 0);
    qs('#pageBBtn').classList.toggle('active', sequencer.page === 1);
    qs('#chainModeBtn').classList.toggle('active', sequencer.chainMode);
    updateReadouts();
  }

  function updateStepEditor() {
    const step = sequencer.steps[sequencer.selected];
    qs('#selectedStepLabel').textContent = `STEP ${sequencer.selected + 1} / ${sequencer.selected < 16 ? 'PAGE A' : 'PAGE B'}`;
    qs('#stepDegree').value      = String(step.degree);
    qs('#stepChord').value       = step.chord;
    qs('#stepOctave').value      = step.octave;
    qs('#stepVelocity').value    = step.velocity;
    qs('#stepProbability').value = step.probability;
    qs('#stepRatchet').value     = step.ratchet;
    qs('#stepMicro').value       = step.micro;
    qs('#stepTie').value         = String(step.tie);
    qs('#stepActive').value      = step.active ? '1' : '0';
    qs('#motionTarget').value    = step.motionTarget;
    qs('#motionAmount').value    = step.motionAmount;
    qs('#stepAccentBtn').classList.toggle('active', step.accent);
    qs('#stepOctaveReadout').textContent     = String(step.octave);
    qs('#stepVelocityReadout').textContent   = `${Math.round(step.velocity * 100)}%`;
    qs('#stepProbabilityReadout').textContent = `${Math.round(step.probability * 100)}%`;
    qs('#stepRatchetReadout').textContent    = `${step.ratchet}x`;
    qs('#stepMicroReadout').textContent      = `${Math.round(step.micro * 1000)} ms`;
    qs('#motionAmountReadout').textContent   = `${Math.round(step.motionAmount * 100)}%`;
  }

  function renderScaleNotes() {
    const notes = SCALE_MAP[sequencer.scale].map(s => NOTE_NAMES[(NOTE_NAMES.indexOf(sequencer.key) + s) % 12]);
    qs('#scaleNotes').innerHTML = notes.map(n => `<span class="note-chip">${n}</span>`).join('');
  }

  function updateReadouts() {
    qs('#masterReadout').textContent  = `${Math.round(parseFloat(qs('#masterVolume').value) * 100)}%`;
    qs('#swingReadout').textContent   = `${Math.round(parseFloat(qs('#swing').value) * 100)}%`;
    qs('#octaveReadout').textContent  = String(sequencer.globalOctave);
    qs('#gateReadout').textContent    = `${Math.round(sequencer.gate * 100)}%`;
    qs('#humanizeReadout').textContent = `${Math.round(sequencer.humanize * 1000)} ms`;
    qs('#keyboardOctaveReadout').textContent = String(uiState.keyboardOctave);
    qs('#pageStatusChip').textContent = `PAGE ${sequencer.page === 0 ? 'A' : 'B'}`;
    qs('#modeStatusChip').textContent = sequencer.chainMode ? 'CHAIN A→B' : 'BOUCLE PAGE';
  }

  // ── KEYBOARD ─────────────────────────────────────────────────────────────────
  function buildKeyboard() {
    const keyboard = qs('#keyboard'); keyboard.innerHTML = '';
    const base = 12 * uiState.keyboardOctave;
    for (let i = 0; i < 13; i++) {
      const midi = base + i, name = NOTE_NAMES[midi % 12], isBlack = name.includes('#');
      const key = document.createElement('button');
      key.className = `key ${isBlack ? 'black' : ''}`;
      key.textContent = COMPUTER_KEYS[i]?.toUpperCase() || name;
      const down = () => { key.classList.add('active'); engine.noteOn(midi, 0.80, 0.6); };
      const up   = () => key.classList.remove('active');
      key.addEventListener('mousedown', down); key.addEventListener('mouseup', up); key.addEventListener('mouseleave', up);
      key.addEventListener('touchstart', e => { e.preventDefault(); down(); }, { passive: false });
      key.addEventListener('touchend', up);
      keyboard.appendChild(key);
    }
  }

  // ── EVENT LISTENERS ───────────────────────────────────────────────────────────
  qs('#audioBtn').addEventListener('click', async () => {
    await engine.start();
    qs('#audioStatus').textContent = 'AUDIO ON';
    qs('#audioBtn').textContent    = 'PRÊT';
  });
  qs('#panicBtn').addEventListener('click', () => engine.panic());
  qs('#playBtn').addEventListener('click',  async () => { await engine.start(); sequencer.start(); });
  qs('#stopBtn').addEventListener('click',  () => sequencer.stop());
  qs('#previewBtn').addEventListener('click', async () => { await engine.start(); sequencer.scheduleStep(sequencer.selected, engine.ctx.currentTime + 0.01); });
  qs('#pageABtn').addEventListener('click', () => { sequencer.page = 0; renderStepGrid(); updateStepEditor(); });
  qs('#pageBBtn').addEventListener('click', () => { sequencer.page = 1; renderStepGrid(); updateStepEditor(); });
  qs('#chainModeBtn').addEventListener('click', () => { sequencer.chainMode = !sequencer.chainMode; renderStepGrid(); });
  qs('#savePatternBtn').addEventListener('click', () => sequencer.save(qs('#patternSlot').value));
  qs('#loadPatternBtn').addEventListener('click', () => {
    if (sequencer.load(qs('#patternSlot').value)) {
      qs('#seqKey').value = sequencer.key; qs('#seqScale').value = sequencer.scale;
      qs('#bpm').value = sequencer.bpm; qs('#octaveShift').value = sequencer.globalOctave;
      qs('#gateLength').value = sequencer.gate; qs('#humanize').value = sequencer.humanize;
      qs('#swing').value = sequencer.swing;
      renderScaleNotes(); updateReadouts(); renderStepGrid(); updateStepEditor();
    }
  });
  qs('#randomPatternBtn').addEventListener('click', () => { sequencer.randomize(); renderStepGrid(); updateStepEditor(); });
  qs('#fillPageBtn').addEventListener('click',   () => { sequencer.fillPage();  renderStepGrid(); });
  qs('#clearPageBtn').addEventListener('click',  () => { sequencer.clearPage(); renderStepGrid(); updateStepEditor(); });
  qs('#shiftLeftBtn').addEventListener('click',  () => { sequencer.shiftPage(-1); renderStepGrid(); updateStepEditor(); });
  qs('#shiftRightBtn').addEventListener('click', () => { sequencer.shiftPage(1);  renderStepGrid(); updateStepEditor(); });
  qs('#copyPageBtn').addEventListener('click',   () => { sequencer.copyAToB(); renderStepGrid(); });
  qs('#stepMuteBtn').addEventListener('click',   () => { const s = sequencer.steps[sequencer.selected]; s.active = !s.active; updateStepEditor(); renderStepGrid(); });

  qs('#seqKey').addEventListener('change',   e => { sequencer.key   = e.target.value; renderScaleNotes(); });
  qs('#seqScale').addEventListener('change', e => { sequencer.scale = e.target.value; renderScaleNotes(); });
  qs('#bpm').addEventListener('input',       e => sequencer.bpm       = clamp(parseFloat(e.target.value) || 72, 40, 200));
  qs('#octaveShift').addEventListener('input',e => { sequencer.globalOctave = parseInt(e.target.value, 10); updateReadouts(); });
  qs('#gateLength').addEventListener('input', e => { sequencer.gate   = parseFloat(e.target.value); updateReadouts(); });
  qs('#humanize').addEventListener('input',   e => { sequencer.humanize = parseFloat(e.target.value); updateReadouts(); });
  qs('#swing').addEventListener('input',      e => { sequencer.swing  = parseFloat(e.target.value); updateReadouts(); });
  qs('#masterVolume').addEventListener('input',e => { engine.setMaster(parseFloat(e.target.value)); updateReadouts(); });
  qs('#presetSelect').addEventListener('change', e => applyPreset(e.target.value));
  qs('#keyboardOctave').addEventListener('input', e => { uiState.keyboardOctave = parseInt(e.target.value, 10); buildKeyboard(); updateReadouts(); });

  const stepBindings = {
    '#stepDegree':      (v, s) => s.degree      = parseInt(v, 10),
    '#stepChord':       (v, s) => s.chord        = v,
    '#stepOctave':      (v, s) => s.octave       = parseInt(v, 10),
    '#stepVelocity':    (v, s) => s.velocity     = parseFloat(v),
    '#stepProbability': (v, s) => s.probability  = parseFloat(v),
    '#stepRatchet':     (v, s) => s.ratchet      = parseInt(v, 10),
    '#stepMicro':       (v, s) => s.micro        = parseFloat(v),
    '#stepTie':         (v, s) => s.tie          = parseInt(v, 10),
    '#stepActive':      (v, s) => s.active       = v === '1',
    '#motionTarget':    (v, s) => s.motionTarget = v,
    '#motionAmount':    (v, s) => s.motionAmount = parseFloat(v),
  };
  Object.entries(stepBindings).forEach(([sel, fn]) => {
    const el = qs(sel);
    ['input', 'change'].forEach(ev => el.addEventListener(ev, e => { fn(e.target.value, sequencer.steps[sequencer.selected]); updateStepEditor(); renderStepGrid(); }));
  });

  qs('#stepAccentBtn').addEventListener('click', () => { const s = sequencer.steps[sequencer.selected]; s.accent = !s.accent; updateStepEditor(); renderStepGrid(); });
  qs('#stepToggleBtn').addEventListener('click', () => { const s = sequencer.steps[sequencer.selected]; s.active = !s.active; updateStepEditor(); renderStepGrid(); });
  qs('#copyStepBtn').addEventListener('click',   () => { sequencer.copiedStep = JSON.parse(JSON.stringify(sequencer.steps[sequencer.selected])); });
  qs('#pasteStepBtn').addEventListener('click',  () => { if (sequencer.copiedStep) { sequencer.steps[sequencer.selected] = { ...sequencer.copiedStep }; updateStepEditor(); renderStepGrid(); } });

  qsa('.toggle-btn').forEach(btn => btn.addEventListener('click', () => {
    const target = qs(`#${btn.dataset.target}`);
    const hidden = target.classList.toggle('hidden-section');
    btn.textContent = hidden ? 'SHOW' : 'HIDE';
  }));

  document.addEventListener('keydown', async e => {
    if (['INPUT', 'SELECT'].includes(document.activeElement?.tagName)) return;
    const idx = COMPUTER_KEYS.indexOf(e.key.toLowerCase());
    if (idx > -1) { await engine.start(); const midi = 12 * uiState.keyboardOctave + idx; engine.noteOn(midi, 0.82, 0.6); qsa('.key')[idx]?.classList.add('active'); }
    if (e.code === 'Space') { e.preventDefault(); if (!sequencer.playing) { await engine.start(); sequencer.start(); } else sequencer.stop(); }
  });
  document.addEventListener('keyup', e => { const idx = COMPUTER_KEYS.indexOf(e.key.toLowerCase()); if (idx > -1) qsa('.key')[idx]?.classList.remove('active'); });

  // ── INIT ──────────────────────────────────────────────────────────────────────
  updateReadouts(); renderScaleNotes(); buildKeyboard(); updateStepEditor(); renderStepGrid();
  applyPreset('✦ Drift Silk');

})();
