# ARCHITECTURE — Atelier

Cockpit desktop Linux pour Claude Code. Chaque section `##` se lit seule : une fiche de tâche renvoie à
une section (`ARCHITECTURE.md §4`), jamais au fichier entier.

| § | Contenu |
|---|---|
| 1 | Vue d'ensemble et flux principal |
| 2 | Arborescence du repo et propriétaires |
| 3 | Cœur Rust : modules |
| 4 | Pont Claude (`bridge/`) et cycle d'une permission |
| 5 | Interface (React) |
| 6 | Contrats |
| 7 | Sécurité |
| 8 | Données locales |
| 9 | Économie de tokens |
| 10 | Décisions (ADR) |

## 1. Vue d'ensemble

```
┌──────────────── Fenêtre principale (WebKitGTK) ────────────────┐
│  UI React/TS  ── invoke / events ──┐                            │
└────────────────────────────────────┼────────────────────────────┘
                                     ▼
┌──────────────── Cœur Rust (Tauri 2) ───────────────────────────┐
│ supervisor · claude · store · music · vault · graph · projects │
│ windows · notify                                               │
└───┬───────────────┬──────────────┬──────────────┬──────────────┘
    │ NDJSON stdio  │ D-Bus        │ fichiers     │ fenêtre séparée
    ▼               ▼              ▼              ▼
 bridge/ (Node)   lecteurs      vault Obsidian  Instagram
 Agent SDK        MPRIS         graphify-out/   (aucune capability,
    │                           tasks/, git     cookies à part)
    ▼
 `claude` (binaire officiel, non modifié)
```

Flux d'un message : UI → `invoke("session_send")` → module `claude` → ligne NDJSON vers le pont → SDK →
`claude`. Retour : événements du SDK → pont → Rust (journal + agrégats) → événement Tauri → UI.

Principe : **le cœur Rust est le seul à parler au système** (process, fichiers, D-Bus). L'UI n'a ni accès
au shell ni accès au système de fichiers.

## 2. Arborescence et propriétaires

| Chemin | Rôle | Agent propriétaire |
|---|---|---|
| `src-tauri/src/<module>/` | cœur Rust, un dossier par module (§3) | `core` |
| `src-tauri/capabilities/`, `build.rs` | permissions des fenêtres | `core`, revue `opus` obligatoire |
| `bridge/` | pont Node ↔ Agent SDK (§4) | `core` |
| `src/shell/` | cadre : rail, barres, panneaux, palette | `ui` |
| `src/features/<onglet>/` | un dossier par onglet | `ui` |
| `src/ui/` | composants partagés (inventaire dans `DESIGN.md`) | `ui` |
| `src/ipc/` | types et appels typés, miroir de `contracts/` | `ui` |
| `design/tokens.css` | tokens de design, source de vérité | architecte |
| `contracts/` | contrats d'interface (§6) | architecte seul |
| `tasks/` | fiches de tâche | architecte seul |
| `docs/adr/`, `docs/ROADMAP.md` | décisions, feuille de route | architecte |
| `.claude/agents/`, `.claude/rules/` | sous-agents, règles par chemin | architecte |
| `graphify-out/` | graphe du code (généré) | `scribe` |

Un module ou un onglet = un dossier = un périmètre d'écriture. Deux tâches parallèles n'écrivent jamais
dans le même dossier.

## 3. Cœur Rust : modules

| Module | Responsabilité | Dépendance clé | Version |
|---|---|---|---|
| `supervisor` | lancer et tuer des groupes de process ; aucun orphelin | `process-wrap`, `tokio` | 0.1 |
| `claude` | sessions : démarrer, envoyer, interrompre, reprendre, modèle ; routage des permissions | `supervisor` | 0.1 |
| `store` | réglages, index des sessions, journal d'événements, agrégats d'usage | `serde_json` | 0.1 |
| `notify` | notifications desktop | plugin Tauri officiel | 0.1 |
| `music` | télécommande MPRIS, puis lecteur local | `mpris`, puis `rodio` | 0.2 |
| `projects` | dossiers récents, branches, worktrees (via `git`), lecture de `tasks/` | `supervisor` | 0.3 |
| `vault` | lecture des notes du projet dans `$ATELIER_VAULT`, lien `obsidian://` | — | 0.3 |
| `graph` | lecture de `graphify-out/graph.json` et `GRAPH_REPORT.md` | — | 0.3 |
| `windows` | fenêtres « pause » isolées (Instagram) | — | 0.3 |

Aucun orphelin, trois filets : groupe de process (tué par `killpg` à la fermeture), `PR_SET_PDEATHSIG`
posé dans `pre_exec` depuis un thread qui vit aussi longtemps que l'app, et `kill_on_drop`. Un test
d'intégration tue l'app par SIGKILL et vérifie qu'il ne reste ni `node` ni `claude`.

## 4. Pont Claude et cycle d'une permission

`bridge/` est un process Node par session active. Il utilise `@anthropic-ai/claude-agent-sdk` avec le
binaire `claude` installé. Il ne contient aucune logique métier : il traduit.

