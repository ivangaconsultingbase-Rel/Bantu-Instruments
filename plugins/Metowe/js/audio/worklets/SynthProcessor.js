// js/audio/worklets/SynthProcessor.js
import { Chorus } from "./fx/Chorus.js";

const TAU = Math.PI * 2;
function midiToHz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

class OnePoleLP {
  constructor(sr) { this.sr = sr; this.z = 0; this.a = 0; }
  setCutoff(hz) {
    const c = Math.max(20, Math.min(this.sr * 0.45, hz));
    const x = Math.exp(-TAU * c / this.sr);
    this.a = x;
  }
  process(x) { this.z = (1 - this.a) * x + this.a * this.z; return this.z; }
}

class ADSR {
  constructor(sr) {
    this.sr = sr;
    this.a = 0.01; this.d = 0.1; this.s = 0.6; this.r = 0.12;
    this.state = "idle"; this.v = 0; this.releaseStart = 0;
  }
  set(a, d, s, r) {
    this.a = Math.max(0.001, a);
    this.d = Math.max(0.001, d);
    this.s = Math.max(0, Math.min(1, s));
    this.r = Math.max(0.001, r);
  }
  noteOn(){ this.state = "attack"; }
  noteOff(){ if(this.state!=="idle"){ this.state="release"; this.releaseStart=this.v; } }
  step(){
    const dt = 1/this.sr;
    if(this.state==="idle") return 0;

    if(this.state==="attack"){
      this.v += dt/this.a;
      if(this.v>=1){ this.v=1; this.state="decay"; }
      return this.v;
    }
    if(this.state==="decay"){
      this.v -= (dt/this.d)*(1-this.s);
      if(this.v<=this.s){ this.v=this.s; this.state="sustain"; }
      return this.v;
    }
    if(this.state==="sustain"){ this.v=this.s; return this.v; }
    if(this.state==="release"){
      this.v -= (dt/this.r)*this.releaseStart;
      if(this.v<=0.0001){ this.v=0; this.state="idle"; }
      return this.v;
    }
    return this.v;
  }
  isActive(){ return this.state!=="idle"; }
}

class Voice {
  constructor(sr){
    this.sr=sr;
    this.active=false;
    this.midi=0; this.freq=0;
    this.phase=0; this.subPhase=0;
    this.vel=0.9; this.accent=false;
    this.env=new ADSR(sr);
    this.filt=new OnePoleLP(sr);
    this.gateOffTime=0;
  }

  start(midi, vel, accent, now, gateSec){
    this.active=true;
    this.midi=midi;
    this.freq=midiToHz(midi);
    this.vel=vel;
    this.accent=accent;
    this.phase=0;
    this.subPhase=0;
    this.env.noteOn();
    this.gateOffTime=now+gateSec;
  }
  release(){ this.env.noteOff(); }

  step(now, params, lfoVal, noiseVal){
    if(!this.active) return 0;
    if(now>=this.gateOffTime && this.env.state!=="release") this.release();

    const e=this.env.step();
    if(!this.env.isActive()){ this.active=false; return 0; }

    const pitchMod = params.lfoToPitch * lfoVal; // small semitone-ish
    const f = this.freq * Math.pow(2, pitchMod/12);

    // osc phase
    const dt = f/this.sr;
    this.phase += dt; if(this.phase>=1) this.phase -= 1;

    const saw = 2*this.phase - 1;

    const pw = Math.max(0.05, Math.min(0.95, params.pulseWidth + params.lfoToPW*lfoVal*0.25));
    const pulse = (this.phase < pw) ? 1 : -1;

    const osc = (1-params.waveMix)*saw + params.waveMix*pulse;

    // sub
    const subF = f*0.5;
    const subDt = subF/this.sr;
    this.subPhase += subDt; if(this.subPhase>=1) this.subPhase -= 1;
    const sub = (this.subPhase<0.5)?1:-1;

    const sig = osc + params.sub*sub + params.noise*noiseVal;

    // cutoff mod
    const cutoff = params.cutoff + params.envAmt*e + (params.cutoff*params.lfoToCutoff*lfoVal);
    this.filt.setCutoff(cutoff);
    let y = this.filt.process(sig);

    const accentBoost = this.accent ? 1.15 : 1.0;
    const amp = params.master * this.vel * accentBoost;
    y *= (e * amp);
    return y;
  }
}

