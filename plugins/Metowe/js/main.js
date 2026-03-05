// js/main.js
import { AudioEngine } from "./audio/AudioEngine.js";
import { Sequencer } from "./sequencer/Sequencer.js";

// Si tu as déjà un UI.js complet, tu l'importes ici.
// import { UI } from "./ui/UI.js";

const audioEngine = new AudioEngine();
await audioEngine.init();

const sequencer = new Sequencer(audioEngine, (step) => {
  // hook UI: highlight current step
  // console.log("step", step);
});

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
