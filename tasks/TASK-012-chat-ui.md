---
id: TASK-012
title: Onglet Chat — conversation en streaming
status: todo
phase: 2
agent: ui
model: sonnet
depends_on: [TASK-006]
branch: task/TASK-012-chat-ui
---

## Objectif
L'onglet Chat : choisir un dossier de projet, démarrer une session, envoyer des messages, voir la réponse
s'écrire en direct, avec les cartes d'outils, l'indicateur de réflexion, le modèle, le coût, le bouton
d'interruption et la liste des sessions récentes. Le cœur n'existe pas encore : tu codes contre le contrat
et tu testes avec un faux flux.

## Contexte utile
- Les commandes et les types sont dans `contracts/ipc.md §1-2`. Crée `src/ipc/claude.ts` : types exacts
  et une fonction typée par commande (`invoke` + `Channel` de `@tauri-apps/api/core`).
- Les messages `sdk` sont ceux de `contracts/bridge-protocol.md §4` : texte en direct par
  `stream_event`/`content_block_delta`, blocs complets par `assistant`, résultats d'outils par `user`,
  fin de tour par `result`. Après interruption, `result` `error_during_execution` n'est **pas** une erreur
  à afficher. Le coût de session = dernier `result.total_cost_usd` (remplacer, ne pas additionner).
- La logique (réduire les `SessionEvent` en une liste de messages affichables) va dans un module pur
  `src/features/chat/reduce.ts`, testé avec Vitest à partir d'extraits réels de
  `spikes/bridge/samples/stream.ndjson` et `interrupt.ndjson` (champ `data` de chaque ligne).
- Markdown : `react-markdown` (seule dépendance autorisée), sans HTML brut (comportement par défaut) ; liens
  rendus en texte avec l'URL visible, pas cliquables pour l'instant.
- Les demandes de permission ne sont **pas** de ton ressort (TASK-013) : affiche seulement l'état
  `waiting_permission` dans l'en-tête, garde la file des demandes en attente (ajout sur
  `permission_request`, marquage `cancelled` sur `permission_cancelled`) et monte
  `<PermissionHost requests onDecide />` de `src/ui/PermissionDialog.tsx` (version vide pour l'instant,
  remplacée par TASK-013 ; ne la modifie pas). `onDecide` appelle `permission_respond`.
- Choix du dossier : un champ texte + la liste `settings.recentCwds` (pas de plugin de dialogue).

## Fichiers
- **Lire** : `contracts/ipc.md §1-2`, `contracts/bridge-protocol.md §4`, `DESIGN.md §3` (wireframe Chat),
  `DESIGN.md §5` (streaming), `DESIGN.md §8`, `src/App.tsx`, `src/ui/Tally.tsx`
- **Écrire** : `src/features/chat/**`, `src/ipc/claude.ts`, `src/ipc/claude.test.ts`, `src/App.tsx`,
  `package.json`, `package-lock.json`
- **Contrats** : `contracts/ipc.md`, `contracts/bridge-protocol.md`

## Critères d'acceptation
- [ ] `App.tsx` affiche le Chat (la démo reste accessible par un lien discret).
- [ ] Streaming fluide : les fragments ne re-rendent que le message en cours.
- [ ] Cartes d'outils : nom, entrée résumée, état (en cours / fait / échec / refusé).
- [ ] Interruption (`Échap` et bouton), changement de modèle (`session_models`), coût de la session.
- [ ] Sessions récentes (`sessions_list`) ; rouvrir = `session_history` puis `session_start` avec `resume`.
- [ ] a11y selon `DESIGN.md §8` point 5 (`role="log"`, `aria-live="off"`, région `status`).
- [ ] Tests Vitest de `reduce.ts` sur les échantillons réels (texte en direct, bloc complet, outil,
      interruption, coût).

## Vérification
```bash
npm ci && npm run lint && npm test && npm run build
grep -rn "dangerouslySetInnerHTML\|iframe" src && echo INTERDIT || echo OK
```

## Hors périmètre
Pas de boîte de permission, pas de rail ni de panneaux, pas de Rust.

## Rapport (rempli par l'agent, 150 mots max)
- Fait : onglet Chat (démarrage, streaming, cartes d'outils, Échap/Arrêter, modèle, coût, sessions récentes, reprise), `reduce.ts` pur, `src/ipc/claude.ts`.
- Fichiers touchés : `src/features/chat/**`, `src/ipc/claude.ts(+test)`, `src/App.tsx`, `package.json`, `package-lock.json`.
- Vérification : lint, 11 tests, build OK ; grep interdit : OK.
- Raccourcis (`shortcut:`) : sorties de sous-agents ignorées ; pas de diff inline, pas de pastille « N nouveaux blocs » ; coût affiché en $ ; fichier de tâche hors liste « Écrire » modifié (rapport).
- À remonter à l'architecte : les prompts utilisateur ne sont peut-être pas dans `session_history` (seuls des SessionEvent) : à la réouverture, le texte « Toi » manquera ; contrat à préciser. Aucun échantillon réel ne contient d'outil : fixture inline.
