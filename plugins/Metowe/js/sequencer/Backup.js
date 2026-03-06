/**
 * Sequencer.js (Synth)
 * - 16 steps
 * - 6 lanes (comme ton sampler) MAIS ici: lanes = "variations" (octave/registre)
 *   pour pouvoir jouer vite des patterns riches.
 *
 * Chaque step stocke un "event":
 *  - on/off
 *  - degree (0..6) en gamme mineure naturelle
 *  - octave offset (-1..+1)
 *  - chord (triad) true/false
 *  - velocity 0..1
 *
 * Humanize:
 *  - vel jitter (0..30%)
 *  - timing jitter (0..20ms)
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
    this.root = "A";          // A minor default
    this.baseOctave = 4;      // octave for degree mapping

    // humanize
    this.humanizePct = 6;     // 0..30 (%)
    this.humanizeTimeMs = 8;  // 0..20 ms

    // scheduling
    this.nextStepTime = 0;
    this.scheduleAheadTime = 0.1;
    this.lookahead = 25;

    // grid[lane][step] = event
    this.grid = Array.from({ length: this.lanes }, () =>
      Array.from({ length: this.steps }, () => this._emptyEvent())
    );

    // Default pattern so PLAY is immediately musical
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

  setOctave(oct) {
    this.baseOctave = Math.max(2, Math.min(6, Number(oct) || 4));
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

  // long press = mute/unmute (le step reste programmé)
  toggleMute(lane, step) {
    const ev = this.getEvent(lane, step);
    ev.mute = !ev.mute;
    this.grid[lane][step] = ev;
    return ev.mute;
  }

  // Tap while ON = cycle degree (nice on mobile)
  cycleDegree(lane, step) {
    const ev = this.getEvent(lane, step);
    if (!ev.on) ev.on = true;
    ev.degree = (ev.degree + 1) % 7;
    this.grid[lane][step] = ev;
    return ev.degree;
  }

  toggleChord(lane, step) {
    const ev = this.getEvent(lane, step);
    if (!ev.on) ev.on = true;
    ev.chord = !ev.chord;
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
    // Choose roots around octave 4 center
    const map = { C: 60, D: 62, E: 64, F: 65, G: 67, A: 69, B: 71 };
    const base = map[this.root] ?? 69;
    // adjust to desired baseOctave
    const target = (this.baseOctave * 12) + (base % 12);
    return target;
  }

  _minorScaleSemis() {
    // Natural minor: 1 2 b3 4 5 b6 b7
    return [0, 2, 3, 5, 7, 8, 10];
  }

  _degreeToMidi(degree, octOffset = 0) {
    const root = this._rootMidi();
    const scale = this._minorScaleSemis();
    const deg = ((degree % 7) + 7) % 7;
    return root + scale[deg] + (octOffset * 12);
  }

  _triadForDegree(degree, octOffset = 0) {
    // diatonic triad degrees: 1-3-5 in scale
    const d1 = degree;
    const d3 = (degree + 2) % 7;
    const d5 = (degree + 4) % 7;

    // keep triad reasonably stacked; bump octave if wrap
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

    // Visual callback synced to audio time
    const delay = (t - this.synth.getCurrentTime()) * 1000;
    setTimeout(() => {
      if (this.isPlaying) this.onStepChange?.(step);
    }, Math.max(0, delay));

    // Play events
    for (let lane = 0; lane < this.lanes; lane++) {
      const ev = this.grid[lane][step];
      if (!ev?.on || ev.mute) continue;

      // humanize timing
      let tt = t;
      const jMs = this.humanizeTimeMs;
      if (jMs > 0) {
        tt += (Math.random() * 2 - 1) * (jMs / 1000);
      }

      // humanize vel
      let vel = Math.max(0, Math.min(1, Number(ev.vel ?? 0.85)));
      const h = this.humanizePct / 100;
      if (h > 0) {
        vel = Math.max(0, Math.min(1, vel * (1 + (Math.random() * 2 - 1) * h)));
      }

      // lane influences register (nice “instant groovebox” feel)
      const laneOct = lane <= 1 ? 0 : lane <= 3 ? 1 : -1;

      if (ev.chord) {
        const notes = this._triadForDegree(ev.degree, ev.oct + laneOct);
        this.synth.playChordAt(notes, tt, vel, 0.22);
      } else {
        const note = this._degreeToMidi(ev.degree, ev.oct + laneOct);
        this.synth.playNoteAt(note, tt, vel, 0.18);
      }
    }
  }

  _advanceStep() {
    this.nextStepTime += this.getStepDuration();
    this.currentStep = (this.currentStep + 1) % this.steps;
  }

  // ---------- default pattern ----------
  loadDefaultPattern() {
    // Pattern “musical instant” en A minor :
    // lanes 0..5 donnent une impression d’arpège + accords
    this.clear();

    // Lane 0: simple arp degrees
    const arp = [0, 2, 4, 6, 0, 2, 4, 6, 0, 2, 5, 4, 0, 2, 4, 6];
    for (let s = 0; s < 16; s++) {
      this.grid[0][s] = { on: true, degree: arp[s], oct: 0, chord: false, vel: 0.9, mute: false };
    }

    // Lane 2: chords on downbeats (0,4,8,12)
    const chordDegrees = [0, 5, 3, 4]; // i, VI, iv, v (natural minor vibe)
    [0, 4, 8, 12].forEach((s, i) => {
      this.grid[2][s] = { on: true, degree: chordDegrees[i], oct: -1, chord: true, vel: 0.8, mute: false };
    });

    // Lane 4: little syncopation
    [3, 7, 11, 15].forEach((s) => {
      this.grid[4][s] = { on: true, degree: 4, oct: 0, chord: false, vel: 0.55, mute: false };
    });
  }
}
