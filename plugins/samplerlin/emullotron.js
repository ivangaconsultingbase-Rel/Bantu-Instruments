/**

- EMULLOTRON MK2 - Virtual Tape Instrument
- Features: Ensemble, Speed, Chord/Drone, ARP, Step Recorder
  */

class Emullotron {
constructor() {
this.audioContext = null;
this.masterGain = null;
this.analyser = null;
this.sourceBuffer = null;
this.virtualTapes = new Map();

```
// activeVoices: Map<noteKey, voice[]>
this.activeVoices = new Map();

this.params = {
  masterVolume: 0.7,
  tapeLength: 8,
  startJitter: 30,
  wow: 35,
  flutter: 25,
  tapeAge: 40,
  mechanicalNoise: 20,
  brightness: 60,
  saturation: 30,
  attack: 40,
  release: 50,
  driftPerKey: 25
};

// ─── NEW: Mode State ───────────────────────────────────────────
this.ensembleVoices = 1;         // 1 | 2 | 3
this.speedMode = 1.0;            // 0.5 | 1.0 | 2.0
this.playMode = 'poly';          // poly | chord | drone | arp
this.chordType = 'major';        // major | minor | sus2

// Chord tracking: rootNote -> [note, note, note]
this.chordMap = new Map();

// Drone
this.droneNote = null;

// ARP
this.arpPattern = 'up';
this.arpBPM = 120;
this.arpOctaves = 1;
this.arpHeldNotes = new Set();
this.arpCurrentNote = null;
this.arpIndex = 0;
this.arpDirection = 1;
this.arpTimer = null;

// Step Recorder
this.seqStepCount = 8;
this.seqSteps = Array(16).fill(null);  // max 16 steps
this.seqCursor = 0;                    // recording cursor
this.seqPlayHead = 0;                  // playback head
this.seqBPM = 120;
this.seqIsRecording = false;
this.seqIsPlaying = false;
this.seqTimer = null;
this.seqLastNote = null;               // currently playing seq note
// ──────────────────────────────────────────────────────────────

this.banks = {
  strings: {
    name: 'STRINGS', file: 'samples/strings.wav',
    presetOverrides: { wow: 40, flutter: 30, tapeAge: 45, brightness: 55, attack: 50, release: 60 }
  },
  flute: {
    name: 'FLUTE', file: 'samples/flute.wav',
    presetOverrides: { wow: 25, flutter: 20, tapeAge: 30, brightness: 70, attack: 30, release: 45 }
  },
  piano: {
    name: 'PIANO', file: 'samples/piano.wav',
    presetOverrides: { wow: 20, flutter: 15, tapeAge: 35, brightness: 65, attack: 20, release: 55 }
  },
  custom: { name: 'CUSTOM', file: null, presetOverrides: {} }
};

this.presets = {
  pristine:  { tapeLength:10, startJitter:10, wow:10, flutter:8,  tapeAge:10, mechanicalNoise:5,  brightness:75, saturation:15, attack:20, release:40, driftPerKey:10 },
  vintage:   { tapeLength:8,  startJitter:30, wow:35, flutter:25, tapeAge:45, mechanicalNoise:25, brightness:55, saturation:35, attack:45, release:50, driftPerKey:30 },
  worn:      { tapeLength:7,  startJitter:50, wow:55, flutter:45, tapeAge:65, mechanicalNoise:40, brightness:45, saturation:45, attack:55, release:55, driftPerKey:45 },
  broken:    { tapeLength:5,  startJitter:80, wow:80, flutter:70, tapeAge:85, mechanicalNoise:60, brightness:35, saturation:65, attack:70, release:60, driftPerKey:70 },
  dreamy:    { tapeLength:12, startJitter:40, wow:60, flutter:20, tapeAge:50, mechanicalNoise:15, brightness:40, saturation:25, attack:65, release:80, driftPerKey:35 }
};

this.currentBank = null;
this.currentPreset = null;
this.baseOctave = 4;
this.noteRange = { min: 24, max: 108 };
this.isInitialized = false;

this.keyboardLayout = [
  { key:'Q', code:'KeyQ', note:0,  black:false },
  { key:'Z', code:'KeyZ', note:1,  black:true  },
  { key:'S', code:'KeyS', note:2,  black:false },
  { key:'E', code:'KeyE', note:3,  black:true  },
  { key:'D', code:'KeyD', note:4,  black:false },
  { key:'F', code:'KeyF', note:5,  black:false },
  { key:'T', code:'KeyT', note:6,  black:true  },
  { key:'G', code:'KeyG', note:7,  black:false },
  { key:'Y', code:'KeyY', note:8,  black:true  },
  { key:'H', code:'KeyH', note:9,  black:false },
  { key:'U', code:'KeyU', note:10, black:true  },
  { key:'J', code:'KeyJ', note:11, black:false },
  { key:'K', code:'KeyK', note:12, black:false },
  { key:'O', code:'KeyO', note:13, black:true  },
  { key:'L', code:'KeyL', note:14, black:false },
  { key:'P', code:'KeyP', note:15, black:true  },
  { key:'M', code:'KeyM', note:16, black:false }
];

this.init();
```

}

async init() {
this.buildKeyboard();
this.setupEncoders();
this.setupBanks();
this.setupPresets();
this.setupOctaveButtons();
this.setupComputerKeyboard();
this.setupModeControls();
this.setupStepRecorder();
await this.setupMIDI();
this.updateDisplay();
this.updateModeDisplay();
}

// ═══════════════════════════════════════════════════════════════
// AUDIO CONTEXT INIT
// ═══════════════════════════════════════════════════════════════

async initAudioContext() {
if (this.audioContext) return;

```
this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
this.masterGain = this.audioContext.createGain();
this.masterGain.gain.value = this.params.masterVolume;
this.analyser = this.audioContext.createAnalyser();
this.analyser.fftSize = 256;
this.masterSaturation = this.createSaturation(0.2);
this.masterEQ = this.audioContext.createBiquadFilter();
this.masterEQ.type = 'lowshelf';
this.masterEQ.frequency.value = 300;
this.masterEQ.gain.value = 2;

this.masterGain
  .connect(this.masterSaturation)
  .connect(this.masterEQ)
  .connect(this.analyser)
  .connect(this.audioContext.destination);

this.isInitialized = true;
document.getElementById('led-audio').classList.add('active');
this.updateStatus('AUDIO OK');
this.startMeter();
```

}

createSaturation(amount) {
const waveshaper = this.audioContext.createWaveShaper();
const samples = 44100;
const curve = new Float32Array(samples);
for (let i = 0; i < samples; i++) {
const x = (i * 2) / samples - 1;
curve[i] = Math.tanh(x * (1 + amount * 3)) * (1 - amount * 0.1);
}
waveshaper.curve = curve;
waveshaper.oversample = ‘2x’;
return waveshaper;
}

// ═══════════════════════════════════════════════════════════════
// BANKS & PRESETS
// ═══════════════════════════════════════════════════════════════

setupBanks() {
document.querySelectorAll(’.bank-btn’).forEach(btn => {
btn.addEventListener(‘click’, () => {
const bankId = btn.dataset.bank;
if (bankId === ‘custom’) {
document.getElementById(‘file-input’).click();
} else {
this.loadBank(bankId);
}
});
});
document.getElementById(‘file-input’).addEventListener(‘change’, (e) => {
if (e.target.files.length > 0) this.loadCustomSample(e.target.files[0]);
});
}

async loadBank(bankId) {
const bank = this.banks[bankId];
if (!bank || !bank.file) return;
const btn = document.querySelector(`[data-bank="${bankId}"]`);
btn.classList.add(‘loading’);
try {
await this.initAudioContext();
this.updateStatus(‘LOADING…’);
const response = await fetch(bank.file);
if (!response.ok) throw new Error(`Sample not found: ${bank.file}`);
const arrayBuffer = await response.arrayBuffer();
this.sourceBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
this.currentBank = bankId;
this.applyBankPreset(bank);
await this.generateVirtualTapes();
this.updateBankButtons();
this.updateDisplay();
this.updateStatus(‘READY’);
} catch (err) {
console.error(err);
this.updateStatus(‘LOAD ERROR’);
}
btn.classList.remove(‘loading’);
}

async loadCustomSample(file) {
const btn = document.querySelector(’[data-bank=“custom”]’);
btn.classList.add(‘loading’);
try {
await this.initAudioContext();
this.updateStatus(‘LOADING…’);
const arrayBuffer = await file.arrayBuffer();
this.sourceBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
this.banks.custom.name = file.name.substring(0, 12).toUpperCase();
this.currentBank = ‘custom’;
await this.generateVirtualTapes();
this.updateBankButtons();
this.updateDisplay();
this.updateStatus(‘READY’);
} catch (err) {
console.error(err);
this.updateStatus(‘LOAD ERROR’);
}
btn.classList.remove(‘loading’);
}

applyBankPreset(bank) {
if (!bank.presetOverrides) return;
Object.entries(bank.presetOverrides).forEach(([p, v]) => {
this.params[p] = v;
this.updateEncoderVisual(p);
});
}

updateBankButtons() {
document.querySelectorAll(’.bank-btn’).forEach(btn => {
btn.classList.toggle(‘active’, btn.dataset.bank === this.currentBank);
});
}

setupPresets() {
document.querySelectorAll(’.preset-btn’).forEach(btn => {
btn.addEventListener(‘click’, () => this.applyPreset(btn.dataset.preset));
});
}

applyPreset(presetId) {
const preset = this.presets[presetId];
if (!preset) return;
this.currentPreset = presetId;
Object.entries(preset).forEach(([p, v]) => {
this.params[p] = v;
this.updateEncoderVisual(p);
this.onParamChange(p, v);
});
document.querySelectorAll(’.preset-btn’).forEach(btn => {
btn.classList.toggle(‘active’, btn.dataset.preset === presetId);
});
if (this.sourceBuffer) this.generateVirtualTapes();
this.updateStatus(presetId.toUpperCase());
}

// ═══════════════════════════════════════════════════════════════
// VIRTUAL TAPES
// ═══════════════════════════════════════════════════════════════

async generateVirtualTapes() {
if (!this.sourceBuffer) return;
this.virtualTapes.clear();
const rootNote = this.baseOctave * 12 + 12;
for (let note = this.noteRange.min; note <= this.noteRange.max; note++) {
this.virtualTapes.set(note, this.createVirtualTape(note, note - rootNote));
}
}

createVirtualTape(note, semitoneOffset) {
const playbackRate = Math.pow(2, semitoneOffset / 12);
const drift = this.params.driftPerKey / 100;
const uniquePitchOffset = (Math.random() - 0.5) * drift * 0.02;
const uniqueFilterOffset = (Math.random() - 0.5) * drift * 400;
const uniqueNoiseLevel = Math.random() * drift * 0.3;
const zonePos = (note - this.noteRange.min) / (this.noteRange.max - this.noteRange.min);
const isLow = zonePos < 0.33, isHigh = zonePos > 0.66;
const zoneChar = {
filterOffset: isLow ? -600 : (isHigh ? 200 : 0),
instability: isLow ? 1.3 : (isHigh ? 0.8 : 1),
noiseBoost: isHigh ? 1.5 : 1,
lengthFactor: isHigh ? 0.85 : 1
};
return {
note,
playbackRate: playbackRate * (1 + uniquePitchOffset),
filterFreq: 2000 + uniqueFilterOffset + zoneChar.filterOffset,
noiseLevel: (0.02 + uniqueNoiseLevel) * zoneChar.noiseBoost,
instability: zoneChar.instability,
lengthFactor: zoneChar.lengthFactor,
attackVariation: 0.01 + Math.random() * 0.03,
stereoPan: (note - 60) / 48
};
}

// ═══════════════════════════════════════════════════════════════
// PLAY NOTE — routes through modes
// ═══════════════════════════════════════════════════════════════

playNote(note, velocity = 0.8) {
if (!this.isInitialized || !this.sourceBuffer) {
this.updateStatus(‘NO SAMPLE’);
return;
}
if (note < this.noteRange.min || note > this.noteRange.max) return;

```
switch (this.playMode) {
  case 'arp':
    this.addArpNote(note);
    return;

  case 'drone':
    this.handleDroneNote(note, velocity);
    // Record the drone note in step sequencer if recording
    if (this.seqIsRecording) this.recordStep(note);
    return;

  case 'chord':
    this.playChord(note, velocity);
    if (this.seqIsRecording) this.recordStep(note);
    return;

  default: // poly
    if (this.seqIsRecording) this.recordStep(note);
    this._playEnsemble(note, velocity);
}
```

}

stopNote(note) {
switch (this.playMode) {
case ‘arp’:
this.removeArpNote(note);
return;
case ‘chord’:
this._stopChord(note);
return;
case ‘drone’:
// Melody notes (not the drone itself) stop normally
if (note !== this.droneNote) this._stopVoices(note);
return;
default:
this._stopVoices(note);
}
}

// ─── Ensemble playback ──────────────────────────────────────────

_playEnsemble(note, velocity) {
if (this.activeVoices.has(note)) this._stopVoices(note);

```
const detunings = this._ensembleDetunings();
const tape = this.virtualTapes.get(note);
if (!tape) return;

const voices = detunings.map(detuneSemitones => {
  const rate = tape.playbackRate * Math.pow(2, detuneSemitones / 12) * this.speedMode;
  const adjustedTape = { ...tape, playbackRate: rate };
  const v = this.createVoice(adjustedTape, velocity / Math.sqrt(detunings.length));
  v.source.start(0);
  v.startTime = this.audioContext.currentTime;
  return v;
});

this.activeVoices.set(note, voices);

// Auto-release after tape length
const maxDuration = this.params.tapeLength * tape.lengthFactor;
const t = setTimeout(() => {
  this._fadeOutVoices(note, 0.5);
  this.updateVoicesCount();
}, maxDuration * 1000);
voices[0]._autoStopTimer = t;

this.updateVoicesCount();
```

}

_ensembleDetunings() {
if (this.ensembleVoices === 1) return [0];
if (this.ensembleVoices === 2) return [-0.10, 0.10];
return [-0.14, 0, 0.14];
}

_stopVoices(note) {
const voices = this.activeVoices.get(note);
if (!voices) return;
voices.forEach(v => {
if (v._autoStopTimer) clearTimeout(v._autoStopTimer);
});
const releaseTime = (this.params.release / 100) * 0.5 + 0.05;
voices.forEach(v => this.fadeOutVoice(v, releaseTime));
this.activeVoices.delete(note);
this.updateVoicesCount();
}

_fadeOutVoices(note, duration) {
const voices = this.activeVoices.get(note);
if (!voices) return;
voices.forEach(v => {
if (v._autoStopTimer) clearTimeout(v._autoStopTimer);
this.fadeOutVoice(v, duration);
});
this.activeVoices.delete(note);
}

// ─── Chord mode ─────────────────────────────────────────────────

playChord(rootNote, velocity) {
const intervals = this._chordIntervals();
const chordNotes = intervals.map(i => rootNote + i);
chordNotes.forEach((n, i) => {
const vel = i === 0 ? velocity : velocity * 0.65;
this._playEnsemble(n, vel);
});
this.chordMap.set(rootNote, chordNotes);
// Also mark root key as active
this._highlightKey(rootNote, true);
}

_chordIntervals() {
const types = { major: [0, 4, 7], minor: [0, 3, 7], sus2: [0, 2, 7] };
return types[this.chordType] || [0, 4, 7];
}

_stopChord(rootNote) {
const notes = this.chordMap.get(rootNote);
if (notes) {
notes.forEach(n => this._stopVoices(n));
this.chordMap.delete(rootNote);
} else {
this._stopVoices(rootNote);
}
this._highlightKey(rootNote, false);
}

// ─── Drone mode ─────────────────────────────────────────────────

handleDroneNote(note, velocity) {
// Toggle drone if same note pressed again
if (note === this.droneNote) {
this._stopVoices(note);
this.droneNote = null;
this._updateDroneDisplay();
return;
}

```
// Start new drone — stop old if any
if (this.droneNote !== null) {
  this._stopVoices(this.droneNote);
  const oldKey = document.querySelector(`.key.drone-held`);
  if (oldKey) oldKey.classList.remove('drone-held');
}

this.droneNote = note;
// Play with no auto-release (pass a very long tapeLength effectively)
const tape = this.virtualTapes.get(note);
if (!tape) return;

const detunings = this._ensembleDetunings();
const voices = detunings.map(d => {
  const rate = tape.playbackRate * Math.pow(2, d / 12) * this.speedMode;
  const adj = { ...tape, playbackRate: rate, lengthFactor: 999 };
  const v = this.createVoice(adj, velocity / Math.sqrt(detunings.length));
  v.source.start(0);
  v.startTime = this.audioContext.currentTime;
  return v;
});

this.activeVoices.set(note, voices);
this.updateVoicesCount();

// Highlight key
const keyEl = document.querySelector(`.key[data-note="${note % 12}"]`);
// Find via noteOffset
const keyOffset = note - this.baseOctave * 12;
const keyEls = document.querySelectorAll('.key');
keyEls.forEach(k => {
  if (parseInt(k.dataset.noteOffset) === keyOffset) k.classList.add('drone-held');
});

this._updateDroneDisplay();
```

}

_updateDroneDisplay() {
const disp = document.getElementById(‘drone-display’);
const noteSpan = document.getElementById(‘drone-note’);
if (this.droneNote !== null) {
disp.style.display = ‘inline’;
noteSpan.textContent = this._noteName(this.droneNote);
} else {
disp.style.display = ‘none’;
}
}

// ═══════════════════════════════════════════════════════════════
// ARPEGGIATOR
// ═══════════════════════════════════════════════════════════════

addArpNote(note) {
this.arpHeldNotes.add(note);
this._highlightKey(note, true, ‘arp’);
this._updateArpDisplay();

```
if (this.arpTimer === null) {
  // Fire immediately then start interval
  this._tickArp();
  const ms = (60 / this.arpBPM) * 1000;
  this.arpTimer = setInterval(() => this._tickArp(), ms);
}
```

}

removeArpNote(note) {
this.arpHeldNotes.delete(note);
this._highlightKey(note, false, ‘arp’);
this._updateArpDisplay();

```
if (this.arpHeldNotes.size === 0) {
  this._stopArp();
}
```

}

_stopArp() {
if (this.arpTimer) { clearInterval(this.arpTimer); this.arpTimer = null; }
if (this.arpCurrentNote !== null) {
this._stopVoices(this.arpCurrentNote);
this.arpCurrentNote = null;
}
this.arpIndex = 0;
this.arpDirection = 1;
}

_tickArp() {
if (this.arpHeldNotes.size === 0) return;

```
// Stop previous arp note
if (this.arpCurrentNote !== null) {
  this._stopVoices(this.arpCurrentNote);
}

const notes = this._buildArpSequence();
this.arpIndex = Math.max(0, Math.min(this.arpIndex, notes.length - 1));
const nextNote = notes[this.arpIndex];
this.arpCurrentNote = nextNote;
this._playEnsemble(nextNote, 0.8);

// Advance index based on pattern
this._advanceArpIndex(notes.length);
```

}

_buildArpSequence() {
let sorted = […this.arpHeldNotes].sort((a, b) => a - b);
if (this.arpOctaves === 2) {
sorted = […sorted, …sorted.map(n => n + 12)];
}
return sorted;
}

_advanceArpIndex(len) {
switch (this.arpPattern) {
case ‘up’:
this.arpIndex = (this.arpIndex + 1) % len;
break;
case ‘down’:
this.arpIndex = (this.arpIndex - 1 + len) % len;
break;
case ‘pingpong’:
this.arpIndex += this.arpDirection;
if (this.arpIndex >= len - 1) { this.arpDirection = -1; this.arpIndex = len - 1; }
else if (this.arpIndex <= 0) { this.arpDirection = 1; this.arpIndex = 0; }
break;
case ‘random’:
this.arpIndex = Math.floor(Math.random() * len);
break;
}
}

_setArpBPM(bpm) {
this.arpBPM = Math.max(30, Math.min(300, bpm));
document.getElementById(‘arp-bpm-val’).textContent = this.arpBPM;
if (this.arpTimer !== null) {
clearInterval(this.arpTimer);
const ms = (60 / this.arpBPM) * 1000;
this.arpTimer = setInterval(() => this._tickArp(), ms);
}
}

_updateArpDisplay() {
const disp = document.getElementById(‘arp-display’);
const noteSpan = document.getElementById(‘arp-notes’);
if (this.arpHeldNotes.size > 0) {
disp.style.display = ‘inline’;
const names = […this.arpHeldNotes].sort((a,b)=>a-b).map(n => this._noteName(n)).join(’ ’);
noteSpan.textContent = names;
} else {
disp.style.display = ‘none’;
}
}

// ═══════════════════════════════════════════════════════════════
// STEP RECORDER
// ═══════════════════════════════════════════════════════════════

setupStepRecorder() {
// Transport buttons
document.getElementById(‘seq-rec’).addEventListener(‘click’, () => this._toggleRec());
document.getElementById(‘seq-play’).addEventListener(‘click’, () => this._togglePlay());
document.getElementById(‘seq-clear’).addEventListener(‘click’, () => this._clearSeq());

```
// BPM
document.getElementById('seq-bpm-up').addEventListener('click', () => this._setSeqBPM(this.seqBPM + 5));
document.getElementById('seq-bpm-down').addEventListener('click', () => this._setSeqBPM(this.seqBPM - 5));

// Step count
document.getElementById('seq-steps-up').addEventListener('click', () => {
  this.seqStepCount = Math.min(16, this.seqStepCount + 1);
  document.getElementById('seq-steps-val').textContent = this.seqStepCount;
  this._buildSeqGrid();
});
document.getElementById('seq-steps-down').addEventListener('click', () => {
  this.seqStepCount = Math.max(2, this.seqStepCount - 1);
  document.getElementById('seq-steps-val').textContent = this.seqStepCount;
  this._buildSeqGrid();
});

this._buildSeqGrid();
```

}

_buildSeqGrid() {
const grid = document.getElementById(‘seq-grid’);
grid.innerHTML = ‘’;
for (let i = 0; i < this.seqStepCount; i++) {
const step = document.createElement(‘div’);
step.className = ‘seq-step’ + (this.seqSteps[i] ? ’ filled’ : ‘’);
step.dataset.index = i;

```
  const numEl = document.createElement('span');
  numEl.className = 'step-num';
  numEl.textContent = i + 1;

  const noteEl = document.createElement('span');
  noteEl.className = 'step-note';
  noteEl.textContent = this.seqSteps[i] ? this._noteName(this.seqSteps[i]) : '—';

  const dot = document.createElement('div');
  dot.className = 'step-dot';

  step.appendChild(numEl);
  step.appendChild(noteEl);
  step.appendChild(dot);

  // Click: if recording, set cursor; otherwise, clear step
  step.addEventListener('click', () => {
    if (this.seqIsRecording) {
      this.seqCursor = i;
      this._updateSeqGrid();
    } else {
      this.seqSteps[i] = null;
      this._updateSeqGrid();
    }
  });

  grid.appendChild(step);
}
```

}

_updateSeqGrid() {
const steps = document.querySelectorAll(’.seq-step’);
steps.forEach((el, i) => {
el.classList.toggle(‘filled’, !!this.seqSteps[i]);
el.classList.toggle(‘playing’, this.seqIsPlaying && i === this.seqPlayHead);
el.classList.toggle(‘cursor’, this.seqIsRecording && i === this.seqCursor);
const noteEl = el.querySelector(’.step-note’);
noteEl.textContent = this.seqSteps[i] ? this._noteName(this.seqSteps[i]) : ‘—’;
});
}

recordStep(note) {
this.seqSteps[this.seqCursor] = note;
this.seqCursor = (this.seqCursor + 1) % this.seqStepCount;
this._updateSeqGrid();
}

_toggleRec() {
this.seqIsRecording = !this.seqIsRecording;
if (this.seqIsRecording) {
this.seqCursor = 0;
// Stop playback if recording
if (this.seqIsPlaying) this._stopSeqPlayback();
}
const btn = document.getElementById(‘seq-rec’);
btn.classList.toggle(‘rec-active’, this.seqIsRecording);
this._updateSeqGrid();
}

_togglePlay() {
if (this.seqIsPlaying) {
this._stopSeqPlayback();
} else {
this._startSeqPlayback();
}
}

_startSeqPlayback() {
if (!this.isInitialized || !this.sourceBuffer) {
this.updateStatus(‘NO SAMPLE’);
return;
}
this.seqIsPlaying = true;
this.seqPlayHead = 0;
// Stop recording if playing
if (this.seqIsRecording) {
this.seqIsRecording = false;
document.getElementById(‘seq-rec’).classList.remove(‘rec-active’);
}
document.getElementById(‘seq-play’).classList.add(‘active’);
document.getElementById(‘seq-play’).textContent = ‘■ STOP’;
this._tickSeq();
const ms = (60 / this.seqBPM) * 1000;
this.seqTimer = setInterval(() => this._tickSeq(), ms);
}

_stopSeqPlayback() {
this.seqIsPlaying = false;
if (this.seqTimer) { clearInterval(this.seqTimer); this.seqTimer = null; }
if (this.seqLastNote !== null) {
this._stopVoices(this.seqLastNote);
this.seqLastNote = null;
}
document.getElementById(‘seq-play’).classList.remove(‘active’);
document.getElementById(‘seq-play’).textContent = ‘▶ PLAY’;
this._updateSeqGrid();
}

_tickSeq() {
// Stop previous note
if (this.seqLastNote !== null) {
this._stopVoices(this.seqLastNote);
this.seqLastNote = null;
}

```
const step = this.seqSteps[this.seqPlayHead];
if (step !== null) {
  this._playEnsemble(step, 0.8);
  this.seqLastNote = step;
}

this._updateSeqGrid();
this.seqPlayHead = (this.seqPlayHead + 1) % this.seqStepCount;
```

}

_clearSeq() {
this._stopSeqPlayback();
this.seqSteps = Array(16).fill(null);
this.seqCursor = 0;
this.seqPlayHead = 0;
this._buildSeqGrid();
}

_setSeqBPM(bpm) {
this.seqBPM = Math.max(30, Math.min(300, bpm));
document.getElementById(‘seq-bpm-val’).textContent = this.seqBPM;
if (this.seqIsPlaying) {
this._stopSeqPlayback();
this._startSeqPlayback();
}
}

// ═══════════════════════════════════════════════════════════════
// MODE CONTROLS SETUP
// ═══════════════════════════════════════════════════════════════

setupModeControls() {
// Ensemble
document.querySelectorAll(’[data-ensemble]’).forEach(btn => {
btn.addEventListener(‘click’, () => {
this.ensembleVoices = parseInt(btn.dataset.ensemble);
document.querySelectorAll(’[data-ensemble]’).forEach(b => b.classList.toggle(‘active’, b === btn));
this.updateModeDisplay();
});
});

```
// Speed
document.querySelectorAll('[data-speed]').forEach(btn => {
  btn.addEventListener('click', () => {
    this.speedMode = parseFloat(btn.dataset.speed);
    document.querySelectorAll('[data-speed]').forEach(b => b.classList.toggle('active', b === btn));
    this.updateModeDisplay();
  });
});

// Play Mode
document.querySelectorAll('[data-playmode]').forEach(btn => {
  btn.addEventListener('click', () => {
    const prev = this.playMode;
    this.playMode = btn.dataset.playmode;
    document.querySelectorAll('[data-playmode]').forEach(b => b.classList.toggle('active', b === btn));

    // Cleanup previous mode state
    if (prev === 'arp' && this.playMode !== 'arp') this._stopArp();
    if (prev === 'drone' && this.playMode !== 'drone' && this.droneNote !== null) {
      this._stopVoices(this.droneNote);
      this.droneNote = null;
      this._updateDroneDisplay();
    }

    // Show/hide ARP sub-controls
    document.getElementById('arp-row').style.display = (this.playMode === 'arp') ? 'flex' : 'none';
    // Show/hide chord type for CHORD mode
    document.getElementById('chord-type-group').style.display =
      (this.playMode === 'chord') ? 'flex' : 'none';

    // Show/hide display helpers
    document.getElementById('drone-display').style.display =
      (this.playMode === 'drone' && this.droneNote) ? 'inline' : 'none';
    document.getElementById('arp-display').style.display =
      (this.playMode === 'arp' && this.arpHeldNotes.size > 0) ? 'inline' : 'none';

    this.updateModeDisplay();
    this.updateStatus(this.playMode.toUpperCase());
  });
});

// Chord type
document.querySelectorAll('[data-chordtype]').forEach(btn => {
  btn.addEventListener('click', () => {
    this.chordType = btn.dataset.chordtype;
    document.querySelectorAll('[data-chordtype]').forEach(b => b.classList.toggle('active', b === btn));
  });
});

// ARP pattern
document.querySelectorAll('[data-arpmode]').forEach(btn => {
  btn.addEventListener('click', () => {
    this.arpPattern = btn.dataset.arpmode;
    document.querySelectorAll('[data-arpmode]').forEach(b => b.classList.toggle('active', b === btn));
    this.arpIndex = 0;
    this.arpDirection = 1;
  });
});

// ARP BPM
document.getElementById('arp-bpm-up').addEventListener('click', () => this._setArpBPM(this.arpBPM + 5));
document.getElementById('arp-bpm-down').addEventListener('click', () => this._setArpBPM(this.arpBPM - 5));

// ARP Octaves
document.querySelectorAll('[data-arpoct]').forEach(btn => {
  btn.addEventListener('click', () => {
    this.arpOctaves = parseInt(btn.dataset.arpoct);
    document.querySelectorAll('[data-arpoct]').forEach(b => b.classList.toggle('active', b === btn));
  });
});
```

}

updateModeDisplay() {
const speedLabel = this.speedMode === 0.5 ? ‘½×’ : (this.speedMode === 2 ? ‘2×’ : ‘1×’);
document.getElementById(‘mode-display’).textContent =
`${this.playMode.toUpperCase()} · ${this.ensembleVoices}V · ${speedLabel}`;
}

// ═══════════════════════════════════════════════════════════════
// AUDIO VOICE CREATION
// ═══════════════════════════════════════════════════════════════

createVoice(tape, velocity) {
const source = this.audioContext.createBufferSource();
source.buffer = this.sourceBuffer;
source.playbackRate.value = tape.playbackRate;
this.applyWowFlutter(source, tape);

```
const filter = this.audioContext.createBiquadFilter();
filter.type = 'lowpass';
const ageEffect = 1 - (this.params.tapeAge / 100) * 0.5;
filter.frequency.value = tape.filterFreq * ageEffect * (this.params.brightness / 50);
filter.Q.value = 0.7;

const saturation = this.createSaturation(this.params.saturation / 100);

const gain = this.audioContext.createGain();
gain.gain.value = 0;
const attackTime = (this.params.attack / 100) * 0.2 + tape.attackVariation;
const jitter = (this.params.startJitter / 100) * 0.03;
const attackStart = this.audioContext.currentTime + Math.random() * jitter;
gain.gain.setValueAtTime(0, attackStart);
gain.gain.linearRampToValueAtTime(velocity * 0.8, attackStart + attackTime);

const panner = this.audioContext.createStereoPanner();
panner.pan.value = Math.max(-1, Math.min(1, tape.stereoPan * 0.6));

source.connect(filter);
filter.connect(saturation);
saturation.connect(gain);
gain.connect(panner);
panner.connect(this.masterGain);

let noiseSource = null, noiseGain = null;
if (this.params.mechanicalNoise > 5) {
  noiseSource = this.createNoiseSource();
  const noiseFilter = this.audioContext.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.value = 800;
  noiseFilter.Q.value = 2;
  noiseGain = this.audioContext.createGain();
  noiseGain.gain.value = tape.noiseLevel * (this.params.mechanicalNoise / 50) * velocity;
  noiseSource.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(panner);
  noiseSource.start();
}

return { source, filter, gain, panner, noiseSource, noiseGain, tape, startTime: null };
```

}

applyWowFlutter(source, tape) {
const now = this.audioContext.currentTime;
const duration = this.params.tapeLength;
const wowAmount = (this.params.wow / 100) * 0.015 * tape.instability;
const flutterAmount = (this.params.flutter / 100) * 0.005 * tape.instability;
const baseRate = source.playbackRate.value;
const steps = Math.floor(duration * 20);
for (let i = 0; i < steps; i++) {
const t = i / 20;
const wow = Math.sin(t * Math.PI * 1.2 + Math.random() * 0.5) * wowAmount;
const flutter = Math.sin(t * Math.PI * 14 + Math.random() * 2) * flutterAmount;
const drift = (Math.random() - 0.5) * 0.002;
source.playbackRate.setValueAtTime(baseRate * (1 + wow + flutter + drift), now + t);
}
}

createNoiseSource() {
const bufferSize = this.audioContext.sampleRate * 2;
const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
const data = buffer.getChannelData(0);
for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
const noise = this.audioContext.createBufferSource();
noise.buffer = buffer;
noise.loop = true;
return noise;
}

fadeOutVoice(voice, duration) {
const now = this.audioContext.currentTime;
voice.gain.gain.cancelScheduledValues(now);
voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
voice.gain.gain.linearRampToValueAtTime(0, now + duration);
if (voice.noiseGain) {
voice.noiseGain.gain.cancelScheduledValues(now);
voice.noiseGain.gain.linearRampToValueAtTime(0, now + duration);
}
setTimeout(() => {
try { voice.source.stop(); } catch(e) {}
try { if (voice.noiseSource) voice.noiseSource.stop(); } catch(e) {}
}, duration * 1000 + 50);
}

// ═══════════════════════════════════════════════════════════════
// UI: KEYBOARD
// ═══════════════════════════════════════════════════════════════

buildKeyboard() {
const keyboard = document.getElementById(‘keyboard’);
keyboard.innerHTML = ‘’;
const noteNames = [‘C’,‘C#’,‘D’,‘D#’,‘E’,‘F’,‘F#’,‘G’,‘G#’,‘A’,‘A#’,‘B’];

```
this.keyboardLayout.forEach(keyDef => {
  const key = document.createElement('div');
  key.className = `key ${keyDef.black ? 'black' : ''}`;
  key.dataset.noteOffset = keyDef.note;
  key.dataset.code = keyDef.code;
  const midiNote = this.baseOctave * 12 + keyDef.note;
  const noteName = noteNames[midiNote % 12];
  if (keyDef.note === 0) key.classList.add('root');
  key.innerHTML = `
    <span class="key-letter">${keyDef.key}</span>
    <span class="key-note">${noteName}</span>
  `;

  const onDown = (e) => {
    e.preventDefault();
    this.initAudioContext();
    const note = this.baseOctave * 12 + keyDef.note;
    this.playNote(note, 0.8);
    if (this.playMode !== 'arp') key.classList.add('active');
  };
  const onUp = () => {
    const note = this.baseOctave * 12 + keyDef.note;
    this.stopNote(note);
    key.classList.remove('active');
  };

  key.addEventListener('mousedown', onDown);
  key.addEventListener('mouseup', onUp);
  key.addEventListener('mouseleave', () => { if (key.classList.contains('active')) onUp(); });
  key.addEventListener('touchstart', onDown, { passive: false });
  key.addEventListener('touchend', onUp);

  keyboard.appendChild(key);
});
```

}

_highlightKey(note, on, mode = ‘normal’) {
const offset = note - this.baseOctave * 12;
document.querySelectorAll(’.key’).forEach(k => {
if (parseInt(k.dataset.noteOffset) === offset) {
if (on) {
k.classList.add(mode === ‘arp’ ? ‘arp-held’ : ‘active’);
} else {
k.classList.remove(‘active’, ‘arp-held’, ‘drone-held’);
}
}
});
}

setupComputerKeyboard() {
const heldKeys = new Set();

```
document.addEventListener('keydown', (e) => {
  if (e.repeat || e.target.tagName === 'INPUT') return;

  const keyDef = this.keyboardLayout.find(k => k.code === e.code);
  if (keyDef) {
    e.preventDefault();
    if (heldKeys.has(e.code)) return;
    heldKeys.add(e.code);
    this.initAudioContext();
    const note = this.baseOctave * 12 + keyDef.note;
    this.playNote(note, 0.8);
    if (this.playMode !== 'arp') {
      const keyEl = document.querySelector(`.key[data-code="${e.code}"]`);
      if (keyEl) keyEl.classList.add('active');
    }
  }
  if (e.code === 'ArrowUp' || e.code === 'ArrowRight') { e.preventDefault(); this.changeOctave(1); }
  else if (e.code === 'ArrowDown' || e.code === 'ArrowLeft') { e.preventDefault(); this.changeOctave(-1); }
});

document.addEventListener('keyup', (e) => {
  heldKeys.delete(e.code);
  const keyDef = this.keyboardLayout.find(k => k.code === e.code);
  if (keyDef) {
    const note = this.baseOctave * 12 + keyDef.note;
    this.stopNote(note);
    const keyEl = document.querySelector(`.key[data-code="${e.code}"]`);
    if (keyEl) keyEl.classList.remove('active');
  }
});
```

}

setupOctaveButtons() {
document.getElementById(‘oct-up’).addEventListener(‘click’, () => this.changeOctave(1));
document.getElementById(‘oct-down’).addEventListener(‘click’, () => this.changeOctave(-1));
}

changeOctave(delta) {
const n = this.baseOctave + delta;
if (n >= 2 && n <= 6) {
this.baseOctave = n;
document.getElementById(‘octave-display’).textContent = n;
this.buildKeyboard();
}
}

// ═══════════════════════════════════════════════════════════════
// UI: ENCODERS
// ═══════════════════════════════════════════════════════════════

setupEncoders() {
document.querySelectorAll(’.encoder’).forEach(encoder => {
const param = encoder.dataset.param;
const min = parseFloat(encoder.dataset.min);
const max = parseFloat(encoder.dataset.max);
const initialValue = parseFloat(encoder.dataset.value);
this.params[param] = initialValue;
this.updateEncoderVisualElement(encoder, initialValue, min, max);

```
  let isDragging = false, startY = 0, startValue = 0;

  const onStart = (e) => {
    isDragging = true;
    startY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
    startValue = this.params[param];
    e.preventDefault();
  };
  const onMove = (e) => {
    if (!isDragging) return;
    const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
    const delta = startY - clientY;
    let newVal = startValue + (delta / 150) * (max - min);
    newVal = Math.max(min, Math.min(max, newVal));
    this.params[param] = newVal;
    this.updateEncoderVisualElement(encoder, newVal, min, max);
    this.onParamChange(param, newVal);
  };
  const onEnd = () => { isDragging = false; };

  encoder.addEventListener('mousedown', onStart);
  encoder.addEventListener('touchstart', onStart, { passive: false });
  document.addEventListener('mousemove', onMove);
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('mouseup', onEnd);
  document.addEventListener('touchend', onEnd);

  encoder.addEventListener('dblclick', () => {
    this.params[param] = initialValue;
    this.updateEncoderVisualElement(encoder, initialValue, min, max);
    this.onParamChange(param, initialValue);
  });
});
```

}

updateEncoderVisualElement(encoder, value, min, max) {
const indicator = encoder.querySelector(’.encoder-indicator’);
const normalized = (value - min) / (max - min);
const rotation = -135 + normalized * 270;
indicator.style.setProperty(’–rotation’, `${rotation}deg`);
}

updateEncoderVisual(param) {
const encoder = document.querySelector(`.encoder[data-param="${param}"]`);
if (!encoder) return;
const min = parseFloat(encoder.dataset.min);
const max = parseFloat(encoder.dataset.max);
this.updateEncoderVisualElement(encoder, this.params[param], min, max);
}

onParamChange(param, value) {
if (param === ‘masterVolume’ && this.masterGain) {
this.masterGain.gain.setTargetAtTime(value, this.audioContext.currentTime, 0.05);
}
if (this.currentPreset) {
this.currentPreset = null;
document.querySelectorAll(’.preset-btn’).forEach(btn => btn.classList.remove(‘active’));
}
}

// ═══════════════════════════════════════════════════════════════
// MIDI
// ═══════════════════════════════════════════════════════════════

async setupMIDI() {
if (!navigator.requestMIDIAccess) {
document.getElementById(‘midi-status’).textContent = ‘NO MIDI’;
return;
}
try {
const midiAccess = await navigator.requestMIDIAccess();
midiAccess.inputs.forEach(input => {
input.onmidimessage = (e) => this.onMIDIMessage(e);
document.getElementById(‘led-midi’).classList.add(‘active’);
document.getElementById(‘midi-status’).textContent = ‘MIDI ON’;
});
midiAccess.onstatechange = (e) => {
if (e.port.type === ‘input’ && e.port.state === ‘connected’) {
e.port.onmidimessage = (ev) => this.onMIDIMessage(ev);
document.getElementById(‘led-midi’).classList.add(‘active’);
document.getElementById(‘midi-status’).textContent = ‘MIDI ON’;
}
};
} catch(e) {
document.getElementById(‘midi-status’).textContent = ‘MIDI ERR’;
}
}

onMIDIMessage(e) {
const [status, note, velocity] = e.data;
const command = status & 0xf0;
document.getElementById(‘led-midi’).classList.add(‘warning’);
setTimeout(() => document.getElementById(‘led-midi’).classList.remove(‘warning’), 100);
if (command === 0x90 && velocity > 0) {
this.initAudioContext();
this.playNote(note, velocity / 127);
} else if (command === 0x80 || (command === 0x90 && velocity === 0)) {
this.stopNote(note);
}
}

// ═══════════════════════════════════════════════════════════════
// DISPLAY & METERS
// ═══════════════════════════════════════════════════════════════

updateDisplay() {
const bankName = this.currentBank ? this.banks[this.currentBank].name : ‘—’;
document.getElementById(‘bank-name’).textContent = bankName;
const sampleName = this.sourceBuffer
? (this.currentBank === ‘custom’ ? this.banks.custom.name : bankName)
: ‘NO FILE’;
document.getElementById(‘sample-name’).textContent = sampleName;
}

updateVoicesCount() {
document.getElementById(‘voices-count’).textContent = this.activeVoices.size;
}

updateStatus(text) {
document.getElementById(‘status-text’).textContent = text;
}

startMeter() {
const tapeFill = document.getElementById(‘tape-fill’);
const update = () => {
if (this.activeVoices.size > 0) {
let maxProgress = 0;
this.activeVoices.forEach(voices => {
const v = voices[0];
if (v && v.startTime) {
const elapsed = this.audioContext.currentTime - v.startTime;
const maxDur = this.params.tapeLength * (v.tape ? v.tape.lengthFactor : 1);
const progress = Math.min(100, (elapsed / maxDur) * 100);
maxProgress = Math.max(maxProgress, progress);
}
});
tapeFill.style.width = `${maxProgress}%`;
} else {
tapeFill.style.width = ‘0%’;
}
requestAnimationFrame(update);
};
update();
}

// ═══════════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════════

_noteName(midiNote) {
const names = [‘C’,‘C#’,‘D’,‘D#’,‘E’,‘F’,‘F#’,‘G’,‘G#’,‘A’,‘A#’,‘B’];
const oct = Math.floor(midiNote / 12) - 1;
return names[midiNote % 12] + oct;
}
}

document.addEventListener(‘DOMContentLoaded’, () => {
window.emullotron = new Emullotron();
});
