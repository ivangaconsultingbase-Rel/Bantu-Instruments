import { SynthEngine } from "./audio/SynthEngine.js";
import { Sequencer } from "./sequencer/Sequencer.js";
import { UI } from "./ui/UI.js";

const synth = new SynthEngine();
await synth.init();

let ui = null;

const seq = new Sequencer(synth, (step) => {
  if (ui) ui.onStepChange(step);
});

ui = new UI(synth, seq);

// iOS/Safari: unlock audio au premier geste
window.addEventListener("pointerdown", () => synth.resume(), { once: true });

ui.init();

// (optionnel) Exemple: activer l’arp global par défaut
// seq.setArpMode("up");        // off | up | down | updown | random
// seq.setArpNotesPerStep(4);   // 1..6
// seq.setArpGate(0.85);        // 0.1..1
