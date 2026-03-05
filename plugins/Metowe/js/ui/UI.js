/**
 * UI.js (AKOMGA synth)
 * - Renders Keyboard + Sequencer grid
 * - Mobile gestures:
 *   - Step tap: note (cycle degree) / if off -> on
 *   - Step double tap: chord triad toggle
 *   - Step long press: on->mute->off
 * - Transport: Play/Stop via play button + Space
 * - Controls: BPM, Swing, Humanize, Timing, Root, Oct
 * - Synth controls: wave, pwm, unison, detune, cutoff, res, fenv, adsr
 * - FX controls: chorus, crush, drive, comp, rev (UI only unless SynthEngine exposes setters)
 */

export class UI {
  constructor(synthEngine, sequencer) {
    this.synth = synthEngine;
    this.seq = sequencer;

    this.isMobile = this._detectMobile();

    // keyboard
    this.kbKeys = ['A','S','D','F','G','H','J','K'];
    this.kbDegrees = [0,1,2,3,4,5,6,0]; // last is octave-up root
    this.kbEls = [];
    this._heldNotes = new Map(); // key -> midi note

    // sequencer steps
    this.stepEls = []; // [lane][step] => button
    this._down = { lane:null, step:null, el:null, t:0 };
    this._lpTimer = null;
    this._lpFired = false;
    this._lastTap = { lane:null, step:null, t:0 };

    // visuals
    this.laneColors = ['#e63946', '#ff6b35', '#f7c948', '#2ecc71', '#4ecdc4', '#9b59b6'];
  }

  // ---------- helpers ----------
  $(id){ return document.getElementById(id); }
  setText(id, v){ const el=this.$(id); if(el) el.textContent=String(v); }

  _detectMobile(){
    return (('ontouchstart' in window) ||
      (navigator.maxTouchPoints > 0) ||
      window.matchMedia('(hover: none)').matches);
  }

  init() {
    this._renderKeyboard();
    this._renderSequencer();
    this._bindControls();
    this._bindKeyboardComputer();

    // sync UI from sequencer state
    this._syncAllSteps();

    // LCD scale
    this._updateScaleDisplay();
  }

  // =========================================
  // RENDER
  // =========================================
  _renderKeyboard() {
    const kb = this.$('keyboard');
    if (!kb) return;

    kb.innerHTML = '';
    this.kbEls = [];

    for (let i = 0; i < this.kbKeys.length; i++) {
      const b = document.createElement('div');
      b.className = 'kkey';
      b.dataset.k = this.kbKeys[i];
      b.dataset.i = String(i);
      b.textContent = this.kbKeys[i];
      kb.appendChild(b);
      this.kbEls.push(b);
    }

    // pointer support
    kb.addEventListener('pointerdown', (e) => {
      const keyEl = e.target.closest('.kkey');
      if (!keyEl) return;
      e.preventDefault();

      const idx = parseInt(keyEl.dataset.i, 10);
      this._kbNoteOn(idx);
    }, { passive:false });

    const end = (e) => {
      const keyEl = e.target.closest?.('.kkey');
      if (!keyEl) return;
      e.preventDefault();

      const idx = parseInt(keyEl.dataset.i, 10);
      this._kbNoteOff(idx);
    };

    kb.addEventListener('pointerup', end, { passive:false });
    kb.addEventListener('pointercancel', end, { passive:false });
    kb.addEventListener('pointerleave', (e) => {
      // safety: release all notes when leaving the keyboard area on mobile
      if (!this.isMobile) return;
      this._allNotesOff();
    });
  }

  _renderSequencer() {
    // header
    const header = this.$('seq-header');
    if (header) {
      header.innerHTML = '';
      for (let s=0; s<16; s++){
        const sp = document.createElement('span');
        sp.textContent = String(s+1);
        header.appendChild(sp);
      }
    }

    const grid = this.$('sequencer-grid');
    if (!grid) return;

    grid.innerHTML = '';
    this.stepEls = [];

    for (let lane = 0; lane < 6; lane++) {
      const row = document.createElement('div');
      row.className = 'seq-row';

      const label = document.createElement('div');
      label.className = 'seq-row-label';
      label.textContent = String(lane + 1);
      label.style.background = this.laneColors[lane] || '';
      row.appendChild(label);

      const steps = document.createElement('div');
      steps.className = 'seq-steps';

      const rowEls = [];
      for (let step=0; step<16; step++){
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'seq-step';
        b.dataset.lane = String(lane);
        b.dataset.step = String(step);
        if (step % 4 === 0) b.classList.add('beat-marker');

        const t = document.createElement('div');
        t.className = 'txt';
        t.textContent = '';
        b.appendChild(t);

        steps.appendChild(b);
        rowEls.push(b);
      }

      row.appendChild(steps);
      grid.appendChild(row);
      this.stepEls.push(rowEls);
    }

    this._bindSequencerPointer(grid);
  }

