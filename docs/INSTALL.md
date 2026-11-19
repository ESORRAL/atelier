# Installer Atelier (.deb)

## Prérequis
- `node` (Node.js 18 ou plus) dans le `PATH`. Le paquet dépend de `nodejs` ; si tu utilises nvm,
  la version nvm reste prioritaire tant qu'elle est dans le `PATH` de ta session.
- `claude` (Claude Code) installé et connecté (`claude` puis `/login` une fois).

## Construire le paquet
```bash
npm ci
npm run tauri build -- --bundles deb
```
`beforeBuildCommand` lance `npm ci --omit=optional` dans `bridge/` : le pont et ses dépendances
sont embarqués dans `/usr/lib/Atelier/bridge/`, sans le binaire Claude optionnel du SDK.
Le paquet sort dans `src-tauri/target/release/bundle/deb/`.

## Installer
```bash
sudo apt install ./src-tauri/target/release/bundle/deb/Atelier_0.3.1_amd64.deb
```
Puis lance « Atelier » depuis le menu, ou `atelier` dans un terminal.

## Désinstaller
```bash
sudo apt remove atelier
```
Tes sessions et réglages restent dans `~/.local/share/dev.atelier.app/` : supprime ce dossier
pour tout effacer.

## Installer chez un collègue
1. Clone le dépôt.
2. Installe Rust (rustup), Node.js 18 ou plus, et les bibliothèques système de Tauri 2 pour Linux
   (WebKitGTK 4.1, GTK 3 ; liste dans la doc Tauri, « prerequisites »).
3. Installe `claude` et connecte-toi avec **ton propre compte** (`claude` puis `/login`). Atelier ne lit,
   ne stocke ni ne transmet jamais de jeton Claude.
4. Ne copie pas `~/.local/share/dev.atelier.app/` (sessions et cookies) ni `~/.claude/` depuis une autre machine.
5. Règle `ATELIER_VAULT` sur ton propre vault (`export ATELIER_VAULT=/chemin/vers/ton/vault`).
6. Construis le paquet ou lance l'app comme ci-dessus. Les panneaux Instagram et YouTube Shorts utilisent
   leurs propres connexions, saisies dans l'app.

Linux seulement aujourd'hui. Mac et Windows demandent du travail : supervision des process, musique via
MPRIS, panneaux GTK.

## Mettre à jour
Un paquet de même numéro de version n'est **pas** remplacé par `apt install` (« déjà la plus récente version »).
Monte la version dans `package.json`, `src-tauri/tauri.conf.json` et `src-tauri/Cargo.toml` à chaque nouvelle
compilation, ou réinstalle de force : `sudo apt install --reinstall ./…/Atelier_X.Y.Z_amd64.deb`.
