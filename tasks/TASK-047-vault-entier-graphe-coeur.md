---
id: TASK-047
title: Second cerveau sur tout le vault, et données du graphe à dessiner
status: todo
phase: 5
agent: core
model: sonnet
depends_on: [TASK-035, TASK-036]
branch: task/TASK-047-vault-entier-graphe-coeur
---

## Objectif
`contracts/ipc.md §10 bis` (vault entier, `vault_recent`) et `§11 bis` (`graph_data`).

## Contexte utile
- Modules existants `src-tauri/src/vault/` et `src-tauri/src/project/` : garde leurs validations et leurs
  tests ; change la racine de lecture en `vaultPath` (l'écriture du journal reste sur le projet). Les tests
  de chemin existants doivent passer avec la nouvelle racine, plus un test : `vault_list` d'un sous-dossier,
  et un `folder` qui sort du vault refusé.
- `graph_data` : lecture de `graphify-out/graph.json` (format réel décrit au §11), degré = nombre de liens,
  plafonds du contrat, `truncated`. Fonction pure testée sur un petit JSON d'exemple ; essai réel sur ce repo.
- Aucune dépendance nouvelle.

## Fichiers
- **Lire** : `contracts/ipc.md §10, §10 bis, §11, §11 bis`, `src-tauri/src/vault/`, `src-tauri/src/project/`, `src-tauri/src/lib.rs`
- **Écrire** : `src-tauri/src/vault/**`, `src-tauri/src/project/**`, `src-tauri/src/lib.rs`
- **Contrats** : `contracts/ipc.md §10 bis, §11 bis`

## Critères d'acceptation
- [ ] Tests verts ; essai réel en lecture seule sur le vault de l'utilisateur (aucune écriture) et sur le graphe du repo.

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
