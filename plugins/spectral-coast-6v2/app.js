import { SynthEngine } from './audio/engine.js';
import { defaultPatch, presets } from './presets.js';

const engine = new SynthEngine();
let patch = { ...defaultPatch };
let started = false;
let octaveShift = 0;
const heldKeyboardNotes = new Map();
const activePointerNotes = new Map();

const STORAGE_KEY = 'spectral-coast-6-v6-patterns';

const KEYMAP = {
  a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66,
  g: 67, y: 68, h: 69, u: 70, j: 71, k: 72,
};

const SCALES = {
  major: [0,2,4,5,7,9,11],
  minor: [0,2,3,5,7,8,10],
  dorian: [0,2,3,5,7,9,10],
  mixolydian: [0,2,4,5,7,9,10],
  pentatonic: [0,2,4,7,9],
};

const ROMAN = ['I','II','III','IV','V','VI','VII'];
const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const QUALITY_LABELS = { triad: 'TRI', '7': '7', sus2: 'S2', sus4: 'S4', add9: 'A9', power: '5' };
const CONDITION_LABELS = { all: 'ALL', '1:2': '1/2', '2:2': '2/2', '1:4': '1/4', '2:4': '2/4', '3:4': '3/4', '4:4': '4/4' };

const els = {
  keyboardEl: document.getElementById('keyboard'),
  audioBtn: document.getElementById('audioToggle'),
  presetSelect: document.getElementById('presetSelect'),
  octaveSelect: document.getElementById('octaveShift'),
  masterOutput: document.querySelector('.master-output'),
  stepGrid: document.getElementById('stepGrid'),
  seqStatus: document.getElementById('seqStatus'),
  seqPlayBtn: document.getElementById('seqPlayBtn'),
  seqStopBtn: document.getElementById('seqStopBtn'),
  pageABtn: document.getElementById('pageABtn'),
  pageBBtn: document.getElementById('pageBBtn'),
  chainModeBtn: document.getElementById('chainModeBtn'),
  seqBpm: document.getElementById('seqBpm'),
  seqSwing: document.getElementById('seqSwing'),
  seqGate: document.getElementById('seqGate'),
  seqKey: document.getElementById('seqKey'),
  seqScale: document.getElementById('seqScale'),
  scaleNotes: document.getElementById('scaleNotes'),
  toggleScaleNotes: document.getElementById('toggleScaleNotes'),
  selectedStepBadge: document.getElementById('selectedStepBadge'),
  stepToggleBtn: document.getElementById('stepToggleBtn'),
  stepDegree: document.getElementById('stepDegree'),
  stepQuality: document.getElementById('stepQuality'),
  stepOctave: document.getElementById('stepOctave'),
  stepVelocity: document.getElementById('stepVelocity'),
  stepTie: document.getElementById('stepTie'),
  stepChance: document.getElementById('stepChance'),
  stepAccent: document.getElementById('stepAccent'),
  stepRatchet: document.getElementById('stepRatchet'),
  stepMicro: document.getElementById('stepMicro'),
  stepCondition: document.getElementById('stepCondition'),
  stepPreviewBtn: document.getElementById('stepPreviewBtn'),
  copyStepBtn: document.getElementById('copyStepBtn'),
  pasteStepBtn: document.getElementById('pasteStepBtn'),
  randPageBtn: document.getElementById('randPageBtn'),
  fillPageBtn: document.getElementById('fillPageBtn'),
  clearPageBtn: document.getElementById('clearPageBtn'),
  shiftLeftBtn: document.getElementById('shiftLeftBtn'),
  shiftRightBtn: document.getElementById('shiftRightBtn'),
  duplicatePageBtn: document.getElementById('duplicatePageBtn'),
  memorySlotSelect: document.getElementById('memorySlotSelect'),
  savePatternBtn: document.getElementById('savePatternBtn'),
  loadPatternBtn: document.getElementById('loadPatternBtn'),
  memoryInfo: document.getElementById('memoryInfo'),
  patternChainInput: document.getElementById('patternChainInput'),
  chainEnableBtn: document.getElementById('chainEnableBtn'),
  chainInfo: document.getElementById('chainInfo'),
  motionTargetSelect: document.getElementById('motionTargetSelect'),
  motionRecBtn: document.getElementById('motionRecBtn'),
  clearMotionBtn: document.getElementById('clearMotionBtn'),
};

