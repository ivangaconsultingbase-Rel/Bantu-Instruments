/**
 * AudioEngine.js
 * v2 — Param locks · Live Sampling depuis micro/entrée audio
 *
 * NOUVEAU:
 * - playSample(padId, time, velocity, lock)
 *   lock = { pitch?: number } → surcharge le pitch du pad pour ce step seulement
 *
 * - startLiveSampling(padId, onLevel)
 *   Démarre la capture depuis getUserMedia (micro ou entrée audio).
 *   onLevel(0..1) est appelé à chaque frame pour un VU meter.
 *   Utilise ScriptProcessor pour la capture PCM (compatible partout, inclus Safari).
 *
 * - stopLiveSampling()
 *   Arrête la capture, construit un AudioBuffer depuis les données PCM,
 *   sauvegarde sur le pad cible, retourne padId | null.
 */

import { LoFiEffects } from './LoFiEffects.js';

export class AudioEngine {
  constructor() {
    this.ctx     = null;
    this.effects = null;
    this.samples = new Map();
    this.isInitialized = false;

    this.defaultSamples = [
      { id: 0, name: 'KICK',   url: 'samples/kick.wav',  key: 'Q' },
      { id: 1, name: 'SNARE',  url: 'samples/snare.wav', key: 'W' },
      { id: 2, name: 'HIHAT',  url: 'samples/hihat.wav', key: 'E' },
      { id: 3, name: 'BASS',   url: 'samples/bass.wav',  key: 'A' },
      { id: 4, name: 'CHOP 1', url: 'samples/chop1.wav', key: 'S' },
      { id: 5, name: 'CHOP 2', url: 'samples/chop2.wav', key: 'D' },
    ];

    // Paramètres par pad
    this.padPitch  = Array(6).fill(0);    // semitones -24..+24
    this.padVolume = Array(6).fill(0.8);  // 0..1

    // Métronome
    this.metronomeEnabled = false;
    this.metronomeLevel   = 0.25;

    // ── Live Sampling state ──
    this._liveRecording = false;
    this._livePadId     = null;
    this._liveStream    = null;
    this._liveSrc       = null;
    this._liveProcessor = null;
    this._liveMuteGain  = null;
    this._liveAnalyser  = null;
    this._liveBuffers   = [];
  }

  // ─── Initialisation ───────────────────────────────────────────────────────

  async init() {
    if (this.isInitialized) return;

    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.effects = new LoFiEffects(this.ctx);
    this.effects.connect(this.ctx.destination);
    this.effects.applyPreset('MPC60');

    await this.loadDefaultSamples();

    this.isInitialized = true;
    console.log('🎹 Audio Engine initialisé');
  }

  async loadDefaultSamples() {
    await Promise.all(this.defaultSamples.map(async (s) => {
      try {
        const buf = await this.loadSampleFromURL(s.url);
        this.samples.set(s.id, { buffer: buf, name: s.name, key: s.key });
      } catch {
        this.samples.set(s.id, { buffer: this.createSilentBuffer(), name: s.name, key: s.key });
      }
    }));
  }

  async loadSampleFromURL(url) {
    const resp = await fetch(url);
    const ab   = await resp.arrayBuffer();
    return this.ctx.decodeAudioData(ab);
  }

  async loadSampleFromFile(padId, file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const buf = await this.ctx.decodeAudioData(e.target.result);
          const existing = this.samples.get(padId);
          this.samples.set(padId, {
            buffer: buf,
            name:   file.name.replace(/\.[^/.]+$/, '').substring(0, 10).toUpperCase(),
            key:    existing?.key || ''
          });
          resolve(buf);
        } catch (err) { reject(err); }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  createSilentBuffer() {
    return this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
  }

  // ─── Lecture ──────────────────────────────────────────────────────────────

