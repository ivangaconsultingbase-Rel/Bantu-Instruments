# Spectral Coast 6

Prototype WebAudio d'un synthé 6 voix hybride : additive + West Coast + resynthèse par modèles + spectral simplifié + texture granulaire globale + filtre 4 pôles type Moog + tape saturation / lofi / echo / reverb.

## Fichiers

- `index.html` : interface principale
- `style.css` : thème dark bronze mobile/desktop
- `app.js` : UI, presets, clavier écran/clavier ordinateur
- `presets.js` : patch par défaut + presets initiaux
- `audio/engine.js` : moteur audio WebAudio
- `audio/worklets/lofi-processor.js` : bitcrusher / downsampler

## Lancer localement

Les `AudioWorklet` demandent un contexte servi par HTTP(S). Évite le double-clic direct sur `index.html`.

### Avec Python

```bash
cd spectral-coast-6
python3 -m http.server 8000
```

Puis ouvre :

```text
http://localhost:8000
```

## Utilisation

- Clique sur **Start Audio**
- Joue avec le clavier à l'écran ou le clavier ordinateur
- Charge un preset puis ajuste les macros et les 5 sections principales
- Sur iPhone / iPad Safari, le bouton **Start Audio** est indispensable pour débloquer l'audio

## Notes sur cette V1

Cette version est volontairement pragmatique :

- **Additive** : 8 partiels max par voix
- **West Coast** : wavefold + tension harmonique simplifiée
- **Resynth** : morphing entre tables spectrales prédéfinies
- **Spectral** : blur / warp / freeze approximés musicalement
- **Granular** : texture de cloud globale, pas une vraie granulation FFT lourde par voix
- **Moog** : cascade de 4 low-pass Biquad, pas une modélisation transistor par transistor
- **LoFi** : AudioWorklet de bit reduction / downsampling

## Pistes V2

- enveloppe filtre dédiée
- vrai granulaire avec capture buffer + grains stéréo
- motion recording
- mode unison / detune
- page secondaire LFO / modulation
- meilleur ladder filter avec feedback plus analogique
