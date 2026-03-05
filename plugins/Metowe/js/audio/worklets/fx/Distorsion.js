export class Distortion{

constructor(ctx){

this.input=ctx.createGain()
this.output=ctx.createGain()

this.wave=ctx.createWaveShaper()

this.input.connect(this.wave)
this.wave.connect(this.output)

this.setDrive(0.2)

}

curve(amount){

const n=44100

const curve=new Float32Array(n)

for(let i=0;i<n;i++){

const x=i*2/n-1

curve[i]=(1+amount)*x/(1+amount*Math.abs(x))

}

return curve

}

setDrive(v){

this.wave.curve=this.curve(v*10)

}

connect(node){

this.output.connect(node)

}

}
