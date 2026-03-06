import { AudioEngine } from './audio/AudioEngine.js';
import { Sequencer } from './sequencer/Sequencer.js';
import { UI } from './ui/UI.js';

const audio = new AudioEngine();
const sequencer = new Sequencer(audio, (step) => ui.onStepChange(step));
const ui = new UI(audio, sequencer);

(async function boot() {
  await audio.init();
  ui.init();

  // Unlock audio on first gesture (iOS safe)
  const unlock = async () => {
    await audio.resume();
    window.removeEventListener('pointerdown', unlock, { capture: true });
    window.removeEventListener('touchstart', unlock, { capture: true });
    window.removeEventListener('click', unlock, { capture: true });
  };

  window.addEventListener('pointerdown', unlock, { capture: true, passive: true });
  window.addEventListener('touchstart', unlock, { capture: true, passive: true });
  window.addEventListener('click', unlock, { capture: true, passive: true });
})();
