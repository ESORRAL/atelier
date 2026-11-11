---
id: TASK-037
title: Module windows — fenêtre Instagram isolée
status: todo
phase: 5
agent: core
model: opus
depends_on: []
branch: task/TASK-037-fenetre-instagram-coeur
---

## Objectif
`pause_window_open` / `pause_window_close` (`contracts/ipc.md §13`) : la vraie fenêtre Instagram de l'app,
isolée selon ADR-0003 et sa revue.

## Contexte utile
- Le spike `spikes/instagram/` (`src/main.rs`, `FINDINGS.md`) montre le code qui marche et sa revue
  (ADR-0003, section « Résultat du spike ») liste ce qu'il faut corriger : `https` seulement, liste
  d'hôtes du contrat §13, `about:blank` permis, liens hors liste ouverts dans le navigateur système
  (`open_detached` de `src-tauri/src/desktop/mod.rs`, seulement si `https`).
- Module `src-tauri/src/windows/`. `WebviewWindowBuilder` (pas de webview enfant), label `instagram`,
  `data_directory` = `<app_data_dir>/instagram-webview`, `on_navigation` avec la liste blanche (fonction pure
  testée : sous-domaines, `instagram.com.evil.example` refusé, `http` refusé, `l.facebook.com` → externe).
  Fenêtre existante : `show` + `set_focus` au lieu d'en créer une seconde.
- **Isolation (point central de la revue Opus)** : aucune capability ne cite `instagram` (vérifie
  `src-tauri/capabilities/`), aucune entrée `remote`, aucun `initialization_script`. Ajoute un test Rust qui
  lit les fichiers `capabilities/*.json` et échoue si l'un d'eux cite la fenêtre `instagram` ou contient
  `remote`.
- Aucune dépendance nouvelle.

## Fichiers
- **Lire** : `contracts/ipc.md §13`, `docs/adr/0003-instagram-isolation.md`, `spikes/instagram/src/main.rs`,
  `spikes/instagram/FINDINGS.md`, `src-tauri/src/desktop/mod.rs`, `src-tauri/src/lib.rs`, `src-tauri/capabilities/`
- **Écrire** : `src-tauri/src/windows/**`, `src-tauri/src/lib.rs`, `src-tauri/src/desktop/mod.rs` (rendre le lanceur public si besoin)
- **Contrats** : `contracts/ipc.md §13`

## Critères d'acceptation
- [ ] Tests de la liste blanche et du contrôle des capabilities.
- [ ] Essai réel : la fenêtre s'ouvre sur instagram.com (lance l'app une fois, `timeout 60`), puis dis-le.

## Vérification
```bash
export PATH="$HOME/.cargo/bin:$PATH" CARGO_TARGET_DIR="$HOME/.cache/atelier-target"
npm run build:bridge && cd src-tauri && cargo fmt --check && cargo clippy -- -D warnings && cargo test
```

## Hors périmètre
Pas d'UI, aucun script dans la page, aucune lecture du contenu d'Instagram.

## Rapport (rempli par l'agent, 150 mots max)
- Fait :
- Fichiers touchés :
- Vérification (sortie résumée) :
- Raccourcis pris (`shortcut:`) :
- À remonter à l'architecte :
