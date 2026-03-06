import {MinorScale} from "./Scale.js"

export class Sequencer{

constructor(synth,onStep){

this.synth=synth
this.onStep=onStep

this.steps=16
this.currentStep=0
this.isPlaying=false

this.bpm=90

this.root=48

this.pattern=[
0,2,4,6,
2,4,6,9,
0,2,4,6,
2,4,6,9
]

}

note(deg){

return this.root+MinorScale[deg%MinorScale.length]

}

getStepDuration(){

return(60/this.bpm)/4

}

playStep(step,time){

const note=this.note(this.pattern[step])

this.synth.playNote(note,0.8,time)
this.synth.playNote(note+3,0.6,time)
this.synth.playNote(note+7,0.6,time)

}

start(){

if(this.isPlaying)return

this.synth.resume()

this.isPlaying=true

this.currentStep=0

this.nextTime=this.synth.getCurrentTime()

this.schedule()

}

schedule(){

if(!this.isPlaying)return

const now=this.synth.getCurrentTime()

while(this.nextTime<now+0.1){

this.playStep(this.currentStep,this.nextTime)

this.onStep(this.currentStep)

this.nextTime+=this.getStepDuration()

this.currentStep=(this.currentStep+1)%this.steps

}

this.timer=setTimeout(()=>this.schedule(),25)

}

stop(){

this.isPlaying=false
clearTimeout(this.timer)

}

}
