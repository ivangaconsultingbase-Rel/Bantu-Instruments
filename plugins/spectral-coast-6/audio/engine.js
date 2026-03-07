const MODEL_TABLES = {
  wood:  [1.00, 0.72, 0.36, 0.20, 0.12, 0.08, 0.06, 0.04],
  bell:  [1.00, 0.22, 0.62, 0.13, 0.34, 0.09, 0.22, 0.05],
  reed:  [1.00, 0.62, 0.28, 0.24, 0.16, 0.11, 0.06, 0.03],
  voice: [1.00, 0.18, 0.44, 0.56, 0.26, 0.12, 0.08, 0.04],
  choir: [1.00, 0.16, 0.36, 0.52, 0.32, 0.18, 0.10, 0.06],
  glass: [1.00, 0.08, 0.42, 0.18, 0.28, 0.08, 0.16, 0.05],
  metal: [1.00, 0.14, 0.48, 0.10, 0.30, 0.14, 0.20, 0.06],
  organ: [1.00, 0.84, 0.66, 0.56, 0.42, 0.28, 0.18, 0.10],
};

const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
const lerp = (a, b, t) => a + (b - a) * t;
const midiToHz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
const expMap = (v, min, max) => min * Math.pow(max / min, clamp(v));

function makeWavefolderCurve(amount = 0.2) {
  const curve = new Float32Array(2048);
  const folds = 1 + amount * 5;
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.sin(x * Math.PI * folds) / (1 + amount * 2.4);
  }
  return curve;
}

function createImpulse(ctx, seconds = 2.2, decay = 2.6) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
    }
  }
  return impulse;
}

class Voice {
  constructor(ctx, destination) {
    this.ctx = ctx;
    this.destination = destination;
    this.output = ctx.createGain();
    this.output.gain.value = 1;

    this.preGain = ctx.createGain();
    this.preGain.gain.value = 0.55;
    this.folder = ctx.createWaveShaper();
    this.folder.curve = makeWavefolderCurve(0.2);
    this.folder.oversample = '2x';

    this.blurLP = ctx.createBiquadFilter();
    this.blurLP.type = 'lowpass';
    this.blurLP.frequency.value = 12000;
    this.warpHP = ctx.createBiquadFilter();
    this.warpHP.type = 'highpass';
    this.warpHP.frequency.value = 20;

    this.vca = ctx.createGain();
    this.vca.gain.value = 0.0001;

    this.filterStages = Array.from({ length: 4 }, () => {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      return f;
    });

    this.preGain.connect(this.folder);
    this.folder.connect(this.blurLP);
    this.blurLP.connect(this.warpHP);
    this.warpHP.connect(this.vca);
    this.vca.connect(this.filterStages[0]);
    this.filterStages[0].connect(this.filterStages[1]);
    this.filterStages[1].connect(this.filterStages[2]);
    this.filterStages[2].connect(this.filterStages[3]);
    this.filterStages[3].connect(this.output);
    this.output.connect(destination);

    this.partials = [];
    this.note = null;
    this.active = false;
    this.startTime = 0;
    this.releaseTimer = null;
  }

  stopImmediately() {
    if (this.releaseTimer) clearTimeout(this.releaseTimer);
    for (const partial of this.partials) {
      try { partial.osc.stop(); } catch {}
      try { partial.osc.disconnect(); partial.gain.disconnect(); } catch {}
    }
    this.partials = [];
    this.note = null;
    this.active = false;
    this.vca.gain.cancelScheduledValues(this.ctx.currentTime);
    this.vca.gain.value = 0.0001;
  }

