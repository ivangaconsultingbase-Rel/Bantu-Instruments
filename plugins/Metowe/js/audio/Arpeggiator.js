export class Arpeggiator {

constructor(synth){

this.synth = synth

this.notes = []

this.mode = "up"

this.index = 0

this.octaves = 1

}

setMode(mode){

this.mode = mode

}

noteOn(note){

if(!this.notes.includes(note)) this.notes.push(note)

this.notes.sort((a,b)=>a-b)

}

noteOff(note){

this.notes = this.notes.filter(n=>n!==note)

}

nextNote(){

if(this.notes.length===0) return null

let note

switch(this.mode){

case "up":

note = this.notes[this.index % this.notes.length]

break

case "down":

note = this.notes[this.notes.length-1-(this.index%this.notes.length)]

break

case "random":

note = this.notes[Math.floor(Math.random()*this.notes.length)]

break

case "updown":

let cycle = this.notes.concat([...this.notes].reverse())

note = cycle[this.index % cycle.length]

break

}

this.index++

return note

}

}
