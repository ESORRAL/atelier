---
id: TASK-041
title: Commande project_files pour les mentions @
status: done
phase: 5
agent: core
model: sonnet
depends_on: [TASK-036]
branch: task/TASK-041-fichiers-projet-coeur
---

## Objectif
`project_files` (`contracts/ipc.md §14`) liste les fichiers du projet filtrés par la saisie, pour
l'autocomplétion des mentions `@` du Chat.

## Contexte utile
- Dans le module `src-tauri/src/project/` (même dossier que `project_info`, réutilise sa fonction `run` qui
  passe par le superviseur et sa validation de dossier).
- Tri et filtrage dans une fonction pure testée (préfixe du nom de fichier d'abord, puis sous-chaîne du
  chemin, sans casse ni accents ; égalité départagée par chemin le plus court). `query` vide : les plus
  récemment modifiés (`metadata().modified()`), `limit` premiers.
- Hors git : parcours borné (5 000 fichiers), dossiers cachés, `node_modules`, `target` ignorés, liens
  symboliques non suivis.
- Aucune dépendance nouvelle.

## Fichiers
- **Lire** : `contracts/ipc.md §14`, `src-tauri/src/project/`, `src-tauri/src/lib.rs`
- **Écrire** : `src-tauri/src/project/**`, `src-tauri/src/lib.rs`
- **Contrats** : `contracts/ipc.md §14`

## Critères d'acceptation
- [ ] Tests du tri (accents, majuscules, préfixe contre sous-chaîne) ; essai réel sur ce repo.

## Vérification
```bash
export PATH="$HOME/.cargo/bin:$PATH" CARGO_TARGET_DIR="$HOME/.cache/atelier-target"
npm run build:bridge && cd src-tauri && cargo fmt --check && cargo clippy -- -D warnings && cargo test
```

## Hors périmètre
Pas d'UI.

## Rapport (rempli par l'agent, 150 mots max)
- Fait :
- Fichiers touchés :
- Vérification (sortie résumée) :
- Raccourcis pris (`shortcut:`) :
- À remonter à l'architecte :
