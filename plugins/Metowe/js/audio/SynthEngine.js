import { Voice } from "./Voice.js";
import { ChorusNode } from "./effects/ChorusNode.js";
import { BitCrusherNode } from "./effects/BitCrusherNode.js";
import { LFO } from "./modulation/LFO.js";

export class SynthEngine {
  constructor() {
    this.ctx = null;
    this.voices = [];
    this.polyphony = 8;

    this.masterGain = null;

    this.chorus = null;
    this.bitcrusher = null;

    this.lfo = null;
  }

  async init() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    await this.ctx.audioWorklet.addModule("/js/audio/worklets/chorus-worklet.js");
    await this.ctx.audioWorklet.addModule("/js/audio/worklets/bitcrusher-worklet.js");

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.85;

    this.chorus = new ChorusNode(this.ctx);
    this.bitcrusher = new BitCrusherNode(this.ctx);

    this.lfo = new LFO(this.ctx);

    // routing
    this.chorus.connect(this.bitcrusher.input);
    this.bitcrusher.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    // defaults “musical”
    this.chorus.setRate(0.35);
    this.chorus.setDepth(0.003);
    this.chorus.setMix(0.55);

    this.bitcrusher.setBits(14);
    this.bitcrusher.setRate(1);
    this.bitcrusher.setMix(0.0);
  }

  resume() {
    if (this.ctx?.state === "suspended") this.ctx.resume();
  }

  getCurrentTime() {
    return this.ctx?.currentTime || 0;
  }

  _allocVoice() {
    const v = new Voice(this.ctx);
    v.connect(this.chorus.input);

    // LFO example: subtle vibrato on pulse detune (optional)
    // (si tu veux plutôt PWM + filtre ensuite on rebranche)
    try {
      if (v?.pulse?.detune) this.lfo.connect(v.pulse.detune);
    } catch {}

    this.voices.push(v);
    if (this.voices.length > this.polyphony) {
      const old = this.voices.shift();
      try { old?.noteOff?.(); } catch {}
    }
    return v;
  }

  noteOn(midiNote, velocity = 1) {
    const v = this._allocVoice();
    v.noteOn(midiNote, velocity);
    return v;
  }

  noteOff(midiNote) {
    this.voices.forEach(v => {
      if (v.note === midiNote) v.noteOff();
    });
  }

  /**
   * Scheduler helpers (Sequencer-friendly)
   */
  playNoteAt(midiNote, time, velocity = 1, gateSec = 0.18) {
    const v = this._allocVoice();
    v.noteOn(midiNote, velocity);

    // release after gateSec
    const tOff = Math.max(this.getCurrentTime(), time) + Math.max(0.02, gateSec);
    const delayMs = Math.max(0, (tOff - this.getCurrentTime()) * 1000);
    setTimeout(() => v.noteOff(), delayMs);
  }

  playChordAt(midiNotes, time, velocity = 1, gateSec = 0.22) {
    (midiNotes || []).forEach(n => this.playNoteAt(n, time, velocity, gateSec));
  }

  // Chorus controls
  setChorusRate(v) { this.chorus.setRate(v); }
  setChorusDepth(v) { this.chorus.setDepth(v); }
  setChorusMix(v) { this.chorus.setMix(v); }

  // Bitcrusher controls
  setCrusherBits(v) { this.bitcrusher.setBits(v); }
  setCrusherRate(v) { this.bitcrusher.setRate(v); }
  setCrusherMix(v) { this.bitcrusher.setMix(v); }
}
