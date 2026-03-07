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
    curve[i] = Math.sin(x * Math.PI * folds) / (1 + amount * 2.3);
  }
  return curve;
}

function createImpulse(ctx, seconds = 2.5, decay = 2.8) {
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
    this.output.gain.value = 0.9;

    this.preGain = ctx.createGain();
    this.preGain.gain.value = 0.25;
    this.folder = ctx.createWaveShaper();
    this.folder.oversample = '2x';

    this.blurLP = ctx.createBiquadFilter();
    this.blurLP.type = 'lowpass';
    this.spectralHP = ctx.createBiquadFilter();
    this.spectralHP.type = 'highpass';
    this.voiceVca = ctx.createGain();
    this.voiceVca.gain.value = 0;

    this.filterDrive = ctx.createWaveShaper();
    this.filterDrive.curve = makeWavefolderCurve(0.04);
    this.filterDrive.oversample = '2x';

    this.f1 = ctx.createBiquadFilter();
    this.f2 = ctx.createBiquadFilter();
    this.f3 = ctx.createBiquadFilter();
    this.f4 = ctx.createBiquadFilter();
    [this.f1, this.f2, this.f3, this.f4].forEach(f => { f.type = 'lowpass'; f.Q.value = 0.7; });

    this.post = ctx.createGain();
    this.post.gain.value = 0.9;

    this.preGain.connect(this.folder);
    this.folder.connect(this.blurLP);
    this.blurLP.connect(this.spectralHP);
    this.spectralHP.connect(this.voiceVca);
    this.voiceVca.connect(this.filterDrive);
    this.filterDrive.connect(this.f1);
    this.f1.connect(this.f2); this.f2.connect(this.f3); this.f3.connect(this.f4);
    this.f4.connect(this.post); this.post.connect(this.output); this.output.connect(destination);

    this.subOsc = ctx.createOscillator();
    this.subGain = ctx.createGain();
    this.subGain.gain.value = 0.03;
    this.subOsc.type = 'triangle';
    this.subOsc.connect(this.subGain); this.subGain.connect(this.preGain);
    this.subOsc.start();

    this.lfo = ctx.createOscillator();
    this.lfo.type = 'triangle';
    this.lfoGain = ctx.createGain();
    this.lfoGain.gain.value = 0;
    this.lfo.connect(this.lfoGain);
    this.lfo.start();

    this.partials = [];
    this.currentPatch = null;
    this.note = null;
    this.startedAt = 0;
    this.baseFreq = 220;
  }

  stopOscillators() {
    this.partials.forEach(p => {
      try { p.osc.stop(); } catch {}
      try { p.mod.stop(); } catch {}
      try { p.osc.disconnect(); p.mod.disconnect(); p.modGain.disconnect(); p.gain.disconnect(); } catch {}
    });
    this.partials = [];
  }

  buildAdditive(freq, velocity, patch) {
    this.stopOscillators();
    const now = this.ctx.currentTime;
    const harmonics = 4 + Math.round((patch.harmonics + patch.macroComplexity * 0.35) * 8);
    const model = MODEL_TABLES[patch.model] || MODEL_TABLES.wood;
    const morph = clamp(patch.morph);
    const inharmonic = patch.inharmonic * 0.22;
    const drift = (patch.drift + patch.macroOrganic * 0.2) * 0.012;
    const foldGain = 0.18 + patch.fold * 0.58 + patch.macroComplexity * 0.18;
    const velocityGain = lerp(0.55, 1, velocity * patch.velocityDepth + (1 - patch.velocityDepth));
    this.preGain.gain.setTargetAtTime(foldGain * velocityGain, now, 0.02);

    const voicesPerPartial = patch.unison ? 2 : 1;
    const detuneSpread = patch.unison ? (5 + patch.drift * 10 + patch.macroOrganic * 5) : 0;
    let denom = 0;

    for (let i = 1; i <= harmonics; i++) {
      const additiveAmp = Math.pow(1 / i, lerp(0.72, 2.0, patch.tilt));
      const modelAmp = model[(i - 1) % model.length] ?? (1 / i);
      const amp = lerp(additiveAmp, modelAmp, morph);
      denom += amp * voicesPerPartial;
    }

    for (let i = 1; i <= harmonics; i++) {
      const additiveAmp = Math.pow(1 / i, lerp(0.72, 2.0, patch.tilt));
      const modelAmp = model[(i - 1) % model.length] ?? (1 / i);
      const amp = lerp(additiveAmp, modelAmp, morph) / Math.max(1, denom);

      for (let u = 0; u < voicesPerPartial; u++) {
        const osc = this.ctx.createOscillator();
        const mod = this.ctx.createOscillator();
        const modGain = this.ctx.createGain();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        mod.type = 'sine';

        const unisonDetune = voicesPerPartial === 2 ? (u === 0 ? -detuneSpread : detuneSpread) : 0;
        const partialFreq = freq * i * (1 + inharmonic * Math.pow(i - 1, 1.08)) * (1 + ((Math.random() * 2 - 1) * drift));
        osc.frequency.setValueAtTime(partialFreq, now);
        osc.detune.setValueAtTime(unisonDetune, now);

        mod.frequency.setValueAtTime(freq * (0.5 + patch.index * 2.5) * (1 + u * 0.005), now);
        modGain.gain.setValueAtTime(freq * i * patch.index * (0.002 + 0.01 * i / harmonics), now);
        mod.connect(modGain); modGain.connect(osc.frequency);

        gain.gain.setValueAtTime(amp * 2.6, now);
        osc.connect(gain); gain.connect(this.preGain);
        osc.start(now); mod.start(now);
        this.partials.push({ osc, mod, modGain, gain });
      }
    }

    this.subOsc.frequency.setTargetAtTime(Math.max(25, freq / 2), now, 0.03);
    this.folder.curve = makeWavefolderCurve(clamp(patch.fold + patch.macroComplexity * 0.3));
  }

  setPatch(patch) {
    this.currentPatch = patch;
    const now = this.ctx.currentTime;
    const organic = patch.macroOrganic;
    const focus = patch.macroFocus;
    const age = patch.macroAge;

    this.blurLP.frequency.setTargetAtTime(expMap(1 - clamp(patch.blur * 0.75 + (1 - focus) * 0.2), 800, 18000), now, 0.03);
    this.spectralHP.frequency.setTargetAtTime(expMap(clamp(patch.warp * 0.45), 20, 2200), now, 0.03);
    this.filterDrive.curve = makeWavefolderCurve(0.03 + patch.drive * 0.18 + age * 0.08);

    const cutoffHz = expMap(clamp(patch.cutoff * (0.82 + focus * 0.24)), 60, 14000);
    const resonanceQ = lerp(0.7, 8.5, clamp(patch.resonance));
    [this.f1, this.f2, this.f3, this.f4].forEach((f, idx) => {
      f.frequency.setTargetAtTime(cutoffHz * (idx === 0 ? 1.03 : 1), now, 0.02);
      f.Q.setTargetAtTime(idx === 3 ? resonanceQ : lerp(0.7, resonanceQ * 0.8, 0.25), now, 0.03);
    });

    this.lfo.frequency.setTargetAtTime(0.1 + patch.lfoRate * 11.9, now, 0.05);
    this.lfoGain.gain.setTargetAtTime(organic * 6 + patch.lfoDepth * 18, now, 0.05);
    this.lfoGain.disconnect();
    this.lfoGain.connect(this.f1.detune);
  }

  start(note, velocity, patch, glideFromHz = null) {
    this.note = note;
    this.startedAt = this.ctx.currentTime;
    this.baseFreq = midiToHz(note);
    this.setPatch(patch);
    this.buildAdditive(this.baseFreq, velocity, patch);

    const now = this.ctx.currentTime;
    const amp = this.voiceVca.gain;
    amp.cancelScheduledValues(now);
    amp.setValueAtTime(0.0001, now);
    amp.linearRampToValueAtTime(1.0, now + patch.attack);
    amp.linearRampToValueAtTime(Math.max(0.001, patch.sustain), now + patch.attack + patch.decay);

    const targetHz = expMap(patch.cutoff, 60, 14000);
    const envBoost = patch.envAmt * 12000;
    const attackEnd = now + patch.filterAttack;
    const decayEnd = attackEnd + patch.filterDecay;
    [this.f1, this.f2, this.f3, this.f4].forEach((f) => {
      f.frequency.cancelScheduledValues(now);
      f.frequency.setValueAtTime(Math.max(60, targetHz * 0.7), now);
      f.frequency.linearRampToValueAtTime(Math.min(18000, targetHz + envBoost), attackEnd);
      f.frequency.exponentialRampToValueAtTime(Math.max(80, targetHz), decayEnd);
    });

    if (glideFromHz && patch.glide > 0 && this.partials.length) {
      const glideTime = 0.004 + patch.glide * 0.18;
      this.partials.forEach((p, idx) => {
        const ratio = idx % 8 + 1;
        p.osc.frequency.cancelScheduledValues(now);
        p.osc.frequency.setValueAtTime(glideFromHz * ratio, now);
        p.osc.frequency.exponentialRampToValueAtTime(Math.max(20, p.osc.frequency.value || this.baseFreq * ratio), now + glideTime);
      });
    }
  }

  release(patch) {
    const now = this.ctx.currentTime;
    this.voiceVca.gain.cancelScheduledValues(now);
    const current = Math.max(0.0001, this.voiceVca.gain.value);
    this.voiceVca.gain.setValueAtTime(current, now);
    this.voiceVca.gain.exponentialRampToValueAtTime(0.0001, now + patch.release);
    this.post.gain.setTargetAtTime(0.0001, now + patch.release * 0.4, patch.release * 0.35 + 0.01);
    setTimeout(() => this.stopOscillators(), Math.max(80, patch.release * 1200));
  }

  panic() {
    this.stopOscillators();
    this.voiceVca.gain.value = 0;
    this.note = null;
  }
}

