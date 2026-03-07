window.SPECTRAL_PRESETS = {

  // ── PAD ÉVOLUTIFS ─────────────────────────────────────────────────────────

  "✦ Drift Silk": {
    // Son: pad ultra-smooth, filtre qui respire, sustain infini
    harmonics:0.28, tilt:0.62, inharmonic:0.03, drift:0.22,
    fold:0.06, index:0.08, model:0.18, morph:0.54,
    blur:0.38, warp:0.18, freeze:0.12, grain:0.14,
    cutoff:0.44, resonance:0.08, drive:0.06, env:0.12,
    tape:0.22, lofi:0.02, echo:0.28, space:0.72,
    organic:0.62, complexity:0.14, focus:0.32, age:0.18,
    lfoRate:0.18, lfoDepth:0.42, lfoShape:'sine',
    chorusDepth:0.48, chorusMix:0.38,
    padAttack:2.8, padRelease:4.2,
    // Séquenceur
    seqBpm:72, seqKey:'F', seqScale:'Dorian',
    seqPattern:'pad_drift',
    seqGate:0.82, seqSwing:0.04
  },

  "✦ Aurora Chords": {
    // Son: pad froid lumineux, shimmer, évolution spectrale lente
    harmonics:0.18, tilt:0.72, inharmonic:0.05, drift:0.28,
    fold:0.04, index:0.14, model:0.62, morph:0.68,
    blur:0.62, warp:0.32, freeze:0.18, grain:0.22,
    cutoff:0.38, resonance:0.06, drive:0.04, env:0.08,
    tape:0.14, lofi:0.01, echo:0.38, space:0.84,
    organic:0.52, complexity:0.18, focus:0.24, age:0.08,
    lfoRate:0.08, lfoDepth:0.58, lfoShape:'sine',
    chorusDepth:0.62, chorusMix:0.44,
    padAttack:3.6, padRelease:5.8,
    seqBpm:64, seqKey:'A', seqScale:'Major',
    seqPattern:'pad_aurora',
    seqGate:0.88, seqSwing:0.02
  },

  "✦ Morphic Glass": {
    // Son: texture cristalline, LFO moyen, attaque légère
    harmonics:0.42, tilt:0.58, inharmonic:0.08, drift:0.16,
    fold:0.12, index:0.22, model:0.72, morph:0.44,
    blur:0.28, warp:0.42, freeze:0.06, grain:0.08,
    cutoff:0.52, resonance:0.14, drive:0.08, env:0.18,
    tape:0.18, lofi:0.02, echo:0.24, space:0.62,
    organic:0.44, complexity:0.24, focus:0.42, age:0.14,
    lfoRate:0.32, lfoDepth:0.36, lfoShape:'triangle',
    chorusDepth:0.36, chorusMix:0.28,
    padAttack:1.8, padRelease:3.4,
    seqBpm:80, seqKey:'D', seqScale:'Minor',
    seqPattern:'pad_glass',
    seqGate:0.74, seqSwing:0.06
  },

  "✦ Void Shimmer": {
    // Son: dark ambient, drones, low-fi cosmique
    harmonics:0.22, tilt:0.44, inharmonic:0.12, drift:0.34,
    fold:0.08, index:0.06, model:0.42, morph:0.72,
    blur:0.54, warp:0.28, freeze:0.22, grain:0.32,
    cutoff:0.32, resonance:0.18, drive:0.12, env:0.06,
    tape:0.44, lofi:0.12, echo:0.48, space:0.88,
    organic:0.72, complexity:0.12, focus:0.18, age:0.42,
    lfoRate:0.06, lfoDepth:0.72, lfoShape:'sine',
    chorusDepth:0.52, chorusMix:0.32,
    padAttack:4.2, padRelease:7.2,
    seqBpm:58, seqKey:'G', seqScale:'Minor',
    seqPattern:'pad_void',
    seqGate:0.92, seqSwing:0.0
  },

  "✦ Deep Cosmos": {
    // Son: nappe orchestrale profonde, harmoniques riches, wavy
    harmonics:0.52, tilt:0.36, inharmonic:0.06, drift:0.24,
    fold:0.14, index:0.18, model:0.34, morph:0.62,
    blur:0.44, warp:0.22, freeze:0.08, grain:0.18,
    cutoff:0.48, resonance:0.12, drive:0.14, env:0.22,
    tape:0.28, lofi:0.04, echo:0.34, space:0.78,
    organic:0.58, complexity:0.22, focus:0.36, age:0.22,
    lfoRate:0.14, lfoDepth:0.52, lfoShape:'sine',
    chorusDepth:0.44, chorusMix:0.36,
    padAttack:2.4, padRelease:4.8,
    seqBpm:68, seqKey:'C', seqScale:'Dorian',
    seqPattern:'pad_cosmos',
    seqGate:0.86, seqSwing:0.08
  },

  // ── PRESETS HÉRITÉS ────────────────────────────────────────────────────────

  "Wooden Keys": {
    harmonics:0.52, tilt:0.42, inharmonic:0.12, drift:0.08,
    fold:0.18, index:0.12, model:0.18, morph:0.24,
    blur:0.1, warp:0.08, freeze:0, grain:0.06,
    cutoff:0.62, resonance:0.18, drive:0.2, env:0.32,
    tape:0.16, lofi:0.04, echo:0.14, space:0.16,
    organic:0.28, complexity:0.22, focus:0.62, age:0.16,
    lfoRate:0.0, lfoDepth:0.0, chorusDepth:0.1, chorusMix:0.08,
    padAttack:0.04, padRelease:0.8
  },
  "Spectral Choir": {
    harmonics:0.36, tilt:0.54, inharmonic:0.04, drift:0.12,
    fold:0.12, index:0.18, model:0.68, morph:0.74,
    blur:0.52, warp:0.24, freeze:0.12, grain:0.28,
    cutoff:0.54, resonance:0.12, drive:0.1, env:0.18,
    tape:0.1, lofi:0.02, echo:0.22, space:0.52,
    organic:0.3, complexity:0.44, focus:0.38, age:0.1,
    lfoRate:0.12, lfoDepth:0.28, chorusDepth:0.32, chorusMix:0.22,
    padAttack:1.2, padRelease:2.6
  },
  "Tape Dream Pad": {
    harmonics:0.44, tilt:0.4, inharmonic:0.06, drift:0.18,
    fold:0.1, index:0.08, model:0.26, morph:0.36,
    blur:0.22, warp:0.12, freeze:0.04, grain:0.18,
    cutoff:0.5, resonance:0.12, drive:0.12, env:0.2,
    tape:0.38, lofi:0.12, echo:0.3, space:0.46,
    organic:0.48, complexity:0.2, focus:0.46, age:0.44,
    lfoRate:0.08, lfoDepth:0.34, chorusDepth:0.28, chorusMix:0.2,
    padAttack:1.6, padRelease:3.2
  }
};

