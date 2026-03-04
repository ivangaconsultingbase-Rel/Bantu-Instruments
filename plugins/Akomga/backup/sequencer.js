/**
 * Sequencer.js
 * Séquenceur 16 steps avec swing
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
    
    // Grille: tableau 2D [pad][step]
    this.grid = Array.from({ length: this.pads }, () => 
      Array(this.steps).fill(false)
    );
    
    // Pour un timing précis avec Web Audio
    this.nextStepTime = 0;
    this.scheduleAheadTime = 0.1; // Secondes
    this.lookahead = 25; // ms
  }

  toggleStep(padId, step) {
    this.grid[padId][step] = !this.grid[padId][step];
    return this.grid[padId][step];
  }

  isStepActive(padId, step) {
    return this.grid[padId][step];
  }

  setBPM(bpm) {
    this.bpm = Math.max(60, Math.min(200, bpm));
  }

  setSwing(swing) {
    this.swing = Math.max(0, Math.min(75, swing));
  }

  getStepDuration() {
    // Durée d'un step en secondes (16 steps = 4 beats = 1 mesure)
    return (60 / this.bpm) / 4;
  }

  getSwingOffset() {
    // Applique le swing sur les steps pairs (2, 4, 6, etc.)
    // Swing = pourcentage de décalage vers le step suivant
    return this.getStepDuration() * (this.swing / 100) * 0.5;
  }

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
      this.onStepChange(-1); // Indicateur d'arrêt
    }
  }

  schedule() {
    if (!this.isPlaying) return;

    const currentTime = this.audioEngine.getCurrentTime();

    // Programmer les steps à venir
    while (this.nextStepTime < currentTime + this.scheduleAheadTime) {
      this.playStep(this.currentStep, this.nextStepTime);
      this.advanceStep();
    }

    // Boucle de scheduling
    this.intervalId = setTimeout(() => this.schedule(), this.lookahead);
  }

  playStep(step, time) {
    // Calcul du swing (les steps impairs sont décalés)
    let playTime = time;
    if (step % 2 === 1) {
      playTime += this.getSwingOffset();
    }

    // Jouer tous les samples actifs sur ce step
    for (let padId = 0; padId < this.pads; padId++) {
      if (this.grid[padId][step]) {
        this.audioEngine.playSample(padId, playTime);
      }
    }

    // Callback pour mise à jour visuelle
    // Utiliser setTimeout pour synchroniser avec le temps audio
    const delay = (playTime - this.audioEngine.getCurrentTime()) * 1000;
    setTimeout(() => {
      if (this.onStepChange && this.isPlaying) {
        this.onStepChange(step);
      }
    }, Math.max(0, delay));
  }

  advanceStep() {
    this.nextStepTime += this.getStepDuration();
    this.currentStep = (this.currentStep + 1) % this.steps;
  }

  clear() {
    this.grid = Array.from({ length: this.pads }, () => 
      Array(this.steps).fill(false)
    );
  }

  // Import/Export de patterns
  exportPattern() {
    return JSON.stringify({
      grid: this.grid,
      bpm: this.bpm,
      swing: this.swing
    });
  }

  importPattern(json) {
    try {
      const data = JSON.parse(json);
      this.grid = data.grid;
      this.bpm = data.bpm || 90;
      this.swing = data.swing || 0;
      return true;
    } catch (e) {
      console.error('Erreur import pattern:', e);
      return false;
    }
  }
}
