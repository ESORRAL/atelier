---
id: TASK-030
title: Onglet Agents — cartes fiables et ouverture de la session d'origine
status: todo
phase: 4
agent: ui
model: sonnet
depends_on: [TASK-027, TASK-029]
branch: task/TASK-030-agents-finitions
---

## Objectif
Lever les deux limites laissées par TASK-027 : une carte ne disparaît plus sur une session bavarde, et un
clic sur une carte affiche la session d'origine dans le Chat. La durée d'un sous-agent en cours s'affiche.

## Contexte utile
- Aujourd'hui l'onglet lit la table d'événements par clé tenue par App (200 lignes par session, lignes
  coupées à 4000 caractères) : sur une session chargée, `task_started` peut sortir de la fenêtre.
- Garde à part, par session, les seuls événements utiles aux cartes (`system` de sous-types `task_started`,
  `task_updated`, `task_notification`, et le dernier texte de chaque sous-agent), sans limite de 200 mais
  bornés raisonnablement (par exemple 500 sous-agents par session, le plus ancien sorti en premier).
  Horodate chaque événement à sa réception (`Date.now()`) pour calculer la durée en cours.
- Ajoute `openSession(key)` à `ChatControls` (`src/features/chat/Chat.tsx`) : sélectionne l'onglet de
  cette session s'il est ouvert, sinon ne fait rien et l'onglet Agents affiche « Session fermée ».
  Branche-le dans `App.tsx` (`onOpenSession`).
- Supprime l'entrée devenue inutile pour Agents dans `src/shell/tabs.ts` si App ne s'en sert plus, ou rends
  les props obligatoires.

## Fichiers
- **Lire** : `src/features/agents/`, `src/features/chat/Chat.tsx`, `src/features/chat/sessions.ts`, `src/App.tsx`, `src/shell/tabs.ts`
- **Écrire** : `src/features/agents/**`, `src/features/chat/Chat.tsx`, `src/features/chat/sessions.ts`,
  `src/features/chat/sessions.test.ts`, `src/App.tsx`, `src/shell/tabs.ts`
- **Contrats** : aucun

## Critères d'acceptation
- [ ] Test : 300 événements bavards après un `task_started` → la carte existe toujours.
- [ ] Clic sur une carte → onglet Chat sur la bonne session ; session fermée → message clair.
- [ ] Durée affichée pour un sous-agent en cours.

## Vérification
```bash
npm ci && npm run lint && npm test && npm run build
```

## Hors périmètre
Pas de Rust, pas d'arrêt d'un sous-agent.

## Rapport (rempli par l'agent, 150 mots max)
- Fait :
- Fichiers touchés :
- Vérification (sortie résumée) :
- Raccourcis pris (`shortcut:`) :
- À remonter à l'architecte :
