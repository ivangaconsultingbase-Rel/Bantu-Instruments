/**
 * LoFiEffects.js
 * Émulation des caractéristiques sonores des samplers vintage
 * - SP1200: 12-bit, 26.04kHz, filtre analogique chaud
 * - MPC60: 12-bit, 40kHz, son plus propre mais avec caractère
 */

export class LoFiEffects {
  constructor(audioContext) {
    this.ctx = audioContext;
    this.setupEffectsChain();
    this.setupVinylNoise();
  }

  setupEffectsChain() {
    // === INPUT ===
    this.input = this.ctx.createGain();

    // === BITCRUSHER via AudioWorklet ou ScriptProcessor ===
    // Pour la compatibilité, on utilise WaveShaperNode pour le drive
    // et un système de réduction de sample rate
    
    // Drive / Saturation (caractère analogique)
    this.driveNode = this.ctx.createWaveShaper();
    this.driveAmount = 20;
    this.updateDriveCurve();

    // Filtre passe-bas (émule le filtre anti-aliasing des vieux DAC)
    this.lowpassFilter = this.ctx.createBiquadFilter();
    this.lowpassFilter.type = 'lowpass';
    this.lowpassFilter.frequency.value = 6000;
    this.lowpassFilter.Q.value = 0.7;

    // Filtre passe-haut léger (retire les sub-basses excessives)
    this.highpassFilter = this.ctx.createBiquadFilter();
    this.highpassFilter.type = 'highpass';
    this.highpassFilter.frequency.value = 30;
    this.highpassFilter.Q.value = 0.5;

    // Compression (punch caractéristique du boom bap)
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -24;
    this.compressor.knee.value = 6;
    this.compressor.ratio.value = 4;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.15;

    // Gain de sortie
    this.outputGain = this.ctx.createGain();
    this.outputGain.gain.value = 1.2; // Compensation

    // Vinyl noise (bruit de fond)
    this.noiseGain = this.ctx.createGain();
    this.noiseGain.gain.value = 0.02;

    // === CHAÎNAGE ===
    this.input
      .connect(this.driveNode)
      .connect(this.lowpassFilter)
      .connect(this.highpassFilter)
      .connect(this.compressor)
      .connect(this.outputGain);

    this.output = this.outputGain;
  }

  setupVinylNoise() {
    // Création d'un bruit de fond style vinyle
    const bufferSize = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      // Bruit brownien (plus doux que le bruit blanc)
      output[i] = (Math.random() * 2 - 1) * 0.5;
    }

    this.noiseSource = this.ctx.createBufferSource();
    this.noiseSource.buffer = noiseBuffer;
    this.noiseSource.loop = true;

    // Filtre pour rendre le bruit plus "vinyle"
    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 1000;
    noiseFilter.Q.value = 0.5;

    this.noiseSource.connect(noiseFilter);
    noiseFilter.connect(this.noiseGain);
    this.noiseGain.connect(this.output);

    this.noiseSource.start();
  }

  // Courbe de saturation pour le drive
  updateDriveCurve() {
    const k = this.driveAmount;
    const samples = 44100;
    const curve = new Float32Array(samples);
    const deg = Math.PI / 180;

    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
    }

    this.driveNode.curve = curve;
    this.driveNode.oversample = '2x';
  }

  // === SETTERS POUR LES CONTRÔLES ===

  setBitDepth(bits) {
    // Simule la réduction de bit depth via la courbe de distorsion
    // Plus la valeur est basse, plus on écrase le signal
    const intensity = Math.max(0, (16 - bits) * 3);
    this.driveAmount = 20 + intensity;
    this.updateDriveCurve();
  }

  setSampleRate(rate) {
    // Émulation via le filtre passe-bas
    // La fréquence de Nyquist est rate/2
    const maxFreq = Math.min(rate / 2, 20000);
    this.lowpassFilter.frequency.value = maxFreq * 0.8;
  }

  setFilterCutoff(freq) {
    this.lowpassFilter.frequency.value = freq;
  }

  setDrive(amount) {
    this.driveAmount = amount;
    this.updateDriveCurve();
  }

  setVinylNoise(amount) {
    this.noiseGain.gain.value = amount / 100 * 0.08;
  }

  setCompression(amount) {
    // Plus amount est élevé, plus on compresse
    this.compressor.threshold.value = -12 - (amount * 0.24);
    this.compressor.ratio.value = 2 + (amount * 0.08);
  }

  // Presets
  applyPreset(preset) {
    const presets = {
      'SP1200': {
        bitDepth: 12,
        sampleRate: 26040,
        filterCutoff: 5500,
        drive: 25,
        vinylNoise: 15,
        compression: 50
      },
      'MPC60': {
        bitDepth: 12,
        sampleRate: 40000,
        filterCutoff: 7000,
        drive: 15,
        vinylNoise: 8,
        compression: 40
      },
      'MPC3000': {
        bitDepth: 16,
        sampleRate: 44100,
        filterCutoff: 10000,
        drive: 10,
        vinylNoise: 5,
        compression: 35
      },
      'Dirty': {
        bitDepth: 8,
        sampleRate: 16000,
        filterCutoff: 3000,
        drive: 60,
        vinylNoise: 30,
        compression: 80
      }
    };

    const p = presets[preset];
    if (p) {
      this.setBitDepth(p.bitDepth);
      this.setSampleRate(p.sampleRate);
      this.setFilterCutoff(p.filterCutoff);
      this.setDrive(p.drive);
      this.setVinylNoise(p.vinylNoise);
      this.setCompression(p.compression);
    }
  }

  connect(destination) {
    this.output.connect(destination);
    return destination;
  }

  getInput() {
    return this.input;
  }
}
