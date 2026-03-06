/**
 * Sequencer.js — 16 steps, 1 track
 * - degree 0(off) or 1..7 (natural minor degrees)
 * - accent boolean
 * - octave -1/0/+1
 * - chordMode TRIAD / SEVENTH
 * - inversion 0/1/2
 * - holdChord (sustain until next chord)
 * - swing + humanize (vel + timing)
 * - metronome (quarter notes, downbeat accent)
 */

export class Sequencer {
  constructor(audioEngine, onStepChange) {
    this.audioEngine = audioEngine;
    this.onStepChange = onStepChange;

    this.steps = 16;

    this.bpm = 96;
    this.swing = 0;

    this.isPlaying = false;
    this.currentStep = 0;
    this.lastPlayedStep = -1;

    this.nextStepTime = 0;
    this.scheduleAheadTime = 0.1;
    this.lookahead = 25;
    this.intervalId = null;

    // track state
    this.degree = Array(this.steps).fill(0);      // 0..7
    this.accent = Array(this.steps).fill(false); // boolean
    this.oct = Array(this.steps).fill(0);        // -1/0/+1

    // root (default A minor)
    this.rootName = 'A';
    this.rootMidi = 57; // A3
    this.scale = [0, 2, 3, 5, 7, 8, 10]; // natural minor

    // chord settings
    this.chordMode = 'TRIAD'; // TRIAD | SEVENTH
    this.inversion = 0;       // 0..2
    this.holdChord = false;

    // humanize
    this.humanizeVelAmt = 0.0; // 0..0.30
    this.humanizeTimeMs = 0;   // 0..20ms

    // metronome
    this.metronomeEnabled = false;
  }

  // ---------- root ----------
  setRoot(name) {
    const n = (name || 'A').toUpperCase();
    this.rootName = n;

    const map = { C: 60, D: 62, E: 64, A: 57 };
    this.rootMidi = map[n] ?? 57;
  }

  // ---------- chord settings ----------
  setChordMode(mode) {
    const m = (mode || 'TRIAD').toUpperCase();
    this.chordMode = (m === 'SEVENTH') ? 'SEVENTH' : 'TRIAD';
  }

  setInversion(inv) {
    const i = Math.max(0, Math.min(2, parseInt(inv, 10) || 0));
    this.inversion = i;
  }

  setHold(on) {
    this.holdChord = !!on;
    // if turning off, release held chord
    if (!this.holdChord) {
      this.audioEngine.releaseHeldChord?.(this.audioEngine.ctx?.currentTime || 0);
    }
  }

  // ---------- tempo ----------
  setBPM(bpm) { this.bpm = Math.max(60, Math.min(200, Number(bpm))); }
  setSwing(swing) { this.swing = Math.max(0, Math.min(75, Number(swing))); }

  getStepDuration() { return (60 / this.bpm) / 4; }
  getSwingOffset() { return this.getStepDuration() * (this.swing / 100) * 0.5; }

  // ---------- humanize ----------
  setHumanize(amountPct) {
    const a = Math.max(0, Math.min(30, Number(amountPct)));
    this.humanizeVelAmt = a / 100;
  }
  setHumanizeTime(ms) {
    this.humanizeTimeMs = Math.max(0, Math.min(20, Number(ms)));
  }

  // ---------- metronome ----------
  setMetronome(on) {
    this.metronomeEnabled = !!on;
    this.audioEngine.setMetronomeEnabled?.(this.metronomeEnabled);
  }

  // ---------- step editing ----------
  _clampStep(step) {
    const s = Number(step) || 0;
    return ((s % this.steps) + this.steps) % this.steps;
  }

  cycleDegree(step) {
    const s = this._clampStep(step);
    const v = this.degree[s] || 0;
    const next = (v >= 7) ? 0 : (v + 1);
    this.degree[s] = next;
    if (next === 0) this.accent[s] = false;
    return next;
  }

  toggleAccent(step) {
    const s = this._clampStep(step);
    if ((this.degree[s] || 0) === 0) this.degree[s] = 1;
    this.accent[s] = !this.accent[s];
    return this.accent[s];
  }

  cycleOctave(step) {
    const s = this._clampStep(step);
    const o = this.oct[s] || 0;
    const next = (o === 0) ? 1 : (o === 1 ? -1 : 0);
    this.oct[s] = next;
    return next;
  }

  clear() {
    this.degree.fill(0);
    this.accent.fill(false);
    this.oct.fill(0);
    this.audioEngine.releaseHeldChord?.(this.audioEngine.ctx?.currentTime || 0);
  }

