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
    this.padColors = ['#e63946', '#ff6b35', '#f7c948', '#2ecc71', '#4ecdc4', '#9b59b6'];

    this.isMobile = this.detectMobile();
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

    // Optionnel : si tu veux appliquer le preset actif au chargement
    const activePreset = document.querySelector('.preset-btn.active')?.dataset?.preset;
    if (activePreset) this.applyPreset(activePreset);
  }

  updateHints() {
    const hint = document.getElementById('pad-hint');
    if (!hint) return;

    hint.textContent = this.isMobile
      ? 'Tap pour jouer · 📁 pour charger'
      : 'Clic pour jouer · 📁 ou clic droit pour charger';
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

        <input class="pad-file" type="file"
          accept="audio/*,.wav,.mp3,.ogg,.aac,.m4a,.flac"
          id="file-${i}">
      `;

      grid.appendChild(pad);
      this.padElements.push(pad);
    }
  }

  renderSequencer() {
    const header = document.getElementById('seq-header');
    if (header) {
      header.innerHTML = '';
      for (let step = 0; step < 16; step++) {
        const num = document.createElement('span');
        num.textContent = step + 1;
        header.appendChild(num);
      }
    }

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
      if (this.padColors?.[padId]) label.style.background = this.padColors[padId];
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
    // === PADS ===
    const padsGrid = document.getElementById('pads-grid');
    if (padsGrid) {
      padsGrid.addEventListener('pointerdown', (e) => {
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

      padsGrid.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const pad = e.target.closest('.pad');
        if (!pad) return;
        const padId = parseInt(pad.dataset.padId, 10);
        this.openFilePicker(padId);
      });

      padsGrid.querySelectorAll('input[type="file"]').forEach((input, idx) => {
        input.addEventListener('change', async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          await this.handleFileSelect(idx, file);
          e.target.value = '';
        });
      });
    }

    // === SEQUENCER ===
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
    document.getElementById('play-btn')?.addEventListener('click', () => this.handlePlayToggle());
    document.getElementById('stop-btn')?.addEventListener('click', () => this.handleStop());
    document.getElementById('clear-btn')?.addEventListener('click', () => this.handleClear());

    // === TEMPO ===
    document.getElementById('bpm')?.addEventListener('input', (e) => {
      const bpm = parseInt(e.target.value, 10);
      this.sequencer.setBPM(bpm);
      document.getElementById('bpm-display').textContent = bpm;
      document.getElementById('bpm-val').textContent = bpm;
      this.updateSliderFillByInputId('bpm'); // si tu ajoutes un fill plus tard
    });

    document.getElementById('swing')?.addEventListener('input', (e) => {
      const swing = parseInt(e.target.value, 10);
      this.sequencer.setSwing(swing);
      document.getElementById('swing-display').textContent = swing;
      document.getElementById('swing-val').textContent = `${swing}%`;
      this.updateSliderFillByInputId('swing'); // si tu ajoutes un fill plus tard
    });

    // === EFFECTS ===
    this.bindEffectControl('bit-depth', 'bitDepth', 'bit-depth-val', (v) => `${Math.round(v)}`);
    this.bindEffectControl('sample-rate', 'sampleRate', 'sample-rate-val', (v) => `${Math.round(v / 1000)}k`);
    this.bindEffectControl('filter-cutoff', 'filter', 'filter-val', (v) => `${(v / 1000).toFixed(1)}k`);
    this.bindEffectControl('drive', 'drive', 'drive-val', (v) => `${Math.round(v)}`);
    this.bindEffectControl('vinyl-noise', 'vinylNoise', 'vinyl-val', (v) => `${Math.round(v)}`);
    this.bindEffectControl('compression', 'compression', 'comp-val', (v) => `${Math.round(v)}`);

    // === PRESETS ===
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
      this.audioEngine.setEffect(effectParam, raw);

      if (display) display.textContent = formatFn(raw);

      // met à jour ta div slider-fill correspondante
      this.updateSliderFillByInputId(inputId);
    };

    input.addEventListener('input', apply);
    apply(); // synchro initiale
  }

  bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      const key = (e.key || '').toUpperCase();
      const padIndex = this.padKeys.indexOf(key);

      if (padIndex !== -1) {
        e.preventDefault();
        this.triggerPad(padIndex);
      }

      if (e.code === 'Space') {
        e.preventDefault();
        this.handlePlayToggle();
      }
    });

    document.addEventListener('keyup', (e) => {
      const key = (e.key || '').toUpperCase();
      const padIndex = this.padKeys.indexOf(key);
      if (padIndex !== -1 && this.padElements[padIndex]) {
        this.padElements[padIndex].classList.remove('active');
      }
    });
  }

  // ---------------------------
  // FILE LOADING
  // ---------------------------

  openFilePicker(padId) {
    const pad = this.padElements[padId];
    if (!pad) return;

    const input = pad.querySelector('input[type="file"]');
    if (!input) return;

    try {
      if (typeof input.showPicker === 'function') input.showPicker();
      else input.click();
    } catch {
      try { input.click(); } catch {}
    }
  }

  async handleFileSelect(padId, file) {
    try {
      await this.audioEngine.loadSampleFromFile(padId, file);
      this.updatePadDisplay(padId);
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
      playBtn?.classList.remove('active');
      this.clearPlayingIndicators();
    } else {
      this.sequencer.start();
      playBtn?.classList.add('active');
    }
  }

  handleStop() {
    const playBtn = document.getElementById('play-btn');
    this.sequencer.stop();
    playBtn?.classList.remove('active');
    this.clearPlayingIndicators();
  }

  handleClear() {
    this.sequencer.clear();
    this.clearAllSteps();
  }

  // ---------------------------
  // SLIDER FILLS (ta structure HTML)
  // ---------------------------

  initSliderFills() {
    // On calcule toutes les barres au chargement
    const ids = [
      'bit-depth',
      'sample-rate',
      'filter-cutoff',
      'drive',
      'vinyl-noise',
      'compression',
      // bpm/swing n'ont pas de <div fill> dans ton HTML actuel (OK)
    ];
    ids.forEach((id) => this.updateSliderFillByInputId(id));
  }

  updateSliderFillByInputId(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;

    // mapping des ids -> fill ids (selon ton index.html)
    const fillMap = {
      'bit-depth': 'bit-depth-fill',
      'sample-rate': 'sample-rate-fill',
      'filter-cutoff': 'filter-fill',
      'drive': 'drive-fill',
      'vinyl-noise': 'vinyl-fill',
      'compression': 'comp-fill',
      // si tu ajoutes plus tard:
      // 'bpm': 'bpm-fill',
      // 'swing': 'swing-fill',
    };

    const fillId = fillMap[inputId];
    if (!fillId) return;

    const fill = document.getElementById(fillId);
    if (!fill) return;

    const min = Number(input.min ?? 0);
    const max = Number(input.max ?? 100);
    const val = Number(input.value ?? 0);
    const pct = max === min ? 0 : ((val - min) / (max - min)) * 100;

    fill.style.width = `${pct}%`;
  }

  // ---------------------------
  // PRESETS (alignés sur ton HTML)
  // ---------------------------

  setSliderValueAndFire(inputId, value) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

applyPreset(presetName) {
  const presets = {
    SP1200: {
      bitDepth: 12,
      sampleRate: 26040,
      filter: 5500,
      drive: 25,
      vinylNoise: 15,
      compression: 50,
    },
    MPC60: {
      bitDepth: 12,
      sampleRate: 32000,
      filter: 9000,
      drive: 15,
      vinylNoise: 8,
      compression: 35,
    },
    Dirty: {
      bitDepth: 8,
      sampleRate: 12000,
      filter: 4500,
      drive: 45,
      vinylNoise: 35,
      compression: 55,
    },
    Clean: {
      bitDepth: 16,
      sampleRate: 44100,
      filter: 12000,
      drive: 5,
      vinylNoise: 0,
      compression: 20,
    },
  };

  const p = presets[presetName];
  if (!p) return;

  // 1) Appliquer dans l'audio engine (noms EXACTS de ton switch)
  Object.entries(p).forEach(([param, value]) => {
    try {
      this.audioEngine.setEffect(param, value);
    } catch (e) {
      console.warn('Preset: setEffect failed for', param, e);
    }
  });

  // 2) Synchro UI sliders + labels via les events "input" déjà branchés
  this.setSliderValueAndFire('bit-depth', p.bitDepth);
  this.setSliderValueAndFire('sample-rate', p.sampleRate);
  this.setSliderValueAndFire('filter-cutoff', p.filter);
  this.setSliderValueAndFire('drive', p.drive);
  this.setSliderValueAndFire('vinyl-noise', p.vinylNoise);
  this.setSliderValueAndFire('compression', p.compression);
}
    // setEffect + synchro sliders (en réutilisant les listeners existants via dispatch input)
    const mapToInputId = {
      bitDepth: 'bit-depth',
      sampleRate: 'sample-rate',
      filter: 'filter-cutoff',
      drive: 'drive',
      vinylNoise: 'vinyl-noise',
      compression: 'compression',
    };

    Object.entries(p).forEach(([param, value]) => {
      try { this.audioEngine.setEffect(param, value); } catch {}

      const inputId = mapToInputId[param];
      const input = inputId ? document.getElementById(inputId) : null;
      if (input) {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  }

  // ---------------------------
  // PAD TRIGGER + DISPLAY
  // ---------------------------

  triggerPad(padId) {
    const pad = this.padElements[padId];
    if (!pad) return;

    pad.classList.add('active');
    setTimeout(() => pad.classList.remove('active'), 100);

    const led = document.getElementById('led');
    led?.classList.add('active');
    setTimeout(() => led?.classList.remove('active'), 100);

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
  // SEQUENCER CALLBACK
  // ---------------------------

  onStepChange(step) {
    this.clearPlayingIndicators();
    if (step < 0) return;

    for (let padId = 0; padId < 6; padId++) {
      const el = this.stepElements?.[padId]?.[step];
      if (el) el.classList.add('playing');
    }

    const led = document.getElementById('led');
    led?.classList.add('active');
    setTimeout(() => led?.classList.remove('active'), 50);
  }

  clearPlayingIndicators() {
    document.querySelectorAll('.seq-step.playing').forEach((el) => el.classList.remove('playing'));
  }

  clearAllSteps() {
    document.querySelectorAll('.seq-step.active').forEach((el) => el.classList.remove('active'));
  }
}
