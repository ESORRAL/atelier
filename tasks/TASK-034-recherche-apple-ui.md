---
id: TASK-034
title: Panneau Musique — résultats de recherche, navigation artiste → albums → morceaux, aperçus
status: todo
phase: 4
agent: ui
model: sonnet
depends_on: []
branch: task/TASK-034-recherche-apple-ui
---

## Objectif
Dans le panneau Musique, la recherche affiche ses résultats **dans le panneau** (artistes, albums, morceaux
avec pochettes) ; un clic sur un artiste montre ses albums, un clic sur un album ses morceaux ; chaque
morceau a un bouton « Aperçu » (30 s joués dans l'app) et « Ouvrir dans Apple Music ».

## Contexte utile
- Contrat `contracts/ipc.md §9` (commandes codées par une tâche parallèle : code contre le contrat). Ajoute
  les fonctions typées dans `src/ipc/music.ts` : `musicSearch`, `musicLookup`, `musicOpenUrl`.
- Le panneau actuel (`src/features/music/MusicPanel.tsx`) a un champ de recherche et des boutons qui
  ouvrent Apple Music dans Firefox. Garde « Playlists », « Bibliothèque » et « Ouvrir Apple Music » ; la
  recherche (Entrée ou bouton, jamais à chaque frappe) affiche maintenant les résultats dans le panneau,
  avec en bas un lien « Voir tout sur Apple Music » (le `music_open` existant).
- Navigation : une pile (résultats → artiste → album) avec un bouton « Retour » ; titre de la vue courante.
  État de la pile dans un module pur testé (`src/features/music/browse.ts`).
- Pochettes : `<img>` avec `alt=""` et dimensions fixes (pas de décalage de mise en page), repli sur une
  icône Phosphor si `artworkUrl` est `null` ou si l'image échoue. Aperçus : un seul `<audio>` partagé,
  un seul aperçu à la fois, bouton lecture/pause par morceau avec `aria-pressed`, arrêt à la fermeture du
  panneau et quand la fenêtre perd le focus (`data-idle` sur `<html>`). `previewUrl` `null` → pas de
  bouton Aperçu. Erreur de lecture : message discret, pas de crash.
- Hors ligne : message « Pas de connexion à Apple Music » (l'erreur du cœur est déjà en français).
- Le panneau est étroit (token `--music-panel-w`) : listes compactes, défilement dans le panneau.
- Respecte `DESIGN.md §8` et les contrastes ; texte en français.

## Fichiers
- **Lire** : `contracts/ipc.md §9`, `src/features/music/`, `src/ipc/music.ts`, `DESIGN.md §8`
- **Écrire** : `src/features/music/**`, `src/ipc/music.ts`, `design/tokens.css` (ajouts seulement)
- **Contrats** : `contracts/ipc.md §9`

## Critères d'acceptation
- [ ] Recherche → résultats groupés ; clic artiste → albums ; clic album → morceaux ; Retour fonctionne.
- [ ] Aperçu : un seul à la fois, s'arrête à la fermeture du panneau ; clavier complet ; libellés accessibles.
- [ ] Tests Vitest du module de navigation et de la logique d'aperçu (pure).

## Vérification
```bash
npm ci && npm run lint && npm test && npm run build
```

## Hors périmètre
Pas de Rust, pas de playlists de l'utilisateur, pas de file d'attente.

## Rapport (rempli par l'agent, 150 mots max)
- Fait :
- Fichiers touchés :
- Vérification (sortie résumée) :
- Raccourcis pris (`shortcut:`) :
- À remonter à l'architecte :