  getStepState(step) {
    const s = this._clampStep(step);
    return { degree: this.degree[s] || 0, accent: !!this.accent[s], octave: this.oct[s] || 0 };
  }

  // ---------- diatonic chord building ----------
  _degreeToMidi(degree1to7, octaveOffset = 0) {
    const deg = Math.max(1, Math.min(7, Number(degree1to7)));
    const semis = this.scale[deg - 1];
    return this.rootMidi + semis + (octaveOffset * 12);
  }

  _triadForDegree(deg, octaveOffset = 0) {
    const d1 = deg;
    const d3 = ((deg + 1) % 7) + 1;
    const d5 = ((deg + 3) % 7) + 1;

    const m1 = this._degreeToMidi(d1, octaveOffset);
    let m3 = this._degreeToMidi(d3, octaveOffset);
    let m5 = this._degreeToMidi(d5, octaveOffset);

    if (m3 <= m1) m3 += 12;
    if (m5 <= m3) m5 += 12;

    return [m1, m3, m5];
  }

  _seventhForDegree(deg, octaveOffset = 0) {
    const tri = this._triadForDegree(deg, octaveOffset);
    const d7 = ((deg + 5) % 7) + 1; // +6 degrees => 7th
    let m7 = this._degreeToMidi(d7, octaveOffset);
    while (m7 <= tri[2]) m7 += 12;
    return [...tri, m7];
  }

  _applyInversion(midiNotes, inv) {
    const notes = midiNotes.slice().sort((a, b) => a - b);
    const i = Math.max(0, Math.min(2, inv | 0));
    for (let k = 0; k < i; k++) {
      const n = notes.shift();
      notes.push(n + 12);
    }
    return notes;
  }

  getDisplayLabel(step) {
    const s = this._clampStep(step);
    const d = this.degree[s] || 0;
    if (d <= 0) return '';
    const o = this.oct[s] || 0;
    const oTxt = (o === 1) ? '↑' : (o === -1 ? '↓' : '');
    return `${d}${oTxt}`;
  }

  // ---------- transport ----------
  start() {
    if (this.isPlaying) return;
    this.audioEngine.resume();
    this.isPlaying = true;

    this.currentStep = 0;
    this.lastPlayedStep = -1;
    this.nextStepTime = this.audioEngine.ctx.currentTime;

    this.schedule();
  }

  stop() {
    this.isPlaying = false;
    this.currentStep = 0;
    this.lastPlayedStep = -1;

    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }

    this.onStepChange?.(-1);

    // If hold, let it ring, but you can choose to release on stop:
    // this.audioEngine.releaseHeldChord?.(this.audioEngine.ctx?.currentTime || 0);
  }

  schedule() {
    if (!this.isPlaying) return;

    const now = this.audioEngine.ctx.currentTime;
    while (this.nextStepTime < now + this.scheduleAheadTime) {
      this.playStep(this.currentStep, this.nextStepTime);
      this.advanceStep();
    }

    this.intervalId = setTimeout(() => this.schedule(), this.lookahead);
  }

  playStep(step, time) {
    this.lastPlayedStep = step;

    let t = time;
    if (step % 2 === 1) t += this.getSwingOffset();

    // MET: quarter notes
    if (this.metronomeEnabled && step % 4 === 0) {
      this.audioEngine.playClick?.(t, step === 0);
    }

    const deg = this.degree[step] || 0;
    if (deg > 0) {
      const accent = !!this.accent[step];
      const octave = this.oct[step] || 0;

      let vel = accent ? 1.0 : 0.85;

      // Humanize velocity
      const a = this.humanizeVelAmt;
      if (a > 0) {
        const r = (Math.random() * 2 - 1) * a;
        vel = Math.max(0.15, Math.min(1, vel * (1 + r)));
      }

      // Humanize timing
      const ms = this.humanizeTimeMs;
      if (ms > 0) {
        const j = (Math.random() * 2 - 1) * (ms / 1000);
        t = Math.max(0, t + j);
      }

      // chord notes
      let chord = (this.chordMode === 'SEVENTH')
        ? this._seventhForDegree(deg, octave)
        : this._triadForDegree(deg, octave);

      chord = this._applyInversion(chord, this.inversion);

      // hold: release previous chord at this time inside engine + sustain
      this.audioEngine.playChord(chord, t, vel, accent, this.holdChord);
    }

    const delay = (t - this.audioEngine.ctx.currentTime) * 1000;
    setTimeout(() => {
      if (this.onStepChange && this.isPlaying) this.onStepChange(step);
    }, Math.max(0, delay));
  }

  advanceStep() {
    this.nextStepTime += this.getStepDuration();
    this.currentStep = (this.currentStep + 1) % this.steps;
  }
}
