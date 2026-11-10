# CLAUDE.md — brouillon de départ (à compléter par l'architecte)

> Projet : cockpit desktop Linux pour Claude Code (nom de code **Atelier**).
> Une interface graphique, avec le CLI Claude Code qui tourne en arrière-plan,
> plus des onglets en bonus (musique, Reels Instagram, second cerveau, graphe du code…).

## Rôles
- **Architecte (Fable 5.2)** : architecture, découpage, fiches de tâche, délégation, revue, intégration.
  Ne code pas les features.
- **Sous-agents** (définis dans `.claude/agents/`) : un agent = une tâche = un périmètre de fichiers.

## Règles pour tous les agents
1. **Contexte minimal** : lis ta fiche de tâche et uniquement les fichiers qu'elle liste.
2. Pour comprendre la structure, lis `graphify-out/GRAPH_REPORT.md` / interroge le graphe au lieu de
   grep tout le repo.
3. N'édite que les fichiers autorisés par ta fiche. Si tu as besoin d'un autre fichier, arrête-toi et signale-le.
4. Les contrats d'interface (`contracts/`) sont la source de vérité ; seul l'architecte les modifie.
5. **Ponytail** : réutilise l'existant, la stdlib et les API natives. Toute nouvelle dépendance doit être justifiée.
6. **Sécurité** : n'installe aucun plugin, skill ou MCP. Pas de secrets dans le code ni dans les logs. Pas de
   `--dangerously-skip-permissions`.
7. Instagram : aucune automatisation ni scraping, webview isolée sans accès à l'API interne de l'app.
8. Termine toujours par un **rapport** : ce qui a été fait, les fichiers touchés, les tests lancés, les
   points ouverts et les décisions à remonter.

## Suivi (second cerveau)
- Vault Obsidian : `$ATELIER_VAULT/Projets/Atelier/` (via la CLI officielle `obsidian`, Obsidian lancé).
- Après chaque tâche fusionnée : mettre à jour le journal, le tableau de bord, les décisions et les leçons.
- Après chaque merge : `graphify update .`

## Conventions
- Code et identifiants en anglais ; docs, notes et messages de commit en français.
- Commits conventionnels (`feat(chat): …`), une branche par tâche (`task/TASK-XXX`), git worktrees pour
  le travail en parallèle.

## Commandes
<!-- À remplir par l'architecte une fois la stack choisie (dev, tests, lint, build). -->
