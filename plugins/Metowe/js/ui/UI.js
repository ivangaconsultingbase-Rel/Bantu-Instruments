/**
 * UI.js
 * - Sequencer steps:
 *   Tap/click => cycle degree OFF->1..7->OFF
 *   Double tap (mobile) / Ctrl+click (desktop) => Accent
 *   Long press => Octave cycle (-1,0,+1)
 * - Keyboard tactile: plays notes
 * - Controls: root, wave, chord mode, inversion, hold, met, bpm, swing, humanize, timing, glide, synth params, FX params
 */

export class UI {
  constructor(audioEngine, sequencer) {
    this.audioEngine = audioEngine;
    this.sequencer = sequencer;

    this.isMobile = this.detectMobile();

    this.stepElements = [];
    this._down = { step: null, el: null };
    this._lpTimer = null;
    this._lpTriggered = false;
    this._lastTap = { step: null, t: 0 };

    // keyboard
    this.kbdKeys = []; // {el, midi, isBlack}
    this._kbdDown = null;
  }

  // helpers
  $(id){ return document.getElementById(id); }
  setText(id, v){ const el = this.$(id); if (el) el.textContent = String(v); }

  detectMobile() {
    return (('ontouchstart' in window) ||
      (navigator.maxTouchPoints > 0) ||
      window.matchMedia('(hover: none)').matches);
  }

  init() {
    this.renderSequencer();
    this.renderKeyboard();
    this.bindEvents();
    this.initSliderFills();

    // default UI states
    this.setText('bpm-display', this.sequencer.bpm);
    this.setText('bpm-val', this.sequencer.bpm);
    this.setText('swing-display', this.sequencer.swing);
    this.setText('swing-val', `${this.sequencer.swing}%`);

    this.setText('scale-display', 'MINOR');
    this.setText('scale-root-val', this.sequencer.rootName);

    this.syncAllUIFromData();
    this.updateAllSliderFills();

    // initial labels
    this.setText('osc-wave-val', this.audioEngine.waveform);
    this.setText('glide-val', `${Math.round(this.audioEngine.glideMs)}ms`);
  }

  // ---------------- RENDER ----------------

  renderSequencer() {
    const header = this.$('seq-header');
    if (header) {
      header.innerHTML = '';
      for (let i = 0; i < 16; i++) {
        const s = document.createElement('span');
        s.textContent = String(i + 1);
        header.appendChild(s);
      }
    }

    const grid = this.$('sequencer-grid');
    if (!grid) {
      console.error('[UI] #sequencer-grid missing');
      return;
    }

    grid.innerHTML = '';
    this.stepElements = [];

    const row = document.createElement('div');
    row.className = 'seq-row';

    const label = document.createElement('div');
    label.className = 'seq-row-label';
    label.textContent = '1';
    row.appendChild(label);

    const stepsContainer = document.createElement('div');
    stepsContainer.className = 'seq-steps';

    for (let step = 0; step < 16; step++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'seq-step';
      btn.dataset.step = String(step);
      if (step % 4 === 0) btn.classList.add('beat-marker');

      const note = document.createElement('div');
      note.className = 'step-note';
      note.textContent = '';
      btn.appendChild(note);

      stepsContainer.appendChild(btn);
      this.stepElements.push(btn);
    }

    row.appendChild(stepsContainer);
    grid.appendChild(row);
  }

  renderKeyboard() {
    const kbd = this.$('keyboard');
    if (!kbd) return;

    kbd.innerHTML = '';
    this.kbdKeys = [];

    // We'll build C major layout visually, but note mapping anchored to root for scale highlighting
    // MIDI base around C4
    const baseMidi = 60; // C4
    const white = [
      { name:'C', off:0 }, { name:'D', off:2 }, { name:'E', off:4 },
      { name:'F', off:5 }, { name:'G', off:7 }, { name:'A', off:9 }, { name:'B', off:11 },
      { name:'C', off:12 },
    ];
    const black = [
      { name:'C#', off:1, pos:0.65 },
      { name:'D#', off:3, pos:1.65 },
      // no E#
      { name:'F#', off:6, pos:3.65 },
      { name:'G#', off:8, pos:4.65 },
      { name:'A#', off:10, pos:5.65 },
    ];

    // white keys
    white.forEach((w, i) => {
      const el = document.createElement('div');
      el.className = 'key';
      el.dataset.midi = String(baseMidi + w.off);
      el.textContent = w.name;
      kbd.appendChild(el);

      this.kbdKeys.push({ el, midi: baseMidi + w.off, isBlack:false });
    });

    // black keys overlay
    black.forEach((b) => {
      const el = document.createElement('div');
      el.className = 'key black';
      el.dataset.midi = String(baseMidi + b.off);
      el.textContent = b.name;

      // position in % relative to white keys
      // white keys count = 8, each = 12.5%
      const leftPct = (b.pos / 8) * 100;
      el.style.left = `${leftPct}%`;

      kbd.appendChild(el);
      this.kbdKeys.push({ el, midi: baseMidi + b.off, isBlack:true });
    });

    this.updateKeyboardScaleHighlight();
  }

