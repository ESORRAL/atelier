# Spike TASK-044 — constats : Instagram dans la fenêtre principale (webview enfant)

Tauri 2.12.5 + feature `unstable`, tauri-runtime-wry 2.12.3, wry 0.57.2, WebKitGTK 2.52.6, Ubuntu 24.04,
GNOME. Testé sous **Wayland** (natif) et sous **X11** (XWayland, `GDK_BACKEND=x11`, captures `xwd`).
Prototype : fenêtre `atelier` (`WindowBuilder`) + webview `main` (page locale, zone rouge vide à droite) +
webview enfant `instagram` (`Window::add_child`) demandée sur la moitié droite. Test : `./run-test.sh [x11]`.

## État des deux bugs
- **tauri#10420 (positions et tailles ignorées) : ouvert, reproduit, cause trouvée dans le code.**
  Sous Linux, `tauri-runtime-wry` (`create_webview`, `WebviewKind::WindowChild`) range chaque webview
  enfant dans le `GtkBox` vertical de la fenêtre (`build_gtk(default_vbox)`, `pack_start(expand, fill)`).
  `wry::WebView::set_bounds` ne fait rien hors d'un `GtkFixed` (`is_in_fixed_parent` faux). Résultat
  mesuré, Wayland comme X11 : les webviews sont **empilées verticalement, pleine largeur, hauteur partagée
  à parts égales**, position toujours (0,0). `add_child(position, taille)`, `set_position`, `set_size`,
  `set_bounds` : sans effet. Aucun correctif dans les changelogs de wry/tauri ; issue toujours ouverte.
- **tauri#11376 (seule la dernière s'affiche) : ouvert, non reproduit ici.** Les webviews s'affichent
  ensemble (jusqu'à 4 testées).

## Ce qui marche
- Instagram réel se charge dans la webview enfant (bannière cookies affichée ; aucune connexion faite).
- Redimensionnement de la fenêtre : les webviews suivent, mais restent empilées 50/50.
- Masquer/afficher : `hide()` → `main` reprend toute la hauteur ; `show()` → retour à l'empilement. Fiable.
- Focus clavier : vérifié sous X11 (`set_focus()`). Sous Wayland, non vérifiable automatiquement.

## Ce qui casse
- Placer Instagram dans une zone choisie par l'UI est **impossible avec l'API Tauri** sous Linux.
- Piège : un getter synchrone (`scale_factor()`) appelé dans `on_window_event` bloque la boucle d'événements.
- Seul contournement vu : `with_webview` → re-parenter le widget WebKit dans un `GtkFixed`/`GtkOverlay`.
  Exige la crate `gtk` en dépendance directe (déjà dans le lockfile via tauri) : non testé.

## Test d'isolation (PASS, Wayland et X11)
La page hostile vole la clé d'invocation et la renvoie sur tous les vecteurs : `invoke('probe')`,
`plugin:event|emit`, `plugin:webview|create_webview_window`, `set_webview_size` refusés ; `fetch
ipc://localhost` + clé → `Tauri-Response: error` ; `ipc.postMessage` / `webkit.messageHandlers.ipc` + clé
ignorés. Navigation hors liste bloquée ; cookies isolés (`data_directory` frère).
- **Capability par webview vs par fenêtre** : `"webviews": ["main"]` + remote → PASS ; `"windows":
  ["atelier"]` + remote → **FAIL** (une capability `windows` couvre toutes les webviews de la fenêtre).
  Dans l'app, une intégration imposerait de cibler les capabilities par `webviews: ["main"]`.

## Recommandation
**Ne pas intégrer avec l'API Tauri 2.12 telle quelle** : Instagram ne peut occuper qu'une bande pleine
largeur sous l'interface, pas un panneau. Garder la fenêtre séparée (ADR-0003).
Option : un second spike avec la crate `gtk` (re-parentage dans un `GtkFixed` via `with_webview`), mêmes
tests. L'isolation tient, à condition de cibler les capabilities par `webviews`.
