---
id: TASK-048
title: Refonte des onglets Second cerveau, Graphe et Projets
status: todo
phase: 5
agent: ui
model: opus
depends_on: []
branch: task/TASK-048-refonte-cerveau-graphe-projets
---

## Objectif
L'utilisateur trouve ces trois onglets surchargés et mal présentés (« trop d'info, mal présenté »), le Second
cerveau limité au projet, et le Graphe illisible (« une liste d'infos que je ne comprends pas »). Refais-les,
épurés, dans le style Veilleuse. **Invoque d'abord le skill `frontend-design:frontend-design`, et le skill
`dataviz` avant le graphe.**

1. **Second cerveau — tout le vault** (`contracts/ipc.md §10 bis`, codé en parallèle : code contre le contrat ;
   mets à jour `src/ipc/vault.ts`, les chemins deviennent relatifs au vault) :
   - colonne gauche étroite : arborescence du vault (dossiers dépliables chargés à la demande par
     `vault_list`), raccourci « Projet » (`vaultProject`) et « Récents » (`vault_recent`) en tête ;
   - zone principale : la note en lecture confortable (largeur de lecture, `Markdown` existant), le titre, la
     date en discret, liens `[[…]]` cliquables sous la note ; « Ouvrir dans Obsidian » en icône discrète ;
   - recherche en haut, résultats en liste simple ; « Récap du jour » rangé dans un menu (pas un gros bouton).
2. **Graphe — le dessiner** (`§11 bis`, `graph_data`) : vue nœuds-liens interactive en **canvas** (jusqu'à 3 000
   nœuds) avec `d3-force` (seule dépendance autorisée, officielle, ISC) pour la disposition ; couleur par
   communauté (palette tirée des tokens, légende des 8 plus grandes), taille selon le degré ; zoom/déplacement
   à la molette et au glisser, survol = nom du nœud, clic = petite fiche (nom, fichier, communauté, voisins) ;
   bouton « Mettre à jour » discret ; la disposition se stabilise puis s'arrête (pas de calcul permanent ;
   arrêt quand l'onglet est caché ou la fenêtre inactive). Retire les listes de chiffres : au plus une ligne
   « N éléments · M liens · à jour / en retard ». Accessible : un résumé texte et la liste des communautés en
   alternative.
3. **Projets** : épure — en-tête (dossier, branche, état), tableau des tâches lisible (cartes compactes), le
   reste (worktrees, commits) replié dans des sections fermées par défaut.

## Contexte utile
- Code actuel : `src/features/brain/`, `src/features/graph/`, `src/features/projects/`, `src/ipc/vault.ts`,
  `src/ipc/project.ts`. Tokens `design/tokens.css`, règles `DESIGN.md §8` (contrastes, clavier, focus, français).
- Logique pure testée : arborescence (ouverture, chemins), préparation des données du graphe (couleurs,
  tailles, voisins, plafond), regroupement des tâches existant.
- Le graphe n'affiche jamais `graph.html` ni d'`iframe`.

## Fichiers
- **Lire** : les dossiers ci-dessus, `contracts/ipc.md §10 bis, §11 bis`, `DESIGN.md §8`
- **Écrire** : `src/features/brain/**`, `src/features/graph/**`, `src/features/projects/**`, `src/ipc/vault.ts`,
  `src/ipc/project.ts`, `package.json`, `package-lock.json` (`d3-force` seulement), `design/tokens.css` (ajouts)
- **Contrats** : `contracts/ipc.md §10 bis, §11 bis`

## Critères d'acceptation
- [ ] Les trois onglets refaits ; tout le vault navigable ; graphe dessiné, fluide, interactif.
- [ ] Tests des modules purs ; tests existants verts.

## Vérification
```bash
npm ci && npm run lint && npm test && npm run build
```

## Hors périmètre
Pas de Rust, pas d'édition de notes.

## Rapport (rempli par l'agent, 150 mots max)
- Fait :
- Fichiers touchés :
- Vérification (sortie résumée) :
- Raccourcis pris (`shortcut:`) :
- À remonter à l'architecte :
