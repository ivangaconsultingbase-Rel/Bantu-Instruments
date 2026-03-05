export class JunoChorus {

constructor(ctx){

this.ctx = ctx

this.input = ctx.createGain()
this.output = ctx.createGain()

this.delayL = ctx.createDelay(0.05)
this.delayR = ctx.createDelay(0.05)

this.lfo = ctx.createOscillator()
this.lfo.type = "triangle"

this.depth = ctx.createGain()

this.mix = ctx.createGain()
this.dry = ctx.createGain()

// routing

this.input.connect(this.dry)
this.dry.connect(this.output)

this.input.connect(this.delayL)
this.input.connect(this.delayR)

this.delayL.connect(this.mix)
this.delayR.connect(this.mix)

this.mix.connect(this.output)

// LFO

this.lfo.connect(this.depth)
this.depth.connect(this.delayL.delayTime)
this.depth.connect(this.delayR.delayTime)

this.lfo.start()

// default Juno values

this.setMode(1)

}

connect(node){
this.output.connect(node)
}

setMix(v){

const m=Math.max(0,Math.min(1,v))

this.mix.gain.value=m
this.dry.gain.value=1-m

}

setMode(mode){

// Mode I / II style

if(mode===1){

this.lfo.frequency.value=.35
this.depth.gain.value=.003

this.delayL.delayTime.value=.015
this.delayR.delayTime.value=.02

}

if(mode===2){

this.lfo.frequency.value=.6
this.depth.gain.value=.006

this.delayL.delayTime.value=.012
this.delayR.delayTime.value=.018

}

}

}
