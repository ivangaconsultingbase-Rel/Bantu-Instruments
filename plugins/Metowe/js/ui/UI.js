export class UI {
  constructor(synth, sequencer) {
    this.synth = synth;
    this.seq = sequencer;

    this.isMobile = this._detectMobile();

    this.stepEls = []; // [lane][step]
    this._down = { lane: null, step: null, t: 0, el: null };
    this._lpTimer = null;
    this._lastTap = { lane: null, step: null, t: 0 };
  }

  _detectMobile() {
    return (('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || window.matchMedia('(hover: none)').matches);
  }

  $(id) { return document.getElementById(id); }
  setText(id, v) { const el = this.$(id); if (el) el.textContent = String(v); }

  init() {
    this._renderKeyboard();
    this._renderSequencer();
    this._bind();
    this._syncAll();
  }

  _renderKeyboard() {
    const kb = this.$("keyboard");
    if (!kb) return;

    const keys = [
      { k: "A", n: 60 }, { k: "S", n: 62 }, { k: "D", n: 64 }, { k: "F", n: 65 },
      { k: "G", n: 67 }, { k: "H", n: 69 }, { k: "J", n: 71 }, { k: "K", n: 72 },
    ];

    kb.innerHTML = "";
    keys.forEach(o => {
      const d = document.createElement("div");
      d.className = "kkey";
      d.dataset.note = String(o.n);
      d.dataset.key = o.k;
      d.textContent = o.k;
      kb.appendChild(d);
    });
  }

  _renderSequencer() {
    // header 1..16
    const head = this.$("seq-header");
    if (head) {
      head.innerHTML = "";
      for (let s = 0; s < this.seq.steps; s++) {
        const sp = document.createElement("span");
        sp.textContent = String(s + 1);
        head.appendChild(sp);
      }
    }

    const grid = this.$("sequencer-grid");
    if (!grid) return;

    grid.innerHTML = "";
    this.stepEls = [];

    for (let lane = 0; lane < this.seq.lanes; lane++) {
      const row = document.createElement("div");
      row.className = "seq-row";

      const lab = document.createElement("div");
      lab.className = "seq-row-label";
      lab.textContent = String(lane + 1);
      row.appendChild(lab);

      const steps = document.createElement("div");
      steps.className = "seq-steps";

      const rowEls = [];
      for (let s = 0; s < this.seq.steps; s++) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "seq-step";
        b.dataset.lane = String(lane);
        b.dataset.step = String(s);
        if (s % 4 === 0) b.classList.add("beat-marker");

        const t = document.createElement("div");
        t.className = "txt";
        t.textContent = "-";
        b.appendChild(t);

        steps.appendChild(b);
        rowEls.push(b);
      }

      row.appendChild(steps);
      grid.appendChild(row);
      this.stepEls.push(rowEls);
    }
  }

  _bind() {
    // Transport
    this.$("play-btn")?.addEventListener("click", () => {
      this.seq.togglePlay();
      this.$("play-btn")?.classList.toggle("active", this.seq.isPlaying);
    });

    this.$("clear-btn")?.addEventListener("click", () => {
      this.seq.clear();
      this.seq.loadDefaultPattern(); // garde l'esprit “play = musical”
      this._syncAll();
    });

    // BPM/Swing/Humanize
    this.$("bpm")?.addEventListener("input", (e) => {
      const v = parseInt(e.target.value, 10) || 96;
      this.seq.setBPM(v);
      this.setText("bpm-display", v);
      this.setText("bpm-val", v);
    });

    this.$("swing")?.addEventListener("input", (e) => {
      const v = parseInt(e.target.value, 10) || 0;
      this.seq.setSwing(v);
      this.setText("swing-display", v);
      this.setText("swing-val", `${v}%`);
    });

    this.$("humanize")?.addEventListener("input", (e) => {
      const v = parseInt(e.target.value, 10) || 0;
      this.seq.setHumanize(v);
      this.setText("humanize-val", `${v}%`);
    });

    this.$("humanize-time")?.addEventListener("input", (e) => {
      const v = parseInt(e.target.value, 10) || 0;
      this.seq.setHumanizeTime(v);
      this.setText("humanize-time-val", `${v}ms`);
    });

    // Root/Oct
    this.$("root")?.addEventListener("change", (e) => {
      this.seq.setRoot(e.target.value);
      this.setText("scale-display", `${this.seq.root} MIN`);
    });

    this.$("oct")?.addEventListener("input", (e) => {
      const v = parseInt(e.target.value, 10) || 4;
      this.seq.setOctave(v);
      this.setText("oct-val", v);
    });

    // Keyboard play (touch + click)
    this.$("keyboard")?.addEventListener("pointerdown", (e) => {
      const key = e.target.closest(".kkey");
      if (!key) return;
      e.preventDefault();
      const n = parseInt(key.dataset.note, 10);
      key.classList.add("active");
      this.synth.noteOn(n, 1);
      if (navigator.vibrate) navigator.vibrate(8);
    }, { passive: false });

    this.$("keyboard")?.addEventListener("pointerup", (e) => {
      const key = e.target.closest(".kkey");
      if (!key) return;
      const n = parseInt(key.dataset.note, 10);
      key.classList.remove("active");
      this.synth.noteOff(n);
    });

    // Typing keyboard
    const map = { a:60, s:62, d:64, f:65, g:67, h:69, j:71, k:72 };
    document.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      if (e.code === "Space") {
        e.preventDefault();
        this.seq.togglePlay();
        this.$("play-btn")?.classList.toggle("active", this.seq.isPlaying);
        return;
      }
      const n = map[(e.key || "").toLowerCase()];
      if (n != null) this.synth.noteOn(n, 1);
    });

    document.addEventListener("keyup", (e) => {
      const n = map[(e.key || "").toLowerCase()];
      if (n != null) this.synth.noteOff(n);
    });

    // Sequencer edit (mobile friendly)
    const grid = this.$("sequencer-grid");
    if (!grid) return;

    grid.addEventListener("pointerdown", (e) => {
      const el = e.target.closest(".seq-step");
      if (!el) return;
      e.preventDefault();

      const lane = parseInt(el.dataset.lane, 10);
      const step = parseInt(el.dataset.step, 10);

      this._down = { lane, step, t: performance.now(), el };

      // long press => mute toggle
      clearTimeout(this._lpTimer);
      this._lpTimer = setTimeout(() => {
        const muted = this.seq.toggleMute(lane, step);
        el.style.opacity = muted ? "0.35" : "";
        if (navigator.vibrate) navigator.vibrate(12);
      }, 360);
    }, { passive: false });

    grid.addEventListener("pointerup", (e) => {
      clearTimeout(this._lpTimer);

      const el = e.target.closest(".seq-step");
      if (!el) return;

      const lane = parseInt(el.dataset.lane, 10);
      const step = parseInt(el.dataset.step, 10);

      // if long press already fired, don't do tap action
      const dt = performance.now() - this._down.t;
      if (dt > 340) return;

      // double tap => chord toggle
      const now = performance.now();
      const last = this._lastTap;
      const isDouble = (last.lane === lane && last.step === step && (now - last.t) < 260);
      this._lastTap = { lane, step, t: now };

      if (isDouble) {
        this.seq.toggleChord(lane, step);
        this._syncStep(lane, step);
        if (navigator.vibrate) navigator.vibrate(10);
        return;
      }

      // tap logic:
      // - if off => on
      // - if on => cycle degree
      const ev = this.seq.getEvent(lane, step);
      if (!ev.on) this.seq.toggleStep(lane, step);
      else this.seq.cycleDegree(lane, step);

      this._syncStep(lane, step);

      if (navigator.vibrate) navigator.vibrate(8);
    });
  }

  _syncAll() {
    // displays
    this.setText("bpm-display", this.seq.bpm);
    this.setText("bpm-val", this.seq.bpm);
    this.setText("swing-display", this.seq.swing);
    this.setText("swing-val", `${this.seq.swing}%`);
    this.setText("scale-display", `${this.seq.root} MIN`);
    this.setText("humanize-val", `${this.seq.humanizePct}%`);
    this.setText("humanize-time-val", `${this.seq.humanizeTimeMs}ms`);
    this.setText("oct-val", this.seq.baseOctave);

    for (let lane = 0; lane < this.seq.lanes; lane++) {
      for (let s = 0; s < this.seq.steps; s++) this._syncStep(lane, s);
    }
  }

  _syncStep(lane, step) {
    const el = this.stepEls?.[lane]?.[step];
    if (!el) return;

    const ev = this.seq.getEvent(lane, step);

    el.classList.toggle("active", !!ev.on);
    el.classList.toggle("chord", !!(ev.on && ev.chord));

    // show degree 1..7 (more musical than 0..6)
    const txt = el.querySelector(".txt");
    if (txt) txt.textContent = ev.on ? String(ev.degree + 1) : "-";

    // muted display
    el.style.opacity = ev.mute ? "0.35" : "";
  }

  onStepChange(step) {
    // clear previous
    document.querySelectorAll(".seq-step.playing").forEach(n => n.classList.remove("playing"));
    if (step < 0) return;

    for (let lane = 0; lane < this.seq.lanes; lane++) {
      const el = this.stepEls?.[lane]?.[step];
      if (el) el.classList.add("playing");
    }

    const led = this.$("led");
    if (led) {
      led.classList.add("active");
      setTimeout(() => led.classList.remove("active"), 50);
    }
  }
}
