/**
 * UI.js — AKOMGA Synth + Sequencer (mobile + desktop)
 * Compatible avec:
 *  - ton style.css (kbd/kkey, seq-row, seq-step .txt)
 *  - ton Sequencer.js (6 lanes, events {on,degree,oct,chord,vel,mute})
 */

export class UI {
  constructor(synthEngine, sequencer) {
    this.synth = synthEngine;
    this.sequencer = sequencer;

    this.isMobile = this.detectMobile();

    // keyboard mapping
    this.kbKeys = ['A','S','D','F','G','H','J','K'];
    this.kbDown = new Set();

    // gestures (sequencer)
    this._lpTimer = null;
    this._lpTriggered = false;
    this._down = { lane: null, step: null, el: null };
    this._lastTap = { lane: -1, step: -1, t: 0 };
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
    this.renderKeyboard();
    this.renderSequencer();
    this.bindControls();
    this.bindKeyboardPhysical();
    this.syncUIFromSequencer();
    this.syncTopDisplays();
  }

  // ---------- TOP displays ----------
  syncTopDisplays() {
    // BPM/SWING displays
    const bpm = parseInt(this.$('bpm')?.value, 10) || this.sequencer.bpm || 96;
    const swing = parseInt(this.$('swing')?.value, 10) || this.sequencer.swing || 0;

    this.setText('bpm-display', bpm);
    this.setText('bpm-val', bpm);

    this.setText('swing-display', swing);
    this.setText('swing-val', `${swing}%`);

    // scale
    const root = this.$('root')?.value || this.sequencer.root || 'A';
    this.setText('scale-display', `${root} MIN`);

    const oct = parseInt(this.$('oct')?.value, 10) || this.sequencer.baseOctave || 4;
    this.setText('oct-val', oct);

    const hum = parseInt(this.$('humanize')?.value, 10) || this.sequencer.humanizePct || 6;
    this.setText('humanize-val', `${hum}%`);

    const ht = parseInt(this.$('humanize-time')?.value, 10) || this.sequencer.humanizeTimeMs || 8;
    this.setText('humanize-time-val', `${ht}ms`);
  }

  // ---------- Keyboard ----------
  renderKeyboard() {
    const wrap = this.$('keyboard');
    if (!wrap) return;

    wrap.innerHTML = '';
    wrap.classList.add('kbd');

    // 8 touches: on affiche la lettre + le degré
    this.kbKeys.forEach((k, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'kkey';
      btn.dataset.key = k;

      const degree = (idx < 7) ? (idx + 1) : 1; // K = root octave
      btn.dataset.degree = String(degree);

      btn.innerHTML = `
        <div class="kkey-top">
          <span>${k}</span>
          <span>${degree}</span>
        </div>
        <div class="kkey-bot">MIN</div>
      `;

      wrap.appendChild(btn);
    });

    // pointer/touch
    wrap.addEventListener('pointerdown', (e) => {
      const btn = e.target.closest('.kkey');
      if (!btn) return;
      e.preventDefault();

      this.synth?.resume?.();

      const degree = parseInt(btn.dataset.degree, 10) || 1;
      // On joue un degré “live” via synthEngine
      this.playDegreeLive(degree);

      btn.classList.add('active');
      btn.setPointerCapture?.(e.pointerId);
    }, { passive: false });

    const up = (e) => {
      const btn = e.target.closest('.kkey');
      if (!btn) return;
      e.preventDefault();

      btn.classList.remove('active');
      // relâchement: on coupe toutes les notes live (simple)
      this.synth?.allNotesOff?.();
    };

    wrap.addEventListener('pointerup', up, { passive: false });
    wrap.addEventListener('pointercancel', up, { passive: false });

    this.refreshKeyboardBottomLabel();
  }

  refreshKeyboardBottomLabel() {
    const root = this.$('root')?.value || 'A';
    const oct = parseInt(this.$('oct')?.value, 10) || 4;
    const wrap = this.$('keyboard');
    if (!wrap) return;

    wrap.querySelectorAll('.kkey .kkey-bot').forEach((el) => {
      el.textContent = `${root} MIN · OCT ${oct}`;
    });
  }

  playDegreeLive(degree1to7) {
    // Pour jouer live, on recycle les helpers du Sequencer (triade et mapping)
    // Si ton SynthEngine expose noteOn(note, vel) / noteOff(note) / playNoteAt(...) etc.
    const lane = 0;
    const deg0to6 = Math.max(0, Math.min(6, (degree1to7 - 1)));
    const midi = this.sequencer._degreeToMidi?.(deg0to6, 0);

    if (typeof midi !== 'number') return;

    // noteOn/off live simple
    this.synth?.noteOn?.(midi, 1);
  }

