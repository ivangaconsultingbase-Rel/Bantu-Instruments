/**
 * Voice.js
 * Juno-style poly voice
 *
 * PATCHES:
 * - JunoFilter integration
 * - Portamento / glide
 * - PWM stable update
 */

import { JunoFilter } from "./filters/JunoFilter.js";

export class Voice {

  constructor(ctx){

    this.ctx = ctx;

    // -------- params --------

    this.wave = 'saw';
    this.pwmDuty = 0.5;

    this.driveAmount = 2;

    this.cutoff = 2400;
    this.resonance = 0.15;
    this.filterEnvAmt = 0.35;

    this.glideTime = 0.04;

    this.adsr = {
      a:0.01,
      d:0.25,
      s:0.7,
      r:0.5
    }

    // -------- graph --------

    this.output = ctx.createGain()

    this.amp = ctx.createGain()
    this.amp.gain.value = 0.0001

    this.filter = new JunoFilter(ctx)

    this.drive = ctx.createWaveShaper()
    this.drive.oversample = "2x"

    this._updateDriveCurve()

    this.sawGain = ctx.createGain()
    this.pulseGain = ctx.createGain()

    this.sawGain.gain.value = 1
    this.pulseGain.gain.value = 0

    // routing

    this.sawGain.connect(this.filter.input)
    this.pulseGain.connect(this.filter.input)

    this.filter.connect(this.drive)
    this.drive.connect(this.amp)
    this.amp.connect(this.output)

    // runtime

    this.saw = null
    this.pulse = null

    this.note = null
    this._isOn = false

    this._lastFreq = 440

  }

  connect(node){
    this.output.connect(node)
  }

  disconnect(){
    try{this.output.disconnect()}catch{}
  }

  // -----------------------
  // PARAMS
  // -----------------------

  setWave(mode){

    const m = (mode || "").toLowerCase()

    this.wave =
      (m==="pulse"||m==="mix"||m==="saw")
        ? m
        : "saw"

    this._applyWaveMix()

  }

  setPWM(pct){

    let x = Number(pct)

    if(x>1)x/=100

    x=Math.max(0,Math.min(1,x))

    this.pwmDuty = 0.05 + x*0.9

    if(this.pulse){
      this.pulse.setPeriodicWave(
        this._makePulseWave(this.pwmDuty)
      )
    }

  }

  setDrive(amount){

    this.driveAmount = Math.max(0,Number(amount)||0)

    this._updateDriveCurve()

  }

  setFilter(cut,res,env){

    if(cut!=null){
      this.cutoff = Math.max(80,Math.min(12000,cut))
      this.filter.setCutoff(this.cutoff)
    }

    if(res!=null){
      this.resonance = Math.max(0,Math.min(1,res))
      this.filter.setResonance(this.resonance)
    }

    if(env!=null){
      this.filterEnvAmt = Math.max(0,Math.min(1,env))
    }

  }

  setADSR(aMs,dMs,sPct,rMs){

    const a = Math.max(0,Math.min(2000,aMs))/1000
    const d = Math.max(0,Math.min(2000,dMs))/1000
    const s = Math.max(0,Math.min(100,sPct))/100
    const r = Math.max(0,Math.min(4000,rMs))/1000

    this.adsr={a,d,s,r}

  }

  setGlide(sec){
    this.glideTime = Math.max(0,Math.min(.3,sec))
  }

  // -----------------------
  // NOTE ON
  // -----------------------

  noteOn(note,vel=1,when=this.ctx.currentTime){

    const t = Math.max(this.ctx.currentTime,when)

    const velocity = Math.max(0,Math.min(1,vel))

    this.note = note
    this._isOn = true

    const freq = this._midiToFreq(note)

    // OSC

    this.saw = this.ctx.createOscillator()
    this.saw.type="sawtooth"

    this.pulse = this.ctx.createOscillator()
    this.pulse.setPeriodicWave(
      this._makePulseWave(this.pwmDuty)
    )

    // PORTAMENTO

    if(this.glideTime>0){

      this.saw.frequency.setTargetAtTime(freq,t,this.glideTime)
      this.pulse.frequency.setTargetAtTime(freq,t,this.glideTime)

    }else{

      this.saw.frequency.setValueAtTime(freq,t)
      this.pulse.frequency.setValueAtTime(freq,t)

    }

    this.saw.connect(this.sawGain)
    this.pulse.connect(this.pulseGain)

    this._applyWaveMix()

    this._applyFilterAt(t)

    this._applyAmpEnvAt(t,velocity)

    this._applyFilterEnvAt(t)

    this.saw.start(t)
    this.pulse.start(t)

  }

