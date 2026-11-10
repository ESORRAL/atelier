# Spike TASK-003 — constats : fenêtre Instagram isolée

Tauri 2.12.5 (sans `unstable`, `WebviewWindowBuilder` seul), WebKitGTK 2.52.6, Ubuntu 24.04, Wayland.
Test : `./run-isolation-test.sh` (sert `test-page/` sur `127.0.0.1:<port>` avec `python3 -m http.server`).

## Prouvé (test automatique, PASS)
- **Aucun appel ne passe depuis `pause`.** `withGlobalTauri` est activé exprès : la page externe *voit*
  `__TAURI__`, `__TAURI_INTERNALS__` et `window.ipc` (Tauri les injecte partout). Mais :
  `__TAURI__.core.invoke` et `__TAURI_INTERNALS__.invoke` → refus `probe not allowed on window "pause"` ;
  `ipc.postMessage` / `webkit.messageHandlers.ipc` bruts → ignorés ; `fetch ipc://localhost/probe` → 500 ;
  `fetch http://ipc.localhost` → échec. Compteur Rust : `PROBE_CALLS main` (seul le témoin `main` passe).
- **Le test détecte bien une fuite** : en ajoutant `pause` + `remote.urls` à la capability, il échoue
  (`PROBE_CALLS main,pause,pause`). Le verrou tient à deux choses : `AppManifest::commands(&["probe"])`
  dans `build.rs` et une capability qui ne liste que `main`.
- **Cookies isolés** : cookie persistant posé dans `pause` ; une fenêtre sur le store par défaut (celui de
  `main`) ne le voit pas (`[]`), une fenêtre sur le `data_directory` de `pause` le voit (témoin).
- **Dossier distinct sur disque** : `~/.local/share/dev.atelier.spike-instagram/pause-webview/` contient
  son propre fichier `cookies`. Le store par défaut est `~/.local/share/dev.atelier.spike-instagram/`
  (le dossier de `pause` est donc un *sous-dossier* : distinct, mais imbriqué).
- **Navigation filtrée** via `on_navigation` : `https` + `instagram.com`, `cdninstagram.com`,
  `facebook.com` et leurs sous-domaines (plus l'hôte de `PAUSE_URL`, pour le test en http).
  `location.href` vers `localhost` → `NAVIGATION_BLOCKED`, la page n'est jamais demandée au serveur.
  Test unitaire de la liste (`cargo test`) : `evilinstagram.com` et `http://` refusés.
- `window.open` hors liste : la page n'est pas chargée non plus, mais c'est le bloqueur de popups de
  WebKit qui l'arrête (pas de geste utilisateur) ; `on_new_window` → `Deny` n'a pas été déclenché.

## Non prouvé
- Tout ce qui touche à Instagram réel : chargement, connexion, Reels, son, session après redémarrage,
  déconnexion → `MANUEL.md`, à faire par l'utilisateur.
- Les liens hors liste sont **bloqués**, pas ouverts dans le navigateur système (ADR point 5) :
  il faudrait `xdg-open` via le `supervisor` ou un plugin, hors périmètre ici.
- `window.open` déclenché par un vrai clic (avec geste utilisateur) : non testé automatiquement.
- Iframes : WebKitGTK ne les distingue pas de la fenêtre ; sans capability, rien ne passe quand même.

## GStreamer (`dpkg -l 'gstreamer1.0-*'`)
- Présents : `alsa`, `gl`, `libav` (H.264/AAC via ffmpeg), `packagekit`, `pipewire`, `plugins-base`,
  `plugins-base-apps`, `plugins-good`, `plugins-bad`, `plugins-ugly`, `tools`, `vaapi`, `x`.
- Absents : `pulseaudio`, `plugins-bad-faad`, `plugins-bad-videoparsers` (paquet virtuel), `visualization`.
- Pour les Reels (H.264 + AAC en MSE) : `libav` + `plugins-bad` + `plugins-good` sont là, le son passe
  par `pipewire`/`alsa`. A priori suffisant ; à confirmer par le point 3 du test manuel.

## Divergence à trancher
La fiche nomme la fenêtre `pause`, l'ADR-0003 la nomme `instagram`. Le spike suit la fiche.

## Recommandation
Plan A tenable côté isolation : garder `AppManifest::commands` + capabilities limitées à `main`, sans
`remote.urls`, et reprendre `run-isolation-test.sh` comme test de non-régression dans l'app. Décision
finale (A ou B) suspendue au test manuel : si la connexion ou les Reels échouent, passer au plan B.
Pour l'app : placer le `data_directory` hors du store par défaut (dossier frère, pas sous-dossier).
