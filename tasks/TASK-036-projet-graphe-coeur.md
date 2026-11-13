---
id: TASK-036
title: Module project — infos git, fiches de tâches, résumé du graphe Graphify
status: done
phase: 5
agent: core
model: sonnet
depends_on: []
branch: task/TASK-036-projet-graphe-coeur
---

## Objectif
`project_info`, `graph_summary` et `graph_update` de `contracts/ipc.md §11-12`.

## Contexte utile
- Module `src-tauri/src/project/`. `dir` validé comme le `cwd` des sessions (absolu, existant, pas `/`) :
  réutilise la validation existante du module `claude` si elle est accessible, sinon factorise-la.
- `git` et `graphify` lancés **par `supervisor::spawn`** (jamais `Command::spawn` direct), sortie lue, délai
  (10 s pour git, 180 s pour `graphify update .`), `kill()` au dépassement. `graphify` absent : erreur claire.
- Parsing pur et testé : `git status --porcelain` (compte), `git worktree list --porcelain`, `git log
  --format=%H%x1f%s%x1f%ct -n 10`, en-tête YAML simple des fiches `tasks/TASK-*.md` (lignes `clé: valeur`
  entre `---`, commentaires `#` ignorés), et `graph.json` (format réel dans `graphify-out/graph.json` de
  la racine du repo : `nodes[]` avec `community`, `community_name`, `source_file` ; `links[]` avec
  `source`/`target` ; `built_at_commit`). Degré = nombre de liens. `graph.html` jamais lu.
- Dossier non git : `isGit: false`, champs vides, pas d'erreur.
- Aucune dépendance nouvelle (`serde_json` suffit).

## Fichiers
- **Lire** : `contracts/ipc.md §11-12`, `src-tauri/src/supervisor/mod.rs`, `src-tauri/src/claude/` (validation de cwd), `src-tauri/src/lib.rs`
- **Écrire** : `src-tauri/src/project/**`, `src-tauri/src/lib.rs`, `src-tauri/src/claude/` (seulement pour rendre la validation de cwd réutilisable)
- **Contrats** : `contracts/ipc.md §11-12`

## Critères d'acceptation
- [ ] Tests purs des cinq parseurs sur des sorties réelles (capture-les sur ce repo).
- [ ] Essai réel de `project_info` et `graph_summary` sur ce repo ; `graph_update` une fois.

## Vérification
```bash
export PATH="$HOME/.cargo/bin:$PATH" CARGO_TARGET_DIR="$HOME/.cache/atelier-target"
npm run build:bridge && cd src-tauri && cargo fmt --check && cargo clippy -- -D warnings && cargo test
```

## Hors périmètre
Pas d'UI, aucune commande git qui écrit.

## Rapport (rempli par l'agent, 150 mots max)
- Fait :
- Fichiers touchés :
- Vérification (sortie résumée) :
- Raccourcis pris (`shortcut:`) :
- À remonter à l'architecte :
