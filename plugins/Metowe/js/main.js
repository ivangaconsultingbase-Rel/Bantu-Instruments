import {SynthEngine} from "./audio/SynthEngine.js"
import {Sequencer} from "./sequencer/Sequencer.js"
import {UI} from "./ui/UI.js"

const synth=new SynthEngine()

let ui

const sequencer=new Sequencer(
synth,
(step)=>ui.onStepChange(step)
)

ui=new UI(synth,sequencer)

async function boot(){

await synth.init()

ui.init()

}

boot()
