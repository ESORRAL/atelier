# AGENTS — système multi-agents d'Atelier

Ce fichier est pour l'architecte. Les sous-agents ne le lisent pas : tout ce qu'il leur faut est dans
leur définition (`.claude/agents/`) et dans leur fiche de tâche.

## Rôles

| Agent | Modèle par défaut | Écrit dans | Outils |
|---|---|---|---|
| **Architecte** (session principale, Fable 5.2) | — | `contracts/`, `tasks/`, `docs/`, `ARCHITECTURE.md`, `AGENTS.md`, `CLAUDE.md`, `.claude/` | tous ; ne code pas les features |
| `core` | sonnet | `src-tauri/`, `bridge/` | lecture, écriture, shell ; worktree isolé |
| `ui` | sonnet | `src/`, `design/` | lecture, écriture, shell ; worktree isolé |
| `reviewer` | opus | rien (lecture seule) | lecture, shell ; pas d'écriture |
| `scribe` | haiku | `$ATELIER_VAULT/01 - Projets/Atelier/`, `graphify-out/` | lecture, écriture, shell |

La recherche documentaire passe par les agents intégrés (`claude-code-guide`, `Explore`) : rien à écrire.
Agent Teams n'est pas utilisé (ADR-0002).

## Choix du modèle

Le champ `model:` de la fiche de tâche prime sur le défaut de l'agent.

| Modèle | Pour | Exemples |
|---|---|---|
| **haiku** | mécanique, sans décision | notes Obsidian, mise à jour du graphe, renommages, configuration, fichiers de test répétitifs |
| **sonnet** | tâche bornée avec contrat clair (défaut) | un onglet, un module, un composant, des tests |
| **opus** | risqué ou transversal | supervision de process, pont et permissions, capabilities Tauri, concurrence, refonte de design |
| **fable** | orchestration seulement | découpage, contrats, arbitrages, intégration |

Revue : `sonnet` pour une tâche codée en haiku ou sans risque ; `opus` pour tout ce qui touche
`supervisor`, `claude`, `bridge/`, `capabilities/`, `windows`. Le relecteur n'est jamais l'agent qui a codé.

## Cycle d'une tâche

```
todo ──▶ doing ──▶ review ──▶ done
           │          │
           └─ blocked ┘  (l'agent s'arrête et remonte)
```

1. **Découper** — l'architecte écrit `tasks/TASK-XXX-slug.md` d'après `tasks/_TEMPLATE.md`. Une fiche
   tient en une page et se suffit à elle-même.
2. **Lancer** — prompt du sous-agent, toujours le même : `Exécute tasks/TASK-XXX-slug.md.` Les tâches
   sans dépendance entre elles et sans dossier d'écriture commun partent en parallèle, chacune dans son
   worktree (`isolation: worktree`), sur la branche `task/TASK-XXX-slug`.
3. **Rendre** — l'agent lance les commandes de vérification, committe, remplit la section Rapport
   (150 mots max).
4. **Relire** — `reviewer` reçoit la fiche et la branche. Il rend `APPROUVÉ` ou `À CORRIGER` avec
   5 constats au plus. S'il faut corriger, la fiche repart chez l'agent d'origine avec les constats.
5. **Fusionner** — l'architecte ouvre la PR GitHub (`gh pr create`), fusionne en squash, supprime le
   worktree. Il lit le rapport et le verdict, pas le diff, sauf alerte du relecteur.
6. **Consigner** — `scribe` lance `graphify update .`, passe la tâche à `done` dans Obsidian, ajoute une
   ligne au journal.
7. **Fin de phase** — l'architecte présente : fait, reste, risques, décisions. Puis il attend le GO.

## Contexte minimal : ce que reçoit un sous-agent

| Reçu | Source |
|---|---|
| Règles communes | `CLAUDE.md` (court) |
| Règles de son langage | `.claude/rules/*.md`, chargées selon les fichiers touchés |
| Sa mission | sa fiche de tâche |
| Les interfaces | le ou les contrats cités par la fiche |
| La structure du code | `graphify query "<question>"`, `graphify explain "<nœud>"` |
| Sobriété | règles Ponytail, injectées par le plugin |

Il ne reçoit pas : la conversation de l'architecte, les autres fiches, `AGENTS.md`, les ADR, ni
`DESIGN.md` en entier (la fiche cite la section utile).

## Règles d'écriture des fiches

- Lister les fichiers à lire avec leur section ; jamais « regarde le repo ».
- Un seul dossier d'écriture par fiche quand c'est possible.
- Critères d'acceptation observables, avec la commande qui les vérifie.
- Une fiche qui dépasse une page se coupe en deux.
- Toute nouvelle dépendance est nommée dans la fiche, donc décidée par l'architecte.
- Une demande de changement de contrat arrête la tâche : elle remonte dans le rapport.

## Outils de suivi

| Outil | Quand | Qui |
|---|---|---|
| **Graphify** | avant une tâche : `graphify query` ; après chaque fusion : `graphify update .` (sans LLM) | agents ; `scribe` |
| **Obsidian** | après chaque fusion et à chaque fin de phase | `scribe` |
| **Ponytail** | en continu ; `/ponytail-review` dans la revue ; `/ponytail-audit` en fin de phase | plugin ; `reviewer` |
| **GitHub** | une branche et une PR par tâche | architecte |

Espace Obsidian `01 - Projets/Atelier/` : `Atelier.md` (tableau de bord), `Journal.md`, `Décisions.md`,
`Tâches.md`, `Leçons.md`. Tant que la CLI Obsidian n'est pas activée, `scribe` écrit les fichiers
Markdown directement dans le vault.

## Installations

Aucun agent n'installe quoi que ce soit. L'architecte ne propose que ce qui figure dans la liste validée
du prompt d'origine ; pour le reste, il présente le lien du repo, le propriétaire, la licence et ses
vérifications, puis attend la validation.
