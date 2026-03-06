import { SynthEngine } from "./audio/SynthEngine.js";
import { Sequencer } from "./sequencer/Sequencer.js";
import { UI } from "./ui/UI.js";

const synth = new SynthEngine();
let ui = null;

const seq = new Sequencer(synth, (step) => {
  ui?.onStep(step);
});

ui = new UI(synth, seq);

async function boot(){
  await synth.init();
  ui.init();
}

boot();