  updateFromPatch(patch, velocity = 1) {
    const now = this.ctx.currentTime;
    const model = MODEL_TABLES[patch.model] || MODEL_TABLES.wood;
    const complexity = patch.macroComplexity || 0;
    const organic = patch.macroOrganic || 0;
    const focus = patch.macroFocus || 0;

    const fold = clamp(patch.fold + complexity * 0.18);
    this.folder.curve = makeWavefolderCurve(fold);
    this.preGain.gain.setTargetAtTime(lerp(0.55, 3.0, fold), now, 0.02);

    const blurFreq = expMap(clamp(1 - (patch.blur * (1 - focus * 0.55))), 900, 16000);
    const warpFreq = expMap(clamp(patch.warp * 0.75), 20, 2400);
    this.blurLP.frequency.setTargetAtTime(blurFreq, now, 0.03);
    this.warpHP.frequency.setTargetAtTime(warpFreq, now, 0.03);
    this.blurLP.Q.setTargetAtTime(0.5 + patch.freeze * 3, now, 0.04);

    const cutoffNorm = clamp(patch.cutoff * 0.78 + patch.envAmt * 0.18 * velocity + focus * 0.08);
    const cutoffHz = expMap(cutoffNorm, 90, 15000);
    const q = 0.4 + patch.resonance * 4.6;
    for (const stage of this.filterStages) {
      stage.frequency.setTargetAtTime(cutoffHz, now, 0.025);
      stage.Q.setTargetAtTime(q, now, 0.03);
    }

    if (!this.partials.length) return;

    const harmonics = clamp(patch.harmonics + complexity * 0.2);
    const activeCount = 2 + Math.floor(harmonics * 6);
    const tilt = lerp(1.4, -0.85, patch.tilt);
    const inharm = patch.inharmonic * (0.07 + patch.index * 0.22 + complexity * 0.1);
    const drift = patch.drift * 0.03 + organic * 0.01;
    const morph = clamp(patch.morph + complexity * 0.08);

    this.partials.forEach((partial, idx) => {
      const n = idx + 1;
      const baseAmp = idx < activeCount ? Math.pow(n, tilt) : 0;
      const normBaseAmp = Math.max(0, baseAmp);
      const modelAmp = model[idx] ?? 0.02;
      const amp = lerp(normBaseAmp, modelAmp, morph) / (1 + idx * 0.08);
      partial.gain.gain.setTargetAtTime(amp * partial.velocityGain, now, 0.02);

      const freqMul = n + inharm * (idx * 0.65);
      const detuneCents = (Math.random() * 2 - 1) * drift * 120 + (idx % 2 ? 1 : -1) * patch.index * 3;
      partial.osc.frequency.setTargetAtTime(this.baseFreq * freqMul, now, 0.03);
      partial.osc.detune.setTargetAtTime(detuneCents, now, 0.05);
    });
  }

  start(midi, velocity, patch) {
    this.stopImmediately();
    const now = this.ctx.currentTime;
    this.note = midi;
    this.active = true;
    this.startTime = now;
    this.baseFreq = midiToHz(midi);

    const velocityDepth = patch.velocityDepth ?? 0.7;
    const velGain = lerp(1, velocity, velocityDepth);

    const partialCount = 8;
    for (let i = 0; i < partialCount; i++) {
      const osc = this.ctx.createOscillator();
      osc.type = i === 0 ? 'sine' : 'triangle';
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(this.preGain);
      osc.start(now);
      this.partials.push({ osc, gain, velocityGain: velGain / Math.sqrt(i + 1) });
    }

    this.updateFromPatch(patch, velocity);
    const attack = patch.attack ?? 0.015;
    const ampPeak = 0.17 + velGain * 0.18;
    this.vca.gain.cancelScheduledValues(now);
    this.vca.gain.setValueAtTime(0.0001, now);
    this.vca.gain.linearRampToValueAtTime(ampPeak, now + attack + patch.freeze * 0.05);
  }

  release(patch) {
    if (!this.active) return;
    const now = this.ctx.currentTime;
    const release = (patch.release ?? 1.2) + (patch.freeze ?? 0) * 2.5;
    this.vca.gain.cancelScheduledValues(now);
    this.vca.gain.setTargetAtTime(0.0001, now, Math.max(0.02, release * 0.35));
    if (this.releaseTimer) clearTimeout(this.releaseTimer);
    this.releaseTimer = setTimeout(() => this.stopImmediately(), (release + 0.2) * 1000);
  }
}

class GranularBus {
  constructor(ctx) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.output.gain.value = 1;
    this.sendGain = ctx.createGain();
    this.sendGain.gain.value = 0.15;

    this.delayA = ctx.createDelay(0.5);
    this.delayB = ctx.createDelay(0.5);
    this.delayA.delayTime.value = 0.08;
    this.delayB.delayTime.value = 0.13;

    this.feedback = ctx.createGain();
    this.feedback.gain.value = 0.22;
    this.hp = ctx.createBiquadFilter();
    this.hp.type = 'highpass';
    this.hp.frequency.value = 250;
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.frequency.value = 4800;
    this.mix = ctx.createGain();
    this.mix.gain.value = 0.12;

    this.lfoA = ctx.createOscillator();
    this.lfoB = ctx.createOscillator();
    this.lfoA.frequency.value = 0.32;
    this.lfoB.frequency.value = 0.47;
    const lfoAGain = ctx.createGain();
    const lfoBGain = ctx.createGain();
    lfoAGain.gain.value = 0.006;
    lfoBGain.gain.value = 0.009;
    this.lfoA.connect(lfoAGain).connect(this.delayA.delayTime);
    this.lfoB.connect(lfoBGain).connect(this.delayB.delayTime);
    this.lfoA.start();
    this.lfoB.start();

