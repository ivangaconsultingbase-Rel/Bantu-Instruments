export class Chorus{

constructor(ctx){

this.input=ctx.createGain()
this.output=ctx.createGain()

this.delay=ctx.createDelay()

this.lfo=ctx.createOscillator()

this.depth=ctx.createGain()

this.lfo.frequency.value=0.25

this.depth.gain.value=0.004

this.lfo.connect(this.depth)

this.depth.connect(this.delay.delayTime)

this.input.connect(this.delay)

this.delay.connect(this.output)

this.lfo.start()

}

connect(node){

this.output.connect(node)

}

}
