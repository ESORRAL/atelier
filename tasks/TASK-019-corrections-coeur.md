---
id: TASK-019
title: Corrections d'audit — cœur Rust, store et pont
status: done
phase: 3
agent: core
model: opus
depends_on: [TASK-017]
branch: task/TASK-019-corrections-coeur
---

## Objectif
Corriger les bugs du cœur trouvés par les deux audits, et mettre le code au niveau des contrats
`ipc.md` 1.2 et `bridge-protocol.md` 1.1.

## Contexte utile
Rust dans `~/.cargo/bin`. Chaque point est indépendant ; un test par point quand c'est faisable.
1. **États** (`ipc.md` §3 v1.2) : `idle` dès que `start` est envoyé, `running` dès que `session_send`
   a écrit au pont, `system/init` ne change plus l'état. Corrige « Démarrage… » sans fin et l'absence de
   bouton Arrêter avant le premier `init`.
2. **Journal** : ne plus journaliser les `stream_event` ; index réécrit seulement si une valeur change.
   Le flux ne doit plus rouvrir et réécrire `sessions.json` à chaque fragment.
3. **Reprise** (`ipc.md` « Reprise et index ») : réutiliser la clé de l'entrée reprise ; coût = coût de
   l'entrée à la reprise + `total_cost_usd` courant ; entrée créée au premier `session_send` seulement.
4. **Store robuste** : `sync_all` avant `rename` ; `settings.json` ou `sessions.json` illisible →
   renommé en `.bak`, valeurs par défaut, avertissement sur stderr (au lieu d'une erreur qui bloque tout).
5. **Permission** : si l'écriture de `permission_response` au pont échoue, remettre la demande en attente
   et renvoyer l'erreur.
6. **Envoi** : journaliser le tour `user` après une écriture réussie au pont, pas avant.
7. **Validation** : `cwd` (`~` développé, absolu, existant, pas `/`) ; `claudePath` de `settings_set`
   (absolu, fichier exécutable) ; messages d'erreur en français.
8. **Mémoire** : session `crashed` retirée de la table à la fin de sa tâche de lecture ; lignes du pont
   plafonnées à 16 Mo (au-delà : ligne ignorée, `error` non fatal).
9. **Modèles** (`bridge-protocol.md` 1.1) : `requestId` sur `list_models` / `models`, dans le pont et
   dans le cœur ; une réponse tardive n'atteint plus le mauvais demandeur. Lève le `shortcut:` existant.
10. **Build** : `bundle.targets` limité à Linux si ce n'est pas déjà fait par TASK-018 (vérifie
    `tauri.conf.json` sur `origin/main` avant de toucher).

## Fichiers
- **Lire** : `contracts/ipc.md`, `contracts/bridge-protocol.md`, `src-tauri/src/claude/`, `src-tauri/src/store/mod.rs`, `bridge/main.mjs`
- **Écrire** : `src-tauri/src/claude/**`, `src-tauri/src/store/**`, `src-tauri/tests/**`, `bridge/main.mjs`,
  `bridge/main.test.mjs`, `src-tauri/tauri.conf.json` (point 10 seulement)
- **Contrats** : `contracts/ipc.md` 1.2, `contracts/bridge-protocol.md` 1.1

## Critères d'acceptation
- [ ] Les 10 points traités, ou expliqués s'ils ne sont pas faisables.
- [ ] Tests ajoutés pour 1, 2, 3, 4, 5, 7, 9.

## Vérification
```bash
export PATH="$HOME/.cargo/bin:$PATH"
cd bridge && npm ci --ignore-scripts && node --test && cd ../src-tauri && cargo fmt --check && cargo clippy -- -D warnings && cargo test
```

## Hors périmètre
Pas d'UI (TASK-020), pas de paquet (TASK-018).

## Rapport (rempli par l'agent, 150 mots max)
- Fait : les 10 points. États `idle`/`running` (verrou `turn` : une réponse n'est jamais traitée avant son tour) ; `stream_event` non journalisés, index écrit au premier envoi puis seulement sur changement ; reprise sur la même clé, coût additionné ; store `sync_all` + `.bak` ; permission remise en attente ; tour `user` journalisé après écriture ; validation `cwd`/`claudePath` ; session terminée retirée de la table, lignes > 16 Mo ignorées ; `requestId` des modèles ; `targets` = deb, rpm, appimage.
- Fichiers touchés : `src-tauri/src/claude/{mod,session}.rs`, `src-tauri/src/store/mod.rs`, `src-tauri/tests/{claude.rs,fake-bridge.mjs}`, `bridge/main{,.test}.mjs`, `src-tauri/tauri.conf.json`.
- Vérification : node 17/17 ; fmt, clippy OK ; cargo test 26 + 6 + 4 OK (claude ×6 sans échec).
- Raccourcis pris : aucun ; l'ancien `shortcut:` des modèles est levé.
- À remonter : `session_close` sur une session crashée renvoie maintenant `Session inconnue` (TASK-020 doit l'ignorer). Une reprise d'une session déjà ouverte est refusée.
