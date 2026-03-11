/**
 * EMULLOTRON MK2 - Virtual Tape Instrument
 * Style Elektron / Teenage Engineering
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
      brightness: 60,
      saturation: 30,
      attack: 40,
      release: 50,
      driftPerKey: 25
    };
    
    // Banks configuration
    this.banks = {
      strings: {
        name: 'STRINGS',
        file: 'samples/strings.wav',
        presetOverrides: {
          wow: 40,
          flutter: 30,
          tapeAge: 45,
          brightness: 55,
          attack: 50,
          release: 60
        }
      },
      flute: {
        name: 'FLUTE',
        file: 'samples/flute.wav',
        presetOverrides: {
          wow: 25,
          flutter: 20,
          tapeAge: 30,
          brightness: 70,
          attack: 30,
          release: 45
        }
      },
      piano: {
        name: 'PIANO',
        file: 'samples/piano.wav',
        presetOverrides: {
          wow: 20,
          flutter: 15,
          tapeAge: 35,
          brightness: 65,
          attack: 20,
          release: 55
        }
      },
      custom: {
        name: 'CUSTOM',
        file: null,
        presetOverrides: {}
      }
    };
    
    // Sound presets
    this.presets = {
      pristine: {
        tapeLength: 10,
        startJitter: 10,
        wow: 10,
        flutter: 8,
        tapeAge: 10,
        mechanicalNoise: 5,
        brightness: 75,
        saturation: 15,
        attack: 20,
        release: 40,
        driftPerKey: 10
      },
      vintage: {
        tapeLength: 8,
        startJitter: 30,
        wow: 35,
        flutter: 25,
        tapeAge: 45,
        mechanicalNoise: 25,
        brightness: 55,
        saturation: 35,
        attack: 45,
        release: 50,
        driftPerKey: 30
      },
      worn: {
        tapeLength: 7,
        startJitter: 50,
        wow: 55,
        flutter: 45,
        tapeAge: 65,
        mechanicalNoise: 40,
        brightness: 45,
        saturation: 45,
        attack: 55,
        release: 55,
        driftPerKey: 45
      },
      broken: {
        tapeLength: 5,
        startJitter: 80,
        wow: 80,
        flutter: 70,
        tapeAge: 85,
        mechanicalNoise: 60,
        brightness: 35,
        saturation: 65,
        attack: 70,
        release: 60,
        driftPerKey: 70
      },
      dreamy: {
        tapeLength: 12,
        startJitter: 40,
        wow: 60,
        flutter: 20,
        tapeAge: 50,
        mechanicalNoise: 15,
        brightness: 40,
        saturation: 25,
        attack: 65,
        release: 80,
        driftPerKey: 35
      }
    };
    
    this.currentBank = null;
    this.currentPreset = null;
    this.baseOctave = 4;
    this.noteRange = { min: 36, max: 96 };
    this.isInitialized = false;
    
    // Key mapping (computer keyboard layout)
    this.keyboardLayout = [
      { key: 'Q', code: 'KeyQ', note: 0, black: false },
      { key: 'Z', code: 'KeyZ', note: 1, black: true },
      { key: 'S', code: 'KeyS', note: 2, black: false },
      { key: 'E', code: 'KeyE', note: 3, black: true },
      { key: 'D', code: 'KeyD', note: 4, black: false },
      { key: 'F', code: 'KeyF', note: 5, black: false },
      { key: 'T', code: 'KeyT', note: 6, black: true },
      { key: 'G', code: 'KeyG', note: 7, black: false },
      { key: 'Y', code: 'KeyY', note: 8, black: true },
      { key: 'H', code: 'KeyH', note: 9, black: false },
      { key: 'U', code: 'KeyU', note: 10, black: true },
      { key: 'J', code: 'KeyJ', note: 11, black: false },
      { key: 'K', code: 'KeyK', note: 12, black: false },
      { key: 'O', code: 'KeyO', note: 13, black: true },
      { key: 'L', code: 'KeyL', note: 14, black: false },
      { key: 'P', code: 'KeyP', note: 15, black: true },
      { key: 'M', code: 'KeyM', note: 16, black: false }
    ];
    
    this.init();
  }

  async init() {
    this.buildKeyboard();
    this.setupEncoders();
    this.setupBanks();
    this.setupPresets();
    this.setupOctaveButtons();
    this.setupComputerKeyboard();
    await this.setupMIDI();
    this.updateDisplay();
  }

  async initAudioContext() {
    if (this.audioContext) return;
    
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    this.masterGain = this.audioContext.createGain();
    this.masterGain.gain.value = this.params.masterVolume;
    
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    
    this.masterSaturation = this.createSaturation(0.2);
    
    this.masterEQ = this.audioContext.createBiquadFilter();
    this.masterEQ.type = 'lowshelf';
    this.masterEQ.frequency.value = 300;
    this.masterEQ.gain.value = 2;
    
    this.masterGain
      .connect(this.masterSaturation)
      .connect(this.masterEQ)
      .connect(this.analyser)
      .connect(this.audioContext.destination);
    
    this.isInitialized = true;
    document.getElementById('led-audio').classList.add('active');
    this.updateStatus('AUDIO OK');
    
    this.startMeter();
  }

  createSaturation(amount) {
    const waveshaper = this.audioContext.createWaveShaper();
    const samples = 44100;
    const curve = new Float32Array(samples);
    
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = Math.tanh(x * (1 + amount * 3)) * (1 - amount * 0.1);
    }
    
    waveshaper.curve = curve;
    waveshaper.oversample = '2x';
    return waveshaper;
  }

  // === BANKS ===
  
  setupBanks() {
    document.querySelectorAll('.bank-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const bankId = btn.dataset.bank;
        
        if (bankId === 'custom') {
          document.getElementById('file-input').click();
        } else {
          this.loadBank(bankId);
        }
      });
    });
    
    document.getElementById('file-input').addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.loadCustomSample(e.target.files[0]);
      }
    });
  }
  
  async loadBank(bankId) {
    const bank = this.banks[bankId];
    if (!bank || !bank.file) return;
    
    const btn = document.querySelector(`[data-bank="${bankId}"]`);
    btn.classList.add('loading');
    
    try {
      await this.initAudioContext();
      this.updateStatus('LOADING...');
      
      const response = await fetch(bank.file);
      if (!response.ok) {
        throw new Error(`Sample not found: ${bank.file}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      this.sourceBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      
      this.currentBank = bankId;
      this.applyBankPreset(bank);
      await this.generateVirtualTapes();
      
      this.updateBankButtons();
      this.updateDisplay();
      this.updateStatus('READY');
      
    } catch (error) {
      console.error('Error loading bank:', error);
      this.updateStatus('LOAD ERROR');
      document.getElementById('sample-name').textContent = 'ERROR';
    }
    
    btn.classList.remove('loading');
  }
  
  async loadCustomSample(file) {
    const btn = document.querySelector('[data-bank="custom"]');
    btn.classList.add('loading');
    
    try {
      await this.initAudioContext();
      this.updateStatus('LOADING...');
      
      const arrayBuffer = await file.arrayBuffer();
      this.sourceBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      
      this.banks.custom.name = file.name.substring(0, 12).toUpperCase();
      this.currentBank = 'custom';
      
      await this.generateVirtualTapes();
      
      this.updateBankButtons();
      this.updateDisplay();
      this.updateStatus('READY');
      
    } catch (error) {
      console.error('Error loading sample:', error);
      this.updateStatus('LOAD ERROR');
    }
    
    btn.classList.remove('loading');
  }
  
  applyBankPreset(bank) {
    if (!bank.presetOverrides) return;
    
    Object.entries(bank.presetOverrides).forEach(([param, value]) => {
      this.params[param] = value;
      this.updateEncoderVisual(param);
    });
  }
  
  updateBankButtons() {
    document.querySelectorAll('.bank-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.bank === this.currentBank);
    });
  }

  // === PRESETS ===
  
  setupPresets() {
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.applyPreset(btn.dataset.preset);
      });
    });
  }
  
  applyPreset(presetId) {
    const preset = this.presets[presetId];
    if (!preset) return;
    
    this.currentPreset = presetId;
    
    Object.entries(preset).forEach(([param, value]) => {
      this.params[param] = value;
      this.updateEncoderVisual(param);
      this.onParamChange(param, value);
    });
    
    // Update preset buttons
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.preset === presetId);
    });
    
    // Regenerate tapes with new params
    if (this.sourceBuffer) {
      this.generateVirtualTapes();
    }
    
    this.updateStatus(presetId.toUpperCase());
  }

  // === VIRTUAL TAPES ===
  
  async generateVirtualTapes() {
    if (!this.sourceBuffer) return;
    
    this.virtualTapes.clear();
    const rootNote = this.baseOctave * 12 + 12; // C of current octave + 1
    
    for (let note = this.noteRange.min; note <= this.noteRange.max; note++) {
      const semitoneOffset = note - rootNote;
      const tape = this.createVirtualTape(note, semitoneOffset);
      this.virtualTapes.set(note, tape);
    }
  }

  createVirtualTape(note, semitoneOffset) {
    const playbackRate = Math.pow(2, semitoneOffset / 12);
    
    const drift = this.params.driftPerKey / 100;
    const uniquePitchOffset = (Math.random() - 0.5) * drift * 0.02;
    const uniqueFilterOffset = (Math.random() - 0.5) * drift * 400;
    const uniqueNoiseLevel = Math.random() * drift * 0.3;
    
    const zonePosition = (note - this.noteRange.min) / (this.noteRange.max - this.noteRange.min);
    const isLow = zonePosition < 0.33;
    const isHigh = zonePosition > 0.66;
    
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
      stereoPan: (note - 60) / 48
    };
  }

  // === AUDIO PLAYBACK ===
  
  playNote(note, velocity = 0.8) {
    if (!this.isInitialized || !this.sourceBuffer) {
      this.updateStatus('NO SAMPLE');
      return;
    }
    
    if (note < this.noteRange.min || note > this.noteRange.max) return;
    
    if (this.activeVoices.has(note)) {
      this.stopNote(note);
    }
    
    const tape = this.virtualTapes.get(note);
    if (!tape) return;

    const voice = this.createVoice(tape, velocity);
    this.activeVoices.set(note, voice);
    
    voice.source.start(0);
    voice.startTime = this.audioContext.currentTime;
    
    const maxDuration = this.params.tapeLength * tape.lengthFactor;
    voice.stopTimeout = setTimeout(() => {
      this.fadeOutVoice(voice, 0.5);
      this.activeVoices.delete(note);
      this.updateVoicesCount();
    }, maxDuration * 1000);
    
    this.updateVoicesCount();
  }

  createVoice(tape, velocity) {
    const source = this.audioContext.createBufferSource();
    source.buffer = this.sourceBuffer;
    source.playbackRate.value = tape.playbackRate;
    
    this.applyWowFlutter(source, tape);
    
    const filter = this.audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    const ageEffect = 1 - (this.params.tapeAge / 100) * 0.5;
    filter.frequency.value = tape.filterFreq * ageEffect * (this.params.brightness / 50);
    filter.Q.value = 0.7;
    
    const saturation = this.createSaturation(this.params.saturation / 100);
    
    const gain = this.audioContext.createGain();
    gain.gain.value = 0;
    
    const attackTime = (this.params.attack / 100) * 0.2 + tape.attackVariation;
    const jitter = (this.params.startJitter / 100) * 0.03;
    const attackStart = this.audioContext.currentTime + Math.random() * jitter;
    
    gain.gain.setValueAtTime(0, attackStart);
    gain.gain.linearRampToValueAtTime(velocity * 0.8, attackStart + attackTime);
    
    const panner = this.audioContext.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, tape.stereoPan * 0.6));
    
    source.connect(filter);
    filter.connect(saturation);
    saturation.connect(gain);
    gain.connect(panner);
    panner.connect(this.masterGain);
    
    let noiseSource = null;
    let noiseGain = null;
    
    if (this.params.mechanicalNoise > 5) {
      noiseSource = this.createNoiseSource();
      const noiseFilter = this.audioContext.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.value = 800;
      noiseFilter.Q.value = 2;
      
      noiseGain = this.audioContext.createGain();
      noiseGain.gain.value = tape.noiseLevel * (this.params.mechanicalNoise / 50) * velocity;
      
      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(panner);
      noiseSource.start();
    }

    return {
      source,
      filter,
      gain,
      panner,
      noiseSource,
      noiseGain,
      tape,
      startTime: null,
      stopTimeout: null
    };
  }

  applyWowFlutter(source, tape) {
    const now = this.audioContext.currentTime;
    const duration = this.params.tapeLength;
    
    const wowAmount = (this.params.wow / 100) * 0.015 * tape.instability;
    const flutterAmount = (this.params.flutter / 100) * 0.005 * tape.instability;
    
    const baseRate = source.playbackRate.value;
    const steps = Math.floor(duration * 20);
    
    for (let i = 0; i < steps; i++) {
      const t = i / 20;
      const wow = Math.sin(t * Math.PI * 1.2 + Math.random() * 0.5) * wowAmount;
      const flutter = Math.sin(t * Math.PI * 14 + Math.random() * 2) * flutterAmount;
      const drift = (Math.random() - 0.5) * 0.002;
      
      source.playbackRate.setValueAtTime(
        baseRate * (1 + wow + flutter + drift),
        now + t
      );
    }
  }

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

  stopNote(note) {
    const voice = this.activeVoices.get(note);
    if (!voice) return;
    
    if (voice.stopTimeout) {
      clearTimeout(voice.stopTimeout);
    }
    
    const releaseTime = (this.params.release / 100) * 0.5 + 0.05;
    this.fadeOutVoice(voice, releaseTime);
    
    this.activeVoices.delete(note);
    this.updateVoicesCount();
  }

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
        if (voice.noiseSource) voice.noiseSource.stop();
      } catch (e) {}
    }, duration * 1000 + 50);
  }

  // === UI: KEYBOARD ===
  
  buildKeyboard() {
    const keyboard = document.getElementById('keyboard');
    keyboard.innerHTML = '';
    
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    
    this.keyboardLayout.forEach(keyDef => {
      const key = document.createElement('div');
      key.className = `key ${keyDef.black ? 'black' : ''}`;
      key.dataset.noteOffset = keyDef.note;
      key.dataset.code = keyDef.code;
      
      const midiNote = this.baseOctave * 12 + keyDef.note;
      const noteName = noteNames[midiNote % 12];
      const isRoot = keyDef.note === 0;
      
      if (isRoot) key.classList.add('root');
      
      key.innerHTML = `
        <span class="key-letter">${keyDef.key}</span>
        <span class="key-note">${noteName}</span>
      `;
      
      key.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.initAudioContext();
        const note = this.baseOctave * 12 + keyDef.note;
        this.playNote(note, 0.8);
        key.classList.add('active');
      });
      
      key.addEventListener('mouseup', () => {
        const note = this.baseOctave * 12 + keyDef.note;
        this.stopNote(note);
        key.classList.remove('active');
      });
      
      key.addEventListener('mouseleave', () => {
        if (key.classList.contains('active')) {
          const note = this.baseOctave * 12 + keyDef.note;
          this.stopNote(note);
          key.classList.remove('active');
        }
      });
      
      key.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.initAudioContext();
        const note = this.baseOctave * 12 + keyDef.note;
        this.playNote(note, 0.8);
        key.classList.add('active');
      });
      
      key.addEventListener('touchend', () => {
        const note = this.baseOctave * 12 + keyDef.note;
        this.stopNote(note);
        key.classList.remove('active');
      });
      
      keyboard.appendChild(key);
    });
  }
  
  setupComputerKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (e.repeat || e.target.tagName === 'INPUT') return;
      
      const keyDef = this.keyboardLayout.find(k => k.code === e.code);
      if (keyDef) {
        e.preventDefault();
        this.initAudioContext();
        const note = this.baseOctave * 12 + keyDef.note;
        this.playNote(note, 0.8);
        
        const keyEl = document.querySelector(`.key[data-code="${e.code}"]`);
        if (keyEl) keyEl.classList.add('active');
      }
      
      // Octave control
      if (e.code === 'ArrowUp' || e.code === 'ArrowRight') {
        this.changeOctave(1);
      } else if (e.code === 'ArrowDown' || e.code === 'ArrowLeft') {
        this.changeOctave(-1);
      }
    });
    
    document.addEventListener('keyup', (e) => {
      const keyDef = this.keyboardLayout.find(k => k.code === e.code);
      if (keyDef) {
        const note = this.baseOctave * 12 + keyDef.note;
        this.stopNote(note);
        
        const keyEl = document.querySelector(`.key[data-code="${e.code}"]`);
        if (keyEl) keyEl.classList.remove('active');
      }
    });
  }
  
  setupOctaveButtons() {
    document.getElementById('oct-up').addEventListener('click', () => this.changeOctave(1));
    document.getElementById('oct-down').addEventListener('click', () => this.changeOctave(-1));
  }
  
  changeOctave(delta) {
    const newOctave = this.baseOctave + delta;
    if (newOctave >= 2 && newOctave <= 6) {
      this.baseOctave = newOctave;
      document.getElementById('octave-display').textContent = this.baseOctave;
      this.buildKeyboard();
    }
  }

  // === UI: ENCODERS ===
  
  setupEncoders() {
    document.querySelectorAll('.encoder').forEach(encoder => {
      const param = encoder.dataset.param;
      const min = parseFloat(encoder.dataset.min);
      const max = parseFloat(encoder.dataset.max);
      const initialValue = parseFloat(encoder.dataset.value);
      
      this.params[param] = initialValue;
      this.updateEncoderVisualElement(encoder, initialValue, min, max);
      
      let isDragging = false;
      let startY = 0;
      let startValue = 0;
      
      const onStart = (e) => {
        isDragging = true;
        startY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
        startValue = this.params[param];
        e.preventDefault();
      };
      
      const onMove = (e) => {
        if (!isDragging) return;
        
        const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
        const deltaY = startY - clientY;
        const range = max - min;
        const sensitivity = 150;
        
        let newValue = startValue + (deltaY / sensitivity) * range;
        newValue = Math.max(min, Math.min(max, newValue));
        
        this.params[param] = newValue;
        this.updateEncoderVisualElement(encoder, newValue, min, max);
        this.onParamChange(param, newValue);
      };
      
      const onEnd = () => {
        isDragging = false;
      };
      
      encoder.addEventListener('mousedown', onStart);
      encoder.addEventListener('touchstart', onStart, { passive: false });
      document.addEventListener('mousemove', onMove);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('mouseup', onEnd);
      document.addEventListener('touchend', onEnd);
      
      encoder.addEventListener('dblclick', () => {
        this.params[param] = initialValue;
        this.updateEncoderVisualElement(encoder, initialValue, min, max);
        this.onParamChange(param, initialValue);
      });
    });
  }
  
  updateEncoderVisualElement(encoder, value, min, max) {
    const indicator = encoder.querySelector('.encoder-indicator');
    const normalized = (value - min) / (max - min);
    const rotation = -135 + normalized * 270;
    indicator.style.setProperty('--rotation', `${rotation}deg`);
  }
  
  updateEncoderVisual(param) {
    const encoder = document.querySelector(`.encoder[data-param="${param}"]`);
    if (!encoder) return;
    
    const min = parseFloat(encoder.dataset.min);
    const max = parseFloat(encoder.dataset.max);
    this.updateEncoderVisualElement(encoder, this.params[param], min, max);
  }

  onParamChange(param, value) {
    if (param === 'masterVolume' && this.masterGain) {
      this.masterGain.gain.setTargetAtTime(value, this.audioContext.currentTime, 0.05);
    }
    
    // Clear active preset indicator when manually changing params
    if (this.currentPreset) {
      this.currentPreset = null;
      document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.classList.remove('active');
      });
    }
  }

  // === MIDI ===
  
  async setupMIDI() {
    if (!navigator.requestMIDIAccess) {
      document.getElementById('midi-status').textContent = 'NO MIDI';
      return;
    }

    try {
      const midiAccess = await navigator.requestMIDIAccess();
      
      midiAccess.inputs.forEach(input => {
        input.onmidimessage = (e) => this.onMIDIMessage(e);
        document.getElementById('led-midi').classList.add('active');
        document.getElementById('midi-status').textContent = 'MIDI ON';
      });

      midiAccess.onstatechange = (e) => {
        if (e.port.type === 'input' && e.port.state === 'connected') {
          e.port.onmidimessage = (ev) => this.onMIDIMessage(ev);
          document.getElementById('led-midi').classList.add('active');
          document.getElementById('midi-status').textContent = 'MIDI ON';
        }
      };
    } catch (error) {
      document.getElementById('midi-status').textContent = 'MIDI ERR';
    }
  }

  onMIDIMessage(e) {
    const [status, note, velocity] = e.data;
    const command = status & 0xf0;
    
    document.getElementById('led-midi').classList.add('warning');
    setTimeout(() => document.getElementById('led-midi').classList.remove('warning'), 100);

    if (command === 0x90 && velocity > 0) {
      this.initAudioContext();
      this.playNote(note, velocity / 127);
    } else if (command === 0x80 || (command === 0x90 && velocity === 0)) {
      this.stopNote(note);
    }
  }

  // === DISPLAY ===
  
  updateDisplay() {
    const bankName = this.currentBank ? this.banks[this.currentBank].name : '---';
    document.getElementById('bank-name').textContent = bankName;
    
    const sampleName = this.sourceBuffer ? 
      (this.currentBank === 'custom' ? this.banks.custom.name : bankName) : 
      'NO FILE';
    document.getElementById('sample-name').textContent = sampleName;
  }
  
  updateVoicesCount() {
    document.getElementById('voices-count').textContent = this.activeVoices.size;
  }
  
  updateStatus(text) {
    document.getElementById('status-text').textContent = text;
  }
  
  startMeter() {
    const tapeFill = document.getElementById('tape-fill');
    
    const update = () => {
      if (this.activeVoices.size > 0) {
        let maxProgress = 0;
        
        this.activeVoices.forEach(voice => {
          if (voice.startTime) {
            const elapsed = this.audioContext.currentTime - voice.startTime;
            const maxDuration = this.params.tapeLength * voice.tape.lengthFactor;
            const progress = Math.min(100, (elapsed / maxDuration) * 100);
            maxProgress = Math.max(maxProgress, progress);
          }
        });
        
        tapeFill.style.width = `${maxProgress}%`;
      } else {
        tapeFill.style.width = '0%';
      }
      
      requestAnimationFrame(update);
    };
    
    update();
  }
}

// Init
document.addEventListener('DOMContentLoaded', () => {
  window.emullotron = new Emullotron();
});