    this.input.connect(this.output);
    this.input.connect(this.sendGain);
    this.sendGain.connect(this.delayA);
    this.sendGain.connect(this.delayB);
    this.delayA.connect(this.hp);
    this.delayB.connect(this.hp);
    this.hp.connect(this.lp);
    this.lp.connect(this.mix);
    this.mix.connect(this.output);
    this.lp.connect(this.feedback);
    this.feedback.connect(this.delayA);
    this.feedback.connect(this.delayB);
  }

  setAmount(v, organic = 0) {
    const amt = clamp(v);
    this.sendGain.gain.setTargetAtTime(0.02 + amt * 0.45, this.input.context.currentTime, 0.03);
    this.mix.gain.setTargetAtTime(amt * 0.34, this.input.context.currentTime, 0.03);
    this.feedback.gain.setTargetAtTime(0.12 + amt * 0.34 + organic * 0.08, this.input.context.currentTime, 0.03);
    this.lp.frequency.setTargetAtTime(expMap(1 - amt * 0.55, 2200, 7000), this.input.context.currentTime, 0.04);
  }
}

class FXBus {
  constructor(ctx) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();

    this.driveIn = ctx.createGain();
    this.driveIn.gain.value = 1;
    this.tape = ctx.createWaveShaper();
    this.tape.curve = this.makeTapeCurve(0.2);
    this.tape.oversample = '2x';
    this.driveOut = ctx.createGain();
    this.driveOut.gain.value = 0.9;

    this.lofiNode = new AudioWorkletNode(ctx, 'lofi-processor', {
      outputChannelCount: [2],
      parameterData: { bitDepth: 16, downsample: 1, mix: 0, jitter: 0 },
    });

    this.echoIn = ctx.createGain();
    this.echoSend = ctx.createGain();
    this.echoSend.gain.value = 0.16;
    this.echoMix = ctx.createGain();
    this.echoMix.gain.value = 0.16;
    this.delayL = ctx.createDelay(1.5);
    this.delayR = ctx.createDelay(1.5);
    this.delayL.delayTime.value = 0.24;
    this.delayR.delayTime.value = 0.36;
    this.echoFb = ctx.createGain();
    this.echoFb.gain.value = 0.32;
    this.echoHP = ctx.createBiquadFilter();
    this.echoHP.type = 'highpass';
    this.echoHP.frequency.value = 180;
    this.echoLP = ctx.createBiquadFilter();
    this.echoLP.type = 'lowpass';
    this.echoLP.frequency.value = 5200;

    this.wow = ctx.createOscillator();
    this.wow.frequency.value = 0.16;
    this.flutter = ctx.createOscillator();
    this.flutter.frequency.value = 4.8;
    this.wowDepthL = ctx.createGain();
    this.wowDepthR = ctx.createGain();
    this.flutterDepthL = ctx.createGain();
    this.flutterDepthR = ctx.createGain();
    this.wowDepthL.gain.value = 0.003;
    this.wowDepthR.gain.value = -0.002;
    this.flutterDepthL.gain.value = 0.0008;
    this.flutterDepthR.gain.value = -0.001;
    this.wow.connect(this.wowDepthL).connect(this.delayL.delayTime);
    this.wow.connect(this.wowDepthR).connect(this.delayR.delayTime);
    this.flutter.connect(this.flutterDepthL).connect(this.delayL.delayTime);
    this.flutter.connect(this.flutterDepthR).connect(this.delayR.delayTime);
    this.wow.start();
    this.flutter.start();

    this.reverbDry = ctx.createGain();
    this.reverbDry.gain.value = 1;
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.2;
    this.convolver = ctx.createConvolver();
    this.convolver.buffer = createImpulse(ctx, 2.8, 2.7);
    this.reverbMix = ctx.createGain();
    this.reverbMix.gain.value = 0.22;

    this.input.connect(this.driveIn);
    this.driveIn.connect(this.tape);
    this.tape.connect(this.driveOut);
    this.driveOut.connect(this.lofiNode);
    this.lofiNode.connect(this.echoIn);

    this.echoIn.connect(this.reverbDry);
    this.echoIn.connect(this.echoSend);
    this.echoSend.connect(this.delayL);
    this.echoSend.connect(this.delayR);
    this.delayL.connect(this.echoHP);
    this.delayR.connect(this.echoHP);
    this.echoHP.connect(this.echoLP);
    this.echoLP.connect(this.echoMix);
    this.echoMix.connect(this.reverbDry);
    this.echoLP.connect(this.echoFb);
    this.echoFb.connect(this.delayL);
    this.echoFb.connect(this.delayR);

