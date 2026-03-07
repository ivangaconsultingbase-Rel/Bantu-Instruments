# Spectral Coast 6 — V9 PAD

Refonte profonde axée sur les **pads évolutifs, smooth et wavy**.

## Nouveautés V9

### 🎛️ Moteur sonore PAD
- **8 voix polyphoniques** (vs 6)
- **5 partiels + 2 copies unisson** détuné pour la largeur stéréo
- **LFO global** (rate, depth, shape) modulant le filtre en temps réel
- **Chorus stéréo** à double LFO (0.22 Hz + 0.31 Hz) pour l'effet wavy
- **Shimmer delay** : réseau reverb étendu avec delay en feedback
- **Enveloppes pad longues** : attack jusqu'à 8s, release jusqu'à 10s
- Nouveaux modèles spectraux : **silk, cosmic**

### 🎵 Séquenceur musical — triades 3 notes
- **6 types d'accords 3 notes** : triad △, sus2, sus4, open5 (quinte), stack4 (quartes), add9
- **5 patterns prédéfinis** par preset (musical, progressions cohérentes)
- **Page B** générée automatiquement avec variations légères
- BPM optimisé pour les pads (58–80 BPM)

### ✦ 5 Presets PAD évolutifs
| Preset | Style | BPM | Clé | Gamme |
|--------|-------|-----|-----|-------|
| ✦ Drift Silk | Ultra-smooth, filter breathing | 72 | F | Dorian |
| ✦ Aurora Chords | Cold shimmer, spectral | 64 | A | Major |
| ✦ Morphic Glass | Crystal texture, wavy | 80 | D | Minor |
| ✦ Void Shimmer | Dark ambient, drones | 58 | G | Minor |
| ✦ Deep Cosmos | Orchestral, rich harmonics | 68 | C | Dorian |

### 🎨 Interface
- Design **teal/indigo** doux et élégant
- Section **PAD ENGINE** dédiée (LFO, Chorus, enveloppes)
- Steps plus lisibles avec indicateur de probabilité
- Typography Space Mono + DM Sans

## Lancement

```bash
python3 -m http.server 8000
```

Ouvrir : `http://localhost:8000`

## Raccourcis clavier
- `ESPACE` → Play / Stop
- `A W S E D F T G Y H U J K` → Clavier chromatique
