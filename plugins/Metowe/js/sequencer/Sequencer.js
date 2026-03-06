/**
 * Sequencer.js (AKOMGA)
 * - 16 steps, 6 lanes
 * - Events: on/off, degree, oct, chord, vel, mute
 *
 * PATCHES:
 * - ChordMemory:
 *    - Toggle chord -> rappelle le dernier degré d’accord mémorisé
 *    - Playback chord -> met à jour la mémoire
 *
 * - Arp:
 *    - Choix "no-UI": ARP automatique UNIQUEMENT sur lanes 0..1 lorsque chord=true
 *    - Lanes 2..5: chord=true => accord bloc (stable, moins CPU, plus "track chords")
 *    - Arp modes: off | up | down | updown | random (par défaut "up")
 *    - Arp density: 1..6 notes par step (par défaut 3)
 *    - Arp gate: 0.1..1 (durée relative, par défaut 0.88)
 *
 * Setters exposés:
 *   setArpMode(mode), setArpNotesPerStep(n), setArpGate(g)
 */

export class Sequencer {
  constructor(synthEngine, onStepChange) {
    this.synth = synthEngine;
    this.onStepChange = onStepChange;

    this.steps = 16;
    this.lanes = 6;

    this.bpm = 96;
    this.swing = 0;

    this.currentStep = 0;
    this.lastPlayedStep = -1;
    this.isPlaying = false;
    this.timer = null;

    // scale
    this.root = "A";
    this.baseOctave = 4;

    // humanize
    this.humanizePct = 6;      // 0..30
    this.humanizeTimeMs = 8;   // 0..20

    // scheduling
    this.nextStepTime = 0;
    this.scheduleAheadTime = 0.1;
    this.lookahead = 25;

    this.grid = Array.from({ length: this.lanes }, () =>
      Array.from({ length: this.steps }, () => this._emptyEvent())
    );

    // -------------------------
    // ChordMemory
    // -------------------------
    this.chordMemoryEnabled = true;
    this._lastChordDegree = 0;
    this._lastChordOct = 0;

    // -------------------------
    // Arp (global engine params)
    // -------------------------
    this.arp = {
      mode: "up",        // off | up | down | updown | random
      notesPerStep: 3,   // 1..6
      gate: 0.88         // 0.1..1
    };

    // -------------------------
    // Choix: arp seulement sur lanes 0..1
    // -------------------------
    this.arpLanesMax = 1; // lanes 0 et 1

    this.loadDefaultPattern();
  }

  _emptyEvent() {
    return { on: false, degree: 0, oct: 0, chord: false, vel: 0.85, mute: false };
  }

  // ---------- tempo ----------
  setBPM(bpm) { this.bpm = Math.max(60, Math.min(200, Number(bpm) || 96)); }
  setSwing(swing) { this.swing = Math.max(0, Math.min(75, Number(swing) || 0)); }

  getStepDuration() { return (60 / this.bpm) / 4; } // 16th
  getSwingOffset() { return this.getStepDuration() * (this.swing / 100) * 0.5; }

  // ---------- humanize ----------
  setHumanize(pct) { this.humanizePct = Math.max(0, Math.min(30, Number(pct) || 0)); }
  setHumanizeTime(ms) { this.humanizeTimeMs = Math.max(0, Math.min(20, Number(ms) || 0)); }

  // ---------- scale ----------
  setRoot(letter) {
    const ok = ["A","B","C","D","E","F","G"];
    this.root = ok.includes(letter) ? letter : "A";
  }
  setOctave(oct) { this.baseOctave = Math.max(2, Math.min(6, Number(oct) || 4)); }

