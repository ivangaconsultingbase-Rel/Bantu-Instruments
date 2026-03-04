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
    
    // Samples par défaut (URLs ou chemins locaux)
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

    // Création du contexte audio
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Initialisation des effets Lo-Fi
    this.effects = new LoFiEffects(this.ctx);
    this.effects.connect(this.ctx.destination);
    this.effects.applyPreset('SP1200');

    // Chargement des samples par défaut
    await this.loadDefaultSamples();
    
    this.isInitialized = true;
    console.log('🎹 Audio Engine initialisé');
  }

  async loadDefaultSamples() {
    const loadPromises = this.defaultSamples.map(async (sample) => {
      try {
        const buffer = await this.loadSampleFromURL(sample.url);
        this.samples.set(sample.id, {
          buffer,
          name: sample.name,
          key: sample.key
        });
      } catch (error) {
        console.warn(`Impossible de charger ${sample.name}:`, error);
        // Créer un buffer vide en fallback
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
          
          // Mettre à jour le sample
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
    // Buffer silencieux d'une seconde
    return this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
  }

  playSample(padId, time = 0) {
    const sample = this.samples.get(padId);
    if (!sample || !sample.buffer) return;

    const source = this.ctx.createBufferSource();
    source.buffer = sample.buffer;

    // Gain individuel pour chaque sample
    const gainNode = this.ctx.createGain();
    gainNode.gain.value = 0.8;

    // Connexion vers la chaîne d'effets
    source.connect(gainNode);
    gainNode.connect(this.effects.getInput());

    // Lecture
    const startTime = time > 0 ? time : this.ctx.currentTime;
    source.start(startTime);

    return source;
  }

  getSampleInfo(padId) {
    return this.samples.get(padId);
  }

  // Accès aux contrôles d'effets
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