  /**
   * Lecture d'un sample avec support des parameter locks.
   * @param {number}  padId
   * @param {number}  time      Temps audio (0 = maintenant)
   * @param {number}  velocity  0..1
   * @param {Object}  lock      { pitch?: number } — surcharge le pitch du pad si défini
   */
  playSample(padId, time = 0, velocity = 1, lock = {}) {
    const sample = this.samples.get(padId);
    if (!sample?.buffer) return;

    const source = this.ctx.createBufferSource();
    source.buffer = sample.buffer;

    // Pitch : le param lock surcharge le pitch par défaut du pad
    const st = (lock.pitch !== undefined && lock.pitch !== null)
      ? lock.pitch
      : (this.padPitch[padId] ?? 0);
    source.detune.value = st * 100; // cents

    const vel    = Math.max(0, Math.min(1, Number(velocity)));
    const padVol = this.padVolume[padId] ?? 0.8;
    const gainNode = this.ctx.createGain();
    gainNode.gain.value = 0.8 * padVol * vel;

    source.connect(gainNode);
    gainNode.connect(this.effects.getInput());

    const startTime = time > 0 ? time : this.ctx.currentTime;
    source.start(startTime);
    return source;
  }

  getSampleInfo(padId) { return this.samples.get(padId); }

  // ─── Paramètres par pad ───────────────────────────────────────────────────

  getPadParams(padId) {
    return {
      pitch:  this.padPitch[padId]  ?? 0,
      volume: this.padVolume[padId] ?? 0.8
    };
  }

  setPadPitch(padId, semitones) {
    this.padPitch[padId] = Math.max(-24, Math.min(24, Number(semitones) || 0));
  }

  setPadVolume(padId, vol01) {
    this.padVolume[padId] = Math.max(0, Math.min(1, Number(vol01)));
  }

  // ─── Métronome ────────────────────────────────────────────────────────────

  setMetronomeEnabled(on)    { this.metronomeEnabled = !!on; }
  setMetronomeLevel(level01) { this.metronomeLevel = Math.max(0, Math.min(1, Number(level01))); }

  playClick(time, accent = false) {
    if (!this.ctx || !this.metronomeEnabled) return;
    const t = Math.max(this.ctx.currentTime, time);
    const osc  = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(accent ? 2200 : 1500, t);

    const level = (accent ? 1.0 : 0.7) * this.metronomeLevel;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(level, t + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.06);
  }

  // ─── Live Sampling ────────────────────────────────────────────────────────

  /** true si un sampling est en cours */
  get isLiveSampling()  { return this._liveRecording; }
  /** padId en cours d'enregistrement, ou null */
  get liveSamplingPad() { return this._livePadId; }

  /**
   * Démarre la capture audio depuis le micro ou une entrée audio.
   * Utilise ScriptProcessor pour la compatibilité maximale (Chrome, Firefox, Safari, iOS).
   *
   * @param {number}    padId     Pad cible
   * @param {Function}  onLevel   Callback(level: 0..1) appelé à chaque frame RAF
   * @throws Error si getUserMedia est refusé ou indisponible
   */
  async startLiveSampling(padId, onLevel) {
    // Arrêter tout sampling en cours
    if (this._liveRecording) await this.stopLiveSampling();

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('getUserMedia non supporté sur cet appareil/navigateur.');
    }