  // ---------- Arp setters ----------
  setArpMode(mode) {
    const m = String(mode || "off").toLowerCase();
    const ok = ["off","up","down","updown","random"];
    this.arp.mode = ok.includes(m) ? m : "off";
  }
  setArpNotesPerStep(n) {
    this.arp.notesPerStep = Math.max(1, Math.min(6, parseInt(n, 10) || 3));
  }
  setArpGate(g) {
    this.arp.gate = Math.max(0.1, Math.min(1, Number(g) || 0.88));
  }

  // ---------- editing ----------
  getEvent(lane, step) {
    return this.grid?.[lane]?.[step] || this._emptyEvent();
  }

  toggleStep(lane, step) {
    const ev = this.getEvent(lane, step);
    ev.on = !ev.on;
    if (!ev.on) ev.chord = false;
    this.grid[lane][step] = ev;
    return ev.on;
  }

  toggleMute(lane, step) {
    const ev = this.getEvent(lane, step);
    ev.mute = !ev.mute;
    this.grid[lane][step] = ev;
    return ev.mute;
  }

  cycleDegree(lane, step) {
    const ev = this.getEvent(lane, step);
    if (!ev.on) ev.on = true;
    ev.degree = (ev.degree + 1) % 7;
    this.grid[lane][step] = ev;

    if (ev.chord && this.chordMemoryEnabled) {
      this._lastChordDegree = ev.degree;
      this._lastChordOct = ev.oct || 0;
    }
    return ev.degree;
  }

  toggleChord(lane, step) {
    const ev = this.getEvent(lane, step);
    if (!ev.on) ev.on = true;

    ev.chord = !ev.chord;

    if (ev.chord && this.chordMemoryEnabled) {
      ev.degree = this._lastChordDegree;
      // ev.oct = this._lastChordOct; // option si tu veux “rappeler” l’octave
    }

    this.grid[lane][step] = ev;
    return ev.chord;
  }

  clear() {
    this.grid = Array.from({ length: this.lanes }, () =>
      Array.from({ length: this.steps }, () => this._emptyEvent())
    );
  }

  // ---------- MIDI helpers ----------
  _rootMidi() {
    const map = { C: 60, D: 62, E: 64, F: 65, G: 67, A: 69, B: 71 };
    const base = map[this.root] ?? 69;
    return (this.baseOctave * 12) + (base % 12);
  }

  _minorScaleSemis() { return [0, 2, 3, 5, 7, 8, 10]; }

  _degreeToMidi(degree, octOffset = 0) {
    const root = this._rootMidi();
    const scale = this._minorScaleSemis();
    const deg = ((degree % 7) + 7) % 7;
    return root + scale[deg] + (octOffset * 12);
  }

  _triadForDegree(degree, octOffset = 0) {
    const d1 = degree;
    const d3 = (degree + 2) % 7;
    const d5 = (degree + 4) % 7;

    const n1 = this._degreeToMidi(d1, octOffset);
    let n3 = this._degreeToMidi(d3, octOffset);
    let n5 = this._degreeToMidi(d5, octOffset);

    if (n3 <= n1) n3 += 12;
    if (n5 <= n3) n5 += 12;

    return [n1, n3, n5];
  }

  // ---------- transport ----------
  start() {
    if (this.isPlaying) return;
    this.synth.resume();

    this.isPlaying = true;
    this.currentStep = 0;
    this.lastPlayedStep = -1;
    this.nextStepTime = this.synth.getCurrentTime();

    this._schedule();
  }

  stop() {
    this.isPlaying = false;
    this.currentStep = 0;
    this.lastPlayedStep = -1;

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    this.onStepChange?.(-1);
  }

  togglePlay() {
    if (this.isPlaying) this.stop();
    else this.start();
  }

  _schedule() {
    if (!this.isPlaying) return;

    const now = this.synth.getCurrentTime();

    while (this.nextStepTime < now + this.scheduleAheadTime) {
      this._playStep(this.currentStep, this.nextStepTime);
      this._advanceStep();
    }

    this.timer = setTimeout(() => this._schedule(), this.lookahead);
  }

