---
id: TASK-024
title: Onglet Musique et mini-lecteur persistant
status: todo
phase: 4
agent: ui
model: sonnet
depends_on: [TASK-023, TASK-029]
branch: task/TASK-024-musique-ui
---

## Objectif
L'onglet Musique montre le lecteur du bureau en cours (titre, artiste, album, progression) avec lecture /
pause / précédent / suivant / volume et le choix du lecteur. Un mini-lecteur dans la barre du haut (à la
place de l'emplacement « ♪ » du croquis) reste visible sur tous les onglets.

## Contexte utile
- Commandes `music_*` : `contracts/ipc.md §6`. Crée `src/ipc/music.ts` (types exacts, une fonction par commande).
- Interrogation de `music_status` toutes les secondes **seulement** quand l'onglet ou le mini-lecteur est
  visible et que la fenêtre a le focus (`data-idle` absent sur `<html>`) ; arrêt sinon.
- Aucun lecteur : état vide soigné (« Lance Spotify, VLC ou un autre lecteur ») ; le mini-lecteur se masque.
- Pas de pochette (CSP) : icône Phosphor à la place.
- Onglet chargé en import dynamique (`src/features/music/`, état vide actuel à remplacer). Mini-lecteur :
  composant dans `src/features/music/` monté par `src/App.tsx` dans la barre du haut.
- Logique (formatage des durées, choix d'affichage, intervalle) dans un module pur testé.
- Respecte `DESIGN.md §3` (wireframe Musique) et `§8`.

## Fichiers
- **Lire** : `contracts/ipc.md §6`, `DESIGN.md §3` (Musique), `DESIGN.md §8`, `src/App.tsx`, `src/features/music/`
- **Écrire** : `src/features/music/**`, `src/ipc/music.ts`, `src/App.tsx` (montage du mini-lecteur seulement)
- **Contrats** : `contracts/ipc.md §6`

## Critères d'acceptation
- [ ] Contrôles fonctionnels au clavier et à la souris, libellés accessibles.
- [ ] Aucune interrogation quand rien n'est visible ou que la fenêtre est inactive.
- [ ] Tests du module pur.

## Vérification
```bash
npm ci && npm run lint && npm test && npm run build
```

## Hors périmètre
Pas de lecteur local, pas de pochette, pas de Rust.

## Rapport (rempli par l'agent, 150 mots max)
- Fait :
- Fichiers touchés :
- Vérification (sortie résumée) :
- Raccourcis pris (`shortcut:`) :
- À remonter à l'architecte :
