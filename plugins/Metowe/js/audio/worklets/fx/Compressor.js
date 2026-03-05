export class Compressor{

constructor(ctx){

this.input=ctx.createDynamicsCompressor()
this.output=this.input

this.input.threshold.value=-18
this.input.ratio.value=4

}

connect(node){

this.output.connect(node)

}

}
