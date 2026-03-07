# Spectral Coast 6 — V7

V7 étend la groovebox V5 avec un séquenceur plus performant et plus proche d'une machine hardware :

- chainage multi-patterns par slots mémoire
- copy/paste de steps
- conditions de lecture par cycle (`1:2`, `3:4`, etc.)
- motion recording léger par pas pour quelques paramètres-clés
- cartes de steps plus proches de l'esthétique groovebox de la capture
- panneaux toujours repliables section par section

## Lancer le projet

Comme le projet utilise un `AudioWorklet`, il faut le servir via un petit serveur local.

```bash
python3 -m http.server 8080
```

Puis ouvrir `http://localhost:8080/`.

## Conseils V7

- Utilise `CHAIN` avec des slots sauvegardés (`1-2-3-4`) pour enchaîner plusieurs patterns.
- Active `MOTION REC`, choisis une cible (`cutoff`, `fold`, `morph`, `warp`, `tape`) puis bouge le paramètre pendant la lecture.
- Les motions sont rejouées par pas et sauvegardées avec les patterns.
