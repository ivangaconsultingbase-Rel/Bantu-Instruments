// js/sequencer/Sequencer.js
// Notes sequencer (minor scale) -> schedules audioEngine.noteOn(time, midi, vel, gate, accent)

export class Sequencer {
  constructor(audioEngine, onStepChange) {
    this.audioEngine = audioEngine;
    this.onStepChange = onStepChange;

    this.steps = 16;
    this.bpm = 92;
    this.swing = 12; // %
    this.isPlaying = false;
    this.currentStep = 0;

    // scheduler
    this.nextStepTime = 0;
    this.scheduleAheadTime = 0.12;
    this.lookahead = 25;
    this._timer = null;

    // Minor scale degrees (natural minor)
    this.scale = [0, 2, 3, 5, 7, 8, 10];
    this.rootMidi = 48; // C3

    // Pattern: per step
    // degree: -1 rest, else 0..6
    // octave: -1..+2
    // vel: 0..1
    // accent: boolean
    this.pattern = Array.from({ length: this.steps }, (_, i) => ({
      degree: [0,2,4,5,4,2,0,-1, 0,2,4,6,4,2,1,-1][i] ?? -1,
      octave: [0,0,0,0,0,0,0,0, 0,0,0,1,0,0,0,0][i] ?? 0,
      vel: 0.85,
      accent: (i % 4 === 0),
    }));

    // Humanize
    this.humanizePct = 8;     // vel randomness %
    this.humanizeTimeMs = 8;  // timing jitter ms

    // Gate
    this.gate = 0.11; // seconds
  }

  setBPM(bpm) { this.bpm = Math.max(60, Math.min(200, Number(bpm) || 90)); }
  setSwing(s) { this.swing = Math.max(0, Math.min(75, Number(s) || 0)); }

  setHumanize(pct) { this.humanizePct = Math.max(0, Math.min(30, Number(pct) || 0)); }
  setHumanizeTime(ms) { this.humanizeTimeMs = Math.max(0, Math.min(20, Number(ms) || 0)); }

  getStepDuration() { return (60 / this.bpm) / 4; }
  getSwingOffset() { return this.getStepDuration() * (this.swing / 100) * 0.5; }

  start() {
    if (this.isPlaying) return;
    this.audioEngine.resume();
    this.isPlaying = true;
    this.currentStep = 0;
    this.nextStepTime = this.audioEngine.getCurrentTime();
    this._schedule();
  }

  stop() {
    this.isPlaying = false;
    this.currentStep = 0;
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    this.onStepChange?.(-1);
  }

  _schedule() {
    if (!this.isPlaying) return;

    const now = this.audioEngine.getCurrentTime();
    while (this.nextStepTime < now + this.scheduleAheadTime) {
      this._playStep(this.currentStep, this.nextStepTime);
      this._advance();
    }

    this._timer = setTimeout(() => this._schedule(), this.lookahead);
  }

  _playStep(step, time) {
    let t = time;
    if (step % 2 === 1) t += this.getSwingOffset();

    const st = this.pattern[step];
    if (st && st.degree >= 0) {
      // humanize timing
      if (this.humanizeTimeMs > 0) {
        const j = (Math.random() * 2 - 1) * (this.humanizeTimeMs / 1000);
        t = Math.max(0, t + j);
      }

      // compute midi from degree+octave
      const deg = st.degree % this.scale.length;
      const semi = this.scale[deg] + (12 * (st.octave || 0));
      const midi = this.rootMidi + semi;

      // humanize velocity
      let vel = Math.max(0, Math.min(1, Number(st.vel ?? 0.85)));
      if (this.humanizePct > 0) {
        const a = this.humanizePct / 100;
        const r = (Math.random() * 2 - 1) * a;
        vel = Math.max(0, Math.min(1, vel * (1 + r)));
      }

      // accent
      const accent = !!st.accent;
      if (accent) vel = Math.min(1, vel * 1.12);

      this.audioEngine.noteOn(t, midi, vel, this.gate, accent);
    }

    // UI callback aligned to (non-jittered) step time for stable animation
    const delay = (time - this.audioEngine.getCurrentTime()) * 1000;
    setTimeout(() => {
      if (this.onStepChange && this.isPlaying) this.onStepChange(step);
    }, Math.max(0, delay));
  }

  _advance() {
    this.nextStepTime += this.getStepDuration();
    this.currentStep = (this.currentStep + 1) % this.steps;
  }
}
