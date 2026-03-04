/**
 * AudioEngine.js
 * Gestion des samples et de la lecture audio
 */

import { LoFiEffects } from './LoFiEffects.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.effects = null;
    this.samples = new Map();
    this.isInitialized = false;

    // Paramètres par pad (pitch en demi-tons, volume 0..1)
    this.padParams = Array.from({ length: 6 }, () => ({
      pitch: 0,    // semitones (-24..+24 typiquement)
      volume: 0.8, // gain linéaire
    }));

    // Samples par défaut
    this.defaultSamples = [
      { id: 0, name: 'KICK', url: 'samples/kick.wav', key: 'Q' },
      { id: 1, name: 'SNARE', url: 'samples/snare.wav', key: 'W' },
      { id: 2, name: 'HIHAT', url: 'samples/hihat.wav', key: 'E' },
      { id: 3, name: 'BASS', url: 'samples/bass.wav', key: 'A' },
      { id: 4, name: 'CHOP 1', url: 'samples/chop1.wav', key: 'S' },
      { id: 5, name: 'CHOP 2', url: 'samples/chop2.wav', key: 'D' }
    ];
  }

  async init() {
    if (this.isInitialized) return;

    this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    this.effects = new LoFiEffects(this.ctx);
    this.effects.connect(this.ctx.destination);
    this.effects.applyPreset('SP1200');

    await this.loadDefaultSamples();

    this.isInitialized = true;
    console.log('🎹 Audio Engine initialisé');
  }

  async loadDefaultSamples() {
    const loadPromises = this.defaultSamples.map(async (sample) => {
      try {
        const buffer = await this.loadSampleFromURL(sample.url);
        this.samples.set(sample.id, { buffer, name: sample.name, key: sample.key });
      } catch (error) {
        console.warn(`Impossible de charger ${sample.name}:`, error);
        this.samples.set(sample.id, {
          buffer: this.createSilentBuffer(),
          name: sample.name,
          key: sample.key
        });
      }
    });

    await Promise.all(loadPromises);
  }

  async loadSampleFromURL(url) {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    return await this.ctx.decodeAudioData(arrayBuffer);
  }

  async loadSampleFromFile(padId, file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = async (e) => {
        try {
          const arrayBuffer = e.target.result;
          const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);

          const existing = this.samples.get(padId);
          this.samples.set(padId, {
            buffer: audioBuffer,
            name: file.name.replace(/\.[^/.]+$/, '').substring(0, 10).toUpperCase(),
            key: existing?.key || ''
          });

          resolve(audioBuffer);
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  createSilentBuffer() {
    return this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
  }

  // --- NEW: pad params API ---
  getPadParams(padId) {
    return this.padParams[padId] ?? { pitch: 0, volume: 0.8 };
  }

  setPadPitch(padId, semitones) {
    if (!Number.isFinite(semitones)) return;
    if (!this.padParams[padId]) return;
    // clamp raisonnable
    const st = Math.max(-24, Math.min(24, Math.round(semitones)));
    this.padParams[padId].pitch = st;
  }

  setPadVolume(padId, volume01) {
    if (!Number.isFinite(volume01)) return;
    if (!this.padParams[padId]) return;
    const v = Math.max(0, Math.min(1, volume01));
    this.padParams[padId].volume = v;
  }

  playSample(padId, time = 0) {
    const sample = this.samples.get(padId);
    if (!sample || !sample.buffer || !this.ctx) return;

    const { pitch, volume } = this.getPadParams(padId);

    const source = this.ctx.createBufferSource();
    source.buffer = sample.buffer;

    // Pitch simple (sans time-stretch)
    source.playbackRate.value = Math.pow(2, (pitch || 0) / 12);

    // Gain individuel par pad
    const gainNode = this.ctx.createGain();
    gainNode.gain.value = Number.isFinite(volume) ? volume : 0.8;

    // Connexion vers la chaîne d'effets
    source.connect(gainNode);
    gainNode.connect(this.effects.getInput());

    const startTime = time > 0 ? time : this.ctx.currentTime;
    source.start(startTime);

    return source;
  }

  getSampleInfo(padId) {
    return this.samples.get(padId);
  }

  setEffect(param, value) {
    if (!this.effects) return;

    switch (param) {
      case 'bitDepth':
        this.effects.setBitDepth(value);
        break;
      case 'sampleRate':
        this.effects.setSampleRate(value);
        break;
      case 'filter':
        this.effects.setFilterCutoff(value);
        break;
      case 'drive':
        this.effects.setDrive(value);
        break;
      case 'vinylNoise':
        this.effects.setVinylNoise(value);
        break;
      case 'compression':
        this.effects.setCompression(value);
        break;
    }
  }

  getCurrentTime() {
    return this.ctx?.currentTime || 0;
  }

  resume() {
    if (this.ctx?.state === 'suspended') {
      this.ctx.resume();
    }
  }
}