class GrainCloud {
  constructor(ctx) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.mix = ctx.createGain();
    this.mix.gain.value = 0.16;

    this.hp = ctx.createBiquadFilter(); this.hp.type = 'highpass';
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass';
    this.delayA = ctx.createDelay(1.2); this.delayB = ctx.createDelay(1.2); this.delayC = ctx.createDelay(1.2);
    this.fbA = ctx.createGain(); this.fbB = ctx.createGain(); this.fbC = ctx.createGain();
    this.panA = new StereoPannerNode(ctx, { pan: -0.65 });
    this.panB = new StereoPannerNode(ctx, { pan: 0.0 });
    this.panC = new StereoPannerNode(ctx, { pan: 0.65 });

    this.modA = ctx.createOscillator(); this.modB = ctx.createOscillator(); this.modC = ctx.createOscillator();
    this.modAG = ctx.createGain(); this.modBG = ctx.createGain(); this.modCG = ctx.createGain();
    [this.modA, this.modB, this.modC].forEach((m, i) => { m.frequency.value = [0.17, 0.11, 0.07][i]; m.start(); });

    this.input.connect(this.hp); this.hp.connect(this.lp);
    this.lp.connect(this.delayA); this.lp.connect(this.delayB); this.lp.connect(this.delayC);
    this.delayA.connect(this.panA); this.delayB.connect(this.panB); this.delayC.connect(this.panC);
    this.panA.connect(this.mix); this.panB.connect(this.mix); this.panC.connect(this.mix); this.mix.connect(this.output);
    this.delayA.connect(this.fbA); this.fbA.connect(this.delayA);
    this.delayB.connect(this.fbB); this.fbB.connect(this.delayB);
    this.delayC.connect(this.fbC); this.fbC.connect(this.delayC);
    this.modA.connect(this.modAG); this.modAG.connect(this.delayA.delayTime);
    this.modB.connect(this.modBG); this.modBG.connect(this.delayB.delayTime);
    this.modC.connect(this.modCG); this.modCG.connect(this.delayC.delayTime);
  }

  setPatch(p) {
    const now = this.ctx.currentTime;
    const mix = clamp(p.grain * 0.6 + p.macroComplexity * 0.12);
    const size = 0.03 + p.grainSize * 0.28;
    const spray = 0.005 + p.grainSpray * 0.09;
    this.mix.gain.setTargetAtTime(mix, now, 0.05);
    this.hp.frequency.setTargetAtTime(expMap(1 - p.grainTone, 60, 1800), now, 0.05);
    this.lp.frequency.setTargetAtTime(expMap(p.grainTone, 1200, 12000), now, 0.05);
    this.delayA.delayTime.setTargetAtTime(size * 0.8, now, 0.03);
    this.delayB.delayTime.setTargetAtTime(size * 1.3, now, 0.03);
    this.delayC.delayTime.setTargetAtTime(size * 1.7, now, 0.03);
    this.fbA.gain.setTargetAtTime(0.08 + p.grainDensity * 0.26, now, 0.05);
    this.fbB.gain.setTargetAtTime(0.06 + p.grainDensity * 0.22, now, 0.05);
    this.fbC.gain.setTargetAtTime(0.05 + p.grainDensity * 0.18, now, 0.05);
    this.modAG.gain.setTargetAtTime(spray, now, 0.05);
    this.modBG.gain.setTargetAtTime(spray * 1.3, now, 0.05);
    this.modCG.gain.setTargetAtTime(spray * 1.7, now, 0.05);
  }
}

