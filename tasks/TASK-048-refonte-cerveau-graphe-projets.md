---
id: TASK-048
title: Refonte des onglets Second cerveau, Graphe et Projets
status: done
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
- Fait : Second cerveau sur tout le vault (Récents / Projet / Tout, arbre chargé à la demande, lecture 72ch, liens `[[…]]` résolus sans index, récap dans un menu « … ») ; Graphe en canvas + `d3-force` (couleur par communauté, taille par degré, zoom/glisser/clavier, fiche, pause si fenêtre inactive, une ligne d'état, communautés en liste accessible) ; Projets épuré (en-tête, colonnes ouvertes, terminées/worktrees/commits repliés).
- Fichiers touchés : `src/features/{brain,graph,projects}/**`, `src/ipc/{vault,project}.ts`, `design/tokens.css` (`--color-graph-1..8`), `package.json`, `package-lock.json`.
- Vérification (sortie résumée) : lint OK, 115 tests verts, build OK.
- Raccourcis pris (`shortcut:`) : aucun.
- À remonter à l'architecte : `d3-force` sans types ; déclaration locale `graph/d3-force.d.ts` (pas `@types/d3-force`). Il tire `d3-dispatch/quadtree/timer` (ISC). Palette validée au script dataviz ; en clair, 4 teintes < 3:1 (légende et liste en relais). Non testé contre le Rust de TASK-047 ni en vrai (pas de `tauri dev`).
