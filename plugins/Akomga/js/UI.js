/**
 * UI.js
 * Interface moderne avec support tactile complet (mobile + desktop)
 */

export class UI {
  constructor(audioEngine, sequencer) {
    this.audioEngine = audioEngine;
    this.sequencer = sequencer;

    this.padElements = [];
    this.stepElements = [];

    this.padKeys = ['Q', 'W', 'E', 'A', 'S', 'D'];

    // Optionnel : si ton HTML/CSS utilise des couleurs par ligne
    this.padColors = ['#e63946', '#ff6b35', '#f7c948', '#2ecc71', '#4ecdc4', '#9b59b6'];

    this.isMobile = this.detectMobile();

    // évite le double trigger pointerdown->click sur certains navigateurs
    this._lastPointerDownAt = 0;
  }

  detectMobile() {
    return (
      ('ontouchstart' in window) ||
      (navigator.maxTouchPoints > 0) ||
      window.matchMedia('(hover: none)').matches
    );
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
    if (!hint) return;

    if (this.isMobile) {
      hint.textContent = 'Tap pour jouer · 📁 pour charger un sample';
    } else {
      hint.textContent = 'Clic pour jouer · 📁 ou clic droit pour charger';
    }
  }

  // ---------------------------
  // RENDER
  // ---------------------------

  renderPads() {
    const grid = document.getElementById('pads-grid');
    if (!grid) return;

    grid.innerHTML = '';
    this.padElements = [];

    for (let i = 0; i < 6; i++) {
      const info = this.audioEngine.getSampleInfo(i);

      const pad = document.createElement('div');
      pad.className = 'pad';
      pad.dataset.padId = i;

      pad.innerHTML = `
        <div class="pad-header">
          <span class="pad-number">${i + 1}</span>
          <span class="pad-key">${this.padKeys[i] || ''}</span>
        </div>

        <div class="pad-footer">
          <span class="pad-name">${info?.name || 'EMPTY'}</span>
        </div>

        <button class="pad-load-btn" data-pad-id="${i}" aria-label="Charger sample" type="button">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        </button>

        <input class="pad-file" type="file" accept="audio/*,.wav,.mp3,.ogg,.aac,.m4a,.flac" id="file-${i}">
      `;

      grid.appendChild(pad);
      this.padElements.push(pad);
    }
  }

  renderSequencer() {
    // Header numéroté (si présent)
    const header = document.getElementById('seq-header');
    if (header) {
      header.innerHTML = '';
      for (let step = 0; step < 16; step++) {
        const num = document.createElement('span');
        num.textContent = step + 1;
        header.appendChild(num);
      }
    }

    // Grille
    const grid = document.getElementById('sequencer-grid');
    if (!grid) return;

    grid.innerHTML = '';
    this.stepElements = [];

    for (let padId = 0; padId < 6; padId++) {
      const row = document.createElement('div');
      row.className = 'seq-row';

      const label = document.createElement('div');
      label.className = 'seq-row-label';
      label.textContent = padId + 1;

      // si tu veux des couleurs par ligne
      if (this.padColors?.[padId]) {
        label.style.background = this.padColors[padId];
      }

      row.appendChild(label);

      const stepsContainer = document.createElement('div');
      stepsContainer.className = 'seq-steps';

      const rowSteps = [];
      for (let step = 0; step < 16; step++) {
        const stepEl = document.createElement('button');
        stepEl.className = 'seq-step';
        stepEl.type = 'button';
        stepEl.dataset.padId = padId;
        stepEl.dataset.step = step;

        if (step % 4 === 0) stepEl.classList.add('beat-marker');

        stepsContainer.appendChild(stepEl);
        rowSteps.push(stepEl);
      }

      row.appendChild(stepsContainer);
      grid.appendChild(row);
      this.stepElements.push(rowSteps);
    }
  }

  // ---------------------------
  // EVENTS
  // ---------------------------

  bindEvents() {
    // === PADS (pointer) ===
    const padsGrid = document.getElementById('pads-grid');
    if (padsGrid) {
      padsGrid.addEventListener('pointerdown', (e) => {
        this._lastPointerDownAt = performance.now();

        const loadBtn = e.target.closest('.pad-load-btn');
        if (loadBtn) {
          e.preventDefault();
          e.stopPropagation();
          const padId = parseInt(loadBtn.dataset.padId, 10);
          this.openFilePicker(padId);
          return;
        }

        const pad = e.target.closest('.pad');
        if (pad) {
          const padId = parseInt(pad.dataset.padId, 10);
          this.triggerPad(padId);
        }
      }, { passive: false });

      // Clic droit desktop
      padsGrid.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const pad = e.target.closest('.pad');
        if (!pad) return;
        const padId = parseInt(pad.dataset.padId, 10);
        this.openFilePicker(padId);
      });

