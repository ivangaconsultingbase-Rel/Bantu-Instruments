import { Voice } from "./Voice.js";

import { Chorus } from "../fx/Chorus.js";
import { Distortion } from "../fx/Distortion.js";
import { Bitcrusher } from "../fx/Bitcrusher.js";
import { Compressor } from "../fx/Compressor.js";
import { Reverb } from "../fx/Reverb.js";

export class SynthEngine {
  constructor(){
    this.ctx = null;

    // master
    this.master = null;

    // params
    this.maxVoices = 10;

    this.osc1Type = "sawtooth";
    this.osc2Type = "square";
    this.detune = 7; // cents

    this.subMix = 0.30;   // 0..1
    this.noiseMix = 0.10; // 0..1

    this.cutoff = 8000;
    this.res = 0.25;      // 0..1
    this.envAmt = 0.40;   // 0..1

    // ADSR (seconds)
    this.a = 0.010;
    this.d = 0.250;
    this.s = 0.65;        // 0..1
    this.r = 0.350;

    // FX
    this.chorus = null;
    this.drive = null;
    this.crush = null;
    this.comp = null;
    this.reverb = null;

    // input point for voices
    this.input = null;
  }

  async init(){
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;

    // FX chain (placeholders, same API you can keep for GPL ports)
    this.chorus = new Chorus(this.ctx);
    this.drive  = new Distortion(this.ctx);
    this.crush  = new Bitcrusher(this.ctx);
    this.comp   = new Compressor(this.ctx);
    this.reverb = new Reverb(this.ctx);

    this.chorus.connect(this.drive.input);
    this.drive.connect(this.crush.input);
    this.crush.connect(this.comp.input);
    this.comp.connect(this.reverb.input);
    this.reverb.connect(this.master);

    this.master.connect(this.ctx.destination);

    // voices go into chorus input
    this.input = this.chorus.input;
  }

  async resume(){
    if (this.ctx?.state === "suspended") {
      await this.ctx.resume();
    }
  }

  now(){
    return this.ctx?.currentTime || 0;
  }

  // Called by UI
  setMaster01(v){ this.master.gain.value = Math.max(0, Math.min(1, v)); }

  setOsc1Type(t){ this.osc1Type = t; }
  setOsc2Type(t){ this.osc2Type = t; }
  setDetuneCents(c){ this.detune = Math.max(0, Math.min(20, Number(c)||0)); }

  setSubMix01(v){ this.subMix = Math.max(0, Math.min(1, Number(v)||0)); }
  setNoiseMix01(v){ this.noiseMix = Math.max(0, Math.min(1, Number(v)||0)); }

  setCutoff(v){ this.cutoff = Math.max(200, Math.min(12000, Number(v)||8000)); }
  setRes01(v){ this.res = Math.max(0, Math.min(1, Number(v)||0)); }
  setEnvAmt01(v){ this.envAmt = Math.max(0, Math.min(1, Number(v)||0)); }

  setADSR(aMs, dMs, sPct, rMs){
    this.a = Math.max(0, (Number(aMs)||0)/1000);
    this.d = Math.max(0, (Number(dMs)||0)/1000);
    this.s = Math.max(0, Math.min(1, (Number(sPct)||0)/100));
    this.r = Math.max(0, (Number(rMs)||0)/1000);
  }

  // FX controls (0..1)
  setChorus01(v){ this.chorus.setMix(Math.max(0,Math.min(1,Number(v)||0))); }
  setDrive01(v){ this.drive.setDrive(Math.max(0,Math.min(1,Number(v)||0))); }
  setCrush01(v){ this.crush.setAmount(Math.max(0,Math.min(1,Number(v)||0))); }
  setComp01(v){ this.comp.setAmount(Math.max(0,Math.min(1,Number(v)||0))); }
  setReverb01(v){ this.reverb.setMix(Math.max(0,Math.min(1,Number(v)||0))); }

  // poly note
  noteOn(midi, velocity=0.8, time=0, length=0.30){
    if (!this.ctx) return;
    const t = time > 0 ? time : this.now();
    const v = Math.max(0, Math.min(1, Number(velocity)||0));

    const voice = new Voice(this.ctx, this.input, this, midi, v, t, length);
    voice.start();
  }
}
