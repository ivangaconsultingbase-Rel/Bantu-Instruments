/**
 * DR-4 DRUM MACHINE — v2 FX
 * Moteur Modor DR-2 + chaîne FX globale :
 *   1. TAPE SATURATION  — pre-emphasis + WaveShaper harmoniques + LFO wow/flutter
 *   2. BIT/SR CRUSHER   — quantification bits + décimation sample-rate (ScriptProcessor)
 *   3. SHERMAN FILTERBANK — double filtre 12dB cascadé, résonance self-osc, drive, LFO
 */

(() => {
'use strict';

const qs    = (s, el = document) => el.querySelector(s);
const qsa   = (s, el = document) => Array.from(el.querySelectorAll(s));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp  = (a, b, t) => a + (b - a) * t;
const expFreq = v => 20 * Math.pow(20000 / 20, v);   // 20 Hz → 20 kHz expo

// ─── Track Definitions ────────────────────────────────────────────────────────
const TRACKS = [
  {
    id: 'bd', name: 'BD', fullName: 'BASS DRUM', model: 'Drive BD',
    color: '#ff6b35',
    defaultPattern: [1,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,1,0],
    defaultAccents: [1,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    params: { decay:0.55, curve:0.5, pitch:0.22, amount:0.78, pdec:0.28, pcrv:0.5, x:0.18, y:0.28, z:0.32, t:0.22 },
    paramLabels: { x:'X  DIST GAIN', y:'Y  BPF FREQ', z:'Z  BPF RES', t:'T  DRY/WET' },
    modelDesc: 'Sine + pitch env + distortion path (WaveShaper → BPF → soft clip)'
  },
  {
    id: 'sd', name: 'SD', fullName: 'SNARE DRUM', model: 'Noise Snare',
    color: '#38c4c4',
    defaultPattern: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    defaultAccents: [0,0,0,0, 1,0,0,0, 0,0,0,0, 0,0,0,0],
    params: { decay:0.42, curve:0.5, pitch:0.38, amount:0.32, pdec:0.14, pcrv:0.5, x:0.58, y:0.34, z:0.55, t:0.62 },
    paramLabels: { x:'X  HPF FREQ', y:'Y  HPF RES', z:'Z  SNAP BURST', t:'T  TONE/NOISE' },
    modelDesc: 'Sine tone + filtered noise + snap burst — T = balance tone/bruit'
  },
  {
    id: 'hh', name: 'HH', fullName: 'HI-HAT', model: 'Cymbal Noise',
    color: '#f5d000',
    defaultPattern: [1,0,1,0, 1,0,1,0, 1,0,1,0, 1,0,1,0],
    defaultAccents: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    params: { decay:0.18, curve:0.52, pitch:0.65, amount:0, pdec:0, pcrv:0.5, x:0.72, y:0.38, z:0.32, t:0.08 },
    paramLabels: { x:'X  BPF FREQ', y:'Y  BPF Q', z:'Z  CHAR SPREAD', t:'T  OPEN/CLOSED' },
    modelDesc: '6 oscillateurs carrés inharmoniques — Z = spread ratios, T = ouvert/fermé'
  },
  {
    id: 'cp', name: 'CP', fullName: 'CLAP', model: 'Multi-Burst',
    color: '#b060ff',
    defaultPattern: [0,0,0,0, 1,0,0,0, 0,0,0,0, 1,0,0,0],
    defaultAccents: [0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0],
    params: { decay:0.35, curve:0.52, pitch:0.5, amount:0, pdec:0, pcrv:0.5, x:0.52, y:0.48, z:0.38, t:0.44 },
    paramLabels: { x:'X  BPF FREQ', y:'Y  BPF RES', z:'Z  BURST SPACE', t:'T  TAIL LEN' },
    modelDesc: '3 rafales de bruit + BPF + queue — Z = espacement, T = longueur queue'
  }
];

// ─── DR-2 ENVELOPE ────────────────────────────────────────────────────────────
function dr2CurveArr(curveParam, samples = 256) {
  const arr = new Float32Array(samples);
  const a = 0.14;
  for (let i = 0; i < samples; i++) {
    const x    = i / (samples - 1);
    const lin   = 1 - x;
    const sqlin = (1 - x) * (1 - x);
    const expo  = Math.exp(-5.5 * x);
    const xn    = x * 0.86;
    const sqrcp = Math.pow(a / (xn + a), 2);
    const rcp   = a / (xn + a);
    const c = clamp(curveParam, 0, 1);
    let y;
    if      (c <= 0.25) y = lerp(lin,   sqlin, c / 0.25);
    else if (c <= 0.50) y = lerp(sqlin, expo,  (c - 0.25) / 0.25);
    else if (c <= 0.75) y = lerp(expo,  sqrcp, (c - 0.50) / 0.25);
    else                y = lerp(sqrcp, rcp,   (c - 0.75) / 0.25);
    arr[i] = Math.max(0.00001, Math.min(1, y));
  }
  arr[samples - 1] = 0.00001;
  return arr;
}

function applyDR2Env(param, when, decaySec, curveParam, fromVal, toVal = 0.00001) {
  const curve  = dr2CurveArr(curveParam);
  const scaled = Float32Array.from(curve, v => lerp(toVal, fromVal, v));
  try {
    param.cancelScheduledValues(when - 0.0001);
    param.setValueAtTime(fromVal, when);
    param.setValueCurveAtTime(scaled, when, Math.max(0.005, decaySec));
  } catch (_) {
    param.setValueAtTime(fromVal, when);
    param.exponentialRampToValueAtTime(Math.max(0.00001, toVal), when + decaySec);
  }
}

// ─── Waveshapers ─────────────────────────────────────────────────────────────
function makeHardClip(z) {
  const n = 512, c = new Float32Array(n), k = 2 + z * 120;
  for (let i = 0; i < n; i++) { const x = i * 2 / (n-1) - 1; c[i] = Math.tanh(k * x); }
  return c;
}
function makeSoftClip(z) {
  const n = 512, c = new Float32Array(n), k = 1 + z * 7;
  for (let i = 0; i < n; i++) { const x = i * 2 / (n-1) - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); }
  return c;
}
// Tape harmonic saturation : asymétrique pour simuler le ruban
function makeTapeCurve(drive) {
  const n = 512, c = new Float32Array(n);
  const k = 1 + drive * 22;
  for (let i = 0; i < n; i++) {
    const x = i * 2 / (n - 1) - 1;
    // Légère asymétrie (even harmonics) + tanh
    c[i] = Math.tanh(k * x + 0.08 * Math.sin(k * x * 2.1)) / (1 + 0.08);
  }
  return c;
}
// Bit quantization
function makeBitCurve(bits) {
  const n = 512, c = new Float32Array(n);
  const steps = Math.pow(2, Math.max(1, bits));
  for (let i = 0; i < n; i++) {
    const x = i * 2 / (n - 1) - 1;
    c[i] = Math.round(x * steps) / steps;
  }
  return c;
}
// Sherman pre-drive (très agressif)
function makeShermanDrive(amount) {
  const n = 1024, c = new Float32Array(n);
  const k = 1 + amount * 80;
  for (let i = 0; i < n; i++) {
    const x = i * 2 / (n - 1) - 1;
    // Fold + tanh : le Sherman est BRUTAL
    let y = Math.tanh(k * x);
    if (amount > 0.5) {
      y = y - 0.18 * Math.sin(Math.PI * y);
    }
    c[i] = clamp(y, -1, 1);
  }
  return c;
}
// Sherman post distortion
function makeShermanDist(amount) {
  const n = 512, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i * 2 / (n - 1) - 1;
    c[i] = x < 0
      ? -Math.pow(Math.abs(x), 1 - amount * 0.4)
      :  Math.pow(x, 1 - amount * 0.4);
  }
  return c;
}

// ─── Instrument Models ───────────────────────────────────────────────────────
function triggerBD(ctx, out, p, when, vel) {
  const baseFreq  = 28 + p.pitch * 200;
  const pitchTop  = baseFreq * (1 + p.amount * 16);
  const pitchDec  = 0.012 + p.pdec * 0.38;
  const ampDec    = 0.08  + p.decay * 2.8;
  const bpfFreq   = 40   + p.y * 1100;
  const bpfQ      = 0.4  + p.z * 18;
  const dryWet    = p.t;

  const osc = ctx.createOscillator(); osc.type = 'sine';
  osc.frequency.setValueAtTime(pitchTop, when);
  applyDR2Env(osc.frequency, when, pitchDec, p.pcrv, pitchTop, baseFreq);

  const preGain = ctx.createGain(); preGain.gain.value = 1 + p.x * 5;
  const vca     = ctx.createGain(); vca.gain.setValueAtTime(0.00001, when - 0.001);
  applyDR2Env(vca.gain, when, ampDec, p.curve, vel * 0.92);

  const dryG  = ctx.createGain(); dryG.gain.value = 1 - dryWet;
  const wetG  = ctx.createGain(); wetG.gain.value = dryWet;
  const hardSh= ctx.createWaveShaper(); hardSh.curve = makeHardClip(p.x); hardSh.oversample = '4x';
  const bpf   = ctx.createBiquadFilter(); bpf.type = 'bandpass';
  bpf.frequency.value = bpfFreq; bpf.Q.value = bpfQ;
  const softSh= ctx.createWaveShaper(); softSh.curve = makeSoftClip(0.15 + p.x * 0.4); softSh.oversample = '2x';

  osc.connect(preGain);
  preGain.connect(dryG); dryG.connect(vca);
  preGain.connect(hardSh); hardSh.connect(bpf); bpf.connect(softSh); softSh.connect(wetG); wetG.connect(vca);
  vca.connect(out);
  osc.start(when); osc.stop(when + ampDec + 0.6);
}

function triggerSD(ctx, out, p, when, vel) {
  const toneFreq = 80  + p.pitch * 320;
  const ampDec   = 0.04 + p.decay * 0.9;
  const hpfFreq  = 250  + p.x * 9000;
  const hpfQ     = 0.5  + p.y * 5;
  const snapAmt  = p.z;
  const toneMix  = 1 - p.t;
  const noiseMix = p.t;
  const end      = when + ampDec + 0.15;

  const osc = ctx.createOscillator(); osc.type = 'sine';
  osc.frequency.setValueAtTime(toneFreq * 1.7, when);
  applyDR2Env(osc.frequency, when, 0.018, 0.55, toneFreq * 1.7, toneFreq);
  const tVCA = ctx.createGain(); tVCA.gain.setValueAtTime(0.00001, when - 0.001);
  applyDR2Env(tVCA.gain, when, ampDec * 0.6, p.curve, vel * 0.58 * (toneMix + 0.08));
  osc.connect(tVCA); tVCA.connect(out);
  osc.start(when); osc.stop(end);

  const nBuf  = makeNoiseBuf(ctx, ampDec + 0.2);
  const noise = ctx.createBufferSource(); noise.buffer = nBuf;
  const hpf   = ctx.createBiquadFilter(); hpf.type = 'highpass';
  hpf.frequency.value = hpfFreq; hpf.Q.value = hpfQ;
  const nVCA  = ctx.createGain(); nVCA.gain.setValueAtTime(0.00001, when - 0.001);
  applyDR2Env(nVCA.gain, when, ampDec, p.curve, vel * 0.78 * noiseMix);
  noise.connect(hpf); hpf.connect(nVCA); nVCA.connect(out);
  noise.start(when); noise.stop(end);

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

const CYMBAL_RATIOS = [1.0, 1.3131, 1.4983, 1.6755, 2.0, 2.3741];
function triggerHH(ctx, out, p, when, vel) {
  const baseFreq = 160 + p.pitch * 1800;
  const isOpen   = p.t > 0.5;
  const ampDec   = isOpen ? (0.18 + p.decay * 1.5) : (0.016 + p.decay * 0.14);
  const bpfFreq  = 2000 + p.x * 14000;
  const bpfQ     = 0.5  + p.y * 8;
  const spread   = p.z;

  const mix = ctx.createGain(); mix.gain.value = 1 / CYMBAL_RATIOS.length;
  CYMBAL_RATIOS.forEach((r, i) => {
    const osc = ctx.createOscillator(); osc.type = 'square';
    osc.frequency.value = baseFreq * r * (1 + (i - 2.5) * 0.038 * spread);
    osc.connect(mix); osc.start(when); osc.stop(when + ampDec + 0.06);
  });

  const bpf = ctx.createBiquadFilter(); bpf.type = 'bandpass';
  bpf.frequency.value = bpfFreq; bpf.Q.value = bpfQ;
  const hpf = ctx.createBiquadFilter(); hpf.type = 'highpass';
  hpf.frequency.value = bpfFreq * 0.45;
  const vca = ctx.createGain(); vca.gain.setValueAtTime(0.00001, when - 0.001);
  applyDR2Env(vca.gain, when, ampDec, p.curve, vel * 0.58);
  mix.connect(bpf); bpf.connect(hpf); hpf.connect(vca); vca.connect(out);
}

function triggerCP(ctx, out, p, when, vel) {
  const bpfFreq  = 600  + p.x * 5500;
  const bpfQ     = 0.5  + p.y * 9;
  const spacing  = 0.004 + p.z * 0.026;
  const tailDec  = 0.04  + p.t * 0.55;
  const burstDec = 0.005 + p.decay * 0.016;

  for (let b = 0; b < 3; b++) {
    const t0    = when + b * spacing;
    const dec   = b < 2 ? burstDec : burstDec + tailDec;
    const level = b < 2 ? vel * 0.46 : vel * 0.88;
    const curv  = b < 2 ? 0.45 : p.curve;
    const buf   = makeNoiseBuf(ctx, dec + 0.06);
    const src   = ctx.createBufferSource(); src.buffer = buf;
    const bpf   = ctx.createBiquadFilter(); bpf.type = 'bandpass';
    bpf.frequency.value = bpfFreq; bpf.Q.value = bpfQ;
    const vca   = ctx.createGain(); vca.gain.setValueAtTime(0.00001, t0 - 0.001);
    applyDR2Env(vca.gain, t0, dec, curv, level);
    src.connect(bpf); bpf.connect(vca); vca.connect(out);
    src.start(t0); src.stop(t0 + dec + 0.1);
  }
}

function makeNoiseBuf(ctx, dur) {
  const len = Math.ceil(ctx.sampleRate * (dur + 0.05));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d   = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

const TRIGGER = { bd:triggerBD, sd:triggerSD, hh:triggerHH, cp:triggerCP };

// ─── App State ────────────────────────────────────────────────────────────────
const trackState = TRACKS.map(def => ({
  id: def.id, steps: [...def.defaultPattern], accents: [...def.defaultAccents],
  params: { ...def.params }, mute: false, volume: 0.82
}));

// FX state (mirrors pour le ScriptProcessor partagé)
const fxState = {
  tape:    { drive:0, sat:0, wow:0, flutter:0, tone:0.6, enabled:false },
  bit:     { bits:16, sr:1, mix:1, enabled:false },
  sherman: { freq:0.55, res:0.3, drive:0.1, dist:0, lfoRate:0, lfoDepth:0, mix:1, mode:'lp', enabled:false }
};

// Audio nodes (remplis à l'init)
let audioCtx = null, masterGain = null, audioReady = false;

// FX nodes
const fx = {};

// Sequencer
let playing=false, current=-1, nextTick=0, seqTimer=null, bpm=120, swing=0.08;

// UI
let selectedTrack = 'bd';

// Shared mutable for ScriptProcessor (SR reduction)
let srFactor = 1, srHoldL = 0, srHoldR = 0, srCount = 0;

// ─── FX CHAIN BUILDER ────────────────────────────────────────────────────────
/**
 * Signal chain after masterGain:
 *   masterGain → fxIn → [Tape Sat] → [Bit/SR crush] → [Sherman] → fxOut → destination
 *
 * Each section has a dry/wet bypass.
 */
function buildFxChain() {
  const ctx = audioCtx;

  // ── 1. TAPE SATURATION ─────────────────────────────────────────────────────
  // Pre-emphasis HPF → WaveShaper (harmonics) → de-emphasis LPF
  // + Wow (slow LFO on a chorus-style delay time) + Flutter (fast LFO)
  fx.tape = {};
  const t = fx.tape;

  t.in      = ctx.createGain();
  t.dry     = ctx.createGain(); t.dry.gain.value = 1;
  t.wet     = ctx.createGain(); t.wet.gain.value = 0;

  // pre-emphasis (boost highs before saturation → more bite)
  t.preEmph = ctx.createBiquadFilter();
  t.preEmph.type = 'highshelf'; t.preEmph.frequency.value = 3200; t.preEmph.gain.value = 0;

  t.shaper  = ctx.createWaveShaper(); t.shaper.curve = makeTapeCurve(0); t.shaper.oversample = '4x';

  // de-emphasis LPF
  t.deEmph  = ctx.createBiquadFilter();
  t.deEmph.type = 'lowpass'; t.deEmph.frequency.value = 18000;

  // Tone filter
  t.toneF   = ctx.createBiquadFilter();
  t.toneF.type = 'lowpass'; t.toneF.frequency.value = 18000;

  // Wow = very slow pitch modulation via a chorus delay
  t.wowDelay  = ctx.createDelay(0.08);
  t.wowDelay.delayTime.value = 0.02;
  t.wowLfo    = ctx.createOscillator(); t.wowLfo.type = 'sine'; t.wowLfo.frequency.value = 0.5;
  t.wowGain   = ctx.createGain(); t.wowGain.gain.value = 0;
  t.wowLfo.connect(t.wowGain); t.wowGain.connect(t.wowDelay.delayTime);
  t.wowLfo.start();

  // Flutter = faster (8-15 Hz) modulation
  t.flutterLfo  = ctx.createOscillator(); t.flutterLfo.type = 'triangle'; t.flutterLfo.frequency.value = 12;
  t.flutterGain = ctx.createGain(); t.flutterGain.gain.value = 0;
  t.flutterLfo.connect(t.flutterGain); t.flutterGain.connect(t.wowDelay.delayTime);
  t.flutterLfo.start();

  // Wet path: preEmph → shaper → deEmph → toneF → wowDelay
  t.in.connect(t.preEmph); t.preEmph.connect(t.shaper);
  t.shaper.connect(t.deEmph); t.deEmph.connect(t.toneF); t.toneF.connect(t.wowDelay);
  t.wowDelay.connect(t.wet);

  // Dry path
  t.in.connect(t.dry);

  t.out = ctx.createGain();
  t.dry.connect(t.out); t.wet.connect(t.out);

  // ── 2. BIT / SR CRUSHER ────────────────────────────────────────────────────
  fx.bit = {};
  const b = fx.bit;

  b.in    = ctx.createGain();
  b.dry   = ctx.createGain(); b.dry.gain.value = 0;
  b.wet   = ctx.createGain(); b.wet.gain.value = 0;

  // Bit reduction WaveShaper
  b.bitSh = ctx.createWaveShaper(); b.bitSh.curve = makeBitCurve(16);

  // Sample Rate reduction: ScriptProcessor (deprecated but universal)
  // blockSize 256 pour la latence minimale
  try {
    b.srProc = ctx.createScriptProcessor(256, 1, 1);
    b.srProc.onaudioprocess = e => {
      const inp = e.inputBuffer.getChannelData(0);
      const out = e.outputBuffer.getChannelData(0);
      for (let i = 0; i < inp.length; i++) {
        if (srCount % srFactor === 0) srHoldL = inp[i];
        out[i] = srHoldL;
        srCount++;
      }
    };
  } catch(_) {
    b.srProc = ctx.createGain(); // fallback passthrough
  }

  // Pre-AA LPF before SR reduction (simule anti-aliasing)
  b.aaLpf = ctx.createBiquadFilter(); b.aaLpf.type = 'lowpass'; b.aaLpf.frequency.value = 20000;

  // Post LPF to smooth out quantization a bit
  b.postLpf = ctx.createBiquadFilter(); b.postLpf.type = 'lowpass'; b.postLpf.frequency.value = 20000;

  // Wet path: bitSh → aaLpf → srProc → postLpf → wet
  b.in.connect(b.bitSh); b.bitSh.connect(b.aaLpf);
  b.aaLpf.connect(b.srProc); b.srProc.connect(b.postLpf); b.postLpf.connect(b.wet);
  // Dry path
  b.in.connect(b.dry);

  b.out = ctx.createGain();
  b.dry.connect(b.out); b.wet.connect(b.out);

  // ── 3. SHERMAN FILTERBANK ──────────────────────────────────────────────────
  /**
   * Signal chain:
   *   preDrive (WaveShaper) → filter1 → filter2 → postDist (WaveShaper)
   *   Both filters cascaded at same freq, same Q → 24dB slope
   *   Mode: LP / HP / BP / Notch
   *   LFO → filter frequency (en cents pour une modulation musicale)
   */
  fx.sh = {};
  const s = fx.sh;

  s.in    = ctx.createGain();
  s.dry   = ctx.createGain(); s.dry.gain.value = 0;
  s.wet   = ctx.createGain(); s.wet.gain.value = 0;

  // Pre-drive shaper (très agressif possible)
  s.preDriveGain = ctx.createGain(); s.preDriveGain.gain.value = 1;
  s.preSh  = ctx.createWaveShaper(); s.preSh.curve  = makeShermanDrive(0.1); s.preSh.oversample = '4x';

  // Two cascaded filters (24dB total)
  s.filt1 = ctx.createBiquadFilter(); s.filt1.type = 'lowpass';
  s.filt2 = ctx.createBiquadFilter(); s.filt2.type = 'lowpass';
  const baseHz = expFreq(fxState.sherman.freq);
  s.filt1.frequency.value = baseHz; s.filt1.Q.value = 1;
  s.filt2.frequency.value = baseHz; s.filt2.Q.value = 1;

  // Post shaper
  s.postSh = ctx.createWaveShaper(); s.postSh.curve = makeShermanDist(0); s.postSh.oversample = '2x';

  // LFO → filter frequency modulation (via AudioParam)
  s.lfo      = ctx.createOscillator(); s.lfo.type = 'sine'; s.lfo.frequency.value = 0.1;
  s.lfoGain  = ctx.createGain(); s.lfoGain.gain.value = 0;
  // Connect LFO to both filters' detune (cents — much smoother than direct frequency)
  s.lfo.connect(s.lfoGain);
  s.lfoGain.connect(s.filt1.detune);
  s.lfoGain.connect(s.filt2.detune);
  s.lfo.start();

  // Analyser pour le scope (self-oscillation visu)
  s.analyser = ctx.createAnalyser();
  s.analyser.fftSize = 256;
  s.analyser.smoothingTimeConstant = 0.6;

  // Wet path
  s.in.connect(s.preDriveGain); s.preDriveGain.connect(s.preSh);
  s.preSh.connect(s.filt1); s.filt1.connect(s.filt2);
  s.filt2.connect(s.postSh); s.postSh.connect(s.analyser); s.analyser.connect(s.wet);
  // Dry path
  s.in.connect(s.dry);

  s.out = ctx.createGain();
  s.dry.connect(s.out); s.wet.connect(s.out);

  // ── Connect the chain ──────────────────────────────────────────────────────
  // masterGain → tape.in → bit.in → sh.in → ctx.destination
  masterGain.disconnect();
  masterGain.connect(t.in);
  t.out.connect(b.in);
  b.out.connect(s.in);
  s.out.connect(ctx.destination);

  // Start bypassed: all wet=0, all dry=1
  applyAllFxState();
}

// ─── FX STATE APPLIERS ────────────────────────────────────────────────────────
function applyAllFxState() {
  applyTape(); applyBit(); applySherman();
}

function applyTape() {
  const p = fxState.tape, t = fx.tape;
  if (!t) return;
  const on = p.enabled;
  t.dry.gain.setTargetAtTime(on ? 0 : 1, audioCtx.currentTime, 0.03);
  t.wet.gain.setTargetAtTime(on ? 1 : 0, audioCtx.currentTime, 0.03);
  if (on) {
    // Pre-emphasis gain
    t.preEmph.gain.setTargetAtTime(-3 + p.drive * 10, audioCtx.currentTime, 0.05);
    // Shaper
    t.shaper.curve = makeTapeCurve(p.drive * 0.6 + p.sat * 0.4);
    // De-emphasis tone
    const toneHz = 800 + p.tone * 18000;
    t.toneF.frequency.setTargetAtTime(toneHz, audioCtx.currentTime, 0.05);
    // Wow
    t.wowLfo.frequency.setTargetAtTime(0.3 + p.wow * 1.5, audioCtx.currentTime, 0.1);
    t.wowGain.gain.setTargetAtTime(p.wow * 0.012, audioCtx.currentTime, 0.05);
    // Flutter
    t.flutterLfo.frequency.setTargetAtTime(8 + p.flutter * 8, audioCtx.currentTime, 0.1);
    t.flutterGain.gain.setTargetAtTime(p.flutter * 0.003, audioCtx.currentTime, 0.05);
  }
  updateLedUI('tape', on);
}

function applyBit() {
  const p = fxState.bit, b = fx.bit;
  if (!b) return;
  const on = p.enabled;
  b.dry.gain.setTargetAtTime(on ? 1 - p.mix : 1, audioCtx.currentTime, 0.03);
  b.wet.gain.setTargetAtTime(on ? p.mix     : 0, audioCtx.currentTime, 0.03);
  if (on) {
    b.bitSh.curve = makeBitCurve(p.bits);
    // Sample rate: update shared mutable (OK for ScriptProcessor)
    srFactor = Math.max(1, Math.round(p.sr));
    // AA LPF: Nyquist of reduced rate = sampleRate / (2 * srFactor)
    const nyq = (audioCtx.sampleRate / 2) / srFactor;
    b.aaLpf.frequency.setTargetAtTime(Math.min(nyq, 20000), audioCtx.currentTime, 0.02);
    b.postLpf.frequency.setTargetAtTime(Math.min(nyq * 1.5, 20000), audioCtx.currentTime, 0.02);
  } else {
    srFactor = 1;
  }
  updateLedUI('bit', on);
}

function applySherman() {
  const p = fxState.sherman, s = fx.sh;
  if (!s) return;
  const on = p.enabled;
  s.dry.gain.setTargetAtTime(on ? 1 - p.mix : 1, audioCtx.currentTime, 0.03);
  s.wet.gain.setTargetAtTime(on ? p.mix     : 0, audioCtx.currentTime, 0.03);
  if (on) {
    const freq = expFreq(p.freq);
    // Q mapping: 0 → Q=0.5, 1 → Q=40+ (self-oscillation starts ~Q=25 on most biquads)
    const q = 0.5 + Math.pow(p.res, 2) * 55;
    s.filt1.frequency.setTargetAtTime(freq, audioCtx.currentTime, 0.01);
    s.filt2.frequency.setTargetAtTime(freq, audioCtx.currentTime, 0.01);
    s.filt1.Q.setTargetAtTime(q, audioCtx.currentTime, 0.01);
    s.filt2.Q.setTargetAtTime(q, audioCtx.currentTime, 0.01);

    // Mode: change filter types
    const mode = p.mode;
    s.filt1.type = mode === 'notch' ? 'lowpass'  : mode;
    s.filt2.type = mode === 'notch' ? 'highpass' : mode;
    if (mode === 'bp') { s.filt1.type = 'bandpass'; s.filt2.type = 'bandpass'; }

    // Pre-drive
    s.preSh.curve = makeShermanDrive(p.drive);
    s.preDriveGain.gain.setTargetAtTime(1 + p.drive * 4, audioCtx.currentTime, 0.02);

    // Post dist
    s.postSh.curve = makeShermanDist(p.dist);

    // LFO: depth en cents (± 1200 cents = ± 1 octave)
    const lfoHz = p.lfoRate < 0.02 ? 0.001 : 0.05 + p.lfoRate * 14;
    s.lfo.frequency.setTargetAtTime(lfoHz, audioCtx.currentTime, 0.1);
    s.lfoGain.gain.setTargetAtTime(p.lfoDepth * 1800, audioCtx.currentTime, 0.05);
  }
  updateLedUI('sherman', on);
}

function updateLedUI(fxId, on) {
  const ledMap = { tape:'tapeLed', bit:'bitLed', sherman:'shermanLed' };
  const led = qs(`#${ledMap[fxId]}`);
  if (led) led.classList.toggle('active', on);
  const unitMap = { tape:'fxTapeUnit', bit:'fxBitUnit', sherman:'fxShermanUnit' };
  const unit = qs(`#${unitMap[fxId]}`);
  if (unit) unit.classList.toggle('fx-active', on);
}

// ─── Audio Init ───────────────────────────────────────────────────────────────
async function initAudio() {
  if (audioReady) { if (audioCtx.state === 'suspended') await audioCtx.resume(); return; }
  audioCtx   = new (window.AudioContext || window.webkitAudioContext)();
  masterGain = audioCtx.createGain(); masterGain.gain.value = 0.82;
  masterGain.connect(audioCtx.destination); // temporary, overwritten by buildFxChain
  buildFxChain();
  audioReady = true;
  qs('#audioBtn').classList.add('active');
  qs('#audioBtn').innerHTML = '<span class="audio-dot"></span>AUDIO ON';
  startScopeLoop();
}

// ─── Sequencer ────────────────────────────────────────────────────────────────
function startSeq() {
  if (!audioReady) return;
  playing = true; current = -1; nextTick = audioCtx.currentTime + 0.04;
  clearInterval(seqTimer);
  seqTimer = setInterval(scheduler, 22);
  qs('#playBtn').classList.add('active');
}
function stopSeq() {
  playing = false; clearInterval(seqTimer); seqTimer = null; current = -1;
  qs('#playBtn').classList.remove('active'); renderPlayhead();
}
function scheduler() {
  const lA = 0.14, sd = 60 / bpm / 4;
  while (nextTick < audioCtx.currentTime + lA) {
    current = (current + 1) % 16;
    scheduleStep(current, nextTick);
    nextTick += sd + (current % 2 === 1 ? sd * swing : 0);
  }
  renderPlayhead();
}
function scheduleStep(idx, when) {
  trackState.forEach(ts => {
    if (ts.mute || !ts.steps[idx]) return;
    const vel = ts.accents[idx] ? Math.min(1, ts.volume * 1.28) : ts.volume;
    TRIGGER[ts.id]?.(audioCtx, masterGain, ts.params, when, vel);
  });
}
function previewTrack(id) {
  if (!audioReady) return;
  const ts = trackState.find(t => t.id === id); if (!ts) return;
  TRIGGER[id]?.(audioCtx, masterGain, ts.params, audioCtx.currentTime + 0.01, ts.volume);
}

// ─── Sherman Scope ────────────────────────────────────────────────────────────
let scopeRaf = null;
function startScopeLoop() {
  const canvas = qs('#shermanScope'); if (!canvas) return;
  const c = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const buf = new Uint8Array(fx.sh.analyser.fftSize);

  function draw() {
    scopeRaf = requestAnimationFrame(draw);
    fx.sh.analyser.getByteTimeDomainData(buf);
    c.clearRect(0, 0, W, H);

    // Detect self-oscillation: check if signal is periodic and above threshold
    let maxAmp = 0;
    for (let i = 0; i < buf.length; i++) maxAmp = Math.max(maxAmp, Math.abs(buf[i] - 128));
    const selfOsc = maxAmp > 80;
    const scopeDot = qs('#scopeDot'), scopeLabel = qs('#scopeLabel');
    if (scopeDot) { scopeDot.classList.toggle('osc', selfOsc); }
    if (scopeLabel) { scopeLabel.textContent = selfOsc ? 'SELF-OSC !' : (fxState.sherman.enabled ? 'ACTIVE' : 'IDLE'); }

    // Draw waveform
    c.strokeStyle = selfOsc ? '#ff4444' : '#00e87a';
    c.shadowColor = selfOsc ? '#ff0000' : '#00e87a';
    c.shadowBlur  = selfOsc ? 8 : 3;
    c.lineWidth   = 1.5;
    c.beginPath();
    for (let i = 0; i < buf.length; i++) {
      const x = (i / buf.length) * W;
      const y = H / 2 + ((buf[i] - 128) / 128) * (H / 2 - 2);
      i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
    }
    c.stroke();
    c.shadowBlur = 0;
  }
  draw();
}

// BitScope — simple VU-style display of bit depth
function drawBitScope(bits) {
  const canvas = qs('#bitScope'); if (!canvas) return;
  const c = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  c.clearRect(0, 0, W, H);
  const steps = Math.pow(2, Math.max(1, bits));
  const bw = W / steps;
  c.fillStyle = '#00e87a';
  for (let i = 0; i < steps; i++) {
    const h = Math.random() * (H - 2) + 2;
    c.fillRect(i * bw + 0.5, H - h, Math.max(1, bw - 1), h);
    c.globalAlpha = 0.3;
    c.fillRect(i * bw + 0.5, H - h, Math.max(1, bw - 1), h);
    c.globalAlpha = 1;
  }
}

// ─── BUILD UI ─────────────────────────────────────────────────────────────────
function buildTracks() {
  qs('#tracksSection').innerHTML = TRACKS.map(def => {
    const ts = trackState.find(t => t.id === def.id);
    return `
    <div class="track" data-id="${def.id}">
      <div class="track-header" data-track="${def.id}">
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
            data-track="${def.id}" data-step="${i}">
            <span class="step-num">${i+1}</span>
          </button>`).join('')}
      </div>
    </div>`;
  }).join('');
}

// ─── PARAM PANEL ─────────────────────────────────────────────────────────────
const PARAM_DEFS = [
  {id:'decay', label:'DECAY'}, {id:'curve', label:'CURVE'},
  {id:'pitch', label:'PITCH'}, {id:'amount',label:'AMT'},
  {id:'pdec',  label:'P.DEC'}, {id:'pcrv',  label:'P.CRV'},
  {id:'x',     label:'X'},     {id:'y',     label:'Y'},
  {id:'z',     label:'Z'},     {id:'t',     label:'T'},
];
function buildParamRows() {
  PARAM_DEFS.forEach(({ id, label }) => {
    const row = qs(`#paramRow_${id}`); if (!row) return;
    row.innerHTML = `
      <div class="prow-inner">
        <label class="prow-label" id="plabel_${id}">${label}</label>
        <input type="range" class="hw-slider prow-slider" id="pslider_${id}"
          data-param="${id}" min="0" max="1" step="0.01" value="0.5">
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
  const badge = qs('#paramsTrackBadge');
  badge.textContent = def.name; badge.style.color = def.color; badge.style.borderColor = def.color;
  qs('#paramsTrackName').textContent = def.fullName;
  qs('#paramsModel').textContent = `${def.model} — ${def.modelDesc}`;
  ['x','y','z','t'].forEach(k => {
    const el = qs(`#plabel_${k}`);
    if (el && def.paramLabels[k]) el.textContent = def.paramLabels[k];
  });
  PARAM_DEFS.forEach(({ id }) => {
    const sl = qs(`#pslider_${id}`), rd = qs(`#preadout_${id}`);
    if (sl && id in ts.params) { sl.value = ts.params[id]; rd.textContent = formatParam(id, ts.params[id], selectedTrack); }
  });
  qsa('.track').forEach(el => el.classList.toggle('selected', el.dataset.id === selectedTrack));
  drawEnvCurve();
}
function formatParam(p, v, tid) {
  if (p==='pitch')  return `${Math.round(28 + v * 200)} Hz`;
  if (p==='decay')  return `${(0.08 + v * 2.8).toFixed(2)}s`;
  if (p==='pdec')   return `${Math.round((0.012 + v * 0.38) * 1000)}ms`;
  if (p==='amount') return `${Math.round(v * 100)}%`;
  if (p==='curve'||p==='pcrv') return ['LIN','SQL','EXP','SQR','RCP'][clamp(Math.round(v*4),0,4)];
  if (p==='t'&&tid==='hh') return v > 0.5 ? 'OPEN' : 'CLOSED';
  return `${Math.round(v*100)}%`;
}
function drawEnvCurve() {
  const canvas = qs('#envCanvas'); if (!canvas) return;
  const c = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
  const ts = trackState.find(t => t.id === selectedTrack);
  const curv = ts?.params.curve ?? 0.5, pcrv = ts?.params.pcrv ?? 0.5;
  c.clearRect(0, 0, W, H);
  c.strokeStyle = 'rgba(255,124,0,.08)'; c.lineWidth = 1;
  for (let x = 0; x <= W; x += W/4) { c.beginPath(); c.moveTo(x,0); c.lineTo(x,H); c.stroke(); }
  function drawC(cp, col, glow) {
    const arr = dr2CurveArr(cp, W);
    c.save(); c.strokeStyle = col; c.lineWidth = glow ? 2.5 : 1.5;
    c.shadowColor = col; c.shadowBlur = glow ? 6 : 0;
    c.beginPath();
    for (let i = 0; i < W; i++) {
      const y = H - 4 - arr[i] * (H - 8);
      i === 0 ? c.moveTo(i, y) : c.lineTo(i, y);
    }
    c.stroke(); c.restore();
  }
  if (ts?.params.amount > 0.05) drawC(pcrv, 'rgba(100,200,255,.35)', false);
  drawC(curv, '#ff8c00', true);
  c.fillStyle = 'rgba(255,124,0,.55)'; c.font = '8px Share Tech Mono, monospace';
  c.fillText('AMP', 3, 10);
  if (ts?.params.amount > 0.05) { c.fillStyle = 'rgba(100,200,255,.55)'; c.fillText('PTCH', 3, 20); }
}
function renderPlayhead() {
  qsa('.step-btn').forEach(btn => btn.classList.toggle('playing', playing && current === parseInt(btn.dataset.step)));
}

// ─── FX readouts ─────────────────────────────────────────────────────────────
function fxReadout(id, val) {
  const el = qs(`#${id}`); if (el) el.textContent = val;
}
function updateTapeReadouts() {
  const p = fxState.tape;
  fxReadout('tapeDriveOut',   `${Math.round(p.drive   * 100)}%`);
  fxReadout('tapeSatOut',     `${Math.round(p.sat     * 100)}%`);
  fxReadout('tapeWowOut',     `${Math.round(p.wow     * 100)}%`);
  fxReadout('tapeFlutterOut', `${Math.round(p.flutter * 100)}%`);
  fxReadout('tapeToneOut',    p.tone < 0.1 ? 'DARK' : p.tone > 0.9 ? 'BRIGHT' : `${Math.round(p.tone * 100)}%`);
}
function updateBitReadouts() {
  const p = fxState.bit;
  fxReadout('bitDepthOut', `${parseFloat(p.bits).toFixed(1)} bit`);
  fxReadout('srAmountOut', p.sr <= 1 ? 'FULL' : `÷ ${Math.round(p.sr)}`);
  fxReadout('bitMixOut',   `${Math.round(p.mix * 100)}%`);
  drawBitScope(p.bits);
}
function updateShermanReadouts() {
  const p = fxState.sherman;
  const hz = expFreq(p.freq);
  fxReadout('shermanFreqOut',    hz < 1000 ? `${Math.round(hz)} Hz` : `${(hz/1000).toFixed(2)} kHz`);
  fxReadout('shermanResOut',     p.res > 0.88 ? 'SELF-OSC!' : `${Math.round(p.res * 100)}%`);
  fxReadout('shermanDriveOut',   `${Math.round(p.drive * 100)}%`);
  fxReadout('shermanDistOut',    `${Math.round(p.dist  * 100)}%`);
  fxReadout('shermanLfoRateOut', p.lfoRate < 0.02 ? 'OFF' : `${(0.05 + p.lfoRate * 14).toFixed(2)} Hz`);
  fxReadout('shermanLfoDepthOut',`${Math.round(p.lfoDepth * 100)}%`);
  fxReadout('shermanMixOut',     `${Math.round(p.mix     * 100)}%`);
}

// ─── EVENTS ────────────────────────────────────────────────────────────────────
function initEvents() {
  qs('#audioBtn').addEventListener('click', async () => { await initAudio(); });
  qs('#playBtn').addEventListener('click',  async () => { await initAudio(); if (!playing) startSeq(); });
  qs('#stopBtn').addEventListener('click',  () => stopSeq());

  const bpmSync = v => { bpm = clamp(v,60,200); qs('#bpmNum').value = bpm; qs('#bpmSlider').value = bpm; };
  qs('#bpmNum').addEventListener('input',    e => bpmSync(parseInt(e.target.value)||120));
  qs('#bpmSlider').addEventListener('input', e => bpmSync(parseInt(e.target.value)));
  qs('#bpmDown').addEventListener('click',   () => bpmSync(bpm - 1));
  qs('#bpmUp').addEventListener('click',     () => bpmSync(bpm + 1));

  qs('#swingSlider').addEventListener('input', e => {
    swing = parseFloat(e.target.value);
    qs('#swingReadout').textContent = `${Math.round(swing * 100)}%`;
  });
  qs('#masterSlider').addEventListener('input', e => {
    const v = parseFloat(e.target.value);
    if (masterGain) masterGain.gain.value = v;
    qs('#masterReadout').textContent = `${Math.round(v * 100)}%`;
  });

  // Track select
  document.addEventListener('click', e => {
    const hdr = e.target.closest('.track-header');
    if (hdr && !e.target.closest('.mute-btn,.preview-btn,.track-vol-wrap')) {
      selectedTrack = hdr.dataset.track; updateParamPanel();
    }
  });

  // Mute
  document.addEventListener('click', e => {
    const btn = e.target.closest('.mute-btn'); if (!btn) return;
    const ts = trackState.find(t => t.id === btn.dataset.track); if (!ts) return;
    ts.mute = !ts.mute;
    qs(`.track[data-id="${ts.id}"]`)?.classList.toggle('muted', ts.mute);
  });

  // Preview
  document.addEventListener('click', async e => {
    const btn = e.target.closest('.preview-btn'); if (!btn) return;
    await initAudio(); previewTrack(btn.dataset.track);
  });
  qs('#previewTrackBtn').addEventListener('click', async () => { await initAudio(); previewTrack(selectedTrack); });

  // Volume
  document.addEventListener('input', e => {
    const el = e.target.closest('.track-vol'); if (!el) return;
    const ts = trackState.find(t => t.id === el.dataset.track); if (ts) ts.volume = parseFloat(el.value);
  });

  // Steps
  document.addEventListener('click', async e => {
    const btn = e.target.closest('.step-btn'); if (!btn) return;
    await initAudio();
    const ts = trackState.find(t => t.id === btn.dataset.track);
    const idx = parseInt(btn.dataset.step); if (!ts) return;
    if (e.shiftKey) {
      ts.accents[idx] = !ts.accents[idx];
      btn.classList.toggle('accent', ts.accents[idx]);
    } else {
      ts.steps[idx] = ts.steps[idx] ? 0 : 1;
      btn.classList.toggle('on', !!ts.steps[idx]);
      btn.classList.toggle('accent', !!ts.accents[idx] && !!ts.steps[idx]);
    }
    if (ts.steps[idx] && audioReady)
      TRIGGER[ts.id]?.(audioCtx, masterGain, ts.params, audioCtx.currentTime + 0.005, ts.volume * 0.7);
  });
  document.addEventListener('contextmenu', e => {
    const btn = e.target.closest('.step-btn'); if (!btn) return; e.preventDefault();
    const ts = trackState.find(t => t.id === btn.dataset.track);
    const idx = parseInt(btn.dataset.step); if (!ts) return;
    ts.accents[idx] = !ts.accents[idx]; btn.classList.toggle('accent', !!ts.accents[idx]);
  });

  // Keyboard
  document.addEventListener('keydown', async e => {
    if (['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName)) return;
    if (e.code === 'Space') { e.preventDefault(); await initAudio(); playing ? stopSeq() : startSeq(); }
    if (e.code === 'KeyP')  { await initAudio(); previewTrack(selectedTrack); }
  });

  // ── FX bypass buttons ───────────────────────────────────────────────────────
  qs('#tapeBypass').addEventListener('click', async () => {
    await initAudio();
    fxState.tape.enabled = !fxState.tape.enabled;
    applyTape();
  });
  qs('#bitBypass').addEventListener('click', async () => {
    await initAudio();
    fxState.bit.enabled = !fxState.bit.enabled;
    applyBit();
  });
  qs('#shermanBypass').addEventListener('click', async () => {
    await initAudio();
    fxState.sherman.enabled = !fxState.sherman.enabled;
    applySherman();
  });

  // ── TAPE sliders ─────────────────────────────────────────────────────────────
  const tapeSliders = [
    ['tapeDrive',   v => fxState.tape.drive   = v],
    ['tapeSat',     v => fxState.tape.sat     = v],
    ['tapeWow',     v => fxState.tape.wow     = v],
    ['tapeFlutter', v => fxState.tape.flutter = v],
    ['tapeTone',    v => fxState.tape.tone    = v],
  ];
  tapeSliders.forEach(([id, setter]) => {
    qs(`#${id}`).addEventListener('input', async e => {
      await initAudio(); setter(parseFloat(e.target.value)); applyTape(); updateTapeReadouts();
    });
  });

  // ── BIT sliders ───────────────────────────────────────────────────────────────
  qs('#bitDepth').addEventListener('input', async e => {
    await initAudio(); fxState.bit.bits = parseFloat(e.target.value); applyBit(); updateBitReadouts();
  });
  qs('#srAmount').addEventListener('input', async e => {
    await initAudio(); fxState.bit.sr = parseFloat(e.target.value); applyBit(); updateBitReadouts();
  });
  qs('#bitMix').addEventListener('input', async e => {
    await initAudio(); fxState.bit.mix = parseFloat(e.target.value); applyBit(); updateBitReadouts();
  });

  // ── SHERMAN sliders ───────────────────────────────────────────────────────────
  const shSliders = [
    ['shermanFreq',     v => fxState.sherman.freq     = v],
    ['shermanRes',      v => fxState.sherman.res      = v],
    ['shermanDrive',    v => fxState.sherman.drive    = v],
    ['shermanDist',     v => fxState.sherman.dist     = v],
    ['shermanLfoRate',  v => fxState.sherman.lfoRate  = v],
    ['shermanLfoDepth', v => fxState.sherman.lfoDepth = v],
    ['shermanMix',      v => fxState.sherman.mix      = v],
  ];
  shSliders.forEach(([id, setter]) => {
    qs(`#${id}`).addEventListener('input', async e => {
      await initAudio(); setter(parseFloat(e.target.value)); applySherman(); updateShermanReadouts();
    });
  });

  // Sherman mode buttons
  qsa('.mode-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await initAudio();
      fxState.sherman.mode = btn.dataset.mode;
      qsa('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applySherman();
    });
  });
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
buildTracks();
buildParamRows();
updateParamPanel();
updateTapeReadouts();
updateBitReadouts();
updateShermanReadouts();
initEvents();
drawEnvCurve();

})();
