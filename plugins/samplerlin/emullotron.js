/**
 * EMULLOTRON MK2 — Virtual Tape Instrument
 * Features: Ensemble 1/2/3v, Speed ½×/1×/2×, Poly/Chord/Drone/ARP, Step Recorder
 */

class Emullotron {
  constructor() {
    /* Audio graph */
    this.audioCtx = null;
    this.masterGain = null;
    this.analyser = null;
    this.masterSat = null;
    this.masterEQ = null;
    this.sourceBuffer = null;
    this.virtualTapes = new Map();

    /*
     * activeVoices : Map<midiNote, VoiceGroup>
     * VoiceGroup   : { voices: Voice[], autoTimer: id|null }
     */
    this.activeVoices = new Map();

    /* Audio params */
    this.params = {
      masterVolume: 0.7,
      tapeLength: 8,
      startJitter: 30,
      wow: 35,
      flutter: 25,
      tapeAge: 40,
      mechanicalNoise: 20,
      brightness: 60,
      saturation: 30,
      attack: 40,
      release: 50,
      driftPerKey: 25
    };

    /* Mode state */
    this.ensembleVoices = 1;
    this.speedMode = 1.0;
    this.playMode = "poly";
    this.chordType = "major";

    /* Chord: rootNote -> [note…] */
    this.chordMap = new Map();

    /* Drone */
    this.droneNote = null;

    /* ARP */
    this.arpPattern = "up";
    this.arpBPM = 120;
    this.arpOctaves = 1;
    this.arpHeldNotes = new Set();
    this.arpCurrentNote = null;
    this.arpIndex = 0;
    this.arpDirection = 1;
    this.arpTimer = null;

    /* Step recorder */
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

    /* Banks */
    this.banks = {
      strings: {
        name: "STRINGS",
        file: "samples/strings.wav",
        presetOverrides: { wow: 40, flutter: 30, tapeAge: 45, brightness: 55, attack: 50, release: 60 }
      },
      flute: {
        name: "FLUTE",
        file: "samples/flute.wav",
        presetOverrides: { wow: 25, flutter: 20, tapeAge: 30, brightness: 70, attack: 30, release: 45 }
      },
      piano: {
        name: "PIANO",
        file: "samples/piano.wav",
        presetOverrides: { wow: 20, flutter: 15, tapeAge: 35, brightness: 65, attack: 20, release: 55 }
      },
      custom: {
        name: "CUSTOM",
        file: null,
        presetOverrides: {}
      }
    };

    /* Sound presets */
    this.presets = {
      pristine: { tapeLength: 10, startJitter: 10, wow: 10, flutter: 8, tapeAge: 10, mechanicalNoise: 5, brightness: 75, saturation: 15, attack: 20, release: 40, driftPerKey: 10 },
      vintage: { tapeLength: 8, startJitter: 30, wow: 35, flutter: 25, tapeAge: 45, mechanicalNoise: 25, brightness: 55, saturation: 35, attack: 45, release: 50, driftPerKey: 30 },
      worn: { tapeLength: 7, startJitter: 50, wow: 55, flutter: 45, tapeAge: 65, mechanicalNoise: 40, brightness: 45, saturation: 45, attack: 55, release: 55, driftPerKey: 45 },
      broken: { tapeLength: 5, startJitter: 80, wow: 80, flutter: 70, tapeAge: 85, mechanicalNoise: 60, brightness: 35, saturation: 65, attack: 70, release: 60, driftPerKey: 70 },
      dreamy: { tapeLength: 12, startJitter: 40, wow: 60, flutter: 20, tapeAge: 50, mechanicalNoise: 15, brightness: 40, saturation: 25, attack: 65, release: 80, driftPerKey: 35 }
    };

    this.currentBank = null;
    this.currentPreset = null;
    this.baseOctave = 4;
    this.noteRange = { min: 24, max: 108 };
    this.isReady = false;

    /* Computer keyboard layout — note offset from octave root (C=0) */
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

    this._init();
  }

  _init() {
    try {
      this._buildKeyboard();
      this._setupEncoders();
      this._setupBanks();
      this._setupPresets();
      this._setupOctaveButtons();
      this._setupComputerKeyboard();
      this._setupModeControls();
      this._setupStepRecorder();
      this._updateDisplay();
      this._updateModeDisplay();
      this._seqSetBPM(this.seqBPM);
      this._setArpBPM(this.arpBPM);
    } catch (err) {
      console.error("[EMULLOTRON] Init failed:", err);
    }

    this._setupMIDI();
  }

