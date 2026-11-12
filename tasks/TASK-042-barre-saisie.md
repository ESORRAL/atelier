---
id: TASK-042
title: Barre du haut allégée, modèle et mode en bas, autocomplétion @ et /
status: todo
phase: 5
agent: ui
model: sonnet
depends_on: []
branch: task/TASK-042-barre-saisie
---

## Objectif
1. La barre du haut est surchargée : le sélecteur de modèle déborde sur le logo « A Atelier », le coût
   passe sur deux lignes. On l'allège : elle garde le logo, le mini-lecteur, Focus, la palette, Panneau,
   Journal (et « Démo » en développement).
2. **Le choix du modèle, le mode de permission (« Accepter les modifications »…) et le coût vont en bas**,
   dans une petite barre d'outils sous ou dans la zone de saisie de la session affichée (comme une barre de
   composer), avec l'état de la session (« Terminé », « En cours »…).
3. **Autocomplétion dans le champ de message** :
   - `/` en début de mot : liste des commandes de `system/init.slash_commands` de la session (déjà reçu
     dans le flux, voir `reduce.ts` / l'événement `sdk` `system/init`) ; choisir insère `/commande `.
     Avant le premier `init` d'une session : « Les commandes apparaîtront après le premier message ».
   - `@` : fichiers du projet de la session via `project_files` (`contracts/ipc.md §14`, codé en parallèle :
     ajoute la fonction dans `src/ipc/project.ts`), requête à chaque frappe après `@` avec un délai de
     150 ms ; choisir insère `@chemin/relatif `.
   - Liste au-dessus du champ, clavier complet (↑ ↓ Entrée ou Tab pour choisir, Échap pour fermer ; Entrée
     n'envoie pas le message quand la liste est ouverte), souris, `role="listbox"` et `aria-activedescendant`.

## Contexte utile
- Session et composer : `src/features/chat/ChatSession.tsx` (le bloc `.session` est aujourd'hui « portaillé »
  dans la barre du haut via `slot` : arrête ce portail pour le modèle, le mode et le coût). Barre du haut :
  `src/App.tsx`, `src/shell/shell.css`.
- Détection du déclencheur (`@`/`/` sous le curseur, mot en cours, remplacement) dans un module pur testé.
- Respecte `DESIGN.md §8` (tokens, contrastes, focus visible, texte français) et garde le style Veilleuse.

## Fichiers
- **Lire** : `src/features/chat/`, `src/App.tsx`, `src/shell/`, `src/ipc/project.ts`, `contracts/ipc.md §14`, `DESIGN.md §8`
- **Écrire** : `src/features/chat/**`, `src/App.tsx`, `src/shell/**`, `src/ipc/project.ts`, `design/tokens.css` (ajouts seulement)
- **Contrats** : `contracts/ipc.md §14`

## Critères d'acceptation
- [ ] Barre du haut sur une ligne sans chevauchement à 1280 px de large ; modèle, mode et coût en bas et fonctionnels.
- [ ] `/` et `@` : liste, clavier, insertion ; tests du module pur ; les tests existants restent verts.
- [ ] Capture `design/screenshots/v5-composer.png` (Firefox sans interface sur `dist/`, profil et sortie dans le
      dossier du projet, puis supprimés ; ne tuer que tes propres process).

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