      // Fichiers
      padsGrid.querySelectorAll('input[type="file"]').forEach((input, idx) => {
        input.addEventListener('change', async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          await this.handleFileSelect(idx, file);
          e.target.value = ''; // permet de re-sélectionner le même fichier
        });
      });
    }

    // === SEQUENCER (pointer) ===
    const seqGrid = document.getElementById('sequencer-grid');
    if (seqGrid) {
      seqGrid.addEventListener('pointerdown', (e) => {
        const stepEl = e.target.closest('.seq-step');
        if (!stepEl) return;

        const padId = parseInt(stepEl.dataset.padId, 10);
        const step = parseInt(stepEl.dataset.step, 10);

        const isActive = this.sequencer.toggleStep(padId, step);
        stepEl.classList.toggle('active', isActive);

        if (this.isMobile && navigator.vibrate) navigator.vibrate(10);
      });
    }

    // === TRANSPORT ===
    const playBtn = document.getElementById('play-btn');
    const stopBtn = document.getElementById('stop-btn');
    const clearBtn = document.getElementById('clear-btn');

    if (playBtn) playBtn.addEventListener('click', () => this.handlePlayToggle());
    if (stopBtn) stopBtn.addEventListener('click', () => this.handleStop());
    if (clearBtn) clearBtn.addEventListener('click', () => this.handleClear());

    // === TEMPO ===
    const bpmInput = document.getElementById('bpm');
    if (bpmInput) {
      bpmInput.addEventListener('input', (e) => {
        const bpm = parseInt(e.target.value, 10);
        this.sequencer.setBPM(bpm);
        const d1 = document.getElementById('bpm-display');
        const d2 = document.getElementById('bpm-val');
        if (d1) d1.textContent = bpm;
        if (d2) d2.textContent = bpm;
        this.updateSliderFill(e.target);
      });
    }

    const swingInput = document.getElementById('swing');
    if (swingInput) {
      swingInput.addEventListener('input', (e) => {
        const swing = parseInt(e.target.value, 10);
        this.sequencer.setSwing(swing);
        const d1 = document.getElementById('swing-display');
        const d2 = document.getElementById('swing-val');
        if (d1) d1.textContent = swing;
        if (d2) d2.textContent = `${swing}%`;
        this.updateSliderFill(e.target);
      });
    }

    // === EFFECTS ===
    this.bindEffectControl('bit-depth', 'bitDepth', 'bit-depth-val', (v) => v);
    this.bindEffectControl('sample-rate', 'sampleRate', 'sample-rate-val', (v) => `${Math.round(v / 1000)}k`);
    this.bindEffectControl('filter-cutoff', 'filter', 'filter-val', (v) => `${(v / 1000).toFixed(1)}k`);
    this.bindEffectControl('drive', 'drive', 'drive-val', (v) => v);
    this.bindEffectControl('vinyl-noise', 'vinylNoise', 'vinyl-val', (v) => v);
    this.bindEffectControl('compression', 'compression', 'comp-val', (v) => v);

    // === PRESETS (optionnel) ===
    document.querySelectorAll('.preset-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.preset-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.applyPreset(btn.dataset.preset);
      });
    });
  }

  bindEffectControl(inputId, effectParam, displayId, formatFn = (v) => v) {
    const input = document.getElementById(inputId);
    if (!input) return;

    const display = document.getElementById(displayId);

    const apply = () => {
      const raw = Number(input.value);
      // Certains params peuvent être float dans ton engine => on ne force pas parseInt
      this.audioEngine.setEffect(effectParam, raw);

      if (display) display.textContent = formatFn(raw);
      this.updateSliderFill(input);
    };

    input.addEventListener('input', apply);
    // applique une fois au chargement pour synchro UI
    apply();
  }

  bindKeyboard() {
    // Sur mobile, le clavier n’est pas utile + ça peut gêner
    // Mais on peut le laisser actif, c'est sans risque.
    document.addEventListener('keydown', (e) => {
      // évite Space de scroller
      if (e.code === 'Space') e.preventDefault();

      const key = e.key?.toUpperCase?.() || '';
      const padIndex = this.padKeys.indexOf(key);

      if (padIndex !== -1) {
        e.preventDefault();
        this.triggerPad(padIndex);
        return;
      }

      // Space = toggle
      if (e.code === 'Space') {
        this.handlePlayToggle();
      }
    });

    document.addEventListener('keyup', (e) => {
      const key = e.key?.toUpperCase?.() || '';
      const padIndex = this.padKeys.indexOf(key);
      if (padIndex !== -1 && this.padElements[padIndex]) {
        this.padElements[padIndex].classList.remove('active');
      }
    });
  }

  // ---------------------------
  // PAD FILE LOADING
  // ---------------------------

  openFilePicker(padId) {
    const pad = this.padElements[padId];
    if (!pad) return;

    const input = pad.querySelector('input[type="file"]');
    if (!input) return;

    // showPicker si dispo (Chrome/Edge). Sinon click standard.
    try {
      if (typeof input.showPicker === 'function') {
        input.showPicker();
      } else {
        input.click();
      }
    } catch (err) {
      // fallback ultra-safe
      try { input.click(); } catch (_) {}
    }
  }

  async handleFileSelect(padId, file) {
    if (!file) return;

    try {
      await this.audioEngine.loadSampleFromFile(padId, file);
      this.updatePadDisplay(padId);

      // petit feedback
      if (this.isMobile && navigator.vibrate) navigator.vibrate([10, 30, 10]);
    } catch (error) {
      console.error('Erreur chargement sample:', error);
      alert('Format audio non supporté (ou fichier illisible).');
    }
  }

  // ---------------------------
  // TRANSPORT
  // ---------------------------

  handlePlayToggle() {
    const playBtn = document.getElementById('play-btn');

    if (this.sequencer.isPlaying) {
      this.sequencer.stop();
      if (playBtn) playBtn.classList.remove('active');
      this.clearPlayingIndicators();
    } else {
      this.sequencer.start();
      if (playBtn) playBtn.classList.add('active');
    }
  }

  handleStop() {
    const playBtn = document.getElementById('play-btn');
    this.sequencer.stop();
    if (playBtn) playBtn.classList.remove('active');
    this.clearPlayingIndicators();
  }

  handleClear() {
    this.sequencer.clear();
    this.clearAllSteps();
  }

  // ---------------------------
  // SLIDERS "FILLED" (optionnel)
  // ---------------------------

  initSliderFills() {
    // Si ton CSS utilise un custom prop --fill, on le met à jour
    const sliders = document.querySelectorAll('input[type="range"]');
    sliders.forEach((s) => this.updateSliderFill(s));
  }

  updateSliderFill(slider) {
    if (!slider || slider.type !== 'range') return;

    const min = Number(slider.min || 0);
    const max = Number(slider.max || 100);
    const val = Number(slider.value || 0);

    const pct = max === min ? 0 : ((val - min) / (max - min)) * 100;
    slider.style.setProperty('--fill', `${pct}%`);

    // Bonus : si tu styles via background-size
    // slider.style.backgroundSize = `${pct}% 100%`;
  }

  // ---------------------------
  // PRESETS (optionnel)
  // ---------------------------

  applyPreset(presetName) {
    // Tu peux adapter selon ton audioEngine.
    // Ici, on fait un mapping simple et safe.
    const presets = {
      lofi: {
        bitDepth: 10,
        sampleRate: 18000,
        filter: 8000,
        drive: 15,
        vinylNoise: 20,
        compression: 35,
      },
      clean: {
        bitDepth: 16,
        sampleRate: 44100,
        filter: 18000,
        drive: 0,
        vinylNoise: 0,
        compression: 15,
      },
      dirty: {
        bitDepth: 8,
        sampleRate: 12000,
        filter: 4500,
        drive: 35,
        vinylNoise: 35,
        compression: 45,
      },
    };

    const p = presets[presetName];
    if (!p) return;

    Object.entries(p).forEach(([k, v]) => {
      // essaie de set l'effet
      try { this.audioEngine.setEffect(k, v); } catch (_) {}

      // synchro slider si présent
      const mapToInputId = {
        bitDepth: 'bit-depth',
        sampleRate: 'sample-rate',
        filter: 'filter-cutoff',
        drive: 'drive',
        vinylNoise: 'vinyl-noise',
        compression: 'compression',
      };

      const id = mapToInputId[k];
      if (id) {
        const input = document.getElementById(id);
        if (input) {
          input.value = v;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    });
  }

  // ---------------------------
  // AUDIO TRIGGER + DISPLAY
  // ---------------------------

  triggerPad(padId) {
    const pad = this.padElements[padId];
    if (!pad) return;

    // Feedback visuel
    pad.classList.add('active');
    setTimeout(() => pad.classList.remove('active'), 100);

    // LED si présente
    const led = document.getElementById('led');
    if (led) {
      led.classList.add('active');
      setTimeout(() => led.classList.remove('active'), 100);
    }

    // Audio
    this.audioEngine.playSample(padId);
  }

  updatePadDisplay(padId) {
    const info = this.audioEngine.getSampleInfo(padId);
    const pad = this.padElements[padId];
    if (!pad) return;

    const nameEl = pad.querySelector('.pad-name');
    if (nameEl) nameEl.textContent = info?.name || 'EMPTY';
  }

  // ---------------------------
  // SEQUENCER CALLBACKS
  // ---------------------------

  // Callback appelé par le séquenceur
  onStepChange(step) {
    this.clearPlayingIndicators();

    if (step < 0) return;

    for (let padId = 0; padId < 6; padId++) {
      const el = this.stepElements?.[padId]?.[step];
      if (el) el.classList.add('playing');
    }

    const led = document.getElementById('led');
    if (led) {
      led.classList.add('active');
      setTimeout(() => led.classList.remove('active'), 50);
    }
  }

  clearPlayingIndicators() {
    document.querySelectorAll('.seq-step.playing').forEach((el) => el.classList.remove('playing'));
  }

  clearAllSteps() {
    document.querySelectorAll('.seq-step.active').forEach((el) => el.classList.remove('active'));
  }
}
