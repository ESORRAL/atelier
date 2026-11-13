---
id: TASK-011
title: Module claude — brancher pont, superviseur et store sur les commandes Tauri
status: done
phase: 2
agent: core
model: opus
depends_on: [TASK-008, TASK-009, TASK-010]
branch: task/TASK-011-module-claude
---

## Objectif
Les commandes du `contracts/ipc.md §1` fonctionnent de bout en bout : depuis l'app, on démarre une session,
on envoie un message, la réponse de Claude arrive en direct sur le `Channel`, les permissions passent par
l'interface, tout est journalisé, et fermer l'app ne laisse aucun process.

## Contexte utile
- Rust dans `~/.cargo/bin` : `export PATH="$HOME/.cargo/bin:$PATH"`.
- Les trois briques existent et sont testées : `supervisor::spawn` (groupe de process + watchdog),
  `store::Store`, et le pont `bridge/main.mjs` (lancé par `node`). Utilise-les, ne les modifie pas.
- Pont : `node <CARGO_MANIFEST_DIR>/../bridge/main.mjs` en développement
  (`shortcut:` emplacement installé tranché en phase 3). `node` et `claude` sont cherchés dans le `PATH`
  (parcours de la variable, pas de crate) ; `settings.claudePath` prime s'il est renseigné. Introuvable →
  erreur française claire (« Claude Code introuvable : … »).
- Lis le pont ligne par ligne sur stdout ; stderr va dans le journal de l'app (`eprintln!`), jamais dans l'UI.
- Traduction pont → `SessionEvent` : `sdk` → `sdk`, `permission_request` / `permission_cancelled` /
  `error` tels quels, `models` répond à l'appel `session_models` en attente (canal `oneshot`), `ready` et
  `closed` pilotent l'état. Règles d'état : `contracts/ipc.md §3`. `session_send` émet et journalise
  `{kind:"user", text}` avant d'écrire au pont.
- Index : à chaque `system/init`, `claudeSessionId` et `model` ; à chaque `result`, `costUsd` =
  `total_cost_usd` (remplacer) ; titre = premier message utilisateur, 60 caractères ; `updatedAt` à chaque
  événement. `session_start` place `cwd` en tête de `settings.recentCwds` (10 au plus, sans doublon).
- Store ouvert dans `setup` avec `app.path().app_data_dir()`, géré par Tauri avec l'état des sessions.
- Fermeture de la fenêtre principale : `close` à chaque pont, 2 s d'attente, puis `kill()`.
- Testabilité : la logique pure (traduction + état + mise à jour d'index) est une fonction testée sans
  Tauri. Un test d'intégration lance un **faux pont** (`src-tauri/tests/fake-bridge.mjs`, quelques lignes de
  Node qui rejouent le protocole) à la place du vrai, par un paramètre interne du lanceur, sans variable
  d'environnement lue en release.
- Si le `Channel` est refusé par l'ACL avec `permissions: []`, arrête-toi et remonte l'erreur exacte et la
  plus petite permission qui la corrige. Ne la change pas toi-même.
- Dépendances : celles déjà présentes. Aucune autre.

## Fichiers
- **Lire** : `contracts/ipc.md`, `contracts/bridge-protocol.md §2-3`, `src-tauri/src/supervisor/mod.rs`
  (signatures), `src-tauri/src/store/mod.rs` (signatures), `src-tauri/src/lib.rs`
- **Écrire** : `src-tauri/src/claude/**`, `src-tauri/src/lib.rs`, `src-tauri/tests/claude.rs`,
  `src-tauri/tests/fake-bridge.mjs`
- **Contrats** : `contracts/ipc.md`, `contracts/bridge-protocol.md`

## Critères d'acceptation
- [ ] Les 12 commandes du §1 enregistrées, noms et arguments exacts.
- [ ] Tests purs : chaque ligne du tableau §3, coût remplacé, titre, `recentCwds`.
- [ ] Test d'intégration avec le faux pont : démarrage, un tour, une permission accordée, `session_models`,
      fermeture ; journal relu par `session_history` dans le bon ordre ; aucun process restant.
- [ ] Mort du pont pendant une permission → état `crashed`, demande annulée.
- [ ] Essai réel une fois : `npm run tauri dev`, puis depuis le terminal de l'app (console WebKit) ou un
      test manuel, une session Haiku dans un dossier vide qui répond à « dis bonjour ». Note le résultat dans
      le rapport ; si l'UI ne permet pas encore l'essai, dis-le.

## Vérification
```bash
export PATH="$HOME/.cargo/bin:$PATH"
cd src-tauri && cargo fmt --check && cargo clippy -- -D warnings && cargo test
```

## Hors périmètre
Pas d'UI, pas de notifications, pas de changement des modules existants ni des contrats.

## Rapport (rempli par l'agent, 150 mots max)
- Fait : 12 commandes §1 + `app_version`. `Core` pur (traduction, état §3, index), `Claude` lance le pont par `supervisor::spawn`, journalise avant d'émettre, `close_all` à la destruction de la fenêtre `main` (2 s puis kill). Faux pont injecté par `start_with_bridge` (aucune variable d'environnement).
- Fichiers touchés : `src-tauri/src/claude/{mod,session,commands}.rs`, `src-tauri/src/lib.rs`, `src-tauri/tests/{claude.rs,fake-bridge.mjs}`.
- Vérification (sortie résumée) : fmt et clippy propres ; 15 tests unitaires, 3 d'intégration (+ supervisor) verts. Essai réel Haiku (test `#[ignore]`, vrai pont) : « Bonjour ! Qu'est-ce que tu veux faire aujourd'hui ? », état `idle`, aucun process restant.
- Raccourcis pris (`shortcut:`) : chemin du pont en développement seulement.
- À remonter à l'architecte : essai par `npm run tauri dev` non fait (pas de pilotage de l'UI) : ACL du `Channel` non vérifiée. `session_models` expire après 15 s si le pont ne répond pas. `bridge/node_modules` requis (`npm ci`).