Cycle d'une permission :
1. Le SDK appelle `canUseTool(outil, entrée, suggestions)`.
2. Le pont émet `permission_request {id, tool, input, suggestions}` et **attend**.
3. Rust passe la session à l'état `waiting_permission`, notifie le bureau, émet l'événement vers l'UI.
4. L'UI affiche la boîte de dialogue (spécifiée dans `DESIGN.md`). Trois réponses : une fois, toujours
   (renvoie les `suggestions` du SDK, qui écrit la règle dans `.claude/settings.local.json`), refuser.
5. Rust renvoie `permission_response {id, decision}` au pont, qui résout la promesse.

Règles : pas de délai d'expiration, pas de réponse par défaut, pas de mémorisation côté app (c'est Claude
Code qui stocke les règles « toujours »). Si l'UI ou le pont meurt, la demande est refusée.

Détails et justification : `docs/adr/0002-integration-cli.md`.

## 5. Interface

- React + TypeScript + Vite, CSS simple avec les variables de `design/tokens.css`. Pas de bibliothèque de
  composants.
- État : un store par onglet, alimenté par les événements Tauri. Les événements de streaming passent par
  un canal Tauri, pas par l'état global, pour ne pas re-rendre toute l'app à chaque fragment.
- Onglets média et graphe chargés à la demande (`React.lazy`) : ils ne coûtent rien tant qu'ils sont fermés.
- Markdown rendu sans HTML brut ; les liens s'ouvrent dans le navigateur système.

## 6. Contrats

| Fichier | Contenu | Figé après |
|---|---|---|
| `contracts/bridge-protocol.md` | messages NDJSON Rust ↔ pont | spike TASK-002 |
| `contracts/ipc.md` | commandes et événements Tauri, par module | TASK-004 |

Les contrats sont écrits à partir d'événements réels capturés par les spikes, pas de mémoire. Seul
l'architecte les modifie ; un agent qui a besoin d'un changement s'arrête et le demande dans son rapport.
Un contrat change par une tâche dédiée, fusionnée avant les tâches qui en dépendent.

## 7. Sécurité

| Sujet | Règle |
|---|---|
| Permissions Claude | mode `manual` par défaut ; `bypassPermissions` jamais proposé |
| Identifiants | l'app ne lit, ne stocke ni ne transmet aucun jeton ; connexion par le flux d'Anthropic |
| Fenêtre Instagram | aucune capability, aucun script injecté, cookies à part, test d'absence d'IPC (ADR-0003) |
| Commandes Tauri | liste blanche par fenêtre (`AppManifest::commands`) ; l'UI n'a pas le plugin shell |
| Contenu non fiable | sorties de Claude, notes, graphe : jamais interprétés comme HTML ; `graph.html` jamais affiché |
| CSP | stricte, sans source distante ; polices et icônes embarquées |
| Dépendances | toute nouvelle crate ou paquet npm est justifié dans la fiche de tâche et relu |
| Plugins, skills, MCP | aucun ajout sans validation de l'utilisateur (lien du repo + vérifications) |
| `.claude/` | toute modification est relue comme du code |

## 8. Données locales

Dossier `~/.local/share/atelier/` :
- `settings.json` — réglages.
- `sessions.json` — index (id, projet, titre, modèle, date, coût).
- `sessions/<id>.ndjson` — journal des événements reçus ; sert à réafficher une session et à calculer
  l'onglet Usage.

Les transcriptions internes de Claude Code (`~/.claude/projects/`) ne sont pas lues : format instable.
Pas de base de données tant que les fichiers suffisent.

## 9. Économie de tokens

Objectif : le coût d'une tâche ne dépend pas de la taille du repo.

| Levier | Règle |
|---|---|
| `CLAUDE.md` | court (moins de 60 lignes) : il est chargé par chaque agent à chaque tâche |
| Règles par chemin | `.claude/rules/*.md` avec `paths:` : les règles Rust ne se chargent que sur du Rust |
| Fiche de tâche | autonome : objectif, fichiers à lire (avec la section), fichiers à écrire, critères, commandes |
| Docs sectionnées | `ARCHITECTURE.md` et `DESIGN.md` se lisent par section |
| Contrats | un agent lit le contrat de son module, pas le code du module voisin |
| Graphify | `graphify query` / `explain` / `path` au lieu de parcourir le repo ; `graphify update .` (sans LLM) après chaque fusion |
| Modèle par tâche | Haiku pour le mécanique, Sonnet par défaut, Opus pour le risqué (voir `AGENTS.md`) |
| Rapports | 150 mots max ; l'architecte lit les rapports et le verdict de revue, pas les diffs |
| Sessions | une tâche = un sous-agent neuf ; pas d'Agent Teams (environ 7 fois plus de tokens) |
| Cache | préfixe de prompt stable (« Exécute `tasks/TASK-XXX.md` ») ; tâches enchaînées sans longue pause |

## 10. Décisions

| ADR | Sujet |
|---|---|
| `docs/adr/0001-stack.md` | Tauri 2 + Rust + React/TS |
| `docs/adr/0002-integration-cli.md` | pont Node + Agent SDK, facturation, conditions d'utilisation |
| `docs/adr/0003-instagram-isolation.md` | fenêtre séparée sans accès à l'app |
| `docs/adr/0004-musique.md` | MPRIS, puis lecteur local |
