export class JunoFilter {

  constructor(ctx){

    this.ctx = ctx

    this.input = ctx.createGain()
    this.output = ctx.createGain()

    this.drive = ctx.createWaveShaper()
    this.drive.curve = this._driveCurve()

    this.stage1 = ctx.createBiquadFilter()
    this.stage2 = ctx.createBiquadFilter()
    this.stage3 = ctx.createBiquadFilter()
    this.stage4 = ctx.createBiquadFilter()

    ;[this.stage1,this.stage2,this.stage3,this.stage4].forEach(f=>{
      f.type = "lowpass"
    })

    this.feedback = ctx.createGain()

    this.input.connect(this.drive)

    this.drive.connect(this.stage1)
    this.stage1.connect(this.stage2)
    this.stage2.connect(this.stage3)
    this.stage3.connect(this.stage4)

    this.stage4.connect(this.output)

    this.stage4.connect(this.feedback)
    this.feedback.connect(this.input)

    this.setCutoff(2400)
    this.setResonance(0.15)
  }

  connect(node){
    this.output.connect(node)
  }

  setCutoff(freq){

    const f = Math.max(80, Math.min(12000,freq))

    ;[this.stage1,this.stage2,this.stage3,this.stage4].forEach(s=>{
      s.frequency.setTargetAtTime(f,this.ctx.currentTime,0.01)
    })
  }

  setResonance(res){

    const r = Math.max(0,Math.min(1,res))

    this.feedback.gain.setTargetAtTime(r*0.8,this.ctx.currentTime,0.01)
  }

  _driveCurve(){

    const n = 512
    const curve = new Float32Array(n)

    for(let i=0;i<n;i++){
      const x = (i*2/n)-1
      curve[i] = Math.tanh(x*2)
    }

    return curve
  }

}