class FXBus {
  constructor(ctx) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.output = ctx.createGain();

    this.voiceMix = ctx.createGain();
    this.voiceMix.gain.value = 0.92;
    this.grainCloud = new GrainCloud(ctx);
    this.sum = ctx.createGain();

    this.tapePre = ctx.createGain();
    this.tapeShaper = ctx.createWaveShaper();
    this.tapeShaper.oversample = '2x';
    this.tapePost = ctx.createGain();

    this.lofiNode = null;
    this.lofiInput = ctx.createGain();
    this.lofiWet = ctx.createGain();
    this.lofiDry = ctx.createGain();
    this.postLofi = ctx.createGain();

    this.echoInput = ctx.createGain();
    this.echoDelay = ctx.createDelay(2.5);
    this.echoFeedback = ctx.createGain();
    this.echoWet = ctx.createGain();
    this.echoDry = ctx.createGain();
    this.echoLP = ctx.createBiquadFilter(); this.echoLP.type = 'lowpass';
    this.echoMod = ctx.createOscillator(); this.echoMod.start();
    this.echoModGain = ctx.createGain();

    this.reverbIn = ctx.createGain();
    this.convolver = ctx.createConvolver();
    this.reverbWet = ctx.createGain();
    this.reverbDry = ctx.createGain();

