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
sudo apt install ./src-tauri/target/release/bundle/deb/Atelier_0.1.0_amd64.deb
```
Puis lance « Atelier » depuis le menu, ou `atelier` dans un terminal.

## Désinstaller
```bash
sudo apt remove atelier
```
Tes sessions et réglages restent dans `~/.local/share/dev.atelier.app/` : supprime ce dossier
pour tout effacer.
