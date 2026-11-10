# Test manuel — fenêtre Instagram isolée (TASK-003)

## Lancer
```bash
export PATH="$HOME/.cargo/bin:$PATH"
cd spikes/instagram && cargo build && ./target/debug/spike-instagram
```
Deux fenêtres s'ouvrent : `main` (page locale « probe ok from main ») et `pause` (Instagram).
Les cookies de `pause` vivent dans `~/.local/share/dev.atelier.spike-instagram/pause-webview/`.

## À vérifier dans la fenêtre `pause`
1. **Page chargée** : la page d'accueil Instagram s'affiche, sans erreur ni page blanche.
2. **Connexion par identifiant** : connecte-toi avec identifiant + mot de passe Instagram
   (pas « avec Google » ni « avec Facebook »). Note tout captcha, blocage ou code demandé.
3. **Reel avec le son** : ouvre un Reel, vérifie que la vidéo défile et que le son sort.
4. **Session conservée** : ferme l'app, relance la commande ; tu dois être encore connecté.
5. **Déconnexion** : déconnecte-toi depuis le menu Instagram ; relance l'app, l'écran de
   connexion doit réapparaître.

## Remonter
Pour chaque point : OK / KO + une phrase. En cas de KO, la sortie du terminal.
Pour tout effacer : `rm -rf ~/.local/share/dev.atelier.spike-instagram/pause-webview`.