    this.master = ctx.createGain();

    this.input.connect(this.voiceMix);
    this.voiceMix.connect(this.sum);
    this.voiceMix.connect(this.grainCloud.input);
    this.grainCloud.output.connect(this.sum);
    this.sum.connect(this.tapePre);
    this.tapePre.connect(this.tapeShaper); this.tapeShaper.connect(this.tapePost);

    this.tapePost.connect(this.lofiDry); this.lofiDry.connect(this.postLofi);
    this.tapePost.connect(this.lofiInput);

    this.postLofi.connect(this.echoDry); this.postLofi.connect(this.echoInput);
    this.echoInput.connect(this.echoDelay); this.echoDelay.connect(this.echoLP); this.echoLP.connect(this.echoWet);
    this.echoLP.connect(this.echoFeedback); this.echoFeedback.connect(this.echoDelay);
    this.echoMod.connect(this.echoModGain); this.echoModGain.connect(this.echoDelay.delayTime);
    this.echoDry.connect(this.reverbDry); this.echoDry.connect(this.reverbIn);
    this.echoWet.connect(this.reverbIn);

    this.reverbIn.connect(this.convolver); this.convolver.connect(this.reverbWet);
    this.reverbDry.connect(this.master); this.reverbWet.connect(this.master);
    this.master.connect(this.output);