function noteName(midi) {
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

function formatValue(param, value) {
  const v = Number(value);
  if (param === 'model') return String(value);
  if (param === 'unison') return v ? 'on' : 'off';
  if (['attack','decay','release','filterAttack','filterDecay'].includes(param)) return `${v.toFixed(3)} s`;
  if (param === 'lfoRate') return `${(0.1 + v * 11.9).toFixed(2)} Hz`;
  if (param === 'master') return `${Math.round(v * 100)}%`;
  return v.toFixed(2);
}

function createStep() {
  return {
    on: false,
    degree: 1,
    quality: 'triad',
    octave: 0,
    velocity: 0.9,
    tie: 0,
    chance: 1,
    accent: 0,
    ratchet: 1,
    micro: 0,
    condition: 'all',
    motion: {},
  };
}

function cloneSteps(steps) {
  return steps.map((step) => ({ ...createStep(), ...step }));
}

function buildInitialSteps() {
  const page = Array.from({ length: 16 }, () => createStep());
  page[0] = { ...createStep(), on: true, degree: 1, quality: '7', octave: 0, velocity: 0.92, accent: 1, ratchet: 1, micro: 0 };
  page[4] = { ...createStep(), on: true, degree: 4, quality: 'triad', octave: 0, velocity: 0.88, ratchet: 2, micro: -0.01 };
  page[8] = { ...createStep(), on: true, degree: 6, quality: 'triad', octave: 0, velocity: 0.9, accent: 1, micro: 0.008 };
  page[12] = { ...createStep(), on: true, degree: 5, quality: '7', octave: 0, velocity: 0.94, ratchet: 1, micro: -0.006 };
  return page;
}

const seq = {
  bpm: 96,
  swing: 54,
  gate: 78,
  key: 'C',
  scale: 'major',
  page: 'A',
  selectedStep: 0,
  playing: false,
  stepIndex: 0,
  timeoutId: null,
  releaseTimers: [],
  pendingTriggers: [],
  playMode: 'chain',
  followPlaybackPage: true,
  stepsA: buildInitialSteps(),
  stepsB: Array.from({ length: 16 }, () => createStep()),
  cycleCount: 0,
  chainEnabled: false,
  chainSlots: [1,2],
  chainCursor: 0,
  motionTarget: 'cutoff',
  motionRec: false,
};
seq.stepsB[2] = { ...createStep(), on: true, degree: 6, quality: 'sus2', octave: -1, velocity: 0.85, tie: 0, chance: 1, accent: 0, ratchet: 2, micro: 0.012 };
seq.stepsB[6] = { ...createStep(), on: true, degree: 4, quality: 'add9', octave: 0, velocity: 0.9, tie: 0, chance: 0.88, accent: 1, ratchet: 1, micro: -0.014 };
seq.stepsB[10] = { ...createStep(), on: true, degree: 1, quality: 'triad', octave: 1, velocity: 0.94, tie: 1, chance: 1, accent: 0, ratchet: 1, micro: 0 };
seq.stepsB[14] = { ...createStep(), on: true, degree: 5, quality: 'power', octave: 0, velocity: 0.92, tie: 0, chance: 1, accent: 1, ratchet: 3, micro: 0.01 };

const patternMemory = loadPatternMemory();
let stepClipboard = null;

function getCurrentSteps() {
  return seq.page === 'A' ? seq.stepsA : seq.stepsB;
}

function getPageSteps(page) {
  return page === 'A' ? seq.stepsA : seq.stepsB;
}

function pageForAbsoluteIndex(index) {
  return index < 16 ? 'A' : 'B';
}

function indexWithinPage(index) {
  return index % 16;
}

function totalSteps() {
  return seq.playMode === 'chain' ? 32 : 16;
}

function updateOutputs() {
  document.querySelectorAll('[data-param]').forEach((el) => {
    const param = el.dataset.param;
    const out = el.parentElement?.querySelector('output');
    if (el.tagName === 'SELECT') el.value = patch[param];
    else el.value = patch[param];
    if (out) out.textContent = formatValue(param, patch[param]);
  });
  if (els.masterOutput) els.masterOutput.textContent = formatValue('master', patch.master);
}

function applyPatch(next) {
  patch = { ...patch, ...next };
  updateOutputs();
  if (started) engine.setPatch(patch);
}

async function ensureStarted() {
  if (!started) {
    await engine.init(patch);
    started = true;
  }
  await engine.resume();
  els.audioBtn.textContent = 'AUDIO ON';
}

function populatePresets() {
  Object.keys(presets).forEach((name, idx) => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name.toUpperCase();
    if (idx === 0) opt.selected = true;
    els.presetSelect.appendChild(opt);
  });
}

function buildKeyboard() {
  const whiteNotes = [60,62,64,65,67,69,71,72,74,76,77,79,81,83,84];
  const blackOffsets = { 60:61, 62:63, 65:66, 67:68, 69:70, 72:73, 74:75, 77:78, 79:80, 81:82 };
  els.keyboardEl.innerHTML = '';
  whiteNotes.forEach((midi, index) => {
    const key = document.createElement('button');
    key.className = 'key white';
    key.dataset.note = midi;
    key.textContent = noteName(midi);
    key.style.left = `${index * 52}px`;
    els.keyboardEl.appendChild(key);
    const blackMidi = blackOffsets[midi];
    if (blackMidi) {
      const black = document.createElement('button');
      black.className = 'key black';
      black.dataset.note = blackMidi;
      black.textContent = noteName(blackMidi);
      black.style.left = `${index * 52 + 36}px`;
      els.keyboardEl.appendChild(black);
    }
  });
}

