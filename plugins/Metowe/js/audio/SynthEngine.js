import { Voice } from "./Voice.js";
import { ChorusNode } from "./effects/ChorusNode.js";

export class SynthEngine {

  constructor() {

    this.ctx = null;

    this.voices = [];

    this.masterGain = null;

    this.chorus = null;

    this.polyphony = 8;

  }

  async init() {

    this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    await this.ctx.audioWorklet.addModule(
      "/js/audio/worklets/chorus-worklet.js"
    );

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.8;

    this.chorus = new ChorusNode(this.ctx);

    this.chorus.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

  }

  resume() {
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  noteOn(note, velocity = 1) {

    const voice = new Voice(this.ctx);

    voice.connect(this.chorus.input);

    voice.noteOn(note, velocity);

    this.voices.push(voice);

    if (this.voices.length > this.polyphony)
      this.voices.shift();

  }

  noteOff(note) {

    this.voices.forEach(v => {
      if (v.note === note)
        v.noteOff();
    });

  }

  setChorusRate(v) {
    this.chorus.setRate(v);
  }

  setChorusDepth(v) {
    this.chorus.setDepth(v);
  }

  setChorusMix(v) {
    this.chorus.setMix(v);
  }

}
