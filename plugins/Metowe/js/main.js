import { SynthEngine } from "./audio/SynthEngine.js";
import { Sequencer } from "./sequencer/Sequencer.js";
import { UI } from "./ui/UI.js";

async function boot(){

const synth = new SynthEngine();
await synth.init();

let ui;

const seq = new Sequencer(
synth,
(step)=>ui?.onStepChange(step)
);

ui = new UI(synth,seq);

// unlock audio mobile
window.addEventListener(
"pointerdown",
()=>synth.resume(),
{once:true}
);

ui.init();

}

boot();
