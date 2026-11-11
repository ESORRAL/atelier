---
id: TASK-025
title: Commande usage_summary — coût et tokens par jour et par modèle
status: todo
phase: 4
agent: core
model: sonnet
depends_on: []
branch: task/TASK-025-usage-coeur
---

## Objectif
`usage_summary` (`contracts/ipc.md §7`) agrège le coût et les tokens des sessions par jour local et par modèle.

## Contexte utile
- Rust dans `~/.cargo/bin`. Données déjà sur disque : index `sessions.json` (`updatedAt`) et journaux
  `sessions/<key>.ndjson`, lus par `Store::list_sessions` et `Store::read_events`.
- Dans le journal, les événements `{kind:"sdk", message:{type:"result", modelUsage:{<modèle>:{costUSD,
  inputTokens, outputTokens, …}}}}` ; prendre le **dernier** `result` de chaque session (cumulé). Exemples
  réels : `spikes/bridge/samples/stream.ndjson` (champ `data`).
- Jour local : `libc::localtime_r` (déjà en dépendance), pas de crate de dates.
- La logique d'agrégation est une fonction pure testée (entrées : entrées d'index + dernier `result`,
  « maintenant », fuseau via une fonction injectable pour les tests).
- Commande dans `src-tauri/src/claude/commands.rs` (elle a déjà accès au store) et enregistrée dans `lib.rs`.
- Journaux absents ou illisibles : la session compte pour 0, sans erreur.

## Fichiers
- **Lire** : `contracts/ipc.md §7`, `src-tauri/src/store/mod.rs`, `src-tauri/src/claude/commands.rs`
- **Écrire** : `src-tauri/src/store/usage.rs` (nouveau), `src-tauri/src/store/mod.rs` (déclaration du sous-module),
  `src-tauri/src/claude/commands.rs`, `src-tauri/src/lib.rs`
- **Contrats** : `contracts/ipc.md §7`

## Critères d'acceptation
- [ ] Jours vides inclus, triés du plus ancien au plus récent ; `days` hors de 1–365 refusé.
- [ ] Tests : deux sessions le même jour, une session hors fenêtre, un journal corrompu, plusieurs modèles.

## Vérification
```bash
export PATH="$HOME/.cargo/bin:$PATH"
npm run build:bridge && cd src-tauri && cargo fmt --check && cargo clippy -- -D warnings && cargo test
```

## Hors périmètre
Pas d'UI, pas d'horodatage par tour.

## Rapport (rempli par l'agent, 150 mots max)
- Fait : `usage_summary` (validation 1-365, jours vides, tri croissant), agrégation pure `summarize` + `local_day` (libc).
- Fichiers touchés : store/usage.rs, store/mod.rs, claude/commands.rs, lib.rs.
- Vérification : fmt, clippy -D warnings, cargo test (29 ok, 3 tests usage).
- Raccourcis pris (`shortcut:`) : aucun nouveau (celui du contrat §7).
- À remonter à l'architecte : `UsageSummary` est dans `store::usage` ; lit les journaux via `Claude::history`, pas de méthode ajoutée à session.rs.
