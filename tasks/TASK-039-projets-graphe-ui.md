---
id: TASK-039
title: Onglets Projets et Graphe
status: done
phase: 5
agent: ui
model: sonnet
depends_on: []
branch: task/TASK-039-projets-graphe-ui
---

## Objectif
L'onglet Projets montre, pour un dossier choisi, la branche, les worktrees, les derniers commits et un
tableau des fiches de tâches par statut. L'onglet Graphe montre le résumé Graphify du même dossier
(chiffres, fraîcheur, communautés, nœuds les plus connectés, rapport) avec un bouton « Mettre à jour ».

## Contexte utile
- Commandes : `contracts/ipc.md §11-12` (codées en parallèle : code contre le contrat). Crée `src/ipc/project.ts`.
- Choix du dossier : liste `settings.recentCwds` + « Parcourir… » (`pick_folder`), dossier courant partagé
  entre les deux onglets (petit module d'état, gardé dans `localStorage`). Par défaut : le dossier de la
  session de Chat affichée s'il y en a une.
- Tableau des tâches : colonnes todo / doing / review / done / blocked, carte = id, titre, agent, modèle.
- Graphe : **aucun rendu de `graph.html`**, aucune `iframe` ; le rapport s'affiche avec `Markdown` de
  `@/components/ui/ai-thinking-and-tool-calls`. Indique « Graphe à jour » ou « En retard sur le dernier commit »
  (`builtAtCommit` vs `headCommit`). « Mettre à jour » désactivé pendant l'exécution (jusqu'à 3 min).
- Les deux onglets en import dynamique (`src/features/projects/`, `src/features/graph/`). Logique (regroupement
  des tâches, fraîcheur, état du dossier) dans des modules purs testés.

## Fichiers
- **Lire** : `contracts/ipc.md §11-12`, `src/features/projects/`, `src/features/graph/`, `src/ipc/`, `DESIGN.md §3, §8`
- **Écrire** : `src/features/projects/**`, `src/features/graph/**`, `src/ipc/project.ts`
- **Contrats** : `contracts/ipc.md §11-12`

## Critères d'acceptation
- [ ] Les deux onglets fonctionnent sur un dossier git et affichent un état clair sur un dossier non git ou sans graphe.
- [ ] Tests des modules purs.

## Vérification
```bash
npm ci && npm run lint && npm test && npm run build
```

## Hors périmètre
Pas de Rust, pas d'actions git qui écrivent.

## Rapport (rempli par l'agent, 150 mots max)
- Fait :
- Fichiers touchés :
- Vérification (sortie résumée) :
- Raccourcis pris (`shortcut:`) :
- À remonter à l'architecte :
