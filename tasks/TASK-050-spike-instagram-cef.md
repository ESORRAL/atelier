---
id: TASK-050
title: Spike — Instagram dans Chromium embarqué (CEF) à la place de WebKitGTK
status: todo
phase: 5
agent: core
model: opus
depends_on: [TASK-049]
branch: task/TASK-050-spike-instagram-cef
---

## Objectif
WebKitGTK n'affiche les Reels qu'à ~10 images/s (décodage matériel actif pourtant ; voir
`spikes/instagram-perf/FINDINGS.md`). Vérifier si Chromium embarqué fait mieux, **dans un prototype isolé**,
avant toute modification de l'app. S'arrêter au premier point bloquant et le documenter.

## Installation validée par l'utilisateur (2026-11-12)
- Crate `cef = "=156.4.0+156.0.26"` (github.com/tauri-apps/cef-rs, Apache-2.0/MIT), rien d'autre.
- Binaire CEF 156 téléchargé par son build.rs depuis `cef-builds.spotifycdn.com` (vérif SHA-1). Utilise
  `CEF_PATH=$HOME/.cache/atelier-cef` (un seul téléchargement, hors du repo, jamais committé).
- Aucun autre paquet, plugin ou outil système. Si un besoin apparaît : arrête-toi et remonte-le.

## Questions, dans l'ordre (arrêt au premier « non »)
1. **Lecture des Reels** : prototype `cef` minimal (exemple `cefsimple` du crate) qui ouvre
   `https://www.instagram.com/reels/` **sans connexion**. Une vidéo démarre-t-elle ? Quel codec (via
   `chrome://media-internals` ou les journaux CEF) ? Sans H.264, VP9/AV1 sont-ils servis ?
2. **Fluidité** : images/s réelles d'une vidéo (page de test locale de `spikes/instagram-perf/test-page/`
   + mesure d'un Reel public), CPU, décodage matériel ou non. Comparer aux chiffres WebKit du FINDINGS perf.
3. **Insertion dans une fenêtre Tauri** : app Tauri minimale lancée en X11 (`GDK_BACKEND=x11`), CEF en
   fenêtre enfant (parent XID) dans une zone de 420 px à gauche ; afficher/masquer, redimensionner, clics et
   défilement (vérif automatique si possible, sinon signale-le). Mesure le coût du mode hors écran (OSR) seulement si
   l'X11 échoue.
4. **Isolation** : sandbox de Chromium active ; aucun pont entre CEF et l'IPC Tauri ; données dans un
   dossier propre au prototype ; navigation limitée à la liste blanche de `src-tauri/src/windows/`.
5. **Arrêt propre** : fermer l'app ne laisse aucun processus CEF.

## Règles
Pas de connexion, pas de script injecté dans instagram.com, rien d'enregistré de ses contenus (CGU Meta).
Seuls tes propres processus sont lancés et tués, avec `timeout`. `CARGO_TARGET_DIR=$HOME/.cache/atelier-target`.

## Fichiers
- **Lire** : `spikes/instagram-perf/`, `spikes/instagram-panneau/`, `src-tauri/src/windows/mod.rs` (liste blanche)
- **Écrire** : `spikes/instagram-cef/**` uniquement

## Livrable
`spikes/instagram-cef/FINDINGS.md` (français, 60 lignes max) : réponse à chaque question, mesures, verdict
(intégrable ou non, à quel prix) et ce qu'il faudrait changer dans l'app. Si l'outil refuse de créer le
fichier, mets son contenu dans ton rapport.

## Rapport (rempli par l'agent, 150 mots max)
- Fait :
- Vérification (sortie résumée) :
- À remonter à l'architecte :