  // ---------- Sequencer render (6 lanes) ----------
  renderSequencer() {
    const header = this.$('seq-header');
    if (header) {
      header.innerHTML = '';
      for (let s = 0; s < this.sequencer.steps; s++) {
        const sp = document.createElement('span');
        sp.textContent = String(s + 1);
        header.appendChild(sp);
      }
    }

    const grid = this.$('sequencer-grid');
    if (!grid) return;

    grid.innerHTML = '';
    grid.classList.add('sequencer-grid');

    for (let lane = 0; lane < this.sequencer.lanes; lane++) {
      const row = document.createElement('div');
      row.className = 'seq-row';

      const lab = document.createElement('div');
      lab.className = 'seq-row-label';
      lab.textContent = String(lane + 1);
      row.appendChild(lab);

      const stepsWrap = document.createElement('div');
      stepsWrap.className = 'seq-steps';

      for (let step = 0; step < this.sequencer.steps; step++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'seq-step';
        b.dataset.lane = String(lane);
        b.dataset.step = String(step);
        if (step % 4 === 0) b.classList.add('beat-marker');

        const txt = document.createElement('div');
        txt.className = 'txt';
        txt.textContent = '';
        b.appendChild(txt);

        stepsWrap.appendChild(b);
      }

      row.appendChild(stepsWrap);
      grid.appendChild(row);
    }

    this.bindSequencerGestures();
  }

  bindSequencerGestures() {
    const grid = this.$('sequencer-grid');
    if (!grid) return;

    // pointerdown starts long-press timer
    grid.addEventListener('pointerdown', (e) => {
      const el = e.target.closest('.seq-step');
      if (!el) return;
      e.preventDefault();

      const lane = parseInt(el.dataset.lane, 10);
      const step = parseInt(el.dataset.step, 10);

      this._down = { lane, step, el };
      this._lpTriggered = false;

      clearTimeout(this._lpTimer);
      this._lpTimer = setTimeout(() => {
        this._lpTriggered = true;
        // long press = mute toggle
        const muted = this.sequencer.toggleMute(lane, step);
        this.applyStepVisual(el, this.sequencer.getEvent(lane, step));
        if (this.isMobile && navigator.vibrate) navigator.vibrate(12);
      }, 340);

    }, { passive: false });

    grid.addEventListener('pointerup', (e) => {
      const el = e.target.closest('.seq-step');
      if (!el) return;
      e.preventDefault();

      clearTimeout(this._lpTimer);

      const lane = parseInt(el.dataset.lane, 10);
      const step = parseInt(el.dataset.step, 10);

      // longpress already handled
      if (this._lpTriggered) {
        this._lpTriggered = false;
        this._down = { lane: null, step: null, el: null };
        return;
      }

      // double tap = chord toggle
      const now = performance.now();
      const isDouble =
        this._lastTap.lane === lane &&
        this._lastTap.step === step &&
        (now - this._lastTap.t) < 260;

      this._lastTap = { lane, step, t: now };

      if (isDouble) {
        this.sequencer.toggleChord(lane, step);
        this.applyStepVisual(el, this.sequencer.getEvent(lane, step));
        if (this.isMobile && navigator.vibrate) navigator.vibrate(10);
        return;
      }

      // single tap = cycle degree, and when wraps to 0 => OFF
      const newDeg = this.sequencer.cycleDegree(lane, step); // 0..6
      if (newDeg === 0) {
        // interpret wrap as OFF (remove event)
        // toggleStep will flip on/off; here we want off:
        const ev = this.sequencer.getEvent(lane, step);
        if (ev.on) this.sequencer.toggleStep(lane, step);
      }

      this.applyStepVisual(el, this.sequencer.getEvent(lane, step));
      if (this.isMobile && navigator.vibrate) navigator.vibrate(8);
    }, { passive: false });

    grid.addEventListener('pointercancel', () => {
      clearTimeout(this._lpTimer);
      this._lpTriggered = false;
      this._down = { lane: null, step: null, el: null };
    });
  }

  applyStepVisual(el, ev) {
    const on = !!ev?.on;
    el.classList.toggle('active', on);
    el.classList.toggle('chord', !!ev?.chord);
    el.classList.toggle('muted', !!ev?.mute);

    const txt = el.querySelector('.txt');
    if (!txt) return;

    if (!on) {
      txt.textContent = '';
      return;
    }

    // ev.degree est 0..6 => afficher 1..7
    txt.textContent = String((ev.degree ?? 0) + 1);
  }

