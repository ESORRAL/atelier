---
id: TASK-031
title: Commandes pick_folder et music_open
status: todo
phase: 4
agent: core
model: sonnet
depends_on: []
branch: task/TASK-031-dossier-apple-coeur
---

## Objectif
`pick_folder` ouvre la boîte native de choix de dossier ; `music_open` ouvre Apple Music web (accueil,
recherche, bibliothèque, playlists) dans le navigateur par défaut. Contrat : `contracts/ipc.md §8`.

## Contexte utile
- Rust dans `~/.cargo/bin`. `npm run build:bridge` avant `cargo` (ressources).
- `pick_folder` : plugin officiel `tauri-plugin-dialog` (dépôt `tauri-apps/plugins-workspace`, version 2.x
  compatible Tauri 2.12 ; vérifie avec `cargo search`), appelé **côté Rust uniquement** dans une commande
  async (pas de permission ajoutée à la capability de la fenêtre). Si le plugin exige une permission de
  fenêtre même ainsi, arrête-toi et remonte-le.
- `music_open` : l'URL est construite par une fonction pure testée à partir de `target`/`query` (encodage
  du terme, validation 1–200 caractères, refus de toute autre cible). Lancement : `xdg-open <url>` avec
  `process_group(0)` puis abandon du handle (rendre la main sans attendre au-delà de la fin d'`xdg-open`) ;
  commentaire expliquant l'exception au superviseur. Erreur française si `xdg-open` est introuvable.
- Module `src-tauri/src/desktop/` (nouveau), commandes enregistrées dans `lib.rs`.

## Fichiers
- **Lire** : `contracts/ipc.md §8`, `src-tauri/src/lib.rs`, `src-tauri/src/music/commands.rs` (exemple)
- **Écrire** : `src-tauri/src/desktop/**`, `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`
- **Contrats** : `contracts/ipc.md §8`

## Critères d'acceptation
- [ ] Tests de la construction d'URL (encodage, accents, espaces, `&`, terme vide ou trop long refusé).
- [ ] `src-tauri/capabilities/main.json` inchangé.

## Vérification
```bash
export PATH="$HOME/.cargo/bin:$PATH"
npm run build:bridge && cd src-tauri && cargo fmt --check && cargo clippy -- -D warnings && cargo test
```

## Hors périmètre
Pas d'UI, pas d'API Apple Music.

## Rapport (rempli par l'agent, 150 mots max)
- Fait : `pick_folder` (tauri-plugin-dialog 2.8, appel côté Rust) et `music_open` (URL pure `music_url`, xdg-open détaché `process_group(0)`, thread de récolte du handle, exception au superviseur commentée).
- Fichiers touchés : `src-tauri/src/desktop/mod.rs`, `lib.rs`, `Cargo.toml`, `Cargo.lock`.
- Vérification : fmt, clippy -D warnings, cargo test OK (35 tests lib, dont 3 nouveaux). `capabilities/main.json` inchangé.
- Raccourcis pris (`shortcut:`) : aucun.
- À remonter à l'architecte : `cargo search` annonce 3.0.0-alpha pour le plugin ; pris `2` (stable). Non testé en vrai : la boîte de dialogue.
