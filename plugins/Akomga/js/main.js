/**
 * main.js
 * Initialisation de l'application
 */

import { AudioEngine } from './AudioEngine.js';
import { Sequencer } from './Sequencer.js';
import { UI } from './UI.js';

class LoFiSampler {
  constructor() {
    this.audioEngine = new AudioEngine();
    this.sequencer = null;
    this.ui = null;
    this.isInitialized = false;
  }

  async init() {
    if (this.isInitialized) return;

    // Initialiser le moteur audio
    await this.audioEngine.init();

    // Initialiser le séquenceur
    this.sequencer = new Sequencer(
      this.audioEngine,
      (step) => this.ui?.onStepChange(step)
    );

    // Initialiser l'interface
    this.ui = new UI(this.audioEngine, this.sequencer);
    this.ui.init();

    this.isInitialized = true;
    console.log('🎛️ LoFi Sampler prêt !');
  }
}

// === DÉMARRAGE ===
const app = new LoFiSampler();

// Attendre une interaction utilisateur (requis par les navigateurs)
const startButton = document.createElement('div');
startButton.id = 'start-overlay';
startButton.innerHTML = `
  <style>
    #start-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.9);
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      z-index: 9999;
      color: white;
      font-family: 'Orbitron', monospace;
    }
    #start-overlay h1 {
      font-size: 2.5em;
      color: #ff6b35;
      margin-bottom: 20px;
    }
    #start-overlay button {
      padding: 20px 50px;
      font-size: 1.2em;
      font-family: inherit;
      background: #ff6b35;
      border: none;
      border-radius: 10px;
      color: white;
      cursor: pointer;
      transition: transform 0.1s, box-shadow 0.1s;
    }
    #start-overlay button:hover {
      transform: scale(1.05);
      box-shadow: 0 0 30px rgba(255,107,53,0.5);
    }
    #start-overlay p {
      margin-top: 30px;
      opacity: 0.6;
      font-size: 0.85em;
    }
  </style>
  <h1>LOFI SP-6000</h1>
  <button id="start-btn">▶ DÉMARRER</button>
  <p>Touches: Q W E A S D pour les pads | ESPACE pour play/stop</p>
`;
document.body.appendChild(startButton);

document.getElementById('start-btn').addEventListener('click', async () => {
  await app.init();
  startButton.remove();
});