    this.reverbDry.connect(this.output);
    this.reverbDry.connect(this.reverbSend);
    this.reverbSend.connect(this.convolver);
    this.convolver.connect(this.reverbMix);
    this.reverbMix.connect(this.output);
  }

  makeTapeCurve(amount = 0.2) {
    const curve = new Float32Array(2048);
    const drive = 1 + amount * 6;
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * drive) / Math.tanh(drive);
    }
    return curve;
  }

  update(patch) {
    const now = this.ctx.currentTime;
    const age = patch.macroAge || 0;
    const organic = patch.macroOrganic || 0;
    const tapeAmt = clamp(patch.tape + age * 0.28);
    this.driveIn.gain.setTargetAtTime(1 + tapeAmt * 4.8, now, 0.03);
    this.driveOut.gain.setTargetAtTime(0.92 - tapeAmt * 0.2, now, 0.03);
    this.tape.curve = this.makeTapeCurve(tapeAmt);

    const lofiAmt = clamp(patch.lofi + age * 0.22 - (patch.macroFocus || 0) * 0.12);
    this.lofiNode.parameters.get('mix').setValueAtTime(lofiAmt, now);
    this.lofiNode.parameters.get('bitDepth').setValueAtTime(16 - lofiAmt * 10, now);
    this.lofiNode.parameters.get('downsample').setValueAtTime(1 + lofiAmt * 10, now);
    this.lofiNode.parameters.get('jitter').setValueAtTime(lofiAmt * 0.7 + age * 0.2, now);

    const echoAmt = clamp(patch.echo);
    this.echoSend.gain.setTargetAtTime(0.02 + echoAmt * 0.42, now, 0.03);
    this.echoMix.gain.setTargetAtTime(echoAmt * 0.4, now, 0.03);
    this.echoFb.gain.setTargetAtTime(0.18 + echoAmt * 0.48, now, 0.03);
    this.echoLP.frequency.setTargetAtTime(expMap(1 - echoAmt * 0.45, 2300, 8200), now, 0.03);

    const spaceAmt = clamp(patch.space + patch.freeze * 0.18);
    this.reverbSend.gain.setTargetAtTime(0.04 + spaceAmt * 0.42, now, 0.04);
    this.reverbMix.gain.setTargetAtTime(spaceAmt * 0.46, now, 0.04);

    const wowAmt = 0.0015 + organic * 0.002 + age * 0.003;
    this.wowDepthL.gain.setTargetAtTime(wowAmt, now, 0.05);
    this.wowDepthR.gain.setTargetAtTime(-wowAmt * 0.72, now, 0.05);
    this.flutterDepthL.gain.setTargetAtTime(wowAmt * 0.3, now, 0.05);
    this.flutterDepthR.gain.setTargetAtTime(-wowAmt * 0.36, now, 0.05);
  }
}

export class SynthEngine {
  constructor() {
    this.ctx = null;
    this.voices = [];
    this.patch = {};
    this.voiceBus = null;
    this.granularBus = null;
    this.fx = null;
    this.master = null;
  }

  async init(initialPatch) {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    await this.ctx.audioWorklet.addModule('./audio/worklets/lofi-processor.js');

    this.voiceBus = this.ctx.createGain();
    this.granularBus = new GranularBus(this.ctx);
    this.fx = new FXBus(this.ctx);
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.72;

    this.voiceBus.connect(this.granularBus.input);
    this.granularBus.output.connect(this.fx.input);
    this.fx.output.connect(this.master);
    this.master.connect(this.ctx.destination);

    this.voices = Array.from({ length: 6 }, () => new Voice(this.ctx, this.voiceBus));
    this.setPatch(initialPatch);
  }

  async resume() {
    if (!this.ctx) return;
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }

  setPatch(nextPatch) {
    this.patch = { ...this.patch, ...nextPatch };
    if (!this.ctx) return;

    const focus = this.patch.macroFocus || 0;
    const complexity = this.patch.macroComplexity || 0;
    this.master.gain.setTargetAtTime(this.patch.master ?? 0.72, this.ctx.currentTime, 0.02);
    this.granularBus.setAmount(clamp(this.patch.grain + complexity * 0.08 - focus * 0.08), this.patch.macroOrganic || 0);
    this.fx.update(this.patch);

    for (const voice of this.voices) {
      if (voice.active) voice.updateFromPatch(this.patch, 1);
    }
  }

  noteOn(midi, velocity = 1) {
    if (!this.ctx) return;
    let voice = this.voices.find(v => !v.active);
    if (!voice) {
      voice = this.voices.reduce((oldest, current) => current.startTime < oldest.startTime ? current : oldest, this.voices[0]);
      voice.stopImmediately();
    }
    voice.start(midi, velocity, this.patch);
  }

  noteOff(midi) {
    for (const voice of this.voices) {
      if (voice.active && voice.note === midi) voice.release(this.patch);
    }
  }

  panic() {
    for (const voice of this.voices) voice.stopImmediately();
  }
}
