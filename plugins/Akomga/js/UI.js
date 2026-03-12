/**
 * UI.js
 * v2 — 64 steps · P-Lock popup · Live Sampling
 *
 * NOUVEAU:
 * - Step count buttons (16/32/64) → reRenderSequencer()
 * - P-LOCK mode toggle (#plock-btn)
 *   Desktop: clic droit sur step → param lock popup (quel que soit le mode)
 *   Mobile:  P-LOCK mode ON → tap sur step → param lock popup
 * - Param lock popup (#param-lock-popup)
 *   Checkbox pitch + slider -24..+24 st · Clear step
 * - Mic button par pad (🎙) → startLiveSampling / stopLiveSampling
 *   VU meter temps réel pendant l'enregistrement
 */

export class UI {
  constructor(audioEngine, sequencer) {
    this.audioEngine = audioEngine;
    this.sequencer   = sequencer;

    this.padElements  = [];
    this.stepElements = [];

    this.padKeys   = ['Q', 'W', 'E', 'A', 'S', 'D'];
    this.padColors = ['#e63946', '#ff6b35', '#f7c948', '#2ecc71', '#4ecdc4', '#9b59b6'];

    this.isMobile = this.detectMobile();

    // Pad editor
    this.selectedPadId = 0;

    // Long-press pad (mobile)
    this._lpTimer     = null;
    this._lpTriggered = false;
    this._pendingPadId = null;

    // Step touch tracking
    this._downStep      = { padId: null, step: null, el: null };
    this._stepLpTimer   = null;
    this._stepLpTriggered = false;

    // Double-tap accent (mobile)
    this._lastTap = { padId: null, step: null, t: 0 };

    // Anti double-trigger
    this._tapGuard = new WeakMap();

    // Anti double-tap zoom (pads/controls)
    this._antiZoomLastTap = { t: 0, x: 0, y: 0 };

    // ── Nouveaux états ──
    this.pLockMode   = false;
    this.pLockTarget = { padId: null, step: null };
    this.samplingPadId = null;  // pad actuellement en cours de sampling
  }

  // ─── DOM helpers ──────────────────────────────────────────────────────────

  $(id) { return document.getElementById(id); }

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

  // ─── iOS helpers ──────────────────────────────────────────────────────────

  safeResume() {
    try { this.audioEngine.resume?.(); } catch {}
  }

  installAntiDoubleTapZoom() {
    if (!this.isMobile) return;
    const root = document.querySelector('.sampler-container') || document.body;

    const shouldGuard = (target) => {
      if (!target) return false;
      if (target.closest?.('#sequencer-grid') || target.closest?.('.sequencer-grid')) return false;
      return !!(
        target.closest?.('#pads-grid')       ||
        target.closest?.('.transport')       ||
        target.closest?.('.transport-btn')   ||
        target.closest?.('.preset-btn')      ||
        target.closest?.('.step-count-btn')  ||
        target.closest?.('.effects-section') ||
        target.closest?.('.pad-editor')      ||
        target.closest?.('input[type="range"]') ||
        target.closest?.('.pad')             ||
        target.closest?.('.pad-load-btn')    ||
        target.closest?.('.pad-mic-btn')
      );
    };

    root.addEventListener('touchend', (e) => {
      if (!shouldGuard(e.target)) return;
      if (!e.changedTouches?.length) return;

      const now   = performance.now();
      const touch = e.changedTouches[0];
      const dt = now - this._antiZoomLastTap.t;
      const dx = Math.abs(touch.clientX - this._antiZoomLastTap.x);
      const dy = Math.abs(touch.clientY - this._antiZoomLastTap.y);

      if (dt > 0 && dt < 280 && dx < 24 && dy < 24) e.preventDefault();

      this._antiZoomLastTap = { t: now, x: touch.clientX, y: touch.clientY };
    }, { passive: false });
  }

