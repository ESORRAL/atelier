---
id: TASK-040
title: Bouton Instagram du rail — ouvre ou ramène la fenêtre isolée
status: done
phase: 5
agent: ui
model: sonnet
depends_on: []
branch: task/TASK-040-instagram-ui
---

## Objectif
Comme la musique, Instagram ne change plus de page : le bouton Instagram du rail (et une entrée de la
palette) ouvre la fenêtre isolée, ou la ramène au premier plan. Masqué en mode Focus.

## Contexte utile
- Commandes `pause_window_open` / `pause_window_close` (`contracts/ipc.md §13`, codées en parallèle).
  Ajoute-les dans `src/ipc/desktop.ts`.
- Retire Instagram de `TABS` (comme Musique) et traite-le comme une action du rail. Raccourcis des onglets
  suivants à recalculer (`src/shell/shortcuts.ts` et ses tests).
- Erreur à l'ouverture : message court dans l'app.

## Fichiers
- **Lire** : `contracts/ipc.md §13`, `src/App.tsx`, `src/shell/`, `src/features/instagram/`, `src/ipc/desktop.ts`
- **Écrire** : `src/App.tsx`, `src/shell/**`, `src/features/instagram/**` (supprimer s'il devient inutile), `src/ipc/desktop.ts`
- **Contrats** : `contracts/ipc.md §13`

## Critères d'acceptation
- [ ] Rail et palette ouvrent la fenêtre ; Focus masque le bouton et l'entrée ; tests des raccourcis à jour.

## Vérification
```bash
npm ci && npm run lint && npm test && npm run build
```

## Hors périmètre
Pas de Rust.

## Rapport (rempli par l'agent, 150 mots max)
- Fait :
- Fichiers touchés :
- Vérification (sortie résumée) :
- Raccourcis pris (`shortcut:`) :
- À remonter à l'architecte :
