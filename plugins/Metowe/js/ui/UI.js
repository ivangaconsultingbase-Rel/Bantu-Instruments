/**
 * UI.js (AKOMGA synth) — SAFE VERSION (Safari iOS)
 * - Renders Keyboard + Sequencer grid
 * - Binds all sliders/selects
 * - No top-level references to undefined vars (fixes "Can't find variable: e")
 */

export class UI {
  constructor(synthEngine, sequencer) {
    this.synth = synthEngine;
    this.seq = sequencer;

    this.isMobile = this._detectMobile();

    // keyboard
    this.kbKeys = ["A", "S", "D", "F", "G", "H", "J", "K"];
    this.kbDegrees = [0, 1, 2, 3, 4, 5, 6, 0]; // last is octave-up root
    this.kbEls = [];
    this._heldNotes = new Map(); // idx -> midi

    // sequencer
    this.stepEls = []; // [lane][step] => button
    this._down = { lane: null, step: null, el: null };
    this._lpTimer = null;
    this._lpFired = false;
    this._lastTap = { lane: null, step: null, t: 0 };

    // visuals
    this.laneColors = ["#e63946", "#ff6b35", "#f7c948", "#2ecc71", "#4ecdc4", "#9b59b6"];
  }

  // ---------------- helpers ----------------
  $(id) { return document.getElementById(id); }
  setText(id, v) { const el = this.$(id); if (el) el.textContent = String(v); }

  _detectMobile() {
    return (("ontouchstart" in window) ||
      (navigator.maxTouchPoints > 0) ||
      (window.matchMedia && window.matchMedia("(hover: none)").matches));
  }

  // ---------------- init ----------------
  init() {
    // render
    this._renderKeyboard();
    this._renderSequencer();

    // bind
    this._bindControls();
    this._bindKeyboardComputer();

    // sync
    this._syncAllSteps();
    this._updateScaleDisplay();
  }

  // ==========================================================
  // RENDER
  // ==========================================================
  _renderKeyboard() {
    const kb = this.$("keyboard");
    if (!kb) return;

    kb.innerHTML = "";
    this.kbEls = [];

    for (let i = 0; i < this.kbKeys.length; i++) {
      const b = document.createElement("div");
      b.className = "kkey";
      b.dataset.i = String(i);
      b.textContent = this.kbKeys[i];
      kb.appendChild(b);
      this.kbEls.push(b);
    }

    // Pointer events
    kb.addEventListener("pointerdown", (ev) => {
      const keyEl = ev.target && ev.target.closest ? ev.target.closest(".kkey") : null;
      if (!keyEl) return;
      ev.preventDefault();

      const idx = parseInt(keyEl.dataset.i, 10);
      if (!Number.isFinite(idx)) return;
      this._kbNoteOn(idx);
    }, { passive: false });

    const end = (ev) => {
      const keyEl = ev.target && ev.target.closest ? ev.target.closest(".kkey") : null;
      if (!keyEl) return;
      ev.preventDefault();

      const idx = parseInt(keyEl.dataset.i, 10);
      if (!Number.isFinite(idx)) return;
      this._kbNoteOff(idx);
    };

    kb.addEventListener("pointerup", end, { passive: false });
    kb.addEventListener("pointercancel", end, { passive: false });

    kb.addEventListener("pointerleave", () => {
      // safety on mobile
      if (!this.isMobile) return;
      this._allNotesOff();
    });
  }

