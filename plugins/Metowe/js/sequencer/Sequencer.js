/**
 * Sequencer.js
 *
 * PATCH:
 * - Chord Memory (triad / maj7 / min7 / sus2 / sus4 / add9)
 * - Arpeggiator modes
 */

export class Sequencer {

constructor(synthEngine,onStepChange){

this.synth=synthEngine
this.onStepChange=onStepChange

this.steps=16
this.lanes=6

this.bpm=96
this.swing=0

this.currentStep=0
this.lastPlayedStep=-1
this.isPlaying=false
this.timer=null

this.root="A"
this.baseOctave=4

this.humanizePct=6
this.humanizeTimeMs=8

this.nextStepTime=0
this.scheduleAheadTime=.1
this.lookahead=25

// NEW
this.arpMode="off"
this.chordMemory="triad"

this.grid=Array.from({length:this.lanes},()=>
Array.from({length:this.steps},()=>this._emptyEvent())
)

this.loadDefaultPattern()

}

_emptyEvent(){

return{
on:false,
degree:0,
oct:0,
chord:false,
vel:.85,
mute:false,
chordType:"triad"
}

}

// TEMPO

setBPM(bpm){
this.bpm=Math.max(60,Math.min(200,Number(bpm)||96))
}

setSwing(s){
this.swing=Math.max(0,Math.min(75,Number(s)||0))
}

getStepDuration(){
return (60/this.bpm)/4
}

getSwingOffset(){
return this.getStepDuration()*(this.swing/100)*.5
}

// HUMANIZE

setHumanize(p){
this.humanizePct=Math.max(0,Math.min(30,Number(p)||0))
}

setHumanizeTime(ms){
this.humanizeTimeMs=Math.max(0,Math.min(20,Number(ms)||0))
}

// SCALE

setRoot(letter){

const ok=["A","B","C","D","E","F","G"]

this.root=ok.includes(letter)?letter:"A"

}

setOctave(o){
this.baseOctave=Math.max(2,Math.min(6,Number(o)||4))
}

// EDIT

getEvent(lane,step){
return this.grid?.[lane]?.[step]||this._emptyEvent()
}

toggleStep(lane,step){

const ev=this.getEvent(lane,step)

ev.on=!ev.on

if(!ev.on)ev.chord=false

this.grid[lane][step]=ev

return ev.on

}

toggleMute(lane,step){

const ev=this.getEvent(lane,step)

ev.mute=!ev.mute

this.grid[lane][step]=ev

return ev.mute

}

cycleDegree(lane,step){

const ev=this.getEvent(lane,step)

if(!ev.on)ev.on=true

ev.degree=(ev.degree+1)%7

this.grid[lane][step]=ev

return ev.degree

}

toggleChord(lane,step){

const ev=this.getEvent(lane,step)

if(!ev.on)ev.on=true

ev.chord=!ev.chord

this.grid[lane][step]=ev

return ev.chord

}

clear(){

this.grid=Array.from({length:this.lanes},()=>
Array.from({length:this.steps},()=>this._emptyEvent())
)

}

// MIDI helpers

_rootMidi(){

const map={C:60,D:62,E:64,F:65,G:67,A:69,B:71}

const base=map[this.root]??69

return(this.baseOctave*12)+(base%12)

}

_minorScaleSemis(){

return[0,2,3,5,7,8,10]

}

_degreeToMidi(deg,oct=0){

const root=this._rootMidi()
const scale=this._minorScaleSemis()

const d=((deg%7)+7)%7

return root+scale[d]+oct*12

}

// CHORD MEMORY

_chordIntervals(type){

switch(type){

case"maj7":return[0,4,7,11]
case"min7":return[0,3,7,10]
case"sus2":return[0,2,7]
case"sus4":return[0,5,7]
case"add9":return[0,4,7,14]

default:return[0,3,7]

}

}

_chordForDegree(deg,type,oct){

const root=this._degreeToMidi(deg,oct)

const intervals=this._chordIntervals(type)

return intervals.map(i=>root+i)

}

// ARP

_arp(notes){

if(this.arpMode==="off")return notes

switch(this.arpMode){

case"up":
return notes

case"down":
return[...notes].reverse()

case"updown":
return[...notes,...notes.slice(1,-1).reverse()]

case"random":
return[...notes].sort(()=>Math.random()-.5)

default:
return notes

}

}

// TRANSPORT

start(){

if(this.isPlaying)return

this.synth.resume()

this.isPlaying=true
this.currentStep=0
this.lastPlayedStep=-1

this.nextStepTime=this.synth.getCurrentTime()

this._schedule()

}

stop(){

this.isPlaying=false

this.currentStep=0
this.lastPlayedStep=-1

if(this.timer){

clearTimeout(this.timer)
this.timer=null

}

this.onStepChange?.(-1)

}

togglePlay(){

if(this.isPlaying)this.stop()
else this.start()

}

_schedule(){

if(!this.isPlaying)return

const now=this.synth.getCurrentTime()

while(this.nextStepTime<now+this.scheduleAheadTime){

this._playStep(this.currentStep,this.nextStepTime)

this._advanceStep()

}

this.timer=setTimeout(()=>this._schedule(),this.lookahead)

}

_playStep(step,time){

this.lastPlayedStep=step

let t=time

if(step%2===1)t+=this.getSwingOffset()

const delay=(t-this.synth.getCurrentTime())*1000

setTimeout(()=>{

if(this.isPlaying)this.onStepChange?.(step)

},Math.max(0,delay))

for(let lane=0;lane<this.lanes;lane++){

const ev=this.grid[lane][step]

if(!ev?.on||ev.mute)continue

let tt=t

const jMs=this.humanizeTimeMs

if(jMs>0){
tt+=(Math.random()*2-1)*(jMs/1000)
}

let vel=Math.max(0,Math.min(1,Number(ev.vel??.85)))

const h=this.humanizePct/100

if(h>0){
vel=Math.max(0,Math.min(1,vel*(1+(Math.random()*2-1)*h)))
}

const laneOct = lane<=1?0:lane<=3?1:-1

if(ev.chord){

const notes=this._chordForDegree(
ev.degree,
ev.chordType||this.chordMemory,
ev.oct+laneOct
)

const arp=this._arp(notes)

arp.forEach((n,i)=>{

this.synth.playNoteAt(
n,
tt+i*.03,
vel,
.2
)

})

}else{

const note=this._degreeToMidi(
ev.degree,
ev.oct+laneOct
)

this.synth.playNoteAt(note,tt,vel,.18)

}

}

}

_advanceStep(){

this.nextStepTime+=this.getStepDuration()

this.currentStep=(this.currentStep+1)%this.steps

}

// DEFAULT PATTERN

loadDefaultPattern(){

this.clear()

const arp=[0,2,4,6,0,2,4,6,0,2,5,4,0,2,4,6]

for(let s=0;s<16;s++){

this.grid[0][s]={
on:true,
degree:arp[s],
oct:0,
chord:false,
vel:.9,
mute:false
}

}

const chordDegrees=[0,5,3,4]

;[0,4,8,12].forEach((s,i)=>{

this.grid[2][s]={
on:true,
degree:chordDegrees[i],
oct:-1,
chord:true,
vel:.8,
mute:false
}

})

;[3,7,11,15].forEach(s=>{

this.grid[4][s]={
on:true,
degree:4,
oct:0,
chord:false,
vel:.55,
mute:false
}

})

}

}
