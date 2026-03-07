# Spectral Coast 6 — V8

V8 complète avec séquenceur **visible en haut par défaut**.

## Contenu
- synthé poly 6 voix léger WebAudio
- séquenceur chord/scale groovebox
- pages A/B + mode A→B 32
- édition de step : degree, chord, octave, velocity, chance, accent, tie, ratchet, micro, condition
- mémoire patterns via localStorage
- boutons HIDE/SHOW par section
- barre rapide + SHOW ALL / HIDE SYNTH

## Lancement
Utiliser un petit serveur local :

```bash
python3 -m http.server 8000
```

Puis ouvrir `http://localhost:8000/`

## Notes
- Le séquenceur est dans la première grande section : **CHORD SCALE GROOVEBOX**.
- `HIDE SYNTH` masque les sections du synthé et laisse le séquenceur ouvert.
- `SHOW ALL` rouvre toutes les sections.
