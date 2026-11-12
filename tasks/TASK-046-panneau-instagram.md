---
id: TASK-046
title: Panneau Instagram intégré dans l'app (re-parentage GTK), fenêtre séparée en repli
status: todo
phase: 5
agent: core
model: opus
depends_on: [TASK-045, TASK-037, TASK-040]
branch: task/TASK-046-panneau-instagram
---

## Objectif
Le bouton Instagram du rail ouvre un panneau qui glisse depuis la gauche, à côté du rail, par-dessus
l'interface, comme le panneau Musique. Contrat : `contracts/ipc.md §15` (et `instagramMode` dans §2).

## Contexte utile
- La recette prouvée est dans `spikes/instagram-panneau/` (`src/main.rs`, `FINDINGS.md`) : reprends-la.
  Rust dans `~/.cargo/bin` ; `npm run build:bridge` avant cargo.
- **Cœur** : module `src-tauri/src/windows/` (à côté de la fenêtre séparée existante). Crate `gtk = "=0.18.2"`
  et feature `unstable` de tauri, rien d'autre. Épingle `tauri` en version exacte (`=2.12.5`). Le panneau est
  créé à la première ouverture (`add_child`), re-parenté, puis seulement affiché/masqué ; si l'installation
  échoue (le `GtkBox` ne contient pas les deux webviews), repli sur `pause_window_open` et retour `"window"`.
  Test Rust qui vérifie la logique de détection du montage là où c'est testable sans écran ; fonction pure
  pour la décision panneau/fenêtre. `main.queue_draw()` en fin d'animation (bande non repeinte en X11).
- **Isolation** : passe `src-tauri/capabilities/main.json` de `windows` à `webviews: ["main"]` et étends le
  test existant des capabilities : il doit échouer si une capability cible une **fenêtre** ou cite
  `instagram`, ou contient `remote`. Liste blanche de navigation et ouverture externe limitée : réutilise
  celles de `src-tauri/src/windows/`. `data_directory` propre au panneau.
- **Réglage** `instagramMode` dans `Settings` (`src-tauri/src/store/mod.rs`, `#[serde(default)]`, défaut `panel`).
- **UI** : le bouton du rail et l'entrée de palette appellent `pause_panel_toggle` (`src/ipc/desktop.ts`) et
  gardent l'état ouvert/fermé (le rail montre le bouton actif) ; Échap ferme le panneau quand le focus est dans
  l'app ; mode Focus ferme et masque. Le panneau Musique et le panneau Instagram ne sont jamais ouverts
  ensemble (ouvrir l'un ferme l'autre). Réglage du mode dans `src/features/settings/`.
- Essai réel : lance l'app construite (pas `tauri dev` : l'app de l'utilisateur tourne sur le port 1420) avec
  `timeout`, ouvre et ferme le panneau quelques fois ; ne tue que tes propres process. Aucune connexion.

## Fichiers
- **Lire** : `spikes/instagram-panneau/`, `contracts/ipc.md §2, §13, §15`, `src-tauri/src/windows/`, `src-tauri/src/lib.rs`,
  `src-tauri/capabilities/main.json`, `src-tauri/src/store/mod.rs`, `src/App.tsx`, `src/shell/`, `src/ipc/desktop.ts`, `src/features/settings/`
- **Écrire** : `src-tauri/src/windows/**`, `src-tauri/src/lib.rs`, `src-tauri/src/store/mod.rs`, `src-tauri/Cargo.toml`,
  `src-tauri/Cargo.lock`, `src-tauri/capabilities/main.json`, `src/App.tsx`, `src/shell/**`, `src/ipc/desktop.ts`,
  `src/ipc/claude.ts` (type `Settings`), `src/features/settings/**`
- **Contrats** : `contracts/ipc.md §2, §13, §15`

## Critères d'acceptation
- [ ] Le panneau glisse à côté du rail ; repli automatique sur la fenêtre si l'installation échoue.
- [ ] Capabilities par `webviews`, test étendu ; tests Rust et Vitest verts.

## Vérification
```bash
export PATH="$HOME/.cargo/bin:$PATH" CARGO_TARGET_DIR="$HOME/.cache/atelier-target"
npm ci && npm run lint && npm test && npm run build
npm run build:bridge && cd src-tauri && cargo fmt --check && cargo clippy -- -D warnings && cargo test
```

## Hors périmètre
Aucun script dans la page, aucune lecture du contenu d'Instagram, aucune connexion.

## Rapport (rempli par l'agent, 150 mots max)
- Fait : `pause_panel_toggle` (webview `instagram-panel` créée à la 1re ouverture, montage GTK du spike, repli fenêtre définitif si le `GtkBox` ne contient pas les deux webviews), `instagramMode` (défaut `panel`), capability `webviews: ["main"]` et test étendu ; rail/palette/Échap/Focus, exclusion Musique, réglage.
- Fichiers touchés : `src-tauri/src/windows/{panel,commands,mod}.rs`, `lib.rs`, `store/mod.rs`, `Cargo.toml/.lock`, `capabilities/main.json`, `src/App.tsx`, `src/shell/Rail.tsx`, `src/ipc/{desktop,claude}.ts`, `src/features/settings/{index.tsx,validate.test.ts}`.
- Vérification : lint, 108 Vitest, build, fmt, clippy, 60 tests Rust verts. Essai réel (Wayland, pilote temporaire non commité) : panneau à 56,56, 420×544, masqué hors écran, 14 bascules sans plantage.
- Raccourcis pris : aucun.
- À remonter : une fois le panneau créé, `main` n'est plus une « webview window » : `notify/mod.rs` (`get_webview_window("main")`) voit toujours « non focalisé » → passer à `get_window("main")`. Clics souris non testés.