function playNote(midi, velocity = 0.92) {
  if (!started) return;
  engine.noteOn(midi + octaveShift * 12, velocity);
  const key = els.keyboardEl.querySelector(`.key[data-note="${midi}"]`);
  if (key) key.classList.add('active');
}

function stopNote(midi) {
  if (!started) return;
  engine.noteOff(midi + octaveShift * 12);
  const key = els.keyboardEl.querySelector(`.key[data-note="${midi}"]`);
  if (key) key.classList.remove('active');
}

function getScaleNotes() {
  const root = NOTE_NAMES.indexOf(seq.key);
  const intervals = SCALES[seq.scale] ?? SCALES.major;
  return intervals.map((i) => (root + i) % 12);
}

function chordFromDegree(degree, quality, octave = 0) {
  const scaleNotes = getScaleNotes();
  const baseMidi = 48 + NOTE_NAMES.indexOf(seq.key) + octave * 12;
  if (degree < 1) return [];
  const idx = (degree - 1) % scaleNotes.length;
  const pickScale = (step) => {
    const span = idx + step;
    const notePc = scaleNotes[span % scaleNotes.length];
    const oct = Math.floor(span / scaleNotes.length);
    return baseMidi + notePc + oct * 12;
  };
  const root = pickScale(0);
  const third = pickScale(2);
  const fifth = pickScale(4);
  const seventh = pickScale(6);
  switch (quality) {
    case '7': return [root, third, fifth, seventh];
    case 'sus2': return [root, pickScale(1), fifth];
    case 'sus4': return [root, pickScale(3), fifth];
    case 'add9': return [root, third, fifth, pickScale(7)];
    case 'power': return [root, fifth, root + 12];
    default: return [root, third, fifth];
  }
}

function stepLabel(step) {
  if (!step.on || !step.degree) return 'OFF';
  return `${ROMAN[step.degree - 1] || 'I'}${QUALITY_LABELS[step.quality] ? ` ${QUALITY_LABELS[step.quality]}` : ''}`;
}

function renderScaleNotes() {
  els.scaleNotes.innerHTML = '';
  getScaleNotes().forEach((pc, idx) => {
    const pill = document.createElement('div');
    pill.className = 'scale-note-pill';
    pill.textContent = `${idx + 1} ${NOTE_NAMES[pc]}`;
    els.scaleNotes.appendChild(pill);
  });
}

function renderStepGrid() {
  const steps = getCurrentSteps();
  const highlightPage = seq.playing && seq.playMode === 'chain' ? pageForAbsoluteIndex(seq.stepIndex) : seq.page;
  const playingIndex = seq.playing ? indexWithinPage(seq.stepIndex) : -1;
  els.stepGrid.innerHTML = '';
  steps.forEach((step, idx) => {
    const card = document.createElement('button');
    card.type = 'button';
    const hasMotion = !!(step.motion && Object.keys(step.motion).length);
    card.className = `step-card ${step.on ? 'is-on' : 'is-off'} ${idx === seq.selectedStep ? 'is-selected' : ''} ${step.accent ? 'has-accent' : ''} ${hasMotion ? 'has-motion' : ''}`;
    if (seq.playing && highlightPage === seq.page && idx === playingIndex) card.classList.add('is-playing');
    card.dataset.index = String(idx);
    const main = stepLabel(step);
    const condLabel = CONDITION_LABELS[step.condition || 'all'];
    card.innerHTML = `
      <span class="step-index">${seq.page}${idx + 1}</span>
      <div class="step-top"><span>${step.on ? noteName(chordFromDegree(Math.max(1, step.degree || 1), step.quality, step.octave)[0] || 48) : '—'}</span><span>${Math.round(step.velocity * 100)}</span></div>
      <div class="step-main">${main}</div>
      <div class="step-bottom"><span>${step.octave >= 0 ? '+' : ''}${step.octave} OCT</span><span>${step.ratchet}x · ${Math.round(step.chance * 100)}%</span></div>
      <div class="step-badges">
        ${step.accent ? '<span class="flag accent">ACC</span>' : ''}
        ${step.tie ? '<span class="flag tie">TIE</span>' : ''}
        ${step.condition && step.condition !== 'all' ? `<span class="flag cond">${condLabel}</span>` : ''}
        ${step.micro ? `<span class="flag micro">${step.micro > 0 ? '+' : ''}${Math.round(step.micro * 1000)}ms</span>` : ''}
        ${hasMotion ? `<span class="flag motion">${Object.keys(step.motion).join('/').slice(0,9)}</span>` : ''}
      </div>
    `;
    els.stepGrid.appendChild(card);
  });
}

