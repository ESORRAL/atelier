---
id: TASK-023
title: Module music — télécommande MPRIS
status: done
phase: 4
agent: core
model: sonnet
depends_on: []
branch: task/TASK-023-musique-coeur
---

## Objectif
Les quatre commandes `music_*` de `contracts/ipc.md §6` pilotent les lecteurs du bureau (Spotify desktop,
VLC, Firefox, Rhythmbox…) par MPRIS.

## Contexte utile
- Rust dans `~/.cargo/bin`. Crate `mpris` **2.1.0** (seule dépendance autorisée), API bloquante :
  chaque appel dans `tokio::task::spawn_blocking`.
- Module `src-tauri/src/music/` (`mod.rs` + `commands.rs`), commandes enregistrées dans `lib.rs`.
- Logique pure séparée et testée sans D-Bus : choix du lecteur quand `player` est `null` (celui en
  lecture d'abord, sinon le premier), conversion des métadonnées vers `NowPlaying` (champs absents →
  `null`, durées en ms), validation de `volume` (0 à 1, sinon erreur) et de `action`.
- Aucun lecteur, D-Bus de session absent, ou lecteur disparu entre deux appels : `music_status` renvoie
  `null`, les autres commandes une erreur française claire. Jamais de panique.
- Aucune permission ajoutée à la capability de la fenêtre.

## Fichiers
- **Lire** : `contracts/ipc.md §6`, `src-tauri/src/lib.rs`, `src-tauri/src/notify/mod.rs` (exemple de module)
- **Écrire** : `src-tauri/src/music/**`, `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`
- **Contrats** : `contracts/ipc.md §6`

## Critères d'acceptation
- [ ] Les 4 commandes, noms et champs exacts (camelCase en JSON).
- [ ] Tests de la logique pure (choix du lecteur, conversion, validation).
- [ ] Essai réel si un lecteur MPRIS tourne (`busctl --user list | grep mpris`) ; sinon le dire.

## Vérification
```bash
export PATH="$HOME/.cargo/bin:$PATH"
npm run build:bridge && cd src-tauri && cargo fmt --check && cargo clippy -- -D warnings && cargo test
```

## Hors périmètre
Pas d'UI, pas de pochette, pas de lecteur local.

## Rapport (rempli par l'agent, 150 mots max)
- Fait : module `music` (4 commandes MPRIS, crate mpris 2.1.0, spawn_blocking), logique pure testée.
- Fichiers touchés : src-tauri/src/music/{mod,commands}.rs, lib.rs (module + 4 handlers), Cargo.toml/lock.
- Vérification : fmt, clippy -D warnings, cargo test OK (3 tests music). Aucun lecteur MPRIS actif : pas d'essai réel.
- Raccourcis pris (`shortcut:`) : aucun.
- À remonter à l'architecte : `music_status` renvoie `null` aussi si le bus est absent ; `music_players` renvoie `[]`.
