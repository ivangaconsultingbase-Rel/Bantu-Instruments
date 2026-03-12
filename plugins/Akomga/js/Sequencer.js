/**
 * Sequencer.js
 * v2 — 16/32/64 steps · param locks per step · swing · humanize · metronome
 *
 * NOUVEAU:
 * - this.steps: nombre actif de pas (16 | 32 | 64)
 * - this.maxSteps: capacité de la grille (64) — les données survivent aux changements de longueur
 * - paramLocks[padId][step] = { pitch?: number }  (null/undefined = valeur par défaut du pad)
 * - setParamLock / getParamLock / clearParamLock / hasParamLock
 * - playStep passe le lock à audioEngine.playSample(padId, t, vel, lock)
 */

export class Sequencer {
  constructor(audioEngine, onStepChange) {
    this.audioEngine  = audioEngine;
    this.onStepChange = onStepChange;

    this.pads     = 6;
    this.maxSteps = 64;   // taille de la grille — ne change jamais
    this.steps    = 16;   // longueur de lecture active (16 | 32 | 64)

    this.bpm   = 90;
    this.swing = 0;

    this.currentStep    = 0;
    this.lastPlayedStep = -1;
    this.isPlaying  = false;
    this.intervalId = null;

    this.defaultVelocity = 0.8;

    // Grilles initialisées à maxSteps pour conserver les données lors des changements de longueur
    this.grid = Array.from({ length: this.pads },
      () => Array(this.maxSteps).fill(0));

    this.accentGrid = Array.from({ length: this.pads },
      () => Array(this.maxSteps).fill(false));

    // Parameter locks : { pitch?: number } par step/pad
    this.paramLocks = Array.from({ length: this.pads },
      () => Array.from({ length: this.maxSteps }, () => ({})));

    this.accentBoost = 1.25;

    // Live REC
    this.isRecording  = false;
    this.quantizeRec  = true;
    this.recOverdub   = true;
    this.recVelocity  = 0.9;

    // Humanize
    this.humanizeVelAmt  = 0.06;
    this.humanizeTimeMs  = 8;
    this.humanizeEnabled = true;

    // Metronome
    this.metronomeEnabled = false;

    // Scheduler
    this.nextStepTime      = 0;
    this.scheduleAheadTime = 0.1;
    this.lookahead         = 25; // ms
  }

  // ─── Longueur de pattern ──────────────────────────────────────────────────

  /**
   * Change le nombre actif de pas.
   * Les données des pas hors de la fenêtre sont conservées.
   * @param {16|32|64} n
   */
  setStepCount(n) {
    const valid = [16, 32, 64];
    this.steps = valid.includes(n) ? n : 16;
    if (this.isPlaying) {
      this.currentStep = this.currentStep % this.steps;
    }
  }

  // ─── État des steps ───────────────────────────────────────────────────────

  toggleStep(padId, step) {
    const v = this.grid[padId][step] || 0;
    this.grid[padId][step] = v > 0 ? 0 : this.defaultVelocity;
    if (this.grid[padId][step] === 0) {
      this.accentGrid[padId][step]   = false;
      this.paramLocks[padId][step]   = {};
    }
    return this.grid[padId][step] > 0;
  }

  clearStep(padId, step) {
    this.grid[padId][step]         = 0;
    this.accentGrid[padId][step]   = false;
    this.paramLocks[padId][step]   = {};
  }

  isStepActive(padId, step) {
    return (this.grid[padId][step] || 0) > 0;
  }

  getStepVelocity(padId, step) {
    return Math.max(0, Math.min(1, Number(this.grid[padId][step] || 0)));
  }

  setStepVelocity(padId, step, v01) {
    const v = Math.max(0, Math.min(1, Number(v01)));
    this.grid[padId][step] = v;
    if (v === 0) {
      this.accentGrid[padId][step] = false;
      this.paramLocks[padId][step] = {};
    }
    return v;
  }

  // ─── Accent ───────────────────────────────────────────────────────────────

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

  // ─── Parameter Locks ──────────────────────────────────────────────────────

  /**
   * Retourne le lock courant pour un step (objet, peut être vide).
   * @returns {{ pitch?: number }}
   */
  getParamLock(padId, step) {
    return this.paramLocks?.[padId]?.[step] || {};
  }

  /**
   * Définit/met à jour un param lock sur un step.
   * @param {number} padId
   * @param {number} step
   * @param {'pitch'} param   — extensible à d'autres params plus tard
   * @param {number} value
   */
  setParamLock(padId, step, param, value) {
    if (!this.paramLocks[padId]?.[step]) {
      if (!this.paramLocks[padId]) this.paramLocks[padId] = [];
      this.paramLocks[padId][step] = {};
    }
    this.paramLocks[padId][step][param] = value;
  }

  /**
   * Supprime un param lock (ou tous si param est omis).
   */
  clearParamLock(padId, step, param) {
    if (!this.paramLocks?.[padId]?.[step]) return;
    if (param !== undefined) {
      delete this.paramLocks[padId][step][param];
    } else {
      this.paramLocks[padId][step] = {};
    }
  }

