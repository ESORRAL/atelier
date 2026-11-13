---
id: TASK-028
title: Mode Focus et minuteur Pomodoro
status: done
phase: 4
agent: ui
model: sonnet
depends_on: [TASK-029]
branch: task/TASK-028-focus
---

## Objectif
Un mode Focus masque les onglets média (Musique sauf le mini-lecteur, Instagram) et lance un minuteur
Pomodoro (25 min travail / 5 min pause, réglables) visible dans la barre du haut.

## Contexte utile
- Activation : bouton dans la barre du haut, action dans la palette (`src/shell/palette.ts`), raccourci
  `Ctrl+Maj+F` (touches physiques, `DESIGN.md §5.6`).
- Fin de période : notification visuelle dans l'app (pas de son), et le minuteur passe à la période suivante.
  La fenêtre peut être inactive : le temps se calcule sur l'horloge (`performance.now()` et heure de début),
  pas en comptant des ticks.
- État (actif, période, début, durées) gardé dans `localStorage`, repris au redémarrage.
- Logique du minuteur dans un module pur testé (horloge injectée).
- Respecte `DESIGN.md §5` (Focus) et `§8`.

## Fichiers
- **Lire** : `DESIGN.md §5` (Focus), `§8`, `src/App.tsx`, `src/shell/`
- **Écrire** : `src/features/focus/**` (nouveau), `src/App.tsx`, `src/shell/**`
- **Contrats** : aucun

## Critères d'acceptation
- [ ] Onglets média masqués du rail et de la palette en Focus ; revenir rétablit tout.
- [ ] Minuteur juste après une mise en veille de la fenêtre ; tests du module pur.

## Vérification
```bash
npm ci && npm run lint && npm test && npm run build
```

## Hors périmètre
Pas de Rust, pas de son, pas de statistiques de focus.

## Rapport (rempli par l'agent, 150 mots max)
- Fait :
- Fichiers touchés :
- Vérification (sortie résumée) :
- Raccourcis pris (`shortcut:`) :
- À remonter à l'architecte :
