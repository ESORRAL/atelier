---
id: TASK-017
title: Notifications desktop — permission en attente, tour terminé
status: done
phase: 3
agent: core
model: sonnet
depends_on: [TASK-011]
branch: task/TASK-017-notifications
---

## Objectif
Quand la fenêtre n'a pas le focus, une notification desktop prévient qu'une permission attend une
réponse, ou qu'un tour de Claude est terminé.

## Contexte utile
- Rust dans `~/.cargo/bin`.
- Plugin officiel `tauri-plugin-notification` (dépôt `tauri-apps/plugins-workspace`, version 2.x
  compatible avec Tauri 2.12). Vérifie la version avec `cargo search` avant de l'ajouter. Utilisation
  **côté Rust uniquement** : aucune permission ajoutée à la capability de la fenêtre, aucun appel depuis l'UI.
  Si le plugin exige une permission même côté Rust, arrête-toi et remonte-le.
- Module `src-tauri/src/notify/`. Le module `claude` l'appelle sur deux transitions d'état
  (`contracts/ipc.md` §3) : entrée en `waiting_permission` (« Claude attend ton accord » + nom de l'outil)
  et `running` → `idle` (« Claude a terminé » + titre de la session). Rien si la fenêtre principale a le
  focus. Pas plus d'une notification par session toutes les 5 s pour le même motif.
- Point d'appel : une seule ligne ou un petit crochet dans `claude`, sans changer sa logique.

## Fichiers
- **Lire** : `contracts/ipc.md` §3, `src-tauri/src/claude/` (là où l'état change), `src-tauri/src/lib.rs`
- **Écrire** : `src-tauri/src/notify/**`, `src-tauri/src/claude/` (le point d'appel seulement),
  `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`
- **Contrats** : `contracts/ipc.md`

## Critères d'acceptation
- [ ] Logique de décision (focus, motif, limite de 5 s) dans une fonction pure testée.
- [ ] `src-tauri/capabilities/main.json` inchangé.
- [ ] Essai réel une fois : notification affichée sur le bureau (envoie-en une de test au lancement en
      mode debug derrière une fonction que tu supprimes ensuite, ou décris ce que tu as vu).

## Vérification
```bash
export PATH="$HOME/.cargo/bin:$PATH"
cd src-tauri && cargo fmt --check && cargo clippy -- -D warnings && cargo test
```

## Hors périmètre
Pas de son, pas de réglage pour couper les notifications (plus tard), pas d'UI.

## Rapport (rempli par l'agent, 150 mots max)
- Fait : module `notify` (Tracker pur : focus, motif, limite 5 s par session et motif) + plugin notification côté Rust ; crochet dans le sink de `session_start`.
- Fichiers touchés : src-tauri/src/notify/mod.rs, claude/commands.rs, lib.rs, Cargo.toml, Cargo.lock.
- Vérification : fmt, clippy -D warnings, test OK (4 tests notify). capabilities/main.json inchangé.
- Raccourcis pris (`shortcut:`) : aucun.
- À remonter à l'architecte : essai réel sur le bureau NON fait (pas de session graphique pilotée). Plugin 2.8.1 sans permission de capability.