function renderStepEditor() {
  const step = getCurrentSteps()[seq.selectedStep];
  els.selectedStepBadge.textContent = `STEP ${seq.page}${seq.selectedStep + 1}`;
  els.stepToggleBtn.textContent = step.on ? 'ON' : 'OFF';
  els.stepToggleBtn.classList.toggle('active', step.on);
  els.stepDegree.value = String(step.on ? step.degree : 0);
  els.stepQuality.value = step.quality;
  els.stepOctave.value = String(step.octave);
  els.stepVelocity.value = String(step.velocity);
  els.stepTie.value = String(step.tie);
  els.stepChance.value = String(step.chance);
  els.stepAccent.value = String(step.accent || 0);
  els.stepRatchet.value = String(step.ratchet || 1);
  els.stepMicro.value = String(step.micro || 0);
  els.stepCondition.value = step.condition || 'all';
  els.stepVelocity.parentElement.querySelector('output').textContent = step.velocity.toFixed(2);
  els.stepTie.parentElement.querySelector('output').textContent = step.tie ? 'on' : 'off';
  els.stepChance.parentElement.querySelector('output').textContent = `${Math.round(step.chance * 100)}%`;
  els.stepAccent.parentElement.querySelector('output').textContent = step.accent ? 'on' : 'off';
  els.stepRatchet.parentElement.querySelector('output').textContent = `${step.ratchet}x`;
  els.stepMicro.parentElement.querySelector('output').textContent = `${Math.round(step.micro * 1000)} ms`;
}

function updateChainInfo(message = '') {
  const text = message || (seq.chainEnabled ? `chain ${seq.chainSlots.join('→')} · slot ${seq.chainSlots[Math.max(0, seq.chainCursor)] ?? '-'} active` : 'chain idle');
  els.chainInfo.textContent = text;
  els.chainInfo.classList.toggle('warn', /empty|invalid/i.test(text));
}


function renderSequenceMode() {
  els.pageABtn.classList.toggle('active', seq.page === 'A');
  els.pageBBtn.classList.toggle('active', seq.page === 'B');
  els.chainModeBtn.classList.toggle('active', seq.playMode === 'chain');
  els.chainModeBtn.textContent = seq.playMode === 'chain' ? 'A→B 32' : 'PAGE LOOP';
  if (!seq.playing) {
    els.seqStatus.textContent = seq.playMode === 'chain' ? 'STOPPED 32' : `STOPPED ${seq.page}`;
  }
}

function setPage(page, { preserveStep = false } = {}) {
  seq.page = page;
  if (!preserveStep) seq.selectedStep = 0;
  renderSequenceMode();
  renderStepGrid();
  renderStepEditor();
  updateChainInfo();
}

function mutateSelectedStep(updates) {
  const steps = getCurrentSteps();
  steps[seq.selectedStep] = { ...steps[seq.selectedStep], ...updates };
  if (steps[seq.selectedStep].degree === 0) steps[seq.selectedStep].on = false;
  renderStepGrid();
  renderStepEditor();
  updateChainInfo();
}

function stepDurationMs(index) {
  const eighth = 60000 / seq.bpm / 2;
  const swingAmt = Math.max(0, (seq.swing - 50) / 100);
  return index % 2 === 0 ? eighth * (1 - swingAmt * 0.45) : eighth * (1 + swingAmt * 0.45);
}

function clearPendingTimers() {
  clearTimeout(seq.timeoutId);
  seq.releaseTimers.forEach((id) => clearTimeout(id));
  seq.pendingTriggers.forEach((id) => clearTimeout(id));
  seq.releaseTimers = [];
  seq.pendingTriggers = [];
}

function stopSequencer() {
  seq.playing = false;
  clearPendingTimers();
  seq.stepIndex = 0;
  seq.cycleCount = 0;
  els.seqStatus.textContent = seq.playMode === 'chain' ? 'STOPPED 32' : `STOPPED ${seq.page}`;
  els.seqStatus.classList.remove('active-pill');
  els.seqPlayBtn.classList.remove('active');
  engine.panic();
  renderStepGrid();
}

function getStepByAbsoluteIndex(absoluteIndex) {
  const page = pageForAbsoluteIndex(absoluteIndex);
  const pageIdx = indexWithinPage(absoluteIndex);
  return { page, pageIdx, step: getPageSteps(page)[pageIdx] };
}

function scheduleChord(notes, velocity, offsetMs, lengthMs) {
  const onTimer = setTimeout(() => {
    notes.forEach((note) => engine.noteOn(note, velocity));
    if (lengthMs > 0) {
      const offTimer = setTimeout(() => {
        notes.forEach((note) => engine.noteOff(note));
      }, lengthMs);
      seq.releaseTimers.push(offTimer);
    }
  }, Math.max(0, offsetMs));
  seq.pendingTriggers.push(onTimer);
}

