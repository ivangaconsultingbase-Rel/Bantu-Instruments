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

    /* UNISON */

    this.unisonVoices = 1;
    this.unisonDetune = 10;

  }

  async init() {

    this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    await this.ctx.audioWorklet.addModule("/js/audio/worklets/chorus-worklet.js");
    await this.ctx.audioWorklet.addModule("/js/audio/worklets/bitcrusher-worklet.js");

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.9;

    this.chorus = new ChorusNode(this.ctx);
    this.bitcrusher = new BitCrusherNode(this.ctx);

    this.lfo = new LFO(this.ctx);

    this.chorus.connect(this.bitcrusher.input);
    this.bitcrusher.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

  }

  resume() {
    if (this.ctx?.state === "suspended") this.ctx.resume();
  }

  getCurrentTime() {
    return this.ctx.currentTime;
  }

  allocateVoice() {

    const v = new Voice(this.ctx);

    v.connect(this.chorus.input);

    this.voices.push(v);

    if (this.voices.length > this.polyphony) {

      const old = this.voices.shift();
      old.noteOff();

    }

    return v;

  }

  noteOn(note, velocity = 1) {

    const voices = [];

    for (let i = 0; i < this.unisonVoices; i++) {

      const v = this.allocateVoice();

      /* detune */

      const center = (this.unisonVoices - 1) / 2;

      const spread = (i - center) * this.unisonDetune;

      v.saw.detune.value = spread;
      v.pulse.detune.value = spread;

      v.noteOn(note, velocity);

      voices.push(v);

    }

    return voices;

  }

  noteOff(note) {

    this.voices.forEach(v => {

      if (v.note === note) v.noteOff();

    });

  }

  /* scheduler helpers */

  playNoteAt(note, time, velocity = 1, duration = 0.2) {

    const vs = this.noteOn(note, velocity);

    const delay = (time - this.getCurrentTime()) * 1000;

    setTimeout(() => {

      vs.forEach(v => v.noteOff());

    }, delay + duration * 1000);

  }

  playChordAt(notes, time, velocity = 1, duration = 0.3) {

    notes.forEach(n => {

      this.playNoteAt(n, time, velocity, duration);

    });

  }

  /* UNISON controls */

  setUnisonVoices(n) {

    this.unisonVoices = Math.max(1, Math.min(6, n));

  }

  setUnisonDetune(v) {

    this.unisonDetune = v;

  }

}
