---
id: TASK-026
title: Onglet Usage — coût et tokens par jour et par modèle
status: todo
phase: 4
agent: ui
model: sonnet
depends_on: [TASK-025]
branch: task/TASK-026-usage-ui
---

## Objectif
L'onglet Usage montre le coût total et par modèle sur 7, 30 ou 90 jours, un histogramme du coût par jour
et un tableau tokens entrée / sortie par modèle.

## Contexte utile
- Commande `usage_summary` : `contracts/ipc.md §7`. Ajoute la fonction typée dans `src/ipc/` (fichier `usage.ts`).
- Avant d'écrire le graphique, invoque le skill `dataviz` (outil Skill) et suis-le. Histogramme en SVG ou
  CSS, **sans bibliothèque de graphiques** ; couleurs par modèle tirées des tokens, avec légende texte
  (jamais la couleur seule). Montants en dollars, 2 décimales ; tokens avec séparateur de milliers (fr-FR).
- Onglet en import dynamique (`src/features/usage/`, état vide actuel à remplacer). Aucune donnée :
  état vide (« Tes sessions apparaîtront ici »).
- Mise en forme et préparation des séries dans un module pur testé.
- Respecte `DESIGN.md §3` (wireframe Usage) et `§8`.

## Fichiers
- **Lire** : `contracts/ipc.md §7`, `DESIGN.md §3` (Usage), `DESIGN.md §8`, `src/features/usage/`
- **Écrire** : `src/features/usage/**`, `src/ipc/usage.ts`
- **Contrats** : `contracts/ipc.md §7`

## Critères d'acceptation
- [ ] Bascule 7 / 30 / 90 jours ; graphique lisible en thème sombre et clair, accessible (titre, valeurs en texte).
- [ ] Tests du module pur.

## Vérification
```bash
npm ci && npm run lint && npm test && npm run build
```

## Hors périmètre
Pas de Rust, pas d'export.

## Rapport (rempli par l'agent, 150 mots max)
- Fait :
- Fichiers touchés :
- Vérification (sortie résumée) :
- Raccourcis pris (`shortcut:`) :
- À remonter à l'architecte :
