---
id: TASK-027
title: Onglet Agents — salle de contrôle des sous-agents
status: done
phase: 4
agent: ui
model: sonnet
depends_on: [TASK-029]
branch: task/TASK-027-agents-ui
---

## Objectif
L'onglet Agents montre une carte par sous-agent lancé par Claude dans les sessions ouvertes : type, tâche,
session d'origine, état, durée, tokens, dernier message ; plus une chronologie simple.

## Contexte utile
- Source : les événements gardés par App pour chaque session (table par clé ajoutée par TASK-029 ; lis
  `src/App.tsx` et `src/features/chat/` pour son type). Pas de Rust, pas de nouvelle commande.
- Messages du SDK (`contracts/bridge-protocol.md §4`, échantillon réel `spikes/bridge/samples/subagent.ndjson`) :
  `system/task_started` (`task_id`, `tool_use_id`, `subagent_type`, description), `system/task_updated`
  (`patch.status`), `system/task_notification` (`status`, `summary`, `usage`) ; les messages du
  sous-agent portent `parent_tool_use_id`.
- Une réduction pure `événements → cartes` testée sur l'échantillon réel. États affichés avec `Tally`
  (`src/ui/Tally.tsx`) : en attente, en cours, terminé, échec.
- Filtres : Tous / En cours / Terminés / Échecs. Un clic sur une carte ouvre la session d'origine dans le Chat.
- Onglet en import dynamique (`src/features/agents/`, état vide à remplacer). Respecte `DESIGN.md §3`
  (Agents, 6 états) et `§8`.

## Fichiers
- **Lire** : `src/App.tsx`, `src/features/chat/` (type de la table d'événements), `contracts/bridge-protocol.md §4`,
  `spikes/bridge/samples/subagent.ndjson`, `DESIGN.md §3`, `§8`, `src/ui/Tally.tsx`
- **Écrire** : `src/features/agents/**`, `src/App.tsx` (passer la table à l'onglet seulement)
- **Contrats** : `contracts/bridge-protocol.md §4`

## Critères d'acceptation
- [ ] Cartes justes sur l'échantillon réel ; mise à jour en direct pendant une session.
- [ ] Tests de la réduction.

## Vérification
```bash
npm ci && npm run lint && npm test && npm run build
```

## Hors périmètre
Pas de Rust, pas d'arrêt d'un sous-agent depuis l'onglet.

## Rapport (rempli par l'agent, 150 mots max)
- Fait :
- Fichiers touchés :
- Vérification (sortie résumée) :
- Raccourcis pris (`shortcut:`) :
- À remonter à l'architecte :
