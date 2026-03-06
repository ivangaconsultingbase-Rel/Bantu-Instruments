export class Voice{

constructor(ctx,out,note,vel,time,length,engine){

this.ctx=ctx
this.out=out

this.note=note
this.vel=vel

this.time=time||ctx.currentTime
this.length=length

this.engine=engine

}

freq(n){

return 440*Math.pow(2,(n-69)/12)

}

start(){

const osc=this.ctx.createOscillator()

osc.type=this.engine.wave

osc.frequency.value=this.freq(this.note)

const filter=this.ctx.createBiquadFilter()

filter.type="lowpass"
filter.frequency.value=this.engine.cutoff
filter.Q.value=this.engine.res*12

const gain=this.ctx.createGain()

gain.gain.setValueAtTime(0.0001,this.time)
gain.gain.linearRampToValueAtTime(this.vel,this.time+0.01)
gain.gain.exponentialRampToValueAtTime(0.0001,this.time+this.length)

osc.connect(filter)
filter.connect(gain)
gain.connect(this.out)

osc.start(this.time)
osc.stop(this.time+this.length)

}

}