  // =========================================
  // CONTROLS + BINDINGS
  // =========================================
  _bindControls() {
    // PLAY
    this.$('play-btn')?.addEventListener('click', () => {
      this.seq.togglePlay?.();
      this.$('play-btn')?.classList.toggle('active', !!this.seq.isPlaying);
    });

    // CLEAR
    this.$('clear-btn')?.addEventListener('click', () => {
      this.seq.clear?.();
      this._syncAllSteps();
    });

    // BPM / SWING
    this.$('bpm')?.addEventListener('input', (e) => {
      const v = parseInt(e.target.value, 10) || 96;
      this.seq.setBPM?.(v);
      this.setText('bpm-display', v);
      this.setText('bpm-val', v);
    });

    this.$('swing')?.addEventListener('input', (e) => {
      const v = parseInt(e.target.value, 10) || 0;
      this.seq.setSwing?.(v);
      this.setText('swing-display', v);
      this.setText('swing-val', `${v}%`);
    });

    // HUMANIZE
    this.$('humanize')?.addEventListener('input', (e) => {
      const v = parseInt(e.target.value, 10) || 0;
      this.seq.setHumanize?.(v);
      this.setText('humanize-val', `${v}%`);
    });

    this.$('humanize-time')?.addEventListener('input', (e) => {
      const v = parseInt(e.target.value, 10) || 0;
      this.seq.setHumanizeTime?.(v);
      this.setText('humanize-time-val', `${v}ms`);
    });

    // ROOT / OCT
    this.$('root')?.addEventListener('change', (e) => {
      const root = String(e.target.value || 'A').toUpperCase();
      this.seq.setRoot?.(root);
      this._updateScaleDisplay();
    });

    this.$('oct')?.addEventListener('input', (e) => {
      const v = parseInt(e.target.value, 10) || 4;
      this.seq.setOctave?.(v);
      this.setText('oct-val', v);
      this._updateScaleDisplay();
    });

    // =======================
    // SYNTH CONTROLS (defensive)
    // =======================
    this.$('osc-wave')?.addEventListener('change', (e) => {
      const v = String(e.target.value || 'saw');
      this.synth.setOscWave?.(v);     // if implemented in SynthEngine
      this.synth.setWave?.(v);        // alternative naming
      // no crash if absent
    });

    this.$('pwm')?.addEventListener('input', (e) => {
      const pct = parseInt(e.target.value, 10) || 50;
      this.setText('pwm-val', `${pct}%`);
      this.synth.setPWM?.(pct);
      this.synth.setPwm?.(pct);
    });

    this.$('unison')?.addEventListener('input', (e) => {
      const n = parseInt(e.target.value, 10) || 1;
      this.setText('unison-val', n);
      this.synth.setUnisonVoices?.(n);
    });

    this.$('detune')?.addEventListener('input', (e) => {
      const c = parseInt(e.target.value, 10) || 0;
      this.setText('detune-val', `${c}c`);
      this.synth.setUnisonDetune?.(c);
    });

    // VCF / ADSR (these require SynthEngine to forward to voices)
    this.$('cutoff')?.addEventListener('input', (e) => {
      const hz = parseInt(e.target.value, 10) || 2400;
      this.setText('cutoff-val', hz >= 1000 ? `${(hz/1000).toFixed(1)}k` : `${hz}`);
      this.synth.setCutoff?.(hz);
      this.synth.setFilterCutoff?.(hz);
    });

    this.$('res')?.addEventListener('input', (e) => {
      const v = parseInt(e.target.value, 10) || 0;
      this.setText('res-val', v);
      this.synth.setResonance?.(v/100);
      this.synth.setRes?.(v/100);
    });

    this.$('fenv')?.addEventListener('input', (e) => {
      const v = parseInt(e.target.value, 10) || 0;
      this.setText('fenv-val', v);
      this.synth.setFilterEnv?.(v/100);
      this.synth.setFilterEnvAmt?.(v/100);
    });

    const updADSR = () => {
      const a = parseInt(this.$('atk')?.value || '10', 10);
      const d = parseInt(this.$('dec')?.value || '250', 10);
      const s = parseInt(this.$('sus')?.value || '70', 10);
      const r = parseInt(this.$('rel')?.value || '500', 10);

      this.setText('atk-val', `${a}ms`);
      this.setText('dec-val', `${d}ms`);
      this.setText('sus-val', `${s}%`);
      this.setText('rel-val', `${r}ms`);

      this.synth.setADSR?.(a, d, s, r);
      this.synth.setEnv?.(a, d, s, r);
    };

    this.$('atk')?.addEventListener('input', updADSR);
    this.$('dec')?.addEventListener('input', updADSR);
    this.$('sus')?.addEventListener('input', updADSR);
    this.$('rel')?.addEventListener('input', updADSR);
    updADSR();

    // =======================
    // FX CONTROLS (UI-only unless SynthEngine exposes methods)
    // =======================
    const bindFx = (id, valId, fnName) => {
      this.$(id)?.addEventListener('input', (e) => {
        const v = parseInt(e.target.value, 10) || 0;
        this.setText(valId, `${v}%`);
        const mix01 = Math.max(0, Math.min(1, v / 100));
        this.synth[fnName]?.(mix01);
      });
    };

    bindFx('fx-chorus','fx-chorus-val','setChorusMix');
    bindFx('fx-crush','fx-crush-val','setCrushAmt');
    bindFx('fx-drive','fx-drive-val','setDriveMix');
    bindFx('fx-comp','fx-comp-val','setCompAmt');
    bindFx('fx-rev','fx-rev-val','setReverbMix');
  }