  bindTap(el, fn) {
    if (!el) return;
    const guarded = (e) => {
      const now  = performance.now();
      const last = this._tapGuard.get(el) || 0;
      if (now - last < 220) return;
      this._tapGuard.set(el, now);
      try { e.preventDefault?.(); } catch {}
      try { e.stopPropagation?.(); } catch {}
      this.safeResume();
      fn(e);
    };
    el.addEventListener('pointerup', guarded, { passive: false });
    el.addEventListener('touchend',  guarded, { passive: false });
  }

  bindRange(inputEl, onValue) {
    if (!inputEl) return;
    const apply   = () => onValue(Number(inputEl.value));
    const handler = () => { this.safeResume(); apply(); };
    inputEl.addEventListener('input',     handler, { passive: true });
    inputEl.addEventListener('change',    handler, { passive: true });
    inputEl.addEventListener('pointerup', handler, { passive: false });
    inputEl.addEventListener('touchend',  handler, { passive: false });
    apply();
  }

  // ─── Initialisation ───────────────────────────────────────────────────────

  init() {
    this.renderPads();
    this.renderSequencer();
    this.bindEvents();
    this.bindKeyboard();
    this.initSliderFills();
    this.updateHints();

    // Preset actif au chargement
    const activePreset = document.querySelector('.preset-btn.active')?.dataset?.preset;
    if (activePreset) this.applyPreset(activePreset);

    this.selectPad(0);
    this.syncSequencerUIFromData();
    this.syncTransportToggles();
    this.applyHumanizeFromUI(true);
    this.installAntiDoubleTapZoom();
  }

  syncTransportToggles() {
    this.$('rec-btn')?.classList.toggle('active', !!this.sequencer.isRecording);
    document.body.classList.toggle('recording', !!this.sequencer.isRecording);
    this.$('met-btn')?.classList.toggle('active', !!this.sequencer.metronomeEnabled);

    const h = this.$('humanize');
    if (h) this.setText('humanize-val', `${parseInt(h.value, 10) || 0}%`);
    const ht = this.$('humanize-time');
    if (ht) this.setText('humanize-time-val', `${parseInt(ht.value, 10) || 0}ms`);
  }

  updateHints() {
    const hint = this.$('pad-hint');
    if (!hint) return;
    hint.textContent = this.isMobile
      ? 'Tap jouer · 📁 charger · 🎙 sampler · appui long éditer'
      : 'Clic jouer · clic droit/Alt charger · 🎙 sampler · P-LOCK: clic droit sur step';
  }

  // ─── Rendu ────────────────────────────────────────────────────────────────

  renderPads() {
    const grid = this.$('pads-grid');
    if (!grid) return;
    grid.innerHTML = '';
    this.padElements = [];

    for (let i = 0; i < 6; i++) {
      const info = this.audioEngine.getSampleInfo(i);
      const pad  = document.createElement('div');
      pad.className   = 'pad';
      pad.dataset.padId = i;

      pad.innerHTML = `
        <div class="pad-header">
          <span class="pad-number">${i + 1}</span>
          <span class="pad-key">${this.padKeys[i] || ''}</span>
        </div>

        <div class="pad-footer">
          <span class="pad-name">${info?.name || 'EMPTY'}</span>
        </div>

        <!-- Mic button (live sampling) -->
        <button class="pad-mic-btn" data-pad-id="${i}" aria-label="Live sampling" type="button"
          title="Live sampling depuis micro">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8"  y1="23" x2="16" y2="23"/>
          </svg>
        </button>

        <!-- Load button -->
        <button class="pad-load-btn" data-pad-id="${i}" aria-label="Charger sample" type="button">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        </button>

        <!-- VU meter (live sampling level) -->
        <div class="pad-vu"><div class="pad-vu-bar" id="vu-${i}"></div></div>

        <input class="pad-file" type="file"
          accept="audio/*,.wav,.mp3,.ogg,.aac,.m4a,.flac"
          id="file-${i}">
      `;

      grid.appendChild(pad);
      this.padElements.push(pad);
    }
  }

