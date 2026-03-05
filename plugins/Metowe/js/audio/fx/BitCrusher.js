export class Bitcrusher{

constructor(ctx){

this.input=ctx.createGain()
this.output=ctx.createGain()

this.processor=ctx.createScriptProcessor(512,1,1)

let bits=6
let normFreq=0.5
let phaser=0
let last=0

this.processor.onaudioprocess=e=>{

const input=e.inputBuffer.getChannelData(0)
const output=e.outputBuffer.getChannelData(0)

for(let i=0;i<input.length;i++){

phaser+=normFreq

if(phaser>=1){

phaser-=1

last=Math.round(input[i]*Math.pow(2,bits))/Math.pow(2,bits)

}

output[i]=last

}

}

this.input.connect(this.processor)
this.processor.connect(this.output)

}

connect(node){

this.output.connect(node)

}

}