class EventQueue{
  constructor(){ this.q=[]; }
  push(ev){ this.q.push(ev); this.q.sort((a,b)=>a.time-b.time); }
  popDue(t){
    const out=[];
    while(this.q.length && this.q[0].time<=t) out.push(this.q.shift());
    return out;
  }
}

class SynthProcessor extends AudioWorkletProcessor {
  constructor(){
    super();
    this.sr = sampleRate;

    this.params = {
      master: 0.9,
      cutoff: 2200,
      res: 0.12,      // reserved for later filter upgrade
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

      // Chorus
      chorusOn: 1,
      chorusRate: 0.8,   // Hz
      chorusDepth: 9.0,  // ms
      chorusMix: 0.45,   // 0..1
    };

    this.voices = Array.from({length:8}, ()=> new Voice(this.sr));
    this.events = new EventQueue();

    this.lfoPhase = 0;

    // FX
    this.chorus = new Chorus(this.sr);
    this._syncChorus();

    for(const v of this.voices){
      v.env.set(this.params.attack, this.params.decay, this.params.sustain, this.params.release);
    }

    this.port.onmessage = (e)=>{
      const msg = e.data;
      if(!msg || !msg.type) return;

      if(msg.type==="param"){
        const {name, value} = msg;
        if(name in this.params) this.params[name] = Number(value);

        // sync ADSR quickly
        if (name==="attack"||name==="decay"||name==="sustain"||name==="release"){
          for(const v of this.voices){
            v.env.set(this.params.attack, this.params.decay, this.params.sustain, this.params.release);
          }
        }

        // sync chorus
        if (name==="chorusOn"||name==="chorusRate"||name==="chorusDepth"||name==="chorusMix"){
          this._syncChorus();
        }
        return;
      }

      if(msg.type==="noteOn"){
        this.events.push({
          type:"noteOn",
          time:Number(msg.time)||0,
          midi:Number(msg.midi)||60,
          vel:Math.max(0,Math.min(1,Number(msg.vel)||0.9)),
          gate:Math.max(0.01,Number(msg.gate)||0.12),
          accent:!!msg.accent
        });
      }
    };
  }

  _syncChorus(){
    const on = !!this.params.chorusOn;
    this.chorus.set(
      this.params.chorusRate,
      this.params.chorusDepth,
      this.params.chorusMix,
      on
    );
  }

  _allocVoice(){
    let v = this.voices.find(x=>!x.active);
    if(v) return v;
    v = this.voices.reduce((best,cur)=> (cur.env.v < best.env.v ? cur : best), this.voices[0]);
    return v;
  }

  process(inputs, outputs){
    const out = outputs[0];
    const chL = out[0];
    const chR = out[1] || out[0];
    const frames = chL.length;

    for(let i=0;i<frames;i++){
      const t = (currentFrame+i)/this.sr;

      // events
      const due = this.events.popDue(t);
      for(const ev of due){
        if(ev.type==="noteOn"){
          const v = this._allocVoice();
          v.env.set(this.params.attack, this.params.decay, this.params.sustain, this.params.release);
          v.start(ev.midi, ev.vel, ev.accent, t, ev.gate);
        }
      }

      // LFO triangle (-1..1)
      const inc = this.params.lfoRate / this.sr;
      this.lfoPhase += inc;
      if(this.lfoPhase>=1) this.lfoPhase -= 1;
      const lfoTri = 1 - 4*Math.abs(this.lfoPhase-0.5);

      const noise = (Math.random()*2-1);

      let s = 0;
      for(const v of this.voices){
        s += v.step(t, this.params, lfoTri, noise);
      }

      // soft limiter pre-fx
      let y = Math.tanh(s * 1.25);

      // stereo (duplicate for now)
      let L = y;
      let R = y;

      // Chorus
      [L, R] = this.chorus.process(L, R);

      // post safety
      L = Math.tanh(L * 1.1);
      R = Math.tanh(R * 1.1);

      chL[i] = L;
      chR[i] = R;
    }

    return true;
  }
}

registerProcessor("akomga-synth", SynthProcessor);
