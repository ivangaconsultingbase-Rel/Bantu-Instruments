// js/ui/UI.js
export class UI {
  constructor(audioEngine, sequencer) {
    this.audioEngine = audioEngine;
    this.sequencer = sequencer;

    this.isMobile = (('ontouchstart' in window) ||
      (navigator.maxTouchPoints > 0) ||
      window.matchMedia('(hover: none)').matches);

    this.stepElements = [];
    this._lastTap = { step: -1, t: 0 };
    this._lpTimer = null;
    this._lpTriggered = false;
    this._downStepEl = null;
  }

  $(id) { return document.getElementById(id); }

  init() {
    this.renderSequencer();
    this.bindTransport();
    this.bindTempoHumanize();
    this.bindSynthParams();
    this.bindChorusControls();
    this.bindSynthPresets();
    this.syncAllFills();
    this.syncSequencerUI();
  }

  // ---------------- SEQUENCER UI ----------------
  renderSequencer() {
    const header = this.$("seq-header");
    if (header) {
      header.innerHTML = "";
      for (let i = 0; i < 16; i++) {
        const s = document.createElement("span");
        s.textContent = String(i + 1);
        header.appendChild(s);
      }
    }

    const grid = this.$("sequencer-grid");
    if (!grid) return;

    grid.innerHTML = "";
    this.stepElements = [];

    // single row note sequencer (like Elektron trig row)
    const row = document.createElement("div");
    row.className = "seq-row";

    const label = document.createElement("div");
    label.className = "seq-row-label";
    label.textContent = "N";
    row.appendChild(label);

    const steps = document.createElement("div");
    steps.className = "seq-steps";

    for (let step = 0; step < 16; step++) {
      const b = document.createElement("button");
      b.className = "seq-step";
      b.type = "button";
      b.dataset.step = String(step);
      b.title = "Tap: note · Double: accent · Long: octave";
      b.innerHTML = `<span class="step-note" style="font-size:10px; font-family: JetBrains Mono, monospace;"></span>`;
      steps.appendChild(b);
      this.stepElements.push(b);
    }

    row.appendChild(steps);
    grid.appendChild(row);

    // events
    grid.addEventListener("pointerdown", (e) => {
      const el = e.target.closest(".seq-step");
      if (!el) return;
      e.preventDefault();

      this._downStepEl = el;
      this._lpTriggered = false;

      const step = parseInt(el.dataset.step, 10);

      // double tap = accent
      if (this.isMobile) {
        const now = performance.now();
        const isDouble = (this._lastTap.step === step && (now - this._lastTap.t) < 260);
        this._lastTap = { step, t: now };
        if (isDouble) {
          this.toggleAccent(step);
          this._lpTriggered = true;
          if (navigator.vibrate) navigator.vibrate(10);
          return;
        }
      } else if (e.ctrlKey) {
        this.toggleAccent(step);
        this._lpTriggered = true;
        return;
      }

      // long press => octave cycle
      clearTimeout(this._lpTimer);
      this._lpTimer = setTimeout(() => {
        this._lpTriggered = true;
        this.cycleOctave(step);
        if (navigator.vibrate) navigator.vibrate(12);
      }, 320);
    }, { passive: false });

    grid.addEventListener("pointerup", () => {
      clearTimeout(this._lpTimer);
      const el = this._downStepEl;
      this._downStepEl = null;
      if (!el) return;

      const step = parseInt(el.dataset.step, 10);
      if (this._lpTriggered) {
        this._lpTriggered = false;
        return;
      }

      // click/tap => cycle note
      this.cycleNote(step);
      if (this.isMobile && navigator.vibrate) navigator.vibrate(8);
    });

    grid.addEventListener("pointercancel", () => {
      clearTimeout(this._lpTimer);
      this._downStepEl = null;
      this._lpTriggered = false;
    });
  }

  cycleNote(step) {
    const st = this.sequencer.pattern[step];
    // degree: -1 rest -> 0..6
    if (st.degree < 0) st.degree = 0;
    else if (st.degree >= 6) st.degree = -1;
    else st.degree += 1;

    this.syncStepUI(step);
  }

  cycleOctave(step) {
    const st = this.sequencer.pattern[step];
    const o = Number(st.octave || 0);
    st.octave = (o >= 2) ? -1 : (o + 1);
    this.syncStepUI(step);
  }

  toggleAccent(step) {
    const st = this.sequencer.pattern[step];
    st.accent = !st.accent;
    this.syncStepUI(step);
  }

