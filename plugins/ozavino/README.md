# Spectral Electromech 6 — V10

Version avancée avec :
- source modélisée String / Electric Piano / Clavinet
- séquenceur accords / gammes 32 pas
- édition par step
- traitement type resynth/spectral simplifié via `morph` et `spectral`
- filtre style Moog simplifié
- tape saturation, lofi, echo, reverb
- presets cinématiques

## Lancement

```bash
python3 -m http.server 8000
```

Puis ouvrir :

```text
http://localhost:8000
```

## Remarque

La partie “modélisation” reste volontairement légère et musicale, pas une émulation physique scientifique complète. Cette V10 sert à valider la direction sonore et l’ergonomie du moteur.


## V10.1

Correction de robustesse sur l'initialisation des événements UI et sur le démarrage audio/transport.
