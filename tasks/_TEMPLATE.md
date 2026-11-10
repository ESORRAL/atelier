---
id: TASK-000
title: <verbe + objet, une ligne>
status: todo            # todo | doing | review | done | blocked
phase: 1
agent: core             # core | ui | reviewer | scribe
model: sonnet           # haiku | sonnet | opus (voir AGENTS.md §Choix du modèle)
depends_on: []          # ids de tâches déjà fusionnées
branch: task/TASK-000-slug
---

## Objectif
<2 à 4 lignes : le résultat attendu, vu de l'utilisateur ou de l'appelant.>

## Contexte utile
<10 lignes max. Tout ce que l'agent doit savoir et qu'il ne trouvera pas dans les fichiers listés.
Pas de renvoi vers « le reste du repo ».>

## Fichiers
- **Lire** : <chemins précis, avec section si le fichier est long — ex. `ARCHITECTURE.md §4`>
- **Écrire** : <chemins ou globs autorisés — rien d'autre>
- **Contrats** : <fichiers de `contracts/` à respecter, en lecture seule>

## Critères d'acceptation
- [ ] <observable et vérifiable>
- [ ] <…>

## Vérification
```bash
<commandes exactes que l'agent lance avant de rendre : tests, lint, build>
```

## Hors périmètre
<ce qu'il ne faut pas faire, même si ça semble utile.>

## Rapport (rempli par l'agent, 150 mots max)
- Fait :
- Fichiers touchés :
- Vérification (sortie résumée) :
- Raccourcis pris (`shortcut:`) :
- À remonter à l'architecte :