  renderSequencer() {
    const stepCount = this.sequencer.steps || 16;

    // Header numéros
    const header = this.$('seq-header');
    if (header) {
      header.innerHTML = '';
      for (let s = 0; s < stepCount; s++) {
        const span = document.createElement('span');
        span.textContent = s + 1;
        if (s % 4 === 0) span.classList.add('bar-start');
        header.appendChild(span);
      }
    }

    // Grille
    const grid = this.$('sequencer-grid');
    if (!grid) return;
    grid.innerHTML    = '';
    this.stepElements = [];

    for (let padId = 0; padId < 6; padId++) {
      const row = document.createElement('div');
      row.className = 'seq-row';

      const label = document.createElement('div');
      label.className   = 'seq-row-label';
      label.textContent = padId + 1;
      if (this.padColors?.[padId]) {
        label.style.background = this.padColors[padId];
        label.style.color = '#000';
      }
      row.appendChild(label);

      const stepsContainer = document.createElement('div');
      stepsContainer.className = 'seq-steps';

      const rowSteps = [];
      for (let step = 0; step < stepCount; step++) {
        const stepEl = document.createElement('button');
        stepEl.className = 'seq-step';
        stepEl.type = 'button';
        stepEl.dataset.padId = padId;
        stepEl.dataset.step  = step;
        if (step % 4 === 0) stepEl.classList.add('beat-marker');

        stepsContainer.appendChild(stepEl);
        rowSteps.push(stepEl);
      }

      row.appendChild(stepsContainer);
      grid.appendChild(row);
      this.stepElements.push(rowSteps);
    }
  }

  /** Re-render complet du séquenceur (après changement de longueur). */
  reRenderSequencer() {
    this.renderSequencer();
    this.syncSequencerUIFromData();
    this.updateParamLockVisuals();
  }

  // ─── Events ───────────────────────────────────────────────────────────────

  bindEvents() {
    this._bindPads();
    this._bindSequencer();
    this._bindTransport();
    this._bindTempo();
    this._bindEffects();
    this._bindPresets();
    this._bindPadEditor();
    this._bindStepCount();
    this._bindPLock();
    this._bindParamLockPopup();
  }

  // ── Pads ─────────────────────────────────────────────────────────────────