function triggerStep(step, stepMs) {
  if (!step.on || !step.degree) return;
  if (Math.random() > step.chance) return;
  const notes = chordFromDegree(step.degree, step.quality, step.octave);
  const accentBoost = step.accent ? 0.14 : 0;
  const baseVelocity = Math.min(1, step.velocity + accentBoost);
  const ratchetCount = Math.max(1, Number(step.ratchet || 1));
  const microMs = Number(step.micro || 0) * 1000;

  if (step.tie) {
    scheduleChord(notes, baseVelocity, microMs, 0);
    return;
  }

  const subDur = stepMs / ratchetCount;
  for (let i = 0; i < ratchetCount; i++) {
    const offset = microMs + i * subDur;
    const length = Math.max(20, subDur * (seq.gate / 100) * (step.accent ? 1.05 : 0.96));
    const vel = Math.max(0.2, Math.min(1, baseVelocity - i * 0.04));
    scheduleChord(notes, vel, offset, length);
  }
}

function conditionPasses(step) {
  const cond = step.condition || 'all';
  if (cond === 'all') return true;
  const [hit, cycle] = cond.split(':').map(Number);
  if (!hit || !cycle) return true;
  return (seq.cycleCount % cycle) + 1 === hit;
}

function applyStepMotion(step) {
  const target = seq.motionTarget;
  const motion = step.motion || {};
  if (motion[target] == null) return;
  applyPatch({ [target]: motion[target] });
}

function recordMotionForCurrentStep(param, value) {
  if (!(seq.motionRec && seq.playing && param === seq.motionTarget)) return;
  const page = pageForAbsoluteIndex(seq.stepIndex);
  const idx = indexWithinPage(seq.stepIndex);
  const steps = getPageSteps(page);
  const step = steps[idx];
  step.motion = { ...(step.motion || {}), [param]: Number(value) };
  if (page === seq.page && idx === seq.selectedStep) renderStepEditor();
  renderStepGrid();
}

function syncPlaybackPageFromIndex() {
  if (!(seq.playing && seq.playMode === 'chain' && seq.followPlaybackPage)) return;
  const playbackPage = pageForAbsoluteIndex(seq.stepIndex);
  if (playbackPage !== seq.page) {
    seq.page = playbackPage;
    seq.selectedStep = indexWithinPage(seq.stepIndex);
    renderSequenceMode();
    renderStepGrid();
    renderStepEditor();
  }
}

function runSequencerTick() {
  if (!seq.playing) return;
  syncPlaybackPageFromIndex();
  const { page, pageIdx, step } = getStepByAbsoluteIndex(seq.stepIndex);
  if (seq.page === page) seq.selectedStep = pageIdx;
  renderStepGrid();
  renderStepEditor();
  const ms = stepDurationMs(seq.stepIndex);
  applyStepMotion(step);
  if (conditionPasses(step)) triggerStep(step, ms);
  seq.timeoutId = setTimeout(() => {
    const nextIndex = (seq.stepIndex + 1) % totalSteps();
    if (nextIndex === 0) {
      seq.cycleCount += 1;
      advancePatternChain();
    }
    seq.stepIndex = nextIndex;
    runSequencerTick();
  }, ms);
}

async function startSequencer() {
  await ensureStarted();
  if (seq.playing) return;
  seq.playing = true;
  seq.cycleCount = 0;
  seq.stepIndex = seq.playMode === 'chain'
    ? (seq.page === 'B' ? 16 + seq.selectedStep : seq.selectedStep)
    : seq.selectedStep;
  els.seqStatus.textContent = seq.playMode === 'chain' ? 'PLAY 32' : `PLAY ${seq.page}`;
  els.seqStatus.classList.add('active-pill');
  els.seqPlayBtn.classList.add('active');
  runSequencerTick();
}


function parseChainSlots(text) {
  return String(text || '')
    .split(/[^1-4]+/)
    .map((n) => Number(n))
    .filter((n) => n >= 1 && n <= 4);
}

function advancePatternChain() {
  if (!seq.chainEnabled || seq.chainSlots.length < 2) return;
  seq.chainCursor = (seq.chainCursor + 1) % seq.chainSlots.length;
  const slot = String(seq.chainSlots[seq.chainCursor]);
  const snap = patternMemory[slot];
  if (!snap) {
    updateChainInfo(`slot ${slot} empty`);
    return;
  }
  applyPatternSnapshot(snap);
  updateMemoryInfo();
  updateChainInfo(`chain ${seq.chainSlots.join('→')} · slot ${slot} active`);
}

function randomStep() {
  const on = Math.random() > 0.34;
  return {
    ...createStep(),
    on,
    degree: on ? 1 + Math.floor(Math.random() * 7) : 0,
    quality: ['triad','7','sus2','sus4','add9','power'][Math.floor(Math.random() * 6)],
    octave: [-1,0,0,0,1][Math.floor(Math.random() * 5)],
    velocity: 0.62 + Math.random() * 0.36,
    tie: Math.random() > 0.84 ? 1 : 0,
    chance: 0.7 + Math.random() * 0.3,
    accent: Math.random() > 0.72 ? 1 : 0,
    ratchet: [1,1,1,2,2,3,4][Math.floor(Math.random() * 7)],
    micro: (Math.random() * 0.04) - 0.02,
  };
}