  syncUIFromSequencer() {
    const grid = this.$('sequencer-grid');
    if (!grid) return;

    // Apply all events from sequencer grid
    for (let lane = 0; lane < this.sequencer.lanes; lane++) {
      for (let step = 0; step < this.sequencer.steps; step++) {
        const el = grid.querySelector(`.seq-step[data-lane="${lane}"][data-step="${step}"]`);
        if (!el) continue;
        const ev = this.sequencer.getEvent(lane, step);
        this.applyStepVisual(el, ev);
      }
    }
  }

  // ---------- Transport / controls ----------
  bindControls() {
    // PLAY
    this.$('play-btn')?.addEventListener('click', () => {
      this.sequencer.togglePlay();
      this.$('play-btn')?.classList.toggle('active', this.sequencer.isPlaying);
    });

    // CLEAR
    this.$('clear-btn')?.addEventListener('click', () => {
      this.sequencer.clear();
      this.syncUIFromSequencer();
    });

    // BPM
    this.$('bpm')?.addEventListener('input', (e) => {
      const bpm = parseInt(e.target.value, 10) || 96;
      this.sequencer.setBPM(bpm);
      this.setText('bpm-display', bpm);
      this.setText('bpm-val', bpm);
    });

    // SWING
    this.$('swing')?.addEventListener('input', (e) => {
      const swing = parseInt(e.target.value, 10) || 0;
      this.sequencer.setSwing(swing);
      this.setText('swing-display', swing);
      this.setText('swing-val', `${swing}%`);
    });

    // HUMAN
    this.$('humanize')?.addEventListener('input', (e) => {
      const v = parseInt(e.target.value, 10) || 0;
      this.sequencer.setHumanize(v);
      this.setText('humanize-val', `${v}%`);
    });

    // TIMING
    this.$('humanize-time')?.addEventListener('input', (e) => {
      const ms = parseInt(e.target.value, 10) || 0;
      this.sequencer.setHumanizeTime(ms);
      this.setText('humanize-time-val', `${ms}ms`);
    });

    // ROOT
    this.$('root')?.addEventListener('change', (e) => {
      const root = e.target.value || 'A';
      this.sequencer.setRoot(root);
      this.setText('scale-display', `${root} MIN`);
      this.refreshKeyboardBottomLabel();
    });

    // OCT
    this.$('oct')?.addEventListener('input', (e) => {
      const oct = parseInt(e.target.value, 10) || 4;
      this.sequencer.setOctave(oct);
      this.setText('oct-val', oct);
      this.refreshKeyboardBottomLabel();
    });
  }

  // ---------- Physical keyboard ----------
  bindKeyboardPhysical() {
    document.addEventListener('keydown', (e) => {
      // Space = play/stop
      if (e.code === 'Space') {
        e.preventDefault();
        this.$('play-btn')?.click();
        return;
      }

      const key = (e.key || '').toUpperCase();
      const idx = this.kbKeys.indexOf(key);
      if (idx === -1) return;
      if (this.kbDown.has(key)) return;

      this.kbDown.add(key);
      this.synth?.resume?.();

      const degree = (idx < 7) ? (idx + 1) : 1;
      this.playDegreeLive(degree);

      // UI highlight
      this.$('keyboard')?.querySelector(`.kkey[data-key="${key}"]`)?.classList.add('active');
    });

    document.addEventListener('keyup', (e) => {
      const key = (e.key || '').toUpperCase();
      const idx = this.kbKeys.indexOf(key);
      if (idx === -1) return;

      this.kbDown.delete(key);
      this.synth?.allNotesOff?.();

      this.$('keyboard')?.querySelector(`.kkey[data-key="${key}"]`)?.classList.remove('active');
    });
  }

  // ---------- Sequencer callback ----------
  onStepChange(step) {
    // clear previous playing
    document.querySelectorAll('.seq-step.playing').forEach((el) => el.classList.remove('playing'));

    if (step < 0) return;

    // mark this column as playing across lanes
    const grid = this.$('sequencer-grid');
    if (grid) {
      for (let lane = 0; lane < this.sequencer.lanes; lane++) {
        const el = grid.querySelector(`.seq-step[data-lane="${lane}"][data-step="${step}"]`);
        if (el) el.classList.add('playing');
      }
    }

    // LED
    const led = this.$('led');
    if (led) {
      led.classList.add('active');
      setTimeout(() => led.classList.remove('active'), 50);
    }
  }
}