  noteLabel(stepObj) {
    if (!stepObj || stepObj.degree < 0) return "—";
    const names = ["C","D","Eb","F","G","Ab","Bb"];
    const d = stepObj.degree % 7;
    const o = Number(stepObj.octave || 0);
    return `${names[d]}${3+o}`; // rootMidi=48 => C3
  }

  syncStepUI(step) {
    const el = this.stepElements[step];
    if (!el) return;

    const st = this.sequencer.pattern[step];
    const on = st.degree >= 0;

    el.classList.toggle("active", on);
    el.classList.toggle("accent", !!st.accent);

    const note = el.querySelector(".step-note");
    if (note) note.textContent = this.noteLabel(st);

    // opacity by velocity
    const v = Math.max(0, Math.min(1, Number(st.vel ?? 0.85)));
    el.style.opacity = on ? String(0.35 + 0.65 * v) : "";
  }

  syncSequencerUI() {
    for (let i = 0; i < 16; i++) this.syncStepUI(i);
  }

  onStepChange(step) {
    document.querySelectorAll(".seq-step.playing").forEach(x => x.classList.remove("playing"));
    if (step < 0) return;

    const el = this.stepElements[step];
    if (el) el.classList.add("playing");
  }

  // ---------------- TRANSPORT / TEMPO ----------------
  bindTransport() {
    const playBtn = this.$("play-btn");
    playBtn?.addEventListener("click", async () => {
      await this.audioEngine.resume();
      if (this.sequencer.isPlaying) {
        this.sequencer.stop();
        playBtn.classList.remove("active");
        this.onStepChange(-1);
      } else {
        this.sequencer.start();
        playBtn.classList.add("active");
      }
    });

    // si tu as clear
    this.$("clear-btn")?.addEventListener("click", () => {
      // reset pattern
      this.sequencer.pattern.forEach((s, i) => {
        s.degree = -1;
        s.accent = false;
        s.vel = 0.85;
        s.octave = 0;
      });
      this.syncSequencerUI();
    });
  }

  bindTempoHumanize() {
    this.$("bpm")?.addEventListener("input", (e) => {
      const bpm = parseInt(e.target.value, 10) || 90;
      this.sequencer.setBPM(bpm);
      this.$("bpm-display") && (this.$("bpm-display").textContent = bpm);
      this.$("bpm-val") && (this.$("bpm-val").textContent = bpm);
    });

    this.$("swing")?.addEventListener("input", (e) => {
      const s = parseInt(e.target.value, 10) || 0;
      this.sequencer.setSwing(s);
      this.$("swing-display") && (this.$("swing-display").textContent = s);
      this.$("swing-val") && (this.$("swing-val").textContent = `${s}%`);
    });

    this.$("humanize")?.addEventListener("input", (e) => {
      const v = parseInt(e.target.value, 10) || 0;
      this.sequencer.setHumanize(v);
      this.$("humanize-val") && (this.$("humanize-val").textContent = `${v}%`);
    });

    this.$("humanize-time")?.addEventListener("input", (e) => {
      const ms = parseInt(e.target.value, 10) || 0;
      this.sequencer.setHumanizeTime(ms);
      this.$("humanize-time-val") && (this.$("humanize-time-val").textContent = `${ms}ms`);
    });
  }

  // ---------------- SYNTH PARAMS ----------------
  bindSynthParams() {
    const bind = (id, name, fmt, fillId) => {
      const input = this.$(id);
      const valEl = this.$(`${id}-val`) || this.$(`${name}-val`);
      const fill = this.$(fillId || `${id}-fill`);

      if (!input) return;

      const apply = async () => {
        await this.audioEngine.resume();
        const v = Number(input.value);
        this.audioEngine.setParam(name, v);
        if (valEl) valEl.textContent = fmt ? fmt(v) : String(v);
        this._fillFromInput(input, fill);
      };

      input.addEventListener("input", apply, { passive: true });
      apply();
    };

    bind("cutoff", "cutoff", (v) => `${(v/1000).toFixed(1)}k`, "cutoff-fill");
    bind("envAmt", "envAmt", (v) => `${(v/1000).toFixed(1)}k`, "envAmt-fill");
    bind("res", "res", (v) => `${v.toFixed(2)}`, "res-fill");

    bind("attack", "attack", (v) => `${Math.round(v*1000)}ms`, "attack-fill");
    bind("decay", "decay", (v) => `${Math.round(v*1000)}ms`, "decay-fill");
    bind("release", "release", (v) => `${Math.round(v*1000)}ms`, "release-fill");

    bind("waveMix", "waveMix", (v) => `${v.toFixed(2)}`, "waveMix-fill");
    bind("sub", "sub", (v) => `${v.toFixed(2)}`, "sub-fill");
    bind("noise", "noise", (v) => `${v.toFixed(3)}`, "noise-fill");
  }

