/**
 * SynthEngine.js
 * Polyphonic synth engine
 *
 * Features
 * - polyphony
 * - unison
 * - glide / portamento
 * - Juno filter compatibility
 * - chorus FX
 * - sequencer scheduling
 */

import { Voice } from './Voice.js'
import { JunoChorus } from '../fx/JunoChorus.js'

export class SynthEngine {

constructor(){

this.ctx = null

this.polyphony = 8
this.activeVoices = []

this.master = null
this.chorus = null

// UNISON
this.unisonVoices = 1
this.unisonDetune = 10

// GLIDE
this.glideTime = .04

// SYNTH PARAMS
this.oscWave = "saw"
this.pwmPct = 50

this.cutoff = 2400
this.resonance = .15
this.filterEnvAmt = .35

this.adsrMs = { a:10, d:250, s:70, r:500 }

this.driveAmount = 2

// FX parameters
this.fx = {

chorusMix:.25,
crushAmt:0,
driveMix:0,
compAmt:0,
reverbMix:0

}

}

async init(){

if(this.ctx) return

this.ctx =
new (window.AudioContext||window.webkitAudioContext)()

// MASTER

this.master = this.ctx.createGain()
this.master.gain.value = .9

// CHORUS

this.chorus = new JunoChorus(this.ctx)
this.chorus.setMix(this.fx.chorusMix)

// routing

this.master.connect(this.chorus.input)
this.chorus.connect(this.ctx.destination)

}

resume(){

if(this.ctx?.state==="suspended")
this.ctx.resume()

}

getCurrentTime(){

return this.ctx?.currentTime || 0

}

//////////////////////////////////////////////////////////////////
// UNISON
//////////////////////////////////////////////////////////////////

setUnisonVoices(n){

this.unisonVoices =
Math.max(1,Math.min(6,parseInt(n)||1))

}

setUnisonDetune(c){

this.unisonDetune =
Math.max(0,Math.min(50,Number(c)||0))

}

//////////////////////////////////////////////////////////////////
// GLIDE
//////////////////////////////////////////////////////////////////

setGlide(sec){

this.glideTime =
Math.max(0,Math.min(.3,Number(sec)||0))

this._applyToActiveVoices(v=>{
v.setGlide?.(this.glideTime)
})

}

//////////////////////////////////////////////////////////////////
// DRIVE
//////////////////////////////////////////////////////////////////

setDrive(amount){

this.driveAmount =
Math.max(0,Number(amount)||0)

this._applyToActiveVoices(v=>{
v.setDrive?.(this.driveAmount)
})

}

//////////////////////////////////////////////////////////////////
// OSC
//////////////////////////////////////////////////////////////////

setOscWave(mode){

const m = String(mode||"").toLowerCase()

const ok =
(m==="saw"||m==="pulse"||m==="mix")
? m
: "saw"

this.oscWave = ok

this._applyToActiveVoices(v=>{
v.setWave?.(this.oscWave)
})

}

setPWM(pct){

let x = Number(pct)

if(!Number.isFinite(x)) x=50

if(x<=1.001 && x>=0) x*=100

x=Math.max(0,Math.min(100,x))

this.pwmPct = x

this._applyToActiveVoices(v=>{
v.setPWM?.(this.pwmPct)
})

}

//////////////////////////////////////////////////////////////////
// FILTER
//////////////////////////////////////////////////////////////////

setCutoff(hz){

const v =
Math.max(80,
Math.min(12000,Number(hz)||2400))

this.cutoff = v

this._applyToActiveVoices(v=>{
v.setFilter?.(
this.cutoff,
this.resonance,
this.filterEnvAmt
)
})

}

setResonance(q){

const v =
Math.max(0,
Math.min(1,Number(q)||0))

this.resonance = v

this._applyToActiveVoices(v=>{
v.setFilter?.(
this.cutoff,
this.resonance,
this.filterEnvAmt
)
})

}

setFilterEnv(amt){

const v =
Math.max(0,
Math.min(1,Number(amt)||0))

this.filterEnvAmt = v

this._applyToActiveVoices(v=>{
v.setFilter?.(
this.cutoff,
this.resonance,
this.filterEnvAmt
)
})

}

//////////////////////////////////////////////////////////////////
// ADSR
//////////////////////////////////////////////////////////////////

setADSR(a,d,s,r){

const A=Math.max(0,Math.min(2000,a||0))
const D=Math.max(0,Math.min(2000,d||0))
const S=Math.max(0,Math.min(100,s||0))
const R=Math.max(0,Math.min(4000,r||0))

this.adsrMs={a:A,d:D,s:S,r:R}

this._applyToActiveVoices(v=>{
v.setADSR?.(A,D,S,R)
})

}

//////////////////////////////////////////////////////////////////
// FX
//////////////////////////////////////////////////////////////////

setChorusMix(v){

this.fx.chorusMix = this._clamp01(v)

if(this.chorus)
this.chorus.setMix(this.fx.chorusMix)

}

setCrushAmt(v){this.fx.crushAmt=this._clamp01(v)}
setDriveMix(v){this.fx.driveMix=this._clamp01(v)}
setCompAmt(v){this.fx.compAmt=this._clamp01(v)}
setReverbMix(v){this.fx.reverbMix=this._clamp01(v)}

//////////////////////////////////////////////////////////////////
// VOICE MANAGEMENT
//////////////////////////////////////////////////////////////////

_stealOneVoice(){

if(this.activeVoices.length===0)
return null

let idx=0
let oldest=this.activeVoices[0].startedAt

for(let i=1;i<this.activeVoices.length;i++){

if(this.activeVoices[i].startedAt<oldest){

oldest=this.activeVoices[i].startedAt
idx=i

}

}

const stolen=this.activeVoices.splice(idx,1)[0]

try{stolen.voice.noteOff()}catch{}

return stolen

}

_configureNewVoice(v){

v.setDrive?.(this.driveAmount)
v.setWave?.(this.oscWave)
v.setPWM?.(this.pwmPct)

v.setFilter?.(
this.cutoff,
this.resonance,
this.filterEnvAmt
)

v.setADSR?.(
this.adsrMs.a,
this.adsrMs.d,
this.adsrMs.s,
this.adsrMs.r
)

v.setGlide?.(this.glideTime)

}

_allocateVoice(note){

while(this.activeVoices.length>=this.polyphony){

this._stealOneVoice()

}

const v = new Voice(this.ctx)

this._configureNewVoice(v)

v.connect(this.master)

const entry={
voice:v,
note,
startedAt:this.getCurrentTime()
}

this.activeVoices.push(entry)

return entry

}

_applyToActiveVoices(fn){

for(const e of this.activeVoices){

try{fn(e.voice)}catch{}

}

}

_clamp01(x){

return Math.max(0,Math.min(1,Number(x)||0))

}

//////////////////////////////////////////////////////////////////
// NOTE API
//////////////////////////////////////////////////////////////////

noteOn(note,vel=1){

this.resume()

const velocity=this._clamp01(vel)

const u=this.unisonVoices
const center=(u-1)/2

const created=[]

for(let i=0;i<u;i++){

const entry=this._allocateVoice(note)

const spread=(i-center)*this.unisonDetune

try{
entry.voice.saw?.detune
?.setValueAtTime(
spread,
this.getCurrentTime()
)
}catch{}

try{
entry.voice.pulse?.detune
?.setValueAtTime(
spread,
this.getCurrentTime()
)
}catch{}

entry.voice.noteOn(note,velocity)

created.push(entry.voice)

}

return created

}

noteOff(note){

const remaining=[]

for(const e of this.activeVoices){

if(e.note===note){

try{e.voice.noteOff()}catch{}

}else{

remaining.push(e)

}

}

this.activeVoices=remaining

}

//////////////////////////////////////////////////////////////////
// SEQUENCER SCHEDULING
//////////////////////////////////////////////////////////////////

playNoteAt(note,time,vel=1,duration=.2){

const t=Math.max(
this.getCurrentTime(),
time
)

const delay=(t-this.getCurrentTime())*1000

setTimeout(()=>{

const voices=this.noteOn(note,vel)

setTimeout(()=>{

voices.forEach(v=>{
try{v.noteOff()}catch{}
})

},duration*1000)

},Math.max(0,delay))

}

playChordAt(notes,time,vel=1,duration=.3){

(notes||[])
.forEach(n=>
this.playNoteAt(n,time,vel,duration)
)

}

}
