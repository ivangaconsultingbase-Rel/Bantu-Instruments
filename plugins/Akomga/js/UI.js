/**
 * UI.js
 * Interface moderne avec support tactile complet
 */

export class UI {
  constructor(audioEngine, sequencer) {
    this.audioEngine = audioEngine;
    this.sequencer = sequencer;
    this.padElements = [];
    this.stepElements = [];
    
    this.padKeys = ['Q', 'W', 'E', 'A', 'S', 'D'];
    this.isMobile = this.detectMobile();
  }

  detectMobile() {
    return (('ontouchstart' in window) || 
            (navigator.maxTouchPoints > 0) || 
            window.matchMedia('(hover: none)').matches);
  }

  init() {
    this.renderPads();
    this.renderSequencer();
    this.bindEvents();
    this.bindKeyboard();
    this.initSliderFills();
    this.updateHints();
  }

  updateHints() {
    const hint = document.getElementById('pad-hint');
    if (this.isMobile) {
      hint.textContent = 'Tap pour jouer · 📁 pour charger un sample';
    } else {
      hint.textContent = 'Clic pour jouer · 📁 ou clic droit pour charger';
    }
  }

  renderPads() {
    const grid = document.getElementById('pads-grid');
    grid.innerHTML = '';

    for (let i = 0; i < 6; i++) {
      const info = this.audioEngine.getSampleInfo(i);
      
      const pad = document.createElement('div');
      pad.className = 'pad';
      pad.dataset.padId = i;
      
      pad.innerHTML = `
        <div class="pad-header">
          <span class="pad-number">${i + 1}</span>
          <span class="pad-key">${this.padKeys[i]}</span>
        </div>
        <div class="pad-footer">
          <span class="pad-name">${info?.name || 'EMPTY'}</span>
        </div>
        <button class="pad-load-btn" data-pad-id="${i}" aria-label="Charger sample">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        </button>
        <input type="file" accept="audio/*,.wav,.mp3,.ogg,.aac,.m4a,.flac" id="file-${i}">
      `;
      
      grid.appendChild(pad);
      this.padElements.push(pad);
    }
  }

  renderSequencer() {
    // Header avec numéros de steps
    const header = document.getElementById('seq-header');
    header.innerHTML = '';
    
    for (let step = 0; step < 16; step++) {
      const num = document.createElement('span');
      num.textContent = step + 1;
      header.appendChild(num);
    }

    // Grille
    const grid = document.getElementById('sequencer-grid');
    grid.innerHTML = '';
    this.stepElements = [];

    for (let padId = 0; padId < 6; padId++) {
      const row = document.createElement('div');
      row.className = 'seq-row';
      
      // Label
      const label = document.createElement('div');
      label.className = 'seq-row-label';
      label.textContent = padId + 1;
      row.appendChild(label);

      // Container des steps
      const stepsContainer = document.createElement('div');
      stepsContainer.className = 'seq-steps';

      const rowSteps = [];
      for (let step = 0; step < 16; step++) {
        const stepEl = document.createElement('button');
        stepEl.className = 'seq-step';
        stepEl.dataset.padId = padId;
        stepEl.dataset.step = step;
        
        if (step % 4 === 0) {
          stepEl.classList.add('beat-marker');
        }
        
        stepsContainer.appendChild(stepEl);
        rowSteps.push(stepEl);
      }
      
      row.appendChild(stepsContainer);
      grid.appendChild(row);
      this.stepElements.push(rowSteps);
    }
  }

  bindEvents() {
    // === PADS — Touch et Click combinés ===
    const padsGrid = document.getElementById('pads-grid');
    
    // Gestion unifiée touch/click pour les pads
    padsGrid.addEventListener('pointerdown', (e) => {
      const pad = e.target.closest('.pad');
      const loadBtn = e.target.closest('.pad-load-btn');
      
      // Si c'est le bouton de chargement
      if (loadBtn) {
        e.preventDefault();
        e.stopPropagation();
        const padId = parseInt(loadBtn.dataset.padId);
        this.openFilePicker(padId);
        return;
      }
      
      // Si c'est le pad lui-même
      if (pad && !loadBtn) {
        const padId = parseInt(pad.dataset.padId);
        this.triggerPad(padId);
      }
    });

    // Clic droit pour desktop
    padsGrid.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const pad = e.target.closest('.pad');
      if (pad) {
        const padId = parseInt(pad.dataset.padId);
        this.openFilePicker(padId);
      }
    });

    // Gestion du chargement de fichier
    padsGrid.querySelectorAll('input[type="file"]').forEach((input, idx) => {
      input.addEventListener('change', async (e) => {
        await this.handleFileSelect(idx, e.target.files[0]);
        e.target.value = ''; // Reset pour permettre le même fichier
      });
    });

    // === SÉQUENCEUR ===
    const seqGrid = document.getElementById('sequencer-grid');
    seqGrid.addEventListener('pointerdown', (e) => {
      const stepEl = e.target.closest('.seq-step');
      if (!stepEl) return;
      
      const padId = parseInt(stepEl.dataset.padId);
      const step = parseInt(stepEl.dataset.step);
      
      const isActive = this.sequencer.toggleStep(padId, step);
      stepEl.classList.toggle('active', isActive);
      
      // Feedback haptique sur mobile
      if (this.isMobile && navigator.vibrate) {
        navigator.vibrate(10);
      }
    });

    // === TRANSPORT ===
    document.getElementById('play-btn').addEventListener('click', () => this.handlePlay());
    document.getElementById('stop-btn').addEventListener('click', () => this.handleStop());
    document.getElementById('clear-btn').addEventListener('click', () => this.handleClear());

    // === TEMPO ===
    document.getElementById('bpm').addEventListener('input', (e) => {
      const bpm = parseInt(e.target.value);
      this.sequencer.setBPM(bpm);
      document.getElementById('bpm-display').textContent = bpm;
      document.getElementById('bpm-val').textContent = bpm;
    });

    document.getElementById('swing').addEventListener('input', (e) => {
      const swing = parseInt(e.target.value);
      this.sequencer.setSwing(swing);
      document.getElementById('swing-display').textContent = swing;
      document.getElementById('swing-val').textContent = `${swing}%`;
    });

    // === EFFETS ===
    this.bindEffectControl('bit-depth', 'bitDepth', 'bit-depth-val', v => v);
    this.bindEffectControl('sample-rate', 'sampleRate', 'sample-rate-val', v => `${Math.round(v/1000)}k`);
    this.bindEffectControl('filter-cutoff', 'filter', 'filter-val', v => `${(v/1000).toFixed(1)}k`);
    this.bindEffectControl('drive', 'drive', 'drive-val', v => v);
    this.bindEffectControl('vinyl-noise', 'vinylNoise', 'vinyl-val', v => v);
    this.bindEffectControl('compression', 'compression', 'comp-val', v => v);

    // === PRESETS ===
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.applyPreset(btn.dataset.preset);
      });
    });
  }

  bindEffectControl
