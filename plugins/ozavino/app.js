(() => {
  const qs = (s, el = document) => el.querySelector(s);
  const qsa = (s, el = document) => Array.from(el.querySelectorAll(s));
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const SCALE_MAP = {
    Major:[0,2,4,5,7,9,11],
    Minor:[0,2,3,5,7,8,10],
    Dorian:[0,2,3,5,7,9,10],
    Mixolydian:[0,2,4,5,7,9,10],
    Pentatonic:[0,3,5,7,10]
  };
  const CHORDS = {
    triad:[0,2,4], sus2:[0,1,4], sus4:[0,3,4], seventh:[0,2,4,6], ninth:[0,2,4,6,8], stack4:[0,3,6]
  };
  const MOTION_TARGETS = ['none','cutoff','fold','morph','warp','tape'];
  const COMPUTER_KEYS = ['a','w','s','e','d','f','t','g','y','h','u','j','k'];
  const MODELS = ['wood','bell','reed','voice','choir','glass','metal','organ'];

  class Voice {
    constructor(ctx, output){ this.ctx = ctx; this.output = output; this.active = false; this.endTimer = 0; }
    start(freq, velocity, params, when = this.ctx.currentTime, holdSeconds = 0.22){
      this.stop(when); this.active = true;
      const mix = this.ctx.createGain(), pre = this.ctx.createGain(), shaper = this.ctx.createWaveShaper(), vca = this.ctx.createGain(), filter = this.ctx.createBiquadFilter();
      this.vca = vca; this.oscs = [];
      const modelName = MODELS[Math.min(MODELS.length - 1, Math.floor(params.model * MODELS.length))] || 'wood';
      const modelShape = {
        wood:[1,0.7,0.4,0.2], bell:[1,0.3,0.75,0.15], reed:[1,0.55,0.35,0.1], voice:[1,0.48,0.28,0.18],
        choir:[1,0.42,0.24,0.16], glass:[1,0.18,0.54,0.28], metal:[1,0.22,0.62,0.38], organ:[1,0.85,0.55,0.35]
      }[modelName];
      shaper.curve = makeFoldCurve(params.fold + params.complexity * 0.35); shaper.oversample = '2x';
      for(let i=0;i<4;i++){
        const osc = this.ctx.createOscillator(), gain = this.ctx.createGain(), n = i + 1;
        const det = (Math.random()*2 - 1) * ((params.drift + params.organic * 0.4) * 4);
        osc.type = i % 2 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(freq * n * (1 + params.inharmonic * 0.08 * i * 0.65), when);
        osc.detune.setValueAtTime(det + params.index * i * 7, when);
        // Wavy slow detune drift — more drift = more organic waviness
        if(params.drift > 0.05 || params.organic > 0.2){
          const driftDepth = (params.drift * 18 + params.organic * 12) * (i % 2 === 0 ? 1 : -0.7);
          const driftRate = 0.18 + i * 0.07 + params.organic * 0.22;
          osc.detune.linearRampToValueAtTime(det + params.index * i * 7 + driftDepth, when + 1 / driftRate);
          osc.detune.linearRampToValueAtTime(det + params.index * i * 7 - driftDepth * 0.6, when + 2 / driftRate);
          osc.detune.linearRampToValueAtTime(det + params.index * i * 7, when + 3.2 / driftRate);
        }
        const tiltFactor = Math.pow(1 - params.tilt * 0.75, i);
        const amp = ((modelShape[i] || (1 / n)) * tiltFactor * (1 - i / 6)) * (0.8 + params.morph * 0.35);
        gain.gain.setValueAtTime(Math.max(0, amp), when);
        osc.connect(gain); gain.connect(mix); osc.start(when); osc.stop(when + holdSeconds + 3); this.oscs.push({osc});
      }
      mix.connect(pre); pre.connect(shaper); shaper.connect(filter); filter.connect(vca); vca.connect(this.output);
      // Pad-aware envelope: morph & space open up attack and release significantly
      const padFactor = (params.morph * 0.5 + params.space * 0.5); // 0–1
      const envAttack = 0.003 + (1 - params.focus) * 0.06 + params.space * 0.18 + padFactor * 0.32;
      const envDecay = 0.14 + params.space * 0.9 + params.grain * 0.4 + padFactor * 0.6;
      const sustain = 0.28 + params.morph * 0.38 + params.space * 0.22;
      const release = 0.18 + params.space * 1.4 + params.age * 1.2 + padFactor * 0.8;
      const level = velocity * (0.7 + params.drive * 0.18 + params.accentBoost);
      vca.gain.setValueAtTime(0.0001, when);
      vca.gain.linearRampToValueAtTime(level, when + envAttack);
      vca.gain.linearRampToValueAtTime(level * sustain, when + envAttack + envDecay);
      vca.gain.setValueAtTime(level * sustain, when + holdSeconds);
      vca.gain.exponentialRampToValueAtTime(0.0001, when + holdSeconds + release);
      filter.type = 'lowpass';
      const cutoff = Math.max(120, 160 + params.cutoff * 6600 + params.focus * 1500 - params.lofi * 500);
      filter.frequency.setValueAtTime(cutoff, when);
      filter.Q.setValueAtTime(0.5 + params.resonance * 11, when);
      const envPeak = cutoff + params.env * 3600 + params.accentBoost * 1400;
      filter.frequency.linearRampToValueAtTime(envPeak, when + envAttack * 0.7 + 0.01);
      // Slow wavy filter evolution for pads (blur/warp add gentle sweep)
      const filterSweep = cutoff * (0.7 + sustain * 0.35);
      const sweepTime = when + holdSeconds + Math.max(0.08, release * 0.5);
      const waveMid = cutoff * (0.85 + params.warp * 0.3);
      filter.frequency.linearRampToValueAtTime(waveMid, when + holdSeconds + release * 0.25);
      filter.frequency.exponentialRampToValueAtTime(Math.max(140, filterSweep), sweepTime);
      pre.gain.setValueAtTime(1 + params.drive * 1.3 + params.tape * 0.4, when);
      this.endTimer = when + holdSeconds + release + 0.1;
    }
    stop(when = this.ctx ? this.ctx.currentTime : 0){
      if(!this.active) return;
      try {
        if(this.vca){ this.vca.gain.cancelScheduledValues(when); this.vca.gain.setTargetAtTime(0.0001, when, 0.03); }
        if(this.oscs){ this.oscs.forEach(({osc}) => { try { osc.stop(when + 0.06); } catch(_){} }); }
      } catch(_){}
      this.active = false;
    }
  }

  class SynthEngine {
    constructor(){
      this.ctx = null; this.master = null; this.input = null; this.voices = []; this.started = false;
      this.params = {
        harmonics:0.5, tilt:0.5, inharmonic:0.1, drift:0.08, fold:0.18, index:0.12, model:0.2, morph:0.2,
        blur:0.1, warp:0.1, freeze:0, grain:0.08, cutoff:0.6, resonance:0.2, drive:0.16, env:0.3,
        tape:0.18, lofi:0.04, echo:0.14, space:0.16, organic:0.2, complexity:0.2, focus:0.6, age:0.15, accentBoost:0
      };
      this.masterValue = 0.78;
    }
    async start(){
      if(this.started){ if(this.ctx.state === 'suspended') await this.ctx.resume(); return; }
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.input = this.ctx.createGain(); this.tapePre = this.ctx.createGain(); this.tapeDrive = this.ctx.createWaveShaper();
      this.lofiNode = this.ctx.createWaveShaper(); this.tone = this.ctx.createBiquadFilter(); this.delay = this.ctx.createDelay(1.5);
      this.delayFeedback = this.ctx.createGain(); this.delayMix = this.ctx.createGain(); this.reverbDelay = this.ctx.createDelay(0.12);
      this.reverbFeedback = this.ctx.createGain(); this.reverbWet = this.ctx.createGain(); this.master = this.ctx.createGain();
      this.delayLP = this.ctx.createBiquadFilter(); this.reverbHP = this.ctx.createBiquadFilter(); const dry = this.ctx.createGain();
      this.delayLP.type = 'lowpass'; this.reverbHP.type = 'highpass'; this.tone.type = 'lowpass';
      this.input.connect(this.tapePre); this.tapePre.connect(this.tapeDrive); this.tapeDrive.connect(this.lofiNode); this.lofiNode.connect(this.tone);
      this.tone.connect(dry); dry.connect(this.master);
      this.tone.connect(this.delay); this.delay.connect(this.delayLP); this.delayLP.connect(this.delayFeedback); this.delayFeedback.connect(this.delay); this.delayLP.connect(this.delayMix); this.delayMix.connect(this.master);
      this.tone.connect(this.reverbDelay); this.reverbDelay.connect(this.reverbHP); this.reverbHP.connect(this.reverbFeedback); this.reverbFeedback.connect(this.reverbDelay); this.reverbHP.connect(this.reverbWet); this.reverbWet.connect(this.master);
      this.master.connect(this.ctx.destination);
      for(let i=0;i<6;i++) this.voices.push(new Voice(this.ctx, this.input));
      this.started = true; this.updateFx();
    }
    panic(){ this.voices.forEach(v => v.stop(this.ctx ? this.ctx.currentTime : 0)); }
    setParam(name, value){ this.params[name] = value; this.updateFx(); }
    setMaster(value){ this.masterValue = value; if(this.master) this.master.gain.value = value; }
    updateFx(){
      if(!this.started) return; const p = this.params;
      this.tapePre.gain.value = 1 + p.tape * 1.8 + p.age * 0.6;
      this.tapeDrive.curve = makeDriveCurve(p.tape * 0.8 + p.drive * 0.5 + p.age * 0.3);
      this.lofiNode.curve = makeLoFiCurve(p.lofi * 0.8 + p.age * 0.2);
      this.tone.frequency.value = Math.max(800, 12000 - p.lofi * 7200 - p.age * 2200 + p.focus * 1300);
      this.delay.delayTime.value = 0.12 + p.echo * 0.62;
      this.delayFeedback.gain.value = 0.08 + p.echo * 0.72;
      this.delayMix.gain.value = p.echo * 0.42;
      this.reverbDelay.delayTime.value = 0.04 + p.space * 0.08;
      this.reverbFeedback.gain.value = 0.12 + p.space * 0.76;
      this.reverbWet.gain.value = p.space * 0.34;
      this.delayLP.frequency.value = 1600 + (1 - p.lofi) * 3200;
      this.reverbHP.frequency.value = 220 + p.age * 300;
      this.master.gain.value = this.masterValue;
    }
    noteOn(midi, velocity = 0.8, duration = 0.22, when = null, accentBoost = 0){
      if(!this.started) return; const time = when ?? this.ctx.currentTime;
      const freq = 440 * Math.pow(2, (midi - 69) / 12);
      const voice = this.voices.find(v => !v.active) || this.voices.reduce((a,b) => (a.endTimer || 0) < (b.endTimer || 0) ? a : b);
      const params = {...this.params, accentBoost}; voice.start(freq, velocity, params, time, duration);
    }
  }

  function makeDriveCurve(amount){
    const n = 512, curve = new Float32Array(n), k = 2 + amount * 40;
    for(let i=0;i<n;i++){ const x = i * 2 / (n - 1) - 1; curve[i] = Math.tanh(k * x) / Math.tanh(k); }
    return curve;
  }
  function makeFoldCurve(amount){
    const n = 512, curve = new Float32Array(n), folds = 1 + Math.floor(amount * 5), gain = 1 + amount * 4;
    for(let i=0;i<n;i++){
      let x = (i * 2 / (n - 1) - 1) * gain;
      for(let j=0;j<folds;j++){ if(x > 1) x = 2 - x; else if(x < -1) x = -2 - x; }
      curve[i] = clamp(x, -1, 1);
    }
    return curve;
  }
  function makeLoFiCurve(amount){
    const n = 256, curve = new Float32Array(n), steps = Math.max(8, Math.floor(64 - amount * 54));
    for(let i=0;i<n;i++){ const x = i * 2 / (n - 1) - 1; curve[i] = Math.round(x * steps) / steps; }
    return curve;
  }

  class Sequencer {
    constructor(engine){
      this.engine = engine;
      this.steps = Array.from({length:32}, (_,i) => this.makeStep(i));
      this.page = 0; this.chainMode = true; this.selected = 0; this.playing = false; this.current = -1; this.nextTick = 0; this.timer = null; this.copiedStep = null;
      this.key = 'C'; this.scale = 'Dorian'; this.globalOctave = 0; this.gate = 0.82; this.humanize = 0.015; this.swing = 0.04; this.bpm = 80;
      this.loadInitialPattern();
    }
    makeStep(i){ return { active:false, degree:1, chord:'triad', octave:0, velocity:0.72, probability:1, ratchet:1, micro:0, tie:0, accent:false, motionTarget:'none', motionAmount:0 }; }
    loadInitialPattern(){
      // Musical pad pattern: i – III – VII – V progression in 8-step blocks
      // Page A (steps 0–15): slow evolving chords, mostly on beats 1 & 3
      const pageA = [
        { i:0,  deg:1, chord:'triad',   vel:0.78, accent:false, prob:1,    motionTarget:'morph',  motionAmount:0.25 },
        { i:2,  deg:3, chord:'sus2',    vel:0.62, accent:false, prob:0.88, motionTarget:'none',   motionAmount:0 },
        { i:4,  deg:1, chord:'triad',   vel:0.74, accent:false, prob:1,    motionTarget:'cutoff', motionAmount:0.18 },
        { i:6,  deg:5, chord:'sus4',    vel:0.58, accent:false, prob:0.75, motionTarget:'none',   motionAmount:0 },
        { i:8,  deg:6, chord:'triad',   vel:0.76, accent:true,  prob:1,    motionTarget:'space',  motionAmount:0.22 },
        { i:10, deg:4, chord:'sus2',    vel:0.60, accent:false, prob:0.82, motionTarget:'none',   motionAmount:0 },
        { i:12, deg:2, chord:'triad',   vel:0.72, accent:false, prob:1,    motionTarget:'morph',  motionAmount:-0.15 },
        { i:14, deg:5, chord:'triad',   vel:0.64, accent:false, prob:0.70, motionTarget:'cutoff', motionAmount:0.20 },
      ];
      // Page B (steps 16–31): variation — more open voicings, one octave up on step 20
      const pageB = [
        { i:16, deg:1, chord:'triad',   vel:0.80, accent:false, prob:1,    motionTarget:'morph',  motionAmount:0.30 },
        { i:18, deg:3, chord:'sus4',    vel:0.65, accent:false, prob:0.85, motionTarget:'warp',   motionAmount:0.20 },
        { i:20, deg:7, chord:'triad',   vel:0.70, accent:true,  prob:1,    motionTarget:'space',  motionAmount:0.28, octave:1 },
        { i:22, deg:5, chord:'sus2',    vel:0.60, accent:false, prob:0.72, motionTarget:'none',   motionAmount:0 },
        { i:24, deg:6, chord:'triad',   vel:0.76, accent:false, prob:1,    motionTarget:'cutoff', motionAmount:0.22 },
        { i:26, deg:4, chord:'triad',   vel:0.62, accent:false, prob:0.80, motionTarget:'none',   motionAmount:0 },
        { i:28, deg:2, chord:'sus4',    vel:0.74, accent:false, prob:1,    motionTarget:'morph',  motionAmount:0.18 },
        { i:30, deg:1, chord:'triad',   vel:0.68, accent:true,  prob:0.90, motionTarget:'space',  motionAmount:0.32 },
      ];
      [...pageA, ...pageB].forEach(({ i, deg, chord, vel, accent, prob, motionTarget, motionAmount, octave = 0 }) => {
        this.steps[i].active = true;
        this.steps[i].degree = deg;
        this.steps[i].chord = chord;
        this.steps[i].velocity = vel;
        this.steps[i].accent = accent;
        this.steps[i].probability = prob;
        this.steps[i].motionTarget = motionTarget;
        this.steps[i].motionAmount = motionAmount;
        this.steps[i].octave = octave;
        this.steps[i].tie = 0;
      });
    }
    stepDuration(){ return 60 / this.bpm / 4; }
    visibleStart(){ return this.page * 16; }
    visibleEnd(){ return this.visibleStart() + 16; }
    pageIndices(){ const s = this.visibleStart(); return Array.from({length:16}, (_,i) => s + i); }
    start(){ if(!this.engine.started) return; this.playing = true; this.current = this.chainMode ? -1 : this.visibleStart() - 1; this.nextTick = this.engine.ctx.currentTime + 0.04; if(this.timer) clearInterval(this.timer); this.timer = setInterval(() => this.scheduler(), 25); }
    stop(){ this.playing = false; clearInterval(this.timer); this.timer = null; this.current = -1; renderStepGrid(); }
    scheduler(){
      const lookAhead = 0.12, stepDur = this.stepDuration();
      while(this.nextTick < this.engine.ctx.currentTime + lookAhead){
        let absIndex;
        if(this.chainMode) absIndex = (this.current + 1 + 32) % 32;
        else { const start = this.visibleStart(); const rel = ((this.current + 1 - start) % 16 + 16) % 16; absIndex = start + rel; }
        this.current = absIndex; this.scheduleStep(absIndex, this.nextTick); const isSwing = absIndex % 2 === 1; this.nextTick += stepDur + (isSwing ? stepDur * this.swing : 0);
      }
      renderStepGrid();
    }
    scheduleStep(index, when){
      const step = this.steps[index]; if(!step.active) return; if(Math.random() > step.probability) return;
      const scale = SCALE_MAP[this.scale], degreeIndex = clamp(step.degree - 1, 0, scale.length - 1);
      const rootMidi = 60 + NOTE_NAMES.indexOf(this.key) + 12 * (this.globalOctave + step.octave);
      const baseMidi = rootMidi + scale[degreeIndex];
      const intervals = CHORDS[step.chord] || CHORDS.triad, gateTime = this.stepDuration() * this.gate;
      const velocity = clamp(step.velocity + (step.accent ? 0.15 : 0), 0.05, 1), accentBoost = step.accent ? 0.18 : 0;
      const micro = step.micro + (Math.random()*2 - 1) * this.humanize;
      const motionRestore = applyMotion(step, this.engine);
      for(let r=0; r<step.ratchet; r++){
        const subTime = when + micro + (r * gateTime / step.ratchet);
        intervals.forEach(deg => {
          const octaveJump = Math.floor(deg / scale.length);
          const note = baseMidi + scale[deg % scale.length] + octaveJump * 12;
          this.engine.noteOn(note, velocity, Math.max(0.05, gateTime / step.ratchet * (step.tie ? 1.8 : 0.9)), subTime, accentBoost);
        });
      }
      if(motionRestore) setTimeout(motionRestore, Math.max(30, gateTime * 1000));
    }
    save(slot){ localStorage.setItem(`spectral-v81-pattern-${slot}`, JSON.stringify({steps:this.steps,key:this.key,scale:this.scale,globalOctave:this.globalOctave,gate:this.gate,humanize:this.humanize,bpm:this.bpm,swing:this.swing})); }
    load(slot){
      const raw = localStorage.getItem(`spectral-v81-pattern-${slot}`); if(!raw) return false;
      try { const data = JSON.parse(raw); this.steps = data.steps || this.steps; this.key = data.key || this.key; this.scale = data.scale || this.scale; this.globalOctave = data.globalOctave ?? this.globalOctave; this.gate = data.gate ?? this.gate; this.humanize = data.humanize ?? this.humanize; this.bpm = data.bpm ?? this.bpm; this.swing = data.swing ?? this.swing; return true; } catch(_) { return false; }
    }
    clearPage(){ this.pageIndices().forEach(i => this.steps[i].active = false); }
    fillPage(){ this.pageIndices().forEach(i => { this.steps[i].active = true; this.steps[i].degree = (i % SCALE_MAP[this.scale].length) + 1; }); }
    randomize(){
      const padChords = ['triad','sus2','sus4','triad','triad']; // bias toward triads
      const padMotions = ['none','none','morph','cutoff','space','warp'];
      this.steps.forEach((s, i) => {
        s.active = Math.random() > 0.52; // sparser than before — more musical space
        s.degree = 1 + Math.floor(Math.random() * SCALE_MAP[this.scale].length);
        s.chord = padChords[Math.floor(Math.random() * padChords.length)];
        s.velocity = 0.55 + Math.random() * 0.38;
        s.probability = 0.65 + Math.random() * 0.35;
        s.ratchet = 1; // no ratchets for pads
        s.micro = (Math.random()*2 - 1) * 0.018;
        s.accent = Math.random() > 0.88;
        s.tie = Math.random() > 0.88 ? 1 : 0;
        s.motionTarget = padMotions[Math.floor(Math.random() * padMotions.length)];
        s.motionAmount = s.motionTarget !== 'none' ? (Math.random() * 0.4 - 0.1) : 0;
        s.octave = Math.random() > 0.85 ? (Math.random() > 0.5 ? 1 : -1) : 0;
      });
    }
    shiftPage(dir){
      const ids = this.pageIndices(), snapshot = ids.map(i => ({...this.steps[i]}));
      ids.forEach((i, idx) => { const src = snapshot[(idx - dir + 16) % 16]; this.steps[i] = {...src}; });
    }
    copyAToB(){ for(let i=0;i<16;i++) this.steps[16+i] = {...this.steps[i]}; }
  }

  function applyMotion(step, engine){
    if(step.motionTarget === 'none' || Math.abs(step.motionAmount) < 0.001) return null;
    const target = step.motionTarget, original = engine.params[target], next = clamp(original + step.motionAmount * 0.35, 0, 1);
    engine.setParam(target, next); syncControl(target, next, false);
    return () => { engine.setParam(target, original); syncControl(target, original, false); };
  }

  const engine = new SynthEngine(), sequencer = new Sequencer(engine), uiState = { keyboardOctave:4 };
  const CONTROL_SETS = {
    sourceControls:[['harmonics','HARMONICS'],['tilt','TILT'],['inharmonic','INHARMONIC'],['drift','DRIFT'],['fold','FOLD'],['index','INDEX'],['model','MODEL'],['morph','MORPH']],
    textureControls:[['blur','BLUR'],['warp','WARP'],['freeze','FREEZE'],['grain','GRAIN']],
    toneControls:[['cutoff','CUTOFF'],['resonance','RESONANCE'],['drive','DRIVE'],['env','ENV']],
    fxControls:[['tape','TAPE'],['lofi','LOFI'],['echo','ECHO'],['space','SPACE']],
    macroControls:[['organic','ORGANIC'],['complexity','COMPLEXITY'],['focus','FOCUS'],['age','AGE']]
  };

  function makeControl(targetId, param, label){
    const wrap = document.createElement('div');
    wrap.className = 'knob-card';
    wrap.innerHTML = `<div class="knob-head"><span class="knob-title">${label}</span><span class="readout" data-readout="${param}"></span></div><input data-param="${param}" type="range" min="0" max="1" step="0.01" value="${engine.params[param]}">`;
    qs(`#${targetId}`).appendChild(wrap);
  }
  Object.entries(CONTROL_SETS).forEach(([target, list]) => list.forEach(([param,label]) => makeControl(target, param, label)));
  qsa('input[data-param]').forEach(inp => { const param = inp.dataset.param; inp.addEventListener('input', () => syncControl(param, parseFloat(inp.value), true)); syncControl(param, parseFloat(inp.value), false); });

  function syncControl(param, value, pushToEngine = true){
    qsa(`input[data-param="${param}"]`).forEach(el => el.value = value);
    qsa(`[data-readout="${param}"]`).forEach(el => { el.textContent = param === 'model' ? MODELS[Math.min(MODELS.length -1, Math.floor(value * MODELS.length))].toUpperCase() : `${Math.round(value * 100)}%`; });
    if(pushToEngine) engine.setParam(param, value);
  }

  function populateSelect(select, values){ values.forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; select.appendChild(o); }); }
  // Populate preset select with grouped optgroups
  (function populatePresetSelect(){
    const sel = qs('#presetSelect');
    const padGroup = document.createElement('optgroup'); padGroup.label = '— PADS ÉVOLUTIFS —';
    const classicGroup = document.createElement('optgroup'); classicGroup.label = '— CLASSIQUES —';
    const padNames = window.SPECTRAL_PAD_PRESETS || [];
    Object.keys(window.SPECTRAL_PRESETS || {}).forEach(name => {
      const o = document.createElement('option'); o.value = name; o.textContent = name;
      (padNames.includes(name) ? padGroup : classicGroup).appendChild(o);
    });
    sel.appendChild(padGroup); sel.appendChild(classicGroup);
  })();
  populateSelect(qs('#seqKey'), NOTE_NAMES); populateSelect(qs('#seqScale'), Object.keys(SCALE_MAP)); populateSelect(qs('#stepDegree'), Array.from({length:8}, (_,i)=> String(i+1))); populateSelect(qs('#stepChord'), Object.keys(CHORDS)); populateSelect(qs('#motionTarget'), MOTION_TARGETS);

  qs('#seqKey').value = sequencer.key; qs('#seqScale').value = sequencer.scale; qs('#bpm').value = sequencer.bpm; qs('#octaveShift').value = sequencer.globalOctave; qs('#gateLength').value = sequencer.gate; qs('#humanize').value = sequencer.humanize; qs('#swing').value = sequencer.swing; qs('#presetSelect').value = 'Velvet Wave';

  function updateReadouts(){
    qs('#masterReadout').textContent = `${Math.round(parseFloat(qs('#masterVolume').value) * 100)}%`;
    qs('#swingReadout').textContent = `${Math.round(parseFloat(qs('#swing').value) * 100)}%`;
    qs('#octaveReadout').textContent = String(sequencer.globalOctave);
    qs('#gateReadout').textContent = `${Math.round(sequencer.gate * 100)}%`;
    qs('#humanizeReadout').textContent = `${Math.round(sequencer.humanize * 1000)} ms`;
    qs('#keyboardOctaveReadout').textContent = String(uiState.keyboardOctave);
    qs('#pageStatusChip').textContent = `PAGE ${sequencer.page === 0 ? 'A' : 'B'} / 16 STEPS`;
    qs('#modeStatusChip').textContent = sequencer.chainMode ? 'CHAIN ON' : 'PAGE LOOP';
  }

  function renderScaleNotes(){
    const notes = SCALE_MAP[sequencer.scale].map(semi => NOTE_NAMES[(NOTE_NAMES.indexOf(sequencer.key) + semi) % 12]);
    qs('#scaleNotes').innerHTML = notes.map(n => `<span class="note-chip">${n}</span>`).join('');
  }
  function stepLabel(step){ return `${step.degree}/${step.chord.slice(0,3).toUpperCase()}`; }

  function renderStepGrid(){
    const grid = qs('#stepGrid'); grid.innerHTML = ''; const start = sequencer.visibleStart(), end = sequencer.visibleEnd();
    for(let i=start; i<end; i++){
      const step = sequencer.steps[i];
      const btn = document.createElement('button');
      btn.className = `step-btn ${step.active ? 'active' : 'off'} ${sequencer.selected === i ? 'selected' : ''} ${sequencer.current === i ? 'playing' : ''}`;
      btn.innerHTML = `<div class="step-top"><span>${i+1}</span><span>${step.active ? 'ON' : 'OFF'}</span></div><div class="step-note">${stepLabel(step)}</div><div class="step-flags">${step.accent ? '<span class="badge">ACC</span>' : ''}${step.ratchet > 1 ? `<span class="badge">R${step.ratchet}</span>` : ''}${step.tie ? '<span class="badge">TIE</span>' : ''}${step.motionTarget !== 'none' ? `<span class="badge motion">${step.motionTarget.slice(0,3).toUpperCase()}</span>` : ''}</div><div class="prob-bar"><i style="width:${step.probability*100}%"></i></div>`;
      btn.addEventListener('click', () => { sequencer.selected = i; updateStepEditor(); renderStepGrid(); });
      btn.addEventListener('dblclick', () => { step.active = !step.active; updateStepEditor(); renderStepGrid(); });
      grid.appendChild(btn);
    }
    qs('#stepSummary').textContent = `16 steps visible / ${sequencer.chainMode ? 'A→B 32 active' : 'page loop active'}`;
    qs('#pageABtn').classList.toggle('active', sequencer.page === 0);
    qs('#pageBBtn').classList.toggle('active', sequencer.page === 1);
    qs('#chainModeBtn').classList.toggle('active', sequencer.chainMode);
    updateReadouts();
  }

  function updateStepEditor(){
    const step = sequencer.steps[sequencer.selected];
    qs('#selectedStepLabel').textContent = `STEP ${sequencer.selected + 1} / PAGE ${sequencer.selected < 16 ? 'A' : 'B'}`;
    qs('#stepDegree').value = String(step.degree); qs('#stepChord').value = step.chord; qs('#stepOctave').value = step.octave; qs('#stepVelocity').value = step.velocity; qs('#stepProbability').value = step.probability; qs('#stepRatchet').value = step.ratchet; qs('#stepMicro').value = step.micro; qs('#stepTie').value = String(step.tie); qs('#stepActive').value = step.active ? '1' : '0'; qs('#motionTarget').value = step.motionTarget; qs('#motionAmount').value = step.motionAmount;
    qs('#stepAccentBtn').classList.toggle('active', step.accent);
    qs('#stepOctaveReadout').textContent = String(step.octave); qs('#stepVelocityReadout').textContent = `${Math.round(step.velocity*100)}%`; qs('#stepProbabilityReadout').textContent = `${Math.round(step.probability*100)}%`; qs('#stepRatchetReadout').textContent = `${step.ratchet}x`; qs('#stepMicroReadout').textContent = `${Math.round(step.micro*1000)} ms`; qs('#motionAmountReadout').textContent = `${Math.round(step.motionAmount*100)}%`;
  }

  function applyPreset(name){ const preset = window.SPECTRAL_PRESETS?.[name]; if(!preset) return; Object.entries(preset).forEach(([k,v]) => { if(k in engine.params) syncControl(k, v, true); }); }
  function buildKeyboard(){
    const keyboard = qs('#keyboard'); keyboard.innerHTML = ''; const base = 12 * uiState.keyboardOctave;
    for(let i=0;i<13;i++){
      const midi = base + i, name = NOTE_NAMES[midi % 12], isBlack = name.includes('#'); const key = document.createElement('button');
      key.className = `key ${isBlack ? 'black' : ''}`; key.textContent = COMPUTER_KEYS[i]?.toUpperCase() || name;
      const down = () => { key.classList.add('active'); engine.noteOn(midi, 0.82, 0.38); }, up = () => key.classList.remove('active');
      key.addEventListener('mousedown', down); key.addEventListener('mouseup', up); key.addEventListener('mouseleave', up);
      key.addEventListener('touchstart', e => { e.preventDefault(); down(); }, {passive:false}); key.addEventListener('touchend', up); keyboard.appendChild(key);
    }
  }

  qs('#audioBtn').addEventListener('click', async () => { await engine.start(); qs('#audioStatus').textContent = 'AUDIO ON'; qs('#audioBtn').textContent = 'AUDIO READY'; });
  qs('#panicBtn').addEventListener('click', () => engine.panic());
  qs('#playBtn').addEventListener('click', async () => { await engine.start(); sequencer.start(); });
  qs('#stopBtn').addEventListener('click', () => sequencer.stop());
  qs('#previewBtn').addEventListener('click', async () => { await engine.start(); sequencer.scheduleStep(sequencer.selected, engine.ctx.currentTime + 0.01); });
  qs('#pageABtn').addEventListener('click', () => { sequencer.page = 0; renderStepGrid(); updateStepEditor(); });
  qs('#pageBBtn').addEventListener('click', () => { sequencer.page = 1; renderStepGrid(); updateStepEditor(); });
  qs('#chainModeBtn').addEventListener('click', () => { sequencer.chainMode = !sequencer.chainMode; renderStepGrid(); });
  qs('#savePatternBtn').addEventListener('click', () => sequencer.save(qs('#patternSlot').value));
  qs('#loadPatternBtn').addEventListener('click', () => { if(sequencer.load(qs('#patternSlot').value)){ qs('#seqKey').value = sequencer.key; qs('#seqScale').value = sequencer.scale; qs('#bpm').value = sequencer.bpm; qs('#octaveShift').value = sequencer.globalOctave; qs('#gateLength').value = sequencer.gate; qs('#humanize').value = sequencer.humanize; qs('#swing').value = sequencer.swing; renderScaleNotes(); updateReadouts(); renderStepGrid(); updateStepEditor(); } });
  qs('#randomPatternBtn').addEventListener('click', () => { sequencer.randomize(); renderStepGrid(); updateStepEditor(); });
  qs('#fillPageBtn').addEventListener('click', () => { sequencer.fillPage(); renderStepGrid(); });
  qs('#clearPageBtn').addEventListener('click', () => { sequencer.clearPage(); renderStepGrid(); updateStepEditor(); });
  qs('#shiftLeftBtn').addEventListener('click', () => { sequencer.shiftPage(-1); renderStepGrid(); updateStepEditor(); });
  qs('#shiftRightBtn').addEventListener('click', () => { sequencer.shiftPage(1); renderStepGrid(); updateStepEditor(); });
  qs('#copyPageBtn').addEventListener('click', () => { sequencer.copyAToB(); renderStepGrid(); });
  qs('#stepMuteBtn').addEventListener('click', () => { const s = sequencer.steps[sequencer.selected]; s.active = !s.active; updateStepEditor(); renderStepGrid(); });

  qs('#seqKey').addEventListener('change', e => { sequencer.key = e.target.value; renderScaleNotes(); });
  qs('#seqScale').addEventListener('change', e => { sequencer.scale = e.target.value; renderScaleNotes(); });
  qs('#bpm').addEventListener('input', e => sequencer.bpm = clamp(parseFloat(e.target.value) || 112, 40, 220));
  qs('#octaveShift').addEventListener('input', e => { sequencer.globalOctave = parseInt(e.target.value,10); updateReadouts(); });
  qs('#gateLength').addEventListener('input', e => { sequencer.gate = parseFloat(e.target.value); updateReadouts(); });
  qs('#humanize').addEventListener('input', e => { sequencer.humanize = parseFloat(e.target.value); updateReadouts(); });
  qs('#swing').addEventListener('input', e => { sequencer.swing = parseFloat(e.target.value); updateReadouts(); });
  qs('#masterVolume').addEventListener('input', e => { engine.setMaster(parseFloat(e.target.value)); updateReadouts(); });
  qs('#presetSelect').addEventListener('change', e => applyPreset(e.target.value));
  qs('#keyboardOctave').addEventListener('input', e => { uiState.keyboardOctave = parseInt(e.target.value,10); buildKeyboard(); updateReadouts(); });

  const stepBindings = {
    '#stepDegree': (v,s) => s.degree = parseInt(v,10), '#stepChord': (v,s) => s.chord = v, '#stepOctave': (v,s) => s.octave = parseInt(v,10), '#stepVelocity': (v,s) => s.velocity = parseFloat(v), '#stepProbability': (v,s) => s.probability = parseFloat(v), '#stepRatchet': (v,s) => s.ratchet = parseInt(v,10), '#stepMicro': (v,s) => s.micro = parseFloat(v), '#stepTie': (v,s) => s.tie = parseInt(v,10), '#stepActive': (v,s) => s.active = v === '1', '#motionTarget': (v,s) => s.motionTarget = v, '#motionAmount': (v,s) => s.motionAmount = parseFloat(v),
  };
  Object.entries(stepBindings).forEach(([selector, fn]) => {
    const el = qs(selector);
    el.addEventListener('input', e => { fn(e.target.value, sequencer.steps[sequencer.selected]); updateStepEditor(); renderStepGrid(); });
    el.addEventListener('change', e => { fn(e.target.value, sequencer.steps[sequencer.selected]); updateStepEditor(); renderStepGrid(); });
  });
  qs('#stepAccentBtn').addEventListener('click', () => { const s = sequencer.steps[sequencer.selected]; s.accent = !s.accent; updateStepEditor(); renderStepGrid(); });
  qs('#stepToggleBtn').addEventListener('click', () => { const s = sequencer.steps[sequencer.selected]; s.active = !s.active; updateStepEditor(); renderStepGrid(); });
  qs('#copyStepBtn').addEventListener('click', () => { sequencer.copiedStep = JSON.parse(JSON.stringify(sequencer.steps[sequencer.selected])); });
  qs('#pasteStepBtn').addEventListener('click', () => { if(sequencer.copiedStep){ sequencer.steps[sequencer.selected] = {...sequencer.copiedStep}; updateStepEditor(); renderStepGrid(); } });

  qsa('.toggle-btn').forEach(btn => btn.addEventListener('click', () => {
    const target = qs(`#${btn.dataset.target}`); const hidden = target.classList.toggle('hidden-section'); btn.textContent = hidden ? 'SHOW' : 'HIDE';
  }));

  document.addEventListener('keydown', async e => {
    if(['INPUT','SELECT'].includes(document.activeElement?.tagName)) return;
    const idx = COMPUTER_KEYS.indexOf(e.key.toLowerCase());
    if(idx > -1){ await engine.start(); const midi = 12 * uiState.keyboardOctave + idx; engine.noteOn(midi, 0.82, 0.35); qsa('.key')[idx]?.classList.add('active'); }
    if(e.code === 'Space'){ e.preventDefault(); if(!sequencer.playing) { await engine.start(); sequencer.start(); } else sequencer.stop(); }
  });
  document.addEventListener('keyup', e => { const idx = COMPUTER_KEYS.indexOf(e.key.toLowerCase()); if(idx > -1) qsa('.key')[idx]?.classList.remove('active'); });

  updateReadouts(); renderScaleNotes(); buildKeyboard(); updateStepEditor(); renderStepGrid(); applyPreset('Velvet Wave');
})();
