// /js/main.js
import { AudioEngine } from './audio/AudioEngine.js';
import { Sequencer } from './sequencer/Sequencer.js';
import { UI } from './ui/UI.js';

const audio = new AudioEngine();

let ui = null;
const sequencer = new Sequencer(audio, (step) => {
  ui?.onStepChange(step);
});

ui = new UI(audio, sequencer);

async function boot() {
  await audio.init();
  ui.init();

  // iOS/mobile: unlock AudioContext on first user gesture
  const unlock = async () => {
    try { await audio.resume(); } catch {}
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('touchstart', unlock, true);
    window.removeEventListener('click', unlock, true);
  };

  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('touchstart', unlock, true);
  window.addEventListener('click', unlock, true);
}

boot();
