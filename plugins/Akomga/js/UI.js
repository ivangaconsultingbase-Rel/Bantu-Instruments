/**
 * UI.js
 * Gestion de l'interface utilisateur
 */

export class UI {
  constructor(audioEngine, sequencer) {
    this.audioEngine = audioEngine;
    this.sequencer = sequencer;
    this.padElements = [];
    this.stepElements = [];
    
    this.padKeys = ['Q', 'W', 'E', 'A', 'S', 'D'];
    this.padColors = ['#e63946', '#ff6b35', '#f7c948', '#2ecc71', '#4ecdc4', '#9b59b6'];
  }

  init() {
    this.renderPads();
    this.renderSequencer();
    this.bindEvents();
    this.bindKeyboard();
  }

  renderPads() {
    const grid = document.querySelector('.pads-grid');
    grid.innerHTML = '';

    for (let i = 0; i < 6; i++) {
      const pad = document.createElement('button');
      pad.className = 'pad';
      pad.dataset.padId = i;
      
      const info = this.audioEngine.getSampleInfo(i);
      
      pad.innerHTML = `
        <span class="pad-number">${i + 1}</span>
        <span class="pad-name">${info?.name || 'EMPTY'}</span>
        <span class="pad-key">${this.padKeys[i]}</span>
        <input type="file" accept="audio/*" id="file-${i}">
      `;
      
      grid.appendChild(pad);
      this.padElements.push(pad);
    }
  }

  renderSequencer() {
    const grid = document.getElementById('sequencer-grid');
    grid.innerHTML = '';
    
    this.stepElements = [];

    for (let padId = 0; padId < 6; padId++) {
      // Label de la ligne (numéro du pad)
      const label = document.createElement('div');
      label.className = 'seq-row-label';
      label.style.background = this.padColors[padId];
      label.textContent = padId + 1;
      grid.appendChild(label);

      // Steps
      const rowSteps = [];
      for (let step = 0; step < 16; step++) {
        const stepEl = document.createElement('button');
        stepEl.className = 'seq-step';
        stepEl.dataset.padId = padId;
        stepEl.dataset.step = step;
        
        // Marqueurs de temps forts (1, 5, 9, 13)
        if (step % 4 === 0) {
          stepEl.classList.add('beat-marker');
        }
        
        grid.appendChild(stepEl);
        rowSteps.push(stepEl);
      }
      this.stepElements.push(rowSteps);
    }
  }