  _renderSequencer() {
    // header
    const header = this.$("seq-header");
    if (header) {
      header.innerHTML = "";
      for (let s = 0; s < 16; s++) {
        const sp = document.createElement("span");
        sp.textContent = String(s + 1);
        header.appendChild(sp);
      }
    }

    const grid = this.$("sequencer-grid");
    if (!grid) return;

    grid.innerHTML = "";
    this.stepEls = [];

    for (let lane = 0; lane < 6; lane++) {
      const row = document.createElement("div");
      row.className = "seq-row";

      const label = document.createElement("div");
      label.className = "seq-row-label";
      label.textContent = String(lane + 1);
      label.style.background = this.laneColors[lane] || "";
      row.appendChild(label);

      const steps = document.createElement("div");
      steps.className = "seq-steps";

      const rowEls = [];
      for (let step = 0; step < 16; step++) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "seq-step";
        b.dataset.lane = String(lane);
        b.dataset.step = String(step);
        if (step % 4 === 0) b.classList.add("beat-marker");

        const t = document.createElement("div");
        t.className = "txt";
        t.textContent = "";
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

  // ==========================================================
  // BINDINGS
  // ==========================================================
  _bindControls() {
    // PLAY
    const playBtn = this.$("play-btn");
    if (playBtn) {
      playBtn.addEventListener("click", () => {
        if (this.seq && this.seq.togglePlay) this.seq.togglePlay();
        playBtn.classList.toggle("active", !!(this.seq && this.seq.isPlaying));
      });
    }

    // CLEAR
    const clearBtn = this.$("clear-btn");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        if (this.seq && this.seq.clear) this.seq.clear();
        this._syncAllSteps();
      });
    }

    // BPM
    const bpm = this.$("bpm");
    if (bpm) {
      bpm.addEventListener("input", (ev) => {
        const v = parseInt(ev.target.value, 10) || 96;
        if (this.seq && this.seq.setBPM) this.seq.setBPM(v);
        this.setText("bpm-display", v);
        this.setText("bpm-val", v);
      });
    }

    // SWING
    const swing = this.$("swing");
    if (swing) {
      swing.addEventListener("input", (ev) => {
        const v = parseInt(ev.target.value, 10) || 0;
        if (this.seq && this.seq.setSwing) this.seq.setSwing(v);
        this.setText("swing-display", v);
        this.setText("swing-val", v + "%");
      });
    }

    // HUMANIZE
    const human = this.$("humanize");
    if (human) {
      human.addEventListener("input", (ev) => {
        const v = parseInt(ev.target.value, 10) || 0;
        if (this.seq && this.seq.setHumanize) this.seq.setHumanize(v);
        this.setText("humanize-val", v + "%");
      });
    }

    const humanT = this.$("humanize-time");
    if (humanT) {
      humanT.addEventListener("input", (ev) => {
        const v = parseInt(ev.target.value, 10) || 0;
        if (this.seq && this.seq.setHumanizeTime) this.seq.setHumanizeTime(v);
        this.setText("humanize-time-val", v + "ms");
      });
    }

    // ROOT / OCT
    const root = this.$("root");
    if (root) {
      root.addEventListener("change", (ev) => {
        const r = String(ev.target.value || "A").toUpperCase();
        if (this.seq && this.seq.setRoot) this.seq.setRoot(r);
        this._updateScaleDisplay();
      });
    }

    const oct = this.$("oct");
    if (oct) {
      oct.addEventListener("input", (ev) => {
        const v = parseInt(ev.target.value, 10) || 4;
        if (this.seq && this.seq.setOctave) this.seq.setOctave(v);
        this.setText("oct-val", v);
        this._updateScaleDisplay();
      });
    }

    // ---------------- Synth controls ----------------
    const oscWave = this.$("osc-wave");
    if (oscWave) {
      oscWave.addEventListener("change", (ev) => {
        const v = String(ev.target.value || "saw");
        if (this.synth && this.synth.setOscWave) this.synth.setOscWave(v);
        if (this.synth && this.synth.setWave) this.synth.setWave(v);
      });
    }

    const pwm = this.$("pwm");
    if (pwm) {
      pwm.addEventListener("input", (ev) => {
        const pct = parseInt(ev.target.value, 10) || 50;
        this.setText("pwm-val", pct + "%");
        if (this.synth && this.synth.setPWM) this.synth.setPWM(pct);
        if (this.synth && this.synth.setPwm) this.synth.setPwm(pct);
      });
    }

