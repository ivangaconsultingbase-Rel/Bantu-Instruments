(() => {
  const NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const SCALES = {
    major: [0,2,4,5,7,9,11],
    minor: [0,2,3,5,7,8,10],
    dorian:[0,2,3,5,7,9,10],
    mixolydian:[0,2,4,5,7,9,10],
    pentMajor:[0,2,4,7,9],
    pentMinor:[0,3,5,7,10],
    harmonicMinor:[0,2,3,5,7,8,11]
  };
  const CHORDS = {
    triad:[0,2,4], sus2:[0,1,4], sus4:[0,3,4], seventh:[0,2,4,6], sixth:[0,2,4,5], power:[0,4], add9:[0,2,4,1]
  };
  const CONDITIONS = ['always','1:2','2:2','1:4','2:4','3:4','4:4'];

  const params = {...window.SPECTRAL_PRESETS.init};
  const state = {
    ctx:null, master:null, delay:null, convolver:null, nowPlaying:false,
    currentPage:'A', playMode:'page', stepIndex:0, tick:0, selectedStep:0,
    chain:[1,2,3,4], chainPos:0, currentSlot:1,
    clipboard:null, heldKeys:new Map(), scheduler:null,
    key:'C', scale:'major', bpm:108,
    steps:{ A:createPage(), B:createPage() },
    lastStepAt:0, conditionCounter:0
  };

  function createPage(){
    return Array.from({length:16}, (_,i)=>({
      on:i===0||i===4||i===8||i===12,
      degree:(i%7)+1,
      chord:'triad',
      octave:0,
      velocity:0.85,
      chance:1,
      accent:false,
      tie:false,
      ratchet:1,
      micro:0,
      condition:'always'
    }));
  }

  function initAudio(){
    if(state.ctx) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const master = ctx.createGain(); master.gain.value = 0.72;
    const drive = ctx.createWaveShaper(); drive.curve = makeDriveCurve(120); drive.oversample='2x';
    const bitMix = ctx.createGain();
    const wet = ctx.createGain(); wet.gain.value = 0.18;
    const dry = ctx.createGain(); dry.gain.value = 0.82;
    const delay = ctx.createDelay(1.2); delay.delayTime.value = 0.24;
    const fb = ctx.createGain(); fb.gain.value = 0.28;
    const echoWet = ctx.createGain(); echoWet.gain.value = 0.25;
    const echoDry = ctx.createGain(); echoDry.gain.value = 0.86;
    delay.connect(fb); fb.connect(delay);
    const convolver = ctx.createConvolver(); convolver.buffer = createImpulse(ctx, 2.2, 2.2);
    const reverbWet = ctx.createGain(); reverbWet.gain.value = 0.18;

    drive.connect(dry);
    drive.connect(bitMix);
    bitMix.connect(wet);
    dry.connect(echoDry); wet.connect(echoDry);
    echoDry.connect(master);
    echoDry.connect(delay);
    delay.connect(echoWet); echoWet.connect(master);
    echoWet.connect(convolver); convolver.connect(reverbWet); reverbWet.connect(master);
    master.connect(ctx.destination);

    state.ctx=ctx; state.master={input:drive, drive, bitMix, wet, dry, fb, echoWet, echoDry, reverbWet}; state.delay=delay; state.convolver=convolver;
    updateFx();
  }

  class Voice {
    constructor(freq, velocity, dur=0.35){
      const ctx = state.ctx;
      this.output = ctx.createGain();
      this.output.gain.value = 0;
      this.filter = ctx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.Q.value = 1 + params.resonance * 18;
      const cut = 180 + params.cutoff * 9000;
      this.filter.frequency.value = cut;

      this.oscs = [];
      const harmonics = 3 + Math.round(params.harmonics * 7 + params.complexity*4);
      const inharm = params.inharmonic * 0.07;
      for(let i=1;i<=harmonics;i++){
        const osc = ctx.createOscillator();
        osc.type = i===1 ? 'sawtooth' : 'sine';
        const g = ctx.createGain();
        const ampBase = Math.max(0.03, Math.pow(1/i, 1 + params.tilt*1.6));
        g.gain.value = ampBase * (velocity * (i===1 ? 0.55 : 0.7/harmonics));
        const det = (Math.random()-0.5) * (params.drift + params.organic*0.4) * 10;
        const foldBoost = 1 + params.fold * 0.25;
        osc.frequency.value = (freq * i * (1 + inharm*(i-1))) + det;
        osc.connect(g); g.connect(this.filter);
        osc.start();
        this.oscs.push({osc,g,foldBoost});
      }

      this.filter.connect(this.output);
      this.output.connect(state.master.input);
      const now = ctx.currentTime;
      const a = 0.004 + params.attack * 0.45;
      const d = 0.04 + params.decay * 0.7;
      const s = 0.1 + params.sustain * 0.9;
      const r = 0.05 + params.release * 1.5;
      const envAmt = 400 + params.env * 7000;
      this.output.gain.cancelScheduledValues(now);
      this.output.gain.setValueAtTime(0.0001, now);
      this.output.gain.linearRampToValueAtTime(0.95 * velocity, now + a);
      this.output.gain.linearRampToValueAtTime(velocity * s, now + a + d);
      this.filter.frequency.cancelScheduledValues(now);
      this.filter.frequency.setValueAtTime(cut*0.5, now);
      this.filter.frequency.linearRampToValueAtTime(Math.min(12000, cut + envAmt), now + a*0.8);
      this.filter.frequency.exponentialRampToValueAtTime(Math.max(120, cut), now + a + d + dur * (this.tie ? 1.8:1));
      this.stopAt = now + a + d + dur + r;
      this.release = r;
      setTimeout(() => this.stop(), Math.max(50, (dur + a + d + r)*1000));
    }
    stop(){
      if(!this.oscs) return;
      const now = state.ctx.currentTime;
      this.output.gain.cancelScheduledValues(now);
      const current = Math.max(0.0001, this.output.gain.value || 0.2);
      this.output.gain.setValueAtTime(current, now);
      this.output.gain.exponentialRampToValueAtTime(0.0001, now + this.release);
      this.oscs.forEach(({osc})=>{ try{osc.stop(now + this.release + 0.03);}catch(e){} });
      const out = this.output;
      setTimeout(()=>{ try{out.disconnect();}catch(e){} }, (this.release+0.1)*1000);
      this.oscs = null;
    }
  }

  function makeDriveCurve(amount){
    const n = 256; const curve = new Float32Array(n);
    for(let i=0;i<n;i++){
      const x = (i/(n-1))*2-1;
      curve[i] = Math.tanh((1 + params.tape*4 + params.age*2) * x * (amount/40));
    }
    return curve;
  }

  function createImpulse(ctx, seconds, decay){
    const length = ctx.sampleRate * seconds;
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for(let c=0;c<2;c++){
      const data = impulse.getChannelData(c);
      for(let i=0;i<length;i++) data[i] = (Math.random()*2-1) * Math.pow(1 - i/length, decay);
    }
    return impulse;
  }

  function midiToFreq(midi){ return 440 * Math.pow(2, (midi-69)/12); }

  function getScaleNotes(){ return SCALES[state.scale]; }

  function degreeToMidi(degree, octaveOffset=0){
    const keyRoot = NOTES.indexOf(state.key);
    const scale = getScaleNotes();
    const idx = (degree-1) % scale.length;
    const oct = Math.floor((degree-1)/scale.length);
    return 60 + keyRoot + scale[idx] + (oct+octaveOffset)*12;
  }

  function chordToMidis(step){
    const base = degreeToMidi(step.degree, step.octave);
    const scale = getScaleNotes();
    const chordShape = CHORDS[step.chord] || CHORDS.triad;
    return chordShape.map(intervalScaleIndex => {
      const targetDegree = step.degree + intervalScaleIndex;
      return degreeToMidi(targetDegree, step.octave);
    });
  }

  function scheduleStep(step, when){
    if(!state.ctx || !step.on) return;
    if(Math.random() > step.chance) return;
    if(!conditionPass(step.condition)) return;
    const mids = chordToMidis(step);
    const velocity = Math.min(1, step.velocity * (step.accent ? 1.18 : 1));
    const dur = step.tie ? 0.55 : 0.24;
    const ratchet = step.ratchet || 1;
    for(let r=0;r<ratchet;r++){
      const offset = r * (60 / state.bpm / 4) / ratchet;
      const playAt = when + offset + (step.micro / 1000);
      mids.forEach((m)=>{
        const wait = Math.max(0, (playAt - state.ctx.currentTime) * 1000);
        setTimeout(()=> new Voice(midiToFreq(m), velocity, dur/ratchet), wait);
      });
    }
  }

  function conditionPass(condition){
    if(condition === 'always') return true;
    const [a,b] = condition.split(':').map(Number);
    state.conditionCounter = (state.conditionCounter % b) + 1;
    return state.conditionCounter === a;
  }

  function currentPageSteps(){ return state.steps[state.currentPage]; }

  function getPlayStep(){
    if(state.playMode === 'page') return {page:state.currentPage,index:state.stepIndex};
    return state.stepIndex < 16
      ? {page:'A', index:state.stepIndex}
      : {page:'B', index:state.stepIndex - 16};
  }

  function stepAdvance(){
    const max = state.playMode === 'page' ? 16 : 32;
    state.stepIndex = (state.stepIndex + 1) % max;
  }

  function startTransport(){
    initAudio();
    state.ctx.resume();
    if(state.nowPlaying) return;
    state.nowPlaying = true;
    state.stepIndex = 0;
    document.getElementById('transportState').textContent = 'PLAYING';
    document.getElementById('playBtn').textContent = 'STOP';
    const interval = () => (60 / state.bpm / 4) * 1000;
    state.scheduler = setInterval(() => {
      const {page,index} = getPlayStep();
      const step = state.steps[page][index];
      scheduleStep(step, state.ctx.currentTime + 0.01);
      renderSteps(page, index);
      stepAdvance();
    }, interval());
  }

  function stopTransport(){
    state.nowPlaying = false;
    clearInterval(state.scheduler);
    state.scheduler = null;
    document.getElementById('transportState').textContent = 'STOPPED';
    document.getElementById('playBtn').textContent = 'PLAY';
    renderSteps();
  }

  function panic(){ stopTransport(); }

  function renderKnobs(){
    const groups = {
      sourceBody:[['harmonics','HARMONICS'],['tilt','TILT'],['inharmonic','INHARMONIC'],['drift','DRIFT']],
      timbreBody:[['fold','FOLD'],['index','INDEX'],['model','MODEL'],['morph','MORPH']],
      spectraBody:[['blur','BLUR'],['warp','WARP'],['freeze','FREEZE'],['grain','GRAIN']],
      toneBody:[['cutoff','CUTOFF'],['resonance','RESONANCE'],['drive','DRIVE'],['env','ENV']],
      spaceBody:[['tape','TAPE'],['lofi','LOFI'],['echo','ECHO'],['space','SPACE']],
      perfBody:[['attack','ATTACK'],['decay','DECAY'],['sustain','SUSTAIN'],['release','RELEASE'],['organic','ORGANIC'],['complexity','COMPLEXITY'],['focus','FOCUS'],['age','AGE']]
    };
    Object.entries(groups).forEach(([id,items])=>{
      const root = document.getElementById(id); root.innerHTML='';
      items.forEach(([key,label])=>{
        const card = document.createElement('label'); card.className='knob-card';
        card.innerHTML = `<label>${label}</label><input type="range" min="0" max="1" step="0.01" value="${params[key]}"><strong>${formatParam(params[key])}</strong>`;
        const input = card.querySelector('input'); const strong = card.querySelector('strong');
        input.addEventListener('input', ()=>{ params[key]=parseFloat(input.value); strong.textContent = formatParam(params[key]); updateFx(); });
        root.appendChild(card);
      });
    });
  }

  function formatParam(v){ return Math.round(v*100) + '%'; }

  function updateFx(){
    if(!state.master) return;
    state.master.drive.curve = makeDriveCurve(110 + params.drive*180);
    state.master.wet.gain.value = params.lofi * 0.65;
    state.master.dry.gain.value = 1 - params.lofi*0.42;
    state.delay.delayTime.value = 0.08 + params.echo * 0.62;
    state.master.fb.gain.value = 0.12 + params.echo * 0.62;
    state.master.echoWet.gain.value = params.echo * 0.48;
    state.master.reverbWet.gain.value = params.space * 0.55;
  }

  function renderKeyScale(){
    const keySel = document.getElementById('keySelect');
    const scaleSel = document.getElementById('scaleSelect');
    NOTES.forEach(n=> keySel.append(new Option(n,n)));
    Object.keys(SCALES).forEach(s=> scaleSel.append(new Option(s,s)));
    keySel.value = state.key; scaleSel.value = state.scale;
    keySel.onchange = ()=> state.key = keySel.value;
    scaleSel.onchange = ()=> state.scale = scaleSel.value;
  }

  function renderStepEditor(){
    const degree = document.getElementById('degreeSelect'); degree.innerHTML='';
    for(let i=1;i<=14;i++) degree.append(new Option(String(i), String(i)));
    const chord = document.getElementById('chordSelect'); chord.innerHTML='';
    Object.keys(CHORDS).forEach(k=> chord.append(new Option(k,k)));
    const cond = document.getElementById('conditionSelect'); cond.innerHTML='';
    CONDITIONS.forEach(c=> cond.append(new Option(c,c)));
    bindEditor();
    syncEditor();
  }

  function selectedStepObj(){ return currentPageSteps()[state.selectedStep]; }

  function bindEditor(){
    const map = {
      stepOn:['checked','on'], degreeSelect:['value','degree'], chordSelect:['value','chord'], octaveInput:['value','octave'], velocityInput:['value','velocity'],
      chanceInput:['value','chance'], ratchetInput:['value','ratchet'], microInput:['value','micro'], accentInput:['checked','accent'], tieInput:['checked','tie'], conditionSelect:['value','condition']
    };
    Object.entries(map).forEach(([id,[prop,key]])=>{
      const el = document.getElementById(id);
      el.addEventListener('input', ()=>{
        const step = selectedStepObj();
        let val = prop === 'checked' ? el.checked : el.value;
        if(['degree','octave','ratchet','micro'].includes(key)) val = parseInt(val,10);
        if(['velocity','chance'].includes(key)) val = parseFloat(val);
        step[key]=val; syncEditor(); renderSteps();
      });
    });
    document.getElementById('previewStepBtn').onclick = ()=>{ initAudio(); scheduleStep(selectedStepObj(), state.ctx.currentTime + 0.01); };
    document.getElementById('copyStepBtn').onclick = ()=> state.clipboard = JSON.parse(JSON.stringify(selectedStepObj()));
    document.getElementById('pasteStepBtn').onclick = ()=> { if(state.clipboard){ currentPageSteps()[state.selectedStep] = JSON.parse(JSON.stringify(state.clipboard)); syncEditor(); renderSteps(); } };
  }

  function syncEditor(){
    const step = selectedStepObj();
    document.getElementById('selectedStepLabel').textContent = `${state.currentPage}${String(state.selectedStep+1).padStart(2,'0')}`;
    document.getElementById('stepOn').checked = step.on;
    document.getElementById('degreeSelect').value = String(step.degree);
    document.getElementById('chordSelect').value = step.chord;
    document.getElementById('octaveInput').value = step.octave; document.getElementById('octaveVal').textContent = step.octave;
    document.getElementById('velocityInput').value = step.velocity; document.getElementById('velocityVal').textContent = step.velocity.toFixed(2);
    document.getElementById('chanceInput').value = step.chance; document.getElementById('chanceVal').textContent = Math.round(step.chance*100)+'%';
    document.getElementById('ratchetInput').value = step.ratchet; document.getElementById('ratchetVal').textContent = step.ratchet;
    document.getElementById('microInput').value = step.micro; document.getElementById('microVal').textContent = `${step.micro}ms`;
    document.getElementById('accentInput').checked = step.accent;
    document.getElementById('tieInput').checked = step.tie;
    document.getElementById('conditionSelect').value = step.condition;
  }

  function renderSteps(currentPageForPlay = null, currentIndex = -1){
    const grid = document.getElementById('stepGrid');
    grid.innerHTML='';
    currentPageSteps().forEach((step,i)=>{
      const btn = document.createElement('button');
      btn.className = 'step' + (step.on ? ' active' : '') + (step.accent ? ' accented':'') + (step.tie ? ' tieing':'') + (i===state.selectedStep ? ' selected':'') + ((currentPageForPlay===state.currentPage && currentIndex===i) ? ' current':'');
      btn.innerHTML = `<strong>${String(i+1).padStart(2,'0')}</strong><small>${step.degree} · ${step.chord}<br>oct ${step.octave >= 0 ? '+'+step.octave : step.octave} · vel ${step.velocity.toFixed(2)}</small><div class="flags">${step.ratchet>1?'<span class="flag">R'+step.ratchet+'</span>':''}${step.condition!=='always'?'<span class="flag">'+step.condition+'</span>':''}${step.micro!==0?'<span class="flag">'+step.micro+'ms</span>':''}</div>`;
      btn.onclick = ()=> { state.selectedStep = i; syncEditor(); renderSteps(currentPageForPlay, currentIndex); };
      btn.ondblclick = ()=> { step.on = !step.on; renderSteps(currentPageForPlay, currentIndex); syncEditor(); };
      grid.appendChild(btn);
    });
  }

  function setPage(page){
    state.currentPage = page;
    document.getElementById('pageA').classList.toggle('active', page==='A');
    document.getElementById('pageB').classList.toggle('active', page==='B');
    state.selectedStep = Math.min(state.selectedStep, 15);
    syncEditor(); renderSteps();
  }

  function wireTransport(){
    document.getElementById('audioBtn').onclick = ()=> { initAudio(); state.ctx.resume(); };
    document.getElementById('playBtn').onclick = ()=> state.nowPlaying ? stopTransport() : startTransport();
    document.getElementById('panicBtn').onclick = panic;
    document.getElementById('bpm').oninput = e => { state.bpm = parseInt(e.target.value,10); document.getElementById('bpmVal').textContent = state.bpm; if(state.nowPlaying){ stopTransport(); startTransport(); } };
    document.getElementById('playMode').onchange = e => state.playMode = e.target.value;
    document.getElementById('pageA').onclick = ()=> setPage('A');
    document.getElementById('pageB').onclick = ()=> setPage('B');
    document.getElementById('randomPageBtn').onclick = ()=> { currentPageSteps().forEach(s=>{ s.on = Math.random()>.35; s.degree = 1 + Math.floor(Math.random()*7); s.chord = Object.keys(CHORDS)[Math.floor(Math.random()*Object.keys(CHORDS).length)]; s.octave = [-1,0,0,1][Math.floor(Math.random()*4)]; s.velocity = 0.55 + Math.random()*0.4; s.chance = [1,1,1,0.75,0.5][Math.floor(Math.random()*5)]; s.ratchet=[1,1,1,2,3,4][Math.floor(Math.random()*6)]; s.accent=Math.random()>.75; s.tie=Math.random()>.84; s.micro=Math.floor((Math.random()-.5)*40); s.condition=CONDITIONS[Math.floor(Math.random()*CONDITIONS.length)];}); renderSteps(); syncEditor(); };
    document.getElementById('fillPageBtn').onclick = ()=> { currentPageSteps().forEach((s,i)=>{ s.on=true; s.degree=(i%7)+1; s.chord=i%4===3?'seventh':'triad'; }); renderSteps(); syncEditor(); };
    document.getElementById('clearPageBtn').onclick = ()=> { currentPageSteps().forEach(s=>{ s.on=false; s.tie=false; s.accent=false; s.ratchet=1; s.condition='always'; }); renderSteps(); syncEditor(); };
    document.getElementById('shiftLeftBtn').onclick = ()=> { const p=currentPageSteps(); p.push(p.shift()); renderSteps(); syncEditor(); };
    document.getElementById('shiftRightBtn').onclick = ()=> { const p=currentPageSteps(); p.unshift(p.pop()); renderSteps(); syncEditor(); };
    document.getElementById('copyPageBtn').onclick = ()=> { state.steps[state.currentPage==='A'?'B':'A'] = JSON.parse(JSON.stringify(currentPageSteps())); renderSteps(); };
  }

  function renderMemory(){
    const root = document.getElementById('memoryGrid'); root.innerHTML='';
    for(let i=1;i<=4;i++){
      const d = document.createElement('div'); d.className='mem-slot';
      d.innerHTML = `<h4>SLOT ${i}</h4><div class="inline-btns"><button data-save="${i}">SAVE</button><button data-load="${i}">LOAD</button></div>`;
      d.querySelector('[data-save]').onclick = ()=> saveSlot(i);
      d.querySelector('[data-load]').onclick = ()=> loadSlot(i);
      root.appendChild(d);
    }
    document.getElementById('applyChainBtn').onclick = ()=> {
      state.chain = document.getElementById('chainInput').value.split('-').map(x=>parseInt(x,10)).filter(x=>x>=1&&x<=4);
      if(!state.chain.length) state.chain=[1];
    };
  }

  function saveSlot(i){
    localStorage.setItem(`sc6_slot_${i}`, JSON.stringify({steps:state.steps, params, key:state.key, scale:state.scale}));
    state.currentSlot = i;
  }
  function loadSlot(i){
    const raw = localStorage.getItem(`sc6_slot_${i}`); if(!raw) return;
    const data = JSON.parse(raw);
    state.steps = data.steps; Object.assign(params, data.params||{}); state.key=data.key||state.key; state.scale=data.scale||state.scale;
    document.getElementById('keySelect').value = state.key; document.getElementById('scaleSelect').value=state.scale;
    renderKnobs(); renderSteps(); syncEditor();
    state.currentSlot = i;
  }

  function renderKeyboard(){
    const root = document.getElementById('keyboard'); root.innerHTML='';
    const whiteMap = ['A','S','D','F','G','H','J','K'];
    const blackMap = ['W','E','','T','Y','U'];
    const whiteNotes = [60,62,64,65,67,69,71,72];
    const blackOffsets = [61,63,null,66,68,70];
    whiteNotes.forEach((midi,i)=>{
      const key = document.createElement('button'); key.className='key white'; key.textContent=whiteMap[i];
      attachKey(key,midi); root.appendChild(key);
    });
    let x=38;
    blackOffsets.forEach((midi,i)=>{
      if(midi===null){ x += 56; return; }
      const key = document.createElement('button'); key.className='key black'; key.textContent=blackMap[i]; key.style.left = `${x}px`;
      attachKey(key,midi); root.appendChild(key); x += 56;
    });

    const keyMap = {a:60,w:61,s:62,e:63,d:64,f:65,t:66,g:67,y:68,h:69,u:70,j:71,k:72};
    window.addEventListener('keydown', e=>{
      if(e.repeat || !keyMap[e.key.toLowerCase()]) return;
      initAudio(); state.ctx.resume();
      const midi = keyMap[e.key.toLowerCase()]; state.heldKeys.set(e.key.toLowerCase(), new Voice(midiToFreq(midi), 0.9, 0.6));
    });
    window.addEventListener('keyup', e=>{
      const v = state.heldKeys.get(e.key.toLowerCase()); if(v){ v.stop(); state.heldKeys.delete(e.key.toLowerCase()); }
    });
  }

  function attachKey(el,midi){
    let voice = null;
    const down = ()=>{ initAudio(); state.ctx.resume(); el.classList.add('active'); voice = new Voice(midiToFreq(midi), 0.9, 0.7); };
    const up = ()=>{ el.classList.remove('active'); if(voice){ voice.stop(); voice=null; } };
    el.addEventListener('pointerdown', down); el.addEventListener('pointerup', up); el.addEventListener('pointerleave', up);
  }

  function setPanelVisibility(panel, show){
    const body = panel.querySelector('.panel-body');
    const btn = panel.querySelector('.toggle-btn');
    if(!body || !btn) return;
    body.style.display = show ? '' : 'none';
    btn.textContent = show ? 'HIDE' : 'SHOW';
    panel.classList.toggle('is-collapsed', !show);
  }

  function wireSections(){
    document.querySelectorAll('.toggle-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const body = document.getElementById(btn.dataset.target);
        const panel = btn.closest('.panel');
        const collapsed = body.style.display === 'none';
        body.style.display = collapsed ? '' : 'none';
        btn.textContent = collapsed ? 'HIDE' : 'SHOW';
        panel.classList.toggle('is-collapsed', !collapsed);
      });
    });

    const showAllBtn = document.getElementById('showAllBtn');
    const hideSynthBtn = document.getElementById('hideSynthBtn');
    if(showAllBtn){
      showAllBtn.addEventListener('click', ()=>{
        document.querySelectorAll('.panel').forEach(panel=> setPanelVisibility(panel, true));
      });
    }
    if(hideSynthBtn){
      hideSynthBtn.addEventListener('click', ()=>{
        document.querySelectorAll('.layout-grid .panel, #keyboardBody').forEach((node)=>{
          const panel = node.classList && node.classList.contains('panel') ? node : node.closest('.panel');
          if(panel) setPanelVisibility(panel, false);
        });
        const seq = document.getElementById('sequencerSection');
        if(seq) setPanelVisibility(seq, true);
        window.location.hash = 'sequencerSection';
      });
    }
  }

  function init(){
    renderKnobs(); renderKeyScale(); renderStepEditor(); renderSteps(); renderMemory(); renderKeyboard(); wireTransport(); wireSections();
  }

  window.addEventListener('load', init);
})();