  _playStep(step, time) {
    this.lastPlayedStep = step;

    let t = time;
    if (step % 2 === 1) t += this.getSwingOffset();

    // UI highlight
    const delay = (t - this.synth.getCurrentTime()) * 1000;
    setTimeout(() => {
      if (this.isPlaying) this.onStepChange?.(step);
    }, Math.max(0, delay));

    const stepDur = this.getStepDuration();

    for (let lane = 0; lane < this.lanes; lane++) {
      const ev = this.grid[lane][step];
      if (!ev?.on || ev.mute) continue;

      // humanize timing
      let tt = t;
      if (this.humanizeTimeMs > 0) {
        tt += (Math.random() * 2 - 1) * (this.humanizeTimeMs / 1000);
      }

      // humanize vel
      let vel = Math.max(0, Math.min(1, Number(ev.vel ?? 0.85)));
      const h = this.humanizePct / 100;
      if (h > 0) {
        vel = Math.max(0, Math.min(1, vel * (1 + (Math.random() * 2 - 1) * h)));
      }

      // lane register flavor
      const laneOct = lane <= 1 ? 0 : lane <= 3 ? 1 : -1;

      if (ev.chord) {
        // update chord memory on playback
        if (this.chordMemoryEnabled) {
          this._lastChordDegree = ev.degree;
          this._lastChordOct = ev.oct || 0;
        }

        const notes = this._triadForDegree(ev.degree, (ev.oct || 0) + laneOct);

        // ✅ CHOIX: arp seulement lanes 0..1, et seulement si mode != off
        const arpAllowed = (lane <= this.arpLanesMax) && (this.arp.mode !== "off");

        if (arpAllowed) {
          this._playArp(notes, tt, vel, stepDur);
        } else {
          // chord block
          this.synth.playChordAt(notes, tt, vel, 0.22);
        }
      } else {
        const note = this._degreeToMidi(ev.degree, (ev.oct || 0) + laneOct);
        this.synth.playNoteAt(note, tt, vel, 0.18);
      }
    }
  }

  _playArp(notes, t, vel, stepDur) {
    const mode = this.arp.mode;
    const count = Math.max(1, Math.min(6, this.arp.notesPerStep));
    const gate = Math.max(0.1, Math.min(1, this.arp.gate));

    let seq = notes.slice();

    if (mode === "down") seq = seq.slice().reverse();
    else if (mode === "random") seq = seq.slice().sort(() => Math.random() - 0.5);
    else if (mode === "updown") {
      const mid = seq.slice(1, -1).reverse();
      seq = seq.concat(mid);
    } // up default

    const dt = stepDur / count;
    const dur = Math.max(0.03, dt * gate);

    for (let i = 0; i < count; i++) {
      const n = seq[i % seq.length];
      this.synth.playNoteAt(n, t + i * dt, vel, dur);
    }
  }

  _advanceStep() {
    this.nextStepTime += this.getStepDuration();
    this.currentStep = (this.currentStep + 1) % this.steps;
  }

  loadDefaultPattern() {
    this.clear();

    const arp = [0, 2, 4, 6, 0, 2, 4, 6, 0, 2, 5, 4, 0, 2, 4, 6];
    for (let s = 0; s < 16; s++) {
      this.grid[0][s] = { on: true, degree: arp[s], oct: 0, chord: false, vel: 0.9, mute: false };
    }

    const chordDegrees = [0, 5, 3, 4];
    [0, 4, 8, 12].forEach((s, i) => {
      this.grid[2][s] = { on: true, degree: chordDegrees[i], oct: -1, chord: true, vel: 0.8, mute: false };
    });

    [3, 7, 11, 15].forEach((s) => {
      this.grid[4][s] = { on: true, degree: 4, oct: 0, chord: false, vel: 0.55, mute: false };
    });

    this._lastChordDegree = chordDegrees[0];
    this._lastChordOct = -1;
  }
}
