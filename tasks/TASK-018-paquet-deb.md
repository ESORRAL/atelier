---
id: TASK-018
title: Paquet .deb installable, pont embarqué
status: todo
phase: 3
agent: core
model: opus
depends_on: [TASK-011]
branch: task/TASK-018-paquet-deb
---

## Objectif
`npm run tauri build` produit un `.deb` qui s'installe et marche hors du repo : le pont Node est embarqué
dans le paquet et trouvé à l'exécution.

## Contexte utile
- Rust dans `~/.cargo/bin`. Le chemin du pont est aujourd'hui `CARGO_MANIFEST_DIR/../bridge/main.mjs`
  avec un `shortcut:` : c'est lui qu'il faut lever.
- Embarque `bridge/main.mjs`, `bridge/package.json` et `bridge/node_modules` en ressources Tauri
  (`bundle.resources`) ; à l'exécution, cherche le pont dans `resource_dir()`, avec repli sur le chemin
  de développement en build debug seulement.
- Le SDK embarque un binaire Claude optionnel dont nous n'avons pas besoin (on passe
  `pathToClaudeCodeExecutable`). Exclus-le du paquet (installation avec `--omit=optional` ou filtre des
  ressources) et vérifie que le pont marche sans lui. Donne la taille finale du `.deb`.
- `node` reste une dépendance système : déclare-la dans les dépendances du `.deb` si Tauri le permet
  (`bundle.linux.deb.depends`), sinon documente-le.
- `npm ci` de `bridge/` doit avoir tourné avant le build : ajoute-le à `beforeBuildCommand`.
- Aucune dépendance Rust nouvelle.

## Fichiers
- **Lire** : `src-tauri/tauri.conf.json`, `src-tauri/src/claude/` (résolution du chemin du pont),
  `bridge/package.json`
- **Écrire** : `src-tauri/tauri.conf.json`, `src-tauri/src/claude/` (résolution du chemin seulement),
  `package.json` (scripts), `docs/INSTALL.md` (nouveau, français, 30 lignes max)
- **Contrats** : `contracts/ipc.md` §5 (l'architecte le mettra à jour d'après ton rapport)

## Critères d'acceptation
- [ ] `npm run tauri build -- --bundles deb` réussit ; taille du `.deb` donnée.
- [ ] `dpkg-deb -c` montre le pont et pas le binaire Claude optionnel.
- [ ] Le binaire installé, lancé depuis l'extraction du `.deb` (`dpkg-deb -x` dans un dossier
      temporaire, sans `sudo`), trouve le pont : prouve-le par un test ou une sortie de log.
- [ ] `docs/INSTALL.md` : prérequis (`node`, `claude`), installation, désinstallation.

## Vérification
```bash
export PATH="$HOME/.cargo/bin:$PATH"
cd src-tauri && cargo fmt --check && cargo clippy -- -D warnings && cargo test && cd .. && npm run tauri build -- --bundles deb
```

## Hors périmètre
Pas d'installation système (`sudo dpkg -i` : c'est l'utilisateur qui le fera), pas d'AppImage, pas de
signature, pas de mise à jour automatique.

## Rapport (rempli par l'agent, 150 mots max)
- Fait : pont embarqué en ressources (`/usr/lib/Atelier/bridge/`), `bridge_path(resource_dir)` avec repli dev en debug seulement, log `[claude] bridge: <chemin>` ; `npm ci --omit=optional` dans `beforeBuildCommand` ; `Depends: nodejs`.
- Fichiers touchés : `src-tauri/tauri.conf.json`, `src-tauri/src/claude/{session,commands,mod}.rs`, `package.json`, `docs/INSTALL.md`.
- Vérification : fmt/clippy OK, tests 16+4+4 OK ; `.deb` 10,66 Mio ; `dpkg-deb -c` : pont présent, aucun `claude-agent-sdk-linux-*` ; `dpkg-deb -x` puis `usr/bin/../lib/Atelier` résout, `smoke.mjs` réel sur le pont extrait : `result: success "pong"`.
- Raccourcis : aucun. Lancement GUI du binaire extrait non fait (pas de session sans clic) : preuve = test unitaire + règle `resource_dir` de Tauri + smoke.
- À remonter : `cargo build` exige désormais `bridge/node_modules` ; en debug le pont lancé est la copie `target/debug/bridge/`.