  updateKeyboardScaleHighlight() {
    // highlight scale tones for current root
    // compute pitch classes in natural minor
    const rootMidi = this.sequencer.rootMidi;
    const rootPC = ((rootMidi % 12) + 12) % 12;
    const pcs = this.sequencer.scale.map(x => (rootPC + x) % 12);

    this.kbdKeys.forEach(k => {
      const pc = ((k.midi % 12) + 12) % 12;
      k.el.classList.toggle('scale', pcs.includes(pc));
    });
  }

  // ---------------- EVENTS ----------------

  bindEvents() {
    // Transport
    this.$('play-btn')?.addEventListener('click', () => this.handlePlayToggle());
    this.$('clear-btn')?.addEventListener('click', () => this.handleClear());
    this.$('met-btn')?.addEventListener('click', () => this.handleMetToggle());

    // HOLD
    this.$('hold-btn')?.addEventListener('click', () => {
      const btn = this.$('hold-btn');
      const on = !btn?.classList.contains('active');
      btn?.classList.toggle('active', on);
      this.sequencer.setHold(on);
    });

    // BPM/SWING
    this.$('bpm')?.addEventListener('input', (e) => {
      const bpm = parseInt(e.target.value, 10) || 96;
      this.sequencer.setBPM(bpm);
      this.setText('bpm-display', bpm);
      this.setText('bpm-val', bpm);
    });

    this.$('swing')?.addEventListener('input', (e) => {
      const swing = parseInt(e.target.value, 10) || 0;
      this.sequencer.setSwing(swing);
      this.setText('swing-display', swing);
      this.setText('swing-val', `${swing}%`);
    });

    // Humanize
    this.$('humanize')?.addEventListener('input', (e) => {
      const v = parseInt(e.target.value, 10) || 0;
      this.sequencer.setHumanize(v);
      this.setText('humanize-val', `${v}%`);
      this.updateSliderFillByInputId('humanize');
    });

    this.$('humanize-time')?.addEventListener('input', (e) => {
      const ms = parseInt(e.target.value, 10) || 0;
      this.sequencer.setHumanizeTime(ms);
      this.setText('humanize-time-val', `${ms}ms`);
      this.updateSliderFillByInputId('humanize-time');
    });

    // Root
    document.querySelectorAll('.seg-btn[data-root]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.seg-btn[data-root]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const root = btn.dataset.root || 'A';
        this.sequencer.setRoot(root);
        this.setText('scale-root-val', this.sequencer.rootName);
        this.updateKeyboardScaleHighlight();
      });
    });

    // Wave
    document.querySelectorAll('.seg-btn[data-wave]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.seg-btn[data-wave]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const w = btn.dataset.wave || 'SAW';
        this.audioEngine.setWaveform(w);
      });
    });

    // Chord mode
    document.querySelectorAll('.seg-btn[data-chordmode]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.seg-btn[data-chordmode]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const mode = btn.dataset.chordmode || 'TRIAD';
        this.sequencer.setChordMode(mode);
      });
    });

    // Inversion
    document.querySelectorAll('.seg-btn[data-inv]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.seg-btn[data-inv]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const inv = btn.dataset.inv || '0';
        this.sequencer.setInversion(inv);
      });
    });

    // Synth sliders
    this.bindSlider('cutoff', (v) => {
      this.audioEngine.setCutoff(v);
      this.setText('cutoff-val', v >= 1000 ? `${(v/1000).toFixed(1)}k` : `${Math.round(v)}`);
    });
    this.bindSlider('res', (v) => {
      this.audioEngine.setResonance(v);
      this.setText('res-val', Number(v).toFixed(2));
    });
    this.bindSlider('envAmt', (v) => {
      this.audioEngine.setEnvAmt(v);
      this.setText('envAmt-val', v >= 1000 ? `${(v/1000).toFixed(1)}k` : `${Math.round(v)}`);
    });
    this.bindSlider('attack', (v) => {
      this.audioEngine.setEnvAttack(v);
      this.setText('attack-val', v < 0.2 ? `${Math.round(v*1000)}ms` : `${v.toFixed(2)}s`);
    });
    this.bindSlider('decay', (v) => {
      this.audioEngine.setEnvDecay(v);
      this.setText('decay-val', v < 0.2 ? `${Math.round(v*1000)}ms` : `${v.toFixed(2)}s`);
    });
    this.bindSlider('sustain', (v) => {
      this.audioEngine.setEnvSustain(v);
      this.setText('sustain-val', Number(v).toFixed(2));
    });
    this.bindSlider('release', (v) => {
      this.audioEngine.setEnvRelease(v);
      this.setText('release-val', v < 0.2 ? `${Math.round(v*1000)}ms` : `${v.toFixed(2)}s`);
    });
    this.bindSlider('glide', (v) => {
      this.audioEngine.setGlide(v);
      this.setText('glide-val', `${Math.round(v)}ms`);
    });
    this.bindSlider('master', (v) => {
      this.audioEngine.setMaster(v / 100);
      this.setText('master-val', `${Math.round(v)}%`);
    });

    // FX sliders
    this.bindSlider('chorusMix', (v) => {
      this.audioEngine.setChorusMix(v / 100);
      this.setText('chorusMix-val', `${Math.round(v)}%`);
    });
    this.bindSlider('drive', (v) => {
      this.audioEngine.setDrive(v / 100);
      this.setText('drive-val', `${Math.round(v)}`);
    });
    this.bindSlider('crush', (v) => {
      this.audioEngine.setCrush(v / 100);
      this.setText('crush-val', `${Math.round(v)}`);
    });
    this.bindSlider('reverb', (v) => {
      this.audioEngine.setReverb(v / 100);
      this.setText('reverb-val', `${Math.round(v)}%`);
    });
    this.bindSlider('comp', (v) => {
      this.audioEngine.setComp(v / 100);
      this.setText('comp-val', `${Math.round(v)}`);
    });
    this.bindSlider('mix', (v) => {
      this.audioEngine.setFxMix(v / 100);
      this.setText('mix-val', `${Math.round(v)}%`);
    });

    // Steps
    const seq = this.$('sequencer-grid');
    if (seq) {
      seq.addEventListener('pointerdown', (e) => {
        const el = e.target.closest('.seq-step');
        if (!el) return;
        e.preventDefault();

        const step = parseInt(el.dataset.step, 10);

        this._down = { step, el };
        this._lpTriggered = false;

        // Desktop accent
        if (!this.isMobile && e.ctrlKey) {
          const on = this.sequencer.toggleAccent(step);
          el.classList.toggle('accent', on);
          this._lpTriggered = true;
          return;
        }

        // Mobile double tap accent
        if (this.isMobile) {
          const now = performance.now();
          const last = this._lastTap;
          const isDouble = last.step === step && (now - last.t) < 260;
          this._lastTap = { step, t: now };

          if (isDouble) {
            const on = this.sequencer.toggleAccent(step);
            el.classList.toggle('accent', on);
            this._lpTriggered = true;
            if (navigator.vibrate) navigator.vibrate(10);
            return;
          }
        }

        // Long press octave
        clearTimeout(this._lpTimer);
        this._lpTimer = setTimeout(() => {
          this._lpTriggered = true;
          this.sequencer.cycleOctave(step);
          this.syncStepUI(step);
          if (navigator.vibrate) navigator.vibrate(12);
        }, 330);
      }, { passive:false });

      seq.addEventListener('pointerup', () => {
        clearTimeout(this._lpTimer);

        const { step, el } = this._down;
        if (step == null || !el) return;

        if (this._lpTriggered) {
          this._down = { step:null, el:null };
          this._lpTriggered = false;
          return;
        }

        this.sequencer.cycleDegree(step);
        this.syncStepUI(step);
        if (this.isMobile && navigator.vibrate) navigator.vibrate(6);

        this._down = { step:null, el:null };
      });

      seq.addEventListener('pointercancel', () => {
        clearTimeout(this._lpTimer);
        this._down = { step:null, el:null };
        this._lpTriggered = false;
      });
    }

    // Keyboard playing
    const kbd = this.$('keyboard');
    if (kbd) {
      kbd.addEventListener('pointerdown', (e) => {
        const key = e.target.closest('.key');
        if (!key) return;
        e.preventDefault();

        const midi = parseInt(key.dataset.midi, 10);
        if (!Number.isFinite(midi)) return;

        this.audioEngine.resume();
        key.classList.add('active');
        this._kbdDown = key;

        // Simple: play single note (preview)
        this.audioEngine.playNote(midi, 0, 0.9);
      }, { passive:false });

      kbd.addEventListener('pointerup', () => {
        if (this._kbdDown) this._kbdDown.classList.remove('active');
        this._kbdDown = null;
      });

      kbd.addEventListener('pointercancel', () => {
        if (this._kbdDown) this._kbdDown.classList.remove('active');
        this._kbdDown = null;
      });
    }

    // Space = play/pause
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        this.handlePlayToggle();
      }
    });
  }

  bindSlider(id, onValue) {
    const input = this.$(id);
    if (!input) return;

    const apply = () => {
      const v = Number(input.value);
      onValue(v);
      this.updateSliderFillByInputId(id);
    };

    input.addEventListener('input', apply);
    apply();
  }

  // ---------------- TRANSPORT ----------------

  handlePlayToggle() {
    const btn = this.$('play-btn');
    if (this.sequencer.isPlaying) {
      this.sequencer.stop();
      btn?.classList.remove('active');
      this.clearPlayingIndicators();
    } else {
      this.audioEngine.resume();
      this.sequencer.start();
      btn?.classList.add('active');
    }
  }

  handleClear() {
    this.sequencer.clear();
    this.syncAllUIFromData();
    this.clearPlayingIndicators();
  }

  handleMetToggle() {
    const btn = this.$('met-btn');
    const on = !this.sequencer.metronomeEnabled;
    this.sequencer.setMetronome(on);
    btn?.classList.toggle('active', on);
  }

  // ---------------- SLIDER FILLS ----------------

  initSliderFills() {
    this.updateAllSliderFills();
  }

  updateAllSliderFills() {
    [
      'cutoff','res','envAmt','attack','decay','sustain','release','glide','master',
      'humanize','humanize-time',
      'chorusMix','drive','crush','reverb','comp','mix'
    ].forEach(id => this.updateSliderFillByInputId(id));
  }

  updateSliderFillByInputId(inputId) {
    const input = this.$(inputId);
    if (!input) return;

    const fillMap = {
      cutoff:'cutoff-fill',
      res:'res-fill',
      envAmt:'envAmt-fill',
      attack:'attack-fill',
      decay:'decay-fill',
      sustain:'sustain-fill',
      release:'release-fill',
      glide:'glide-fill',
      master:'master-fill',
      humanize:'humanize-fill',
      'humanize-time':'humanize-time-fill',
      chorusMix:'chorusMix-fill',
      drive:'drive-fill',
      crush:'crush-fill',
      reverb:'reverb-fill',
      comp:'comp-fill',
      mix:'mix-fill',
    };

    const fillId = fillMap[inputId];
    if (!fillId) return;

    const fill = this.$(fillId);
    if (!fill) return;

    const min = Number(input.min ?? 0);
    const max = Number(input.max ?? 100);
    const val = Number(input.value ?? 0);
    const pct = (max === min) ? 0 : ((val - min) / (max - min)) * 100;
    fill.style.width = `${pct}%`;
  }

  // ---------------- SEQ UI ----------------

  syncAllUIFromData() {
    for (let i = 0; i < 16; i++) this.syncStepUI(i);
  }

  syncStepUI(step) {
    const el = this.stepElements[step];
    if (!el) return;

    const s = this.sequencer.getStepState(step);
    const label = el.querySelector('.step-note');

    el.classList.toggle('active', s.degree > 0);
    el.classList.toggle('accent', !!s.accent);

    if (label) label.textContent = (s.degree > 0) ? this.sequencer.getDisplayLabel(step) : '';

    if (s.degree > 0) {
      const op = 0.55 + (s.degree / 7) * 0.45;
      el.style.opacity = String(op);
    } else {
      el.style.opacity = '';
    }
  }

  onStepChange(step) {
    this.clearPlayingIndicators();
    if (step < 0) return;

    const el = this.stepElements[step];
    if (el) el.classList.add('playing');

    const led = this.$('led');
    if (led) {
      led.classList.add('active');
      setTimeout(() => led.classList.remove('active'), 50);
    }
  }

  clearPlayingIndicators() {
    document.querySelectorAll('.seq-step.playing').forEach(el => el.classList.remove('playing'));
  }
}
