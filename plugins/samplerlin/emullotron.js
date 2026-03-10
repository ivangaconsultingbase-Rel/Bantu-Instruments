/**
 * EMULLOTRON - Virtual Tape Instrument
 * Emulation d'un Mellotron en Web Audio API
 */

class Emullotron {
  constructor() {
    this.audioContext = null;
    this.masterGain = null;
    this.analyser = null;
    this.sourceBuffer = null;
    this.virtualTapes = new Map();
    this.activeVoices = new Map();
    this.params = {
      masterVolume: 0.7,
      tapeLength: 8,
      startJitter: 30,
      wow: 35,
      flutter: 25,
      tapeAge: 40,
      mechanicalNoise: 20,
      tone: 50,
      brightness: 60,
      saturation: 30,
      attack: 40,
      release: 50,
      rootNote: 60,
      driftPerKey: 25,
      stereoWidth: 50,
      keyClick: 15
    };
    
    this.noteRange = { min: 36, max: 84 }; // C2 to C6
    this.isInitialized = false;
    
    this.init();
  }

  async init() {
    this.setupUI();
    this.setupKeyboard();
    this.setupKnobs();
    this.setupFileLoader();
    await this.setupMIDI();
    this.startVUMeter();
  }

  async initAudioContext() {
    if (this.audioContext) return;
    
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Master chain
    this.masterGain = this.audioContext.createGain();
    this.masterGain.gain.value = this.params.masterVolume;
    
    // Analyser for VU meter
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    
    // Tape saturation (master)
    this.masterSaturation = this.createSaturation(0.2);
    
    // Master EQ
    this.masterEQ = this.audioContext.createBiquadFilter();
    this.masterEQ.type = 'lowshelf';
    this.masterEQ.frequency.value = 300;
    this.masterEQ.gain.value = 2;
    
    // Connect master chain
    this.masterGain
      .connect(this.masterSaturation)
      .connect(this.masterEQ)
      .connect(this.analyser)
      .connect(this.audioContext.destination);
    
    this.isInitialized = true;
    this.updateStatus('Audio engine initialized');
  }

  // Créer une courbe de saturation type bande
  createSaturation(amount) {
    const waveshaper = this.audioContext.createWaveShaper();
    const samples = 44100;
    const curve = new Float32Array(samples);
    
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      // Soft clipping avec caractère tape
      curve[i] = Math.tanh(x * (1 + amount * 3)) * (1 - amount * 0.1);
    }
    
