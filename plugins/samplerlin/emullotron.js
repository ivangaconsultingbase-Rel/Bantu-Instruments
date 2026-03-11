class Emullotron {
  constructor() {
    this.audioCtx = null;
    this.masterGain = null;
    this.sourceBuffer = null;
    this.activeVoices = new Map();

    this.params = {
      tapeLength: 8,
      wow: 35,
      flutter: 25,
      masterVolume: 0.7
    };

    this.currentBank = null;
    this.baseOctave = 4;
    this.isReady = false;

    this.ensembleVoices = 1;
    this.speedMode = 1;
    this.playMode = "poly";

    this.arpHeldNotes = new Set();
    this.arpTimer = null;
    this.arpIndex = 0;
    this.arpBPM = 120;

    this.seqMaxSteps = 16;
    this.seqStepCount = 8;
    this.seqSteps = new Array(this.seqMaxSteps).fill(null);
    this.seqCursor = 0;
    this.seqPlayHead = 0;
    this.seqBPM = 120;
    this.seqRecording = false;
    this.seqPlaying = false;
    this.seqTimer = null;
    this.seqLastNote = null;

    this.banks = {
      strings: { name: "STRINGS", file: "samples/strings.wav" },
      flute: { name: "FLUTE", file: "samples/flute.wav" },
      piano: { name: "PIANO", file: "samples/piano.wav" },
      custom: { name: "CUSTOM", file: null }
    };

    this.keyLayout = [
      { key: "Q", code: "KeyQ", note: 0, black: false },
      { key: "Z", code: "KeyZ", note: 1, black: true },
      { key: "S", code: "KeyS", note: 2, black: false },
      { key: "E", code: "KeyE", note: 3, black: true },
      { key: "D", code: "KeyD", note: 4, black: false },
      { key: "F", code: "KeyF", note: 5, black: false },
      { key: "T", code: "KeyT", note: 6, black: true },
      { key: "G", code: "KeyG", note: 7, black: false },
      { key: "Y", code: "KeyY", note: 8, black: true },
      { key: "H", code: "KeyH", note: 9, black: false },
      { key: "U", code: "KeyU", note: 10, black: true },
      { key: "J", code: "KeyJ", note: 11, black: false },
      { key: "K", code: "KeyK", note: 12, black: false },
      { key: "O", code: "KeyO", note: 13, black: true },
      { key: "L", code: "KeyL", note: 14, black: false },
      { key: "P", code: "KeyP", note: 15, black: true },
      { key: "M", code: "KeyM", note: 16, black: false }
    ];

    this.init();
  }

  init() {
    this.buildKeyboard();
    this.setupEncoders();
    this.setupBanks();
    this.setupModeControls();
    this.setupOctaveButtons();
    this.setupComputerKeyboard();
    this.setupSequencer();
    this.updateModeDisplay();
    this.updateDisplay();
    this.updateStatus("READY");
  }

  async initAudio() {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.audioCtx.createGain();
      this.masterGain.gain.value = this.params.masterVolume;
      this.masterGain.connect(this.audioCtx.destination);
      this.isReady = true;
    }

    if (this.audioCtx.state === "suspended") {
      await this.audioCtx.resume();
    }

    this.setLed("led-audio", "active");
  }

  setupBanks() {
    const buttons = document.querySelectorAll(".bank-btn");
    buttons.forEach(btn => {
      btn.addEventListener("click", () => {
        const bank = btn.dataset.bank;
        if (bank === "custom") {
          const input = document.getElementById("file-input");
          if (input) input.click();
        } else {
          this.loadBank(bank);
        }
      });
    });

    const fileInput = document.getElementById("file-input");
    if (fileInput) {
      fileInput.addEventListener("change", event => {
        const file = event.target.files && event.target.files[0];
        if (file) this.loadCustomSample(file);
      });
    }
  }

  async loadBank(bankId) {
    const bank = this.banks[bankId];
    if (!bank || !bank.file) return;

    const btn = document.querySelector(`[data-bank="${bankId}"]`);
    if (btn) btn.classList.add("loading");

    try {
      await this.initAudio();
      this.updateStatus("LOADING...");

      const response = await fetch(bank.file);
      if (!response.ok) throw new Error("Sample not found");

      const arrayBuffer = await response.arrayBuffer();
      this.sourceBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);
      this.currentBank = bankId;

      this.updateBankButtons();
      this.updateDisplay();
      this.updateStatus("READY");
    } catch (error) {
      console.error(error);
      this.updateStatus("LOAD ERR");
    }

    if (btn) btn.classList.remove("loading");
  }

  async loadCustomSample(file) {
    const btn = document.querySelector('[data-bank="custom"]');
    if (btn) btn.classList.add("loading");

    try {
      await this.initAudio();
      this.updateStatus("LOADING...");

      const arrayBuffer = await file.arrayBuffer();
      this.sourceBuffer = await this.audioCtx.decodeAudioData(arrayBuffer);

      this.currentBank = "custom";
      this.banks.custom.name = file.name.slice(0, 12).toUpperCase();

      this.updateBankButtons();
      this.updateDisplay();
      this.updateStatus("READY");
    } catch (error) {
      console.error(error);
      this.updateStatus("LOAD ERR");
    }

    if (btn) btn.classList.remove("loading");
  }

  updateBankButtons() {
    document.querySelectorAll(".bank-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.bank === this.currentBank);
    });
  }

  setupEncoders() {
    document.querySelectorAll(".encoder").forEach(enc => {
      const param = enc.dataset.param;
      const min = parseFloat(enc.dataset.min);
      const max = parseFloat(enc.dataset.max);
      const initial = parseFloat(enc.dataset.value);

      this.params[param] = initial;
      this.setEncoderAngle(enc, initial, min, max);

      let dragging = false;
      let startY = 0;
      let startValue = initial;

      const start = e => {
        dragging = true;
        startY = e.touches ? e.touches[0].clientY : e.clientY;
        startValue = this.params[param];
        e.preventDefault();
      };

      const move = e => {
        if (!dragging) return;
        const y = e.touches ? e.touches[0].clientY : e.clientY;
        let next = startValue + ((startY - y) / 150) * (max - min);
        next = Math.max(min, Math.min(max, next));
        this.params[param] = next;
        this.setEncoderAngle(enc, next, min, max);

        if (param === "masterVolume" && this.masterGain && this.audioCtx) {
          this.masterGain.gain.setTargetAtTime(next, this.audioCtx.currentTime, 0.02);
        }
      };

      const end = () => {
        dragging = false;
      };

      enc.addEventListener("mousedown", start);
      enc.addEventListener("touchstart", start, { passive: false });
      document.addEventListener("mousemove", move);
      document.addEventListener("touchmove", move, { passive: false });
      document.addEventListener("mouseup", end);
      document.addEventListener("touchend", end);
    });
  }

  setEncoderAngle(enc, value, min, max) {
    const indicator = enc.querySelector(".encoder-indicator");
    if (!indicator) return;
    const angle = -135 + ((value - min) / (max - min)) * 270;
    indicator.style.setProperty("--rotation", `${angle}deg`);
  }

  setupModeControls() {
    document.querySelectorAll("[data-ensemble]").forEach(btn => {
      btn.addEventListener("click", () => {
        this.ensembleVoices = parseInt(btn.dataset.ensemble, 10);
        this.activateGroup("[data-ensemble]", btn);
        this.updateModeDisplay();
      });
    });

    document.querySelectorAll("[data-speed]").forEach(btn => {
      btn.addEventListener("click", () => {
        this.speedMode = parseFloat(btn.dataset.speed);
        this.activateGroup("[data-speed]", btn);
        this.updateModeDisplay();
      });
    });

    document.querySelectorAll("[data-playmode]").forEach(btn => {
      btn.addEventListener("click", () => {
        this.playMode = btn.dataset.playmode;
        this.activateGroup("[data-playmode]", btn);
        this.updateModeDisplay();
        this.updateStatus(this.playMode.toUpperCase());

        const arpDisplay = document.getElementById("arp-display");
        if (arpDisplay) {
          arpDisplay.style.display = this.playMode === "arp" ? "inline" : "none";
        }

        if (this.playMode !== "arp") this.stopArp();
      });
    });
  }

  activateGroup(selector, activeBtn) {
    document.querySelectorAll(selector).forEach(btn => {
      btn.classList.toggle("active", btn === activeBtn);
    });
  }

  updateModeDisplay() {
    const speedText = this.speedMode === 0.5 ? "½×" : this.speedMode === 2 ? "2×" : "1×";
    const el = document.getElementById("mode-display");
    if (el) el.textContent = `${this.playMode.toUpperCase()} · ${this.ensembleVoices}V · ${speedText}`;
  }

  buildKeyboard() {
    const keyboard = document.getElementById("keyboard");
    if (!keyboard) return;

    keyboard.innerHTML = "";
    const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

    this.keyLayout.forEach(layout => {
      const key = document.createElement("div");
      key.className = "key" + (layout.black ? " black" : "") + (layout.note === 0 ? " root" : "");
      key.dataset.code = layout.code;
      key.dataset.noteOffset = String(layout.note);

      const midi = this.baseOctave * 12 + layout.note;

      key.innerHTML = `
        <span class="key-letter">${layout.key}</span>
        <span class="key-note">${noteNames[midi % 12]}</span>
      `;

      const noteOn = async e => {
        e.preventDefault();
        await this.initAudio();
        const note = this.baseOctave * 12 + layout.note;
        this.playNote(note, 0.85);
        if (this.playMode !== "arp") key.classList.add("active");
      };

      const noteOff = () => {
        const note = this.baseOctave * 12 + layout.note;
        this.stopNote(note);
        key.classList.remove("active");
      };

      key.addEventListener("mousedown", noteOn);
      key.addEventListener("mouseup", noteOff);
      key.addEventListener("mouseleave", () => {
        if (key.classList.contains("active")) noteOff();
      });
      key.addEventListener("touchstart", noteOn, { passive: false });
      key.addEventListener("touchend", noteOff);

      keyboard.appendChild(key);
    });
  }

  setupComputerKeyboard() {
    const held = new Set();

    document.addEventListener("keydown", async e => {
      if (e.repeat) return;

      const tag = e.target && e.target.tagName ? e.target.tagName : "";
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      const layout = this.keyLayout.find(item => item.code === e.code);
      if (!layout) return;

      e.preventDefault();
      if (held.has(e.code)) return;
      held.add(e.code);

      await this.initAudio();
      const note = this.baseOctave * 12 + layout.note;
      this.playNote(note, 0.85);

      if (this.playMode !== "arp") {
        const key = document.querySelector(`.key[data-code="${e.code}"]`);
        if (key) key.classList.add("active");
      }
    });

    document.addEventListener("keyup", e => {
      held.delete(e.code);

      const layout = this.keyLayout.find(item => item.code === e.code);
      if (!layout) return;

      const note = this.baseOctave * 12 + layout.note;
      this.stopNote(note);

      const key = document.querySelector(`.key[data-code="${e.code}"]`);
      if (key) key.classList.remove("active");
    });
  }

  setupOctaveButtons() {
    const up = document.getElementById("oct-up");
    const down = document.getElementById("oct-down");

    if (up) up.addEventListener("click", () => this.changeOctave(1));
    if (down) down.addEventListener("click", () => this.changeOctave(-1));
  }

  changeOctave(delta) {
    const next = this.baseOctave + delta;
    if (next < 2 || next > 6) return;
    this.baseOctave = next;
    const display = document.getElementById("octave-display");
    if (display) display.textContent = String(next);
    this.buildKeyboard();
  }

  async playNote(note, velocity) {
    if (!this.sourceBuffer) {
      this.updateStatus("NO SAMPLE");
      return;
    }

    if (this.seqRecording) this.recordStep(note);

    if (this.playMode === "arp") {
      this.arpHeldNotes.add(note);
      this.updateArpDisplay();
      if (!this.arpTimer) this.startArp();
      return;
    }

    this.stopNote(note);

    const source = this.audioCtx.createBufferSource();
    source.buffer = this.sourceBuffer;
    source.playbackRate.value = Math.pow(2, ((note - 60) / 12)) * this.speedMode;

    const gain = this.audioCtx.createGain();
    gain.gain.value = 0;

    const now = this.audioCtx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(this.params.masterVolume * velocity, now + 0.01);

    source.connect(gain);
    gain.connect(this.masterGain);

    source.start();

    this.activeVoices.set(note, { source, gain });
    this.updateVoiceCount();

    const duration = this.params.tapeLength;
    setTimeout(() => {
      this.fadeAndStop(note, 0.2);
    }, duration * 1000);
  }

  stopNote(note) {
    if (this.playMode === "arp") {
      this.arpHeldNotes.delete(note);
      this.updateArpDisplay();
      if (this.arpHeldNotes.size === 0) this.stopArp();
      return;
    }

    this.fadeAndStop(note, 0.12);
  }

  fadeAndStop(note, fadeTime) {
    const voice = this.activeVoices.get(note);
    if (!voice || !this.audioCtx) return;

    const now = this.audioCtx.currentTime;
    try {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
      voice.gain.gain.linearRampToValueAtTime(0, now + fadeTime);
    } catch (_) {}

    setTimeout(() => {
      try { voice.source.stop(); } catch (_) {}
      this.activeVoices.delete(note);
      this.updateVoiceCount();
    }, fadeTime * 1000 + 50);
  }

  startArp() {
    this.arpTick();
    this.arpTimer = setInterval(() => this.arpTick(), (60 / this.arpBPM) * 1000);
  }

  stopArp() {
    if (this.arpTimer) {
      clearInterval(this.arpTimer);
      this.arpTimer = null;
    }
    this.arpIndex = 0;
  }

  arpTick() {
    const notes = Array.from(this.arpHeldNotes).sort((a, b) => a - b);
    if (!notes.length) return;

    const note = notes[this.arpIndex % notes.length];
    this.playArpVoice(note);
    this.arpIndex++;
  }

  playArpVoice(note) {
    if (!this.sourceBuffer) return;

    const source = this.audioCtx.createBufferSource();
    source.buffer = this.sourceBuffer;
    source.playbackRate.value = Math.pow(2, ((note - 60) / 12)) * this.speedMode;

    const gain = this.audioCtx.createGain();
    gain.gain.value = 0;

    const now = this.audioCtx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(this.params.masterVolume * 0.75, now + 0.005);
    gain.gain.linearRampToValueAtTime(0, now + 0.22);

    source.connect(gain);
    gain.connect(this.masterGain);
    source.start();
    source.stop(now + 0.25);
  }

  updateArpDisplay() {
    const display = document.getElementById("arp-display");
    const notesEl = document.getElementById("arp-notes");
    if (!display || !notesEl) return;

    const notes = Array.from(this.arpHeldNotes).sort((a, b) => a - b);
    if (!notes.length) {
      notesEl.textContent = "--";
      if (this.playMode === "arp") display.style.display = "inline";
      return;
    }

    notesEl.textContent = notes.map(n => this.midiName(n)).join(" ");
  }

  setupSequencer() {
    const rec = document.getElementById("seq-rec");
    const play = document.getElementById("seq-play");
    const clear = document.getElementById("seq-clear");
    const bpmUp = document.getElementById("seq-bpm-up");
    const bpmDown = document.getElementById("seq-bpm-down");

    if (rec) rec.addEventListener("click", () => this.toggleSeqRec());
    if (play) play.addEventListener("click", () => this.toggleSeqPlay());
    if (clear) clear.addEventListener("click", () => this.clearSeq());
    if (bpmUp) bpmUp.addEventListener("click", () => this.setSeqBpm(this.seqBPM + 5));
    if (bpmDown) bpmDown.addEventListener("click", () => this.setSeqBpm(this.seqBPM - 5));

    this.buildSeqGrid();
    this.setSeqBpm(this.seqBPM);
  }

  buildSeqGrid() {
    const grid = document.getElementById("seq-grid");
    if (!grid) return;

    grid.innerHTML = "";

    for (let i = 0; i < this.seqStepCount; i++) {
      const step = document.createElement("div");
      step.className = "seq-step";
      step.dataset.idx = String(i);

      const num = document.createElement("span");
      num.className = "step-num";
      num.textContent = String(i + 1);

      const note = document.createElement("span");
      note.className = "step-note";
      note.textContent = "—";

      const dot = document.createElement("div");
      dot.className = "step-dot";

      step.appendChild(num);
      step.appendChild(note);
      step.appendChild(dot);

      step.addEventListener("click", () => {
        if (this.seqRecording) {
          this.seqCursor = i;
        } else {
          this.seqSteps[i] = null;
        }
        this.refreshSeqGrid();
      });

      grid.appendChild(step);
    }

    this.refreshSeqGrid();
  }

  refreshSeqGrid() {
    document.querySelectorAll(".seq-step").forEach(step => {
      const idx = parseInt(step.dataset.idx, 10);
      const note = this.seqSteps[idx];

      step.classList.toggle("filled", note !== null);
      step.classList.toggle("playing", this.seqPlaying && idx === this.seqPlayHead);
      step.classList.toggle("cursor", this.seqRecording && idx === this.seqCursor);

      const noteEl = step.querySelector(".step-note");
      if (noteEl) noteEl.textContent = note === null ? "—" : this.midiName(note);
    });
  }

  recordStep(note) {
    this.seqSteps[this.seqCursor] = note;
    this.seqCursor = (this.seqCursor + 1) % this.seqStepCount;
    this.refreshSeqGrid();
  }

  toggleSeqRec() {
    this.seqRecording = !this.seqRecording;
    const btn = document.getElementById("seq-rec");
    if (btn) btn.classList.toggle("rec-active", this.seqRecording);
    if (this.seqRecording && this.seqPlaying) this.stopSeq();
    this.refreshSeqGrid();
  }

  toggleSeqPlay() {
    if (this.seqPlaying) this.stopSeq();
    else this.startSeq();
  }

  startSeq() {
    if (!this.sourceBuffer) {
      this.updateStatus("NO SAMPLE");
      return;
    }

    this.seqPlaying = true;
    this.seqPlayHead = 0;

    const btn = document.getElementById("seq-play");
    if (btn) {
      btn.classList.add("active");
      btn.textContent = "■ STOP";
    }

    this.seqTick();
    this.seqTimer = setInterval(() => this.seqTick(), (60 / this.seqBPM) * 1000);
  }

  stopSeq() {
    this.seqPlaying = false;
    if (this.seqTimer) {
      clearInterval(this.seqTimer);
      this.seqTimer = null;
    }

    const btn = document.getElementById("seq-play");
    if (btn) {
      btn.classList.remove("active");
      btn.textContent = "▶ PLAY";
    }

    this.refreshSeqGrid();
  }

  seqTick() {
    const note = this.seqSteps[this.seqPlayHead];
    if (note !== null) {
      this.playNote(note, 0.8);
    }

    this.refreshSeqGrid();
    this.seqPlayHead = (this.seqPlayHead + 1) % this.seqStepCount;
  }

  clearSeq() {
    this.stopSeq();
    this.seqSteps = new Array(this.seqMaxSteps).fill(null);
    this.seqCursor = 0;
    this.seqPlayHead = 0;
    this.refreshSeqGrid();
  }

  setSeqBpm(bpm) {
    this.seqBPM = Math.max(30, Math.min(300, bpm));
    const el = document.getElementById("seq-bpm-val");
    if (el) el.textContent = String(this.seqBPM);

    if (this.seqPlaying) {
      this.stopSeq();
      this.startSeq();
    }
  }

  updateDisplay() {
    const bankName = document.getElementById("bank-name");
    const sampleName = document.getElementById("sample-name");

    const name = this.currentBank ? this.banks[this.currentBank].name : "---";
    if (bankName) bankName.textContent = name;
    if (sampleName) sampleName.textContent = this.sourceBuffer ? name : "NO FILE";
  }

  updateStatus(text) {
    const el = document.getElementById("status-text");
    if (el) el.textContent = text;
  }

  updateVoiceCount() {
    const el = document.getElementById("voices-count");
    if (el) el.textContent = String(this.activeVoices.size);
  }

  setLed(id, state) {
    const led = document.getElementById(id);
    if (!led) return;
    led.classList.remove("active", "warning");
    if (state) led.classList.add(state);
  }

  midiName(midi) {
    const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    return names[midi % 12] + (Math.floor(midi / 12) - 1);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  window.emullotron = new Emullotron();
});