function patternSnapshot() {
  return {
    bpm: seq.bpm,
    swing: seq.swing,
    gate: seq.gate,
    key: seq.key,
    scale: seq.scale,
    playMode: seq.playMode,
    stepsA: cloneSteps(seq.stepsA),
    stepsB: cloneSteps(seq.stepsB),
    savedAt: new Date().toISOString(),
  };
}

function applyPatternSnapshot(snapshot) {
  if (!snapshot) return;
  seq.bpm = Number(snapshot.bpm ?? seq.bpm);
  seq.swing = Number(snapshot.swing ?? seq.swing);
  seq.gate = Number(snapshot.gate ?? seq.gate);
  seq.key = snapshot.key ?? seq.key;
  seq.scale = snapshot.scale ?? seq.scale;
  seq.playMode = snapshot.playMode === 'page' ? 'page' : 'chain';
  seq.stepsA = cloneSteps(snapshot.stepsA ?? seq.stepsA);
  seq.stepsB = cloneSteps(snapshot.stepsB ?? seq.stepsB);
  els.seqBpm.value = String(seq.bpm);
  els.seqSwing.value = String(seq.swing);
  els.seqGate.value = String(seq.gate);
  els.seqKey.value = seq.key;
  els.seqScale.value = seq.scale;
  renderScaleNotes();
  renderSequenceMode();
  renderStepGrid();
  renderStepEditor();
  updateChainInfo();
}

function loadPatternMemory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function persistPatternMemory() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(patternMemory));
}

