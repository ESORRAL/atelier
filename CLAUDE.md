# Atelier

Cockpit desktop Linux pour Claude Code : une interface graphique, le CLI tourne en arrière-plan.
Stack : Tauri 2 + Rust (`src-tauri/`), React + TypeScript (`src/`), pont Node vers l'Agent SDK (`bridge/`).

## Si tu es un sous-agent
1. Ta mission est ta fiche `tasks/TASK-XXX-*.md`. Lis-la, puis **uniquement** les fichiers qu'elle liste.
2. N'écris que dans les chemins qu'elle autorise. Besoin d'un autre fichier : arrête-toi et dis-le dans
   ton rapport.
3. Pour comprendre la structure : `graphify query "<question>"` ou `graphify explain "<nœud>"`. Ne
   parcours pas le repo.
4. `contracts/` est la source de vérité, en lecture seule. Un contrat à changer : arrête-toi et remonte-le.
5. Sobriété (Ponytail) : réutilise l'existant, la bibliothèque standard, les API natives. Aucune nouvelle
   dépendance hors de celles nommées dans ta fiche.
6. Lance les commandes de vérification de ta fiche, committe sur ta branche, remplis la section Rapport
   (150 mots max).

## Interdits
- Installer un plugin, un skill, un serveur MCP ou un outil système.
- `--dangerously-skip-permissions`, le mode `bypassPermissions`, un secret dans le code ou les logs.
- Lire, stocker ou transmettre un jeton d'authentification Claude.
- Donner à la fenêtre Instagram un accès à l'app, y injecter un script, automatiser ou extraire son contenu.
- Afficher du HTML non fiable (dont `graphify-out/graph.html`).
- Modifier `.claude/`, `contracts/`, `tasks/` (hors ta section Rapport), `CLAUDE.md`, `AGENTS.md`.

## Conventions
- Code, identifiants et commentaires en anglais. Docs, notes et messages de commit en français.
- Commits conventionnels : `feat(chat): …`, `fix(core): …`, `docs: …`. Une branche par tâche :
  `task/TASK-XXX-slug`.
- Un raccourci assumé porte un commentaire `shortcut: <limite>, <quand le lever>`.

## Où trouver quoi
| Besoin | Fichier |
|---|---|
| Architecture, par section | `ARCHITECTURE.md` |
| Design, par section | `DESIGN.md`, `design/tokens.css` |
| Décisions | `docs/adr/` |
| Feuille de route | `docs/ROADMAP.md` |
| Fonctionnement des agents (architecte seulement) | `AGENTS.md` |

## Commandes
<!-- Remplies par la tâche d'échafaudage (TASK-004) : dev, test, lint, build. -->

## Si tu es l'architecte (session principale)
Tu ne codes pas les features : tu découpes, délègues, fais relire, intègres. Suis `AGENTS.md`. Chaque
phase se termine par un point à l'utilisateur, puis tu attends son GO.

## Consignes de compactage
Garde : la phase en cours, les tâches ouvertes avec leur état, les décisions en attente de l'utilisateur.
Jette : le contenu des rapports déjà intégrés et les sorties de commandes.
