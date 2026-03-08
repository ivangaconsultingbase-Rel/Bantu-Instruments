/**
 * DR-4 DRUM MACHINE
 * Moteur inspiré du Modor DR-2 :
 *   - Enveloppes DR-2 : 5 courbes (Linear, Squared Linear, Exponential,
 *     Squared Reciprocal, Reciprocal) avec interpolation douce
 *   - 4 modèles de synthèse : Drive BD, Noise Snare, Cymbal Noise, Multi-Burst Clap
 *   - Paramètres X, Y, Z, T par modèle
 */

(() => {
'use strict';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const qs  = (s, el = document) => el.querySelector(s);
const qsa = (s, el = document) => Array.from(el.querySelectorAll(s));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp  = (a, b, t) => a + (b - a) * t;

// ─── Track Definitions ────────────────────────────────────────────────────────
const TRACKS = [
  {
    id: 'bd', name: 'BD', fullName: 'BASS DRUM', model: 'Drive BD',
    color: '#ff6b35',
    defaultPattern: [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,1,0],
    defaultAccents: [1,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    // amp decay, amp curve, pitch, pitch amount, pitch decay, pitch curve, X, Y, Z, T
    params: { decay:0.55, curve:0.5, pitch:0.22, amount:0.78, pdec:0.28, pcrv:0.5, x:0.18, y:0.28, z:0.32, t:0.22 },
    paramLabels: {
      x: 'X  DIST GAIN', y: 'Y  BPF FREQ',
      z: 'Z  BPF RES',   t: 'T  DRY/WET'
    },
    modelDesc: 'Sine + pitch env + distortion path (WaveShaper → BPF → soft clip) — paramètre T contrôle le mix'
  },
  {
    id: 'sd', name: 'SD', fullName: 'SNARE DRUM', model: 'Noise Snare',
    color: '#38c4c4',
    defaultPattern: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    defaultAccents: [0,0,0,0, 1,0,0,0, 0,0,0,0, 0,0,0,0],
    params: { decay:0.42, curve:0.5, pitch:0.38, amount:0.32, pdec:0.14, pcrv:0.5, x:0.58, y:0.34, z:0.55, t:0.62 },
    paramLabels: {
      x: 'X  HPF FREQ',  y: 'Y  HPF RES',
      z: 'Z  SNAP BURST', t: 'T  TONE/NOISE'
    },
    modelDesc: 'Sine tone + filtered noise + snap burst initial — T = balance tone/bruit'
  },
  {
    id: 'hh', name: 'HH', fullName: 'HI-HAT', model: 'Cymbal Noise',
    color: '#f5d000',
    defaultPattern: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    defaultAccents: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    params: { decay:0.18, curve:0.52, pitch:0.65, amount:0, pdec:0, pcrv:0.5, x:0.72, y:0.38, z:0.32, t:0.08 },
    paramLabels: {
      x: 'X  BPF FREQ',  y: 'Y  BPF Q',
      z: 'Z  CHAR SPREAD', t: 'T  OPEN/CLOSED'
    },
    modelDesc: '6 oscillateurs carrés avec rapports inharmoniques — Z = spread des ratios, T = ouvert/fermé'
  },
  {
    id: 'cp', name: 'CP', fullName: 'CLAP', model: 'Multi-Burst',
    color: '#b060ff',
    defaultPattern: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    defaultAccents: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    params: { decay:0.35, curve:0.52, pitch:0.5, amount:0, pdec:0, pcrv:0.5, x:0.52, y:0.48, z:0.38, t:0.44 },
    paramLabels: {
      x: 'X  BPF FREQ',  y: 'Y  BPF RES',
      z: 'Z  BURST SPACE', t: 'T  TAIL LEN'
    },
    modelDesc: '3 rafales de bruit + BPF + queue de reverb — Z = espacement, T = longueur queue'
  }
];

// ─── DR-2 ENVELOPE SYSTEM ────────────────────────────────────────────────────
/**
 * 5 courbes DR-2 avec interpolation :
 *   0.00 = Linear        y = 1 - x
 *   0.25 = Squared Lin   y = (1 - x)²
 *   0.50 = Exponential   y = e^(-5x)       ← par défaut, le plus courant
 *   0.75 = Sq Reciprocal y = [a/(x+a)]²
 *   1.00 = Reciprocal    y = a/(x+a)        ← queue très longue
 */
function dr2CurveArr(curveParam, samples = 256) {
  const arr = new Float32Array(samples);
  const a = 0.14; // constante pour les courbes réciproques

  for (let i = 0; i < samples; i++) {
    const x = i / (samples - 1);

    const lin   = 1 - x;
    const sqlin = (1 - x) * (1 - x);
    const expo  = Math.exp(-5.5 * x);
    // Normalisé pour que la courbe parte bien de ~1 à ~0
    const xn     = x * 0.86; // scaling pour que la valeur finale soit proche de 0
    const sqrcp  = Math.pow(a / (xn + a), 2);
    const rcp    = a / (xn + a);

    const c = clamp(curveParam, 0, 1);
    let y;
    if      (c <= 0.25) y = lerp(lin,   sqlin, c / 0.25);
    else if (c <= 0.50) y = lerp(sqlin, expo,  (c - 0.25) / 0.25);
    else if (c <= 0.75) y = lerp(expo,  sqrcp, (c - 0.50) / 0.25);
    else                y = lerp(sqrcp, rcp,   (c - 0.75) / 0.25);

    arr[i] = Math.max(0.00001, Math.min(1, y));
  }
  arr[samples - 1] = 0.00001; // fin propre
  return arr;
}

/**
 * Applique une enveloppe DR-2 à un AudioParam
 * fromVal → toVal sur decaySec secondes, avec la courbe curveParam
 */
function applyDR2Env(param, when, decaySec, curveParam, fromVal, toVal = 0.00001) {
  const curve  = dr2CurveArr(curveParam);
  const scaled = Float32Array.from(curve, v => lerp(toVal, fromVal, v));
  try {
    param.cancelScheduledValues(when - 0.0001);
    param.setValueAtTime(fromVal, when);
    param.setValueCurveAtTime(scaled, when, Math.max(0.005, decaySec));
  } catch (_) {
    // Fallback si setValueCurveAtTime échoue (certains navigateurs)
    param.setValueAtTime(fromVal, when);
    param.exponentialRampToValueAtTime(Math.max(0.00001, toVal), when + decaySec);
  }
}

// ─── Waveshapers ─────────────────────────────────────────────────────────────
function makeHardClip(z) {
  const n = 512, c = new Float32Array(n);
  const k = 2 + z * 120;
  for (let i = 0; i < n; i++) {
    const x = i * 2 / (n - 1) - 1;
    c[i] = Math.tanh(k * x);
  }
  return c;
}

function makeSoftClip(z) {
  const n = 512, c = new Float32Array(n);
  const k = 1 + z * 7;
  for (let i = 0; i < n; i++) {
    const x = i * 2 / (n - 1) - 1;
    c[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return c;
}

// ─── MODEL: DRIVE BD (Bass Drum) ─────────────────────────────────────────────
/**
 * D'après le DR-2 Drive BD :
 * - Oscillateur sinewave avec pitch + pitch envelope
 * - Amplificateur avec decay + curve
 * - Split en deux chemins mixés par T :
 *   Chemin A : signal direct (dry)
 *   Chemin B : hard shaper (gain X) → BPF (freq Y, Q Z) → soft shaper → wet
 */
function triggerBD(ctx, out, p, when, vel) {
  const baseFreq  = 28 + p.pitch * 200;         // 28-228 Hz
  const pitchTop  = baseFreq * (1 + p.amount * 16); // jusqu'à 16× la fréquence de base
  const pitchDec  = 0.012 + p.pdec * 0.38;      // pitch decay
  const ampDec    = 0.08 + p.decay * 2.8;        // amp decay
  const bpfFreq   = 40  + p.y * 1100;            // BPF cutoff
  const bpfQ      = 0.4 + p.z * 18;             // BPF resonance
  const dryWet    = p.t;                          // mix dry/wet path

  // Oscillateur
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(pitchTop, when);
  applyDR2Env(osc.frequency, when, pitchDec, p.pcrv, pitchTop, baseFreq);

  // Pré-gain (boost avant distortion)
  const preGain = ctx.createGain();
  preGain.gain.value = 1 + p.x * 5;

  // Amp VCA
  const vca = ctx.createGain();
  vca.gain.setValueAtTime(0.00001, when - 0.001);
  applyDR2Env(vca.gain, when, ampDec, p.curve, vel * 0.92);

  // Chemin sec (dry)
  const dryG = ctx.createGain(); dryG.gain.value = 1 - dryWet;

  // Chemin distorti (wet)
  const wetG    = ctx.createGain(); wetG.gain.value = dryWet;
  const hardSh  = ctx.createWaveShaper();
  hardSh.curve  = makeHardClip(p.x); hardSh.oversample = '4x';
  const bpf     = ctx.createBiquadFilter();
  bpf.type = 'bandpass'; bpf.frequency.value = bpfFreq; bpf.Q.value = bpfQ;
  const softSh  = ctx.createWaveShaper();
  softSh.curve  = makeSoftClip(0.15 + p.x * 0.4); softSh.oversample = '2x';

  // Graph
  osc.connect(preGain);
  preGain.connect(dryG); dryG.connect(vca);
  preGain.connect(hardSh); hardSh.connect(bpf);
  bpf.connect(softSh); softSh.connect(wetG); wetG.connect(vca);
  vca.connect(out);

  osc.start(when); osc.stop(when + ampDec + 0.6);
}

// ─── MODEL: NOISE SNARE ───────────────────────────────────────────────────────
/**
 * - Tone : sinewave avec légère pitch env
 * - Noise : bruit blanc → HPF (X=freq, Y=Q)
 * - Snap : rafale de bruit très courte (Z) au début
 * - T contrôle le mix tone (0) / bruit (1)
 */
function triggerSD(ctx, out, p, when, vel) {
  const toneFreq = 80 + p.pitch * 320;
  const ampDec   = 0.04 + p.decay * 0.9;
  const hpfFreq  = 250 + p.x * 9000;
  const hpfQ     = 0.5 + p.y * 5;
  const snapAmt  = p.z;
  const toneMix  = 1 - p.t;
  const noiseMix = p.t;
  const end      = when + ampDec + 0.15;

  // Tone (sine)
  const osc = ctx.createOscillator(); osc.type = 'sine';
  osc.frequency.setValueAtTime(toneFreq * 1.7, when);
  applyDR2Env(osc.frequency, when, 0.018, 0.55, toneFreq * 1.7, toneFreq);
  const tVCA = ctx.createGain(); tVCA.gain.setValueAtTime(0.00001, when - 0.001);
  applyDR2Env(tVCA.gain, when, ampDec * 0.6, p.curve, vel * 0.58 * (toneMix + 0.08));
  osc.connect(tVCA); tVCA.connect(out);
  osc.start(when); osc.stop(end);

  // Noise body
  const nBuf = makeNoiseBuf(ctx, ampDec + 0.2);
  const noise = ctx.createBufferSource(); noise.buffer = nBuf;
  const hpf   = ctx.createBiquadFilter(); hpf.type = 'highpass';
  hpf.frequency.value = hpfFreq; hpf.Q.value = hpfQ;
  const nVCA  = ctx.createGain(); nVCA.gain.setValueAtTime(0.00001, when - 0.001);
  applyDR2Env(nVCA.gain, when, ampDec, p.curve, vel * 0.78 * noiseMix);
  noise.connect(hpf); hpf.connect(nVCA); nVCA.connect(out);
  noise.start(when); noise.stop(end);

  // Snap burst (très court, bruit large-bande)
  if (snapAmt > 0.02) {
    const snapDec = 0.003 + snapAmt * 0.025;
    const sBuf    = makeNoiseBuf(ctx, snapDec + 0.01);
    const sNoise  = ctx.createBufferSource(); sNoise.buffer = sBuf;
    const sVCA    = ctx.createGain(); sVCA.gain.setValueAtTime(0.00001, when - 0.001);
    applyDR2Env(sVCA.gain, when, snapDec, 0.2, vel * snapAmt * 0.65);
    sNoise.connect(sVCA); sVCA.connect(out);
    sNoise.start(when); sNoise.stop(when + snapDec + 0.05);
  }
}

// ─── MODEL: CYMBAL NOISE (Hi-Hat) ────────────────────────────────────────────
/**
 * D'après le DR-2 Ride Cymbal :
 * - 6 oscillateurs carrés avec rapports de fréquences inharmoniques fixes
 * - Z contrôle le spread/caractère (étalement des ratios)
 * - Mélange → BPF (X=freq, Y=Q)
 * - T > 0.5 → hi-hat ouvert (decay plus long)
 *
 * Rapports inharmoniques typiques d'une cymbale métal :
 * basés sur les modes de vibration d'un disque circulaire
 */
const CYMBAL_RATIOS = [1.0, 1.3131, 1.4983, 1.6755, 2.0, 2.3741];

function triggerHH(ctx, out, p, when, vel) {
  const baseFreq = 160 + p.pitch * 1800;
  const isOpen   = p.t > 0.5;
  const ampDec   = isOpen ? (0.18 + p.decay * 1.5) : (0.016 + p.decay * 0.14);
  const bpfFreq  = 2000 + p.x * 14000;
  const bpfQ     = 0.5  + p.y * 8;
  const spread   = p.z;

  // Mix des 6 oscillateurs
  const mix = ctx.createGain(); mix.gain.value = 1 / CYMBAL_RATIOS.length;

  CYMBAL_RATIOS.forEach((r, i) => {
    const osc = ctx.createOscillator(); osc.type = 'square';
    // Z déforme les ratios pour changer le caractère de la cymbale
    const detuned = r * (1 + (i - 2.5) * 0.038 * spread);
    osc.frequency.value = baseFreq * detuned;
    osc.connect(mix);
    osc.start(when); osc.stop(when + ampDec + 0.06);
  });

  // BPF principal
  const bpf = ctx.createBiquadFilter(); bpf.type = 'bandpass';
  bpf.frequency.value = bpfFreq; bpf.Q.value = bpfQ;

  // HPF pour la brillance haute
  const hpf = ctx.createBiquadFilter(); hpf.type = 'highpass';
  hpf.frequency.value = bpfFreq * 0.45;

  const vca = ctx.createGain(); vca.gain.setValueAtTime(0.00001, when - 0.001);
  applyDR2Env(vca.gain, when, ampDec, p.curve, vel * 0.58);

  mix.connect(bpf); bpf.connect(hpf); hpf.connect(vca); vca.connect(out);
}

// ─── MODEL: MULTI-BURST CLAP ─────────────────────────────────────────────────
/**
 * 3 rafales de bruit blanc successives (comme le son d'un clap),
 * chacune filtrée par un BPF (X=freq, Y=Q)
 * Z : espacement entre les rafales
 * T : longueur de la queue de la dernière rafale (corps du clap)
 */
function triggerCP(ctx, out, p, when, vel) {
  const bpfFreq  = 600 + p.x * 5500;
  const bpfQ     = 0.5 + p.y * 9;
  const spacing  = 0.004 + p.z * 0.026;
  const tailDec  = 0.04  + p.t * 0.55;
  const burstDec = 0.005 + p.decay * 0.016;
  const num      = 3;

  for (let b = 0; b < num; b++) {
    const t0    = when + b * spacing;
    const dec   = b < num - 1 ? burstDec : burstDec + tailDec;
    const level = b < num - 1 ? vel * 0.46 : vel * 0.88;
    const curv  = b < num - 1 ? 0.45 : p.curve;

    const buf  = makeNoiseBuf(ctx, dec + 0.06);
    const src  = ctx.createBufferSource(); src.buffer = buf;
    const bpf  = ctx.createBiquadFilter(); bpf.type = 'bandpass';
    bpf.frequency.value = bpfFreq; bpf.Q.value = bpfQ;
    const vca  = ctx.createGain(); vca.gain.setValueAtTime(0.00001, t0 - 0.001);
    applyDR2Env(vca.gain, t0, dec, curv, level);
    src.connect(bpf); bpf.connect(vca); vca.connect(out);
    src.start(t0); src.stop(t0 + dec + 0.1);
  }
}

// ─── Noise Buffer Helper ──────────────────────────────────────────────────────
function makeNoiseBuf(ctx, durationSec) {
  const len = Math.ceil(ctx.sampleRate * (durationSec + 0.05));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d   = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────
const TRIGGER = { bd: triggerBD, sd: triggerSD, hh: triggerHH, cp: triggerCP };

// ─── State ────────────────────────────────────────────────────────────────────
// Track state (indépendant de l'audio)
const trackState = TRACKS.map(def => ({
  id:       def.id,
  steps:    [...def.defaultPattern],
  accents:  [...def.defaultAccents],
  params:   { ...def.params },
  mute:     false,
  volume:   0.82
}));

// Audio state
let audioCtx  = null;
let masterGain = null;
let audioReady = false;

// Sequencer state
let playing   = false;
let current   = -1;
let nextTick  = 0;
let seqTimer  = null;
let bpm       = 120;
let swing     = 0.08;

// UI state
let selectedTrack = 'bd';

// ─── Audio Init ───────────────────────────────────────────────────────────────
async function initAudio() {
  if (audioReady) {
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    return;
  }
  audioCtx   = new (window.AudioContext || window.webkitAudioContext)();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.82;
  masterGain.connect(audioCtx.destination);
  audioReady = true;
  qs('#audioBtn').classList.add('active');
  qs('#audioBtn').innerHTML = '<span class="audio-dot"></span>AUDIO ON';
}

// ─── Sequencer ────────────────────────────────────────────────────────────────
function startSeq() {
  if (!audioReady) return;
  playing  = true;
  current  = -1;
  nextTick = audioCtx.currentTime + 0.04;
  clearInterval(seqTimer);
  seqTimer = setInterval(scheduler, 22);
  qs('#playBtn').classList.add('active');
}

function stopSeq() {
  playing = false;
  clearInterval(seqTimer);
  seqTimer = null;
  current  = -1;
  qs('#playBtn').classList.remove('active');
  renderPlayhead();
}

function scheduler() {
  const lookAhead = 0.14;
  const stepDur   = 60 / bpm / 4; // croche (16th note)
  while (nextTick < audioCtx.currentTime + lookAhead) {
    current = (current + 1) % 16;
    scheduleStep(current, nextTick);
    const isOdd = current % 2 === 1;
    nextTick += stepDur + (isOdd ? stepDur * swing : 0);
  }
  renderPlayhead();
}

function scheduleStep(stepIdx, when) {
  trackState.forEach(ts => {
    if (ts.mute)              return;
    if (!ts.steps[stepIdx])   return;
    const vel    = ts.accents[stepIdx] ? Math.min(1, ts.volume * 1.28) : ts.volume;
    const def    = TRACKS.find(d => d.id === ts.id);
    TRIGGER[ts.id]?.(audioCtx, masterGain, ts.params, when, vel);
  });
}

function previewTrack(id) {
  if (!audioReady) return;
  const ts  = trackState.find(t => t.id === id);
  if (!ts) return;
  TRIGGER[id]?.(audioCtx, masterGain, ts.params, audioCtx.currentTime + 0.01, ts.volume);
}

// ─── Build UI ─────────────────────────────────────────────────────────────────
function buildTracks() {
  const section = qs('#tracksSection');
  section.innerHTML = TRACKS.map(def => {
    const ts = trackState.find(t => t.id === def.id);
    return `
    <div class="track" data-id="${def.id}">
      <div class="track-header" data-track="${def.id}" title="Cliquez pour sélectionner">
        <div class="track-info">
          <div class="track-name" style="color:${def.color}">${def.name}</div>
          <div class="track-full-name">${def.fullName}</div>
          <div class="track-model-name">${def.model}</div>
        </div>
        <button class="mute-btn" data-track="${def.id}" title="Mute">M</button>
        <button class="preview-btn" data-track="${def.id}" title="Preview">▶</button>
        <div class="track-vol-wrap">
          <div class="vol-label">VOL</div>
          <input type="range" class="track-vol hw-slider" data-track="${def.id}"
            min="0" max="1" step="0.01" value="${ts.volume}">
        </div>
      </div>
      <div class="steps-row">
        ${Array.from({length:16}, (_,i) => `
          <button class="step-btn${ts.steps[i] ? ' on' : ''}${ts.accents[i] ? ' accent' : ''}"
            data-track="${def.id}" data-step="${i}" title="Step ${i+1}${ts.accents[i] ? ' (ACCENT)' : ''}">
            <span class="step-num">${i+1}</span>
          </button>
        `).join('')}
      </div>
    </div>`;
  }).join('');
}

// ─── Param Panel ─────────────────────────────────────────────────────────────
const PARAM_DEFS = [
  { id:'decay',  label:'DECAY',   group:'amp',   defaultVal:0.5 },
  { id:'curve',  label:'CURVE',   group:'amp',   defaultVal:0.5 },
  { id:'pitch',  label:'PITCH',   group:'pitch', defaultVal:0.3 },
  { id:'amount', label:'AMT',     group:'pitch', defaultVal:0.5 },
  { id:'pdec',   label:'P.DEC',   group:'pitch', defaultVal:0.3 },
  { id:'pcrv',   label:'P.CRV',   group:'pitch', defaultVal:0.5 },
  { id:'x',      label:'X',       group:'model', defaultVal:0.5 },
  { id:'y',      label:'Y',       group:'model', defaultVal:0.5 },
  { id:'z',      label:'Z',       group:'model', defaultVal:0.5 },
  { id:'t',      label:'T',       group:'model', defaultVal:0.5 },
];

function buildParamRows() {
  PARAM_DEFS.forEach(({ id, label, defaultVal }) => {
    const row = qs(`#paramRow_${id}`);
    if (!row) return;
    const isDecayParam = ['decay','pdec'].includes(id);
    row.innerHTML = `
      <div class="prow-inner">
        <label class="prow-label" id="plabel_${id}">${label}</label>
        <input type="range" class="hw-slider prow-slider" id="pslider_${id}"
          data-param="${id}" min="0" max="1" step="0.01" value="${defaultVal}">
        <div class="prow-readout" id="preadout_${id}">—</div>
      </div>`;

    qs(`#pslider_${id}`).addEventListener('input', e => {
      const val = parseFloat(e.target.value);
      const ts = trackState.find(t => t.id === selectedTrack);
      if (ts) {
        ts.params[id] = val;
        qs(`#preadout_${id}`).textContent = formatParam(id, val, selectedTrack);
        if (['curve','pcrv'].includes(id)) drawEnvCurve();
      }
    });
  });
}

function updateParamPanel() {
  const def = TRACKS.find(d => d.id === selectedTrack);
  const ts  = trackState.find(t => t.id === selectedTrack);
  if (!def || !ts) return;

  // Header
  const badge = qs('#paramsTrackBadge');
  badge.textContent = def.name;
  badge.style.color = def.color;
  badge.style.borderColor = def.color;
  qs('#paramsTrackName').textContent = def.fullName;
  qs('#paramsModel').textContent     = `${def.model} — ${def.modelDesc}`;

  // X/Y/Z/T labels
  ['x','y','z','t'].forEach(k => {
    const el = qs(`#plabel_${k}`);
    if (el && def.paramLabels[k]) el.textContent = def.paramLabels[k];
  });

  // Slider values + readouts
  PARAM_DEFS.forEach(({ id }) => {
    const slider  = qs(`#pslider_${id}`);
    const readout = qs(`#preadout_${id}`);
    if (slider && id in ts.params) {
      slider.value      = ts.params[id];
      readout.textContent = formatParam(id, ts.params[id], selectedTrack);
    }
  });

  // Highlight selected track
  qsa('.track').forEach(el => {
    el.classList.toggle('selected', el.dataset.id === selectedTrack);
  });

  drawEnvCurve();
}

function formatParam(param, value, trackId) {
  const ts = trackState.find(t => t.id === trackId);
  if (param === 'pitch') {
    const freq = Math.round(28 + value * 200);
    return `${freq} Hz`;
  }
  if (param === 'decay') {
    const sec = (0.08 + value * 2.8).toFixed(2);
    return `${sec}s`;
  }
  if (param === 'pdec') {
    const ms = Math.round((0.012 + value * 0.38) * 1000);
    return `${ms}ms`;
  }
  if (param === 'amount') return `${Math.round(value * 100)}%`;
  if (param === 'curve' || param === 'pcrv') {
    const names = ['LIN','SQL','EXP','SQR','RCP'];
    const idx   = clamp(Math.round(value * 4), 0, 4);
    return names[idx];
  }
  if (param === 't' && trackId === 'hh') {
    return value > 0.5 ? 'OPEN' : 'CLOSED';
  }
  return `${Math.round(value * 100)}%`;
}

// ─── Envelope Curve Visualizer ───────────────────────────────────────────────
function drawEnvCurve() {
  const canvas = qs('#envCanvas');
  if (!canvas) return;
  const ctx2d = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;

  const ts = trackState.find(t => t.id === selectedTrack);
  const curveParam = ts?.params.curve ?? 0.5;
  const pitchCurve = ts?.params.pcrv  ?? 0.5;

  ctx2d.clearRect(0, 0, W, H);

  // Grid
  ctx2d.strokeStyle = 'rgba(255,124,0,.08)';
  ctx2d.lineWidth = 1;
  for (let x = 0; x <= W; x += W / 4) {
    ctx2d.beginPath(); ctx2d.moveTo(x, 0); ctx2d.lineTo(x, H); ctx2d.stroke();
  }
  ctx2d.beginPath(); ctx2d.moveTo(0, H/2); ctx2d.lineTo(W, H/2); ctx2d.stroke();

  function drawCurve(cParam, color, glow) {
    const arr = dr2CurveArr(cParam, W);
    ctx2d.save();
    ctx2d.strokeStyle = color;
    ctx2d.lineWidth = glow ? 2.5 : 1.5;
    ctx2d.shadowColor = color;
    ctx2d.shadowBlur  = glow ? 6 : 0;
    ctx2d.beginPath();
    for (let i = 0; i < W; i++) {
      const x = i;
      const y = H - 4 - arr[i] * (H - 8);
      if (i === 0) ctx2d.moveTo(x, y); else ctx2d.lineTo(x, y);
    }
    ctx2d.stroke();
    ctx2d.restore();
  }

  // Pitch curve (dimmer)
  if (ts?.params.amount > 0.05) {
    drawCurve(pitchCurve, 'rgba(100,200,255,.35)', false);
  }

  // Amp curve (bright)
  drawCurve(curveParam, '#ff8c00', true);

  // Labels
  ctx2d.fillStyle = 'rgba(255,124,0,.55)';
  ctx2d.font = '8px Share Tech Mono, monospace';
  ctx2d.fillText('AMP', 3, 10);
  if (ts?.params.amount > 0.05) {
    ctx2d.fillStyle = 'rgba(100,200,255,.55)';
    ctx2d.fillText('PTCH', 3, 20);
  }
}

// ─── Render Playhead ─────────────────────────────────────────────────────────
function renderPlayhead() {
  qsa('.step-btn').forEach(btn => {
    const i = parseInt(btn.dataset.step);
    btn.classList.toggle('playing', playing && current === i);
  });
}

// ─── Events ───────────────────────────────────────────────────────────────────
function initEvents() {
  // Audio
  qs('#audioBtn').addEventListener('click', async () => {
    await initAudio();
  });

  // Play / Stop
  qs('#playBtn').addEventListener('click', async () => {
    await initAudio();
    if (!playing) startSeq();
  });
  qs('#stopBtn').addEventListener('click', () => stopSeq());

  // BPM
  const bpmSync = (v) => {
    bpm = clamp(v, 60, 200);
    qs('#bpmNum').value    = bpm;
    qs('#bpmSlider').value = bpm;
  };
  qs('#bpmNum').addEventListener('input',   e => bpmSync(parseInt(e.target.value) || 120));
  qs('#bpmSlider').addEventListener('input', e => bpmSync(parseInt(e.target.value)));
  qs('#bpmDown').addEventListener('click', () => bpmSync(bpm - 1));
  qs('#bpmUp').addEventListener('click',   () => bpmSync(bpm + 1));

  // Swing
  qs('#swingSlider').addEventListener('input', e => {
    swing = parseFloat(e.target.value);
    qs('#swingReadout').textContent = `${Math.round(swing * 100)}%`;
  });

  // Master
  qs('#masterSlider').addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    if (masterGain) masterGain.gain.value = v;
    qs('#masterReadout').textContent = `${Math.round(v * 100)}%`;
  });

  // Track header → select
  document.addEventListener('click', e => {
    const hdr = e.target.closest('.track-header');
    if (hdr && !e.target.closest('.mute-btn') && !e.target.closest('.preview-btn')
         && !e.target.closest('.track-vol-wrap')) {
      selectedTrack = hdr.dataset.track;
      updateParamPanel();
    }
  });

  // Mute
  document.addEventListener('click', e => {
    const btn = e.target.closest('.mute-btn');
    if (!btn) return;
    const ts = trackState.find(t => t.id === btn.dataset.track);
    if (ts) {
      ts.mute = !ts.mute;
      qs(`.track[data-id="${ts.id}"]`)?.classList.toggle('muted', ts.mute);
      btn.classList.toggle('muted', ts.mute);
    }
  });

  // Preview (track row)
  document.addEventListener('click', async e => {
    const btn = e.target.closest('.preview-btn');
    if (!btn) return;
    await initAudio();
    previewTrack(btn.dataset.track);
  });

  // Preview (param panel)
  qs('#previewTrackBtn').addEventListener('click', async () => {
    await initAudio();
    previewTrack(selectedTrack);
  });

  // Track volume
  document.addEventListener('input', e => {
    const el = e.target.closest('.track-vol');
    if (!el) return;
    const ts = trackState.find(t => t.id === el.dataset.track);
    if (ts) ts.volume = parseFloat(el.value);
  });

  // Step toggle (click = on/off, shift+click = accent)
  document.addEventListener('click', async e => {
    const btn = e.target.closest('.step-btn');
    if (!btn) return;
    await initAudio();
    const ts  = trackState.find(t => t.id === btn.dataset.track);
    const idx = parseInt(btn.dataset.step);
    if (!ts) return;
    if (e.shiftKey) {
      ts.accents[idx] = !ts.accents[idx];
      btn.classList.toggle('accent', ts.accents[idx]);
      btn.title = `Step ${idx+1}${ts.accents[idx] ? ' (ACCENT)' : ''}`;
    } else {
      ts.steps[idx] = ts.steps[idx] ? 0 : 1;
      btn.classList.toggle('on',     !!ts.steps[idx]);
      btn.classList.toggle('accent', !!ts.accents[idx] && !!ts.steps[idx]);
    }
    // Petit preview si on active
    if (ts.steps[idx] && audioReady) {
      TRIGGER[ts.id]?.(audioCtx, masterGain, ts.params, audioCtx.currentTime + 0.005, ts.volume * 0.7);
    }
  });

  // Right-click = accent
  document.addEventListener('contextmenu', e => {
    const btn = e.target.closest('.step-btn');
    if (!btn) return;
    e.preventDefault();
    const ts  = trackState.find(t => t.id === btn.dataset.track);
    const idx = parseInt(btn.dataset.step);
    if (!ts) return;
    ts.accents[idx] = !ts.accents[idx];
    btn.classList.toggle('accent', !!ts.accents[idx]);
  });

  // Keyboard
  document.addEventListener('keydown', async e => {
    if (['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName)) return;
    if (e.code === 'Space') {
      e.preventDefault();
      await initAudio();
      if (playing) stopSeq(); else startSeq();
    }
    if (e.code === 'KeyP') { await initAudio(); previewTrack(selectedTrack); }
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────
buildTracks();
buildParamRows();
updateParamPanel();
initEvents();
drawEnvCurve();

})();