  noteOff(when=this.ctx.currentTime){

    if(!this._isOn)return

    const t = Math.max(this.ctx.currentTime,when)

    this._isOn=false

    const r = this.adsr.r

    try{

      this.amp.gain.cancelScheduledValues(t)

      const current = this.amp.gain.value

      this.amp.gain.setValueAtTime(current,t)

      this.amp.gain.exponentialRampToValueAtTime(
        0.0001,
        t+Math.max(.01,r)
      )

    }catch{}

    const stopT = t + r + .03

    try{this.saw?.stop(stopT)}catch{}
    try{this.pulse?.stop(stopT)}catch{}

    setTimeout(()=>{

      try{this.saw?.disconnect()}catch{}
      try{this.pulse?.disconnect()}catch{}

      this.saw=null
      this.pulse=null

    },(stopT-this.ctx.currentTime)*1000+10)

  }

  // -----------------------
  // INTERNALS
  // -----------------------

  _applyWaveMix(){

    const t=this.ctx.currentTime

    let saw=1
    let pulse=0

    if(this.wave==="pulse"){saw=0;pulse=1}
    if(this.wave==="mix"){saw=.7;pulse=.7}

    this.sawGain.gain.setTargetAtTime(saw,t,.01)
    this.pulseGain.gain.setTargetAtTime(pulse,t,.01)

  }

  _applyFilterAt(t){

    this.filter.setCutoff(this.cutoff)

    this.filter.setResonance(this.resonance)

  }

  _applyAmpEnvAt(t,velocity){

    const {a,d,s}=this.adsr

    const peak=.12+.88*velocity
    const sustain=Math.max(.0001,peak*s)

    this.amp.gain.cancelScheduledValues(t)

    this.amp.gain.setValueAtTime(.0001,t)

    const ta=t+Math.max(.001,a)

    this.amp.gain.exponentialRampToValueAtTime(
      peak,
      ta
    )

    const td=ta+Math.max(.001,d)

    this.amp.gain.exponentialRampToValueAtTime(
      sustain,
      td
    )

  }

 _applyFilterEnvAt(t){

const {a,d,s}=this.adsr

const base = this.cutoff

const maxExtra = 9000 * this.filterEnvAmt

const peak = Math.min(12000, base + maxExtra)

const sustain = Math.min(12000, base + maxExtra * s)

const ta = t + a
const td = ta + d

// base

this.filter.setCutoff(base)

// attack

this.filter.rampCutoff(peak, a)

// decay

setTimeout(()=>{
  this.filter.rampCutoff(sustain, d)
}, a * 1000)

}

    setTimeout(()=>{
      this.filter.setCutoff(sustain)
    },(a+d)*1000)

  }

  _updateDriveCurve(){

    const n=1024

    const curve=new Float32Array(n)

    const k=1+this.driveAmount*4

    for(let i=0;i<n;i++){

      const x=i*2/(n-1)-1

      curve[i]=Math.tanh(k*x)/Math.tanh(k)

    }

    this.drive.curve=curve

  }

  _makePulseWave(duty){

    const N=64

    const real=new Float32Array(N+1)
    const imag=new Float32Array(N+1)

    const d=Math.max(.05,Math.min(.95,duty))

    for(let n=1;n<=N;n++){

      const an=(2/(n*Math.PI))*Math.sin(n*Math.PI*d)

      real[n]=0
      imag[n]=an

    }

    return this.ctx.createPeriodicWave(real,imag)

  }

  _midiToFreq(note){

    return 440*Math.pow(2,(note-69)/12)

  }

}
