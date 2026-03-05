import { SynthEngine } from "./audio/SynthEngine.js";
import { Sequencer } from "./sequencer/Sequencer.js";
import { UI } from "./ui/UI.js";

const synth = new SynthEngine();
await synth.init();

const seq = new Sequencer(synth, (step) => ui.onStepChange(step));

const ui = new UI(synth, seq);

// Important sur mobile : unlock audio au premier geste
window.addEventListener("pointerdown", () => synth.resume(), { once: true });

ui.init();
