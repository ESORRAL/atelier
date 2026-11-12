---
id: TASK-044
title: Spike — Instagram intégré dans la fenêtre principale (webview enfant)
status: todo
phase: 5
agent: core
model: opus
depends_on: [TASK-037]
branch: task/TASK-044-spike-instagram-integre
---

## Objectif
L'utilisateur veut Instagram **dans** l'app, pas dans une fenêtre séparée. Établir si c'est faisable de façon
fiable et sûre sous Linux avec Tauri 2.12, et le prototyper.

## Contexte utile
- Une `iframe` est exclue (Instagram l'interdit). Positionner une fenêtre par-dessus est exclu sous Wayland.
- Seule piste : la webview enfant de Tauri (`Window::add_child` + `WebviewBuilder`, feature `unstable`).
  ADR-0001 l'avait écartée pour deux bugs Linux (tauri-apps/tauri#10420 positions et tailles ignorées,
  #11376 seule la dernière webview s'affiche). Vérifie leur état actuel (sources de tauri/wry dans
  `~/.cargo/registry`, changelogs, issues) **et teste-le réellement** dans un prototype.
- Prototype dans `spikes/instagram-integre/` (crate Tauri autonome, comme `spikes/instagram/`) : fenêtre
  avec la webview de l'app (une page locale avec une zone vide à droite) et une webview enfant Instagram
  positionnée dans cette zone ; vérifie positionnement, redimensionnement de la fenêtre, masquage/affichage
  (changer d'onglet), focus clavier, et que les deux webviews s'affichent ensemble. Teste sous la session
  graphique de l'utilisateur (Wayland ou X11 : note lequel), `timeout` sur chaque lancement.
- **Isolation** : la webview enfant doit avoir son propre label, **aucune capability** (vérifie que les
  capabilities ciblent bien la webview `main` et pas toute la fenêtre — champ `webviews` vs `windows`),
  son propre `data_directory`, la même liste blanche de navigation que `src-tauri/src/windows/`. Reprends le
  test d'isolation du spike d'origine (page de test qui tente `invoke` par tous les moyens).

## Fichiers
- **Lire** : `docs/adr/0001-stack.md`, `docs/adr/0003-instagram-isolation.md`, `spikes/instagram/`, `src-tauri/src/windows/`
- **Écrire** : `spikes/instagram-integre/**`
- **Contrats** : aucun

## Critères d'acceptation
- [ ] `spikes/instagram-integre/FINDINGS.md` (français, 60 lignes max) : état des deux bugs, ce qui marche,
      ce qui casse, résultat du test d'isolation, session graphique testée, et **recommandation claire**
      (intégrer / ne pas intégrer / intégrer avec telle limite).

## Vérification
```bash
export PATH="$HOME/.cargo/bin:$PATH" CARGO_TARGET_DIR="$HOME/.cache/atelier-target"
cd spikes/instagram-integre && cargo build 2>&1 | tail -3
```

## Hors périmètre
Pas de modification de l'app (`src-tauri/`, `src/`) ; aucune connexion à un compte.

## Rapport (rempli par l'agent, 150 mots max)
- Fait :
- Fichiers touchés :
- Vérification (sortie résumée) :
- Raccourcis pris (`shortcut:`) :
- À remonter à l'architecte :
