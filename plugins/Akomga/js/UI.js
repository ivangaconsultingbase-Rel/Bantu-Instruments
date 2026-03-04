/**
 * UI.js
 * Version SAFE : compatible CSS "ancienne structure"
 * - Pads en <button class="pad"> (pas <div>)
 * - Séquenceur "flat grid" (label + 16 boutons directement dans #sequencer-grid)
 *
 * + Support tactile (pointer events)
 * + Bouton 📁 + clic droit pour charger
 * + Slider fill divs
 * + Presets
 * + Sélection pad + Pitch/Volume (Alt+clic desktop / appui long mobile)
 *
 * Requis côté HTML (Pad Editor) :
 *  - #pad-editor (section) + #pad-edit-id + #pad-edit-name
 *  - #pad-pitch + #pad-pitch-val + #pad-pitch-fill
 *  - #pad-vol + #pad-vol-val + #pad-vol-fill
 *
 * Requis côté AudioEngine :
 *  - getPadParams(padId) -> { pitch, volume }
 *  - setPadPitch(padId, semitones)
 *  - setPadVolume(padId, volume01)
 */

export class UI {
  constructor(audioEngine, sequencer) {
    this.audioEngine = audioEngine;
    this.sequencer = sequencer;

    this.padElements = [];
    this.stepElements = []; // [padId][step]

    this.padKeys = ['Q', 'W', 'E', 'A', 'S', 'D'];
    this.padColors = ['#e63946', '#ff6b35', '#f7c948', '#2ecc71', '#4ecdc4', '#9b59b6'];

    this.isMobile = this.detectMobile();

    // Pad edit
    this.selectedPadId = 0;
    this._longPressTimer = null;
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

    const activePreset = document.querySelector('.preset-btn.active')?.dataset?.preset;
    if (activePreset) this.applyPreset(activePreset);

    // sélection par défaut si pad editor présent
    this.selectPad(0);
  }

  updateHints() {
    const hint = document.getElementById('pad-hint');
    if (!hint) return;

    hint.textContent = this.isMobile
      ? 'Tap pour jouer · 📁 pour charger · appui long pour éditer'
      : 'Clic pour jouer · 📁 ou clic droit pour charger · Alt+clic pour éditer';
  }

  // ---------------------------
  // RENDER (SAFE DOM)
  // ---------------------------

  renderPads() {
    // Ton HTML a .pads-grid + #pads-grid : on accepte les deux
    const grid = document.querySelector('.pads-grid') || document.getElementById('pads-grid');
    if (!grid) {
      console.error('[UI] pads grid introuvable (#pads-grid/.pads-grid).');
      return;
    }

    grid.innerHTML = '';
    this.padElements = [];

    for (let i = 0; i < 6; i++) {
      const info = this.audioEngine.getSampleInfo(i);

      // IMPORTANT: button.pad (compatible CSS ancien)
      const pad = document.createElement('button');
      pad.className = 'pad';
      pad.type = 'button';
      pad.dataset.padId = i;

      // IMPORTANT: on garde les classes "pad-number/pad-name/pad-key"
      pad.innerHTML = `
        <span class="pad-number">${i + 1}</span>
        <span class="pad-name">${info?.name || 'EMPTY'}</span>
        <span class="pad-key">${this.padKeys[i] || ''}</span>

        <button class="pad-load-btn" data-pad-id="${i}" aria-label="Charger sample" type="button" title="Charger sample">📁</button>
        <input type="file" class="pad-file" accept="audio/*,.wav,.mp3,.ogg,.aac,.m4a,.flac" id="file-${i}">
      `;

      grid.appendChild(pad);
      this.padElements.push(pad);
    }
  }