    const unison = this.$("unison");
    if (unison) {
      unison.addEventListener("input", (ev) => {
        const n = parseInt(ev.target.value, 10) || 1;
        this.setText("unison-val", n);
        if (this.synth && this.synth.setUnisonVoices) this.synth.setUnisonVoices(n);
      });
    }

    const detune = this.$("detune");
    if (detune) {
      detune.addEventListener("input", (ev) => {
        const c = parseInt(ev.target.value, 10) || 0;
        this.setText("detune-val", c + "c");
        if (this.synth && this.synth.setUnisonDetune) this.synth.setUnisonDetune(c);
      });
    }

    const cutoff = this.$("cutoff");
    if (cutoff) {
      cutoff.addEventListener("input", (ev) => {
        const hz = parseInt(ev.target.value, 10) || 2400;
        this.setText("cutoff-val", hz >= 1000 ? (hz / 1000).toFixed(1) + "k" : String(hz));
        if (this.synth && this.synth.setCutoff) this.synth.setCutoff(hz);
      });
    }

    const res = this.$("res");
    if (res) {
      res.addEventListener("input", (ev) => {
        const v = parseInt(ev.target.value, 10) || 0;
        this.setText("res-val", v);
        if (this.synth && this.synth.setResonance) this.synth.setResonance(v / 100);
      });
    }

    const fenv = this.$("fenv");
    if (fenv) {
      fenv.addEventListener("input", (ev) => {
        const v = parseInt(ev.target.value, 10) || 0;
        this.setText("fenv-val", v);
        if (this.synth && this.synth.setFilterEnv) this.synth.setFilterEnv(v / 100);
      });
    }

    // ADSR
    const updADSR = () => {
      const a = parseInt((this.$("atk") && this.$("atk").value) || "10", 10);
      const d = parseInt((this.$("dec") && this.$("dec").value) || "250", 10);
      const s = parseInt((this.$("sus") && this.$("sus").value) || "70", 10);
      const r = parseInt((this.$("rel") && this.$("rel").value) || "500", 10);

      this.setText("atk-val", a + "ms");
      this.setText("dec-val", d + "ms");
      this.setText("sus-val", s + "%");
      this.setText("rel-val", r + "ms");

      if (this.synth && this.synth.setADSR) this.synth.setADSR(a, d, s, r);
      if (this.synth && this.synth.setEnv) this.synth.setEnv(a, d, s, r);
    };

    const atk = this.$("atk");
    const dec = this.$("dec");
    const sus = this.$("sus");
    const rel = this.$("rel");

    if (atk) atk.addEventListener("input", updADSR);
    if (dec) dec.addEventListener("input", updADSR);
    if (sus) sus.addEventListener("input", updADSR);
    if (rel) rel.addEventListener("input", updADSR);
    updADSR();

    // ---------------- FX controls ----------------
    const bindFx = (id, valId, fnName) => {
      const el = this.$(id);
      if (!el) return;
      el.addEventListener("input", (ev) => {
        const v = parseInt(ev.target.value, 10) || 0;
        this.setText(valId, v + "%");
        const mix01 = Math.max(0, Math.min(1, v / 100));
        if (this.synth && typeof this.synth[fnName] === "function") {
          this.synth[fnName](mix01);
        }
      });
    };

