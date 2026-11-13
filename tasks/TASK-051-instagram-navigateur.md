---
id: TASK-051
title: Bouton « Ouvrir dans le navigateur » pour Instagram
status: done
phase: 5
agent: core
model: sonnet
depends_on: [TASK-046]
branch: task/TASK-051-instagram-navigateur
---

## Objectif
Les Reels saccadent dans le panneau (limite de WebKitGTK). Offrir une sortie fluide : `contracts/ipc.md §16`.

## Contexte utile
- **Cœur** : commande `pause_open_browser` dans `src-tauri/src/windows/commands.rs`, sur le modèle de
  `music_open` (`src-tauri/src/desktop/`, `open_detached`) ; adresse fixe en constante ; enregistrée dans `lib.rs`.
- **UI** : appel typé dans `src/ipc/desktop.ts`. Quand le panneau Instagram est ouvert, un bouton discret
  « Ouvrir dans le navigateur » (icône + libellé accessible) apparaît dans la barre du haut de `src/App.tsx`
  (le panneau natif couvre la zone sous la barre : rien ne peut être dessiné dessus). Il ouvre le navigateur
  et ferme le panneau. Même action dans la palette (`src/shell/`). Styles par tokens, texte en français.
- Aucune dépendance. Ne lis jamais l'adresse ni le contenu du panneau.

## Fichiers
- **Lire** : `contracts/ipc.md §15, §16`, `src-tauri/src/windows/`, `src-tauri/src/desktop/`, `src-tauri/src/lib.rs`,
  `src/App.tsx`, `src/shell/`, `src/ipc/desktop.ts`
- **Écrire** : `src-tauri/src/windows/**`, `src-tauri/src/lib.rs`, `src/App.tsx`, `src/shell/**`, `src/ipc/desktop.ts`,
  le CSS déjà importé par `App.tsx`

## Vérification
```bash
export PATH="$HOME/.cargo/bin:$PATH" CARGO_TARGET_DIR="$HOME/.cache/atelier-target"
npm ci && npm run lint && npm test && npm run build
npm run build:bridge && cd src-tauri && cargo fmt --check && cargo clippy -- -D warnings && cargo test
```

## Rapport (rempli par l'agent, 150 mots max)
- Fait : commande `pause_open_browser` (adresse fixe), appel `pauseOpenBrowser`, bouton « Navigateur » dans la barre du haut (visible panneau ouvert) et commande de palette ; ouvre le navigateur puis ferme le panneau.
- Fichiers touchés : windows/commands.rs, lib.rs, src/App.tsx, src/ipc/desktop.ts.
- Vérification : lint, 115 tests UI, build, fmt, clippy, cargo test OK. Aucun test ajouté (pas d'ouverture de navigateur).
- Raccourcis pris (`shortcut:`) : aucun.
- À remonter à l'architecte : rien.
