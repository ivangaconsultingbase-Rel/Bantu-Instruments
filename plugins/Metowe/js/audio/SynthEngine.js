import {Voice} from "./Voice.js"

export class SynthEngine{

constructor(){

this.ctx=null

this.master=null

this.voices=[]

this.maxVoices=8

this.wave="sawtooth"

this.cutoff=8000
this.res=0.3

}

async init(){

this.ctx=new(window.AudioContext||window.webkitAudioContext)()

this.master=this.ctx.createGain()
this.master.gain.value=0.8
this.master.connect(this.ctx.destination)

}

resume(){

if(this.ctx.state==="suspended")
this.ctx.resume()

}

getCurrentTime(){

return this.ctx.currentTime

}

playNote(note,velocity,time,length=0.4){

const voice=new Voice(
this.ctx,
this.master,
note,
velocity,
time,
length,
this
)

voice.start()

this.voices.push(voice)

if(this.voices.length>this.maxVoices)
this.voices.shift()

}

setCutoff(v){this.cutoff=v}
setRes(v){this.res=v}
setWave(v){this.wave=v}

}
