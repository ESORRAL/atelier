# ADR-0003 — Onglet Instagram : fenêtre séparée, sans aucun accès à l'app

- **Statut** : proposé
- **Date** : 2026-11-10

## Contexte
L'utilisateur veut regarder des Reels depuis l'app en se connectant lui-même. Contraintes : pas de
scraping, pas d'automatisation, pas de téléchargement (CGU Meta), et la page ne doit avoir **aucun accès**
à l'API interne de l'app.

## Décision
**Plan A — `WebviewWindow` Tauri dédiée**, label `instagram` :
1. **Aucune capability** ne liste ce label, et aucune entrée `remote.urls` n'existe dans le projet.
2. Les commandes sont restreintes par fenêtre avec `AppManifest::commands` dans `build.rs` : par défaut,
   Tauri autorise toutes les commandes de `invoke_handler` pour toutes les fenêtres.
3. `data_directory` propre (cookies séparés du reste de l'app).
4. Aucun script injecté, aucun `initialization_script`, aucun `eval` : l'app n'écoute ni ne lit la page.
5. Navigation limitée aux domaines `instagram.com`, `cdninstagram.com`, `facebook.com` (connexion) ;
   tout autre lien s'ouvre dans le navigateur système.
6. User-agent laissé par défaut (le maquiller déclenche les contrôles anti-robot).

Dans l'UI principale, l'onglet Instagram n'est qu'un **lanceur** (ouvrir / fermer la fenêtre) et un
interrupteur « pause focus ».

**Plan B — si le spike échoue** (connexion refusée, Reels illisibles, ou cookies non isolés) : lancer le
navigateur Chromium/Firefox déjà installé en mode application, avec un profil dédié. Process séparé,
zéro IPC, codecs du navigateur. Moins intégré, isolation plus forte.

## Test obligatoire (critère de revue)
Un test automatique ouvre une page de test dans la fenêtre `instagram` et vérifie que
`window.__TAURI__` est absent et qu'un appel `invoke` échoue. La tâche n'est pas fusionnée sans lui.

## Limites connues
- La connexion « avec Google » est refusée par Google dans WebKitGTK ; identifiant + mot de passe
  Instagram uniquement.
- Sous Linux, Tauri ne distingue pas une iframe de la fenêtre elle-même : raison de plus pour ne donner
  aucune capability à cette fenêtre.

## Sources
- https://v2.tauri.app/security/capabilities/
