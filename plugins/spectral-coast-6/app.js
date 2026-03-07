import { SynthEngine } from './audio/engine.js';
import { defaultPatch, presets } from './presets.js';

const engine = new SynthEngine();
let patch = { ...defaultPatch };
let started = false;
let octaveShift = 0;
const heldKeyboardNotes = new Map();
const activePointerNotes = new Map();

const PARAMS = [
  'harmonics','tilt','inharmonic','drift','fold','index','morph','blur','warp','freeze','grain',
  'cutoff','resonance','drive','envAmt','tape','lofi','echo','space',
  'attack','release','master','velocityDepth','macroOrganic','macroComplexity','macroFocus','macroAge'
];

const KEYMAP = {
  a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66,
  g: 67, y: 68, h: 69, u: 70, j: 71, k: 72,
};

const keyboardEl = document.getElementById('keyboard');
const audioBtn = document.getElementById('audioToggle');
const presetSelect = document.getElementById('presetSelect');
const octaveSelect = document.getElementById('octaveShift');

function formatValue(param, value) {
  if (['model'].includes(param)) return value;
  if (['attack', 'release'].includes(param)) return `${Number(value).toFixed(3)} s`;
  return Number(value).toFixed(2);
}

function updateOutputs() {
  document.querySelectorAll('[data-param]').forEach((el) => {
    const param = el.dataset.param;
    if (el.tagName === 'SELECT') {
      el.value = patch[param];
    } else {
      el.value = patch[param];
      const out = el.parentElement?.querySelector('output');
      if (out) out.textContent = formatValue(param, patch[param]);
    }
  });
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
  audioBtn.textContent = 'Audio Ready';
}

function populatePresets() {
  Object.keys(presets).forEach((name, idx) => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    if (idx === 0) opt.selected = true;
    presetSelect.appendChild(opt);
  });
}

function buildKeyboard() {
  const whiteNotes = [60,62,64,65,67,69,71,72,74,76,77,79,81,83,84];
  const blackOffsets = { 60:61, 62:63, 65:66, 67:68, 69:70, 72:73, 74:75, 77:78, 79:80, 81:82 };
  keyboardEl.innerHTML = '';
  whiteNotes.forEach((midi, index) => {
    const key = document.createElement('button');
    key.className = 'key white';
    key.dataset.note = midi;
    key.textContent = noteName(midi);
    key.style.left = `${index * 52}px`;
    keyboardEl.appendChild(key);

    const blackMidi = blackOffsets[midi];
    if (blackMidi) {
      const black = document.createElement('button');
      black.className = 'key black';
      black.dataset.note = blackMidi;
      black.textContent = noteName(blackMidi);
      black.style.left = `${index * 52 + 36}px`;
      keyboardEl.appendChild(black);
    }
  });
}

function noteName(midi) {
  const names = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  return `${names[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

function playNote(midi, velocity = 0.92) {
  if (!started) return;
  engine.noteOn(midi + octaveShift * 12, velocity);
  const key = keyboardEl.querySelector(`.key[data-note="${midi}"]`);
  if (key) key.classList.add('active');
}

function stopNote(midi) {
  if (!started) return;
  engine.noteOff(midi + octaveShift * 12);
  const key = keyboardEl.querySelector(`.key[data-note="${midi}"]`);
  if (key) key.classList.remove('active');
}

async function main() {
  populatePresets();
  buildKeyboard();
  updateOutputs();

  audioBtn.addEventListener('click', ensureStarted);

  presetSelect.addEventListener('change', async (e) => {
    await ensureStarted();
    applyPatch(presets[e.target.value]);
  });

  octaveSelect.addEventListener('change', (e) => {
    octaveShift = Number(e.target.value || 0);
  });

  document.querySelectorAll('[data-param]').forEach((el) => {
    el.addEventListener('input', async (e) => {
      if (el.tagName !== 'SELECT') {
        await ensureStarted();
        const value = Number(e.target.value);
        applyPatch({ [e.target.dataset.param]: value });
      }
    });
    if (el.tagName === 'SELECT') {
      el.addEventListener('change', async (e) => {
        await ensureStarted();
        applyPatch({ [e.target.dataset.param]: e.target.value });
      });
    }
  });

  document.getElementById('panicBtn').addEventListener('click', async () => {
    await ensureStarted();
    engine.panic();
    document.querySelectorAll('.key.active').forEach((k) => k.classList.remove('active'));
  });

  keyboardEl.addEventListener('pointerdown', async (e) => {
    const key = e.target.closest('.key');
    if (!key) return;
    await ensureStarted();
    const note = Number(key.dataset.note);
    activePointerNotes.set(e.pointerId, note);
    key.setPointerCapture?.(e.pointerId);
    playNote(note, 0.94);
  });

  keyboardEl.addEventListener('pointerup', (e) => {
    const note = activePointerNotes.get(e.pointerId);
    if (note != null) {
      stopNote(note);
      activePointerNotes.delete(e.pointerId);
    }
  });
  keyboardEl.addEventListener('pointercancel', (e) => {
    const note = activePointerNotes.get(e.pointerId);
    if (note != null) {
      stopNote(note);
      activePointerNotes.delete(e.pointerId);
    }
  });

  window.addEventListener('keydown', async (e) => {
    if (e.repeat) return;
    if (e.key === 'z') {
      octaveShift = Math.max(-1, octaveShift - 1);
      octaveSelect.value = String(octaveShift);
      return;
    }
    if (e.key === 'x') {
      octaveShift = Math.min(2, octaveShift + 1);
      octaveSelect.value = String(octaveShift);
      return;
    }
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
}

main();
