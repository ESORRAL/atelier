# ADR-0001 — Stack : Tauri 2 + Rust + React/TypeScript

- **Statut** : proposé (à valider au GO de la phase 0)
- **Date** : 2026-11-10

## Contexte
L'app doit superviser un process CLI (aucun orphelin), afficher un flux JSON en streaming, ouvrir une
fenêtre web isolée (Instagram), piloter des lecteurs via D-Bus, et rester légère. Machine cible :
Ubuntu 24.04, WebKitGTK 2.52.6.

## Options comparées
| Option | Taille / RAM | DRM (Widevine) | Isolation web | Supervision de process | Maturité Linux |
|---|---|---|---|---|---|
| **Tauri 2.12 (WebKitGTK)** | ~5–10 Mo, RAM basse (estimation) | non | bonne avec une fenêtre séparée | Rust : très bonne | bonne, sauf webviews enfants |
| Electron (build castlabs) | 100+ Mo, RAM haute | oui (non vérifié) | excellente (partitions de session) | Node : simple | très mûr |
| Tauri 3 alpha + CEF | gros | possible, non vérifié | comme Tauri | Rust | alpha |
| Qt6 WebEngine | gros | possible, non vérifié | un profil par vue | C++/Python | mûr |
| GTK4 / libadwaita | petit | non | comme Tauri | natif | mûr, sans écosystème UI web |

## Décision
**Tauri 2 (stable 2.12.x) + Rust pour le cœur + React/TypeScript (Vite) pour l'UI.**

- Le besoin central est la supervision de process et le D-Bus : c'est le terrain de Rust.
- Aucune fonction du produit ne dépend du DRM : la musique passe par MPRIS (ADR-0004), pas par un
  lecteur web.
- Légèreté : l'app reste ouverte toute la journée à côté du CLI.

## Conséquences et limites
- **Pas de webview enfant** : sous Linux, les webviews intégrées de Tauri sont derrière la feature
  `unstable` et ont deux bugs ouverts (tauri#10420 : positions ignorées ; #11376 : seule la dernière
  s'affiche). Toute page externe s'ouvre dans une **fenêtre séparée** (ADR-0003).
- **Pas de Widevine** dans WebKitGTK : Spotify Web et autres lecteurs à DRM ne marcheront pas dans l'app.
- Dépendances système à installer (hors liste du prompt §2, donc soumises à validation) :
  toolchain Rust via rustup, et
  `libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`
  (page officielle des prérequis Tauri).

## À vérifier par un spike en phase 1
- Connexion Instagram et lecture des Reels dans WebKitGTK 2.52.6 (paquets `gstreamer1.0-plugins-good`,
  `-bad`, `-libav`). Aucune source ne confirme ni n'infirme.
- Isolation réelle des cookies avec un `data_directory` distinct par fenêtre.

Si le spike Instagram échoue, le plan B est décrit dans l'ADR-0003 ; il ne remet pas la stack en cause.

## Sources
- https://v2.tauri.app/start/prerequisites/ · https://v2.tauri.app/security/capabilities/
- https://github.com/tauri-apps/tauri/issues/10420
