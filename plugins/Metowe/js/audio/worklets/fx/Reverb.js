export class Reverb{

constructor(ctx){

this.input=ctx.createGain()
this.output=ctx.createGain()

this.convolver=ctx.createConvolver()

this.input.connect(this.convolver)
this.convolver.connect(this.output)

this.convolver.buffer=this.impulse(ctx)

}

impulse(ctx){

const length=ctx.sampleRate*2

const impulse=ctx.createBuffer(2,length,ctx.sampleRate)

for(let c=0;c<2;c++){

const channel=impulse.getChannelData(c)

for(let i=0;i<length;i++){

channel[i]=(Math.random()*2-1)*(1-i/length)

}

}

return impulse

}

connect(node){

this.output.connect(node)

}

}
