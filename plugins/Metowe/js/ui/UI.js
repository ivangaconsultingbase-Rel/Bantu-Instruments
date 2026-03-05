/**
 * UI.js
 * UI inspirée du sampler (mobile + desktop) pour le synthé.
 *
 * Ce fichier:
 * - Ne casse pas si certains éléments n'existent pas (IDs optionnels)
 * - Branche les contrôles: play, bpm, swing (si présents)
 * - Branche UNISON + DETUNE + DRIVE (si présents)
 * - Branche un "clavier" si tu as une zone #keyboard (optionnel)
 *
 * IMPORTANT:
 * Adapte les IDs si ton index.html utilise d'autres noms.
 */

export class UI {
  constructor(synthEngine, sequencer) {
    this.synth = synthEngine;
    this.sequencer = sequencer;

    this.isMobile = this.detectMobile();

    // simple keyboard mapping
    this.keyMap = {
      // row 1
      'Z': 48, 'S': 49, 'X': 50, 'D': 51, 'C': 52, 'V': 53, 'G': 54, 'B': 55, 'H': 56, 'N': 57, 'J': 58, 'M': 59,
      // row 2
      'Q': 60, '2': 61, 'W': 62, '3': 63, 'E': 64, 'R': 65, '5': 66, 'T': 67, '6': 68, 'Y': 69, '7': 70, 'U': 71, 'I': 72
    };

    this.downKeys = new Set();
  }

  // ---------- DOM helpers ----------
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
    // Init engine if needed (safety)
    // main.js doit normalement gérer ça, mais on reste safe.
    this.bindTransport();
    this.bindSynthControls();
    this.bindSequencerControls();
    this.bindKeyboard();
    this.updateHints();

    // defaults UI -> engine
    const unison = this.$('unison');
    if (unison) this.synth.setUnisonVoices(parseInt(unison.value, 10));

    const detune = this.$('detune');
    if (detune) this.synth.setUnisonDetune(Number(detune.value));

    const drive = this.$('drive');
    if (drive) this.synth.setDrive(Number(drive.value));
  }

  updateHints() {
    // optionnel
    const hint = this.$('pad-hint');
    if (!hint) return;
    hint.textContent = this.isMobile
      ? 'Tap pour jouer · Clavier tactile'
      : 'Clavier PC + souris';
  }

  // ---------------------------
  // TRANSPORT
  // ---------------------------
  bindTransport() {
    this.$('play-btn')?.addEventListener('click', () => {
      if (!this.sequencer) return;

      if (this.sequencer.isPlaying) {
        this.sequencer.stop();
        this.$('play-btn')?.classList.remove('active');
      } else {
        this.synth.resume?.();
        this.sequencer.start();
        this.$('play-btn')?.classList.add('active');
      }
    });

    this.$('clear-btn')?.addEventListener('click', () => {
      this.sequencer?.clear?.();
    });

    // NOTE: tu veux enlever STOP => ne rien binder si absent
    this.$('stop-btn')?.addEventListener('click', () => {
      this.sequencer?.stop?.();
      this.$('play-btn')?.classList.remove('active');
    });
  }

  // ---------------------------
  // SYNTH CONTROLS (UNISON / DETUNE / DRIVE)
  // ---------------------------
  bindSynthControls() {
    // UNISON
    this.$('unison')?.addEventListener('input', (e) => {
      const v = parseInt(e.target.value, 10) || 1;
      this.synth.setUnisonVoices(v);
      this.setText('unison-val', v);
    });

    // DETUNE
    this.$('detune')?.addEventListener('input', (e) => {
      const v = Number(e.target.value) || 0;
      this.synth.setUnisonDetune(v);
      this.setText('detune-val', Math.round(v));
    });

    // DRIVE
    this.$('drive')?.addEventListener('input', (e) => {
      const v = Number(e.target.value) || 0;
      this.synth.setDrive(v);
      this.setText('drive-val', v.toFixed(1));
    });
  }

  // ---------------------------
  // SEQUENCER CONTROLS (BPM/SWING)
  // ---------------------------
  bindSequencerControls() {
    this.$('bpm')?.addEventListener('input', (e) => {
      const bpm = parseInt(e.target.value, 10) || 90;
      this.sequencer?.setBPM?.(bpm);
      this.setText('bpm-display', bpm);
      this.setText('bpm-val', bpm);
    });

    this.$('swing')?.addEventListener('input', (e) => {
      const swing = parseInt(e.target.value, 10) || 0;
      this.sequencer?.setSwing?.(swing);
      this.setText('swing-display', swing);
      this.setText('swing-val', `${swing}%`);
    });
  }

  // ---------------------------
  // PC KEYBOARD PLAYING
  // ---------------------------
  bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      const key = (e.key || '').toUpperCase();
      if (this.downKeys.has(key)) return;

      // space -> play toggle (si sequencer)
      if (e.code === 'Space') {
        e.preventDefault();
        this.$('play-btn')?.click();
        return;
      }

      const note = this.keyMap[key];
      if (note == null) return;

      e.preventDefault();
      this.downKeys.add(key);

      this.synth.resume?.();
      this.synth.noteOn?.(note, 1);
    });

    document.addEventListener('keyup', (e) => {
      const key = (e.key || '').toUpperCase();
      const note = this.keyMap[key];
      if (note == null) return;

      e.preventDefault();
      this.downKeys.delete(key);

      this.synth.noteOff?.(note);
    });
  }
}
