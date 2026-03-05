/**
 * UI.js — AKOMGA Synth + Sequencer
 * Aligné avec ton index.html (IDs actuels)
 *
 * Keyboard:
 *  - 8 touches: A S D F G H J K
 *  - Joue la gamme mineure (degrés) selon ROOT + OCT
 *
 * Sequencer:
 *  - 16 steps, 1 piste
 *  - Tap/click = cycle degree (OFF -> 1 -> 2 -> ... -> 7 -> OFF)
 *  - Double tap = toggle chord triad sur le step
 *  - Long press = OFF
 *
 * Transport:
 *  - PLAY toggles start/stop
 *  - CLEAR clears pattern
 *
 * Params:
 *  - BPM, SWING, HUMAN (%), TIMING (ms), ROOT, OCT
 *  - Appelle sequencer.setBPM / setSwing / setHumanize / setHumanizeTime / setRoot / setOct (si dispo)
 */

export class UI {
  constructor(synthEngine, sequencer) {
    this.synth = synthEngine;
    this.sequencer = sequencer;

    this.isMobile = this.detectMobile();

    // --- keyboard mapping (physical keys)
    this.kbKeys = ['A','S','D','F','G','H','J','K'];
    this.kbDown = new Set();

    // --- scale state
    this.root = 'A';
    this.oct = 4; // 2..6
    this.scaleName = 'MIN';

    // A minor degrees semitone offsets (natural minor): 1..7
    // degree 1 = root (0)
    this.minorOffsets = [0, 2, 3, 5, 7, 8, 10];

    // root note -> semitone in octave (C=0)
    this.rootSemis = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 };

    // --- sequencer local pattern (UI-side, syncable to Sequencer if methods exist)
    this.steps = 16;
    this.pattern = Array.from({ length: this.steps }, () => ({
      degree: 0,     // 0 = OFF, else 1..7
      chord: false,  // triad on/off
    }));

    // --- gesture helpers
    this._lpTimer = null;
    this._lpTriggered = false;