    this.convolver.buffer = createImpulse(ctx);
    this.echoLP.frequency.value = 4200;
  }

  async initWorklet() {
    await this.ctx.audioWorklet.addModule('./audio/worklets/lofi-processor.js');
    this.lofiNode = new AudioWorkletNode(this.ctx, 'lofi-processor');
    this.lofiInput.connect(this.lofiNode);
    this.lofiNode.connect(this.lofiWet);
    this.lofiWet.connect(this.postLofi);
  }

  setPatch(p) {
    const now = this.ctx.currentTime;
    this.grainCloud.setPatch(p);
    this.tapePre.gain.setTargetAtTime(1 + p.tape * 2.8 + p.macroAge * 0.9, now, 0.03);
    this.tapePost.gain.setTargetAtTime(0.55 + (1 - p.tape) * 0.12, now, 0.03);
    this.tapeShaper.curve = makeWavefolderCurve(0.02 + p.tape * 0.22 + p.macroAge * 0.08);

    this.lofiDry.gain.setTargetAtTime(1 - p.lofi, now, 0.03);
    this.lofiWet.gain.setTargetAtTime(p.lofi, now, 0.03);
    if (this.lofiNode) {
      this.lofiNode.parameters.get('bits').setValueAtTime(16 - p.bitDepth * 12, now);
      this.lofiNode.parameters.get('hold').setValueAtTime(1 + p.sampleRate * 22, now);
      this.lofiNode.parameters.get('jitter').setValueAtTime(p.wowFlutter * 0.08 + p.macroAge * 0.02, now);
    }

    this.echoDelay.delayTime.setTargetAtTime(0.08 + p.echoTime * 0.75, now, 0.03);
    this.echoFeedback.gain.setTargetAtTime(0.15 + p.feedback * 0.65, now, 0.03);
    this.echoWet.gain.setTargetAtTime(p.echo * 0.6, now, 0.03);
    this.echoDry.gain.setTargetAtTime(1, now, 0.03);
    this.echoLP.frequency.setTargetAtTime(expMap(1 - (p.wowFlutter * 0.65 + p.macroAge * 0.2), 900, 6500), now, 0.03);
    this.echoMod.frequency.setTargetAtTime(0.08 + p.wowFlutter * 6.5, now, 0.05);
    this.echoModGain.gain.setTargetAtTime(0.0008 + p.wowFlutter * 0.008, now, 0.05);

    this.reverbWet.gain.setTargetAtTime(p.space * 0.52, now, 0.05);
    this.reverbDry.gain.setTargetAtTime(1, now, 0.05);
    this.master.gain.setTargetAtTime(p.master, now, 0.03);
    this.convolver.buffer = createImpulse(this.ctx, 1.5 + p.reverbDecay * 4.5, 2 + p.reverbDecay * 2.5);
  }
}

export class SynthEngine {
  constructor() {
    this.ctx = null;
    this.voices = [];
    this.fx = null;
    this.patch = null;
    this.output = null;
    this.lastFreq = 220;
  }

  async init(patch) {
    if (this.ctx) return;
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    this.fx = new FXBus(this.ctx);
    await this.fx.initWorklet();
    this.output = this.ctx.createGain();
    this.fx.output.connect(this.output);
    this.output.connect(this.ctx.destination);

    for (let i = 0; i < 6; i++) {
      this.voices.push(new Voice(this.ctx, this.fx.input));
    }

    this.setPatch(patch);
  }

  async resume() {
    if (this.ctx && this.ctx.state !== 'running') await this.ctx.resume();
  }

  getVoice(note) {
    const existing = this.voices.find(v => v.note === note);
    if (existing) return existing;
    const free = this.voices.find(v => v.note == null);
    if (free) return free;
    return [...this.voices].sort((a, b) => a.startedAt - b.startedAt)[0];
  }

  setPatch(nextPatch) {
    this.patch = { ...this.patch, ...nextPatch };
    if (!this.ctx) return;
    const p = { ...this.patch };
    p.harmonics = clamp(p.harmonics + p.macroComplexity * 0.12);
    p.fold = clamp(p.fold + p.macroComplexity * 0.08);
    p.blur = clamp(p.blur + (1 - p.macroFocus) * 0.15);
    p.drift = clamp(p.drift + p.macroOrganic * 0.12);
    p.tape = clamp(p.tape + p.macroAge * 0.15);
    this.voices.forEach(v => v.setPatch(p));
    this.fx.setPatch(p);
    this.renderPatch = p;
  }

  noteOn(note, velocity = 0.95) {
    if (!this.ctx || !this.renderPatch) return;
    const v = this.getVoice(note);
    if (v.note != null && v.note !== note) v.panic();
    const glideFrom = this.renderPatch.glide > 0 ? this.lastFreq : null;
    v.start(note, velocity, this.renderPatch, glideFrom);
    this.lastFreq = midiToHz(note);
  }

  noteOff(note) {
    if (!this.ctx || !this.renderPatch) return;
    this.voices.filter(v => v.note === note).forEach(v => {
      v.release(this.renderPatch);
      v.note = null;
    });
  }

  panic() {
    this.voices.forEach(v => v.panic());
  }
}
