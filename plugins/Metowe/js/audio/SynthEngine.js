/**
 * SynthEngine.js
 * Moteur du synthé polyphonique + scheduling
 * - Polyphony (voice stealing simple)
 * - Unison (multi-voices par note)
 * - setDrive appliqué aux voix existantes + futures
 *
 * NOTE:
 * Ici on route directement vers destination.
 * Les FX Worklets (chorus/bitcrusher/...) viendront ensuite.
 */

import { Voice } from './Voice.js';

export class SynthEngine {
  constructor() {
    this.ctx = null;

    this.polyphony = 8;
    this.activeVoices = []; // { voice, note, startedAt }

    this.master = null;

    // UNISON
    this.unisonVoices = 1; // 1..6
    this.unisonDetune = 10; // cents per spread step

    // global params
    this.driveAmount = 2.0;
  }

  async init() {
    if (this.ctx) return;

    this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);
  }

  resume() {
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }

  getCurrentTime() {
    return this.ctx?.currentTime || 0;
  }

  // ----------------------------
  // PARAMS
  // ----------------------------
  setUnisonVoices(n) {
    this.unisonVoices = Math.max(1, Math.min(6, parseInt(n, 10) || 1));
  }

  setUnisonDetune(cents) {
    this.unisonDetune = Math.max(0, Math.min(50, Number(cents) || 0));
  }

  setDrive(amount) {
    this.driveAmount = Math.max(0, Number(amount) || 0);
    // applique sur voix existantes
    this.activeVoices.forEach(({ voice }) => {
      voice.setDrive?.(this.driveAmount);
    });
  }

  // ----------------------------
  // VOICE ALLOCATION
  // ----------------------------
  _stealOneVoice() {
    // vole la plus ancienne (simple)
    if (this.activeVoices.length === 0) return null;

    let idx = 0;
    let oldest = this.activeVoices[0].startedAt;

    for (let i = 1; i < this.activeVoices.length; i++) {
      if (this.activeVoices[i].startedAt < oldest) {
        oldest = this.activeVoices[i].startedAt;
        idx = i;
      }
    }

    const stolen = this.activeVoices.splice(idx, 1)[0];
    try { stolen.voice.noteOff(); } catch {}
    return stolen;
  }

  _allocateVoice(note) {
    // limite polyphony en "instances de voix" (donc unison compte)
    while (this.activeVoices.length >= this.polyphony) {
      this._stealOneVoice();
    }

    const v = new Voice(this.ctx);
    v.setDrive?.(this.driveAmount);
    v.connect(this.master);

    const entry = { voice: v, note, startedAt: this.getCurrentTime() };
    this.activeVoices.push(entry);
    return entry;
  }

  // ----------------------------
  // NOTE API
  // ----------------------------
  noteOn(note, velocity = 1) {
    this.resume();
    const vel = Math.max(0, Math.min(1, Number(velocity) || 0));

    const u = this.unisonVoices;
    const center = (u - 1) / 2;

    const created = [];

    for (let i = 0; i < u; i++) {
      const entry = this._allocateVoice(note);
      const spread = (i - center) * this.unisonDetune;

      // detune cents
      entry.voice.saw.detune.setValueAtTime(spread, this.getCurrentTime());
      entry.voice.pulse.detune.setValueAtTime(spread, this.getCurrentTime());

      entry.voice.noteOn(note, vel);
      created.push(entry.voice);
    }

    return created;
  }

  noteOff(note) {
    const now = this.getCurrentTime();

    // relâche toutes les voix correspondant à cette note
    const remaining = [];
    for (const entry of this.activeVoices) {
      if (entry.note === note) {
        try { entry.voice.noteOff(); } catch {}
        // on laisse la voix finir son release, mais on la "sort" du pool logique
        // (simple et évite le spam polyphony)
      } else {
        remaining.push(entry);
      }
    }
    this.activeVoices = remaining;
  }

  // scheduling helper (pour séquenceur)
  playNoteAt(note, time, velocity = 1, duration = 0.2) {
    const t = Math.max(this.getCurrentTime(), time);
    // on "triche" : on déclenche maintenant avec un timeout aligné.
    const delayMs = (t - this.getCurrentTime()) * 1000;

    setTimeout(() => {
      const voices = this.noteOn(note, velocity);
      setTimeout(() => {
        // release
        voices.forEach(v => v.noteOff());
      }, duration * 1000);
    }, Math.max(0, delayMs));
  }

  playChordAt(notes, time, velocity = 1, duration = 0.3) {
    (notes || []).forEach(n => this.playNoteAt(n, time, velocity, duration));
  }
}