  async _initAudio() {
    if (this.audioCtx) {
      if (this.audioCtx.state === "suspended") {
        await this.audioCtx.resume();
      }
      return;
    }

    this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.audioCtx.createGain();
    this.masterGain.gain.value = this.params.masterVolume;

    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 256;

    this.masterSat = this._makeSaturation(0.2);

    this.masterEQ = this.audioCtx.createBiquadFilter();
    this.masterEQ.type = "lowshelf";
    this.masterEQ.frequency.value = 300;
    this.masterEQ.gain.value = 2;

    this.masterGain.connect(this.masterSat);
    this.masterSat.connect(this.masterEQ);
    this.masterEQ.connect(this.analyser);
    this.analyser.connect(this.audioCtx.destination);

    this.isReady = true;
    this._led("led-audio", "active");
    this._status("AUDIO OK");
    this._startMeter();
  }

  _makeSaturation(amount) {
    const ws = this.audioCtx.createWaveShaper();
    const N = 44100;
    const curve = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const x = (i * 2) / N - 1;
      curve[i] = Math.tanh(x * (1 + amount * 3)) * (1 - amount * 0.1);
    }
    ws.curve = curve;
    ws.oversample = "2x";
    return ws;
  }

  _setupBanks() {
    document.querySelectorAll(".bank-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.bank;
        if (id === "custom") {
          const input = document.getElementById("file-input");
          if (input) input.click();
        } else {
          this._loadBank(id);
        }
      });
    });

    const fi = document.getElementById("file-input");
    if (fi) {
      fi.addEventListener("change", e => {
        if (e.target.files && e.target.files.length) {
          this._loadCustom(e.target.files[0]);
        }
      });
    }
  }

  async _loadBank(bankId) {
    const bank = this.banks[bankId];
    if (!bank || !bank.file) return;

    const btn = document.querySelector(`[data-bank="${bankId}"]`);
    if (btn) btn.classList.add("loading");

    try {
      await this._initAudio();
      this._status("LOADING...");

      const resp = await fetch(bank.file);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const ab = await resp.arrayBuffer();
      this.sourceBuffer = await this.audioCtx.decodeAudioData(ab);

      this.currentBank = bankId;
      this._applyBankOverrides(bank);
      this._generateTapes();
      this._updateBankBtns();
      this._updateDisplay();
      this._status("READY");
    } catch (err) {
      console.error("[EMULLOTRON] loadBank:", err);
      this._status("LOAD ERR");
    }

    if (btn) btn.classList.remove("loading");
  }

  async _loadCustom(file) {
    const btn = document.querySelector('[data-bank="custom"]');
    if (btn) btn.classList.add("loading");

    try {
      await this._initAudio();
      this._status("LOADING...");

      const ab = await file.arrayBuffer();
      this.sourceBuffer = await this.audioCtx.decodeAudioData(ab);

      this.banks.custom.name = file.name.slice(0, 12).toUpperCase();
      this.currentBank = "custom";

      this._generateTapes();
      this._updateBankBtns();
      this._updateDisplay();
      this._status("READY");
    } catch (err) {
      console.error("[EMULLOTRON] loadCustom:", err);
      this._status("LOAD ERR");
    }

    if (btn) btn.classList.remove("loading");
  }

  _applyBankOverrides(bank) {
    if (!bank.presetOverrides) return;
    Object.entries(bank.presetOverrides).forEach(([k, v]) => {
      this.params[k] = v;
      this._syncEncoderVisual(k);
    });
  }

  _updateBankBtns() {
    document.querySelectorAll(".bank-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.bank === this.currentBank);
    });
  }

  _setupPresets() {
    document.querySelectorAll(".preset-btn").forEach(btn => {
      btn.addEventListener("click", () => this._applyPreset(btn.dataset.preset));
    });
  }

  _applyPreset(id) {
    const p = this.presets[id];
    if (!p) return;

    this.currentPreset = id;

    Object.entries(p).forEach(([k, v]) => {
      this.params[k] = v;
      this._syncEncoderVisual(k);
      this._onParamChange(k, v);
    });

    document.querySelectorAll(".preset-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.preset === id);
    });

    if (this.sourceBuffer) this._generateTapes();
    this._status(id.toUpperCase());
  }

  _generateTapes() {
    if (!this.sourceBuffer) return;

    this.virtualTapes.clear();
    const root = this.baseOctave * 12 + 12;

    for (let n = this.noteRange.min; n <= this.noteRange.max; n++) {
      this.virtualTapes.set(n, this._makeTape(n, n - root));
    }
  }

  _makeTape(note, semitones) {
    const rate = Math.pow(2, semitones / 12);
    const drift = this.params.driftPerKey / 100;
    const zp = (note - this.noteRange.min) / (this.noteRange.max - this.noteRange.min);
    const isLow = zp < 0.33;
    const isHi = zp > 0.66;

    return {
      note,
      playbackRate: rate * (1 + (Math.random() - 0.5) * drift * 0.02),
      filterFreq: 2000 + (Math.random() - 0.5) * drift * 400 + (isLow ? -600 : isHi ? 200 : 0),
      noiseLevel: (0.02 + Math.random() * drift * 0.3) * (isHi ? 1.5 : 1),
      instability: isLow ? 1.3 : isHi ? 0.8 : 1,
      lengthFactor: isHi ? 0.85 : 1,
      attackVariation: 0.01 + Math.random() * 0.03,
      stereoPan: (note - 60) / 48
    };
  }

  playNote(note, vel = 0.8) {
    if (!this.isReady || !this.sourceBuffer) {
      this._status("NO SAMPLE");
      return;
    }

    if (note < this.noteRange.min || note > this.noteRange.max) return;

    if (this.playMode === "arp") {
      this._arpAdd(note);
      return;
    }

    if (this.playMode === "drone") {
      this._droneToggle(note, vel);
      if (this.seqRecording) this._seqRecord(note);
      return;
    }

    if (this.playMode === "chord") {
      this._playChord(note, vel);
      if (this.seqRecording) this._seqRecord(note);
      return;
    }

    if (this.seqRecording) this._seqRecord(note);
    this._playEnsemble(note, vel);
  }

  stopNote(note) {
    if (this.playMode === "arp") {
      this._arpRemove(note);
      return;
    }

    if (this.playMode === "chord") {
      this._stopChord(note);
      return;
    }

    if (this.playMode === "drone") {
      if (note !== this.droneNote) this._killVoices(note);
      return;
    }

    this._killVoices(note);
  }

  _playEnsemble(note, vel, infinite = false) {
    this._killVoices(note);

    const tape = this.virtualTapes.get(note);
    if (!tape) return;

    const dets = this._detunings();
    const vPerV = vel / Math.sqrt(dets.length);

    const voices = dets.map(dt => {
      const rate = tape.playbackRate * Math.pow(2, dt / 12) * this.speedMode;
      const v = this._createVoice({ ...tape, playbackRate: rate }, vPerV);
      v.source.start(0);
      v.startTime = this.audioCtx.currentTime;
      return v;
    });

    let autoTimer = null;
    if (!infinite) {
      const ms = this.params.tapeLength * tape.lengthFactor * 1000;
      autoTimer = setTimeout(() => {
        this._fadeGroup(note, 0.5);
        this._updateVoiceCount();
      }, ms);
    }

    this.activeVoices.set(note, { voices, autoTimer });
    this._updateVoiceCount();
  }

  _detunings() {
    if (this.ensembleVoices === 2) return [-0.10, 0.10];
    if (this.ensembleVoices === 3) return [-0.14, 0, 0.14];
    return [0];
  }

  _killVoices(note) {
    const grp = this.activeVoices.get(note);
    if (!grp) return;

    if (grp.autoTimer) clearTimeout(grp.autoTimer);

    const rel = (this.params.release / 100) * 0.5 + 0.05;
    grp.voices.forEach(v => this._fadeVoice(v, rel));

    this.activeVoices.delete(note);
    this._updateVoiceCount();
  }

  _fadeGroup(note, dur) {
    const grp = this.activeVoices.get(note);
    if (!grp) return;

    if (grp.autoTimer) clearTimeout(grp.autoTimer);
    grp.voices.forEach(v => this._fadeVoice(v, dur));

    this.activeVoices.delete(note);
  }

  _playChord(rootNote, vel) {
    const notes = this._chordIntervals().map(i => rootNote + i);
    notes.forEach((n, idx) => {
      if (n >= this.noteRange.min && n <= this.noteRange.max) {
        this._playEnsemble(n, idx === 0 ? vel : vel * 0.65);
      }
    });
    this.chordMap.set(rootNote, notes);
  }

  _stopChord(rootNote) {
    const notes = this.chordMap.get(rootNote) || [rootNote];
    notes.forEach(n => this._killVoices(n));
    this.chordMap.delete(rootNote);
  }

  _chordIntervals() {
    const tbl = { major: [0, 4, 7], minor: [0, 3, 7], sus2: [0, 2, 7] };
    return tbl[this.chordType] || [0, 4, 7];
  }

  _droneToggle(note, vel) {
    if (note === this.droneNote) {
      this._killVoices(note);
      this._setKeyClass(note, false, "drone-held");
      this.droneNote = null;
    } else {
      if (this.droneNote !== null) {
        this._killVoices(this.droneNote);
        this._setKeyClass(this.droneNote, false, "drone-held");
      }

      this.droneNote = note;
      this._playEnsemble(note, vel, true);
      this._setKeyClass(note, true, "drone-held");
    }

    this._updateDroneDisplay();
  }

  _updateDroneDisplay() {
    const el = document.getElementById("drone-display");
    if (!el) return;

    el.style.display = this.droneNote !== null ? "inline" : "none";

    const nn = document.getElementById("drone-note");
    if (nn) nn.textContent = this.droneNote !== null ? this._midiName(this.droneNote) : "--";
  }

  _arpAdd(note) {
    this.arpHeldNotes.add(note);
    this._setKeyClass(note, true, "arp-held");
    this._updateArpDisplay();
    if (!this.arpTimer) this._arpStart();
  }

  _arpRemove(note) {
    this.arpHeldNotes.delete(note);
    this._setKeyClass(note, false, "arp-held");
    this._updateArpDisplay();
    if (this.arpHeldNotes.size === 0) this._arpStop();
  }

  _arpStart() {
    this._arpTick();
    const ms = (60 / this.arpBPM) * 1000;
    this.arpTimer = setInterval(() => this._arpTick(), ms);
  }

  _arpStop() {
    if (this.arpTimer) {
      clearInterval(this.arpTimer);
      this.arpTimer = null;
    }

    if (this.arpCurrentNote !== null) {
      this._killVoices(this.arpCurrentNote);
      this.arpCurrentNote = null;
    }

    this.arpIndex = 0;
    this.arpDirection = 1;
  }

  _arpTick() {
    if (!this.arpHeldNotes.size) return;

    if (this.arpCurrentNote !== null) this._killVoices(this.arpCurrentNote);

    const seq = this._arpSequence();
    if (!seq.length) return;

    this.arpIndex = ((this.arpIndex % seq.length) + seq.length) % seq.length;
    const note = seq[this.arpIndex];
    this.arpCurrentNote = note;
    this._playEnsemble(note, 0.8);
    this._advanceArp(seq.length);
  }

  _arpSequence() {
    let s = [...this.arpHeldNotes].sort((a, b) => a - b);
    if (this.arpOctaves === 2) s = [...s, ...s.map(n => n + 12)];
    return s;
  }

  _advanceArp(len) {
    switch (this.arpPattern) {
      case "up":
        this.arpIndex = (this.arpIndex + 1) % len;
        break;
      case "down":
        this.arpIndex = (this.arpIndex - 1 + len) % len;
        break;
      case "pingpong":
        this.arpIndex += this.arpDirection;
        if (this.arpIndex >= len) {
          this.arpDirection = -1;
          this.arpIndex = len - 2;
        } else if (this.arpIndex < 0) {
          this.arpDirection = 1;
          this.arpIndex = 1;
        }
        break;
      case "random":
        this.arpIndex = Math.floor(Math.random() * len);
        break;
    }
  }

  _setArpBPM(bpm) {
    this.arpBPM = Math.max(30, Math.min(300, bpm));
    const el = document.getElementById("arp-bpm-val");
    if (el) el.textContent = this.arpBPM;

    if (this.arpTimer) {
      clearInterval(this.arpTimer);
      const ms = (60 / this.arpBPM) * 1000;
      this.arpTimer = setInterval(() => this._arpTick(), ms);
    }
  }

  _updateArpDisplay() {
    const el = document.getElementById("arp-display");
    if (!el) return;

    if (this.arpHeldNotes.size > 0) {
      el.style.display = "inline";
      const ns = document.getElementById("arp-notes");
      if (ns) {
        ns.textContent = [...this.arpHeldNotes]
          .sort((a, b) => a - b)
          .map(n => this._midiName(n))
          .join(" ");
      }
    } else {
      el.style.display = "none";
    }
  }

  _setupStepRecorder() {
    const $ = id => document.getElementById(id);

    $("seq-rec")?.addEventListener("click", () => this._seqToggleRec());
    $("seq-play")?.addEventListener("click", () => this._seqTogglePlay());
    $("seq-clear")?.addEventListener("click", () => this._seqClear());

    $("seq-bpm-up")?.addEventListener("click", () => this._seqSetBPM(this.seqBPM + 5));
    $("seq-bpm-down")?.addEventListener("click", () => this._seqSetBPM(this.seqBPM - 5));

    $("seq-steps-up")?.addEventListener("click", () => {
      this.seqStepCount = Math.min(this.seqMaxSteps, this.seqStepCount + 1);
      $("seq-steps-val").textContent = this.seqStepCount;
      this._seqBuildGrid();
    });

    $("seq-steps-down")?.addEventListener("click", () => {
      this.seqStepCount = Math.max(2, this.seqStepCount - 1);
      $("seq-steps-val").textContent = this.seqStepCount;
      this._seqBuildGrid();
    });

    this._seqBuildGrid();
  }

  _seqBuildGrid() {
    const grid = document.getElementById("seq-grid");
    if (!grid) return;

    grid.innerHTML = "";

    for (let i = 0; i < this.seqStepCount; i++) {
      const cell = document.createElement("div");
      cell.className = "seq-step";
      cell.dataset.idx = i;

      const numEl = document.createElement("span");
      numEl.className = "step-num";
      numEl.textContent = i + 1;

      const noteEl = document.createElement("span");
      noteEl.className = "step-note";
      noteEl.textContent = "—";

      const dot = document.createElement("div");
      dot.className = "step-dot";

      cell.appendChild(numEl);
      cell.appendChild(noteEl);
      cell.appendChild(dot);

      cell.addEventListener("click", () => {
        if (this.seqRecording) {
          this.seqCursor = i;
        } else {
          this.seqSteps[i] = null;
        }
        this._seqRefreshGrid();
      });

      grid.appendChild(cell);
    }

    this._seqRefreshGrid();
  }

  _seqRefreshGrid() {
    document.querySelectorAll(".seq-step").forEach(el => {
      const i = parseInt(el.dataset.idx, 10);
      const note = this.seqSteps[i];
      el.classList.toggle("filled", !!note);
      el.classList.toggle("playing", this.seqPlaying && i === this.seqPlayHead);
      el.classList.toggle("cursor", this.seqRecording && i === this.seqCursor);
      const noteEl = el.querySelector(".step-note");
      if (noteEl) noteEl.textContent = note ? this._midiName(note) : "—";
    });
  }

  _seqRecord(note) {
    this.seqSteps[this.seqCursor] = note;
    this.seqCursor = (this.seqCursor + 1) % this.seqStepCount;
    this._seqRefreshGrid();
  }

  _seqToggleRec() {
    this.seqRecording = !this.seqRecording;

    if (this.seqRecording) {
      this.seqCursor = 0;
      if (this.seqPlaying) this._seqStopPlay();
    }

    const btn = document.getElementById("seq-rec");
    if (btn) btn.classList.toggle("rec-active", this.seqRecording);

    this._seqRefreshGrid();
  }

  _seqTogglePlay() {
    if (this.seqPlaying) this._seqStopPlay();
    else this._seqStartPlay();
  }

  _seqStartPlay() {
    if (!this.isReady || !this.sourceBuffer) {
      this._status("NO SAMPLE");
      return;
    }

    this.seqPlaying = true;
    this.seqPlayHead = 0;

    if (this.seqRecording) {
      this.seqRecording = false;
      const r = document.getElementById("seq-rec");
      if (r) r.classList.remove("rec-active");
    }

    const btn = document.getElementById("seq-play");
    if (btn) {
      btn.classList.add("active");
      btn.textContent = "■ STOP";
    }

    this._seqTick();
    const ms = (60 / this.seqBPM) * 1000;
    this.seqTimer = setInterval(() => this._seqTick(), ms);
  }

  _seqStopPlay() {
    this.seqPlaying = false;

    if (this.seqTimer) {
      clearInterval(this.seqTimer);
      this.seqTimer = null;
    }

    if (this.seqLastNote !== null) {
      this._killVoices(this.seqLastNote);
      this.seqLastNote = null;
    }

    const btn = document.getElementById("seq-play");
    if (btn) {
      btn.classList.remove("active");
      btn.textContent = "▶ PLAY";
    }

    this._seqRefreshGrid();
  }

  _seqTick() {
    if (this.seqLastNote !== null) {
      this._killVoices(this.seqLastNote);
      this.seqLastNote = null;
    }

    const note = this.seqSteps[this.seqPlayHead];
    if (note !== null && note !== undefined) {
      this._playEnsemble(note, 0.8);
      this.seqLastNote = note;
    }

    this._seqRefreshGrid();
    this.seqPlayHead = (this.seqPlayHead + 1) % this.seqStepCount;
  }

  _seqClear() {
    this._seqStopPlay();
    this.seqSteps = new Array(this.seqMaxSteps).fill(null);
    this.seqCursor = 0;
    this.seqPlayHead = 0;
    this._seqBuildGrid();
  }

  _seqSetBPM(bpm) {
    this.seqBPM = Math.max(30, Math.min(300, bpm));
    const el = document.getElementById("seq-bpm-val");
    if (el) el.textContent = this.seqBPM;

    if (this.seqPlaying) {
      this._seqStopPlay();
      this._seqStartPlay();
    }
  }

  _setupModeControls() {
    document.querySelectorAll("[data-ensemble]").forEach(btn => {
      btn.addEventListener("click", () => {
        this.ensembleVoices = parseInt(btn.dataset.ensemble, 10);
        this._activateGroup("[data-ensemble]", btn);
        this._updateModeDisplay();
      });
    });

    document.querySelectorAll("[data-speed]").forEach(btn => {
      btn.addEventListener("click", () => {
        this.speedMode = parseFloat(btn.dataset.speed);
        this._activateGroup("[data-speed]", btn);
        this._updateModeDisplay();
      });
    });

    document.querySelectorAll("[data-playmode]").forEach(btn => {
      btn.addEventListener("click", () => {
        const prev = this.playMode;
        this.playMode = btn.dataset.playmode;
        this._activateGroup("[data-playmode]", btn);

        if (prev === "arp" && this.playMode !== "arp") this._arpStop();

        if (prev === "drone" && this.playMode !== "drone" && this.droneNote !== null) {
          this._killVoices(this.droneNote);
          this._setKeyClass(this.droneNote, false, "drone-held");
          this.droneNote = null;
          this._updateDroneDisplay();
        }

        const arpRow = document.getElementById("arp-row");
        const chordGrp = document.getElementById("chord-type-group");

        if (arpRow) arpRow.style.display = this.playMode === "arp" ? "flex" : "none";
        if (chordGrp) chordGrp.style.display = this.playMode === "chord" ? "flex" : "none";

        const dd = document.getElementById("drone-display");
        if (dd && this.playMode !== "drone") dd.style.display = "none";

        const ad = document.getElementById("arp-display");
        if (ad && this.playMode !== "arp") ad.style.display = "none";

        this._updateModeDisplay();
        this._status(this.playMode.toUpperCase());
      });
    });

    document.querySelectorAll("[data-chordtype]").forEach(btn => {
      btn.addEventListener("click", () => {
        this.chordType = btn.dataset.chordtype;
        this._activateGroup("[data-chordtype]", btn);
      });
    });

    document.querySelectorAll("[data-arpmode]").forEach(btn => {
      btn.addEventListener("click", () => {
        this.arpPattern = btn.dataset.arpmode;
        this.arpIndex = 0;
        this.arpDirection = 1;
        this._activateGroup("[data-arpmode]", btn);
      });
    });

    document.getElementById("arp-bpm-up")?.addEventListener("click", () => this._setArpBPM(this.arpBPM + 5));
    document.getElementById("arp-bpm-down")?.addEventListener("click", () => this._setArpBPM(this.arpBPM - 5));

    document.querySelectorAll("[data-arpoct]").forEach(btn => {
      btn.addEventListener("click", () => {
        this.arpOctaves = parseInt(btn.dataset.arpoct, 10);
        this._activateGroup("[data-arpoct]", btn);
      });
    });
  }

  _activateGroup(selector, activeBtn) {
    document.querySelectorAll(selector).forEach(b => b.classList.toggle("active", b === activeBtn));
  }

  _updateModeDisplay() {
    const spd = this.speedMode === 0.5 ? "½×" : this.speedMode === 2 ? "2×" : "1×";
    const el = document.getElementById("mode-display");
    if (el) el.textContent = `${this.playMode.toUpperCase()} · ${this.ensembleVoices}V · ${spd}`;
  }

  _createVoice(tape, vel) {
    const ctx = this.audioCtx;

    const src = ctx.createBufferSource();
    src.buffer = this.sourceBuffer;
    src.playbackRate.value = tape.playbackRate;
    this._applyWowFlutter(src, tape);

    const flt = ctx.createBiquadFilter();
    flt.type = "lowpass";
    flt.frequency.value =
      tape.filterFreq * (1 - (this.params.tapeAge / 100) * 0.5) * (this.params.brightness / 50);
    flt.Q.value = 0.7;

    const sat = this._makeSaturation(this.params.saturation / 100);

    const gn = ctx.createGain();
    gn.gain.value = 0;

    const att = (this.params.attack / 100) * 0.2 + tape.attackVariation;
    const jit = (this.params.startJitter / 100) * 0.03;
    const t0 = ctx.currentTime + Math.random() * jit;

    gn.gain.setValueAtTime(0, t0);
    gn.gain.linearRampToValueAtTime(vel * 0.8, t0 + att);

    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, tape.stereoPan * 0.6));

    src.connect(flt);
    flt.connect(sat);
    sat.connect(gn);
    gn.connect(pan);
    pan.connect(this.masterGain);

    let noiseGain = null;
    let noiseSrc = null;

    if (this.params.mechanicalNoise > 5) {
      noiseSrc = this._makeNoise();

      const nf = ctx.createBiquadFilter();
      nf.type = "bandpass";
      nf.frequency.value = 800;
      nf.Q.value = 2;

      noiseGain = ctx.createGain();
      noiseGain.gain.value = tape.noiseLevel * (this.params.mechanicalNoise / 50) * vel;

      noiseSrc.connect(nf);
      nf.connect(noiseGain);
      noiseGain.connect(pan);
      noiseSrc.start();
    }

    return {
      source: src,
      gain: gn,
      noiseGain,
      noiseSrc,
      tape,
      startTime: null
    };
  }

  _applyWowFlutter(src, tape) {
    const now = this.audioCtx.currentTime;
    const dur = this.params.tapeLength;
    const wAmt = (this.params.wow / 100) * 0.015 * tape.instability;
    const fAmt = (this.params.flutter / 100) * 0.005 * tape.instability;
    const base = src.playbackRate.value;
    const steps = Math.floor(dur * 20);

    for (let i = 0; i < steps; i++) {
      const t = i / 20;
      const w = Math.sin(t * Math.PI * 1.2 + Math.random() * 0.5) * wAmt;
      const f = Math.sin(t * Math.PI * 14 + Math.random() * 2.0) * fAmt;
      const d = (Math.random() - 0.5) * 0.002;
      src.playbackRate.setValueAtTime(base * (1 + w + f + d), now + t);
    }
  }

  _makeNoise() {
    const sz = this.audioCtx.sampleRate * 2;
    const buf = this.audioCtx.createBuffer(1, sz, this.audioCtx.sampleRate);
    const ch = buf.getChannelData(0);

    for (let i = 0; i < sz; i++) ch[i] = Math.random() * 2 - 1;

    const ns = this.audioCtx.createBufferSource();
    ns.buffer = buf;
    ns.loop = true;
    return ns;
  }

  _fadeVoice(v, dur) {
    const now = this.audioCtx.currentTime;

    v.gain.gain.cancelScheduledValues(now);
    v.gain.gain.setValueAtTime(v.gain.gain.value, now);
    v.gain.gain.linearRampToValueAtTime(0, now + dur);

    if (v.noiseGain) {
      v.noiseGain.gain.cancelScheduledValues(now);
      v.noiseGain.gain.setValueAtTime(v.noiseGain.gain.value, now);
      v.noiseGain.gain.linearRampToValueAtTime(0, now + dur);
    }

    setTimeout(() => {
      try { v.source.stop(); } catch (_) {}
      try { if (v.noiseSrc) v.noiseSrc.stop(); } catch (_) {}
    }, dur * 1000 + 100);
  }

  _buildKeyboard() {
    const kb = document.getElementById("keyboard");
    if (!kb) return;

    kb.innerHTML = "";
    const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

    this.keyLayout.forEach(kd => {
      const el = document.createElement("div");
      const midi = this.baseOctave * 12 + kd.note;

      el.className = "key" + (kd.black ? " black" : "") + (kd.note === 0 ? " root" : "");
      el.dataset.noteOffset = kd.note;
      el.dataset.code = kd.code;

      el.innerHTML =
        `<span class="key-letter">${kd.key}</span>` +
        `<span class="key-note">${names[midi % 12]}</span>`;

      const onDown = e => {
        e.preventDefault();
        this._initAudio().then(() => {
          const note = this.baseOctave * 12 + kd.note;
          this.playNote(note, 0.8);
          if (this.playMode !== "arp" && this.playMode !== "drone") el.classList.add("active");
        });
      };

      const onUp = () => {
        const note = this.baseOctave * 12 + kd.note;
        this.stopNote(note);
        el.classList.remove("active");
      };

      el.addEventListener("mousedown", onDown);
      el.addEventListener("mouseup", onUp);
      el.addEventListener("mouseleave", () => {
        if (el.classList.contains("active")) onUp();
      });
      el.addEventListener("touchstart", onDown, { passive: false });
      el.addEventListener("touchend", onUp);

      kb.appendChild(el);
    });
  }

  _setKeyClass(note, on, cls) {
    const offset = note - this.baseOctave * 12;
    document.querySelectorAll(".key").forEach(el => {
      if (parseInt(el.dataset.noteOffset, 10) === offset) {
        el.classList.toggle(cls, on);
      }
    });
  }

  _setupComputerKeyboard() {
    const held = new Set();

    document.addEventListener("keydown", e => {
      if (e.repeat) return;
      if (e.target && ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;

      const kd = this.keyLayout.find(k => k.code === e.code);
      if (kd) {
        e.preventDefault();

        if (held.has(e.code)) return;
        held.add(e.code);

        this._initAudio().then(() => {
          const note = this.baseOctave * 12 + kd.note;
          this.playNote(note, 0.8);

          if (this.playMode !== "arp" && this.playMode !== "drone") {
            const el = document.querySelector(`.key[data-code="${e.code}"]`);
            if (el) el.classList.add("active");
          }
        });
      }

      if (e.code === "ArrowUp" || e.code === "ArrowRight") {
        e.preventDefault();
        this._changeOctave(1);
      }

      if (e.code === "ArrowDown" || e.code === "ArrowLeft") {
        e.preventDefault();
        this._changeOctave(-1);
      }
    });

    document.addEventListener("keyup", e => {
      held.delete(e.code);

      const kd = this.keyLayout.find(k => k.code === e.code);
      if (kd) {
        const note = this.baseOctave * 12 + kd.note;
        this.stopNote(note);

        const el = document.querySelector(`.key[data-code="${e.code}"]`);
        if (el) el.classList.remove("active");
      }
    });
  }

  _setupOctaveButtons() {
    document.getElementById("oct-up")?.addEventListener("click", () => this._changeOctave(1));
    document.getElementById("oct-down")?.addEventListener("click", () => this._changeOctave(-1));
  }

  _changeOctave(delta) {
    const n = this.baseOctave + delta;
    if (n >= 2 && n <= 6) {
      this.baseOctave = n;
      const el = document.getElementById("octave-display");
      if (el) el.textContent = n;
      this._buildKeyboard();
      if (this.sourceBuffer) this._generateTapes();
    }
  }

  _setupEncoders() {
    document.querySelectorAll(".encoder").forEach(enc => {
      const param = enc.dataset.param;
      const min = parseFloat(enc.dataset.min);
      const max = parseFloat(enc.dataset.max);
      const init = parseFloat(enc.dataset.value);

      this.params[param] = init;
      this._setEncoderAngle(enc, init, min, max);

      let drag = false;
      let startY = 0;
      let startVal = 0;

      const onStart = e => {
        drag = true;
        startY = e.touches ? e.touches[0].clientY : e.clientY;
        startVal = this.params[param];
        e.preventDefault();
      };

      const onMove = e => {
        if (!drag) return;

        const cy = e.touches ? e.touches[0].clientY : e.clientY;
        let v = startVal + ((startY - cy) / 150) * (max - min);
        v = Math.max(min, Math.min(max, v));

        this.params[param] = v;
        this._setEncoderAngle(enc, v, min, max);
        this._onParamChange(param, v);
      };

      const onEnd = () => {
        drag = false;
      };

      enc.addEventListener("mousedown", onStart);
      enc.addEventListener("touchstart", onStart, { passive: false });
      document.addEventListener("mousemove", onMove);
      document.addEventListener("touchmove", onMove, { passive: false });
      document.addEventListener("mouseup", onEnd);
      document.addEventListener("touchend", onEnd);

      enc.addEventListener("dblclick", () => {
        this.params[param] = init;
        this._setEncoderAngle(enc, init, min, max);
        this._onParamChange(param, init);
      });
    });
  }

  _setEncoderAngle(enc, val, min, max) {
    const ind = enc.querySelector(".encoder-indicator");
    if (!ind) return;

    const rot = -135 + ((val - min) / (max - min)) * 270;
    ind.style.setProperty("--rotation", `${rot}deg`);
  }

  _syncEncoderVisual(param) {
    const enc = document.querySelector(`.encoder[data-param="${param}"]`);
    if (!enc) return;

    this._setEncoderAngle(
      enc,
      this.params[param],
      parseFloat(enc.dataset.min),
      parseFloat(enc.dataset.max)
    );
  }

  _onParamChange(param, val) {
    if (param === "masterVolume" && this.masterGain && this.audioCtx) {
      this.masterGain.gain.setTargetAtTime(val, this.audioCtx.currentTime, 0.05);
    }

    if (this.currentPreset) {
      this.currentPreset = null;
      document.querySelectorAll(".preset-btn").forEach(b => b.classList.remove("active"));
    }
  }

  async _setupMIDI() {
    if (!navigator.requestMIDIAccess) {
      const el = document.getElementById("midi-status");
      if (el) el.textContent = "NO MIDI";
      return;
    }

    try {
      const ma = await navigator.requestMIDIAccess();

      const connect = port => {
        port.onmidimessage = e => this._onMIDI(e);
        this._led("led-midi", "active");
        const el = document.getElementById("midi-status");
        if (el) el.textContent = "MIDI ON";
      };

      ma.inputs.forEach(connect);

      ma.onstatechange = e => {
        if (e.port.type === "input" && e.port.state === "connected") {
          connect(e.port);
        }
      };
    } catch (_) {
      const el = document.getElementById("midi-status");
      if (el) el.textContent = "MIDI ERR";
    }
  }

  _onMIDI(e) {
    const [st, note, vel] = e.data;
    const cmd = st & 0xf0;

    this._led("led-midi", "warning");
    setTimeout(() => this._led("led-midi", "active"), 100);

    if (cmd === 0x90 && vel > 0) {
      this._initAudio().then(() => this.playNote(note, vel / 127));
    } else if (cmd === 0x80 || (cmd === 0x90 && vel === 0)) {
      this.stopNote(note);
    }
  }

  _updateDisplay() {
    const name = this.currentBank ? this.banks[this.currentBank].name : "---";
    const bn = document.getElementById("bank-name");
    const sn = document.getElementById("sample-name");

    if (bn) bn.textContent = name;
    if (sn) {
      if (this.currentBank === "custom" && this.sourceBuffer) {
        sn.textContent = this.banks.custom.name;
      } else {
        sn.textContent = this.sourceBuffer ? name : "NO FILE";
      }
    }
  }

  _updateVoiceCount() {
    const el = document.getElementById("voices-count");
    if (el) el.textContent = this.activeVoices.size;
  }

  _status(txt) {
    const el = document.getElementById("status-text");
    if (el) el.textContent = txt;
  }

  _led(id, state) {
    const el = document.getElementById(id);
    if (!el) return;

    el.classList.remove("active", "warning");
    if (state) el.classList.add(state);
  }

  _midiName(midi) {
    const n = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    return n[midi % 12] + (Math.floor(midi / 12) - 1);
  }

  _startMeter() {
    const bar = document.getElementById("tape-fill");
    if (!bar) return;

    const tick = () => {
      if (!this.audioCtx) {
        requestAnimationFrame(tick);
        return;
      }

      let maxPct = 0;

      this.activeVoices.forEach(grp => {
        const v = grp.voices[0];
        if (v && v.startTime !== null) {
          const elapsed = this.audioCtx.currentTime - v.startTime;
          const maxDur = this.params.tapeLength * (v.tape ? v.tape.lengthFactor : 1);
          maxPct = Math.max(maxPct, Math.min(100, (elapsed / maxDur) * 100));
        }
      });

      bar.style.width = maxPct + "%";
      requestAnimationFrame(tick);
    };

    tick();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window.emullotron = new Emullotron();
});
