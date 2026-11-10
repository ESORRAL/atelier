---
id: TASK-008
title: Module supervisor — lancer des process sans jamais laisser d'orphelin
status: todo
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
- Fait :
- Fichiers touchés :
- Vérification (sortie résumée) :
- Raccourcis pris (`shortcut:`) :
- À remonter à l'architecte :
