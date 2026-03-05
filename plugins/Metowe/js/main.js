// js/main.js
import { AudioEngine } from "./audio/AudioEngine.js";
import { Sequencer } from "./sequencer/Sequencer.js";
import { UI } from "./ui/UI.js";

// Si tu as déjà un UI.js complet, tu l'importes ici.
// import { UI } from "./ui/UI.js";

const audio = new AudioEngine();
await audio.init();

const ui = new UI(audio, null);

const seq = new Sequencer(audio, (step) => ui.onStepChange(step));
ui.sequencer = seq;

ui.init();

// Quick wiring: play button example
const playBtn = document.getElementById("play-btn");
if (playBtn) {
  playBtn.addEventListener("click", async () => {
    await audioEngine.resume();
    if (sequencer.isPlaying) {
      sequencer.stop();
      playBtn.classList.remove("active");
    } else {
      sequencer.start();
      playBtn.classList.add("active");
    }
  });
}

// OPTIONAL: simple keyboard note test (Z = root)
document.addEventListener("keydown", async (e) => {
  if (e.code === "KeyZ") {
    await audioEngine.resume();
    audioEngine.noteOn(audioEngine.getCurrentTime() + 0.01, 48, 0.95, 0.2, true);
  }
});
