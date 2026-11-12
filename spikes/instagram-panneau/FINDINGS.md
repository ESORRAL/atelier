# Spike TASK-045 — constats : panneau Instagram par re-parentage GTK

Tauri 2.12.5 (`unstable`), tauri-runtime-wry 2.12.3, wry 0.57.2, crate `gtk` =0.18.2 (déjà dans le lockfile ;
`webkit2gtk` inutile : le widget est manipulé comme `gtk::Widget`), WebKitGTK 2.52.6, Ubuntu 24.04, GNOME,
échelle 2. Testé sous **Wayland** natif et **X11** (XWayland). Test : `./run-test.sh [x11]` (16 vérifications
en X11, 14 en Wayland).

## Montage
Dans `setup` (thread principal) : `Window::default_vbox()` ; `Webview::with_webview` → widget WebKit de
`main` et d'`instagram` ; retirés du `GtkBox`, puis `GtkOverlay` (`main` en fond) + `GtkRevealer`
(`SlideRight`, 200 ms, `halign Start`, marges 56/56) contenant `instagram` (largeur 420). Pilotage par
`run_on_main_thread` → `set_reveal_child`. Environ 60 lignes.

## Ce qui marche (Wayland et X11)
- Position et taille exactes : panneau à (56,56), 420 × (hauteur − 56), collé au rail, `main` visible à droite.
- Redimensionnement : le panneau suit sans code.
- Glissement : animation native du `GtkRevealer` (Wayland 11 à 13 images ; X11 4 à 20 selon la charge).
- Fermé : la page Instagram passe en `visibilityState=hidden`.
- 20 ouvertures/fermetures : aucun plantage, les deux pages répondent.
- Focus clavier : `Webview::set_focus()` fonctionne (vérifié par touche simulée en X11).
- `Webview::hide()/show()` de Tauri pilote encore le widget re-parenté. Instagram réel s'affiche ; aucune connexion.

## Ce qui casse ou reste à vérifier
- Bande non repeinte sous X11 après fermeture : corrigé par `main.queue_draw()` en fin d'animation.
- **Clics souris non vérifiés automatiquement** (clics simulés peu fiables) : à vérifier à la main.
- Chargement lent à la première ouverture. `set_position`/`set_size`/`set_bounds` de Tauri sans effet.
- Non testé : `Webview::close()` sur le widget re-parenté, devtools.

## Isolation (PASS, Wayland et X11)
Mêmes vecteurs que TASK-044 avec clé d'invocation volée : tout est refusé ; navigation hors liste bloquée ;
cookies isolés. Contrôle négatif : une capability `"windows": [...]` + remote fait échouer le test.

## Fragilité face aux mises à jour de Tauri
- Détail interne de `tauri-runtime-wry` : webviews enfants rangées dans le `GtkBox` de la fenêtre
  (`default_vbox`). Si Tauri change ce rangement (ou corrige tauri#10420), le montage doit être revu.
- API propres à Linux : `Window::default_vbox`, `Webview::with_webview`, `Window::add_child` (`unstable`).
- `gtk` doit rester identique à celle de Tauri (=0.18.2). Un passage de wry à GTK 4 casserait ce code.
- Exige des capabilities ciblées par `webviews: ["main"]`, jamais par fenêtre.

## Recommandation
**Intégrable**, derrière un réglage, avec la fenêtre séparée en repli : (1) vérifier les clics à la main ;
(2) code GTK isolé dans un module, test qui échoue si `default_vbox` ne contient plus les deux webviews,
Tauri épinglé en version exacte ; (3) capabilities par `webviews`.