  bindEvents() {
    // === PADS ===
    document.querySelector('.pads-grid').addEventListener('click', (e) => {
      const pad = e.target.closest('.pad');
      if (!pad) return;
      
      const padId = parseInt(pad.dataset.padId);
      this.triggerPad(padId);
    });

    // Clic droit pour charger un sample
    document.querySelector('.pads-grid').addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const pad = e.target.closest('.pad');
      if (!pad) return;
      
      const padId = parseInt(pad.dataset.padId);
      const fileInput = pad.querySelector('input[type="file"]');
      fileInput.click();
    });

    // Gestion du chargement de fichier
    document.querySelectorAll('.pads-grid input[type="file"]').forEach((input, idx) => {
      input.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
          await this.audioEngine.loadSampleFromFile(idx, file);
          this.updatePadDisplay(idx);
        } catch (error) {
          console.error('Erreur chargement sample:', error);
          alert('Format audio non supporté');
        }
      });
    });

    // === SÉQUENCEUR ===
    document.getElementById('sequencer-grid').addEventListener('click', (e) => {
      const stepEl = e.target.closest('.seq-step');
      if (!stepEl) return;
      
      const padId = parseInt(stepEl.dataset.padId);
      const step = parseInt(stepEl.dataset.step);
      
      const isActive = this.sequencer.toggleStep(padId, step);
      stepEl.classList.toggle('active', isActive);
    });

    // === TRANSPORT ===
    document.getElementById('play-btn').addEventListener('click', () => {
      this.sequencer.start();
      document.getElementById('play-btn').classList.add('active');
    });

    document.getElementById('stop-btn').addEventListener('click', () => {
      this.sequencer.stop();
      document.getElementById('play-btn').classList.remove('active');
      this.clearPlayingIndicators();
    });

    document.getElementById('clear-btn').addEventListener('click', () => {
      this.sequencer.clear();
      this.clearAllSteps();
    });

    // === TEMPO ===
    document.getElementById('bpm').addEventListener('input', (e) => {
      const bpm = parseInt(e.target.value);
      this.sequencer.setBPM(bpm);
      document.getElementById('bpm-display').textContent = bpm;
    });

    document.getElementById('swing').addEventListener('input', (e) => {
      const swing = parseInt(e.target.value);
      this.sequencer.setSwing(swing);
      document.getElementById('swing-display').textContent = swing;
    });

    // === EFFETS ===
    this.bindEffectControl('bit-depth', 'bitDepth', 'bit-depth-val');
    this.bindEffectControl('sample-rate', 'sampleRate', 'sample-rate-val');
    this.bindEffectControl('filter-cutoff', 'filter', 'filter-val');
    this.bindEffectControl('drive', 'drive', 'drive-val');
    this.bindEffectControl('vinyl-noise', 'vinylNoise', 'vinyl-val');
    this.bindEffectControl('compression', 'compression', 'comp-val');
  }

  bindEffectControl(inputId, effectParam, displayId) {
    const input = document.getElementById(inputId);
    const display = document.getElementById(displayId);
    
    input.addEventListener('input', (e) => {
      const value = parseInt(e.target.value);
      this.audioEngine.setEffect(effectParam, value);
      display.textContent = value;
    });
  }

  bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      const key = e.key.toUpperCase();
      const padIndex = this.padKeys.indexOf(key);
      
      if (padIndex !== -1) {
        e.preventDefault();
        this.triggerPad(padIndex);
      }
      
      // Espace = Play/Stop
      if (e.code === 'Space') {
        e.preventDefault();
        if (this.sequencer.isPlaying) {
          this.sequencer.stop();
          document.getElementById('play-btn').classList.remove('active');
          this.clearPlayingIndicators();
        } else {
          this.sequencer.start();
          document.getElementById('play-btn').classList.add('active');
        }
      }
    });

    document.addEventListener('keyup', (e) => {
      const key = e.key.toUpperCase();
      const padIndex = this.padKeys.indexOf(key);
      
      if (padIndex !== -1) {
        this.padElements[padIndex].classList.remove('active');
      }
    });
  }

  triggerPad(padId) {
    // Feedback visuel
    this.padElements[padId].classList.add('active');
    setTimeout(() => {
      this.padElements[padId].classList.remove('active');
    }, 100);

    // LED
    const led = document.getElementById('led');
    led.classList.add('active');
    setTimeout(() => led.classList.remove('active'), 100);

    // Audio
    this.audioEngine.playSample(padId);
  }

  updatePadDisplay(padId) {
    const info = this.audioEngine.getSampleInfo(padId);
    const nameEl = this.padElements[padId].querySelector('.pad-name');
    nameEl.textContent = info?.name || 'EMPTY';
  }

  // Callback appelé par le séquenceur
  onStepChange(step) {
    // Effacer l'indicateur précédent
    this.clearPlayingIndicators();
    
    if (step < 0) return; // Arrêt
    
    // Afficher l'indicateur sur la colonne active
    for (let padId = 0; padId < 6; padId++) {
      this.stepElements[padId][step].classList.add('playing');
    }

    // LED
    const led = document.getElementById('led');
    led.classList.add('active');
    setTimeout(() => led.classList.remove('active'), 50);
  }

  clearPlayingIndicators() {
    document.querySelectorAll('.seq-step.playing').forEach(el => {
      el.classList.remove('playing');
    });
  }

  clearAllSteps() {
    document.querySelectorAll('.seq-step.active').forEach(el => {
      el.classList.remove('active');
    });
  }
}
