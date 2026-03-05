// js/audio/worklets/SynthProcessor.js
// AudioWorkletProcessor: poly synth (8 voices) + simple LPF + ADSR + LFO
// NOTE: This is an original implementation (safe for GPL project).

const TAU = Math.PI * 2;

function midiToHz(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

class OnePoleLP {
  constructor(sr) {
    this.sr = sr;
    this.z = 0;
    this.a = 0.0;
  }
  setCutoff(hz) {
    const c = Math.max(20, Math.min(this.sr * 0.45, hz));
    // simple one-pole coefficient
    const x = Math.exp(-TAU * c / this.sr);
    this.a = x;
  }
  process(x) {
    // y[n] = (1-a)*x + a*y[n-1]
    this.z = (1 - this.a) * x + this.a * this.z;
    return this.z;
  }
}

class ADSR {
  constructor(sr) {
    this.sr = sr;
    this.a = 0.01;
    this.d = 0.1;
    this.s = 0.6;
    this.r = 0.12;

    this.state = "idle"; // idle, attack, decay, sustain, release
    this.v = 0.0;
    this.releaseStart = 0.0;
  }

  set(a, d, s, r) {
    this.a = Math.max(0.001, a);
    this.d = Math.max(0.001, d);
    this.s = Math.max(0, Math.min(1, s));
    this.r = Math.max(0.001, r);
  }

  noteOn() {
    this.state = "attack";
  }

  noteOff() {
    if (this.state !== "idle") {
      this.state = "release";
      this.releaseStart = this.v;
    }
  }

  step() {
    const dt = 1 / this.sr;

    if (this.state === "idle") return 0;

    if (this.state === "attack") {
      const inc = dt / this.a;
      this.v += inc;
      if (this.v >= 1) {
        this.v = 1;
        this.state = "decay";
      }
      return this.v;
    }

    if (this.state === "decay") {
      const dec = dt / this.d;
      this.v -= dec * (1 - this.s);
      if (this.v <= this.s) {
        this.v = this.s;
        this.state = "sustain";
      }
      return this.v;
    }

    if (this.state === "sustain") {
      this.v = this.s;
      return this.v;
    }

    if (this.state === "release") {
      const dec = dt / this.r;
      this.v -= dec * this.releaseStart;
      if (this.v <= 0.0001) {
        this.v = 0;
        this.state = "idle";
      }
      return this.v;
    }

    return this.v;
  }

  isActive() {
    return this.state !== "idle";
  }
}

class Voice {
  constructor(sr) {
    this.sr = sr;
    this.active = false;
    this.midi = 0;
    this.freq = 0;

    this.phase = 0;
    this.subPhase = 0;

    this.vel = 0.9;
    this.accent = false;

    this.env = new ADSR(sr);
    this.filt = new OnePoleLP(sr);

    this.gateOffTime = 0; // audio time (seconds)
  }

  start(midi, vel, accent, now, gateSec) {
    this.active = true;
    this.midi = midi;
    this.freq = midiToHz(midi);
    this.vel = vel;
    this.accent = accent;
    this.phase = 0;
    this.subPhase = 0;
    this.env.noteOn();
    this.gateOffTime = now + gateSec;
  }

  release() {
    this.env.noteOff();
  }

  step(now, params, lfoVal, noiseVal) {
    if (!this.active) return 0;

    // auto note off based on gate
    if (now >= this.gateOffTime && this.env.state !== "release") {
      this.release();
    }

    const e = this.env.step();
    if (!this.env.isActive()) {
      this.active = false;
      return 0;
    }

    // pitch LFO
    const pitchMod = params.lfoToPitch * lfoVal; // in semitone-ish small
    const f = this.freq * Math.pow(2, pitchMod / 12);

    // osc
    const dt = f / this.sr;
    this.phase += dt;
    if (this.phase >= 1) this.phase -= 1;

    // saw: -1..1
    const saw = 2 * this.phase - 1;

    // PWM LFO
    const pw = Math.max(0.05, Math.min(0.95, params.pulseWidth + params.lfoToPW * lfoVal * 0.25));
    const pulse = (this.phase < pw) ? 1 : -1;

    // wave mix
    const osc = (1 - params.waveMix) * saw + params.waveMix * pulse;

    // sub (one octave down square)
    const subF = f * 0.5;
    const subDt = subF / this.sr;
    this.subPhase += subDt;
    if (this.subPhase >= 1) this.subPhase -= 1;
    const sub = (this.subPhase < 0.5) ? 1 : -1;

    const sig = osc + params.sub * sub + params.noise * noiseVal;

    // filter cutoff = base + env + lfo
    const cutoff = params.cutoff
      + params.envAmt * e
      + (params.cutoff * params.lfoToCutoff * lfoVal);

    this.filt.setCutoff(cutoff);
    let y = this.filt.process(sig);

    // amplitude
    const accentBoost = this.accent ? 1.15 : 1.0;
    const amp = params.master * this.vel * accentBoost;
    y *= (e * amp);

    return y;
  }
}

class EventQueue {
  constructor() { this.q = []; }
  push(ev) {
    this.q.push(ev);
    // keep it sorted by time (q small)
    this.q.sort((a, b) => a.time - b.time);
  }
  popDue(t) {
    const out = [];
    while (this.q.length && this.q[0].time <= t) out.push(this.q.shift());
    return out;
  }
}

class SynthProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.sr = sampleRate;

    this.params = {
      master: 0.9,
      cutoff: 2200,
      res: 0.12,      // (reserved for future)
      envAmt: 1200,
      attack: 0.008,
      decay: 0.14,
      sustain: 0.55,
      release: 0.12,
      waveMix: 0.65,
      pulseWidth: 0.55,
      sub: 0.25,
      noise: 0.03,
      lfoRate: 0.6,
      lfoToPitch: 0.0,
      lfoToCutoff: 0.12,
      lfoToPW: 0.10,
    };

    this.voices = Array.from({ length: 8 }, () => new Voice(this.sr));
    this.events = new EventQueue();

    // LFO
    this.lfoPhase = 0;

    this.port.onmessage = (e) => {
      const msg = e.data;
      if (!msg || !msg.type) return;

      if (msg.type === "param") {
        const { name, value } = msg;
        if (name in this.params) this.params[name] = Number(value);
        // keep ADSR in sync
        for (const v of this.voices) {
          v.env.set(this.params.attack, this.params.decay, this.params.sustain, this.params.release);
        }
        return;
      }

      if (msg.type === "noteOn") {
        this.events.push({
          type: "noteOn",
          time: Number(msg.time) || 0,
          midi: Number(msg.midi) || 60,
          vel: Math.max(0, Math.min(1, Number(msg.vel) || 0.9)),
          gate: Math.max(0.01, Number(msg.gate) || 0.12),
          accent: !!msg.accent,
        });
      }
    };

    // init ADSR
    for (const v of this.voices) {
      v.env.set(this.params.attack, this.params.decay, this.params.sustain, this.params.release);
    }
  }

  _allocVoice(midi) {
    // free voice first
    let v = this.voices.find(x => !x.active);
    if (v) return v;

    // steal: quietest (lowest env) or oldest-ish: choose smallest env value
    v = this.voices.reduce((best, cur) => (cur.env.v < best.env.v ? cur : best), this.voices[0]);
    return v;
  }

  process(inputs, outputs) {
    const out = outputs[0];
    const chL = out[0];
    const chR = out[1] || out[0];

    const frames = chL.length;

    for (let i = 0; i < frames; i++) {
      const t = (currentFrame + i) / this.sr;

      // handle due events
      const due = this.events.popDue(t);
      for (const ev of due) {
        if (ev.type === "noteOn") {
          const v = this._allocVoice(ev.midi);
          v.env.set(this.params.attack, this.params.decay, this.params.sustain, this.params.release);
          v.start(ev.midi, ev.vel, ev.accent, t, ev.gate);
        }
      }

      // LFO triangle (-1..1)
      const lfoInc = this.params.lfoRate / this.sr;
      this.lfoPhase += lfoInc;
      if (this.lfoPhase >= 1) this.lfoPhase -= 1;
      const lfoTri = 1 - 4 * Math.abs(this.lfoPhase - 0.5); // -1..1

      // noise
      const noise = (Math.random() * 2 - 1);

      // sum voices
      let s = 0;
      for (const v of this.voices) {
        s += v.step(t, this.params, lfoTri, noise);
      }

      // soft limiter (MVP safety)
      const y = Math.tanh(s * 1.3);

      chL[i] = y;
      chR[i] = y;
    }

    return true;
  }
}

registerProcessor("akomga-synth", SynthProcessor);
