---
id: TASK-010
title: Module store — réglages, index des sessions, journal d'événements
status: done
phase: 2
agent: core
model: sonnet
depends_on: []
branch: task/TASK-010-store
---

## Objectif
Le module `store` du cœur, conforme à `contracts/ipc.md §4`, avec les types `SessionEntry` et `Settings` du §2.

## Contexte utile
- Fichiers simples sous le dossier de base reçu : `settings.json`, `sessions.json`, `sessions/<key>.ndjson`.
  Pas de base de données.
- Écriture atomique de `settings.json` et `sessions.json` : fichier temporaire dans le même dossier puis
  `std::fs::rename`.
- `append_event` ajoute une ligne JSON terminée par `\n` ; `read_events` ignore les lignes illisibles
  (une ligne coupée par un crash ne doit pas tout perdre).
- Validation de `key` : `[A-Za-z0-9-]`, 1 à 64 caractères, sinon `io::ErrorKind::InvalidInput`.
- Dépendances : `serde`, `serde_json` (déjà là). Tests avec un dossier temporaire créé à la main sous
  `std::env::temp_dir()` (pas de crate `tempfile`).

## Fichiers
- **Lire** : `contracts/ipc.md §2` et `§4`
- **Écrire** : `src-tauri/src/store/**`
- **Contrats** : `contracts/ipc.md`

## Critères d'acceptation
- [ ] Signatures et noms de champs exacts (camelCase en JSON).
- [ ] Tests : aller-retour des réglages (et défauts si absent), upsert puis tri par `updatedAt`,
      journal avec une ligne corrompue au milieu, clé invalide refusée (`../x`, chaîne vide).

## Vérification
```bash
export PATH="$HOME/.cargo/bin:$PATH"
cd src-tauri && cargo fmt --check && cargo clippy -- -D warnings && cargo test
```

## Hors périmètre
Pas de commande Tauri, pas de verrou entre process.

## Rapport (rempli par l'agent, 150 mots max)
- Fait : module `store` complet (types, Store, écriture atomique, validation de clé, 4 tests).
- Fichiers touchés : src-tauri/src/store/mod.rs, cette fiche.
- Vérification : fmt, clippy -D warnings OK ; cargo test 5 passed.
- Raccourcis pris (`shortcut:`) : upsert relit/réécrit tout sessions.json ; recentCwds non tronqué à 10 (à faire par l'appelant) ; fichier tmp au nom fixe (pas de verrou, hors périmètre).
- À remonter à l'architecte : rien.
