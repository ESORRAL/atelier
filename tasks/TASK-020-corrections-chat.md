---
id: TASK-020
title: Corrections d'audit — onglet Chat et cadre
status: done
phase: 3
agent: ui
model: sonnet
depends_on: [TASK-016, TASK-019]
branch: task/TASK-020-corrections-chat
---

## Objectif
Corriger les bugs de l'interface trouvés par l'audit fonctionnel et par la capture du cadre. En tête :
le changement de modèle, qui ne marche pas.

## Contexte utile
Le cœur suit maintenant `contracts/ipc.md` 1.2 (`idle` dès le démarrage, `running` dès l'envoi,
reprise sur la même clé, coût cumulé dans l'index).
1. **Modèle** : charger `session_models` dès qu'une clé existe (pas seulement à `idle`) ; garder la valeur
   choisie localement ; faire correspondre `s.model` (id complet, ex. `claude-sonnet-5-5`) à l'option
   dont `resolvedModel` ou `value` correspond ; le choix ne doit plus revenir à l'ancienne valeur.
   Un test Vitest de la correspondance.
2. **Nouvelle session** : un bouton visible quand une session est ouverte (et après un crash), qui ferme la
   session et revient à l'accueil.
3. **Envoi pendant une réponse** : désactiver l'envoi tant que l'état est `running` ou
   `waiting_permission` ; plus de bulle figée.
4. **Erreur collante** : effacer l'erreur locale à chaque envoi et à chaque événement `state`.
5. **Mode de permission** : un petit sélecteur (Demander à chaque fois / Accepter les modifications /
   Plan seulement) qui appelle `session_set_permission_mode`.
6. **Coût** : afficher le coût cumulé tel que le donne l'index après une reprise (pas de baisse).
7. **Démo des composants** : retirée de la barre du haut en build de production (`import.meta.env.DEV`).
8. **Cadre** : supprimer la bande blanche entre la zone principale et le panneau droit ; tiroir du journal
   **fermé** par défaut.
9. Vérifie que « révocable dans Réglages » du dialogue renvoie bien vers l'écran Réglages qui existe
   maintenant (sinon, adapte le texte).

## Fichiers
- **Lire** : `contracts/ipc.md`, `src/features/chat/`, `src/shell/`, `src/App.tsx`, `DESIGN.md` §8
- **Écrire** : `src/features/chat/**`, `src/shell/**`, `src/App.tsx`, `src/ipc/claude.ts` (si un type
  du contrat 1.2 manque), `src/ui/PermissionDialog.tsx` (texte du point 9 seulement)
- **Contrats** : `contracts/ipc.md` 1.2

## Critères d'acceptation
- [ ] Les 9 points traités ; tests Vitest pour 1, 3 et 4.
- [ ] Capture `design/screenshots/shell.png` refaite en thème sombre (Firefox sans interface).

## Vérification
```bash
npm ci && npm run lint && npm test && npm run build
```

## Hors périmètre
Pas de Rust.

## Rapport (rempli par l'agent, 150 mots max)
- Fait :
- Fichiers touchés :
- Vérification (sortie résumée) :
- Raccourcis pris (`shortcut:`) :
- À remonter à l'architecte :