    waveshaper.curve = curve;
    waveshaper.oversample = '2x';
    return waveshaper;
  }

  // Générer les bandes virtuelles à partir du sample source
  async generateVirtualTapes() {
    if (!this.sourceBuffer) return;
    
    this.virtualTapes.clear();
    const rootNote = Math.round(this.params.rootNote);
    
    this.updateStatus('Generating virtual tapes...');
    
    for (let note = this.noteRange.min; note <= this.noteRange.max; note++) {
      const semitoneOffset = note - rootNote;
      const tape = await this.createVirtualTape(note, semitoneOffset);
      this.virtualTapes.set(note, tape);
    }
    
    this.updateStatus(`${this.virtualTapes.size} virtual tapes generated`);
    this.updateKeyboardRoot();
  }

  // Créer une bande virtuelle unique pour chaque note
  async createVirtualTape(note, semitoneOffset) {
    const playbackRate = Math.pow(2, semitoneOffset / 12);
    
    // Variations uniques par note (comme si chaque bande était différente)
    const drift = this.params.driftPerKey / 100;
    const uniquePitchOffset = (Math.random() - 0.5) * drift * 0.02;
    const uniqueFilterOffset = (Math.random() - 0.5) * drift * 400;
    const uniqueNoiseLevel = Math.random() * drift * 0.3;
    
    // Caractéristiques selon la zone du clavier
    const zonePosition = (note - this.noteRange.min) / (this.noteRange.max - this.noteRange.min);
    const isLow = zonePosition < 0.33;
    const isHigh = zonePosition > 0.66;
    
    // Les graves sont plus sombres et instables
    // Les aigus sont plus bruités et courts
    const zoneCharacter = {
      filterOffset: isLow ? -600 : (isHigh ? 200 : 0),
      instability: isLow ? 1.3 : (isHigh ? 0.8 : 1),
      noiseBoost: isHigh ? 1.5 : 1,
      lengthFactor: isHigh ? 0.85 : 1
    };

    return {
      note,
      playbackRate: playbackRate * (1 + uniquePitchOffset),
      filterFreq: 2000 + uniqueFilterOffset + zoneCharacter.filterOffset,
      noiseLevel: (0.02 + uniqueNoiseLevel) * zoneCharacter.noiseBoost,
      instability: zoneCharacter.instability,
      lengthFactor: zoneCharacter.lengthFactor,
      attackVariation: 0.01 + Math.random() * 0.03,
      stereoPan: ((note - 60) / 24) * (this.params.stereoWidth / 100)
    };
  }

  // Jouer une note
  playNote(note, velocity = 1) {
    if (!this.isInitialized || !this.sourceBuffer) return;
    if (this.activeVoices.has(note)) {
      this.stopNote(note);
    }
    
    const tape = this.virtualTapes.get(note);
    if (!tape) return;

    const voice = this.createVoice(tape, velocity);
    this.activeVoices.set(note, voice);
    
    // Démarrer la lecture
    voice.source.start(0);
    voice.startTime = this.audioContext.currentTime;
    
    // Limite de durée de bande
    const maxDuration = this.params.tapeLength * tape.lengthFactor;
    voice.stopTimeout = setTimeout(() => {
      this.fadeOutVoice(voice, 0.5);
    }, maxDuration * 1000);
    
    this.updateVoiceDisplay();
    this.startReelAnimation();
  }

  // Créer une voix avec toute la chaîne audio
  createVoice(tape, velocity) {
    // Source buffer
    const source = this.audioContext.createBufferSource();
    source.buffer = this.sourceBuffer;
    source.playbackRate.value = tape.playbackRate;
    
    // Appliquer wow et flutter
    this.applyWowFlutter(source, tape);
    
    // Filtre (tone + age)
    const filter = this.audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    const ageEffect = 1 - (this.params.tapeAge / 100) * 0.5;
    filter.frequency.value = tape.filterFreq * ageEffect * (this.params.brightness / 50);
    filter.Q.value = 0.7;
    
    // Filtre tone (high shelf)
    const toneFilter = this.audioContext.createBiquadFilter();
    toneFilter.type = 'highshelf';
    toneFilter.frequency.value = 2000;
    toneFilter.gain.value = (this.params.tone - 50) / 10;
    
    // Saturation par voix
    const saturation = this.createSaturation(this.params.saturation / 100);
    
    // Gain avec enveloppe
    const gain = this.audioContext.createGain();
    gain.gain.value = 0;
    
    // Enveloppe d'attaque
    const attackTime = (this.params.attack / 100) * 0.15 + tape.attackVariation;
    const jitter = (this.params.startJitter / 100) * 0.02;
    const attackStart = this.audioContext.currentTime + Math.random() * jitter;
    
    gain.gain.setValueAtTime(0, attackStart);
    gain.gain.linearRampToValueAtTime(velocity * 0.8, attackStart + attackTime);
    
    // Stereo panner
    const panner = this.audioContext.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, tape.stereoPan));
    
    // Chaîne principale
    source.connect(filter);
    filter.connect(toneFilter);
    toneFilter.connect(saturation);
    saturation.connect(gain);
    gain.connect(panner);
    panner.connect(this.masterGain);
    
    // Bruit mécanique
    let noiseGain = null;
    if (this.params.mechanicalNoise > 5) {
      const noise = this.createNoiseSource();
      const noiseFilter = this.audioContext.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.value = 800;
      noiseFilter.Q.value = 2;
      
      noiseGain = this.audioContext.createGain();
      const noiseLevel = tape.noiseLevel * (this.params.mechanicalNoise / 50);
      noiseGain.gain.value = noiseLevel * velocity;
      
      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(panner);
      
      noise.start();
    }
    
    // Key click
    if (this.params.keyClick > 5) {
      this.playKeyClick(panner, velocity);
    }

    return {
      source,
      filter,
      toneFilter,
      saturation,
      gain,
      panner,
      noiseGain,
      tape,
      startTime: null,
      stopTimeout: null
    };
  }

  // Appliquer wow et flutter via modulation du playbackRate
  applyWowFlutter(source, tape) {
    const now = this.audioContext.currentTime;
    const duration = this.params.tapeLength;
    
    const wowAmount = (this.params.wow / 100) * 0.015 * tape.instability;
    const flutterAmount = (this.params.flutter / 100) * 0.005 * tape.instability;
    
    const baseRate = source.playbackRate.value;
    
    // Simuler le wow (lent, 0.5-2 Hz) et flutter (rapide, 5-12 Hz)
    const steps = Math.floor(duration * 20); // 20 points par seconde
    
    for (let i = 0; i < steps; i++) {
      const t = i / 20;
      const wow = Math.sin(t * Math.PI * 1.2) * wowAmount;
      const flutter = Math.sin(t * Math.PI * 14) * flutterAmount;
      const drift = (Math.random() - 0.5) * 0.002;
      
      source.playbackRate.setValueAtTime(
        baseRate * (1 + wow + flutter + drift),
        now + t
      );
    }
  }

  // Créer une source de bruit
  createNoiseSource() {
    const bufferSize = this.audioContext.sampleRate * 2;
    const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    const noise = this.audioContext.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    return noise;
  }

  // Click de touche
  playKeyClick(destination, velocity) {
    const clickDuration = 0.015;
    const clickGain = this.audioContext.createGain();
    const clickFilter = this.audioContext.createBiquadFilter();
    
    clickFilter.type = 'highpass';
    clickFilter.frequency.value = 2000;
    
    const noise = this.createNoiseSource();
    const level = (this.params.keyClick / 100) * 0.3 * velocity;
    
    clickGain.gain.setValueAtTime(level, this.audioContext.currentTime);
    clickGain.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + clickDuration);
    
    noise.connect(clickFilter);
    clickFilter.connect(clickGain);
    clickGain.connect(destination);
    
    noise.start();
    noise.stop(this.audioContext.currentTime + clickDuration);
  }

  // Arrêter une note
  stopNote(note) {
    const voice = this.activeVoices.get(note);
    if (!voice) return;
    
    if (voice.stopTimeout) {
      clearTimeout(voice.stopTimeout);
    }
    
    const releaseTime = (this.params.release / 100) * 0.5 + 0.05;
    this.fadeOutVoice(voice, releaseTime);
    
    this.activeVoices.delete(note);
    this.updateVoiceDisplay();
    
    if (this.activeVoices.size === 0) {
      this.stopReelAnimation();
    }
  }

  // Fade out d'une voix
  fadeOutVoice(voice, duration) {
    const now = this.audioContext.currentTime;
    
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
    voice.gain.gain.linearRampToValueAtTime(0, now + duration);
    
    if (voice.noiseGain) {
      voice.noiseGain.gain.cancelScheduledValues(now);
      voice.noiseGain.gain.linearRampToValueAtTime(0, now + duration);
    }
    
    setTimeout(() => {
      try {
        voice.source.stop();
      } catch (e) {}
    }, duration * 1000 + 50);
  }

  // Charger un fichier audio
  async loadSample(file) {
    await this.initAudioContext();
    
    this.updateStatus(`Loading ${file.name}...`);
    document.getElementById('sample-name').textContent = file.name.substring(0, 20);
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      this.sourceBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      
      await this.generateVirtualTapes();
      this.updateStatus(`Ready — ${file.name}`);
    } catch (error) {
      this.updateStatus(`Error loading file: ${error.message}`);
      console.error(error);
    }
  }

  // === UI METHODS ===

  setupUI() {
    // Prevent context menu on knobs
    document.addEventListener('contextmenu', (e) => {
      if (e.target.classList.contains('knob')) {
        e.preventDefault();
      }
    });
  }

  setupKeyboard() {
    const keyboard = document.getElementById('keyboard');
    const whiteNotes = [0, 2, 4, 5, 7, 9, 11];
    const blackNotes = [1, 3, 6, 8, 10];
    
    // Générer 3 octaves (C3 à B5)
    for (let octave = 3; octave <= 5; octave++) {
      for (let i = 0; i < 12; i++) {
        const note = octave * 12 + i;
        if (note < this.noteRange.min || note > this.noteRange.max) continue;
        
        const isBlack = blackNotes.includes(i);
        const key = document.createElement('div');
        key.className = `key ${isBlack ? 'key-black' : 'key-white'}`;
        key.dataset.note = note;
        
        if (!isBlack) {
          keyboard.appendChild(key);
        }
      }
    }
    
    // Ajouter les touches noires
    const whiteKeys = keyboard.querySelectorAll('.key-white');
    let whiteIndex = 0;
    
    for (let octave = 3; octave <= 5; octave++) {
      for (let i = 0; i < 12; i++) {
        const note = octave * 12 + i;
        if (note < this.noteRange.min || note > this.noteRange.max) continue;
        
        const isBlack = blackNotes.includes(i);
        const isWhite = whiteNotes.includes(i);
        
        if (isBlack) {
          const key = document.createElement('div');
          key.className = 'key key-black';
          key.dataset.note = note;
          
          const whiteKey = whiteKeys[whiteIndex];
          if (whiteKey) {
            const rect = whiteKey.getBoundingClientRect();
            const keyboardRect = keyboard.getBoundingClientRect();
            key.style.left = `${whiteKey.offsetLeft + wh0].clientY);
        const deltaY = startY - clientY;
        const range = max - min;
        const sensitivity = 200;
        
        let newValue = startValue + (deltaY / sensitivity) * range;
        newValue = Math.max(min, Math.min(max, newValue));
        
        this.params[param] = newValue;
        this.updateKnobVisual(knob, newValue, min, max);
        this.onParamChange(param, newValue);
      };

      const onEnd = () => {
        isDragging = false;
      };

      knob.addEventListener('mousedown', onStart);
      knob.addEventListener('touchstart', onStart);
      document.addEventListener('mousemove', onMove);
      document.addEventListener('touchmove', onMove);
      document.addEventListener('mouseup', onEnd);
      document.addEventListener('touchend', onEnd);
      
      // Double-click to reset
      knob.addEventListener('dblclick', () => {
        this.params[param] = initialValue;
        this.updateKnobVisual(knob, initialValue, min, max);
        this.onParamChange(param, initialValue);
      });
    });
  }

  updateKnobVisual(knob, value, min, max) {
    const normalizedValue = (value - min) / (max - min);
    const rotation = -135 + normalizedValue * 270;
    knob.style.setProperty('--rotation', `${rotation}deg`);
  }

  onParamChange(param, value) {
    switch (param) {
      case 'masterVolume':
        if (this.masterGain) {
          this.masterGain.gain.setTargetAtTime(value, this.audioContext.currentTime, 0.05);
        }
        break;
      case 'rootNote':
        this.generateVirtualTapes();
        break;
      case 'brightness':
      case 'tone':
        this.updateActiveVoicesFilter();
        break;
    }
  }

  updateActiveVoicesFilter() {
    this.activeVoices.forEach(voice => {
      const ageEffect = 1 - (this.params.tapeAge / 100) * 0.5;
      voice.filter.frequency.setTargetAtTime(
        voice.tape.filterFreq * ageEffect * (this.params.brightness / 50),
        this.audioContext.currentTime,
        0.1
      );
      voice.toneFilter.gain.setTargetAtTime(
        (this.params.tone - 50) / 10,
        this.audioContext.currentTime,
        0.1
      );
    });
  }

  updateKeyboardRoot() {
    document.querySelectorAll('.key').forEach(key => {
      key.classList.remove('root-key');
    });
    
    const rootKey = document.querySelector(`.key[data-note="${Math.round(this.params.rootNote)}"]`);
    if (rootKey) {
      rootKey.classList.add('root-key');
    }
  }

  setupFileLoader() {
    const loadBtn = document.getElementById('load-sample');
    const fileInput = document.getElementById('file-input');
    
    loadBtn.addEventListener('click', () => fileInput.click());
    
    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.loadSample(e.target.files[0]);
      }
    });

    // Drag and drop
    document.querySelector('.emullotron').addEventListener('dragover', (e) => {
      e.preventDefault();
      e.currentTarget.style.borderColor = 'var(--accent)';
    });

    document.querySelector('.emullotron').addEventListener('dragleave', (e) => {
      e.currentTarget.style.borderColor = '#333';
    });

    document.querySelector('.emullotron').addEventListener('drop', (e) => {
      e.preventDefault();
      e.currentTarget.style.borderColor = '#333';
      
      if (e.dataTransfer.files.length > 0) {
        this.loadSample(e.dataTransfer.files[0]);
      }
    });
  }

  async setupMIDI() {
    if (!navigator.requestMIDIAccess) {
      document.getElementById('midi-text').textContent = 'MIDI: Not supported';
      return;
    }

    try {
      const midiAccess = await navigator.requestMIDIAccess();
      const indicator = document.getElementById('midi-indicator');
      const text = document.getElementById('midi-text');
      
      midiAccess.inputs.forEach(input => {
        input.onmidimessage = (e) => this.onMIDIMessage(e);
        indicator.classList.add('connected');
        text.textContent = `MIDI: ${input.name}`;
      });

      midiAccess.onstatechange = (e) => {
        if (e.port.type === 'input') {
          if (e.port.state === 'connected') {
            e.port.onmidimessage = (ev) => this.onMIDIMessage(ev);
            indicator.classList.add('connected');
            text.textContent = `MIDI: ${e.port.name}`;
          } else {
            indicator.classList.remove('connected');
            text.textContent = 'MIDI: Disconnected';
          }
        }
      };
    } catch (error) {
      document.getElementById('midi-text').textContent = 'MIDI: Error';
    }
  }

  onMIDIMessage(e) {
    const [status, note, velocity] = e.data;
    const command = status & 0xf0;
    
    const indicator = document.getElementById('midi-indicator');
    indicator.classList.add('active');
    setTimeout(() => indicator.classList.remove('active'), 100);

    if (command === 0x90 && velocity > 0) {
      this.initAudioContext();
      this.playNote(note, velocity / 127);
      
      const keyEl = document.querySelector(`.key[data-note="${note}"]`);
      if (keyEl) keyEl.classList.add('active');
    } else if (command === 0x80 || (command === 0x90 && velocity === 0)) {
      this.stopNote(note);
      
      const keyEl = document.querySelector(`.key[data-note="${note}"]`);
      if (keyEl) keyEl.classList.remove('active');
    }
  }

  updateVoiceDisplay() {
    const container = document.getElementById('active-voices');
    container.innerHTML = '';
    
    this.activeVoices.forEach((voice, note) => {
      const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
      const noteName = noteNames[note % 12];
      const octave = Math.floor(note / 12) - 1;
      
      const div = document.createElement('div');
      div.className = 'voice-indicator';
      div.dataset.note = note;
      div.innerHTML = `
        <span>${noteName}${octave}</span>
        <div class="tape-mini">
          <div class="tape-mini-fill" style="width: 0%"></div>
        </div>
      `;
      container.appendChild(div);
    });
    
    this.updateTapeProgress();
  }

  updateTapeProgress() {
    if (this.activeVoices.size === 0) {
      document.getElementById('tape-indicator').style.width = '0%';
      return;
    }

    const updateFrame = () => {
      if (this.activeVoices.size === 0) return;
      
      let maxProgress = 0;
      
      this.activeVoices.forEach((voice, note) => {
        if (!voice.startTime) return;
        
        const elapsed = this.audioContext.currentTime - voice.startTime;
        const maxDuration = this.params.tapeLength * voice.tape.lengthFactor;
        const progress = Math.min(100, (elapsed / maxDuration) * 100);
        
        maxProgress = Math.max(maxProgress, progress);
        
        const indicator = document.querySelector(`.voice-indicator[data-note="${note}"] .tape-mini-fill`);
        if (indicator) {
          indicator.style.width = `${progress}%`;
        }
      });
      
      document.getElementById('tape-indicator').style.width = `${maxProgress}%`;
      
      if (this.activeVoices.size > 0) {
        requestAnimationFrame(updateFrame);
      }
    };
    
    requestAnimationFrame(updateFrame);
  }

  startReelAnimation() {
    document.getElementById('reel-left').classList.add('spinning');
    document.getElementById('reel-right').classList.add('spinning');
  }

  stopReelAnimation() {
    document.getElementById('reel-left').classList.remove('spinning');
    document.getElementById('reel-right').classList.remove('spinning');
    document.getElementById('tape-indicator').style.width = '0%';
  }

  startVUMeter() {
    const leftBar = document.getElementById('vu-left');
    const rightBar = document.getElementById('vu-right');
    
    const update = () => {
      if (this.analyser) {
        const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(dataArray);
        
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length / 255;
        
        const scale = Math.max(0.1, Math.min(1, average * 3));
        leftBar.style.transform = `scaleY(${scale})`;
        rightBar.style.transform = `scaleY(${scale * (0.9 + Math.random() * 0.2)})`;
      }
      
      requestAnimationFrame(update);
    };
    
    update();
  }

  updateStatus(message) {
    document.getElementById('status-text').textContent = message;
  }
}

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
  window.emullotron = new Emullotron();
});
