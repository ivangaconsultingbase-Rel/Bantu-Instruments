// /js/sequencer/Sequencer.js
/**
 * Sequencer.js
 * 16 steps + swing
 * + velocity per-step (grid = 0..1)
 * + accent per-step (accentGrid = boolean)
 * + humanize (vel + timing)
 * + metronome (quarter notes, accent downbeat)
 * + live rec (quantize + overdub)
 * + DEMO PATTERN: preloaded so PLAY sounds immediately
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

    // Velocity grid (0..1)
    this.defaultVelocity = 0.8;
    this.grid = Array.from({ length: this.pads }, () => Array(this.steps).fill(0));

    // Accent grid
    this.accentGrid = Array.from({ length: this.pads }, () => Array(this.steps).fill(false));
    this.accentBoost = 1.25;

    // Live REC
    this.isRecording = false;
    this.quantizeRec = true;
    this.recOverdub = true;
    this.recVelocity = 0.9;

    // Humanize
    this.humanizeVelAmt = 0.06; // 6%
    this.humanizeTimeMs = 8;    // 8ms
    this.humanizeEnabled = true;

    // Metronome
    this.metronomeEnabled = false;

    // Scheduler
    this.nextStepTime = 0;
    this.scheduleAheadTime = 0.1;
    this.lookahead = 25;

    // ✅ IMPORTANT: preload a demo pattern so PLAY works immediately
    this.loadDemoPattern();
  }

  // ---------- Demo pattern ----------
  loadDemoPattern() {
    // clear first
    this.grid = Array.from({ length: this.pads }, () => Array(this.steps).fill(0));
    this.accentGrid = Array.from({ length: this.pads }, () => Array(this.steps).fill(false));

    // Helper
    const set = (pad, steps, vel = 0.8, accentSteps = []) => {
      steps.forEach(s => { this.grid[pad][s] = vel; });
      accentSteps.forEach(s => { this.accentGrid[pad][s] = true; });
    };

    // Pads mapping (your defaults):
    // 0 KICK, 1 SNARE, 2 HIHAT, 3 BASS, 4 CHOP1, 5 CHOP2

    // Kick: boom bap-ish
    set(0, [0, 7, 8, 11, 15], 0.95, [0, 8]);

    // Snare: backbeats
    set(1, [4, 12], 0.95, [4, 12]);

    // HiHat: 8ths with a couple skips
    set(2, [2, 6, 10, 14], 0.55, []);
    set(2, [0, 4, 8, 12], 0.35, []); // ghost hats

    // Bass: simple minor-ish pulse (works even with a single bass sample)
    set(3, [0, 3, 6, 9, 12, 14], 0.65, [0]);

    // Chops: arpeggio feel (alternating pads)
    set(4, [1, 5, 9, 13], 0.75, [9]);
    set(5, [2, 6, 10, 14], 0.72, [14]);

    // Small variations (human feel)
    // (keep subtle; real humanize is applied at runtime too)
    this.grid[2][10] = 0.62;
    this.grid[2][14] = 0.48;
    this.grid[0][7] = 0.75;
    this.grid[0][11] = 0.82;
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
    this.audioEngine.resume?.();
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

      if (this.isAccented(padId, step)) {
        vel = Math.min(1, vel * this.accentBoost);
      }

      let t = playTime;

      if (this.humanizeEnabled) {
        const a = this.humanizeVelAmt;
        if (a > 0) {
          const r = (Math.random() * 2 - 1) * a;
          vel = Math.max(0, Math.min(1, vel * (1 + r)));
        }
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