  _bindPads() {
    const padsGrid = this.$('pads-grid');
    if (!padsGrid) return;

    padsGrid.addEventListener('pointerdown', (e) => {
      // Mic button
      const micBtn = e.target.closest('.pad-mic-btn');
      if (micBtn) {
        e.preventDefault();
        e.stopPropagation();
        this.safeResume();
        const padId = parseInt(micBtn.dataset.padId, 10);
        this.handleMicButton(padId);
        return;
      }

      // Load button
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

      // Desktop: Alt+clic → select/edit
      if (!this.isMobile && e.altKey) {
        e.preventDefault();
        this.safeResume();
        this.selectPad(padId);
        return;
      }

      // Mobile: long press → select/edit
      if (this.isMobile) {
        this._lpTriggered  = false;
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
      this._lpTriggered  = false;
    });

    padsGrid.addEventListener('pointercancel', () => {
      clearTimeout(this._lpTimer);
      this._pendingPadId = null;
      this._lpTriggered  = false;
    });

    padsGrid.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const pad = e.target.closest('.pad');
      if (!pad) return;
      this.safeResume();
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
        if (idx === this.selectedPadId) this.selectPad(idx);
      });
    });
  }

  // ── Séquenceur ───────────────────────────────────────────────────────────

  _bindSequencer() {
    const seqGrid = this.$('sequencer-grid');
    if (!seqGrid) return;

    // Clic droit (desktop) → param lock popup quelle que soit le mode P-LOCK
    seqGrid.addEventListener('contextmenu', (e) => {
      const stepEl = e.target.closest('.seq-step');
      if (!stepEl) return;
      e.preventDefault();
      const padId = parseInt(stepEl.dataset.padId, 10);
      const step  = parseInt(stepEl.dataset.step,  10);
      this.showParamLockPopup(padId, step);
    });

    seqGrid.addEventListener('pointerdown', (e) => {
      const stepEl = e.target.closest('.seq-step');
      if (!stepEl) return;

      e.preventDefault();
      this.safeResume();

      const padId = parseInt(stepEl.dataset.padId, 10);
      const step  = parseInt(stepEl.dataset.step,  10);

      this._downStep       = { padId, step, el: stepEl };
      this._stepLpTriggered = false;

      // Desktop Ctrl → accent
      if (!this.isMobile && e.ctrlKey) {
        const on = this.sequencer.toggleAccent?.(padId, step);
        stepEl.classList.toggle('accent', !!on);
        this.updateStepAppearance(stepEl, this.sequencer.getStepVelocity?.(padId, step) || 0);
        this._stepLpTriggered = true;
        return;
      }

      // Desktop Shift → cycle velocity
      if (!this.isMobile && e.shiftKey) {
        this.cycleStepVelocity(padId, step);
        this._stepLpTriggered = true;
        return;
      }

      if (this.isMobile) {
        // Double-tap → accent
        const now = performance.now();
        const last = this._lastTap;
        const isDouble = last.padId === padId && last.step === step && (now - last.t) < 260;
        this._lastTap = { padId, step, t: now };

        if (isDouble) {
          const on = this.sequencer.toggleAccent?.(padId, step);
          stepEl.classList.toggle('accent', !!on);
          this.updateStepAppearance(stepEl, this.sequencer.getStepVelocity?.(padId, step) || 0);
          this._stepLpTriggered = true;
          if (navigator.vibrate) navigator.vibrate(12);
          return;
        }

        // Long-press → cycle velocity (mode normal) ou param lock popup (mode P-LOCK)
        clearTimeout(this._stepLpTimer);
        this._stepLpTimer = setTimeout(() => {
          this._stepLpTriggered = true;
          this.safeResume();
          if (this.pLockMode) {
            this.showParamLockPopup(padId, step);
          } else {
            this.cycleStepVelocity(padId, step);
          }
          if (navigator.vibrate) navigator.vibrate(10);
        }, 320);
      }
    }, { passive: false });

    seqGrid.addEventListener('pointerup', () => {
      clearTimeout(this._stepLpTimer);
      const { padId, step, el } = this._downStep || {};
      if (padId === null || step === null || !el) return;

      if (this._stepLpTriggered) {
        this._downStep        = { padId: null, step: null, el: null };
        this._stepLpTriggered = false;
        return;
      }

      // P-LOCK mode (mobile): tap → ouvre popup
      if (this.isMobile && this.pLockMode) {
        this.showParamLockPopup(padId, step);
        this._downStep = { padId: null, step: null, el: null };
        return;
      }

      // Toggle normal
      const isActive = this.sequencer.toggleStep(padId, step);
      const v = isActive ? (this.sequencer.getStepVelocity?.(padId, step) || 0) : 0;
      this.updateStepAppearance(el, v);

      if (this.isMobile && navigator.vibrate) navigator.vibrate(8);
      this._downStep = { padId: null, step: null, el: null };
    });

    seqGrid.addEventListener('pointercancel', () => {
      clearTimeout(this._stepLpTimer);
      this._downStep        = { padId: null, step: null, el: null };
      this._stepLpTriggered = false;
    });
  }

  // ── Transport ─────────────────────────────────────────────────────────────

  _bindTransport() {
    this.bindTap(this.$('play-btn'),  () => this.handlePlayToggle());
    this.bindTap(this.$('clear-btn'), () => this.handleClear());
    this.bindTap(this.$('rec-btn'),   () => this.handleRecToggle());
    this.bindTap(this.$('met-btn'),   () => this.handleMetToggle());
  }

  // ── Tempo ─────────────────────────────────────────────────────────────────

  _bindTempo() {
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
  }

  // ── Effets ────────────────────────────────────────────────────────────────

  _bindEffects() {
    this.bindEffectControl('bit-depth',    'bitDepth',    'bit-depth-val',   (v) => `${Math.round(v)}`);
    this.bindEffectControl('sample-rate',  'sampleRate',  'sample-rate-val', (v) => `${Math.round(v / 1000)}k`);
    this.bindEffectControl('filter-cutoff','filter',      'filter-val',      (v) => `${(v / 1000).toFixed(1)}k`);
    this.bindEffectControl('drive',        'drive',       'drive-val',       (v) => `${Math.round(v)}`);
    this.bindEffectControl('vinyl-noise',  'vinylNoise',  'vinyl-val',       (v) => `${Math.round(v)}`);
    this.bindEffectControl('compression',  'compression', 'comp-val',        (v) => `${Math.round(v)}`);
  }

  // ── Presets ───────────────────────────────────────────────────────────────

  _bindPresets() {
    document.querySelectorAll('.preset-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.preset-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.applyPreset(btn.dataset.preset);
      });
    });
  }

  // ── Pad Editor ───────────────────────────────────────────────────────────

  _bindPadEditor() {
    this.bindRange(this.$('pad-pitch'), (st) => {
      const v = Math.max(-24, Math.min(24, Math.round(st)));
      this.audioEngine.setPadPitch?.(this.selectedPadId, v);
      this.setText('pad-pitch-val', `${v} st`);
      this.updateSliderFillByInputId('pad-pitch');
    });

    this.bindRange(this.$('pad-vol'), (pct) => {
      const p = Math.max(0, Math.min(100, Math.round(pct)));
      this.audioEngine.setPadVolume?.(this.selectedPadId, p / 100);
      this.setText('pad-vol-val', `${p}%`);
      this.updateSliderFillByInputId('pad-vol');
    });
  }

  // ── Step Count ───────────────────────────────────────────────────────────

  _bindStepCount() {
    document.querySelectorAll('.step-count-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const n = parseInt(btn.dataset.steps, 10);
        this.sequencer.setStepCount(n);

        document.querySelectorAll('.step-count-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

        this.reRenderSequencer();
      });
    });
  }

  // ── P-LOCK mode ──────────────────────────────────────────────────────────

  _bindPLock() {
    this.bindTap(this.$('plock-btn'), () => {
      this.setPLockMode(!this.pLockMode);
    });
  }

  setPLockMode(on) {
    this.pLockMode = !!on;
    this.$('plock-btn')?.classList.toggle('active', this.pLockMode);
    const seqGrid = this.$('sequencer-grid');
    if (seqGrid) seqGrid.classList.toggle('plock-mode', this.pLockMode);
  }

  // ── Param Lock Popup ─────────────────────────────────────────────────────

  _bindParamLockPopup() {
    // Fermeture
    this.bindTap(this.$('plp-close'), () => this.hideParamLockPopup());

    // Checkbox pitch
    this.$('plp-pitch-on')?.addEventListener('change', (e) => {
      const { padId, step } = this.pLockTarget;
      if (padId === null || step === null) return;

      const isOn      = e.target.checked;
      const pitchRange = this.$('plp-pitch');
      if (pitchRange) pitchRange.disabled = !isOn;

      if (isOn) {
        const v = Math.max(-24, Math.min(24, parseInt(pitchRange?.value || '0', 10)));
        this.sequencer.setParamLock(padId, step, 'pitch', v);
        this.setText('plp-pitch-val', `${v} st`);
      } else {
        this.sequencer.clearParamLock(padId, step, 'pitch');
        this.setText('plp-pitch-val', '— st');
      }

      this.updateParamLockVisuals();
    });

    // Slider pitch
    this.bindRange(this.$('plp-pitch'), (raw) => {
      const { padId, step } = this.pLockTarget;
      if (padId === null || step === null) return;
      if (!this.$('plp-pitch-on')?.checked) return;

      const v = Math.max(-24, Math.min(24, Math.round(raw)));
      this.sequencer.setParamLock(padId, step, 'pitch', v);
      this.setText('plp-pitch-val', `${v} st`);
      this.updateSliderFillByInputId('plp-pitch');
    });

    // Clear step
    this.bindTap(this.$('plp-clear-step'), () => {
      const { padId, step } = this.pLockTarget;
      if (padId === null || step === null) return;
      this.sequencer.clearParamLock(padId, step);
      this.hideParamLockPopup();
      this.updateParamLockVisuals();
    });
  }

  showParamLockPopup(padId, step) {
    this.pLockTarget = { padId, step };

    const popup = this.$('param-lock-popup');
    if (!popup) return;

    this.setText('plp-label', `P-LOCK · PAD ${padId + 1} · STEP ${step + 1}`);

    const lock     = this.sequencer.getParamLock(padId, step);
    const hasPitch = lock.pitch !== undefined && lock.pitch !== null;

    const pitchOn    = this.$('plp-pitch-on');
    const pitchRange = this.$('plp-pitch');
    const pitchVal   = this.$('plp-pitch-val');

    if (pitchOn) pitchOn.checked = hasPitch;

    if (pitchRange) {
      // Si lock actif, affiche la valeur du lock, sinon le pitch par défaut du pad
      pitchRange.value    = hasPitch
        ? String(lock.pitch)
        : String(this.audioEngine.padPitch[padId] ?? 0);
      pitchRange.disabled = !hasPitch;
    }

    if (pitchVal) pitchVal.textContent = hasPitch ? `${lock.pitch} st` : '— st';

    this.updateSliderFillByInputId('plp-pitch');

    popup.hidden = false;
  }

  hideParamLockPopup() {
    const popup = this.$('param-lock-popup');
    if (popup) popup.hidden = true;
    this.pLockTarget = { padId: null, step: null };
  }

  /** Met à jour la classe .plocked sur tous les steps visibles. */
  updateParamLockVisuals() {
    for (let padId = 0; padId < this.sequencer.pads; padId++) {
      const row = this.stepElements?.[padId];
      if (!row) continue;
      for (let step = 0; step < row.length; step++) {
        const el = row[step];
        if (!el) continue;
        el.classList.toggle('plocked', this.sequencer.hasParamLock(padId, step));
      }
    }
  }

  // ─── Live Sampling ────────────────────────────────────────────────────────

  async handleMicButton(padId) {
    if (this.audioEngine.isLiveSampling) {
      if (this.audioEngine.liveSamplingPad === padId) {
        // Arrêter l'enregistrement de ce pad
        await this.stopPadSampling();
      } else {
        // Arrêter l'actuel, démarrer sur le nouveau
        await this.stopPadSampling();
        await this.startPadSampling(padId);
      }
    } else {
      await this.startPadSampling(padId);
    }
  }

  async startPadSampling(padId) {
    try {
      await this.audioEngine.startLiveSampling(padId, (level) => {
        this.updatePadVU(padId, level);
      });

      this.samplingPadId = padId;

      const pad = this.padElements[padId];
      if (pad) {
        pad.classList.add('sampling');
        const nameEl = pad.querySelector('.pad-name');
        if (nameEl) nameEl.textContent = '● REC';
      }

      const micBtn = pad?.querySelector('.pad-mic-btn');
      if (micBtn) micBtn.classList.add('recording');

    } catch (err) {
      console.error('Live sampling error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        alert('🎙 Accès micro refusé.\nVérifiez les permissions de votre navigateur.');
      } else if (err.message?.includes('non supporté')) {
        alert('🎙 Live sampling non supporté sur cet appareil.');
      } else {
        alert(`🎙 Erreur sampling: ${err.message}`);
      }
    }
  }

  async stopPadSampling() {
    const padId = this.samplingPadId;

    const savedPadId = await this.audioEngine.stopLiveSampling();

    this.samplingPadId = null;

    if (padId !== null) {
      const pad = this.padElements[padId];
      if (pad) pad.classList.remove('sampling');

      const micBtn = pad?.querySelector('.pad-mic-btn');
      if (micBtn) micBtn.classList.remove('recording');

      this.updatePadVU(padId, 0);
    }

    if (savedPadId !== null) {
      this.updatePadDisplay(savedPadId);
      if (this.isMobile && navigator.vibrate) navigator.vibrate([10, 30, 10]);
    }
  }

  updatePadVU(padId, level) {
    const bar = this.$(`vu-${padId}`);
    if (bar) bar.style.width = `${Math.round(level * 100)}%`;
  }

  // ─── Effets helper ────────────────────────────────────────────────────────

  bindEffectControl(inputId, effectParam, displayId, formatFn = (v) => v) {
    const input   = this.$(inputId);
    if (!input) return;
    const display = this.$(displayId);

    const apply = () => {
      const raw = Number(input.value);
      this.audioEngine.setEffect(effectParam, raw);
      if (display) display.textContent = formatFn(raw);
      this.updateSliderFillByInputId(inputId);
    };

    input.addEventListener('input',  () => { this.safeResume(); apply(); });
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
      if (padIndex !== -1) this.padElements[padIndex]?.classList.remove('active');
    });
  }

  // ─── Transport handlers ───────────────────────────────────────────────────

  handleRecToggle() {
    const isOn = !this.sequencer.isRecording;
    this.sequencer.setRecording?.(isOn);
    this.$('rec-btn')?.classList.toggle('active', isOn);
    document.body.classList.toggle('recording', isOn);
  }

  handleMetToggle() {
    const isOn = !this.sequencer.metronomeEnabled;
    this.sequencer.setMetronome?.(isOn);
    this.$('met-btn')?.classList.toggle('active', isOn);
    if (isOn) {
      try { this.audioEngine.playClick?.(this.audioEngine.getCurrentTime?.() + 0.01, true); } catch {}
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

  // ─── Velocity / Accent ────────────────────────────────────────────────────

  cycleStepVelocity(padId, step) {
    const vel  = this.sequencer.getStepVelocity?.(padId, step) || 0;
    const next = vel <= 0 ? 0.5 : vel < 0.65 ? 0.8 : vel < 0.95 ? 1.0 : 0;
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
    const v  = Math.max(0, Math.min(1, Number(velocity01)));
    const on = v > 0;
    stepEl.classList.toggle('active', on);
    stepEl.style.opacity = on ? String(0.35 + 0.65 * v) : '';

    const padId = parseInt(stepEl.dataset.padId, 10);
    const step  = parseInt(stepEl.dataset.step,  10);
    stepEl.classList.toggle('accent',  !!this.sequencer.isAccented?.(padId, step));
    stepEl.classList.toggle('plocked', !!this.sequencer.hasParamLock?.(padId, step));
  }

  syncSequencerUIFromData() {
    for (let padId = 0; padId < 6; padId++) {
      for (let step = 0; step < (this.sequencer.steps || 16); step++) {
        const el = this.stepElements?.[padId]?.[step];
        if (!el) continue;
        const v = this.sequencer.getStepVelocity?.(padId, step) || 0;
        this.updateStepAppearance(el, v);
      }
    }
  }

  // ─── File loading ─────────────────────────────────────────────────────────

  openFilePicker(padId) {
    const pad = this.padElements[padId];
    if (!pad) return;
    const input = pad.querySelector('input[type="file"]');
    if (!input) return;
    try {
      if (typeof input.showPicker === 'function') input.showPicker();
      else input.click();
    } catch { try { input.click(); } catch {} }
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

  // ─── Transport ────────────────────────────────────────────────────────────

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

  handleClear() {
    this.sequencer.clear();
    this.clearAllSteps();
    this.syncSequencerUIFromData();
    this.updateParamLockVisuals();
  }

  // ─── Sliders fills ────────────────────────────────────────────────────────

  initSliderFills() {
    [
      'bit-depth','sample-rate','filter-cutoff','drive','vinyl-noise','compression',
      'pad-pitch','pad-vol',
      'humanize','humanize-time',
      'plp-pitch',
    ].forEach((id) => this.updateSliderFillByInputId(id));
  }

  updateSliderFillByInputId(inputId) {
    const input = this.$(inputId);
    if (!input) return;

    const fillMap = {
      'bit-depth':    'bit-depth-fill',
      'sample-rate':  'sample-rate-fill',
      'filter-cutoff':'filter-fill',
      'drive':        'drive-fill',
      'vinyl-noise':  'vinyl-fill',
      'compression':  'comp-fill',
      'pad-pitch':    'pad-pitch-fill',
      'pad-vol':      'pad-vol-fill',
      'plp-pitch':    'plp-pitch-fill',
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

  // ─── Presets ──────────────────────────────────────────────────────────────

  applyPreset(presetName) {
    const presets = {
      SP1200: { bitDepth: 12, sampleRate: 26040, filter: 5500, drive: 25, vinylNoise: 15, compression: 50 },
      MPC60:  { bitDepth: 12, sampleRate: 32000, filter: 9000, drive: 15, vinylNoise:  8, compression: 35 },
      Dirty:  { bitDepth:  8, sampleRate: 12000, filter: 4500, drive: 45, vinylNoise: 35, compression: 55 },
      Clean:  { bitDepth: 16, sampleRate: 44100, filter:12000, drive:  5, vinylNoise:  0, compression: 20 },
    };
    const p = presets[presetName];
    if (!p) return;

    const mapToInputId = {
      bitDepth: 'bit-depth', sampleRate: 'sample-rate', filter: 'filter-cutoff',
      drive: 'drive', vinylNoise: 'vinyl-noise', compression: 'compression',
    };

    Object.entries(p).forEach(([param, value]) => {
      try { this.audioEngine.setEffect(param, value); } catch {}
      const input = mapToInputId[param] ? this.$(mapToInputId[param]) : null;
      if (input) {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  }

  // ─── Pad Editor ───────────────────────────────────────────────────────────

  selectPad(padId) {
    this.selectedPadId = padId;
    this.padElements.forEach((p, i) => p.classList.toggle('selected', i === padId));

    const editor = this.$('pad-editor');
    if (editor) editor.hidden = false;

    const info   = this.audioEngine.getSampleInfo(padId);
    this.setText('pad-edit-id',   padId + 1);
    this.setText('pad-edit-name', info?.name || 'EMPTY');

    const params = this.audioEngine.getPadParams?.(padId) || { pitch: 0, volume: 0.8 };
    const pitchInput = this.$('pad-pitch');
    const volInput   = this.$('pad-vol');

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

  // ─── Pad trigger + live REC ───────────────────────────────────────────────

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

    if (this.sequencer.isRecording) {
      const t          = this.audioEngine.getCurrentTime();
      const targetStep = this.sequencer.recordHit?.(padId, this.sequencer.recVelocity ?? 0.9, t);
      const stepEl     = this.stepElements?.[padId]?.[targetStep];
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
    const info   = this.audioEngine.getSampleInfo(padId);
    const pad    = this.padElements[padId];
    if (!pad) return;
    const nameEl = pad.querySelector('.pad-name');
    if (nameEl) nameEl.textContent = info?.name || 'EMPTY';
  }

  // ─── Sequencer callback ───────────────────────────────────────────────────

  onStepChange(step) {
    this.clearPlayingIndicators();
    if (step < 0) return;

    for (let padId = 0; padId < 6; padId++) {
      this.stepElements?.[padId]?.[step]?.classList.add('playing');
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
    document.querySelectorAll('.seq-step.plocked').forEach((el) => el.classList.remove('plocked'));
    document.querySelectorAll('.seq-step').forEach((el) => { el.style.opacity = ''; });
  }
}
