/**
 * Sequencer.js
 * 16 steps + swing
 * - grid = velocity (0..1)
 * - live REC stable via lastPlayedStep
 */

export class Sequencer {
  constructor(audioEngine, onStepChange) {
    this.audioEngine = audioEngine;
    this.onStepChange = onStepChange;

    this.steps = 16;
    this.pads = 6;
    this.bpm = 90;
    this.swing = 0;

    this.currentStep = 0;     // step "next to schedule"
    this.lastPlayedStep = -1; // step actually played (important for REC)
    this.isPlaying = false;
    this.intervalId = null;

    // grid stores velocity: 0=off, >0=on
    this.defaultVelocity = 0.8;
    this.grid = Array.from({ length: this.pads }, () => Array(this.steps).fill(0));

    // Live REC
    this.isRecording = false;
    this.quantizeRec = true;
    this.recOverdub = true;
    this.recVelocity = 0.9;

    // Scheduler
    this.nextStepTime = 0;
    this.scheduleAheadTime = 0.1;
    this.lookahead = 25; // ms
  }

  // ---------- Step state ----------
  toggleStep(padId, step) {
    const v = this.grid[padId][step] || 0;
    this.grid[padId][step] = v > 0 ? 0 : this.defaultVelocity;
    return this.grid[padId][step] > 0;
  }

  clearStep(padId, step) {
    this.grid[padId][step] = 0;
  }

  isStepActive(padId, step) {
    return (this.grid[padId][step] || 0) > 0;
  }

  getStepVelocity(padId, step) {
    return Math.max(0, Math.min(1, Number(this.grid[padId][step] || 0)));
  }

  setStepVelocity(padId, step, velocity01) {
    const v = Math.max(0, Math.min(1, Number(velocity01)));
    this.grid[padId][step] = v; // if v=0 it becomes off
    return v;
  }

  // ---------- Tempo ----------
  setBPM(bpm) {
    this.bpm = Math.max(60, Math.min(200, bpm));
  }

  setSwing(swing) {
    this.swing = Math.max(0, Math.min(75, swing));
  }

  getStepDuration() {
    return (60 / this.bpm) / 4;
  }

  getSwingOffset() {
    return this.getStepDuration() * (this.swing / 100) * 0.5;
  }

  // ---------- Live REC ----------
  setRecording(isOn) {
    this.isRecording = !!isOn;
  }

  /**
   * Enregistre un hit sur le step "le plus logique":
   * - si playing: lastPlayedStep (ou lastPlayedStep+1 si tu préfères "en avant")
   * - si quantizeRec: step nearest (approx) autour de lastPlayedStep
   */
  recordHit(padId, velocity = this.recVelocity, time = this.audioEngine.getCurrentTime()) {
    const v = Math.max(0, Math.min(1, Number(velocity)));

    let target = 0;

    if (!this.isPlaying) {
      // si pas en lecture, on écrit sur currentStep (souvent 0)
      target = this.currentStep || 0;
    } else {
      // base robuste = step qui vient d'être joué
      const base = this.lastPlayedStep >= 0 ? this.lastPlayedStep : this.currentStep;

      if (!this.quantizeRec) {
        target = base;
      } else {
        // quantize léger autour du "base", pour éviter les dérives du scheduler
        target = this._nearestAroundBase(time, base);
      }
    }

    const prev = this.grid[padId][target] || 0;
    this.grid[padId][target] = this.recOverdub ? Math.max(prev, v) : v;

    return target;
  }

  // Cherche le step le plus proche dans une fenêtre autour de base (±2 steps)
  _nearestAroundBase(time, baseStep) {
    const stepDur = this.getStepDuration();
    if (stepDur <= 0) return baseStep;

    // on prend une fenêtre réduite pour stabilité
    const candidates = [];
    for (let d = -2; d <= 2; d++) {
      const s = (baseStep + d + this.steps) % this.steps;
      candidates.push(s);
    }

    // approx du "playTime" de baseStep: nextStepTime a déjà avancé,
    // on reconstruit une référence locale
    const now = this.audioEngine.getCurrentTime();
    const dt = Math.max(-0.5, Math.min(0.5, time - now)); // clamp
    const ref = now + dt;

    let best = baseStep;
    let bestDist = Infinity;

    for (const s of candidates) {
      let offset = (s - baseStep);
      if (offset > this.steps / 2) offset -= this.steps;
      if (offset < -this.steps / 2) offset += this.steps;

      let t = ref + offset * stepDur;
      if (s % 2 === 1) t += this.getSwingOffset();

      const dist = Math.abs(time - t);
      if (dist < bestDist) {
        bestDist = dist;
        best = s;
      }
    }
    return best;
  }

  // ---------- Transport ----------
  start() {
    if (this.isPlaying) return;

    this.audioEngine.resume();
    this.isPlaying = true;

    this.currentStep = 0;
    this.lastPlayedStep = -1;

    this.nextStepTime = this.audioEngine.getCurrentTime();
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

    if (this.onStepChange) this.onStepChange(-1);
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
    // IMPORTANT: step réellement joué
    this.lastPlayedStep = step;

    let playTime = time;
    if (step % 2 === 1) playTime += this.getSwingOffset();

    for (let padId = 0; padId < this.pads; padId++) {
      const vel = this.getStepVelocity(padId, step);
      if (vel > 0) this.audioEngine.playSample(padId, playTime, vel);
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
    this.grid = Array.from({ length: this.pads }, () => Array(this.steps).fill(0));
  }

  exportPattern() {
    return JSON.stringify({ grid: this.grid, bpm: this.bpm, swing: this.swing, version: 2 });
  }

  importPattern(json) {
    try {
      const data = JSON.parse(json);
      this.grid = data.grid;
      this.bpm = data.bpm || 90;
      this.swing = data.swing || 0;

      // migration bool -> vel
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