  /**
   * @returns {boolean} true si au moins un lock existe sur ce step/pad
   */
  hasParamLock(padId, step) {
    const lock = this.paramLocks?.[padId]?.[step];
    return !!(lock && Object.keys(lock).length > 0);
  }

  // ─── Tempo ────────────────────────────────────────────────────────────────

  setBPM(bpm)     { this.bpm   = Math.max(60, Math.min(200, bpm)); }
  setSwing(swing) { this.swing = Math.max(0,  Math.min(75, swing)); }

  getStepDuration()  { return (60 / this.bpm) / 4; }
  getSwingOffset()   { return this.getStepDuration() * (this.swing / 100) * 0.5; }

  // ─── Humanize ─────────────────────────────────────────────────────────────

  setHumanize(pct) {
    this.humanizeVelAmt = Math.max(0, Math.min(30, Number(pct))) / 100;
  }

  setHumanizeTime(ms) {
    this.humanizeTimeMs = Math.max(0, Math.min(20, Number(ms)));
  }

  // ─── Metronome ────────────────────────────────────────────────────────────

  setMetronome(on) {
    this.metronomeEnabled = !!on;
    this.audioEngine.setMetronomeEnabled?.(this.metronomeEnabled);
  }

  // ─── Live REC ─────────────────────────────────────────────────────────────

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
    const dt  = Math.max(-0.5, Math.min(0.5, time - now));
    const ref = now + dt;

    let best = baseStep, bestDist = Infinity;
    for (const s of candidates) {
      let offset = s - baseStep;
      if (offset >  this.steps / 2) offset -= this.steps;
      if (offset < -this.steps / 2) offset += this.steps;

      let t = ref + offset * stepDur;
      if (s % 2 === 1) t += this.getSwingOffset();

      const dist = Math.abs(time - t);
      if (dist < bestDist) { bestDist = dist; best = s; }
    }
    return best;
  }

  // ─── Transport ────────────────────────────────────────────────────────────

  start() {
    if (this.isPlaying) return;
    this.audioEngine.resume();
    this.isPlaying   = true;
    this.currentStep = 0;
    this.lastPlayedStep = -1;
    this.nextStepTime   = this.audioEngine.getCurrentTime();
    this.schedule();
  }

  stop() {
    this.isPlaying   = false;
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

    // Métronome sur les noires (steps 0,4,8,12...)
    if (this.metronomeEnabled && step % 4 === 0) {
      this.audioEngine.playClick?.(playTime, step === 0);
    }

    for (let padId = 0; padId < this.pads; padId++) {
      let vel = this.getStepVelocity(padId, step);
      if (vel <= 0) continue;

      // Accent
      if (this.isAccented(padId, step)) {
        vel = Math.min(1, vel * this.accentBoost);
      }

      let t = playTime;

      // Humanize
      if (this.humanizeEnabled) {
        const a = this.humanizeVelAmt;
        if (a > 0) vel = Math.max(0, Math.min(1, vel * (1 + (Math.random() * 2 - 1) * a)));
        const ms = this.humanizeTimeMs;
        if (ms > 0) t = Math.max(0, t + (Math.random() * 2 - 1) * (ms / 1000));
      }

      // ── PARAM LOCK : passé à playSample ──
      const lock = this.getParamLock(padId, step);
      this.audioEngine.playSample(padId, t, vel, lock);
    }

    const delay = (playTime - this.audioEngine.getCurrentTime()) * 1000;
    setTimeout(() => {
      if (this.onStepChange && this.isPlaying) this.onStepChange(step);
    }, Math.max(0, delay));
  }

  advanceStep() {
    this.nextStepTime += this.getStepDuration();
    this.currentStep   = (this.currentStep + 1) % this.steps;
  }

  // ─── Utilitaires ──────────────────────────────────────────────────────────

  clear() {
    this.grid       = Array.from({ length: this.pads }, () => Array(this.maxSteps).fill(0));
    this.accentGrid = Array.from({ length: this.pads }, () => Array(this.maxSteps).fill(false));
    this.paramLocks = Array.from({ length: this.pads },
      () => Array.from({ length: this.maxSteps }, () => ({})));
  }

  exportPattern() {
    return JSON.stringify({
      grid:        this.grid,
      accentGrid:  this.accentGrid,
      paramLocks:  this.paramLocks,
      bpm:         this.bpm,
      swing:       this.swing,
      steps:       this.steps,
      version:     4
    });
  }

  importPattern(json) {
    try {
      const data = JSON.parse(json);
      this.grid       = data.grid;
      this.accentGrid = data.accentGrid ||
        Array.from({ length: this.pads }, () => Array(this.maxSteps).fill(false));
      this.paramLocks = data.paramLocks ||
        Array.from({ length: this.pads }, () => Array.from({ length: this.maxSteps }, () => ({})));
      this.bpm   = data.bpm   || 90;
      this.swing = data.swing || 0;
      if (data.steps) this.setStepCount(data.steps);

      // Migration bool -> velocity (v1)
      if (Array.isArray(this.grid?.[0]) && typeof this.grid?.[0]?.[0] === 'boolean') {
        this.grid = this.grid.map(row => row.map(on => on ? this.defaultVelocity : 0));
      }
      return true;
    } catch (e) {
      console.error('Erreur import pattern:', e);
      return false;
    }
  }
}
