# Spike TASK-050 — constats : Instagram dans Chromium embarqué (CEF)

Crate `cef =156.4.0+156.0.26`, CEF 156.0.26 / Chromium 156.0.8078.88 (build « minimal » officiel), Ubuntu
24.04, GNOME Wayland, i9-13900H, écran 90 Hz. Prototype : `src/main.rs` (navigateur Alloy minimal, sur le
modèle de cefsimple), `run.sh <h264|vp9|av1|URL> [VAR=…]`, `make-media.sh`.

## Installation
- Le build.rs de `cef-dll-sys` échoue : `download-cef` 3.0.0 refuse l'index du CDN (plus de 10 Mo, limite
  de ureq). `fetch-cef.sh` refait la même chose à la main : même CDN, SHA-1 vérifié, même arborescence.
- 1,9 Go dans `$CEF_PATH`, plus environ 1,3 Go que build.rs copie à côté du binaire. `libcef.so` n'est pas
  dans le RPATH : il faut `LD_LIBRARY_PATH`.

## Point bloquant : la sandbox (question 4, mais préalable à la question 1)
- Lancé tel quel, CEF s'arrête net (FATAL) : `chrome-sandbox` doit appartenir à root, mode 4755.
- Avec `--disable-setuid-sandbox` : « No usable sandbox ». Ubuntu 23.10+ bloque les espaces de noms
  utilisateur non privilégiés par AppArmor (`kernel.apparmor_restrict_unprivileged_userns=1`).
- Les deux seules issues demandent root à l'installation : `chrome-sandbox` en SUID root, ou un profil
  AppArmor `userns` pour le binaire (ce que font les paquets Chrome et Electron).
- Instagram sans sandbox : refusé. Le reste est mesuré avec `NO_SANDBOX=1`, sur la page locale uniquement.

## Q1 — Codecs (page locale ; Instagram non testé)
- **H.264 : non pris en charge** (`canPlayType` vide, MEDIA_ERR_SRC_NOT_SUPPORTED).
- **VP9 : décodé par la puce graphique** (`VaapiVideoDecoder`), sans réglage.
- **AV1 : décodé en logiciel** (`Dav1dVideoDecoder`).
- Instagram sert-il du VP9 ou de l'AV1 à un navigateur sans H.264 ? Inconnu.

## Q2 — Fluidité (page locale, 420 px, un « reel » toutes les 2 s, sans sandbox)
| Montage | Images/s page (p99) | Images/s vidéo (source 30) | Perdues | CPU total |
|---|---|---|---|---|
| WebKitGTK (TASK-049, H.264 matériel) | 45 (36 ms) | — | — | ~24 % |
| CEF Wayland, VP9 matériel | 89,5 (13 ms) | 27,4 | 3/633 | 55 % |
| CEF X11, VP9 matériel | 89,5 (17 ms) | 28,1 | 2/627 | 54 % |
| CEF Wayland, AV1 logiciel | 89,7 (11 ms) | 27,6 | 0/618 | 122 % |

CEF suit les 90 Hz, pour environ 2 fois plus de CPU en VP9 et 5 fois plus en AV1 (somme des processus CEF,
% d'un cœur). Aucun Reel public mesuré.

## Q3 — Insertion dans Tauri : non testée (arrêt au point bloquant)
Sous Wayland natif la fenêtre CEF s'affiche mais sa fermeture n'aboutit jamais ; en X11
(`--ozone-platform=x11`) elle est propre. Une fenêtre enfant imposerait X11 à toute l'app.

## Q4 — Isolation
Sandbox : impossible sans étape root. Navigation : liste blanche de `src-tauri/src/windows/` reprise dans
`src/allow.rs` (testée), popups refusées. Aucun pont avec Tauri (processus séparé). Profil dédié.

## Q5 — Arrêt propre
X11 : fermeture propre, aucun processus restant. Wayland : fermeture bloquée, SIGTERM nettoie tout.

## Verdict
**Pas intégrable en l'état.** Prix : (1) une étape root à l'installation pour la sandbox ; (2) pas de
H.264, donc dépendance au VP9/AV1 d'Instagram, non vérifiée ; (3) ~1,3 Go de plus dans l'app ; (4) X11
obligatoire ; (5) CPU ~2 fois plus élevé. Gain : 90 images/s et VP9 matériel.
Pour continuer : `chrome-sandbox` en SUID root (une fois, par l'utilisateur), puis refaire Q1 sur Instagram.
Dans l'app : .deb avec postinst root, CEF dans un binaire séparé lancé par `supervisor`, X11 forcé.
