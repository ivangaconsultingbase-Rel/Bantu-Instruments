/**
 * UI.js
 * Interface AKOMGA Synth
 * - Keyboard
 * - Sequencer UI (6 lanes)
 * - Step display: degree + chord symbol
 */

export class UI {

constructor(synth, sequencer){
this.synth = synth
this.sequencer = sequencer

this.kbKeys = ["A","S","D","F","G","H","J","K"]
this.kbDown = new Set()

this.longPressTimer = null
this.longPressTriggered = false
}

$(id){ return document.getElementById(id) }

init(){
this.renderKeyboard()
this.renderSequencer()
this.bindControls()
this.bindKeyboard()
this.syncPattern()
}

////////////////////////////////////////////////////
KEYBOARD
////////////////////////////////////////////////////

renderKeyboard(){

const kb = this.$("keyboard")
kb.innerHTML = ""

this.kbKeys.forEach((key,i)=>{

const degree = (i<7)? i+1 : 1

const el = document.createElement("button")
el.className="kkey"
el.dataset.key = key
el.dataset.degree = degree

el.innerHTML = `
<div class="kkey-top">
<span>${key}</span>
<span>${degree}</span>
</div>
<div class="kkey-bot">MIN</div>
`

kb.appendChild(el)

})

kb.addEventListener("pointerdown",e=>{
const key = e.target.closest(".kkey")
if(!key) return

const degree = parseInt(key.dataset.degree)
const midi = this.sequencer._degreeToMidi(degree-1,0)

this.synth.noteOn(midi,1)
key.classList.add("active")
})

kb.addEventListener("pointerup",e=>{
const key = e.target.closest(".kkey")
if(!key) return

const degree = parseInt(key.dataset.degree)
const midi = this.sequencer._degreeToMidi(degree-1,0)

this.synth.noteOff(midi)
key.classList.remove("active")
})

}

////////////////////////////////////////////////////
SEQUENCER RENDER
////////////////////////////////////////////////////

renderSequencer(){

const grid = this.$("sequencer-grid")
grid.innerHTML=""

for(let lane=0; lane<this.sequencer.lanes; lane++){

const row = document.createElement("div")
row.className="seq-row"

const label = document.createElement("div")
label.className="seq-row-label"
label.textContent = lane+1
row.appendChild(label)

const steps = document.createElement("div")
steps.className="seq-steps"

for(let step=0; step<this.sequencer.steps; step++){

const btn = document.createElement("button")
btn.className="seq-step"
btn.dataset.lane = lane
btn.dataset.step = step

if(step%4===0) btn.classList.add("beat-marker")

const txt = document.createElement("div")
txt.className="txt"

btn.appendChild(txt)

steps.appendChild(btn)

}

row.appendChild(steps)
grid.appendChild(row)

}

this.bindStepGestures()

}

////////////////////////////////////////////////////
STEP GESTURES
////////////////////////////////////////////////////

bindStepGestures(){

const grid = this.$("sequencer-grid")

grid.addEventListener("pointerdown",e=>{

const step = e.target.closest(".seq-step")
if(!step) return

const lane = parseInt(step.dataset.lane)
const pos = parseInt(step.dataset.step)

this.longPressTriggered=false

this.longPressTimer = setTimeout(()=>{
this.longPressTriggered=true

this.sequencer.toggleMute(lane,pos)

this.updateStepVisual(step,lane,pos)

},350)

})

grid.addEventListener("pointerup",e=>{

const step = e.target.closest(".seq-step")
if(!step) return

clearTimeout(this.longPressTimer)

const lane = parseInt(step.dataset.lane)
const pos = parseInt(step.dataset.step)

if(this.longPressTriggered){
this.longPressTriggered=false
return
}

const now = performance.now()

if(this.lastTap &&
this.lastTap.lane===lane &&
this.lastTap.step===pos &&
(now-this.lastTap.time)<250){

this.sequencer.toggleChord(lane,pos)

}else{

this.sequencer.toggleStep(lane,pos)

}

this.lastTap={lane,step:pos,time:now}

this.updateStepVisual(step,lane,pos)

})

}

////////////////////////////////////////////////////
STEP VISUAL
////////////////////////////////////////////////////

updateStepVisual(el,lane,step){

const ev = this.sequencer.getEvent(lane,step)
const txt = el.querySelector(".txt")

el.classList.toggle("active",ev.on)
el.classList.toggle("chord",ev.chord)
el.classList.toggle("muted",ev.mute)

if(!ev.on){
txt.textContent=""
return
}

let label = (ev.degree+1).toString()

if(ev.chord) label += "△"

if(ev.mute) label="×"

txt.textContent = label

}

syncPattern(){

const grid = this.$("sequencer-grid")

for(let lane=0; lane<this.sequencer.lanes; lane++){
for(let step=0; step<this.sequencer.steps; step++){

const el = grid.querySelector(`.seq-step[data-lane="${lane}"][data-step="${step}"]`)
this.updateStepVisual(el,lane,step)

}
}

}

////////////////////////////////////////////////////
PLAY HEAD
////////////////////////////////////////////////////

onStepChange(step){

document.querySelectorAll(".seq-step.playing")
.forEach(e=>e.classList.remove("playing"))

if(step<0) return

for(let lane=0; lane<this.sequencer.lanes; lane++){

const el = document.querySelector(
`.seq-step[data-lane="${lane}"][data-step="${step}"]`
)

if(el) el.classList.add("playing")

}

const led = this.$("led")
if(led){
led.classList.add("active")
setTimeout(()=>led.classList.remove("active"),50)
}

}

////////////////////////////////////////////////////
CONTROLS
////////////////////////////////////////////////////

bindControls(){

this.$("play-btn").onclick=()=>{
this.sequencer.togglePlay()
this.$("play-btn").classList.toggle("active",this.sequencer.isPlaying)
}

this.$("clear-btn").onclick=()=>{
this.sequencer.clear()
this.syncPattern()
}

this.$("bpm").oninput=e=>{
const bpm=parseInt(e.target.value)
this.sequencer.setBPM(bpm)
this.$("bpm-val").textContent=bpm
this.$("bpm-display").textContent=bpm
}

this.$("swing").oninput=e=>{
const v=parseInt(e.target.value)
this.sequencer.setSwing(v)
this.$("swing-val").textContent=v+"%"
this.$("swing-display").textContent=v
}

this.$("humanize").oninput=e=>{
const v=parseInt(e.target.value)
this.sequencer.setHumanize(v)
this.$("humanize-val").textContent=v+"%"
}

this.$("humanize-time").oninput=e=>{
const v=parseInt(e.target.value)
this.sequencer.setHumanizeTime(v)
this.$("humanize-time-val").textContent=v+"ms"
}

this.$("root").onchange=e=>{
this.sequencer.setRoot(e.target.value)
this.$("scale-display").textContent=e.target.value+" MIN"
}

this.$("oct").oninput=e=>{
const v=parseInt(e.target.value)
this.sequencer.setOctave(v)
this.$("oct-val").textContent=v
}

}

////////////////////////////////////////////////////
KEYBOARD COMPUTER
////////////////////////////////////////////////////

bindKeyboard(){

document.addEventListener("keydown",e=>{

if(e.code==="Space"){
e.preventDefault()
this.$("play-btn").click()
return
}

const key=e.key.toUpperCase()

const idx=this.kbKeys.indexOf(key)
if(idx<0) return
if(this.kbDown.has(key)) return

this.kbDown.add(key)

const degree=(idx<7)?idx:0
const midi=this.sequencer._degreeToMidi(degree,0)

this.synth.noteOn(midi,1)

const el=this.$("keyboard")
.querySelector(`[data-key="${key}"]`)

el?.classList.add("active")

})

document.addEventListener("keyup",e=>{

const key=e.key.toUpperCase()

if(!this.kbDown.has(key)) return
this.kbDown.delete(key)

const idx=this.kbKeys.indexOf(key)
if(idx<0) return

const degree=(idx<7)?idx:0
const midi=this.sequencer._degreeToMidi(degree,0)

this.synth.noteOff(midi)

const el=this.$("keyboard")
.querySelector(`[data-key="${key}"]`)

el?.classList.remove("active")

})

}

}
