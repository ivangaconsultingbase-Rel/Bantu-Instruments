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

    this.noteRange = { min: 36, max: 84 };
    this.isInitialized = false;

    this.keyLayout = [
      [
        { code: 'KeyQ', label: 'Q', note: 60 },
        { code: 'KeyZ', label: 'Z', note: 61 },
        { code: 'KeyS', label: 'S', note: 62 },
        { code: 'KeyE', label: 'E', note: 63 },
        { code: 'KeyD', label: 'D', note: 64 },
        { code: 'KeyF', label: 'F', note: 65 },
        { code: 'KeyT', label: 'T', note: 66 },
        { code: 'KeyG', label: 'G', note: 67 },
        { code: 'KeyY', label: 'Y', note: 68 },
        { code: 'KeyH', label: 'H', note: 69 },
        { code: 'KeyU', label: 'U', note: 70 },
        { code: 'KeyJ', label: 'J', note: 71 }
      ],
      [
        { code: 'KeyK', label: 'K', note: 72 },
        { code: 'KeyO', label: 'O', note: 73 },
        { code: 'KeyL', label: 'L', note: 74 },
        { code: 'KeyP', label: 'P', note: 75 },
        { code: 'KeyM', label: 'M', note: 76 },
        { code: 'BracketLeft', label: '[', note: 77 },
        { code: 'Comma', label: ',', note: 78 },
        { code: 'BracketRight', label: ']', note: 79 },
        { code: 'Period', label: '.', note: 80 }
      ]
    ];

    this.keyToNote = {};
    this.keyLayout.flat().forEach(k => {
      this.keyToNote[k.code] = k.note;
    });

    this.supportedExtensions = ['wav', 'wave', 'aif', 'aiff', 'caf', 'mp3', 'm4a'];

    this.init();
  }

  async init() {
    this.setupUI();
    this.setupKeyboard();
    this.setupKnobs();
    this.setupFileLoader();
    this.setupComputerKeyboard();
    await this.setupMIDI();
    this.startVUMeter();
    this.updateLCDState();
  }

  async initAudioContext() {
    if (this.audioContext) {
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      return;
    }

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
    this.updateStatus('Audio engine initialized');
    this.updateLCDState();
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

  async generateVirtualTapes() {
    if (!this.sourceBuffer) return;

    this.virtualTapes.clear();
    const rootNote = Math.round(this.params.rootNote);

    this.updateStatus('Generating virtual tapes...');

    for (let note = this.noteRange.min; note <= this.noteRange.max; note++) {
      const semitoneOffset = note - rootNote;
      const tape = this.createVirtualTape(note, semitoneOffset);
      this.virtualTapes.set(note, tape);
    }

    this.updateStatus(`${this.virtualTapes.size} virtual tapes generated`);
    this.updateKeyboardRoot();
    this.updateLCDState();
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
      stereoPan: ((note - 60) / 24) * (this.params.stereoWidth / 100)
    };
  }

  playNote(note, velocity = 1) {
    if (!this.isInitialized || !this.sourceBuffer) return;
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
      this.updateVoiceDisplay();
      if (this.activeVoices.size === 0) {
        this.stopReelAnimation();
      }
      this.updateLCDState();
    }, maxDuration * 1000);

    this.updateVoiceDisplay();
    this.startReelAnimation();
    this.updateLCDState();
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

    const toneFilter = this.audioContext.createBiquadFilter();
    toneFilter.type = 'highshelf';
    toneFilter.frequency.value = 2000;
    toneFilter.gain.value = (this.params.tone - 50) / 10;

    const saturation = this.createSaturation(this.params.saturation / 100);

    const gain = this.audioContext.createGain();
    gain.gain.value = 0;

    const attackTime = (this.params.attack / 100) * 0.15 + tape.attackVariation;
    const jitter = (this.params.startJitter / 100) * 0.02;
    const attackStart = this.audioContext.currentTime + Math.random() * jitter;

    gain.gain.setValueAtTime(0, attackStart);
    gain.gain.linearRampToValueAtTime(velocity * 0.8, attackStart + attackTime);

    const panner = this.audioContext.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, tape.stereoPan));

    source.connect(filter);
    filter.connect(toneFilter);
    toneFilter.connect(saturation);
    saturation.connect(gain);
    gain.connect(panner);
    panner.connect(this.masterGain);

    let noiseGain = null;
    let noiseSource = null;

    if (this.params.mechanicalNoise > 5) {
      noiseSource = this.createNoiseSource();
      const noiseFilter = this.audioContext.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.value = 800;
      noiseFilter.Q.value = 2;

      noiseGain = this.audioContext.createGain();
      const noiseLevel = tape.noiseLevel * (this.params.mechanicalNoise / 50);
      noiseGain.gain.value = noiseLevel * velocity;

      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(panner);

      noiseSource.start();
    }

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
      noiseSource,
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
      const wow = Math.sin(t * Math.PI * 1.2) * wowAmount;
      const flutter = Math.sin(t * Math.PI * 14) * flutterAmount;
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

    this.updateLCDState();
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

  isSupportedSampleFile(file) {
    if (!file || !file.name) return false;

    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (this.supportedExtensions.includes(ext)) {
      return true;
    }

    const type = (file.type || '').toLowerCase();
    if (
      type.startsWith('audio/') ||
      type.includes('wav') ||
      type.includes('wave') ||
      type.includes('aiff') ||
      type.includes('mpeg') ||
      type.includes('mp4')
    ) {
      return true;
    }

    return false;
  }

  async loadSample(file) {
    if (!this.isSupportedSampleFile(file)) {
      this.updateStatus(`Unsupported file type: ${file?.name || 'unknown file'}`);
      return;
    }

    await this.initAudioContext();

    this.updateStatus(`Loading ${file.name}...`);
    document.getElementById('sample-name').textContent = file.name.substring(0, 28).toUpperCase();
    this.updateLCDState();

    try {
      const arrayBuffer = await file.arrayBuffer();
      this.sourceBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

      await this.generateVirtualTapes();
      this.updateStatus(`Ready — ${file.name}`);
      this.updateLCDState();
    } catch (error) {
      this.updateStatus(`Error loading file: ${error.message}`);
      console.error(error);
    }
  }

  setupUI() {
    document.addEventListener('contextmenu', (e) => {
      if (e.target.classList.contains('knob')) {
        e.preventDefault();
      }
    });
  }

  setupKeyboard() {
    const keyboard = document.getElementById('keyboard');
    keyboard.innerHTML = '';

    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

    this.keyLayout.forEach((rowData) => {
      const row = document.createElement('div');
      row.className = 'key-row';

      rowData.forEach(({ code, label, note }) => {
        const key = document.createElement('div');
        key.className = 'key computer-key';
        key.dataset.note = note;
        key.dataset.code = code;

        const noteName = noteNames[note % 12];
        const octave = Math.floor(note / 12) - 1;

        key.innerHTML = `
          <div class="keycap-top">
            <span class="keycap-char">${label}</span>
            <span class="keycap-note">${noteName}${octave}</span>
          </div>
          <div class="keycap-bottom">
            <span class="keycap-midi">MIDI ${note}</span>
          </div>
        `;

        const noteNumber = parseInt(key.dataset.note, 10);

        const startKey = async (e) => {
          e.preventDefault();
          await this.initAudioContext();
          this.playNote(noteNumber, 0.8);
          key.classList.add('active');
        };

        const endKey = () => {
          this.stopNote(noteNumber);
          key.classList.remove('active');
        };

        key.addEventListener('mousedown', startKey);
        key.addEventListener('mouseup', endKey);
        key.addEventListener('mouseleave', () => {
          if (key.classList.contains('active')) {
            endKey();
          }
        });

        key.addEventListener('touchstart', startKey, { passive: false });
        key.addEventListener('touchend', endKey);
        key.addEventListener('touchcancel', endKey);

        row.appendChild(key);
      });

      keyboard.appendChild(row);
    });

    this.updateKeyboardRoot();
  }

  setupComputerKeyboard() {
    document.addEventListener('keydown', async (e) => {
      if (e.repeat) return;
      if (e.target.tagName === 'INPUT') return;

      const note = this.keyToNote[e.code];
      if (note !== undefined) {
        e.preventDefault();
        await this.initAudioContext();
        this.playNote(note, 0.8);

        const keyEl = document.querySelector(`.computer-key[data-note="${note}"]`);
        if (keyEl) keyEl.classList.add('active');
      }
    });

    document.addEventListener('keyup', (e) => {
      const note = this.keyToNote[e.code];
      if (note !== undefined) {
        this.stopNote(note);

        const keyEl = document.querySelector(`.computer-key[data-note="${note}"]`);
        if (keyEl) keyEl.classList.remove('active');
      }
    });
  }

  setupKnobs() {
    const knobs = document.querySelectorAll('.knob');

    knobs.forEach(knob => {
      const param = knob.dataset.param;
      const min = parseFloat(knob.dataset.min);
      const max = parseFloat(knob.dataset.max);
      const initialValue = parseFloat(knob.dataset.value);

      this.params[param] = initialValue;
      this.updateKnobVisual(knob, initialValue, min, max);

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
      knob.addEventListener('touchstart', onStart, { passive: false });
      document.addEventListener('mousemove', onMove);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('mouseup', onEnd);
      document.addEventListener('touchend', onEnd);

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

    const readout = knob.parentElement.querySelector('.knob-readout');
    if (readout) {
      if (max === 1) {
        readout.textContent = Math.round(value * 100);
      } else if (Number.isInteger(min) && Number.isInteger(max)) {
        readout.textContent = Math.round(value);
      } else {
        readout.textContent = value.toFixed(1);
      }
    }
  }

  onParamChange(param, value) {
    switch (param) {
      case 'masterVolume':
        if (this.masterGain && this.audioContext) {
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

    this.updateLCDState();
  }

  updateActiveVoicesFilter() {
    if (!this.audioContext) return;

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
    document.querySelectorAll('.computer-key').forEach(key => {
      key.classList.remove('root-key');
    });

    const rootKey = document.querySelector(`.computer-key[data-note="${Math.round(this.params.rootNote)}"]`);
    if (rootKey) {
      rootKey.classList.add('root-key');
    }

    this.updateLCDState();
  }

  setupFileLoader() {
    const loadBtn = document.getElementById('load-sample');
    const fileInput = document.getElementById('file-input');

    loadBtn.addEventListener('click', async () => {
      await this.initAudioContext();
      fileInput.click();
    });

    fileInput.addEventListener('change', async (e) => {
      if (e.target.files.length > 0) {
        await this.loadSample(e.target.files[0]);
      }
      e.target.value = '';
    });

    const emullotron = document.querySelector('.emullotron');

    emullotron.addEventListener('dragover', (e) => {
      e.preventDefault();
      emullotron.style.outline = '3px solid rgba(255,111,61,0.6)';
      emullotron.style.outlineOffset = '-3px';
    });

    emullotron.addEventListener('dragleave', () => {
      emullotron.style.outline = 'none';
    });

    emullotron.addEventListener('drop', async (e) => {
      e.preventDefault();
      emullotron.style.outline = 'none';

      if (e.dataTransfer.files.length > 0) {
        await this.loadSample(e.dataTransfer.files[0]);
      }
    });
  }

  async setupMIDI() {
    const indicator = document.getElementById('midi-indicator');
    const text = document.getElementById('midi-text');

    if (!navigator.requestMIDIAccess) {
      text.textContent = 'NOT SUPPORTED';
      return;
    }

    try {
      const midiAccess = await navigator.requestMIDIAccess();

      const connectInput = (input) => {
        input.onmidimessage = (e) => this.onMIDIMessage(e);
        indicator.classList.add('connected');
        text.textContent = input.name.toUpperCase().slice(0, 14);
      };

      midiAccess.inputs.forEach(connectInput);

      midiAccess.onstatechange = (e) => {
        if (e.port.type === 'input') {
          if (e.port.state === 'connected') {
            connectInput(e.port);
          } else {
            indicator.classList.remove('connected');
            text.textContent = 'DISCONNECTED';
          }
        }
      };
    } catch (error) {
      text.textContent = 'ERROR';
      console.error('MIDI Error:', error);
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

      const keyEl = document.querySelector(`.computer-key[data-note="${note}"]`);
      if (keyEl) keyEl.classList.add('active');
    } else if (command === 0x80 || (command === 0x90 && velocity === 0)) {
      this.stopNote(note);

      const keyEl = document.querySelector(`.computer-key[data-note="${note}"]`);
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
    this.updateLCDState();
  }

  updateTapeProgress() {
    if (this.activeVoices.size === 0) {
      document.getElementById('tape-indicator').style.width = '0%';
      return;
    }

    const updateFrame = () => {
      if (this.activeVoices.size === 0 || !this.audioContext) return;

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

        const scale = Math.max(0.08, Math.min(1, average * 3));
        leftBar.style.transform = `scaleY(${scale})`;
        rightBar.style.transform = `scaleY(${scale * (0.9 + Math.random() * 0.2)})`;
      }

      requestAnimationFrame(update);
    };

    update();
  }

  updateStatus(message) {
    const statusEl = document.getElementById('status-text');
    if (statusEl) {
      statusEl.textContent = String(message).toUpperCase();
    }
    this.updateLCDState();
  }

  midiToNoteName(note) {
    const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    return `${names[note % 12]}${Math.floor(note / 12) - 1}`;
  }

  updateLCDState() {
    const rootEl = document.getElementById('lcd-root');
    const voicesEl = document.getElementById('lcd-voices');
    const engineEl = document.getElementById('lcd-engine');

    if (rootEl) rootEl.textContent = this.midiToNoteName(Math.round(this.params.rootNote));
    if (voicesEl) voicesEl.textContent = String(this.activeVoices.size);

    if (engineEl) {
      if (!this.audioContext) {
        engineEl.textContent = 'STANDBY';
      } else if (this.sourceBuffer) {
        engineEl.textContent = 'READY';
      } else {
        engineEl.textContent = 'AUDIO ON';
      }
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.emullotron = new Emullotron();
});
