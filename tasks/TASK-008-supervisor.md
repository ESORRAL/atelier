---
id: TASK-008
title: Module supervisor — lancer des process sans jamais laisser d'orphelin
status: done
phase: 2
agent: core
model: opus
depends_on: [TASK-005]
branch: task/TASK-008-supervisor
---

## Objectif
Le module `supervisor` du cœur, conforme à `contracts/ipc.md §4`, qui applique la recette prouvée par le
spike : groupe de process + `killpg` au `Drop` + watchdog qui tue le groupe quand l'app meurt (même SIGKILL).

## Contexte utile
- La recette, ses limites et le code de référence sont dans `spikes/orphans/FINDINGS.md` et
  `spikes/orphans/src/main.rs` (technique `recipe`). Reprends-la, ne la réinvente pas.
- Le watchdog est le binaire de l'app relancé avec l'argument `watchdog <pgid>` : `maybe_run_watchdog()`
  est appelée en tête de `main()` dans `src-tauri/src/main.rs`.
- Le profil release a `panic = "abort"` : le `Drop` n'y tourne pas, le watchdog couvre.
- Le spike a laissé un `shortcut:` sur la réutilisation du pgid : traite-le si c'est simple (pidfd du
  leader), sinon garde le commentaire.
- Dépendances déjà présentes : `tokio`, `libc`. Aucune autre.

## Fichiers
- **Lire** : `contracts/ipc.md §4`, `spikes/orphans/FINDINGS.md`, `spikes/orphans/src/main.rs`
- **Écrire** : `src-tauri/src/supervisor/**`, `src-tauri/src/main.rs` (une ligne : l'appel à `maybe_run_watchdog`),
  `src-tauri/tests/supervisor.rs`
- **Contrats** : `contracts/ipc.md §4` (signatures exactes)

## Critères d'acceptation
- [ ] Signatures exactes du contrat ; `spawn` force stdin/stdout/stderr en `piped`.
- [ ] Tests d'intégration (chaîne `sh -c` → petit-enfant `sleep`, marqueur unique) : `kill()`, `Drop`,
      et mort du process parent par SIGKILL ne laissent ni enfant ni petit-enfant après 2 s.
- [ ] `kill()` appelé deux fois ne panique pas ; `wait()` après `kill()` rend un statut.
- [ ] Le test SIGKILL échoue si on désactive le watchdog (montre-le une fois dans le rapport).

## Vérification
```bash
export PATH="$HOME/.cargo/bin:$PATH"
cd src-tauri && cargo fmt --check && cargo clippy -- -D warnings && cargo test
```

## Hors périmètre
Pas de scope systemd, pas de lancement du pont, pas de commande Tauri.

## Rapport (rempli par l'agent, 150 mots max)
- Fait : `supervisor` selon `ipc.md §4` : groupe de process, `killpg` à `kill()`/`Drop` (idempotent, le watchdog est tué et récolté, jamais de `killpg` tardif), watchdog `watchdog <pgid>` (pgid ≤ 1 refusé). Tests : kill, Drop, SIGKILL du parent (helper relancé), pipes forcés.
- Fichiers touchés : `src-tauri/src/supervisor/mod.rs`, `src-tauri/src/main.rs`, `src-tauri/tests/supervisor.rs`.
- Vérification (sortie résumée) : fmt, clippy OK ; `cargo test` 1 + 4 verts (5 passes stables). Watchdog remplacé par `/bin/true` : `sigkill_of_parent_leaves_nothing` échoue, `left: [1625836, 1625838]` (sh + sleep survivants).
- Raccourcis pris (`shortcut:`) : réutilisation du pgid gardée ; le pidfd du leader ne suffit pas (le groupe survit à son leader).
- À remonter à l'architecte : variable `ATELIER_WATCHDOG_EXE` ajoutée (privée, hors signatures) : en test, `current_exe()` est le harnais, qui ne sait pas faire le watchdog.
