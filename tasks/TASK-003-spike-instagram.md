---
id: TASK-003
title: Spike — fenêtre Instagram isolée, sans aucun accès à l'app
status: todo
phase: 1
agent: core
model: opus
depends_on: []
branch: task/TASK-003-spike-instagram
---

## Objectif
Prouver, avec une mini-app Tauri jetable, qu'une fenêtre séparée peut afficher un site externe sans
aucun accès à l'API de l'app, avec ses propres cookies. Préparer le test manuel de connexion Instagram
que l'utilisateur fera lui-même.

## Contexte utile
- Rust est dans `~/.cargo/bin` : commence par `export PATH="$HOME/.cargo/bin:$PATH"`.
- Tauri **2.12.x**, sans la feature `unstable`, sans webview enfant : uniquement `WebviewWindowBuilder`.
- Deux fenêtres : `main` (page locale, a une capability, peut appeler la commande `probe`) et `pause`
  (URL externe, **aucune** capability, `data_directory` propre sous le dossier de données de l'app).
- Par défaut Tauri autorise toutes les commandes pour toutes les fenêtres : restreins-les avec
  `AppManifest::commands` dans `build.rs`.
- L'URL de la fenêtre `pause` vient de la variable d'environnement `PAUSE_URL`
  (défaut : `https://www.instagram.com/`). Pour le test automatique, sers une page locale de test sur
  `http://127.0.0.1:<port>` (serveur de la bibliothèque standard Rust ou `python3 -m http.server`).
- Tu ne te connectes à aucun compte et tu n'ouvres pas Instagram toi-même : le test de connexion est
  manuel, fait par l'utilisateur.
- Dépendances autorisées : `tauri`, `tauri-build`, `serde`, `serde_json`. Aucun plugin Tauri.

## Fichiers
- **Lire** : `docs/adr/0003-instagram-isolation.md`
- **Écrire** : `spikes/instagram/**` uniquement
- **Contrats** : aucun

## Critères d'acceptation
- [ ] `spikes/instagram/` est une app Tauri autonome qui compile.
- [ ] Test automatique d'isolation : la page de test chargée dans `pause` tente d'appeler `probe` par
      tous les moyens disponibles (`window.__TAURI__`, `window.__TAURI_INTERNALS__`, `window.ipc`) ; le
      test échoue si un seul appel atteint Rust. Le même appel depuis `main` doit réussir (témoin).
- [ ] Vérification des cookies : un cookie posé dans `pause` n'est pas visible depuis `main`, et le
      dossier `data_directory` de `pause` est bien distinct sur le disque.
- [ ] Navigation : dans `pause`, un lien hors de la liste de domaines autorisés ne se charge pas dans la
      fenêtre. Dis comment tu l'as obtenu.
- [ ] `spikes/instagram/MANUEL.md` (français, 30 lignes max) : la commande à lancer et les 5 points que
      l'utilisateur doit vérifier à la main (page chargée, connexion par identifiant, lecture d'un Reel
      avec le son, session conservée après redémarrage, déconnexion).
- [ ] `spikes/instagram/FINDINGS.md` (français, 60 lignes max) : ce qui est prouvé, ce qui ne l'est pas,
      les paquets GStreamer présents ou absents (`dpkg -l 'gstreamer1.0-*'`), et ta recommandation.

## Vérification
```bash
export PATH="$HOME/.cargo/bin:$PATH"
cd spikes/instagram && cargo build 2>&1 | tail -3 && ./run-isolation-test.sh
```

## Hors périmètre
Aucune automatisation d'Instagram, aucun script injecté dans la page externe réelle, aucun maquillage
du user-agent, aucune installation de paquet. Si un critère est impossible, documente-le : c'est un
résultat.

## Rapport (rempli par l'agent, 150 mots max)
- Fait :
- Fichiers touchés :
- Vérification (sortie résumée) :
- Raccourcis pris (`shortcut:`) :
- À remonter à l'architecte :
