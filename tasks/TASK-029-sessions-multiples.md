---
id: TASK-029
title: Plusieurs sessions ouvertes en parallèle dans le Chat
status: todo
phase: 4
agent: ui
model: opus
depends_on: []
branch: task/TASK-029-sessions-multiples
---

## Objectif
On peut garder plusieurs sessions Claude ouvertes à la fois, chacune dans son onglet en haut du Chat, et
passer de l'une à l'autre sans les interrompre. Une session qui travaille en arrière-plan continue.

## Contexte utile
- Le cœur gère déjà plusieurs sessions (une clé par session). Seule l'UI suppose une session unique :
  `src/features/chat/Chat.tsx` (une seule `key`, un seul état `reduce`, un seul `Channel`).
- Une barre d'onglets de sessions au-dessus du fil : titre (premier message, ou le dossier), voyant d'état
  (`Tally`), bouton fermer (avec `session_close`). Bouton « + » = écran d'accueil pour en ouvrir une autre.
  8 onglets au plus (au-delà, message clair).
- Chaque session a son propre état `reduce` et sa propre file de permissions. Une demande de permission
  d'une session en arrière-plan : voyant « attend ton accord » sur son onglet ; la boîte de dialogue
  s'affiche quand on y va (pas de vol de focus). Une notification desktop existe déjà côté cœur.
- Le shell (`src/App.tsx`) reçoit aujourd'hui `onEvent(e)` pour le journal du bas et `onInfo` pour le
  panneau droit. Change-les en `onEvent(key, e)` et `onInfo(info)` de la session **affichée**. App garde les
  200 derniers événements **par clé** (le tiroir montre ceux de la session affichée) : l'onglet Agents
  (tâche suivante) les lira tous. Exporte le type de cette table depuis `src/features/chat/`.
- Raccourcis : `Ctrl+Tab` / `Ctrl+Maj+Tab` pour changer de session (touches physiques, cf. `DESIGN.md §5.6`).
- Logique (table des sessions, ajout, fermeture, sélection, limite) dans un module pur testé avec Vitest.

## Fichiers
- **Lire** : `src/features/chat/Chat.tsx`, `src/features/chat/reduce.ts` (API), `src/App.tsx`,
  `contracts/ipc.md §1-3`, `DESIGN.md §8`
- **Écrire** : `src/features/chat/**`, `src/App.tsx`, `src/shell/**` (seulement si le tiroir ou le panneau l'exigent)
- **Contrats** : `contracts/ipc.md` (aucun changement)

## Critères d'acceptation
- [ ] Deux sessions ouvertes : un message envoyé dans A pendant que B répond ; B continue en arrière-plan.
- [ ] Fermer un onglet ferme la session côté cœur ; fermer l'app ne laisse aucun process (déjà assuré par le cœur).
- [ ] Permission d'une session cachée : voyant sur l'onglet, dialogue à l'affichage, jamais perdue.
- [ ] Tests du module pur ; les 51 tests existants restent verts.

## Vérification
```bash
npm ci && npm run lint && npm test && npm run build
```

## Hors périmètre
Pas de Rust, pas de glisser-déposer des onglets, pas de restauration des onglets au redémarrage.

## Rapport (rempli par l'agent, 150 mots max)
- Fait :
- Fichiers touchés :
- Vérification (sortie résumée) :
- Raccourcis pris (`shortcut:`) :
- À remonter à l'architecte :