  renderSequencer() {
    // Header numéros (optionnel)
    const header = document.getElementById('seq-header');
    if (header) {
      header.innerHTML = '';
      for (let step = 0; step < 16; step++) {
        const num = document.createElement('span');
        num.textContent = step + 1;
        header.appendChild(num);
      }
    }

    // IMPORTANT: séquenceur "flat grid"
    const grid = document.getElementById('sequencer-grid');
    if (!grid) {
      console.error('[UI] sequencer grid introuvable (#sequencer-grid).');
      return;
    }

    grid.innerHTML = '';
    this.stepElements = [];

    for (let padId = 0; padId < 6; padId++) {
      const label = document.createElement('div');
      label.className = 'seq-row-label';
      label.textContent = padId + 1;
      label.style.background = this.padColors[padId] || '';
      grid.appendChild(label);

      const rowSteps = [];
      for (let step = 0; step < 16; step++) {
        const stepEl = document.createElement('button');
        stepEl.className = 'seq-step';
        stepEl.type = 'button';
        stepEl.dataset.padId = padId;
        stepEl.dataset.step = step;

        if (step % 4 === 0) stepEl.classList.add('beat-marker');

        grid.appendChild(stepEl);
        rowSteps.push(stepEl);
      }
      this.stepElements.push(rowSteps);
    }
  }

  // ---------------------------
  // EVENTS
  // ---------------------------

  bindEvents() {
    // === PADS ===
    const padsGrid = document.querySelector('.pads-grid') || document.getElementById('pads-grid');
    if (padsGrid) {
      padsGrid.addEventListener(
        'pointerdown',
        (e) => {
          // Click sur 📁
          const loadBtn = e.target.closest('.pad-load-btn');
          if (loadBtn) {
            e.preventDefault();
            e.stopPropagation();
            const padId = parseInt(loadBtn.dataset.padId, 10);
            this.openFilePicker(padId);
            return;
          }

          const pad = e.target.closest('.pad');
          if (!pad) return;

          const padId = parseInt(pad.dataset.padId, 10);

          // Desktop: Alt+clic = sélectionner/éditer
          if (!this.isMobile && e.altKey) {
            e.preventDefault();
            this.selectPad(padId);
            return;
          }

          // Mobile: appui long = sélectionner/éditer
          if (this.isMobile) {
            clearTimeout(this._longPressTimer);
            this._longPressTimer = setTimeout(() => {
              this.selectPad(padId);
              if (navigator.vibrate) navigator.vibrate(15);
            }, 350);
          }

          // Tap normal = play
          this.triggerPad(padId);
        },
        { passive: false }
      );

      const cancelLong = () => clearTimeout(this._longPressTimer);
      padsGrid.addEventListener('pointerup', cancelLong);
      padsGrid.addEventListener('pointercancel', cancelLong);
      padsGrid.addEventListener('pointerleave', cancelLong);

      // Clic droit desktop = charger
      padsGrid.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const pad = e.target.closest('.pad');
        if (!pad) return;
        const padId = parseInt(pad.dataset.padId, 10);
        this.openFilePicker(padId);
      });