function updateMemoryInfo(message = '') {
  const slot = els.memorySlotSelect?.value || '1';
  const snap = patternMemory[slot];
  if (message) {
    els.memoryInfo.textContent = message;
    return;
  }
  if (!snap?.savedAt) {
    els.memoryInfo.textContent = `slot ${slot} empty`;
    return;
  }
  const stamp = new Date(snap.savedAt);
  els.memoryInfo.textContent = `slot ${slot} · ${stamp.toLocaleDateString()} ${stamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function saveCurrentPattern() {
  const slot = els.memorySlotSelect.value;
  patternMemory[slot] = patternSnapshot();
  persistPatternMemory();
  updateMemoryInfo(`saved slot ${slot}`);
}

function loadCurrentPattern() {
  const slot = els.memorySlotSelect.value;
  const snap = patternMemory[slot];
  if (!snap) {
    updateMemoryInfo(`slot ${slot} empty`);
    return;
  }
  applyPatternSnapshot(snap);
  updateMemoryInfo(`loaded slot ${slot}`);
}

function applySectionToggles() {
  document.querySelectorAll('.panel-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.targetSection;
      const panel = document.querySelector(`[data-section="${id}"]`);
      if (!panel) return;
      panel.classList.toggle('is-collapsed');
      btn.textContent = panel.classList.contains('is-collapsed') ? 'SHOW' : 'HIDE';
    });
  });
}

async function previewSelectedStep() {
  await ensureStarted();
  const step = getCurrentSteps()[seq.selectedStep];
  if (!step.on || !step.degree) return;
  const notes = chordFromDegree(step.degree, step.quality, step.octave);
  const vel = Math.min(1, step.velocity + (step.accent ? 0.12 : 0));
  notes.forEach((note) => engine.noteOn(note, vel));
  setTimeout(() => notes.forEach((note) => engine.noteOff(note)), 600);
}

async function main() {
  populatePresets();
  buildKeyboard();
  updateOutputs();
  renderScaleNotes();
  renderSequenceMode();
  renderStepGrid();
  renderStepEditor();
  updateMemoryInfo();
  applySectionToggles();

  els.audioBtn.addEventListener('click', ensureStarted);
  els.presetSelect.addEventListener('change', async (e) => {
    await ensureStarted();
    applyPatch(presets[e.target.value]);
  });
  els.octaveSelect.addEventListener('change', (e) => { octaveShift = Number(e.target.value || 0); });

  document.querySelectorAll('[data-param]').forEach((el) => {
    const handler = async (e) => {
      await ensureStarted();
      const param = e.target.dataset.param;
      const value = e.target.tagName === 'SELECT' ? e.target.value : Number(e.target.value);
      applyPatch({ [param]: value });
      recordMotionForCurrentStep(param, value);
    };
    el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', handler);
  });

  document.getElementById('panicBtn').addEventListener('click', async () => {
    await ensureStarted();
    stopSequencer();
    document.querySelectorAll('.key.active').forEach((k) => k.classList.remove('active'));
  });

  els.keyboardEl.addEventListener('pointerdown', async (e) => {
    const key = e.target.closest('.key');
    if (!key) return;
    await ensureStarted();
    const note = Number(key.dataset.note);
    activePointerNotes.set(e.pointerId, note);
    key.setPointerCapture?.(e.pointerId);
    playNote(note, 0.94);
  });
  ['pointerup','pointercancel'].forEach((type) => els.keyboardEl.addEventListener(type, (e) => {
    const note = activePointerNotes.get(e.pointerId);
    if (note != null) {
      stopNote(note);
      activePointerNotes.delete(e.pointerId);
    }
  }));

  window.addEventListener('keydown', async (e) => {
    if (e.repeat) return;
    if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'SELECT') return;
    if (e.key === 'z') { octaveShift = Math.max(-1, octaveShift - 1); els.octaveSelect.value = String(octaveShift); return; }
    if (e.key === 'x') { octaveShift = Math.min(2, octaveShift + 1); els.octaveSelect.value = String(octaveShift); return; }
    if (e.key === ' ') { e.preventDefault(); seq.playing ? stopSequencer() : await startSequencer(); return; }
    const midi = KEYMAP[e.key];
    if (midi == null || heldKeyboardNotes.has(e.key)) return;
    await ensureStarted();
    heldKeyboardNotes.set(e.key, midi);
    playNote(midi, 0.9);
  });
  window.addEventListener('keyup', (e) => {
    const midi = heldKeyboardNotes.get(e.key);
    if (midi == null) return;
    stopNote(midi);
    heldKeyboardNotes.delete(e.key);
  });

  els.seqPlayBtn.addEventListener('click', startSequencer);
  els.seqStopBtn.addEventListener('click', stopSequencer);
  els.pageABtn.addEventListener('click', () => setPage('A'));
  els.pageBBtn.addEventListener('click', () => setPage('B'));
  els.chainModeBtn.addEventListener('click', () => {
    seq.playMode = seq.playMode === 'chain' ? 'page' : 'chain';
    renderSequenceMode();
    renderStepGrid();
  });
  els.seqBpm.addEventListener('input', (e) => { seq.bpm = Math.max(40, Math.min(220, Number(e.target.value || 96))); });
  els.seqSwing.addEventListener('input', (e) => { seq.swing = Math.max(50, Math.min(75, Number(e.target.value || 54))); });
  els.seqGate.addEventListener('input', (e) => { seq.gate = Math.max(20, Math.min(95, Number(e.target.value || 78))); });
  els.seqKey.addEventListener('change', (e) => { seq.key = e.target.value; renderScaleNotes(); renderStepGrid(); });
  els.seqScale.addEventListener('change', (e) => { seq.scale = e.target.value; renderScaleNotes(); renderStepGrid(); });
  els.toggleScaleNotes.addEventListener('click', () => { els.scaleNotes.classList.toggle('is-hidden'); });

  els.stepGrid.addEventListener('click', (e) => {
    const card = e.target.closest('.step-card');
    if (!card) return;
    seq.selectedStep = Number(card.dataset.index);
    renderStepGrid();
    renderStepEditor();
  });
  els.stepGrid.addEventListener('dblclick', (e) => {
    const card = e.target.closest('.step-card');
    if (!card) return;
    seq.selectedStep = Number(card.dataset.index);
    const steps = getCurrentSteps();
    const nextOn = !steps[seq.selectedStep].on;
    steps[seq.selectedStep].on = nextOn;
    if (nextOn && !steps[seq.selectedStep].degree) steps[seq.selectedStep].degree = 1;
    renderStepGrid();
    renderStepEditor();
  });

  els.stepToggleBtn.addEventListener('click', () => {
    const steps = getCurrentSteps();
    const nextOn = !steps[seq.selectedStep].on;
    steps[seq.selectedStep].on = nextOn;
    if (nextOn && !steps[seq.selectedStep].degree) steps[seq.selectedStep].degree = 1;
    renderStepGrid();
    renderStepEditor();
  });
  els.stepDegree.addEventListener('change', (e) => mutateSelectedStep({ degree: Number(e.target.value), on: Number(e.target.value) > 0 }));
  els.stepQuality.addEventListener('change', (e) => mutateSelectedStep({ quality: e.target.value }));
  els.stepOctave.addEventListener('change', (e) => mutateSelectedStep({ octave: Number(e.target.value) }));
  els.stepVelocity.addEventListener('input', (e) => mutateSelectedStep({ velocity: Number(e.target.value) }));
  els.stepTie.addEventListener('input', (e) => mutateSelectedStep({ tie: Number(e.target.value) }));
  els.stepChance.addEventListener('input', (e) => mutateSelectedStep({ chance: Number(e.target.value) }));
  els.stepAccent.addEventListener('input', (e) => mutateSelectedStep({ accent: Number(e.target.value) }));
  els.stepRatchet.addEventListener('input', (e) => mutateSelectedStep({ ratchet: Number(e.target.value) }));
  els.stepMicro.addEventListener('input', (e) => mutateSelectedStep({ micro: Number(e.target.value) }));
  els.stepCondition.addEventListener('change', (e) => mutateSelectedStep({ condition: e.target.value }));
  els.stepPreviewBtn.addEventListener('click', previewSelectedStep);
  els.copyStepBtn.addEventListener('click', () => {
    stepClipboard = JSON.parse(JSON.stringify(getCurrentSteps()[seq.selectedStep]));
    updateChainInfo(`copied ${seq.page}${seq.selectedStep + 1}`);
  });
  els.pasteStepBtn.addEventListener('click', () => {
    if (!stepClipboard) { updateChainInfo('clipboard empty'); return; }
    getCurrentSteps()[seq.selectedStep] = JSON.parse(JSON.stringify(stepClipboard));
    renderStepGrid(); renderStepEditor(); updateChainInfo(`pasted to ${seq.page}${seq.selectedStep + 1}`);
  });

  els.randPageBtn.addEventListener('click', () => {
    const steps = getCurrentSteps();
    steps.splice(0, steps.length, ...Array.from({ length: 16 }, () => randomStep()));
    renderStepGrid(); renderStepEditor();
  });
  els.fillPageBtn.addEventListener('click', () => {
    const steps = getCurrentSteps();
    steps.forEach((s, i) => {
      const on = i % 2 === 0 || i % 4 === 3;
      steps[i] = {
        ...s,
        on,
        degree: on ? ((i % 7) + 1) : 0,
        quality: i % 4 === 0 ? '7' : 'triad',
        octave: i % 8 === 0 ? 1 : 0,
        velocity: 0.78 + (i % 3) * 0.05,
        tie: i % 8 === 7 ? 1 : 0,
        chance: i % 5 === 0 ? 0.86 : 1,
        accent: i % 4 === 0 ? 1 : 0,
        ratchet: i % 8 === 4 ? 2 : 1,
        micro: i % 2 === 0 ? -0.008 : 0.006,
      };
    });
    renderStepGrid(); renderStepEditor();
  });
  els.clearPageBtn.addEventListener('click', () => {
    const steps = getCurrentSteps();
    steps.splice(0, steps.length, ...Array.from({ length: 16 }, () => createStep()));
    renderStepGrid(); renderStepEditor();
  });
  els.shiftLeftBtn.addEventListener('click', () => {
    const steps = getCurrentSteps();
    steps.push(steps.shift());
    renderStepGrid(); renderStepEditor();
  });
  els.shiftRightBtn.addEventListener('click', () => {
    const steps = getCurrentSteps();
    steps.unshift(steps.pop());
    renderStepGrid(); renderStepEditor();
  });
  els.duplicatePageBtn.addEventListener('click', () => {
    if (seq.page === 'A') seq.stepsB = seq.stepsA.map((s) => ({ ...s }));
    else seq.stepsA = seq.stepsB.map((s) => ({ ...s }));
    renderStepGrid(); renderStepEditor();
  });

  els.memorySlotSelect.addEventListener('change', () => updateMemoryInfo());
  els.savePatternBtn.addEventListener('click', saveCurrentPattern);
  els.loadPatternBtn.addEventListener('click', loadCurrentPattern);
  els.patternChainInput.addEventListener('input', (e) => {
    seq.chainSlots = parseChainSlots(e.target.value);
    updateChainInfo(seq.chainSlots.length ? `chain ready ${seq.chainSlots.join('→')}` : 'invalid chain');
  });
  els.chainEnableBtn.addEventListener('click', () => {
    const parsed = parseChainSlots(els.patternChainInput.value);
    if (!parsed.length) { updateChainInfo('invalid chain'); return; }
    seq.chainSlots = parsed;
    seq.chainCursor = 0;
    seq.chainEnabled = !seq.chainEnabled;
    els.chainEnableBtn.textContent = seq.chainEnabled ? 'CHAIN ON' : 'CHAIN OFF';
    els.chainEnableBtn.classList.toggle('active', seq.chainEnabled);
    updateChainInfo();
  });
  els.motionTargetSelect.addEventListener('change', (e) => {
    seq.motionTarget = e.target.value;
    updateChainInfo(`motion target ${seq.motionTarget}`);
  });
  els.motionRecBtn.addEventListener('click', () => {
    seq.motionRec = !seq.motionRec;
    els.motionRecBtn.classList.toggle('rec', seq.motionRec);
    els.motionRecBtn.textContent = seq.motionRec ? 'REC ON' : 'MOTION REC';
    updateChainInfo(seq.motionRec ? `recording ${seq.motionTarget}` : 'motion rec off');
  });
  els.clearMotionBtn.addEventListener('click', () => {
    getCurrentSteps().forEach((step) => {
      if (step.motion) delete step.motion[seq.motionTarget];
    });
    renderStepGrid();
    renderStepEditor();
    updateChainInfo(`cleared ${seq.motionTarget}`);
  });
}

main();
