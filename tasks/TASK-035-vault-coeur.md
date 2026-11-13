---
id: TASK-035
title: Module vault — lecture des notes Obsidian et ajout au journal
status: done
phase: 5
agent: core
model: sonnet
depends_on: []
branch: task/TASK-035-vault-coeur
---

## Objectif
Les commandes `vault_*` de `contracts/ipc.md §10`, et les deux nouveaux champs de `Settings`
(`vaultPath`, `vaultProject`, §2).

## Contexte utile
- Module `src-tauri/src/vault/`. `Settings` est dans `src-tauri/src/store/mod.rs` : ajoute les deux champs
  avec `#[serde(default)]` (un ancien `settings.json` doit rester lisible). Défaut de `vaultPath` :
  `ATELIER_VAULT` s'il est défini au premier chargement, sinon `null` ; `vaultProject` : `"01 - Projets/Atelier"`.
- **Validation de chemin (point de revue)** : fonction pure testée — relatif, `.md`, pas de `..`, puis
  `canonicalize` et vérification que le résultat reste sous la racine canonicalisée (un lien symbolique qui
  sort est refusé). Taille de lecture plafonnée à 1 Mio.
- Recherche : parcours des `.md` (500 fichiers au plus, 1 Mio chacun), comparaison sans casse ni accents
  (normalisation simple, pas de crate), extrait ≤ 160 caractères autour de la première occurrence.
- `vault_open` : nom du vault = dernier composant de `vaultPath` ; URL `obsidian://open` encodée ; lance par
  le lanceur détaché existant de `src-tauri/src/desktop/mod.rs` (`open_detached`).
- `vault_append_journal` : insère le bloc juste après la première ligne `# …` de `Journal.md` (ou en tête s'il
  n'y en a pas), écriture atomique (fichier temporaire + `sync_all` + `rename`), crée le fichier s'il manque.
- Aucune dépendance nouvelle.

## Fichiers
- **Lire** : `contracts/ipc.md §2, §10`, `src-tauri/src/store/mod.rs`, `src-tauri/src/desktop/mod.rs`, `src-tauri/src/lib.rs`
- **Écrire** : `src-tauri/src/vault/**`, `src-tauri/src/store/mod.rs` (les deux champs), `src-tauri/src/desktop/mod.rs`
  (rendre le lanceur public si besoin), `src-tauri/src/lib.rs`
- **Contrats** : `contracts/ipc.md §2, §10`

## Critères d'acceptation
- [ ] Tests : validation de chemin (`../x.md`, `/etc/passwd`, `a.txt`, lien symbolique sortant refusés),
      recherche avec accents, insertion dans le journal (avec et sans titre, fichier absent), ancien
      `settings.json` sans les nouveaux champs.
- [ ] Essai réel en lecture sur `/home/thomas/Documents/Obsidian Vault` (test ignoré ou commande) ; **aucune
      écriture** dans le vrai vault pendant les tests.

## Vérification
```bash
export PATH="$HOME/.cargo/bin:$PATH" CARGO_TARGET_DIR="$HOME/.cache/atelier-target"
npm run build:bridge && cd src-tauri && cargo fmt --check && cargo clippy -- -D warnings && cargo test
```

## Hors périmètre
Pas d'UI, pas de CLI Obsidian, pas d'écriture hors `Journal.md`.

## Rapport (rempli par l'agent, 150 mots max)
- Fait :
- Fichiers touchés :
- Vérification (sortie résumée) :
- Raccourcis pris (`shortcut:`) :
- À remonter à l'architecte :