      // File inputs
      padsGrid.querySelectorAll('input[type="file"]').forEach((input, idx) => {
        input.addEventListener('change', async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;

          await this.handleFileSelect(idx, file);
          e.target.value = '';

          // refresh editor si pad sélectionné
          if (idx === this.selectedPadId) this.selectPad(idx);
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
      document.getElementById('bpm-display')?.textContent = bpm;
      document.getElementById('bpm-val')?.textContent = bpm;
    });

    document.getElementById('swing')?.addEventListener('input', (e) => {
      const swing = parseInt(e.target.value, 10);
      this.sequencer.setSwing(swing);
      document.getElementById('swing-display')?.textContent = swing;
      document.getElementById('swing-val')?.textContent = `${swing}%`;
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

    // === PAD EDITOR (Pitch/Volume) ===
    document.getElementById('pad-pitch')?.addEventListener('input', (e) => {
      const st = parseInt(e.target.value, 10) || 0;
      this.audioEngine.setPadPitch?.(this.selectedPadId, st);
      this.updatePadPitchDisplay();
      this.updateSliderFillByInputId('pad-pitch');
    });

    document.getElementById('pad-vol')?.addEventListener('input', (e) => {
      const pct = parseInt(e.target.value, 10) || 0;
      const vol01 = Math.max(0, Math.min(1, pct / 100));
      this.audioEngine.setPadVolume?.(this.selectedPadId, vol01);
      this.updatePadVolDisplay();
      this.updateSliderFillByInputId('pad-vol');
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
      this.updateSliderFillByInputId(inputId);
    };

    input.addEventListener('input', apply);
    apply();
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
  // SLIDER FILLS
  // ---------------------------

  initSliderFills() {
    [
      'bit-depth',
      'sample-rate',
      'filter-cutoff',
      'drive',
      'vinyl-noise',
      'compression',
      'pad-pitch',
      'pad-vol',
    ].forEach((id) => this.updateSliderFillByInputId(id));
  }

  updateSliderFillByInputId(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;

    const fillMap = {
      'bit-depth': 'bit-depth-fill',
      'sample-rate': 'sample-rate-fill',
      'filter-cutoff': 'filter-fill',
      'drive': 'drive-fill',
      'vinyl-noise': 'vinyl-fill',
      'compression': 'comp-fill',

      // Pad editor
      'pad-pitch': 'pad-pitch-fill',
      'pad-vol': 'pad-vol-fill',
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
  // PRESETS
  // ---------------------------

  applyPreset(presetName) {
    const presets = {
      SP1200: { bitDepth: 12, sampleRate: 26040, filter: 5500, drive: 25, vinylNoise: 15, compression: 50 },
      MPC60: { bitDepth: 12, sampleRate: 32000, filter: 9000, drive: 15, vinylNoise: 8, compression: 35 },
      Dirty:  { bitDepth: 8,  sampleRate: 12000, filter: 4500, drive: 45, vinylNoise: 35, compression: 55 },
      Clean:  { bitDepth: 16, sampleRate: 44100, filter: 12000, drive: 5,  vinylNoise: 0,  compression: 20 },
    };

    const p = presets[presetName];
    if (!p) return;

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
  // PAD EDITOR
  // ---------------------------

  selectPad(padId) {
    this.selectedPadId = padId;

    // highlight optionnel (CSS .pad.selected)
    this.padElements.forEach((p, i) => p.classList.toggle('selected', i === padId));

    const editor = document.getElementById('pad-editor');
    if (editor) editor.hidden = false;

    const info = this.audioEngine.getSampleInfo(padId);
    document.getElementById('pad-edit-id')?.textContent = String(padId + 1);
    document.getElementById('pad-edit-name')?.textContent = info?.name || 'EMPTY';

    const params = this.audioEngine.getPadParams?.(padId) || { pitch: 0, volume: 0.8 };

    const pitchInput = document.getElementById('pad-pitch');
    const volInput = document.getElementById('pad-vol');

    if (pitchInput) {
      pitchInput.value = String(params.pitch ?? 0);
      this.updatePadPitchDisplay();
      this.updateSliderFillByInputId('pad-pitch');
    }

    if (volInput) {
      volInput.value = String(Math.round((params.volume ?? 0.8) * 100));
      this.updatePadVolDisplay();
      this.updateSliderFillByInputId('pad-vol');
    }
  }

  updatePadPitchDisplay() {
    const pitchInput = document.getElementById('pad-pitch');
    const valEl = document.getElementById('pad-pitch-val');
    if (!pitchInput || !valEl) return;
    const st = parseInt(pitchInput.value, 10) || 0;
    valEl.textContent = `${st} st`;
  }

  updatePadVolDisplay() {
    const volInput = document.getElementById('pad-vol');
    const valEl = document.getElementById('pad-vol-val');
    if (!volInput || !valEl) return;
    const pct = parseInt(volInput.value, 10) || 0;
    valEl.textContent = `${pct}%`;
  }

  // ---------------------------
  // PLAY + UI FEEDBACK
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