    this._lastTap = { step: -1, t: 0 };
  }

  // ---------- helpers ----------
  $(id) { return document.getElementById(id); }
  setText(id, value) { const el = this.$(id); if (el) el.textContent = String(value); }

  detectMobile() {
    return (
      ('ontouchstart' in window) ||
      (navigator.maxTouchPoints > 0) ||
      window.matchMedia('(hover: none)').matches
    );
  }

  init() {
    this.readInitialControls();
    this.renderKeyboard();
    this.renderSequencer();
    this.bindControls();
    this.bindKeyboardPhysical();
    this.updateDisplays();

    // Optionnel: sync UI <- sequencer si tu exposes une API
    this.trySyncFromSequencer();
  }

  readInitialControls() {
    const rootSel = this.$('root');
    if (rootSel) this.root = rootSel.value || 'A';

    const oct = this.$('oct');
    if (oct) this.oct = parseInt(oct.value, 10) || 4;
  }

  updateDisplays() {
    this.setText('scale-display', `${this.root} ${this.scaleName}`);

    const bpm = this.$('bpm')?.value ?? 96;
    this.setText('bpm-display', bpm);
    this.setText('bpm-val', bpm);

    const swing = this.$('swing')?.value ?? 0;
    this.setText('swing-display', swing);
    this.setText('swing-val', `${swing}%`);

    const human = this.$('humanize')?.value ?? 6;
    this.setText('humanize-val', `${human}%`);

    const ht = this.$('humanize-time')?.value ?? 8;
    this.setText('humanize-time-val', `${ht}ms`);

    this.setText('oct-val', this.oct);
  }

  // ---------- scale helpers ----------
  rootMidi() {
    // MIDI note of root at current octave
    // octave 4 => around middle C region (C4=60). Here using C4=60 mapping:
    // midi = 12*(oct+1) + semis
    const semis = this.rootSemis[this.root] ?? 9; // default A
    return 12 * (this.oct + 1) + semis;
  }

  degreeToMidi(degree1to7) {
    const d = Math.max(1, Math.min(7, degree1to7));
    const rootMidi = this.rootMidi();
    const off = this.minorOffsets[d - 1] ?? 0;
    return rootMidi + off;
  }

  buildTriad(degree1to7) {
    // triade mineure diatonique (approx) : root + third + fifth using scale degrees
    // For simplicity, use degree, degree+2, degree+4 (wrap in scale)
    const d = Math.max(1, Math.min(7, degree1to7));
    const deg2 = ((d + 1) % 7) + 1; // +2 degrees in 1..7 space (wrap)
    const deg4 = ((d + 3) % 7) + 1; // +4 degrees
    return [this.degreeToMidi(d), this.degreeToMidi(deg2), this.degreeToMidi(deg4)];
  }

  // ---------- render keyboard ----------
  renderKeyboard() {
    const wrap = this.$('keyboard');
    if (!wrap) return;

    wrap.innerHTML = '';
    wrap.classList.add('kbd');

    this.kbKeys.forEach((k, idx) => {
      const key = document.createElement('button');
      key.type = 'button';
      key.className = 'kbd-key';
      key.dataset.idx = String(idx);
      key.dataset.key = k;

      const deg = idx < 7 ? (idx + 1) : 1; // 8e touche = octave root (degree 1)
      key.dataset.degree = String(deg);

      key.innerHTML = `
        <div class="kbd-top">
          <span class="kbd-label">${k}</span>
          <span class="kbd-deg">${deg}</span>
        </div>
        <div class="kbd-bot">${this.root} ${this.scaleName}</div>
      `;

      wrap.appendChild(key);
    });

    // pointer events (touch friendly)
    wrap.addEventListener('pointerdown', (e) => {
      const btn = e.target.closest('.kbd-key');
      if (!btn) return;

      e.preventDefault();
      this.synth?.resume?.();

      const deg = parseInt(btn.dataset.degree, 10) || 1;
      const midi = this.degreeToMidi(deg);

      btn.classList.add('active');
      this.synth?.noteOn?.(midi, 1);
      btn.setPointerCapture?.(e.pointerId);
    }, { passive: false });

    wrap.addEventListener('pointerup', (e) => {
      const btn = e.target.closest('.kbd-key');
      if (!btn) return;

      e.preventDefault();

      const deg = parseInt(btn.dataset.degree, 10) || 1;
      const midi = this.degreeToMidi(deg);

      btn.classList.remove('active');
      this.synth?.noteOff?.(midi);
    }, { passive: false });

    wrap.addEventListener('pointercancel', (e) => {
      const btn = e.target.closest('.kbd-key');
      if (!btn) return;

      btn.classList.remove('active');

      const deg = parseInt(btn.dataset.degree, 10) || 1;
      const midi = this.degreeToMidi(deg);
      this.synth?.noteOff?.(midi);
    });
  }

  // ---------- render sequencer ----------
  renderSequencer() {
    const header = this.$('seq-header');
    const grid = this.$('sequencer-grid');
    if (!grid) return;

    if (header) {
      header.innerHTML = '';
      for (let i = 0; i < this.steps; i++) {
        const s = document.createElement('span');
        s.textContent = String(i + 1);
        header.appendChild(s);
      }
    }

    grid.innerHTML = '';
    grid.classList.add('sequencer-grid');

    for (let step = 0; step < this.steps; step++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'seq-step';
      b.dataset.step = String(step);

      this.applyStepVisual(b, this.pattern[step]);

      grid.appendChild(b);
    }

    // gesture handling
    grid.addEventListener('pointerdown', (e) => {
      const el = e.target.closest('.seq-step');
      if (!el) return;
      e.preventDefault();

      const step = parseInt(el.dataset.step, 10);
      if (!Number.isFinite(step)) return;

      this._lpTriggered = false;
      clearTimeout(this._lpTimer);

      // long press => OFF
      this._lpTimer = setTimeout(() => {
        this._lpTriggered = true;
        this.setStep(step, { degree: 0, chord: false }, true);
        if (this.isMobile && navigator.vibrate) navigator.vibrate(12);
      }, 330);

    }, { passive: false });

    grid.addEventListener('pointerup', (e) => {
      const el = e.target.closest('.seq-step');
      if (!el) return;
      e.preventDefault();

      clearTimeout(this._lpTimer);

      const step = parseInt(el.dataset.step, 10);
      if (!Number.isFinite(step)) return;

      // if long press already handled, do nothing
      if (this._lpTriggered) {
        this._lpTriggered = false;
        return;
      }

      // double tap => toggle chord
      const now = performance.now();
      const isDouble = (this._lastTap.step === step) && (now - this._lastTap.t < 260);
      this._lastTap = { step, t: now };

      if (isDouble) {
        const cur = this.pattern[step];
        const next = { ...cur, chord: !cur.chord };
        // si OFF, on le met sur degree 1 pour que chord ait un sens
        if (next.degree === 0) next.degree = 1;
        this.setStep(step, next, true);
        if (this.isMobile && navigator.vibrate) navigator.vibrate(10);
        return;
      }

      // single tap => cycle degree (OFF -> 1..7 -> OFF)
      const cur = this.pattern[step];
      const nextDeg = (cur.degree >= 7) ? 0 : (cur.degree + 1);
      const next = { degree: nextDeg, chord: (nextDeg === 0 ? false : cur.chord) };
      this.setStep(step, next, true);
      if (this.isMobile && navigator.vibrate) navigator.vibrate(8);
    }, { passive: false });

    grid.addEventListener('pointercancel', () => {
      clearTimeout(this._lpTimer);
      this._lpTriggered = false;
    });
  }

  applyStepVisual(el, stepObj) {
    const on = (stepObj.degree || 0) > 0;
    el.classList.toggle('active', on);
    el.classList.toggle('chord', !!stepObj.chord);

    // petit label visuel via data-attr (si tu veux le styler en CSS)
    if (on) {
      el.dataset.label = stepObj.chord ? `${stepObj.degree}△` : String(stepObj.degree);
      el.style.opacity = stepObj.chord ? '1' : '0.85';
    } else {
      el.dataset.label = '';
      el.style.opacity = '';
    }
  }

  setStep(step, obj, pushToSequencer = false) {
    this.pattern[step] = { degree: obj.degree || 0, chord: !!obj.chord };

    const grid = this.$('sequencer-grid');
    const el = grid?.querySelector(`.seq-step[data-step="${step}"]`);
    if (el) this.applyStepVisual(el, this.pattern[step]);

    if (pushToSequencer) {
      // API optionnelle côté Sequencer (si tu l’as)
      // 1) setStep(step, degree, chord)
      this.sequencer?.setStep?.(step, this.pattern[step].degree, this.pattern[step].chord);
      // ou 2) setStepData(step, {degree, chord})
      this.sequencer?.setStepData?.(step, this.pattern[step]);
    }
  }

  // ---------- bind controls ----------
  bindControls() {
    // Transport
    this.$('play-btn')?.addEventListener('click', () => {
      if (!this.sequencer) return;

      if (this.sequencer.isPlaying) {
        this.sequencer.stop();
        this.$('play-btn')?.classList.remove('active');
      } else {
        this.synth?.resume?.();
        this.sequencer.start();
        this.$('play-btn')?.classList.add('active');
      }
    });

    this.$('clear-btn')?.addEventListener('click', () => {
      // clear sequencer side
      this.sequencer?.clear?.();

      // clear UI side
      for (let i = 0; i < this.steps; i++) {
        this.pattern[i] = { degree: 0, chord: false };
        const el = this.$('sequencer-grid')?.querySelector(`.seq-step[data-step="${i}"]`);
        if (el) this.applyStepVisual(el, this.pattern[i]);
      }
    });

    // BPM / Swing
    this.$('bpm')?.addEventListener('input', (e) => {
      const bpm = parseInt(e.target.value, 10) || 96;
      this.sequencer?.setBPM?.(bpm);
      this.setText('bpm-display', bpm);
      this.setText('bpm-val', bpm);
    });

    this.$('swing')?.addEventListener('input', (e) => {
      const swing = parseInt(e.target.value, 10) || 0;
      this.sequencer?.setSwing?.(swing);
      this.setText('swing-display', swing);
      this.setText('swing-val', `${swing}%`);
    });

    // Humanize
    this.$('humanize')?.addEventListener('input', (e) => {
      const v = parseInt(e.target.value, 10) || 0;
      this.sequencer?.setHumanize?.(v);
      this.setText('humanize-val', `${v}%`);
    });

    this.$('humanize-time')?.addEventListener('input', (e) => {
      const ms = parseInt(e.target.value, 10) || 0;
      this.sequencer?.setHumanizeTime?.(ms);
      this.setText('humanize-time-val', `${ms}ms`);
    });

    // Root / Oct
    this.$('root')?.addEventListener('change', (e) => {
      this.root = e.target.value || 'A';
      this.setText('scale-display', `${this.root} ${this.scaleName}`);
      this.sequencer?.setRoot?.(this.root);
      this.refreshKeyboardLabels();
    });

    this.$('oct')?.addEventListener('input', (e) => {
      this.oct = parseInt(e.target.value, 10) || 4;
      this.setText('oct-val', this.oct);
      this.sequencer?.setOct?.(this.oct);
    });
  }

  refreshKeyboardLabels() {
    const wrap = this.$('keyboard');
    if (!wrap) return;
    wrap.querySelectorAll('.kbd-key').forEach((btn) => {
      const bot = btn.querySelector('.kbd-bot');
      if (bot) bot.textContent = `${this.root} ${this.scaleName}`;
    });
  }

  // ---------- physical keyboard ----------
  bindKeyboardPhysical() {
    document.addEventListener('keydown', (e) => {
      const key = (e.key || '').toUpperCase();

      // space -> play/stop
      if (e.code === 'Space') {
        e.preventDefault();
        this.$('play-btn')?.click();
        return;
      }

      const idx = this.kbKeys.indexOf(key);
      if (idx === -1) return;

      if (this.kbDown.has(key)) return;
      this.kbDown.add(key);

      const deg = (idx < 7) ? (idx + 1) : 1;
      const midi = this.degreeToMidi(deg);

      this.synth?.resume?.();
      this.synth?.noteOn?.(midi, 1);

      // UI highlight
      this.$('keyboard')?.querySelector(`.kbd-key[data-key="${key}"]`)?.classList.add('active');
    });

    document.addEventListener('keyup', (e) => {
      const key = (e.key || '').toUpperCase();
      const idx = this.kbKeys.indexOf(key);
      if (idx === -1) return;

      this.kbDown.delete(key);

      const deg = (idx < 7) ? (idx + 1) : 1;
      const midi = this.degreeToMidi(deg);

      this.synth?.noteOff?.(midi);
      this.$('keyboard')?.querySelector(`.kbd-key[data-key="${key}"]`)?.classList.remove('active');
    });
  }

  // ---------- optional sync from sequencer ----------
  trySyncFromSequencer() {
    // Si ton Sequencer expose getPattern() -> [{degree, chord}, ...]
    const p = this.sequencer?.getPattern?.();
    if (!Array.isArray(p) || p.length !== this.steps) return;

    for (let i = 0; i < this.steps; i++) {
      const degree = parseInt(p[i]?.degree, 10) || 0;
      const chord = !!p[i]?.chord;
      this.pattern[i] = { degree, chord };
    }

    // refresh visuals
    const grid = this.$('sequencer-grid');
    if (!grid) return;
    for (let i = 0; i < this.steps; i++) {
      const el = grid.querySelector(`.seq-step[data-step="${i}"]`);
      if (el) this.applyStepVisual(el, this.pattern[i]);
    }
  }
}
