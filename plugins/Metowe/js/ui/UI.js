import { SCALES } from "../sequencer/Scale.js";

export class UI {
  constructor(synth, seq){
    this.synth = synth;
    this.seq = seq;

    this.steps = [];
    this.keys = [];

    this.isMobile = (('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || window.matchMedia('(hover: none)').matches);

    this._lpTimer = null;
    this._lpTriggered = false;
  }

  $(id){ return document.getElementById(id); }
  setText(id, v){ const el = this.$(id); if (el) el.textContent = String(v); }

  init(){
    this._buildKeyboard();
    this._buildSequencer();
    this._bind();

    this._syncAllDisplays();
    this._renderStepsText();

    this.setText("hint", this.isMobile ? "Tap Play, puis touche le clavier (mobile)" : "Click Play, puis joue au clavier (desktop)");

    // ensure audible on iOS: first user gesture resumes AudioContext
    const resumeOnce = async () => {
      await this.synth.resume();
      window.removeEventListener("pointerdown", resumeOnce);
    };
    window.addEventListener("pointerdown", resumeOnce, { once: true });
  }

  _blinkLed(){
    const led = this.$("led");
    if (!led) return;
    led.classList.add("active");
    setTimeout(() => led.classList.remove("active"), 80);
  }

  _bind(){
    // play toggle
    this.$("play-btn")?.addEventListener("click", () => {
      if (this.seq.isPlaying){
        this.seq.stop();
        this.$("play-btn")?.classList.remove("active");
      } else {
        this.seq.start();
        this.$("play-btn")?.classList.add("active");
      }
    });

    this.$("clear-btn")?.addEventListener("click", () => {
      this.seq.clear();
      this._renderStepsText();
    });

    this.$("rand-btn")?.addEventListener("click", () => {
      this.seq.randomize();
      this._renderStepsText();
    });

    // tempo/human/swing
    this.$("bpm")?.addEventListener("input", (e) => {
      const v = parseInt(e.target.value, 10) || 90;
      this.seq.setBPM(v);
      this.setText("bpm-display", v);
      this.setText("bpm-val", v);
    });

    this.$("swing")?.addEventListener("input", (e) => {
      const v = parseInt(e.target.value, 10) || 0;
      this.seq.setSwing(v);
      this.setText("swing-display", v);
      this.setText("swing-val", `${v}%`);
    });

    this.$("human")?.addEventListener("input", (e) => {
      const v = parseInt(e.target.value, 10) || 0;
      this.seq.setHuman(v);
      this.setText("human-display", v);
      this.setText("human-val", `${v}%`);
    });

    // musical
    this.$("scale")?.addEventListener("change", (e) => {
      this.seq.setScale(e.target.value);
      this._renderStepsText();
    });

    this.$("root")?.addEventListener("change", (e) => {
      this.seq.setRoot(parseInt(e.target.value, 10));
      this._renderStepsText();
    });

    this.$("mode")?.addEventListener("change", (e) => {
      this.seq.setMode(e.target.value);
    });

    // synth params
    this.$("osc1")?.addEventListener("change", (e) => this.synth.setOsc1Type(e.target.value));
    this.$("osc2")?.addEventListener("change", (e) => this.synth.setOsc2Type(e.target.value));

    this.$("detune")?.addEventListener("input", (e) => {
      const v = parseInt(e.target.value, 10) || 0;
      this.synth.setDetuneCents(v);
      this.setText("detune-val", v);
    });

    this.$("sub")?.addEventListener("input", (e) => {
      const v = parseInt(e.target.value, 10) || 0;
      this.synth.setSubMix01(v/100);
      this.setText("sub-val", `${v}%`);
    });

    this.$("noise")?.addEventListener("input", (e) => {
      const v = parseInt(e.target.value, 10) || 0;
      this.synth.setNoiseMix01(v/100);
      this.setText("noise-val", `${v}%`);
    });

    this.$("master")?.addEventListener("input", (e) => {
      const v = parseInt(e.target.value, 10) || 0;
      this.synth.setMaster01(v/100);
      this.setText("master-val", `${v}%`);
    });

    this.$("cutoff")?.addEventListener("input", (e) => {
      const v = parseInt(e.target.value, 10) || 8000;
      this.synth.setCutoff(v);
      this.setText("cutoff-val", `${(v/1000).toFixed(1)}k`);
    });

    this.$("res")?.addEventListener("input", (e) => {
      const v = parseInt(e.target.value, 10) || 0;
      this.synth.setRes01(v/100);
      this.setText("res-val", `${v}%`);
    });

    this.$("envamt")?.addEventListener("input", (e) => {
      const v = parseInt(e.target.value, 10) || 0;
      this.synth.setEnvAmt01(v/100);
      this.setText("envamt-val", `${v}%`);
    });

    const applyADSR = () => {
      const a = parseInt(this.$("a")?.value || "0", 10);
      const d = parseInt(this.$("d")?.value || "0", 10);
      const s = parseInt(this.$("s")?.value || "0", 10);
      const r = parseInt(this.$("r")?.value || "0", 10);
      this.synth.setADSR(a,d,s,r);
      this.setText("a-val", `${a}ms`);
      this.setText("d-val", `${d}ms`);
      this.setText("s-val", `${s}%`);
      this.setText("r-val", `${r}ms`);
    };

    this.$("a")?.addEventListener("input", applyADSR);
    this.$("d")?.addEventListener("input", applyADSR);
    this.$("s")?.addEventListener("input", applyADSR);
    this.$("r")?.addEventListener("input", applyADSR);
    applyADSR();

    // FX params
    this.$("chorus")?.addEventListener("input", (e) => {
      const v = parseInt(e.target.value, 10) || 0;
      this.synth.setChorus01(v/100);
      this.setText("chorus-val", `${v}%`);
    });

    this.$("drive")?.addEventListener("input", (e) => {
      const v = parseInt(e.target.value, 10) || 0;
      this.synth.setDrive01(v/100);
      this.setText("drive-val", `${v}%`);
    });

    this.$("crush")?.addEventListener("input", (e) => {
      const v = parseInt(e.target.value, 10) || 0;
      this.synth.setCrush01(v/100);
      this.setText("crush-val", `${v}%`);
    });

    this.$("comp")?.addEventListener("input", (e) => {
      const v = parseInt(e.target.value, 10) || 0;
      this.synth.setComp01(v/100);
      this.setText("comp-val", `${v}%`);
    });

    this.$("reverb")?.addEventListener("input", (e) => {
      const v = parseInt(e.target.value, 10) || 0;
      this.synth.setReverb01(v/100);
      this.setText("reverb-val", `${v}%`);
    });
  }

  _syncAllDisplays(){
    // transport defaults already match HTML values
    this.setText("bpm-display", this.$("bpm")?.value || "90");
    this.setText("bpm-val", this.$("bpm")?.value || "90");
    this.setText("swing-display", this.$("swing")?.value || "0");
    this.setText("swing-val", `${this.$("swing")?.value || "0"}%`);
    this.setText("human-display", this.$("human")?.value || "0");
    this.setText("human-val", `${this.$("human")?.value || "0"}%`);

    this.setText("detune-val", this.$("detune")?.value || "7");
    this.setText("sub-val", `${this.$("sub")?.value || "30"}%`);
    this.setText("noise-val", `${this.$("noise")?.value || "10"}%`);
    this.setText("master-val", `${this.$("master")?.value || "80"}%`);

    const cutoff = parseInt(this.$("cutoff")?.value || "8000",10);
    this.setText("cutoff-val", `${(cutoff/1000).toFixed(1)}k`);
    this.setText("res-val", `${this.$("res")?.value || "25"}%`);
    this.setText("envamt-val", `${this.$("envamt")?.value || "40"}%`);

    this.setText("chorus-val", `${this.$("chorus")?.value || "25"}%`);
    this.setText("drive-val", `${this.$("drive")?.value || "12"}%`);
    this.setText("crush-val", `${this.$("crush")?.value || "0"}%`);
    this.setText("comp-val", `${this.$("comp")?.value || "25"}%`);
    this.setText("reverb-val", `${this.$("reverb")?.value || "18"}%`);

    // apply initial to engine
    this.synth.setMaster01((parseInt(this.$("master")?.value||"80",10))/100);
    this.synth.setDetuneCents(parseInt(this.$("detune")?.value||"7",10));
    this.synth.setSubMix01((parseInt(this.$("sub")?.value||"30",10))/100);
    this.synth.setNoiseMix01((parseInt(this.$("noise")?.value||"10",10))/100);

    this.synth.setCutoff(parseInt(this.$("cutoff")?.value||"8000",10));
    this.synth.setRes01((parseInt(this.$("res")?.value||"25",10))/100);
    this.synth.setEnvAmt01((parseInt(this.$("envamt")?.value||"40",10))/100);

    this.synth.setChorus01((parseInt(this.$("chorus")?.value||"25",10))/100);
    this.synth.setDrive01((parseInt(this.$("drive")?.value||"12",10))/100);
    this.synth.setCrush01((parseInt(this.$("crush")?.value||"0",10))/100);
    this.synth.setComp01((parseInt(this.$("comp")?.value||"25",10))/100);
    this.synth.setReverb01((parseInt(this.$("reverb")?.value||"18",10))/100);

    this.seq.setBPM(parseInt(this.$("bpm")?.value||"90",10));
    this.seq.setSwing(parseInt(this.$("swing")?.value||"0",10));
    this.seq.setHuman(parseInt(this.$("human")?.value||"0",10));

    this.seq.setScale(this.$("scale")?.value || "aeolian");
    this.seq.setRoot(parseInt(this.$("root")?.value||"48",10));
    this.seq.setMode(this.$("mode")?.value || "arp");

    // osc types
    this.synth.setOsc1Type(this.$("osc1")?.value || "sawtooth");
    this.synth.setOsc2Type(this.$("osc2")?.value || "square");
  }

  _buildKeyboard(){
    const el = this.$("keyboard");
    if (!el) return;

    // one octave from C to B
    const labels = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
    const black = new Set([1,3,6,8,10]);

    const base = 60; // C4
    el.innerHTML = "";
    this.keys = [];

    labels.forEach((name, i) => {
      const k = document.createElement("div");
      k.className = "key" + (black.has(i) ? " black" : "");
      k.textContent = name;
      k.dataset.midi = String(base + i);

      k.addEventListener("pointerdown", async (e) => {
        e.preventDefault();
        await this.synth.resume();
        const midi = parseInt(k.dataset.midi, 10);
        k.classList.add("active");
        this._blinkLed();
        // live poly: chords according to mode selection
        const mode = this.$("mode")?.value || "arp";
        if (mode === "chords"){
          this.synth.noteOn(midi, 0.9, 0, 0.35);
          this.synth.noteOn(midi+3, 0.65, 0, 0.35);
          this.synth.noteOn(midi+7, 0.65, 0, 0.35);
        } else {
          this.synth.noteOn(midi, 0.9, 0, 0.30);
        }
      }, { passive: false });

      const up = () => k.classList.remove("active");
      k.addEventListener("pointerup", up);
      k.addEventListener("pointercancel", up);

      el.appendChild(k);
      this.keys.push(k);
    });
  }

  _buildSequencer(){
    const el = this.$("seq");
    if (!el) return;

    el.innerHTML = "";
    this.steps = [];

    for (let i=0;i<16;i++){
      const s = document.createElement("div");
      s.className = "step";
      s.dataset.step = String(i);

      const n = document.createElement("div");
      n.className = "n";
      n.textContent = "--";

      const d = document.createElement("div");
      d.className = "d";
      d.textContent = String(i+1);

      s.appendChild(n);
      s.appendChild(d);

      // Tap = cycle step
      s.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        this._lpTriggered = false;

        const step = parseInt(s.dataset.step, 10);

        clearTimeout(this._lpTimer);
        this._lpTimer = setTimeout(() => {
          // long press => rest
          this._lpTriggered = true;
          this.seq.setRest(step);
          this._renderStepsText();
          if (navigator.vibrate) navigator.vibrate(10);
        }, 340);
      }, { passive:false });

      s.addEventListener("pointerup", (e) => {
        e.preventDefault();
        clearTimeout(this._lpTimer);
        const step = parseInt(s.dataset.step, 10);

        if (!this._lpTriggered){
          this.seq.cycleStep(step);
          this._renderStepsText();
          if (navigator.vibrate) navigator.vibrate(8);
        }
      }, { passive:false });

      s.addEventListener("pointercancel", () => {
        clearTimeout(this._lpTimer);
        this._lpTriggered = false;
      });

      el.appendChild(s);
      this.steps.push(s);
    }
  }

  _renderStepsText(){
    const scale = SCALES[this.seq.scaleName] || SCALES.aeolian;

    for (let i=0;i<16;i++){
      const v = this.seq.getStepValue(i);
      const s = this.steps[i];
      if (!s) continue;

      const nEl = s.querySelector(".n");
      if (!nEl) continue;

      if (v === -1){
        nEl.textContent = "--";
        s.classList.add("off");
      } else {
        const midi = this.seq.degreeToMidi(v);
        nEl.textContent = this._noteName(midi);
        s.classList.remove("off");
      }
    }
  }

  _noteName(midi){
    const names = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
    const n = midi % 12;
    const o = Math.floor(midi/12) - 1;
    return `${names[n]}${o}`;
  }

  onStep(step){
    this.steps.forEach(x => x.classList.remove("playing"));
    if (step >= 0 && this.steps[step]) this.steps[step].classList.add("playing");
    this._blinkLed();
  }
}
