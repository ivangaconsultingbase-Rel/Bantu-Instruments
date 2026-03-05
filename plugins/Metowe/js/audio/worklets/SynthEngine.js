import {Voice} from "./Voice.js"

import {Chorus} from "../fx/Chorus.js"
import {Distortion} from "../fx/Distortion.js"
import {Compressor} from "../fx/Compressor.js"
import {Bitcrusher} from "../fx/Bitcrusher.js"
import {Reverb} from "../fx/Reverb.js"

export class SynthEngine{

constructor(){

this.ctx=null

this.master=null

this.voices=[]

this.maxVoices=8

this.wave="sawtooth"

this.cutoff=8000
this.res=0.3

// FX

this.chorus=null
this.distortion=null
this.bitcrusher=null
this.compressor=null
this.reverb=null

}

async init(){

this.ctx=new(window.AudioContext||window.webkitAudioContext)()

this.master=this.ctx.createGain()
this.master.gain.value=0.8

// FX chain

this.chorus=new Chorus(this.ctx)
this.distortion=new Distortion(this.ctx)
this.bitcrusher=new Bitcrusher(this.ctx)
this.compressor=new Compressor(this.ctx)
this.reverb=new Reverb(this.ctx)

// connect

this.chorus.connect(this.distortion.input)

this.distortion.connect(this.bitcrusher.input)

this.bitcrusher.connect(this.compressor.input)

this.compressor.connect(this.reverb.input)

this.reverb.connect(this.master)

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
this.chorus.input,
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
