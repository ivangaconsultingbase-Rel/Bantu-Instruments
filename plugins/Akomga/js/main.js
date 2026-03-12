/**
 * main.js
 * Initialisation de l'application LoFi Sampler AK-612
 */

import { AudioEngine } from './AudioEngine.js';
import { Sequencer }   from './Sequencer.js';
import { UI }          from './UI.js';

class LoFiSampler {
  constructor() {
    this.audioEngine   = new AudioEngine();
    this.sequencer     = null;
    this.ui            = null;
    this.isInitialized = false;
  }

  async init() {
    if (this.isInitialized) return;

    await this.audioEngine.init();

    this.sequencer = new Sequencer(
      this.audioEngine,
      (step) => this.ui?.onStepChange(step)
    );

    this.ui = new UI(this.audioEngine, this.sequencer);
    this.ui.init();

    this.isInitialized = true;
    console.log('🎛️ LoFi Sampler AK-612 prêt !');
  }
}

/* ═══ DÉMARRAGE ═══ */
const app = new LoFiSampler();

const startOverlay = document.createElement('div');
startOverlay.id = 'start-overlay';
startOverlay.innerHTML = `
  <style>
    #start-overlay {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.92);
      display: flex; flex-direction: column;
      justify-content: center; align-items: center;
      z-index: 9999; color: white;
      font-family: 'Inter', sans-serif;
      gap: 20px;
    }
    #start-overlay h1 {
      font-size: 2.5em; color: #e63946;
      letter-spacing: 0.1em; margin: 0;
    }
    #start-overlay button {
      padding: 18px 48px; font-size: 1.1em;
      background: #e63946; border: none;
      border-radius: 8px; color: white;
      cursor: pointer; font-weight: 700;
      letter-spacing: 0.08em;
      transition: transform 0.1s, box-shadow 0.1s;
    }
    #start-overlay button:hover {
      transform: scale(1.05);
      box-shadow: 0 0 30px rgba(230,57,70,0.5);
    }
    #start-overlay p {
      opacity: 0.5; font-size: 0.8em; text-align: center;
      max-width: 360px; line-height: 1.6; margin: 0;
    }
  </style>
  <h1>LOFI AK-612</h1>
  <button id="start-btn">▶ DÉMARRER</button>
  <p>
    Touches: Q W E A S D pour les pads · ESPACE play/stop<br>
    Clic droit sur un step pour P-Lock · 🎙 pour live sampling
  </p>
`;
document.body.appendChild(startOverlay);

document.getElementById('start-btn').addEventListener('click', async () => {
  await app.init();
  startOverlay.remove();
});
