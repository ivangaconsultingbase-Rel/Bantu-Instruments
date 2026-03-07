# Spectral Coast 6 — V3

V3 reprend le moteur V2 mais avec une nouvelle direction visuelle inspirée d'une groovebox sombre, minimaliste et mobile-first :

- fond noir/bleu nuit
- cartes arrondies et fines bordures
- typographie mono condensée
- accent rouge doux, vert secondaire et touches dorées
- hiérarchie compacte pensée pour iPhone

## Lancer le projet

Comme le projet utilise un `AudioWorklet`, il faut le servir via un petit serveur local.

```bash
python3 -m http.server 8080
```

Puis ouvrir le dossier dans le navigateur à l'adresse locale correspondante.

## Contenu

- `index.html` : structure UI V3
- `style.css` : thème visuel inspiré de la capture fournie
- `app.js` : binding UI / moteur
- `presets.js` : presets initiaux
- `audio/engine.js` : moteur audio
- `audio/worklets/lofi-processor.js` : worklet LoFi


## V5 additions

- 32-step A→B chain mode
- per-step microtiming
- per-step accents and ratchets
- 4 pattern memory slots via localStorage
- selected-step preview
