---
id: TASK-032
title: Musique en panneau latéral, recherche Apple Music, bouton « Parcourir… »
status: done
phase: 4
agent: ui
model: sonnet
depends_on: [TASK-024]
branch: task/TASK-032-musique-panneau
---

## Objectif
1. La musique s'ouvre dans un **panneau qui glisse depuis la droite**, par-dessus la page en cours, sans
   changer d'onglet (le bouton Musique du rail l'ouvre et le ferme ; `Échap` le ferme).
2. Dans ce panneau : la télécommande actuelle, plus un champ « Rechercher sur Apple Music » et des boutons
   « Playlists », « Bibliothèque », « Ouvrir Apple Music » qui appellent `music_open`.
3. Sur l'écran d'accueil du Chat, un bouton « Parcourir… » à côté du champ dossier appelle `pick_folder` et
   remplit le champ.

## Contexte utile
- Contrat `contracts/ipc.md §8` (commandes codées par une tâche parallèle : code contre le contrat).
  Ajoute les fonctions typées dans `src/ipc/music.ts` et un nouveau `src/ipc/desktop.ts`.
- Réutilise les composants existants de `src/features/music/` dans le panneau ; l'onglet Musique comme page
  n'est plus nécessaire : le rail ouvre le panneau. En mode Focus, le panneau reste masqué (comme l'onglet).
- Le panneau : largeur fixe (token), ombre et fond de surface, transition courte (`--dur-*`), piège de focus
  léger (Tab reste dedans), focus rendu au bouton du rail à la fermeture, `prefers-reduced-motion` respecté.
- La recherche n'est envoyée qu'à la validation (Entrée ou bouton), jamais à chaque frappe.
- Logique (ouverture/fermeture, validation du terme) dans un module pur testé.

## Fichiers
- **Lire** : `contracts/ipc.md §8`, `src/features/music/`, `src/App.tsx`, `src/shell/`, `src/features/chat/Chat.tsx` (écran d'accueil), `DESIGN.md §8`
- **Écrire** : `src/features/music/**`, `src/ipc/music.ts`, `src/ipc/desktop.ts`, `src/App.tsx`, `src/shell/**`,
  `src/features/chat/Chat.tsx` (bouton « Parcourir… » seulement), `design/tokens.css` (ajouts seulement)
- **Contrats** : `contracts/ipc.md §8`

## Critères d'acceptation
- [ ] Le panneau s'ouvre sur n'importe quel onglet sans le quitter ; une session du Chat continue derrière.
- [ ] Recherche, Playlists, Bibliothèque, Ouvrir appellent `music_open` avec les bons arguments.
- [ ] « Parcourir… » remplit le champ ; annulation = rien ne change.
- [ ] Tests du module pur.

## Vérification
```bash
npm ci && npm run lint && npm test && npm run build
```

## Hors périmètre
Pas de Rust, pas d'API Apple Music, pas de liste de playlists dans l'app.

## Rapport (rempli par l'agent, 150 mots max)
- Fait :
- Fichiers touchés :
- Vérification (sortie résumée) :
- Raccourcis pris (`shortcut:`) :
- À remonter à l'architecte :