  _bindKeyboardComputer() {
    // computer keyboard: A S D F G H J K triggers notes
    document.addEventListener('keydown', (e) => {
      const k = String(e.key || '').toUpperCase();

      if (e.code === 'Space') {
        e.preventDefault();
        this.seq.togglePlay?.();
        this.$('play-btn')?.classList.toggle('active', !!this.seq.isPlaying);
        return;
      }

      const idx = this.kbKeys.indexOf(k);
      if (idx === -1) return;

      if (e.repeat) return;
      e.preventDefault();
      this._kbNoteOn(idx);
    });

    document.addEventListener('keyup', (e) => {
      const k = String(e.key || '').toUpperCase();
      const idx = this.kbKeys.indexOf(k);
      if (idx === -1) return;
      e.preventDefault();
      this._kbNoteOff(idx);
    });
  }

  _bindSequencerPointer(gridEl) {
    gridEl.addEventListener('pointerdown', (e) => {
      const stepEl = e.target.closest('.seq-step');
      if (!stepEl) return;

      e.preventDefault();

      const lane = parseInt(stepEl.dataset.lane, 10);
      const step = parseInt(stepEl.dataset.step, 10);

      this._down = { lane, step, el: stepEl, t: performance.now() };
      this._lpFired = false;

      // long press timer
      clearTimeout(this._lpTimer);
      this._lpTimer = setTimeout(() => {
        this._lpFired = true;
        this._longPressStep(lane, step);
        if (this.isMobile && navigator.vibrate) navigator.vibrate(12);
      }, 340);

    }, { passive:false });

    gridEl.addEventListener('pointerup', (e) => {
      clearTimeout(this._lpTimer);

      const { lane, step, el } = this._down;
      if (lane == null || step == null || !el) return;

      // if long press already executed => ignore tap
      if (this._lpFired) {
        this._down = { lane:null, step:null, el:null, t:0 };
        this._lpFired = false;
        return;
      }

      // double tap = chord toggle
      const now = performance.now();
      const last = this._lastTap;
      const isDouble = (last.lane === lane && last.step === step && (now - last.t) < 260);
      this._lastTap = { lane, step, t: now };

      if (isDouble) {
        this.seq.toggleChord?.(lane, step);
      } else {
        // single tap: if off -> on, else cycle degree
        const ev = this.seq.getEvent?.(lane, step);
        if (!ev?.on) this.seq.toggleStep?.(lane, step);
        else this.seq.cycleDegree?.(lane, step);
      }

      // update appearance
      this._syncOneStep(lane, step);

      if (this.isMobile && navigator.vibrate) navigator.vibrate(8);

      this._down = { lane:null, step:null, el:null, t:0 };
    }, { passive:false });

    gridEl.addEventListener('pointercancel', () => {
      clearTimeout(this._lpTimer);
      this._down = { lane:null, step:null, el:null, t:0 };
      this._lpFired = false;
    });
  }

