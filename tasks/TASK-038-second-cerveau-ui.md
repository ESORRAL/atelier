---
id: TASK-038
title: Onglet Second cerveau, réglages du vault et récap de fin de journée
status: todo
phase: 5
agent: ui
model: sonnet
depends_on: []
branch: task/TASK-038-second-cerveau-ui
---

## Objectif
L'onglet Second cerveau liste les notes du projet dans le vault, les affiche, cherche dedans et les ouvre
dans Obsidian ; les Réglages permettent de choisir le vault ; un bouton « Récap du jour » prépare un résumé
de la journée et, après confirmation, l'ajoute au journal Obsidian.

## Contexte utile
- Commandes : `contracts/ipc.md §10` (codées en parallèle : code contre le contrat). Crée `src/ipc/vault.ts`.
  `Settings` gagne `vaultPath` et `vaultProject` (§2) : mets à jour le type dans `src/ipc/`.
- Onglet `src/features/brain/` (état vide actuel à remplacer), en import dynamique : liste à gauche (titre,
  date relative), note à droite rendue avec `Markdown` de `@/components/ui/ai-thinking-and-tool-calls` (pas
  de HTML). Les liens `[[Note]]` et `[[Dossier/Note|Texte]]` deviennent des boutons qui ouvrent la note dans
  l'onglet (conversion pure testée). Bouton « Ouvrir dans Obsidian » (`vault_open`). Recherche à la validation.
- Vault non configuré : état vide avec bouton vers les Réglages. Réglages (`src/features/settings/`) : champ
  `vaultPath` avec « Parcourir… » (`pick_folder` de `src/ipc/desktop.ts`) et champ `vaultProject`.
- Récap du jour (bouton dans l'onglet) : à partir de `sessions_list` et `usage_summary(1)`, fabrique un bloc
  Markdown français daté (sessions du jour : titre, dossier, coût ; coût total ; modèles) par une fonction pure
  testée ; montre l'aperçu, puis `vault_append_journal` seulement sur confirmation.

## Fichiers
- **Lire** : `contracts/ipc.md §2, §10`, `src/features/brain/`, `src/features/settings/`, `src/ipc/`, `DESIGN.md §8`
- **Écrire** : `src/features/brain/**`, `src/features/settings/**`, `src/ipc/vault.ts`, `src/ipc/claude.ts` (type `Settings` seulement)
- **Contrats** : `contracts/ipc.md §2, §10`

## Critères d'acceptation
- [ ] Liste, lecture, recherche, wikilinks, ouverture dans Obsidian ; vault non configuré géré.
- [ ] Récap : aperçu puis écriture sur confirmation seulement ; tests des fonctions pures.

## Vérification
```bash
npm ci && npm run lint && npm test && npm run build
```

## Hors périmètre
Pas de Rust, pas d'édition de notes.

## Rapport (rempli par l'agent, 150 mots max)
- Fait :
- Fichiers touchés :
- Vérification (sortie résumée) :
- Raccourcis pris (`shortcut:`) :
- À remonter à l'architecte :
