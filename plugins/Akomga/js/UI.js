/**
 * UI.js
 * Interface moderne (mobile + desktop)
 * FIX iOS:
 * - MET/REC: pointerup + touchend (pas seulement click)
 * - HUMAN/TIMING: input + change + pointerup/touchend
 * - resume() sur toutes les interactions critiques
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

    // Pad editor
    this.selectedPadId = 0;

    // Long-press pad (mobile)
    this._lpTimer = null;
    this._lpTriggered = false;
    this._pendingPadId = null;

    // Steps: robust touch tracking
    this._downStep = { padId: null, step: null, el: null };
    this._stepLpTimer = null;
    this._stepLpTriggered = false;

    // Mobile: double-tap detection for Accent
    this._lastTap = { padId: null, step: null, t: 0 };

    // Anti double-trigger (pointerup + touchend)
    this._tapGuard = new WeakMap();
  }

  // ---------- DOM helpers ----------
  $(id) {
    return document.getElementById(id);
  }

  setText(id, value) {
    const el = this.$(id);
    if (el) el.textContent = String(value);
  }

  detectMobile() {
    return (
      ('ontouchstart' in window) ||
      (navigator.maxTouchPoints > 0) ||
      window.matchMedia('(hover: none)').matches
    );
  }

  // ---------- iOS helpers ----------
  safeResume() {
    try { this.audioEngine.resume?.(); } catch {}
  }

  /**
   * Bind "tap" in a mobile-safe way (iOS Safari sometimes drops click).
   * We use pointerup + touchend fallback and a guard to avoid double fire.
   */
  bindTap(el, fn) {
    if (!el) return;

    const guarded = (e) => {
      // avoid duplicate triggers on iOS (pointerup + touchend)
      const now = performance.now();
      const last = this._tapGuard.get(el) || 0;
      if (now - last < 220) return;
      this._tapGuard.set(el, now);

      try { e.preventDefault?.(); } catch {}
      try { e.stopPropagation?.(); } catch {}

      this.safeResume();
      fn(e);
    };

    el.addEventListener('pointerup', guarded, { passive: false });
    el.addEventListener('touchend', guarded, { passive: false });
  }

  /**
   * Range sliders on iOS: sometimes "input" is flaky. Bind input+change + pointerup/touchend.
   */
  bindRange(inputEl, onValue) {
    if (!inputEl) return;

    const apply = () => onValue(Number(inputEl.value));

    const handler = () => {
      this.safeResume();
      apply();
    };

    inputEl.addEventListener('input', handler, { passive: true });
    inputEl.addEventListener('change', handler, { passive: true });
    inputEl.addEventListener('pointerup', handler, { passive: false });
    inputEl.addEventListener('touchend', handler, { passive: false });

    // init sync
    apply();
  }

  init() {
    this.renderPads();
    this.renderSequencer();
    this.bindEvents();
    this.bindKeyboard();
    this.initSliderFills();
    this.updateHints();

    // Preset FX actif au chargement
    const activePreset = document.querySelector('.preset-btn.active')?.dataset?.preset;
    if (activePreset) this.applyPreset(activePreset);

    // Pad edit visible + synchro
    this.selectPad(0);

    // Sync sequencer UI depuis le pattern en mémoire
    this.syncSequencerUIFromData();

    // Sync toggles (si jamais tu recharges une session)
    this.syncTransportToggles();

    // IMPORTANT: pousser HUMAN/TIMING au sequencer dès le chargement
    this.applyHumanizeFromUI(true);
  }

  syncTransportToggles() {
    // REC
    const recOn = !!this.sequencer.isRecording;
    this.$('rec-btn')?.classList.toggle('active', recOn);
    document.body.classList.toggle('recording', recOn);

    // MET
    const metOn = !!this.sequencer.metronomeEnabled;
    this.$('met-btn')?.classList.toggle('active', metOn);

    // HUMAN labels only (apply to engine handled separately)
    const human = this.$('humanize');
    if (human) {
      const pct = parseInt(human.value, 10) || 0;
      this.setText('humanize-val', `${pct}%`);
    }
    const ht = this.$('humanize-time');
    if (ht) {
      const ms = parseInt(ht.value, 10) || 0;
      this.setText('humanize-time-val', `${ms}ms`);
    }
  }

  updateHints() {
    const hint = this.$('pad-hint');
    if (!hint) return;

    hint.textContent = this.isMobile
      ? 'Tap pour jouer · 📁 pour charger · appui long pour éditer'
      : 'Clic pour jouer · 📁/clic droit pour charger · Alt+clic pour éditer';
  }

  // ---------------------------
  // RENDER
  // ---------------------------

  renderPads() {
    const grid = this.$('pads-grid');
    if (!grid) {
      console.error('[UI] #pads-grid introuvable');
      return;
    }

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
    const header = this.$('seq-header');
    if (header) {
      header.innerHTML = '';
      for (let step = 0; step < 16; step++) {
        const num = document.createElement('span');
        num.textContent = step + 1;
        header.appendChild(num);
      }
    }

    const grid = this.$('sequencer-grid');
    if (!grid) {
      console.error('[UI] #sequencer-grid introuvable');
      return;
    }

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
    const padsGrid = this.$('pads-grid');
    if (padsGrid) {
      padsGrid.addEventListener('pointerdown', (e) => {
        const loadBtn = e.target.closest('.pad-load-btn');
        if (loadBtn) {
          e.preventDefault();
          e.stopPropagation();
          this.safeResume();
          const padId = parseInt(loadBtn.dataset.padId, 10);
          this.openFilePicker(padId);
          return;
        }

        const pad = e.target.closest('.pad');
        if (!pad) return;

        const padId = parseInt(pad.dataset.padId, 10);

        // Desktop: Alt+clic => select/edit
        if (!this.isMobile && e.altKey) {
          e.preventDefault();
          this.safeResume();
          this.selectPad(padId);
          return;
        }

        // Mobile: long press => select/edit (no play)
        if (this.isMobile) {
          this._lpTriggered = false;
          this._pendingPadId = padId;

          clearTimeout(this._lpTimer);
          this._lpTimer = setTimeout(() => {
            this._lpTriggered = true;
            this.safeResume();
            this.selectPad(padId);
            if (navigator.vibrate) navigator.vibrate(15);
          }, 350);
          return;
        }

        // Desktop normal: play
        this.safeResume();
        this.triggerPad(padId);
      }, { passive: false });

      padsGrid.addEventListener('pointerup', () => {
        if (!this.isMobile) return;
        clearTimeout(this._lpTimer);

        if (!this._lpTriggered && this._pendingPadId !== null) {
          this.safeResume();
          this.triggerPad(this._pendingPadId);
        }
        this._pendingPadId = null;
        this._lpTriggered = false;
      });

      padsGrid.addEventListener('pointercancel', () => {
        clearTimeout(this._lpTimer);
        this._pendingPadId = null;
        this._lpTriggered = false;
      });

      padsGrid.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const pad = e.target.closest('.pad');
        if (!pad) return;
        this.safeResume();
        const padId = parseInt(pad.dataset.padId, 10);
        this.openFilePicker(padId);
      });

      padsGrid.querySelectorAll('input[type="file"]').forEach((input, idx) => {
        input.addEventListener('change', async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          await this.handleFileSelect(idx, file);
          e.target.value = '';
          if (idx === this.selectedPadId) this.selectPad(idx);
        });
      });
    }

    // === SEQUENCER (robuste mobile + desktop) ===
    const seqGrid = this.$('sequencer-grid');
    if (seqGrid) {
      seqGrid.addEventListener('pointerdown', (e) => {
        const stepEl = e.target.closest('.seq-step');
        if (!stepEl) return;

        e.preventDefault();
        this.safeResume();

        const padId = parseInt(stepEl.dataset.padId, 10);
        const step = parseInt(stepEl.dataset.step, 10);

        this._downStep = { padId, step, el: stepEl };
        this._stepLpTriggered = false;

        // Desktop: Ctrl => toggle accent
        if (!this.isMobile && e.ctrlKey) {
          const on = this.sequencer.toggleAccent?.(padId, step);
          stepEl.classList.toggle('accent', !!on);
          const v = this.sequencer.getStepVelocity?.(padId, step) || 0;
          this.updateStepAppearance(stepEl, v);
          this._stepLpTriggered = true;
          return;
        }

        // Desktop: Shift => cycle velocity
        if (!this.isMobile && e.shiftKey) {
          this.cycleStepVelocity(padId, step);
          this._stepLpTriggered = true;
          return;
        }

        // Mobile: double tap => accent
        if (this.isMobile) {
          const now = performance.now();
          const last = this._lastTap;
          const isDouble = last.padId === padId && last.step === step && (now - last.t) < 260;
          this._lastTap = { padId, step, t: now };

          if (isDouble) {
            const on = this.sequencer.toggleAccent?.(padId, step);
            stepEl.classList.toggle('accent', !!on);
            const v = this.sequencer.getStepVelocity?.(padId, step) || 0;
            this.updateStepAppearance(stepEl, v);
            this._stepLpTriggered = true;
            if (navigator.vibrate) navigator.vibrate(12);
            return;
          }
        }

        // Mobile: long-press => cycle velocity
        if (this.isMobile) {
          clearTimeout(this._stepLpTimer);
          this._stepLpTimer = setTimeout(() => {
            this._stepLpTriggered = true;
            this.safeResume();
            this.cycleStepVelocity(padId, step);
            if (navigator.vibrate) navigator.vibrate(10);
          }, 320);
        }
      }, { passive: false });

      seqGrid.addEventListener('pointerup', () => {
        clearTimeout(this._stepLpTimer);

        const { padId, step, el } = this._downStep || {};
        if (padId === null || step === null || !el) return;

        if (this._stepLpTriggered) {
          this._downStep = { padId: null, step: null, el: null };
          this._stepLpTriggered = false;
          return;
        }

        const isActive = this.sequencer.toggleStep(padId, step);
        const v = isActive ? (this.sequencer.getStepVelocity?.(padId, step) || 0) : 0;
        this.updateStepAppearance(el, v);

        if (this.isMobile && navigator.vibrate) navigator.vibrate(8);

        this._downStep = { padId: null, step: null, el: null };
      });

      seqGrid.addEventListener('pointercancel', () => {
        clearTimeout(this._stepLpTimer);
        this._downStep = { padId: null, step: null, el: null };
        this._stepLpTriggered = false;
      });
    }

    // === TRANSPORT ===
    // Desktop click OK, but iOS needs pointerup/touchend => use bindTap everywhere critical
    this.bindTap(this.$('play-btn'), () => this.handlePlayToggle());
    this.bindTap(this.$('clear-btn'), () => this.handleClear());

    this.bindTap(this.$('rec-btn'), () => this.handleRecToggle());
    this.bindTap(this.$('met-btn'), () => this.handleMetToggle());

    // === TEMPO ===
    // input OK on iOS most of the time; but we keep normal listeners
    this.$('bpm')?.addEventListener('input', (e) => {
      const bpm = parseInt(e.target.value, 10);
      this.sequencer.setBPM(bpm);
      this.setText('bpm-display', bpm);
      this.setText('bpm-val', bpm);
    });

    this.$('swing')?.addEventListener('input', (e) => {
      const swing = parseInt(e.target.value, 10);
      this.sequencer.setSwing(swing);
      this.setText('swing-display', swing);
      this.setText('swing-val', `${swing}%`);
    });

    // === HUMANIZE (FIX iOS) ===
    this.bindRange(this.$('humanize'), (pct) => {
      const v = Math.max(0, Math.min(30, Math.round(pct)));
      this.sequencer.setHumanize?.(v);
      this.setText('humanize-val', `${v}%`);
    });

    this.bindRange(this.$('humanize-time'), (ms) => {
      const v = Math.max(0, Math.min(20, Math.round(ms)));
      this.sequencer.setHumanizeTime?.(v);
      this.setText('humanize-time-val', `${v}ms`);
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

    // === PAD EDITOR ===
    // iOS slider: we can keep input, but better bindRange for consistency
    this.bindRange(this.$('pad-pitch'), (st) => {
      const v = Math.max(-24, Math.min(24, Math.round(st)));
      this.audioEngine.setPadPitch?.(this.selectedPadId, v);
      this.setText('pad-pitch-val', `${v} st`);
      this.updateSliderFillByInputId('pad-pitch');
    });

    this.bindRange(this.$('pad-vol'), (pct) => {
      const p = Math.max(0, Math.min(100, Math.round(pct)));
      const vol01 = p / 100;
      this.audioEngine.setPadVolume?.(this.selectedPadId, vol01);
      this.setText('pad-vol-val', `${p}%`);
      this.updateSliderFillByInputId('pad-vol');
    });
  }

  bindEffectControl(inputId, effectParam, displayId, formatFn = (v) => v) {
    const input = this.$(inputId);
    if (!input) return;

    const display = this.$(displayId);

    const apply = () => {
      const raw = Number(input.value);
      this.audioEngine.setEffect(effectParam, raw);
      if (display) display.textContent = formatFn(raw);
      this.updateSliderFillByInputId(inputId);
    };

    // input OK for FX even on iOS generally, but we resume to be safe
    input.addEventListener('input', () => { this.safeResume(); apply(); });
    input.addEventListener('change', () => { this.safeResume(); apply(); });
    apply();
  }

  bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      const key = (e.key || '').toUpperCase();
      const padIndex = this.padKeys.indexOf(key);

      if (padIndex !== -1) {
        e.preventDefault();
        this.safeResume();
        this.triggerPad(padIndex);
      }

      if (e.code === 'Space') {
        e.preventDefault();
        this.safeResume();
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
  // LIVE REC / MET
  // ---------------------------

  handleRecToggle() {
    const btn = this.$('rec-btn');
    const isOn = !this.sequencer.isRecording;

    this.sequencer.setRecording?.(isOn);

    if (btn) btn.classList.toggle('active', isOn);
    document.body.classList.toggle('recording', isOn);
  }

  handleMetToggle() {
    const btn = this.$('met-btn');
    const isOn = !this.sequencer.metronomeEnabled;

    this.sequencer.setMetronome?.(isOn);

    if (btn) btn.classList.toggle('active', isOn);

    // Petit "tic" immédiat pour confirmer sur iOS (si dispo)
    // (Ne remplace pas le scheduling du metronome, c'est juste un feedback)
    if (isOn) {
      try {
        const t = this.audioEngine.getCurrentTime?.() ?? 0;
        this.audioEngine.playClick?.(t + 0.01, true);
      } catch {}
    }
  }

  applyHumanizeFromUI(force = false) {
    const h = this.$('humanize');
    if (h) {
      const pct = parseInt(h.value, 10) || 0;
      this.setText('humanize-val', `${pct}%`);
      if (force) this.sequencer.setHumanize?.(pct);
    }
    const ht = this.$('humanize-time');
    if (ht) {
      const ms = parseInt(ht.value, 10) || 0;
      this.setText('humanize-time-val', `${ms}ms`);
      if (force) this.sequencer.setHumanizeTime?.(ms);
    }
  }

  // ---------------------------
  // VELOCITY / ACCENT UI
  // ---------------------------

  cycleStepVelocity(padId, step) {
    const vel = this.sequencer.getStepVelocity?.(padId, step) || 0;

    let next = 0;
    if (vel <= 0) next = 0.5;
    else if (vel < 0.65) next = 0.8;
    else if (vel < 0.95) next = 1.0;
    else next = 0;

    const stepEl = this.stepElements?.[padId]?.[step];
    if (!stepEl) return;

    if (next === 0) {
      this.sequencer.clearStep?.(padId, step);
      this.updateStepAppearance(stepEl, 0);
    } else {
      this.sequencer.setStepVelocity?.(padId, step, next);
      this.updateStepAppearance(stepEl, next);
    }

    stepEl.classList.toggle('accent', !!this.sequencer.isAccented?.(padId, step));
  }

  updateStepAppearance(stepEl, velocity01) {
    const v = Math.max(0, Math.min(1, Number(velocity01)));
    const on = v > 0;

    stepEl.classList.toggle('active', on);

    if (on) {
      const opacity = 0.35 + 0.65 * v;
      stepEl.style.opacity = String(opacity);
    } else {
      stepEl.style.opacity = '';
    }

    const padId = parseInt(stepEl.dataset.padId, 10);
    const step = parseInt(stepEl.dataset.step, 10);
    stepEl.classList.toggle('accent', !!this.sequencer.isAccented?.(padId, step));
  }

  syncSequencerUIFromData() {
    for (let padId = 0; padId < 6; padId++) {
      for (let step = 0; step < 16; step++) {
        const el = this.stepElements?.[padId]?.[step];
        if (!el) continue;
        const v = this.sequencer.getStepVelocity?.(padId, step) || 0;
        this.updateStepAppearance(el, v);
      }
    }
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
    const playBtn = this.$('play-btn');

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
    const playBtn = this.$('play-btn');
    this.sequencer.stop();
    playBtn?.classList.remove('active');
    this.clearPlayingIndicators();
  }

  handleClear() {
    this.sequencer.clear();
    this.clearAllSteps();
    this.syncSequencerUIFromData();
  }

  // ---------------------------
  // SLIDER FILLS
  // ---------------------------

  initSliderFills() {
    [
      'bit-depth','sample-rate','filter-cutoff','drive','vinyl-noise','compression',
      'pad-pitch','pad-vol',
      'humanize','humanize-time',
    ].forEach((id) => this.updateSliderFillByInputId(id));
  }

  updateSliderFillByInputId(inputId) {
    const input = this.$(inputId);
    if (!input) return;

    const fillMap = {
      'bit-depth': 'bit-depth-fill',
      'sample-rate': 'sample-rate-fill',
      'filter-cutoff': 'filter-fill',
      'drive': 'drive-fill',
      'vinyl-noise': 'vinyl-fill',
      'compression': 'comp-fill',
      'pad-pitch': 'pad-pitch-fill',
      'pad-vol': 'pad-vol-fill',
      // (si tu ajoutes des fill pour humanize plus tard, mappe-les ici)
      // 'humanize': 'humanize-fill',
      // 'humanize-time': 'humanize-time-fill',
    };

    const fillId = fillMap[inputId];
    if (!fillId) return;

    const fill = this.$(fillId);
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
      const input = inputId ? this.$(inputId) : null;
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

    this.padElements.forEach((p, i) => p.classList.toggle('selected', i === padId));

    const editor = this.$('pad-editor');
    if (editor) editor.hidden = false;

    const info = this.audioEngine.getSampleInfo(padId);
    this.setText('pad-edit-id', padId + 1);
    this.setText('pad-edit-name', info?.name || 'EMPTY');

    const params = this.audioEngine.getPadParams?.(padId) || { pitch: 0, volume: 0.8 };

    // Handled by bindRange, but we still set initial values
    const pitchInput = this.$('pad-pitch');
    const volInput = this.$('pad-vol');

    if (pitchInput) {
      pitchInput.value = String(params.pitch ?? 0);
      this.setText('pad-pitch-val', `${parseInt(pitchInput.value, 10) || 0} st`);
      this.updateSliderFillByInputId('pad-pitch');
    }

    if (volInput) {
      volInput.value = String(Math.round((params.volume ?? 0.8) * 100));
      this.setText('pad-vol-val', `${parseInt(volInput.value, 10) || 0}%`);
      this.updateSliderFillByInputId('pad-vol');
    }
  }

  // ---------------------------
  // PAD TRIGGER + LIVE REC
  // ---------------------------

  triggerPad(padId) {
    const pad = this.padElements[padId];
    if (!pad) return;

    pad.classList.add('active');
    setTimeout(() => pad.classList.remove('active'), 100);

    const led = this.$('led');
    if (led) {
      led.classList.add('active');
      setTimeout(() => led.classList.remove('active'), 100);
    }

    // Live REC
    if (this.sequencer.isRecording) {
      const t = this.audioEngine.getCurrentTime();
      const targetStep = this.sequencer.recordHit?.(padId, this.sequencer.recVelocity ?? 0.9, t);

      const stepEl = this.stepElements?.[padId]?.[targetStep];
      if (stepEl) {
        const v = this.sequencer.getStepVelocity?.(padId, targetStep) || 0;
        this.updateStepAppearance(stepEl, v);
        stepEl.classList.add('playing');
        setTimeout(() => stepEl.classList.remove('playing'), 80);
      }
    }

    this.audioEngine.playSample(padId, 0, 1);
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

    const led = this.$('led');
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
    document.querySelectorAll('.seq-step.accent').forEach((el) => el.classList.remove('accent'));
    document.querySelectorAll('.seq-step').forEach((el) => { el.style.opacity = ''; });
  }
}