    await this.resume();

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation:  false,
        noiseSuppression:  false,
        autoGainControl:   false,
        channelCount:      1,
        sampleRate:        { ideal: this.ctx.sampleRate }
      },
      video: false
    });

    this._liveStream    = stream;
    this._livePadId     = padId;
    this._liveRecording = true;
    this._liveBuffers   = [];

    // Source depuis le stream
    const src = this.ctx.createMediaStreamSource(stream);

    // Analyseur pour le VU meter
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 256;

    // ScriptProcessor pour capturer le PCM brut
    // taille 4096 samples, 1 canal entrée, 1 canal sortie
    // eslint-disable-next-line no-undef
    const processor = this.ctx.createScriptProcessor(4096, 1, 1);
    processor.onaudioprocess = (e) => {
      if (!this._liveRecording) return;
      // Copie des données d'entrée (cloner car le buffer est réutilisé)
      const data = e.inputBuffer.getChannelData(0);
      this._liveBuffers.push(new Float32Array(data));
    };

    // Gain muet : nécessaire pour que onaudioprocess se déclenche
    const muteGain = this.ctx.createGain();
    muteGain.gain.value = 0;

    src.connect(analyser);
    src.connect(processor);
    processor.connect(muteGain);
    muteGain.connect(this.ctx.destination);

    this._liveSrc       = src;
    this._liveProcessor = processor;
    this._liveMuteGain  = muteGain;
    this._liveAnalyser  = analyser;

    // VU meter via requestAnimationFrame
    if (onLevel) {
      const timeDomainBuf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!this._liveRecording) return;
        analyser.getByteTimeDomainData(timeDomainBuf);
        let peak = 0;
        for (let i = 0; i < timeDomainBuf.length; i++) {
          const v = Math.abs((timeDomainBuf[i] - 128) / 128);
          if (v > peak) peak = v;
        }
        onLevel(Math.min(1, peak * 1.4));
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }

    console.log(`🎙 Live sampling démarré → PAD ${padId + 1}`);
  }

  /**
   * Arrête la capture, construit un AudioBuffer depuis les données PCM capturées,
   * et sauvegarde sur le pad cible.
   * @returns {number|null} padId si succès, null sinon
   */
  async stopLiveSampling() {
    if (!this._liveRecording) return null;

    this._liveRecording = false;

    // Déconnecter et nettoyer le graph audio
    try { this._liveProcessor?.disconnect(); } catch {}
    try { this._liveSrc?.disconnect();       } catch {}
    try { this._liveMuteGain?.disconnect();  } catch {}
    this._liveStream?.getTracks().forEach(t => t.stop());

    const chunks   = this._liveBuffers || [];
    const totalLen = chunks.reduce((s, c) => s + c.length, 0);

    let savedPadId = null;

    if (totalLen > 256 && this._livePadId !== null) {
      // Assembler le PCM en un seul AudioBuffer
      const sampleRate  = this.ctx.sampleRate;
      const audioBuffer = this.ctx.createBuffer(1, totalLen, sampleRate);
      const channel     = audioBuffer.getChannelData(0);
      let offset = 0;
      for (const chunk of chunks) {
        channel.set(chunk, offset);
        offset += chunk.length;
      }

      const padId   = this._livePadId;
      const existing = this.samples.get(padId);
      this.samples.set(padId, {
        buffer: audioBuffer,
        name:   `REC${padId + 1}`,
        key:    existing?.key || ''
      });
      savedPadId = padId;
      const dur = (totalLen / sampleRate).toFixed(2);
      console.log(`✅ Sample REC${padId + 1} sauvegardé (${dur}s, ${Math.round(totalLen / sampleRate * 100) / 100}s)`);
    } else {
      console.warn('Live sampling: trop court ou aucune donnée capturée');
    }

    // Réinitialiser l'état
    this._liveBuffers  = [];
    this._liveSrc      = null;
    this._liveProcessor = null;
    this._liveMuteGain = null;
    this._liveAnalyser = null;
    this._liveStream   = null;
    this._livePadId    = null;

    return savedPadId;
  }

  // ─── Effets ───────────────────────────────────────────────────────────────

  setEffect(param, value) {
    if (!this.effects) return;
    switch (param) {
      case 'bitDepth':    this.effects.setBitDepth(value);     break;
      case 'sampleRate':  this.effects.setSampleRate(value);   break;
      case 'filter':      this.effects.setFilterCutoff(value); break;
      case 'drive':       this.effects.setDrive(value);        break;
      case 'vinylNoise':  this.effects.setVinylNoise(value);   break;
      case 'compression': this.effects.setCompression(value);  break;
    }
  }

  // ─── Utilitaires ──────────────────────────────────────────────────────────

  getCurrentTime() { return this.ctx?.currentTime || 0; }

  resume() {
    try {
      if (this.ctx && this.ctx.state !== 'running') return this.ctx.resume();
    } catch {}
    return Promise.resolve();
  }
}