// Patterns de séquenceur prédéfinis (triades 3 notes, musical)
window.SPECTRAL_SEQ_PATTERNS = {

  pad_drift: {
    // Progression Am → F → C → G en Fa Dorien, lente
    steps: [
      {active:true,  degree:1, chord:'triad',  octave:0, velocity:0.72, probability:1,    accent:false},
      {active:false, degree:1, chord:'triad',  octave:0, velocity:0.60, probability:0.85, accent:false},
      {active:true,  degree:3, chord:'sus2',   octave:0, velocity:0.65, probability:0.90, accent:false},
      {active:false, degree:3, chord:'sus2',   octave:0, velocity:0.55, probability:0.75, accent:false},
      {active:true,  degree:4, chord:'triad',  octave:0, velocity:0.78, probability:1,    accent:true},
      {active:false, degree:4, chord:'triad',  octave:0, velocity:0.62, probability:0.80, accent:false},
      {active:true,  degree:5, chord:'sus4',   octave:0, velocity:0.68, probability:0.90, accent:false},
      {active:false, degree:5, chord:'sus4',   octave:0, velocity:0.58, probability:0.70, accent:false},
      {active:true,  degree:1, chord:'triad',  octave:1, velocity:0.64, probability:1,    accent:false},
      {active:false, degree:1, chord:'triad',  octave:1, velocity:0.52, probability:0.80, accent:false},
      {active:true,  degree:6, chord:'triad',  octave:0, velocity:0.70, probability:0.90, accent:false},
      {active:false, degree:6, chord:'triad',  octave:0, velocity:0.60, probability:0.75, accent:false},
      {active:true,  degree:7, chord:'sus2',   octave:0, velocity:0.74, probability:1,    accent:true},
      {active:false, degree:7, chord:'sus2',   octave:0, velocity:0.62, probability:0.85, accent:false},
      {active:true,  degree:5, chord:'triad',  octave:0, velocity:0.68, probability:0.90, accent:false},
      {active:false, degree:1, chord:'triad',  octave:0, velocity:0.56, probability:0.65, accent:false},
    ]
  },

  pad_aurora: {
    steps: [
      {active:true,  degree:1, chord:'triad',  octave:0, velocity:0.68, probability:1,    accent:false},
      {active:false, degree:1, chord:'triad',  octave:0, velocity:0.54, probability:0.80, accent:false},
      {active:false, degree:2, chord:'sus2',   octave:0, velocity:0.58, probability:0.70, accent:false},
      {active:true,  degree:3, chord:'triad',  octave:0, velocity:0.72, probability:0.90, accent:false},
      {active:false, degree:3, chord:'triad',  octave:0, velocity:0.62, probability:0.80, accent:false},
      {active:true,  degree:4, chord:'triad',  octave:0, velocity:0.76, probability:1,    accent:true},
      {active:false, degree:4, chord:'triad',  octave:0, velocity:0.60, probability:0.75, accent:false},
      {active:false, degree:5, chord:'sus2',   octave:0, velocity:0.64, probability:0.70, accent:false},
      {active:true,  degree:5, chord:'triad',  octave:0, velocity:0.70, probability:1,    accent:false},
      {active:false, degree:5, chord:'triad',  octave:0, velocity:0.58, probability:0.80, accent:false},
      {active:false, degree:6, chord:'triad',  octave:0, velocity:0.62, probability:0.70, accent:false},
      {active:true,  degree:6, chord:'triad',  octave:0, velocity:0.74, probability:0.90, accent:false},
      {active:false, degree:6, chord:'triad',  octave:0, velocity:0.60, probability:0.80, accent:false},
      {active:true,  degree:7, chord:'sus4',   octave:0, velocity:0.72, probability:1,    accent:true},
      {active:false, degree:7, chord:'sus4',   octave:0, velocity:0.60, probability:0.75, accent:false},
      {active:false, degree:1, chord:'triad',  octave:1, velocity:0.56, probability:0.65, accent:false},
    ]
  },

  pad_glass: {
    steps: [
      {active:true,  degree:1, chord:'triad',  octave:0, velocity:0.75, probability:1,    accent:false},
      {active:false, degree:1, chord:'sus2',   octave:0, velocity:0.62, probability:0.85, accent:false},
      {active:true,  degree:3, chord:'triad',  octave:0, velocity:0.70, probability:0.90, accent:false},
      {active:false, degree:3, chord:'triad',  octave:0, velocity:0.58, probability:0.75, accent:false},
      {active:true,  degree:5, chord:'triad',  octave:0, velocity:0.80, probability:1,    accent:true},
      {active:false, degree:5, chord:'sus4',   octave:0, velocity:0.66, probability:0.80, accent:false},
      {active:true,  degree:4, chord:'triad',  octave:0, velocity:0.72, probability:0.90, accent:false},
      {active:false, degree:4, chord:'triad',  octave:0, velocity:0.60, probability:0.75, accent:false},
      {active:true,  degree:2, chord:'sus2',   octave:0, velocity:0.68, probability:1,    accent:false},
      {active:false, degree:2, chord:'sus2',   octave:0, velocity:0.56, probability:0.80, accent:false},
      {active:true,  degree:6, chord:'triad',  octave:0, velocity:0.74, probability:0.90, accent:false},
      {active:false, degree:6, chord:'triad',  octave:0, velocity:0.62, probability:0.75, accent:false},
      {active:true,  degree:7, chord:'triad',  octave:0, velocity:0.76, probability:1,    accent:true},
      {active:false, degree:7, chord:'sus2',   octave:0, velocity:0.64, probability:0.80, accent:false},
      {active:true,  degree:1, chord:'triad',  octave:1, velocity:0.70, probability:0.90, accent:false},
      {active:false, degree:5, chord:'triad',  octave:0, velocity:0.58, probability:0.65, accent:false},
    ]
  },

  pad_void: {
    steps: [
      {active:true,  degree:1, chord:'triad',  octave:0, velocity:0.65, probability:1,    accent:false},
      {active:false, degree:1, chord:'triad',  octave:0, velocity:0.50, probability:0.70, accent:false},
      {active:false, degree:1, chord:'triad',  octave:0, velocity:0.48, probability:0.60, accent:false},
      {active:false, degree:1, chord:'sus2',   octave:0, velocity:0.52, probability:0.65, accent:false},
      {active:true,  degree:4, chord:'triad',  octave:0, velocity:0.70, probability:1,    accent:true},
      {active:false, degree:4, chord:'triad',  octave:0, velocity:0.54, probability:0.70, accent:false},
      {active:false, degree:4, chord:'triad',  octave:0, velocity:0.50, probability:0.60, accent:false},
      {active:false, degree:5, chord:'sus4',   octave:0, velocity:0.58, probability:0.65, accent:false},
      {active:true,  degree:6, chord:'triad',  octave:0, velocity:0.68, probability:1,    accent:false},
      {active:false, degree:6, chord:'triad',  octave:0, velocity:0.52, probability:0.70, accent:false},
      {active:false, degree:6, chord:'triad',  octave:0, velocity:0.48, probability:0.60, accent:false},
      {active:false, degree:5, chord:'sus2',   octave:0, velocity:0.54, probability:0.65, accent:false},
      {active:true,  degree:7, chord:'triad',  octave:0, velocity:0.72, probability:1,    accent:true},
      {active:false, degree:7, chord:'triad',  octave:0, velocity:0.56, probability:0.70, accent:false},
      {active:false, degree:5, chord:'triad',  octave:0, velocity:0.50, probability:0.60, accent:false},
      {active:false, degree:1, chord:'triad',  octave:0, velocity:0.46, probability:0.55, accent:false},
    ]
  },

  pad_cosmos: {
    steps: [
      {active:true,  degree:1, chord:'triad',  octave:0, velocity:0.70, probability:1,    accent:false},
      {active:false, degree:3, chord:'triad',  octave:0, velocity:0.58, probability:0.80, accent:false},
      {active:true,  degree:5, chord:'triad',  octave:0, velocity:0.72, probability:0.90, accent:false},
      {active:false, degree:5, chord:'sus4',   octave:0, velocity:0.62, probability:0.75, accent:false},
      {active:true,  degree:4, chord:'triad',  octave:0, velocity:0.76, probability:1,    accent:true},
      {active:false, degree:4, chord:'triad',  octave:0, velocity:0.60, probability:0.80, accent:false},
      {active:true,  degree:6, chord:'triad',  octave:0, velocity:0.68, probability:0.90, accent:false},
      {active:false, degree:7, chord:'sus2',   octave:0, velocity:0.58, probability:0.70, accent:false},
      {active:true,  degree:2, chord:'triad',  octave:0, velocity:0.66, probability:1,    accent:false},
      {active:false, degree:2, chord:'sus2',   octave:0, velocity:0.54, probability:0.80, accent:false},
      {active:true,  degree:5, chord:'triad',  octave:0, velocity:0.74, probability:0.90, accent:false},
      {active:false, degree:5, chord:'triad',  octave:0, velocity:0.62, probability:0.75, accent:false},
      {active:true,  degree:3, chord:'triad',  octave:0, velocity:0.70, probability:1,    accent:true},
      {active:false, degree:3, chord:'sus4',   octave:0, velocity:0.60, probability:0.80, accent:false},
      {active:true,  degree:1, chord:'triad',  octave:1, velocity:0.64, probability:0.90, accent:false},
      {active:false, degree:7, chord:'triad',  octave:0, velocity:0.52, probability:0.65, accent:false},
    ]
  }
};
