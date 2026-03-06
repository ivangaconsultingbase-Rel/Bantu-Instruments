export class UI{

constructor(synth,seq){

this.synth=synth
this.seq=seq

this.steps=[]

}

init(){

this.buildSequencer()

document.getElementById("play").onclick=()=>{

if(this.seq.isPlaying)
this.seq.stop()
else
this.seq.start()

}

document.getElementById("stop").onclick=()=>this.seq.stop()

document.getElementById("cutoff").oninput=e=>{
this.synth.setCutoff(e.target.value)
}

document.getElementById("res").oninput=e=>{
this.synth.setRes(e.target.value)
}

document.getElementById("wave").onchange=e=>{
this.synth.setWave(e.target.value)
}

}

buildSequencer(){

const grid=document.getElementById("seq-grid")

for(let i=0;i<16;i++){

const step=document.createElement("div")

step.className="step active"

step.onclick=()=>{

step.classList.toggle("active")

}

grid.appendChild(step)

this.steps.push(step)

}

}

onStepChange(step){

this.steps.forEach(s=>s.classList.remove("playing"))

if(step>=0)
this.steps[step].classList.add("playing")

}

}