    bindFx("fx-chorus", "fx-chorus-val", "setChorusMix");
    bindFx("fx-crush", "fx-crush-val", "setCrushAmt");
    bindFx("fx-drive", "fx-drive-val", "setDriveMix");
    bindFx("fx-comp", "fx-comp-val", "setCompAmt");
    bindFx("fx-rev", "fx-rev-val", "setReverbMix");
  }

  _bindKeyboardComputer() {
    document.addEventListener("keydown", (ev) => {
      const k = String(ev.key || "").toUpperCase();

      if (ev.code === "Space") {
        ev.preventDefault();
        if (this.seq && this.seq.togglePlay) this.seq.togglePlay();
        const playBtn = this.$("play-btn");
        if (playBtn) playBtn.classList.toggle("active", !!(this.seq && this.seq.isPlaying));
        return;
      }

      const idx = this.kbKeys.indexOf(k);
      if (idx === -1) return;
      if (ev.repeat) return;

      ev.preventDefault();
      this._kbNoteOn(idx);
    });

    document.addEventListener("keyup", (ev) => {
      const k = String(ev.key || "").toUpperCase();
      const idx = this.kbKeys.indexOf(k);
      if (idx === -1) return;
      ev.preventDefault();
      this._kbNoteOff(idx);
    });
  }

  _bindSequencerPointer(gridEl) {
    gridEl.addEventListener("pointerdown", (ev) => {
      const stepEl = ev.target && ev.target.closest ? ev.target.closest(".seq-step") : null;
      if (!stepEl) return;

      ev.preventDefault();

      const lane = parseInt(stepEl.dataset.lane, 10);
      const step = parseInt(stepEl.dataset.step, 10);
      if (!Number.isFinite(lane) || !Number.isFinite(step)) return;

      this._down = { lane, step, el: stepEl };
      this._lpFired = false;

      clearTimeout(this._lpTimer);
      this._lpTimer = setTimeout(() => {
        this._lpFired = true;
        this._longPressStep(lane, step);
        if (this.isMobile && navigator.vibrate) navigator.vibrate(12);
      }, 340);
    }, { passive: false });

    gridEl.addEventListener("pointerup", (ev) => {
      clearTimeout(this._lpTimer);

      const lane = this._down.lane;
      const step = this._down.step;
      const el = this._down.el;

      if (lane == null || step == null || !el) return;

      if (this._lpFired) {
        this._down = { lane: null, step: null, el: null };
        this._lpFired = false;
        return;
      }

      const now = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
      const last = this._lastTap;
      const isDouble = (last.lane === lane && last.step === step && (now - last.t) < 260);
      this._lastTap = { lane, step, t: now };

      if (isDouble) {
        if (this.seq && this.seq.toggleChord) this.seq.toggleChord(lane, step);
      } else {
        const evObj = (this.seq && this.seq.getEvent) ? this.seq.getEvent(lane, step) : null;
        if (!evObj || !evObj.on) {
          if (this.seq && this.seq.toggleStep) this.seq.toggleStep(lane, step);
        } else {
          if (this.seq && this.seq.cycleDegree) this.seq.cycleDegree(lane, step);
        }
      }

      this._syncOneStep(lane, step);

      if (this.isMobile && navigator.vibrate) navigator.vibrate(8);

      this._down = { lane: null, step: null, el: null };
    }, { passive: false });

    gridEl.addEventListener("pointercancel", () => {
      clearTimeout(this._lpTimer);
      this._down = { lane: null, step: null, el: null };
      this._lpFired = false;
    });
  }

  // ==========================================================
  // KEYBOARD NOTE MAPPING
  // ==========================================================
  _kbNoteOn(idx) {
    const el = this.kbEls[idx];
    if (el) el.classList.add("active");

    const degree = this.kbDegrees[idx] != null ? this.kbDegrees[idx] : 0;
    const octave = parseInt((this.$("oct") && this.$("oct").value) || "4", 10) || 4;
    const root = String((this.$("root") && this.$("root").value) || "A").toUpperCase();

    const base = this._rootMidi(root, octave);
    const scale = [0, 2, 3, 5, 7, 8, 10];

    let midi = base + scale[((degree % 7) + 7) % 7];
    if (idx === this.kbKeys.length - 1) midi += 12;

    this._heldNotes.set(String(idx), midi);

    if (this.synth && this.synth.noteOn) this.synth.noteOn(midi, 1);
    this._flashLed();
  }

  _kbNoteOff(idx) {
    const el = this.kbEls[idx];
    if (el) el.classList.remove("active");

    const midi = this._heldNotes.get(String(idx));
    if (midi != null) {
      if (this.synth && this.synth.noteOff) this.synth.noteOff(midi);
      this._heldNotes.delete(String(idx));
    }
  }

  _allNotesOff() {
    for (const [k, midi] of this._heldNotes.entries()) {
      try { if (this.synth && this.synth.noteOff) this.synth.noteOff(midi); } catch (_) {}
      this._heldNotes.delete(k);
    }
    for (let i = 0; i < this.kbEls.length; i++) this.kbEls[i].classList.remove("active");
  }

  _rootMidi(root, octave) {
    const map = { C: 60, D: 62, E: 64, F: 65, G: 67, A: 69, B: 71 };
    const base = map[root] != null ? map[root] : 69;
    return (octave * 12) + (base % 12);
  }

  _updateScaleDisplay() {
    const root = String((this.$("root") && this.$("root").value) || "A").toUpperCase();
    this.setText("scale-display", root + " MIN");
  }

  // ==========================================================
  // STEP VISUALS
  // ==========================================================
  _syncAllSteps() {
    for (let lane = 0; lane < 6; lane++) {
      for (let step = 0; step < 16; step++) {
        this._syncOneStep(lane, step);
      }
    }
  }

  _syncOneStep(lane, step) {
    const el = this.stepEls && this.stepEls[lane] ? this.stepEls[lane][step] : null;
    if (!el) return;

    const evObj = (this.seq && this.seq.getEvent) ? this.seq.getEvent(lane, step) : null;
    const on = !!(evObj && evObj.on);
    const chord = !!(evObj && evObj.chord);
    const mute = !!(evObj && evObj.mute);

    el.classList.toggle("active", on);
    el.classList.toggle("chord", on && chord);
    el.classList.toggle("muted", on && mute);

    const txt = el.querySelector ? el.querySelector(".txt") : null;
    if (txt) {
      if (!on) txt.textContent = "";
      else if (mute) txt.textContent = "M";
      else {
        const d = (((evObj.degree || 0) % 7) + 7) % 7;
        txt.textContent = chord ? String(d + 1) + "△" : String(d + 1);
      }
    }

    const vel = Math.max(0, Math.min(1, Number(evObj && evObj.vel != null ? evObj.vel : 0.85)));
    el.style.opacity = on ? String(0.55 + 0.45 * vel) : "";
  }

  _longPressStep(lane, step) {
    const evObj = (this.seq && this.seq.getEvent) ? this.seq.getEvent(lane, step) : null;
    if (!evObj || !evObj.on) return;

    // cycle on -> mute -> off
    if (!evObj.mute) {
      if (this.seq && this.seq.toggleMute) this.seq.toggleMute(lane, step);
    } else {
      if (this.seq && this.seq.toggleMute) this.seq.toggleMute(lane, step); // unmute
      if (this.seq && this.seq.toggleStep) this.seq.toggleStep(lane, step); // off
    }
    this._syncOneStep(lane, step);
  }

  // ==========================================================
  // SEQUENCER CALLBACK
  // ==========================================================
  onStepChange(step) {
    const playing = document.querySelectorAll(".seq-step.playing");
    for (let i = 0; i < playing.length; i++) playing[i].classList.remove("playing");
    if (step < 0) return;

    for (let lane = 0; lane < 6; lane++) {
      const el = this.stepEls && this.stepEls[lane] ? this.stepEls[lane][step] : null;
      if (el) el.classList.add("playing");
    }
    this._flashLed(50);
  }

  _flashLed(ms = 100) {
    const led = this.$("led");
    if (!led) return;
    led.classList.add("active");
    setTimeout(() => led.classList.remove("active"), ms);
  }
}
