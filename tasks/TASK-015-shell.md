---
id: TASK-015
title: Cadre de l'app — rail, barre du haut, panneau droit, tiroir du bas, palette de commandes
status: todo
phase: 3
agent: ui
model: sonnet
depends_on: [TASK-014]
branch: task/TASK-015-shell
---

## Objectif
L'app a son vrai cadre : un rail d'icônes à gauche pour changer d'onglet, la barre du haut actuelle, un
panneau droit contextuel repliable, un tiroir du bas repliable (journal des événements bruts de la
session, pour déboguer), et une palette de commandes (`Ctrl+K`). Le Chat devient un onglet parmi d'autres.

## Contexte utile
- Le style « Veilleuse » est fixé (`design/tokens.css`, `DESIGN.md`). Ne change aucune valeur de token ;
  ajoute-en seulement si le cadre en a besoin, dans le même esprit.
- Onglets du rail (icônes Phosphor) : Chat (actif), Agents, Projets, Second cerveau, Graphe, Usage,
  Musique, Instagram, Réglages. Ceux qui n'existent pas encore affichent un état vide soigné
  (« Arrive en v0.2 » ou « v0.3 ») ; chaque onglet est un dossier `src/features/<onglet>/` chargé en
  import dynamique. Réglages : laisse un dossier `src/features/settings/` avec un état vide, TASK-016 le
  remplira.
- Onglet actif et état replié des panneaux gardés dans `localStorage`.
- Panneau droit : pour l'instant, sur le Chat, le dossier de la session et ses infos (clé, modèle, coût,
  état) ; ailleurs, rien (panneau masqué).
- Tiroir du bas : les `SessionEvent` reçus de la session courante, en texte brut monospace, les 200 derniers.
  Expose depuis le Chat ce dont il a besoin sans toucher à `reduce.ts`.
- Palette : liste filtrable des onglets et des actions existantes (nouvelle session, interrompre,
  basculer le thème, replier les panneaux). Clavier complet, `Échap` ferme. Raccourcis selon
  `DESIGN.md` §5.6 (AZERTY : touches physiques, alternatives F).
- Aucune dépendance nouvelle.

## Fichiers
- **Lire** : `DESIGN.md` §3, §4 (rail, palette, tiroir), §5.4-5.6, §8 ; `src/App.tsx` ; `src/features/chat/Chat.tsx`
- **Écrire** : `src/shell/**`, `src/App.tsx`, `src/features/*/` (états vides et index), `src/features/chat/Chat.tsx`
  (exposer les infos de session et les événements, sans changer la logique), `design/tokens.css` (ajouts seulement)
- **Contrats** : `contracts/ipc.md` (lecture)

## Critères d'acceptation
- [ ] Rail, barre, panneau droit, tiroir et palette présents, au clavier et à la souris.
- [ ] Le Chat marche comme avant (streaming, permission, reprise) ; un changement d'onglet ne coupe pas
      la session en cours.
- [ ] Logique de la palette (filtre, ordre, exécution) dans un module pur testé avec Vitest.
- [ ] Capture d'écran du cadre (même méthode que TASK-014 : Firefox sans interface sur `dist/`) dans
      `design/screenshots/shell.png`.

## Vérification
```bash
npm ci && npm run lint && npm test && npm run build
grep -rnE "#[0-9a-fA-F]{3,8}\b" src --include=*.css --include=*.tsx && echo "COULEUR EN DUR" || echo OK
```

## Hors périmètre
Pas de contenu réel pour les onglets futurs, pas d'écran de réglages, pas de Rust.

## Rapport (rempli par l'agent, 150 mots max)
- Fait : rail, barre du haut, panneau droit (Chat), tiroir journal (200 derniers événements), palette Ctrl+K/Ctrl+P, raccourcis AZERTY/F ; Chat reste monté derrière les autres onglets ; états vides en import dynamique.
- Fichiers touchés : src/App.tsx, src/shell/**, src/features/*/index.tsx, Chat.tsx (props onInfo/onEvent/onSessionReset/controlsRef), design/screenshots/shell.png.
- Vérification : lint, 36 tests, build OK ; aucune couleur en dur.
- Raccourcis pris : panneau non redimensionnable, tiroir non mémorisé par projet ; Tab figé dans la palette ; seuil 1280 px en media query ; versions v0.2/v0.3 des états vides supposées.
- À remonter à l'architecte : aucun besoin de contrat ; screenshot pris avec un stub Tauri injecté dans dist.
