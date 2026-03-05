export class JunoFilter {

constructor(ctx){

this.ctx = ctx

this.input = ctx.createGain()
this.output = ctx.createGain()

// saturation stage (Roland style)

this.drive = ctx.createWaveShaper()
this.drive.curve = this._driveCurve()
this.drive.oversample = "2x"

// ladder stages

this.stage1 = ctx.createBiquadFilter()
this.stage2 = ctx.createBiquadFilter()
this.stage3 = ctx.createBiquadFilter()
this.stage4 = ctx.createBiquadFilter()

;[this.stage1,this.stage2,this.stage3,this.stage4]
.forEach(f=>{
f.type="lowpass"
f.Q.value=.707
})

// resonance feedback

this.feedback = ctx.createGain()

// resonance lowpass stabilizer

this.resFilter = ctx.createBiquadFilter()
this.resFilter.type="lowpass"
this.resFilter.frequency.value=12000

// gain compensation

this.comp = ctx.createGain()
this.comp.gain.value = 1

// routing

this.input.connect(this.drive)

this.drive.connect(this.stage1)
this.stage1.connect(this.stage2)
this.stage2.connect(this.stage3)
this.stage3.connect(this.stage4)

this.stage4.connect(this.comp)
this.comp.connect(this.output)

// feedback loop

this.stage4.connect(this.resFilter)
this.resFilter.connect(this.feedback)
this.feedback.connect(this.input)

// defaults

this.cutoff = 2400
this.resonance = .15

this.setCutoff(this.cutoff)
this.setResonance(this.resonance)

}

connect(node){
this.output.connect(node)
}

disconnect(){
try{this.output.disconnect()}catch{}
}

////////////////////////////////////////////////////////////
// CUTOFF
////////////////////////////////////////////////////////////

setCutoff(freq,when=this.ctx.currentTime){

const f=Math.max(80,Math.min(12000,freq))

this.cutoff=f

;[this.stage1,this.stage2,this.stage3,this.stage4]
.forEach(s=>{

s.frequency.setTargetAtTime(
f,
when,
.01
)

})

}

////////////////////////////////////////////////////////////
// AUDIO RAMP
////////////////////////////////////////////////////////////

rampCutoff(target,time,when=this.ctx.currentTime){

const f=Math.max(80,Math.min(12000,target))

const end=when+time

;[this.stage1,this.stage2,this.stage3,this.stage4]
.forEach(s=>{

const p=s.frequency

p.cancelScheduledValues(when)

p.setValueAtTime(p.value,when)

p.linearRampToValueAtTime(
f,
end
)

})

}

////////////////////////////////////////////////////////////
// RESONANCE
////////////////////////////////////////////////////////////

setResonance(res,when=this.ctx.currentTime){

const r=Math.max(0,Math.min(1,res))

this.resonance=r

// resonance feedback

const fb=r*.92

this.feedback.gain.setTargetAtTime(
fb,
when,
.02
)

// gain compensation

const comp=1-(r*.35)

this.comp.gain.setTargetAtTime(
comp,
when,
.02
)

}

////////////////////////////////////////////////////////////
// DRIVE CURVE
////////////////////////////////////////////////////////////

_driveCurve(){

const n=1024

const curve=new Float32Array(n)

for(let i=0;i<n;i++){

const x=i*2/(n-1)-1

curve[i]=Math.tanh(x*1.8)

}

return curve

}

}
