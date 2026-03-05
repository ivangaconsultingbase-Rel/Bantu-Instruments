import { SCALES } from "./Scale.js";

export class Sequencer {
  constructor(synth, onStep){
    this.synth = synth;
    this.onStep = onStep;

    this.steps = 16;

    this.bpm = 90;
    this.swing = 0;

    this.human = 0; // 0..30 (%)

    this.isPlaying = false;
    this.currentStep = 0;
    this.nextTime = 0;
    this.lookahead = 25;
    this.scheduleAhead = 0.10;

    // musical
    this.root = 48;
    this.scaleName = "aeolian";
    this.mode = "arp"; // arp | chords | mono

    // pattern: -1 = rest, else degree index (0..scaleLen-1)
    // default: already “musical”
    this.pattern = [0,2,4,6, 2,4,6,4, 0,2,4,6, 2,4,6,4].map(x => x);

    // length in seconds per note
    this.noteLen = 0.22;
  }

  setBPM(v){ this.bpm = Math.max(60, Math.min(200, Number(v)||90)); }
  setSwing(v){ this.swing = Math.max(0, Math.min(75, Number(v)||0)); }
  setHuman(v){ this.human = Math.max(0, Math.min(30, Number(v)||0)); }

  setScale(name){ if (SCALES[name]) this.scaleName = name; }
  setRoot(midi){ this.root = Number(midi)||48; }
  setMode(m){ this.mode = m; }

  stepDur(){ return (60 / this.bpm) / 4; }
  swingOffset(){ return this.stepDur() * (this.swing/100) * 0.5; }

  degreeToMidi(deg){
    const scale = SCALES[this.scaleName] || SCALES.aeolian;
    const d = ((deg % scale.length) + scale.length) % scale.length;
    return this.root + scale[d];
  }

  // UI helpers
  getStepValue(i){ return this.pattern[i]; }
  cycleStep(i){
    // -1(rest) -> 0 -> 1 -> ... -> last -> -1
    const scale = SCALES[this.scaleName] || SCALES.aeolian;
    const last = scale.length - 1;
    const cur = this.pattern[i];
    if (cur === -1) this.pattern[i] = 0;
    else if (cur >= last) this.pattern[i] = -1;
    else this.pattern[i] = cur + 1;
    return this.pattern[i];
  }
  setRest(i){ this.pattern[i] = -1; }

  randomize(){
    const scale = SCALES[this.scaleName] || SCALES.aeolian;
    for (let i=0;i<this.steps;i++){
      const r = Math.random();
      if (r < 0.12) this.pattern[i] = -1;
      else this.pattern[i] = Math.floor(Math.random() * scale.length);
    }
  }
  clear(){
    for (let i=0;i<this.steps;i++) this.pattern[i] = -1;
  }

  start(){
    if (this.isPlaying) return;
    this.synth.resume();
    this.isPlaying = true;
    this.currentStep = 0;
    this.nextTime = this.synth.now();
    this._schedule();
  }

  stop(){
    this.isPlaying = false;
    if (this._t) clearTimeout(this._t);
    this.onStep?.(-1);
  }

  _schedule(){
    if (!this.isPlaying) return;
    const now = this.synth.now();

    while (this.nextTime < now + this.scheduleAhead){
      this._playStep(this.currentStep, this.nextTime);
      this._advance();
    }

    this._t = setTimeout(() => this._schedule(), this.lookahead);
  }

  _advance(){
    this.nextTime += this.stepDur();
    this.currentStep = (this.currentStep + 1) % this.steps;
  }

  _playStep(step, time){
    let t = time;
    if (step % 2 === 1) t += this.swingOffset();

    const deg = this.pattern[step];
    if (deg === -1) {
      this._fireUI(step, t);
      return;
    }

    // humanize (timing + velocity)
    const human = this.human / 100;
    let vel = 0.85;
    let len = this.noteLen;

    if (human > 0){
      const vJ = (Math.random()*2-1) * human * 0.25; // subtle
      vel = Math.max(0.1, Math.min(1, vel * (1 + vJ)));

      const tJ = (Math.random()*2-1) * human * 0.010; // up to ~±3ms at 30%
      t = Math.max(0, t + tJ);
    }

    const rootMidi = this.degreeToMidi(deg);

    if (this.mode === "mono"){
      this.synth.noteOn(rootMidi, vel, t, len);
    } else if (this.mode === "chords"){
      // minor triad from root (always minor flavor)
      this.synth.noteOn(rootMidi,     vel,     t, len);
      this.synth.noteOn(rootMidi + 3, vel*0.7, t, len);
      this.synth.noteOn(rootMidi + 7, vel*0.7, t, len);
    } else {
      // arp mode: alternating patterns
      const p = step % 4;
      if (p === 0) this.synth.noteOn(rootMidi, vel, t, len);
      if (p === 1) this.synth.noteOn(rootMidi + 7, vel*0.75, t, len);
      if (p === 2) this.synth.noteOn(rootMidi + 12, vel*0.7, t, len);
      if (p === 3) this.synth.noteOn(rootMidi + 3, vel*0.75, t, len);
    }

    this._fireUI(step, t);
  }

  _fireUI(step, playTime){
    const delay = (playTime - this.synth.now()) * 1000;
    setTimeout(() => {
      if (this.isPlaying) this.onStep?.(step);
    }, Math.max(0, delay));
  }
}
