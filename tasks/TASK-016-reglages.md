---
id: TASK-016
title: Écran Réglages
status: done
phase: 3
agent: ui
model: sonnet
depends_on: [TASK-015]
branch: task/TASK-016-reglages
---

## Objectif
L'onglet Réglages permet de régler ce que le `Settings` du contrat contient, plus le thème.

## Contexte utile
- Commandes `settings_get` / `settings_set` (`contracts/ipc.md` §1-2), appelées par `src/ipc/`.
- Champs : chemin du CLI (`claudePath`, vide = trouvé dans le PATH), modèle par défaut (`defaultModel` :
  menu « Celui de Claude Code » / Opus / Sonnet / Haiku / Fable, valeurs `null`, `opus`, `sonnet`,
  `haiku`, `fable`), mode de permission par défaut (`default` = « Demander à chaque fois »,
  `acceptEdits` = « Accepter les modifications de fichiers », `plan` = « Plan seulement ») — jamais
  d'autre mode —, dossiers récents (liste avec suppression), thème (Système / Sombre / Clair, via
  `src/ui/theme.ts`).
- Enregistrement explicite (bouton) avec retour visible ; erreur du cœur affichée telle quelle.
- Le Chat doit utiliser `defaultModel` et `defaultPermissionMode` au démarrage d'une session s'il ne le
  fait pas déjà (vérifie, petite modification autorisée dans `Chat.tsx`).

## Fichiers
- **Lire** : `contracts/ipc.md` §1-2, `src/ipc/claude.ts`, `src/ui/theme.ts`, `DESIGN.md` §8,
  `src/features/settings/`
- **Écrire** : `src/features/settings/**`, `src/features/chat/Chat.tsx` (lecture des défauts seulement)
- **Contrats** : `contracts/ipc.md`

## Critères d'acceptation
- [ ] Les cinq réglages lus, modifiés, enregistrés ; le thème s'applique immédiatement.
- [ ] Une nouvelle session du Chat prend le modèle et le mode par défaut.
- [ ] Validation pure (chemin vide ou absolu, liste des modes autorisés) testée avec Vitest.

## Vérification
```bash
npm ci && npm run lint && npm test && npm run build
```

## Hors périmètre
Pas de raccourcis remappables (plus tard), pas de Rust.

## Rapport (rempli par l'agent, 150 mots max)
- Fait : écran Réglages (CLI, modèle, mode, thème immédiat, dossiers récents supprimables, bouton Enregistrer avec retour, erreur du cœur affichée telle quelle). Validation pure testée. Chat : les défauts sont relus à chaque démarrage de session (avant, lus une seule fois au montage).
- Fichiers touchés : src/features/settings/{index.tsx,validate.ts,validate.test.ts,settings.css}, src/features/chat/Chat.tsx (2 lignes), ce fichier.
- Vérification : lint OK, 41 tests OK, build OK.
- Raccourcis pris (`shortcut:`) : aucun ; `select` natifs stylés plutôt qu'un composant Field (absent de src/ui).
- À remonter à l'architecte : rien. Non vérifié visuellement (pas de tauri dev).
