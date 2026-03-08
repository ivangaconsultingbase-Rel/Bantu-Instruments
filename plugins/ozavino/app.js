
window.addEventListener('DOMContentLoaded', () => {
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
  const COMPUTER_KEYS = ['a','w','s','e','d','f','t','g','y','h','u','j','k'];

  class ModeledVoice {
    constructor(ctx, out){
      this.ctx = ctx; this.out = out; this.active = false; this.endTimer = 0;
    }
    start(freq, velocity, p, when = this.ctx.currentTime, hold = 0.28){
      this.stop(when);
      this.active = True = true;
      const source = this.ctx.createOscillator();
      const overtone = this.ctx.createOscillator();
      const sourceGain = this.ctx.createGain();
      const overtoneGain = this.ctx.createGain();
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.makeNoiseBuffer();
      const noiseGain = this.ctx.createGain();
      const bodyFilter = this.ctx.createBiquadFilter();
      const spectral = this.ctx.createBiquadFilter();
      const lowpass = this.ctx.createBiquadFilter();
      const vca = this.ctx.createGain();
      const mix = this.ctx.createGain();

      this.source = source; this.overtone = overtone; this.noise = noise; this.vca = vca;

      source.connect(sourceGain); overtone.connect(overtoneGain); noise.connect(noiseGain);
      sourceGain.connect(mix); overtoneGain.connect(mix); noiseGain.connect(mix);
      mix.connect(bodyFilter); bodyFilter.connect(spectral); spectral.connect(lowpass); lowpass.connect(vca); vca.connect(this.out);

      const model = p.sourceModel || 'string';
      const bright = p.bright || 0;
      const body = p.body || 0;
      const decay = p.decay || 0;
      const morph = p.morph || 0;
      const spectralAmt = p.spectral || 0;
      const grain = p.grain || 0;
      const organic = p.organic || 0;
      const age = p.age || 0;

      if(model === 'string'){
        source.type = 'triangle';
        overtone.type = 'sine';
        source.frequency.setValueAtTime(freq, when);
        overtone.frequency.setValueAtTime(freq * (2.0 + bright * 0.35), when);
        source.detune.setValueAtTime((Math.random()*2 - 1) * (4 + organic * 10), when);
        overtone.detune.setValueAtTime((Math.random()*2 - 1) * (7 + organic * 14), when);
        sourceGain.gain.setValueAtTime(0.78, when);
        overtoneGain.gain.setValueAtTime(0.18 + bright * 0.18, when);
        noiseGain.gain.setValueAtTime(0.018 + (p.noise || 0) * 0.06, when);
        bodyFilter.type = 'bandpass';
        bodyFilter.frequency.setValueAtTime(500 + body * 1800, when);
        bodyFilter.Q.setValueAtTime(0.7 + body * 4.0, when);
      } else if(model === 'epiano'){
        source.type = 'sine';
        overtone.type = 'triangle';
        source.frequency.setValueAtTime(freq, when);
        overtone.frequency.setValueAtTime(freq * (2.0 + bright * 0.15), when);
        source.detune.setValueAtTime((Math.random()*2 - 1) * (1 + organic * 3), when);
        overtone.detune.setValueAtTime((Math.random()*2 - 1) * (3 + organic * 6), when);
        sourceGain.gain.setValueAtTime(0.72, when);
        overtoneGain.gain.setValueAtTime(0.20 + bright * 0.24, when);
        noiseGain.gain.setValueAtTime(0.008 + (p.noise || 0) * 0.03, when);
        bodyFilter.type = 'peaking';
        bodyFilter.frequency.setValueAtTime(700 + body * 1600, when);
        bodyFilter.Q.setValueAtTime(0.8 + body * 2.0, when);
        bodyFilter.gain.setValueAtTime(4 + body * 8, when);
      } else {
        source.type = 'square';
        overtone.type = 'triangle';
        source.frequency.setValueAtTime(freq, when);
        overtone.frequency.setValueAtTime(freq * (2.0 + bright * 0.45), when);
        source.detune.setValueAtTime((Math.random()*2 - 1) * (2 + organic * 5), when);
        overtone.detune.setValueAtTime((Math.random()*2 - 1) * (4 + organic * 7), when);
        sourceGain.gain.setValueAtTime(0.62, when);
        overtoneGain.gain.setValueAtTime(0.12 + bright * 0.14, when);
        noiseGain.gain.setValueAtTime(0.024 + (p.noise || 0) * 0.06, when);
        bodyFilter.type = 'highpass';
        bodyFilter.frequency.setValueAtTime(180 + body * 1100, when);
        bodyFilter.Q.setValueAtTime(0.7 + bright * 1.8, when);
      }

      spectral.type = morph > 0.45 ? 'bandpass' : 'peaking';
      spectral.frequency.setValueAtTime(600 + spectralAmt * 3400, when);
      spectral.Q.setValueAtTime(0.7 + spectralAmt * 5, when);
      if ('gain' in spectral) spectral.gain.setValueAtTime(-4 + morph * 12, when);

      lowpass.type = 'lowpass';
      const cutoff = Math.max(180, 240 + (p.cutoff || 0) * 5000 + (p.focus || 0) * 900 - (p.lofi || 0) * 500);
      lowpass.frequency.setValueAtTime(cutoff, when);
      lowpass.Q.setValueAtTime(0.5 + (p.resonance || 0) * 6, when);

      const attack = model === 'clav' ? 0.003 : (model === 'epiano' ? 0.008 : 0.014);
      const decayT = 0.20 + decay * 0.90 + grain * 0.35;
      const sustain = model === 'clav' ? 0.18 : (model === 'epiano' ? 0.32 : 0.40);
      const release = 0.18 + decay * 1.2 + (p.space || 0) * 1.0 + age * 0.6;
      const level = velocity * (0.66 + (p.drive || 0) * 0.16 + (p.stepAccent || 0));

      vca.gain.setValueAtTime(0.0001, when);
      vca.gain.linearRampToValueAtTime(level, when + attack);
      vca.gain.linearRampToValueAtTime(level * sustain, when + attack + decayT);
      vca.gain.setValueAtTime(level * sustain, when + hold);
      vca.gain.exponentialRampToValueAtTime(0.0001, when + hold + release);

      const peak = cutoff + (p.env || 0) * 2400 + (p.stepAccent || 0) * 1200;
      lowpass.frequency.linearRampToValueAtTime(peak, when + attack + 0.01);
      lowpass.frequency.exponentialRampToValueAtTime(Math.max(180, cutoff * 0.75), when + hold + Math.max(0.12, release * 0.5));

      source.start(when); overtone.start(when); noise.start(when);
      source.stop(when + hold + release + 0.3);
      overtone.stop(when + hold + release + 0.3);
      noise.stop(when + Math.min(0.18, 0.04 + (p.noise || 0) * 0.1));
      this.endTimer = when + hold + release + 0.2;
    }
    stop(when = this.ctx ? this.ctx.currentTime : 0){
      if(!this.active) return;
      try{
        if(this.vca){
          this.vca.gain.cancelScheduledValues(when);
          this.vca.gain.setTargetAtTime(0.0001, when, 0.04);
        }
        ['source','overtone','noise'].forEach(k => {
          try { this[k] && this[k].stop(when + 0.05); } catch(_){}
        });
      } catch(_){}
      this.active = false;
    }
    makeNoiseBuffer(){
      const len = Math.max(2048, Math.floor(this.ctx.sampleRate * 0.18));
      const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for(let i=0;i<len;i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      return buffer;
    }
  }

  class Engine {
    constructor(){
      this.ctx = null; this.input = null; this.master = null; this.voices = []; this.started = false;
      this.params = {
        sourceModel:'string', tone:0.38, body:0.62, decay:0.82, bright:0.34,
        morph:0.34, spectral:0.22, grain:0.28, noise:0.08,
        cutoff:0.56, resonance:0.08, drive:0.10, env:0.16,
        tape:0.24, lofi:0.02, echo:0.20, space:0.48,
        organic:0.54, complexity:0.22, focus:0.44, age:0.18
      };
      this.masterValue = 0.82;
    }
    async start(){
      if(this.started){
        if(this.ctx.state === 'suspended') await this.ctx.resume();
        return;
      }
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
      this.input = this.ctx.createGain();
      this.tapePre = this.ctx.createGain();
      this.tapeDrive = this.ctx.createWaveShaper();
      this.lofiNode = this.ctx.createWaveShaper();
      this.moog = this.ctx.createBiquadFilter();
      this.delay = this.ctx.createDelay(1.5);
      this.delayFeedback = this.ctx.createGain();
      this.delayMix = this.ctx.createGain();
      this.reverbDelay = this.ctx.createDelay(0.18);
      this.reverbFeedback = this.ctx.createGain();
      this.reverbWet = this.ctx.createGain();
      this.master = this.ctx.createGain();
      this.delayLP = this.ctx.createBiquadFilter();
      this.reverbHP = this.ctx.createBiquadFilter();
      const dry = this.ctx.createGain();

      this.moog.type = 'lowpass';
      this.delayLP.type = 'lowpass';
      this.reverbHP.type = 'highpass';

      this.input.connect(this.tapePre);
      this.tapePre.connect(this.tapeDrive);
      this.tapeDrive.connect(this.lofiNode);
      this.lofiNode.connect(this.moog);
      this.moog.connect(dry); dry.connect(this.master);

      this.moog.connect(this.delay);
      this.delay.connect(this.delayLP);
      this.delayLP.connect(this.delayFeedback);
      this.delayFeedback.connect(this.delay);
      this.delayLP.connect(this.delayMix);
      this.delayMix.connect(this.master);

      this.moog.connect(this.reverbDelay);
      this.reverbDelay.connect(this.reverbHP);
      this.reverbHP.connect(this.reverbFeedback);
      this.reverbFeedback.connect(this.reverbDelay);
      this.reverbHP.connect(this.reverbWet);
      this.reverbWet.connect(this.master);

      this.master.connect(this.ctx.destination);
      for(let i=0;i<6;i++) this.voices.push(new ModeledVoice(this.ctx, this.input));
      this.started = true;
      this.updateFx();
    }
    setParam(name, value){ this.params[name] = value; this.updateFx(); }
    setMaster(v){ this.masterValue = v; if(this.master) this.master.gain.value = v; }
    panic(){ this.voices.forEach(v => v.stop(this.ctx ? this.ctx.currentTime : 0)); }
    updateFx(){
      if(!this.started) return;
      const p = this.params;
      this.tapePre.gain.value = 1 + p.tape * 1.1 + p.drive * 0.4;
      this.tapeDrive.curve = makeDriveCurve(p.tape * 0.5 + p.drive * 0.35 + p.age * 0.15);
      this.lofiNode.curve = makeLoFiCurve(p.lofi * 0.7 + p.age * 0.12);
      this.moog.frequency.value = Math.max(300, 600 + p.cutoff * 6400 + p.focus * 900);
      this.moog.Q.value = 0.6 + p.resonance * 7.5;
      this.delay.delayTime.value = 0.16 + p.echo * 0.62;
      this.delayFeedback.gain.value = 0.10 + p.echo * 0.56;
      this.delayMix.gain.value = p.echo * 0.35;
      this.reverbDelay.delayTime.value = 0.05 + p.space * 0.11;
      this.reverbFeedback.gain.value = 0.22 + p.space * 0.66;
      this.reverbWet.gain.value = p.space * 0.42;
      this.delayLP.frequency.value = 2200 + (1 - p.lofi) * 2200;
      this.reverbHP.frequency.value = 180 + p.age * 160;
      this.master.gain.value = this.masterValue;
    }
    noteOn(midi, velocity = 0.84, duration = 0.32, when = null, stepAccent = 0){
      if(!this.started) return;
      const t = when ?? this.ctx.currentTime;
      const freq = 440 * Math.pow(2, (midi - 69) / 12);
      const voice = this.voices.find(v => !v.active) || this.voices.reduce((a,b)=> (a.endTimer||0) < (b.endTimer||0) ? a : b);
      voice.start(freq, velocity, {...this.params, stepAccent}, t, duration);
    }
  }

  function makeDriveCurve(amount){
    const n = 512, curve = new Float32Array(n), k = 1.5 + amount * 18;
    for(let i=0;i<n;i++){ const x = i * 2 / (n - 1) - 1; curve[i] = Math.tanh(k * x) / Math.tanh(k); }
    return curve;
  }
  function makeLoFiCurve(amount){
    const n = 256, curve = new Float32Array(n), steps = Math.max(16, Math.floor(88 - amount * 50));
    for(let i=0;i<n;i++){ const x = i * 2 / (n - 1) - 1; curve[i] = Math.round(x * steps) / steps; }
    return curve;
  }

  class Sequencer {
    constructor(engine){
      this.engine = engine;
      this.steps = Array.from({length:32}, (_,i)=> this.makeStep(i));
      this.page = 0; this.chainMode = true; this.selected = 0; this.playing = false; this.current = -1;
      this.nextTick = 0; this.timer = null; this.copiedStep = null;
      this.key = 'C'; this.scale = 'Minor'; this.globalOctave = 0; this.gate = 0.58; this.humanize = 0.008; this.bpm = 108;
      this.loadInitialPattern();
    }
    makeStep(i){ return {active:i % 2 === 0, degree:(i % 7)+1, chord:i % 8 === 7 ? 'seventh':'triad', octave:0, velocity:0.84, probability:1, ratchet:1, micro:0, tie:0, accent:i % 8 === 4}; }
    loadInitialPattern(){
      [0,2,4,7,8,10,12,14,16,18,20,23,24,26,28,31].forEach(i => this.steps[i].active = true);
      [7,15,23,31].forEach(i => this.steps[i].chord = 'seventh');
      [4,12,20,28].forEach(i => this.steps[i].accent = true);
    }
    stepDur(){ return 60 / this.bpm / 4; }
    visibleStart(){ return this.page * 16; }
    pageIndices(){ const s = this.visibleStart(); return Array.from({length:16}, (_,i)=> s+i); }
    start(){
      if(!this.engine.started) return;
      this.playing = true; this.current = this.chainMode ? -1 : this.visibleStart() - 1; this.nextTick = this.engine.ctx.currentTime + 0.04;
      if(this.timer) clearInterval(this.timer);
      this.timer = setInterval(()=> this.scheduler(), 25);
    }
    stop(){ this.playing = false; clearInterval(this.timer); this.timer = null; this.current = -1; renderStepGrid(); }
    scheduler(){
      const lookAhead = 0.12, stepDur = this.stepDur();
      while(this.nextTick < this.engine.ctx.currentTime + lookAhead){
        let idx;
        if(this.chainMode) idx = (this.current + 1 + 32) % 32;
        else {
          const start = this.visibleStart();
          const rel = ((this.current + 1 - start) % 16 + 16) % 16;
          idx = start + rel;
        }
        this.current = idx;
        this.scheduleStep(idx, this.nextTick);
        this.nextTick += stepDur;
      }
      renderStepGrid();
    }
    scheduleStep(index, when){
      const s = this.steps[index];
      if(!s.active || Math.random() > s.probability) return;
      const scale = SCALE_MAP[this.scale];
      const degreeIndex = clamp(s.degree - 1, 0, scale.length - 1);
      const baseRoot = 60 + NOTE_NAMES.indexOf(this.key) + 12 * (this.globalOctave + s.octave);
      const baseMidi = baseRoot + scale[degreeIndex];
      const chord = CHORDS[s.chord] || CHORDS.triad;
      const gate = this.stepDur() * this.gate;
      const micro = s.micro + (Math.random()*2 - 1) * this.humanize;
      const vel = clamp(s.velocity + (s.accent ? 0.12 : 0), 0.05, 1);
      const accent = s.accent ? 0.14 : 0;
      for(let r=0;r<s.ratchet;r++){
        const sub = when + micro + r * gate / s.ratchet;
        chord.forEach(deg => {
          const oct = Math.floor(deg / scale.length);
          const note = baseMidi + scale[deg % scale.length] + oct * 12;
          this.engine.noteOn(note, vel, Math.max(0.08, gate / s.ratchet * (s.tie ? 1.9 : 1.1)), sub, accent);
        });
      }
    }
    fillPage(){ this.pageIndices().forEach(i => { this.steps[i].active = true; this.steps[i].degree = (i % SCALE_MAP[this.scale].length)+1; }); }
    clearPage(){ this.pageIndices().forEach(i => this.steps[i].active = false); }
    shiftPage(dir){
      const ids = this.pageIndices(), snap = ids.map(i => ({...this.steps[i]}));
      ids.forEach((i, idx) => { this.steps[i] = {...snap[(idx - dir + 16)%16]}; });
    }
    copyAToB(){ for(let i=0;i<16;i++) this.steps[16+i] = {...this.steps[i]}; }
  }

  const engine = new Engine();
  const seq = new Sequencer(engine);
  const uiState = { keyboardOctave:4 };

  const CONTROL_SETS = {
    sourceControls:[['tone','TONE'],['body','BODY'],['decay','DECAY'],['bright','BRIGHT']],
    textureControls:[['morph','MORPH'],['spectral','SPECTRAL'],['grain','GRAIN'],['noise','NOISE']],
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

  function syncControl(param, value, push = true){
    qsa(`input[data-param="${param}"]`).forEach(el => el.value = value);
    qsa(`[data-readout="${param}"]`).forEach(el => el.textContent = `${Math.round(value * 100)}%`);
    if(push) engine.setParam(param, value);
  }

  qsa('input[data-param]').forEach(inp => {
    const param = inp.dataset.param;
    inp.addEventListener('input', () => syncControl(param, parseFloat(inp.value), true));
    syncControl(param, parseFloat(inp.value), false);
  });

  function populateSelect(select, values){
    values.forEach(v => {
      const o = document.createElement('option');
      o.value = v; o.textContent = v; select.appendChild(o);
    });
  }
  populateSelect(qs('#seqKey'), NOTE_NAMES);
  populateSelect(qs('#seqScale'), Object.keys(SCALE_MAP));
  populateSelect(qs('#stepDegree'), Array.from({length:8}, (_,i)=> String(i+1)));
  populateSelect(qs('#stepChord'), Object.keys(CHORDS));
  populateSelect(qs('#presetSelect'), Object.keys(window.PRESETS_V10 || {}));

  qs('#seqKey').value = seq.key;
  qs('#seqScale').value = seq.scale;
  qs('#sourceModel').value = engine.params.sourceModel;
  qs('#presetSelect').value = 'String Mist Pad';

  function updateReadouts(){
    qs('#masterReadout').textContent = `${Math.round(parseFloat(qs('#masterVolume').value) * 100)}%`;
    qs('#octaveReadout').textContent = String(seq.globalOctave);
    qs('#gateReadout').textContent = `${Math.round(seq.gate * 100)}%`;
    qs('#humanizeReadout').textContent = `${Math.round(seq.humanize * 1000)} ms`;
    qs('#keyboardOctaveReadout').textContent = String(uiState.keyboardOctave);
  }

  function renderScaleNotes(){
    const notes = SCALE_MAP[seq.scale].map(semi => NOTE_NAMES[(NOTE_NAMES.indexOf(seq.key)+semi)%12]);
    qs('#scaleNotes').innerHTML = notes.map(n => `<span class="note-chip">${n}</span>`).join('');
  }

  function stepLabel(s){ return `${s.degree}/${s.chord.slice(0,3).toUpperCase()}`; }

  function renderStepGrid(){
    const grid = qs('#stepGrid');
    grid.innerHTML = '';
    const start = seq.visibleStart();
    for(let i=start;i<start+16;i++){
      const s = seq.steps[i];
      const btn = document.createElement('button');
      btn.className = `step-btn ${s.active ? 'active':'off'} ${seq.selected===i?'selected':''} ${seq.current===i?'playing':''}`;
      btn.innerHTML = `<div class="step-top"><span>${i+1}</span><span>${s.active?'ON':'OFF'}</span></div><div class="step-note">${stepLabel(s)}</div><div class="step-flags">${s.accent?'<span class="badge">ACC</span>':''}${s.ratchet>1?`<span class="badge">R${s.ratchet}</span>`:''}${s.tie?'<span class="badge">TIE</span>':''}</div><div class="prob-bar"><i style="width:${s.probability*100}%"></i></div>`;
      btn.addEventListener('click', ()=> { seq.selected = i; updateStepEditor(); renderStepGrid(); });
      btn.addEventListener('dblclick', ()=> { s.active = !s.active; updateStepEditor(); renderStepGrid(); });
      grid.appendChild(btn);
    }
    qs('#stepSummary').textContent = `16 steps visible / ${seq.chainMode ? 'A→B 32 active' : 'page loop active'}`;
  }

  function updateStepEditor(){
    const s = seq.steps[seq.selected];
    qs('#selectedStepLabel').textContent = `STEP ${seq.selected + 1} / PAGE ${seq.selected < 16 ? 'A':'B'}`;
    qs('#stepDegree').value = String(s.degree);
    qs('#stepChord').value = s.chord;
    qs('#stepOctave').value = s.octave;
    qs('#stepVelocity').value = s.velocity;
    qs('#stepProbability').value = s.probability;
    qs('#stepRatchet').value = s.ratchet;
    qs('#stepMicro').value = s.micro;
    qs('#stepTie').value = String(s.tie);
    qs('#stepActive').value = s.active ? '1':'0';
    qs('#stepAccentBtn').classList.toggle('active', s.accent);
    qs('#stepOctaveReadout').textContent = String(s.octave);
    qs('#stepVelocityReadout').textContent = `${Math.round(s.velocity * 100)}%`;
    qs('#stepProbabilityReadout').textContent = `${Math.round(s.probability * 100)}%`;
    qs('#stepRatchetReadout').textContent = `${s.ratchet}x`;
    qs('#stepMicroReadout').textContent = `${Math.round(s.micro * 1000)} ms`;
  }

  function applyPreset(name){
    const p = window.PRESETS_V10?.[name];
    if(!p) return;
    if(p.sourceModel){
      engine.setParam('sourceModel', p.sourceModel);
      qs('#sourceModel').value = p.sourceModel;
    }
    Object.entries(p).forEach(([k,v]) => {
      if(k === 'sourceModel') return;
      syncControl(k, v, true);
    });
  }

  function buildKeyboard(){
    const keyboard = qs('#keyboard');
    keyboard.innerHTML = '';
    const base = 12 * uiState.keyboardOctave;
    for(let i=0;i<13;i++){
      const midi = base + i;
      const name = NOTE_NAMES[midi % 12];
      const isBlack = name.includes('#');
      const key = document.createElement('button');
      key.className = `key ${isBlack ? 'black':''}`;
      key.textContent = COMPUTER_KEYS[i]?.toUpperCase() || name;
      const down = async () => {
        await engine.start();
        key.classList.add('active');
        engine.noteOn(midi, 0.86, 0.40);
      };
      const up = ()=> key.classList.remove('active');
      key.addEventListener('mousedown', down);
      key.addEventListener('mouseup', up);
      key.addEventListener('mouseleave', up);
      key.addEventListener('touchstart', e => { e.preventDefault(); down(); }, {passive:false});
      key.addEventListener('touchend', up);
      keyboard.appendChild(key);
    }
  }

  async function safeStartAudio(){
    try{
      await engine.start();
      qs('#audioStatus').textContent = 'AUDIO ON';
      qs('#audioBtn').textContent = 'AUDIO READY';
      return true;
    } catch(err){
      console.error(err);
      qs('#audioStatus').textContent = 'AUDIO ERROR';
      return false;
    }
  }

  qs('#audioBtn').addEventListener('click', safeStartAudio);
  qs('#panicBtn').addEventListener('click', ()=> engine.panic());
  qs('#playBtn').addEventListener('click', async ()=> { const ok = await safeStartAudio(); if(ok) seq.start(); });
  qs('#stopBtn').addEventListener('click', ()=> seq.stop());
  qs('#previewBtn').addEventListener('click', async ()=> { const ok = await safeStartAudio(); if(ok) seq.scheduleStep(seq.selected, engine.ctx.currentTime + 0.01); });

  qs('#pageABtn').addEventListener('click', ()=> { seq.page = 0; qs('#pageABtn').classList.add('active'); qs('#pageBBtn').classList.remove('active'); renderStepGrid(); updateStepEditor(); });
  qs('#pageBBtn').addEventListener('click', ()=> { seq.page = 1; qs('#pageBBtn').classList.add('active'); qs('#pageABtn').classList.remove('active'); renderStepGrid(); updateStepEditor(); });
  qs('#chainModeBtn').addEventListener('click', ()=> { seq.chainMode = !seq.chainMode; qs('#chainModeBtn').classList.toggle('active', seq.chainMode); renderStepGrid(); });
  qs('#fillPageBtn').addEventListener('click', ()=> { seq.fillPage(); renderStepGrid(); });
  qs('#clearPageBtn').addEventListener('click', ()=> { seq.clearPage(); renderStepGrid(); updateStepEditor(); });
  qs('#shiftLeftBtn').addEventListener('click', ()=> { seq.shiftPage(-1); renderStepGrid(); updateStepEditor(); });
  qs('#shiftRightBtn').addEventListener('click', ()=> { seq.shiftPage(1); renderStepGrid(); updateStepEditor(); });
  qs('#copyPageBtn').addEventListener('click', ()=> { seq.copyAToB(); renderStepGrid(); });

  qs('#seqKey').addEventListener('change', e => { seq.key = e.target.value; renderScaleNotes(); });
  qs('#seqScale').addEventListener('change', e => { seq.scale = e.target.value; renderScaleNotes(); });
  qs('#bpm').addEventListener('input', e => { seq.bpm = clamp(parseFloat(e.target.value) || 108, 40, 220); });
  qs('#octaveShift').addEventListener('input', e => { seq.globalOctave = parseInt(e.target.value, 10); updateReadouts(); });
  qs('#gateLength').addEventListener('input', e => { seq.gate = parseFloat(e.target.value); updateReadouts(); });
  qs('#humanize').addEventListener('input', e => { seq.humanize = parseFloat(e.target.value); updateReadouts(); });
  qs('#masterVolume').addEventListener('input', e => { engine.setMaster(parseFloat(e.target.value)); updateReadouts(); });
  qs('#sourceModel').addEventListener('change', e => engine.setParam('sourceModel', e.target.value));
  qs('#presetSelect').addEventListener('change', e => applyPreset(e.target.value));
  qs('#keyboardOctave').addEventListener('input', e => { uiState.keyboardOctave = parseInt(e.target.value,10); buildKeyboard(); updateReadouts(); });

  const stepBindings = {
    '#stepDegree': (v,s) => s.degree = parseInt(v,10),
    '#stepChord': (v,s) => s.chord = v,
    '#stepOctave': (v,s) => s.octave = parseInt(v,10),
    '#stepVelocity': (v,s) => s.velocity = parseFloat(v),
    '#stepProbability': (v,s) => s.probability = parseFloat(v),
    '#stepRatchet': (v,s) => s.ratchet = parseInt(v,10),
    '#stepMicro': (v,s) => s.micro = parseFloat(v),
    '#stepTie': (v,s) => s.tie = parseInt(v,10),
    '#stepActive': (v,s) => s.active = v === '1'
  };
  Object.entries(stepBindings).forEach(([selector, fn]) => {
    const el = qs(selector);
    ['input','change'].forEach(ev => el.addEventListener(ev, e => { fn(e.target.value, seq.steps[seq.selected]); updateStepEditor(); renderStepGrid(); }));
  });
  qs('#stepAccentBtn').addEventListener('click', ()=> { const s = seq.steps[seq.selected]; s.accent = !s.accent; updateStepEditor(); renderStepGrid(); });
  qs('#copyStepBtn').addEventListener('click', ()=> { seq.copiedStep = JSON.parse(JSON.stringify(seq.steps[seq.selected])); });
  qs('#pasteStepBtn').addEventListener('click', ()=> { if(seq.copiedStep){ seq.steps[seq.selected] = {...seq.copiedStep}; updateStepEditor(); renderStepGrid(); } });

  qsa('.toggle-btn').forEach(btn => btn.addEventListener('click', ()=> {
    const target = qs(`#${btn.dataset.target}`);
    const hidden = target.classList.toggle('hidden-section');
    btn.textContent = hidden ? 'SHOW' : 'HIDE';
  }));

  document.addEventListener('keydown', async e => {
    if(['INPUT','SELECT'].includes(document.activeElement?.tagName)) return;
    const idx = COMPUTER_KEYS.indexOf(e.key.toLowerCase());
    if(idx > -1){
      const ok = await safeStartAudio();
      if(ok){
        const midi = 12 * uiState.keyboardOctave + idx;
        engine.noteOn(midi, 0.86, 0.40);
        qsa('.key')[idx]?.classList.add('active');
      }
    }
    if(e.code === 'Space'){
      e.preventDefault();
      const ok = await safeStartAudio();
      if(ok){
        if(!seq.playing) seq.start();
        else seq.stop();
      }
    }
  });
  document.addEventListener('keyup', e => {
    const idx = COMPUTER_KEYS.indexOf(e.key.toLowerCase());
    if(idx > -1) qsa('.key')[idx]?.classList.remove('active');
  });

  updateReadouts();
  renderScaleNotes();
  buildKeyboard();
  updateStepEditor();
  renderStepGrid();
  applyPreset('String Mist Pad');
});