  // =========================================
  // KEYBOARD NOTE MAPPING
  // =========================================
  _kbNoteOn(idx) {
    const el = this.kbEls[idx];
    if (el) el.classList.add('active');

    // compute midi note in current root minor scale
    const degree = this.kbDegrees[idx] ?? 0;
    const octave = parseInt(this.$('oct')?.value || '4', 10) || 4;
    const root = String(this.$('root')?.value || 'A').toUpperCase();

    const base = this._rootMidi(root, octave);
    const scale = [0,2,3,5,7,8,10];

    let midi = base + scale[(degree % 7 + 7) % 7];
    // last key = octave-up root
    if (idx === this.kbKeys.length - 1) midi += 12;

    this._heldNotes.set(String(idx), midi);

    // play
    this.synth.noteOn?.(midi, 1);
    this._flashLed();
  }

  _kbNoteOff(idx) {
    const el = this.kbEls[idx];
    if (el) el.classList.remove('active');

    const midi = this._heldNotes.get(String(idx));
    if (midi != null) {
      this.synth.noteOff?.(midi);
      this._heldNotes.delete(String(idx));
    }
  }

  _allNotesOff() {
    for (const [k, midi] of this._heldNotes.entries()) {
      try { this.synth.noteOff?.(midi); } catch {}
      this._heldNotes.delete(k);
    }
    this.kbEls.forEach(el => el.classList.remove('active'));
  }

  _rootMidi(root, octave) {
    const map = { C: 60, D: 62, E: 64, F: 65, G: 67, A: 69, B: 71 };
    const base = map[root] ?? 69;
    // place into chosen octave
    return (octave * 12) + (base % 12);
  }

  _updateScaleDisplay() {
    const root = String(this.$('root')?.value || 'A').toUpperCase();
    this.setText('scale-display', `${root} MIN`);
  }

  // =========================================
  // STEP VISUALS
  // =========================================
  _syncAllSteps() {
    for (let lane=0; lane<6; lane++){
      for (let step=0; step<16; step++){
        this._syncOneStep(lane, step);
      }
    }
  }

  _syncOneStep(lane, step) {
    const el = this.stepEls?.[lane]?.[step];
    if (!el) return;

    const ev = this.seq.getEvent?.(lane, step);
    const on = !!ev?.on;
    const chord = !!ev?.chord;
    const mute = !!ev?.mute;

    el.classList.toggle('active', on);
    el.classList.toggle('chord', on && chord);
    el.classList.toggle('muted', on && mute);

    const txt = el.querySelector('.txt');
    if (txt) {
      if (!on) {
        txt.textContent = '';
      } else if (mute) {
        txt.textContent = 'M';
      } else {
        // explicit: degree 1..7 + chord marker
        const d = ((ev.degree ?? 0) % 7 + 7) % 7;
        txt.textContent = chord ? `${d+1}△` : `${d+1}`;
      }
    }

    // opacity hint by velocity if present
    const vel = Math.max(0, Math.min(1, Number(ev?.vel ?? 0.85)));
    el.style.opacity = on ? String(0.55 + 0.45 * vel) : '';
  }

  _longPressStep(lane, step) {
    const ev = this.seq.getEvent?.(lane, step);
    if (!ev?.on) return; // do nothing if off

    // cycle on -> mute -> off
    if (!ev.mute) {
      this.seq.toggleMute?.(lane, step); // becomes mute
    } else {
      // mute -> off
      this.seq.toggleMute?.(lane, step); // unmute
      this.seq.toggleStep?.(lane, step); // off
    }
    this._syncOneStep(lane, step);
  }

  // =========================================
  // SEQUENCER CALLBACK
  // =========================================
  onStepChange(step) {
    // clear previous playing
    document.querySelectorAll('.seq-step.playing').forEach(el => el.classList.remove('playing'));
    if (step < 0) return;

    // highlight current column
    for (let lane=0; lane<6; lane++){
      const el = this.stepEls?.[lane]?.[step];
      if (el) el.classList.add('playing');
    }
    this._flashLed(50);
  }

  _flashLed(ms=100) {
    const led = this.$('led');
    if (!led) return;
    led.classList.add('active');
    setTimeout(() => led.classList.remove('active'), ms);
  }
}
