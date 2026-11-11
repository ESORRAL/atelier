---
id: TASK-033
title: Recherche dans le catalogue Apple — music_search, music_lookup, music_open_url
status: todo
phase: 4
agent: core
model: opus
depends_on: []
branch: task/TASK-033-recherche-apple-coeur
---

## Objectif
Les trois commandes de `contracts/ipc.md §9`, avec les ajouts de CSP minimaux qu'il autorise.

## Contexte utile
- Rust dans `~/.cargo/bin`. `npm run build:bridge` avant `cargo`.
- Client HTTP : crate `reqwest` (hyperium/seanmonstar, officielle de fait), `default-features = false` avec
  TLS rustls et `json` ; vérifie la version et les noms de features avec `cargo search` et la doc. Une seule
  dépendance directe nouvelle (plus ses transitives). Délai de 8 s, pas de redirection hors `itunes.apple.com`.
- API : `GET https://itunes.apple.com/search?term=<...>&entity=<musicArtist|album|song>&limit=<n>&country=fr`
  et `GET https://itunes.apple.com/lookup?id=<id>&entity=<album|song>&country=fr`. L'extraction (JSON vers
  `MusicArtist`/`MusicAlbum`/`MusicSong`) est une fonction **pure testée avec des JSON d'exemple** : champs
  absents → `null`, `artworkUrl100` → taille 200x200, durées en ms, année tirée de `releaseDate`. Pour un
  lookup d'artiste, le premier résultat est l'artiste lui-même : ignore-le.
- **Sécurité (point central de la revue)** : liste blanche d'hôtes du contrat §9 appliquée à chaque URL
  renvoyée ; construction des URL de requête par encodage, jamais par concaténation brute ; `music_open_url`
  valide avant `xdg-open` (réutilise le lanceur détaché de `music_open`).
- CSP : édite `src-tauri/tauri.conf.json` pour ajouter **uniquement** `img-src` (`'self' data:
  https://*.mzstatic.com`, en gardant ce qui existe déjà) et `media-src` (`'self'
  https://audio-ssl.itunes.apple.com https://*.mzstatic.com`). Rien d'autre. `capabilities/main.json` inchangé.
- Hors ligne ou erreur HTTP : erreur française, jamais de panique.
- Place le code dans `src-tauri/src/music/` (nouveau fichier `catalog.rs`) et enregistre les commandes
  dans `lib.rs`.

## Fichiers
- **Lire** : `contracts/ipc.md §9`, `src-tauri/src/music/`, `src-tauri/src/desktop/mod.rs` (lanceur `xdg-open`), `src-tauri/tauri.conf.json`
- **Écrire** : `src-tauri/src/music/**`, `src-tauri/src/desktop/mod.rs` (si tu factorises le lanceur),
  `src-tauri/src/lib.rs`, `src-tauri/tauri.conf.json` (CSP seulement), `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`
- **Contrats** : `contracts/ipc.md §9`

## Critères d'acceptation
- [ ] Tests purs : construction d'URL (accents, espaces, `&`, `#`), extraction sur des JSON d'exemple (artiste,
      album, morceau sans aperçu), liste blanche d'hôtes (`music.apple.com` accepté ; `evil.example`,
      `music.apple.com.evil.example`, `http://`, `javascript:`, `file://` refusés).
- [ ] Un essai réel de `music_search` et `music_lookup` (`curl` ou test ignoré) ; dis ce que tu as vu.
- [ ] CSP : diff limité aux deux directives.

## Vérification
```bash
export PATH="$HOME/.cargo/bin:$PATH"
npm run build:bridge && cd src-tauri && cargo fmt --check && cargo clippy -- -D warnings && cargo test
```

## Hors périmètre
Pas d'UI, pas de compte Apple, pas de playlists de l'utilisateur.

## Rapport (rempli par l'agent, 150 mots max)
- Fait :
- Fichiers touchés :
- Vérification (sortie résumée) :
- Raccourcis pris (`shortcut:`) :
- À remonter à l'architecte :
