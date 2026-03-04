/**
 * Sequencer.js
 * 16 steps + swing
 * + velocity per-step (grid = 0..1)
 * + accent per-step (accentGrid = boolean)
 * + humanize (vel + timing)
 * + metronome (quarter notes, accent downbeat)
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
    this.lastPlayedStep = -1;
    this.isPlaying = false;
    this.intervalId = null;

    // Velocity grid
    this.defaultVelocity = 0.8;
    this.grid = Array.from({ length: this.pads }, () => Array(this.steps).fill(0));

    // Accent grid
    this.accentGrid = Array.from({ length: this.pads }, () => Array(this.steps).fill(false));
    this.accentBoost = 1.25; // multiplier

    // Live REC
    this.isRecording = false;
    this.quantizeRec = true;
    this.recOverdub = true;
    this.recVelocity = 0.9;

    // Humanize
    this.humanizeVelAmt = 0.06;   // 0..0.30 typical (6%)
    this.humanizeTimeMs = 8;      // 0..20ms typical
    this.humanizeEnabled = true;

    // Metronome
    this.metronomeEnabled = false;

    // Scheduler
    this.nextStepTime = 0;
    this.scheduleAheadTime = 0.1;
    this.lookahead = 25;
  }

  // ---------- Step state ----------
  toggleStep(padId, step) {
    const v = this.grid[padId][step] || 0;
    this.grid[padId][step] = v > 0 ? 0 : this.defaultVelocity;
    if (this.grid[padId][step] === 0) this.accentGrid[padId][step] = false;
    return this.grid[padId][step] > 0;
  }

  clearStep(padId, step) {
    this.grid[padId][step] = 0;
    this.accentGrid[padId][step] = false;
  }

  isStepActive(padId, step) {
    return (this.grid[padId][step] || 0) > 0;
  }

  getStepVelocity(padId, step) {
    return Math.max(0, Math.min(1, Number(this.grid[padId][step] || 0)));
  }

  setStepVelocity(padId, step, velocity01) {
    const v = Math.max(0, Math.min(1, Number(velocity01)));
    this.grid[padId][step] = v;
    if (v === 0) this.accentGrid[padId][step] = false;
    return v;
  }

  // Accent
  toggleAccent(padId, step) {
    // si off, on allume le step avant de pouvoir accentuer
    if (!this.isStepActive(padId, step)) {
      this.grid[padId][step] = this.defaultVelocity;
    }
    this.accentGrid[padId][step] = !this.accentGrid[padId][step];
    return this.accentGrid[padId][step];
  }

  isAccented(padId, step) {
    return !!this.accentGrid?.[padId]?.[step];
  }

  // ---------- Tempo ----------
  setBPM(bpm) { this.bpm = Math.max(60, Math.min(200, bpm)); }
  setSwing(swing) { this.swing = Math.max(0, Math.min(75, swing)); }

  getStepDuration() { return (60 / this.bpm) / 4; }
  getSwingOffset() { return this.getStepDuration() * (this.swing / 100) * 0.5; }

  // ---------- Humanize ----------
  setHumanize(amountPct) {
    const a = Math.max(0, Math.min(30, Number(amountPct)));
    this.humanizeVelAmt = a / 100;
  }

  setHumanizeTime(ms) {
    this.humanizeTimeMs = Math.max(0, Math.min(20, Number(ms)));
  }

  // ---------- Metronome ----------
  setMetronome(on) {
    this.metronomeEnabled = !!on;
    // côté AudioEngine aussi (si dispo)
    this.audioEngine.setMetronomeEnabled?.(this.metronomeEnabled);
  }

  // ---------- Live REC ----------
  setRecording(isOn) { this.isRecording = !!isOn; }

  recordHit(padId, velocity = this.recVelocity, time = this.audioEngine.getCurrentTime()) {
    const v = Math.max(0, Math.min(1, Number(velocity)));

    let target = 0;
    if (!this.isPlaying) {
      target = this.currentStep || 0;
    } else {
      const base = this.lastPlayedStep >= 0 ? this.lastPlayedStep : this.currentStep;
      target = this.quantizeRec ? this._nearestAroundBase(time, base) : base;
    }

    const prev = this.grid[padId][target] || 0;
    this.grid[padId][target] = this.recOverdub ? Math.max(prev, v) : v;
    return target;
  }

  _nearestAroundBase(time, baseStep) {
    const stepDur = this.getStepDuration();
    if (stepDur <= 0) return baseStep;

    const candidates = [];
    for (let d = -2; d <= 2; d++) candidates.push((baseStep + d + this.steps) % this.steps);

    const now = this.audioEngine.getCurrentTime();
    const dt = Math.max(-0.5, Math.min(0.5, time - now));
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
      if (dist < bestDist) { bestDist = dist; best = s; }
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

    if (this.intervalId) { clearTimeout(this.intervalId); this.intervalId = null; }
    this.onStepChange?.(-1);
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
    this.lastPlayedStep = step;

    let playTime = time;
    if (step % 2 === 1) playTime += this.getSwingOffset();

    // Metronome: quarter notes = steps 0,4,8,12
    if (this.metronomeEnabled && step % 4 === 0) {
      const downbeat = step === 0;
      this.audioEngine.playClick?.(playTime, downbeat);
    }

    for (let padId = 0; padId < this.pads; padId++) {
      let vel = this.getStepVelocity(padId, step);
      if (vel <= 0) continue;

      // Accent
      if (this.isAccented(padId, step)) {
        vel = Math.min(1, vel * this.accentBoost);
      }

      // Humanize (subtil)
      let t = playTime;

      if (this.humanizeEnabled) {
        // vel jitter
        const a = this.humanizeVelAmt;
        if (a > 0) {
          const r = (Math.random() * 2 - 1) * a; // -a..+a
          vel = Math.max(0, Math.min(1, vel * (1 + r)));
        }
        // timing jitter (ms -> s)
        const ms = this.humanizeTimeMs;
        if (ms > 0) {
          const j = (Math.random() * 2 - 1) * (ms / 1000);
          t = Math.max(0, t + j);
        }
      }

      this.audioEngine.playSample(padId, t, vel);
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
    this.accentGrid = Array.from({ length: this.pads }, () => Array(this.steps).fill(false));
  }

  exportPattern() {
    return JSON.stringify({
      grid: this.grid,
      accentGrid: this.accentGrid,
      bpm: this.bpm,
      swing: this.swing,
      version: 3
    });
  }

  importPattern(json) {
    try {
      const data = JSON.parse(json);
      this.grid = data.grid;
      this.accentGrid = data.accentGrid || Array.from({ length: this.pads }, () => Array(this.steps).fill(false));
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
