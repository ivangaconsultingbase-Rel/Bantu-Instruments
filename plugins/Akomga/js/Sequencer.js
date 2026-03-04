/**
 * Sequencer.js
 * Séquenceur 16 steps avec swing
 * + Velocity per-step (grid = 0..1)
 * + Live REC (quantized)
 */

export class Sequencer {
  constructor(audioEngine, onStepChange) {
    this.audioEngine = audioEngine;
    this.onStepChange = onStepChange;

    this.steps = 16;
    this.pads = 6;
    this.bpm = 90;
    this.swing = 0;
    this.currentStep = 0;
    this.isPlaying = false;
    this.intervalId = null;

    // IMPORTANT: grid stocke la VELOCITY (0..1)
    // 0 = off ; >0 = on
    this.defaultVelocity = 0.8;
    this.grid = Array.from({ length: this.pads }, () =>
      Array(this.steps).fill(0)
    );

    // Live REC
    this.isRecording = false;
    this.quantizeRec = true;  // rec quantizé sur step le + proche
    this.recOverdub = true;   // si false: écrase; si true: max(existing, new)
    this.recVelocity = 0.9;   // vélocité par défaut en rec

    // Scheduler
    this.nextStepTime = 0;
    this.scheduleAheadTime = 0.1; // s
    this.lookahead = 25; // ms
  }

  // --- Step state (velocity) ---
  toggleStep(padId, step) {
    const v = this.grid[padId][step] || 0;
    this.grid[padId][step] = v > 0 ? 0 : this.defaultVelocity;
    return this.grid[padId][step] > 0;
  }

  isStepActive(padId, step) {
    return (this.grid[padId][step] || 0) > 0;
  }

  getStepVelocity(padId, step) {
    return Math.max(0, Math.min(1, Number(this.grid[padId][step] || 0)));
  }

  setStepVelocity(padId, step, velocity01) {
    const v = Math.max(0, Math.min(1, Number(velocity01)));
    // si step est off, on l'allume implicitement
    this.grid[padId][step] = v;
    return v;
  }

  clearStep(padId, step) {
    this.grid[padId][step] = 0;
  }

  // --- Transport/tempo ---
  setBPM(bpm) {
    this.bpm = Math.max(60, Math.min(200, bpm));
  }

  setSwing(swing) {
    this.swing = Math.max(0, Math.min(75, swing));
  }

  getStepDuration() {
    // 16 steps = 1 mesure 4/4 => 1 step = 1/16 note => beat/4
    return (60 / this.bpm) / 4;
  }

  getSwingOffset() {
    // swing appliqué aux steps impairs
    return this.getStepDuration() * (this.swing / 100) * 0.5;
  }

  // --- Live REC ---
  setRecording(isOn) {
    this.isRecording = !!isOn;
  }

  /**
   * Enregistre un hit.
   * - Si playing: quantize sur step le plus proche.
   * - Si not playing: écrit sur currentStep (0 par défaut).
   */
  recordHit(padId, velocity = this.recVelocity, time = this.audioEngine.getCurrentTime()) {
    const v = Math.max(0, Math.min(1, Number(velocity)));

    let targetStep = this.currentStep;

    if (this.isPlaying && this.quantizeRec) {
      targetStep = this._getNearestStepForTime(time);
    }

    if (!this.recOverdub) {
      this.grid[padId][targetStep] = v;
    } else {
      this.grid[padId][targetStep] = Math.max(this.grid[padId][targetStep] || 0, v);
    }

    return targetStep;
  }

  /**
   * Calcule le step dont le playTime est le plus proche de "time"
   * en tenant compte du swing.
   */
  _getNearestStepForTime(time) {
    const stepDur = this.getStepDuration();
    if (stepDur <= 0) return this.currentStep;

    // On estime la position dans la mesure courante en partant de nextStepTime-stepDur
    // (approx stable même avec scheduling)
    const base = this.nextStepTime - stepDur; // "début" approximatif du step courant
    let rel = time - base;

    // Normalise dans [0, steps*stepDur)
    const loopDur = this.steps * stepDur;
    rel = ((rel % loopDur) + loopDur) % loopDur;

    // On teste chaque step en prenant son swingTime
    let bestStep = 0;
    let bestDist = Infinity;

    for (let s = 0; s < this.steps; s++) {
      let st = s * stepDur;
      if (s % 2 === 1) st += this.getSwingOffset();
      const dist = Math.abs(rel - st);
      if (dist < bestDist) {
        bestDist = dist;
        bestStep = s;
      }
    }
    return bestStep;
  }

  // --- Start/stop/scheduler ---
  start() {
    if (this.isPlaying) return;

    this.audioEngine.resume();
    this.isPlaying = true;
    this.currentStep = 0;
    this.nextStepTime = this.audioEngine.getCurrentTime();

    this.schedule();
  }

  stop() {
    this.isPlaying = false;
    this.currentStep = 0;

    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }

    if (this.onStepChange) {
      this.onStepChange(-1);
    }
  }

  schedule() {
    if (!this.isPlaying) return;

    const currentTime = this.audioEngine.getCurrentTime();

    while (this.nextStepTime < currentTime + this.scheduleAheadTime) {
      this.playStep(this.currentStep, this.nextStepTime);
      this.advanceStep();
    }

    this.intervalId = setTimeout(() => this.schedule(), this.lookahead);
  }

  playStep(step, time) {
    let playTime = time;
    if (step % 2 === 1) playTime += this.getSwingOffset();

    for (let padId = 0; padId < this.pads; padId++) {
      const vel = this.getStepVelocity(padId, step);
      if (vel > 0) {
        // 3e argument: velocity (si tu patches AudioEngine)
        this.audioEngine.playSample(padId, playTime, vel);
      }
    }

    const delay = (playTime - this.audioEngine.getCurrentTime()) * 1000;
    setTimeout(() => {
      if (this.onStepChange && this.isPlaying) this.onStepChange(step);
    }, Math.max(0, delay));
  }

  advanceStep() {
    this.nextStepTime += this.getStepDuration();
    this.currentStep = (this.currentStep + 1) % this.steps;
  }

  clear() {
    this.grid = Array.from({ length: this.pads }, () =>
      Array(this.steps).fill(0)
    );
  }

  // --- Import/Export ---
  exportPattern() {
    return JSON.stringify({
      grid: this.grid,
      bpm: this.bpm,
      swing: this.swing,
      version: 2
    });
  }

  importPattern(json) {
    try {
      const data = JSON.parse(json);
      this.grid = data.grid;
      this.bpm = data.bpm || 90;
      this.swing = data.swing || 0;

      // migration si ancien format bool
      if (Array.isArray(this.grid) && typeof this.grid?.[0]?.[0] === 'boolean') {
        this.grid = this.grid.map(row => row.map(on => (on ? this.defaultVelocity : 0)));
      }
      return true;
    } catch (e) {
      console.error('Erreur import pattern:', e);
      return false;
    }
  }
}
