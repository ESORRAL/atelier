---
id: TASK-045
title: Spike — panneau Instagram qui glisse, par re-parentage GTK
status: done
phase: 5
agent: core
model: opus
depends_on: [TASK-044]
branch: task/TASK-045-spike-panneau-instagram-gtk
---

## Objectif
Le spike TASK-044 a montré que Tauri empile les webviews enfants en bande pleine largeur sous Linux. Vérifier
si l'on peut obtenir **un panneau Instagram qui glisse depuis la gauche, à côté du rail, par-dessus
l'interface** (comme le panneau Musique), en re-parentant soi-même le widget WebKit de la webview enfant.

## Contexte utile
- Pars du prototype `spikes/instagram-integre/` et de son `FINDINGS.md` (cause : `GtkBox` vertical dans
  `tauri-runtime-wry` ; `wry::set_bounds` ne fonctionne que dans un `GtkFixed`). Nouveau prototype dans
  `spikes/instagram-panneau/` (copie puis modifie ; l'ancien reste intact).
- Piste : `Window::with_webview` / `Webview::with_webview` donne accès au `webkit2gtk::WebView` ; retire-le
  du `GtkBox`, place un `GtkOverlay` (ou `GtkFixed`) qui contient la webview `main` en fond et la webview
  enfant par-dessus, positionnée et dimensionnée (rail 56 px à gauche, largeur ~420 px, toute la hauteur
  sous la barre de 56 px). Crate `gtk` **0.18.2** et `webkit2gtk` **2.0.2** exactement (celles déjà dans le
  lockfile via Tauri), aucune autre dépendance. Tout appel GTK sur le thread principal
  (`run_on_main_thread`).
- À vérifier réellement, sous **Wayland et X11** : position et taille respectées ; redimensionnement de la
  fenêtre ; masquer/afficher ; une animation de glissement (déplacer la position sur ~12 images, ou à
  défaut afficher sans animation) ; focus clavier dans Instagram puis retour à l'app ; que la webview
  `main` reste pleinement utilisable (clics hors du panneau) ; stabilité sur 20 ouvertures/fermetures.
- **Isolation** : mêmes tests que TASK-044 (page hostile, clé d'invocation volée), capabilities ciblées par
  `webviews: ["main"]`, `data_directory` propre, liste blanche de navigation de `src-tauri/src/windows/`.
- Instagram réel chargé une fois pour vérifier l'affichage ; **aucune connexion à un compte**.
- Nettoie à la fin les dossiers de données du spike dans `~/.local/share/`.

## Fichiers
- **Lire** : `spikes/instagram-integre/`, `docs/adr/0003-instagram-isolation.md`, `src-tauri/src/windows/`
- **Écrire** : `spikes/instagram-panneau/**`
- **Contrats** : aucun

## Critères d'acceptation
- [ ] `spikes/instagram-panneau/FINDINGS.md` (français, 60 lignes max) : ce qui marche sous Wayland et X11,
      ce qui casse, résultat du test d'isolation, fragilité face aux mises à jour de Tauri (quelles API
      internes sont touchées), et **recommandation claire** (intégrer dans l'app ou non).

## Vérification
```bash
export PATH="$HOME/.cargo/bin:$PATH" CARGO_TARGET_DIR="$HOME/.cache/atelier-target"
cd spikes/instagram-panneau && cargo build 2>&1 | tail -3
```

## Hors périmètre
Pas de modification de l'app (`src-tauri/`, `src/`).

## Rapport (rempli par l'agent, 150 mots max)
- Fait : prototype `GtkOverlay` + `GtkRevealer` (widget WebKit retiré du `GtkBox`). Position, taille,
  redimensionnement, glissement, 20 cycles, focus, isolation : PASS sous Wayland et X11. Instagram réel
  affiché, sans connexion. Données du spike nettoyées.
- Fichiers touchés : `spikes/instagram-panneau/**`.
- Vérification (sortie résumée) : `cargo build`, fmt, clippy, test OK ; `run-test.sh` PASS (Wayland 14/14,
  X11 16/16) ; contrôle négatif `EXTRA_CAP=window` → FAIL attendu.
- Raccourcis pris (`shortcut:`) : aucun.
- À remonter à l'architecte : l'outil a refusé de créer `FINDINGS.md`, contenu fourni dans le rapport
  final. Clics souris non vérifiables automatiquement : contrôle manuel requis. Dépend de
  `default_vbox` (interne à tauri-runtime-wry). Recommandation : intégrable derrière un drapeau.