  // ---------------- CHORUS ----------------
  bindChorusControls() {
    const bind = (id, name, fmt, fillId) => {
      const input = this.$(id);
      const valEl = this.$(`${id}-val`);
      const fill = this.$(fillId);

      if (!input) return;

      const apply = async () => {
        await this.audioEngine.resume();
        let v = Number(input.value);

        if (name === "chorusMix") v = Math.max(0, Math.min(100, v)) / 100;
        this.audioEngine.setParam(name, v);

        if (valEl) {
          if (id === "chorusMix") valEl.textContent = `${Math.round(Number(input.value))}%`;
          else valEl.textContent = fmt ? fmt(Number(input.value)) : String(Number(input.value));
        }

        this._fillFromInput(input, fill);
      };

      input.addEventListener("input", apply, { passive: true });
      apply();
    };

    bind("chorusRate", "chorusRate", (v) => `${Number(v).toFixed(2)}Hz`, "chorusRate-fill");
    bind("chorusDepth", "chorusDepth", (v) => `${Number(v).toFixed(1)}ms`, "chorusDepth-fill");
    bind("chorusMix", "chorusMix", null, "chorusMix-fill");

    // mode buttons
    document.querySelectorAll("[data-chorus-mode]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await this.audioEngine.resume();
        document.querySelectorAll("[data-chorus-mode]").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        const mode = btn.dataset.chorusMode;
        if (mode === "OFF") {
          this.audioEngine.setParam("chorusOn", 0);
          return;
        }

        this.audioEngine.setParam("chorusOn", 1);

        // Juno-ish presets
        if (mode === "I") {
          this._setRange("chorusRate", 0.55);
          this._setRange("chorusDepth", 8.5);
          this._setRange("chorusMix", 40);
        } else if (mode === "II") {
          this._setRange("chorusRate", 1.20);
          this._setRange("chorusDepth", 14.0);
          this._setRange("chorusMix", 55);
        }
      });
    });
  }

  bindSynthPresets() {
    document.querySelectorAll("[data-synth-preset]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await this.audioEngine.resume();
        document.querySelectorAll("[data-synth-preset]").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        const p = btn.dataset.synthPreset;
        const set = (id, val) => this._setRange(id, val);

        if (p === "JUNO") {
          set("cutoff", 2200); set("envAmt", 1200); set("res", 0.12);
          set("attack", 0.008); set("decay", 0.14); set("release", 0.12);
          set("waveMix", 0.65); set("sub", 0.25); set("noise", 0.03);
        } else if (p === "SOFT") {
          set("cutoff", 3200); set("envAmt", 800); set("res", 0.08);
          set("attack", 0.02); set("decay", 0.20); set("release", 0.25);
          set("waveMix", 0.55); set("sub", 0.18); set("noise", 0.02);
        } else if (p === "BASS") {
          set("cutoff", 800); set("envAmt", 900); set("res", 0.18);
          set("attack", 0.005); set("decay", 0.18); set("release", 0.10);
          set("waveMix", 0.78); set("sub", 0.55); set("noise", 0.00);
        } else if (p === "PLUCK") {
          set("cutoff", 4200); set("envAmt", 2800); set("res", 0.10);
          set("attack", 0.002); set("decay", 0.10); set("release", 0.06);
          set("waveMix", 0.35); set("sub", 0.12); set("noise", 0.02);
        }
      });
    });
  }

  // ---------------- helpers ----------------
  _setRange(id, value) {
    const el = this.$(id);
    if (!el) return;
    el.value = String(value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  _fillFromInput(input, fillEl) {
    if (!input || !fillEl) return;
    const min = Number(input.min ?? 0);
    const max = Number(input.max ?? 100);
    const val = Number(input.value ?? 0);
    const pct = max === min ? 0 : ((val - min) / (max - min)) * 100;
    fillEl.style.width = `${pct}%`;
  }

  syncAllFills() {
    // call once to ensure fills are correct on load
    const ids = [
      "cutoff","envAmt","res","attack","decay","release","waveMix","sub","noise",
      "chorusRate","chorusDepth","chorusMix",
    ];
    ids.forEach((id) => {
      const input = this.$(id);
      const fill = this.$(`${id}-fill`) || this.$(`${id}Fill`);
      if (input && fill) this._fillFromInput(input, fill);
    });
  }
}
