# Contrat — protocole du pont (`bridge/` ↔ cœur Rust)

Version 1.1 (`requestId` sur `list_models` / `models`). Version 1 écrite d'après les captures réelles de `spikes/bridge/` (SDK 0.3.322, CLI 2.1.322).
Seul l'architecte modifie ce fichier.

## Principes
- Un process pont par session. Il vit le temps de la session.
- NDJSON : une ligne JSON par message, UTF-8. `stdin` = Rust → pont, `stdout` = pont → Rust,
  `stderr` = journal libre (jamais analysé).
- Le pont **ne remodèle pas** les messages du SDK : il les transmet tels quels dans `sdk.message`.
  Le cœur Rust lit seulement les champs listés au §4 ; l'UI reçoit le reste sans transformation.
- Chaque message porte un champ `type`. Un type inconnu est ignoré et journalisé, jamais fatal.

## 1. Lancement
```
node bridge/main.mjs
```
Le pont n'accepte aucun argument. Son premier message attendu est `start`. Il est lancé par le module
`supervisor` dans son propre groupe de process : le SDK ne tue pas `claude` quand le pont meurt
(constaté), donc l'arrêt se fait toujours par `killpg`.

## 2. Rust → pont

| `type` | Champs | Effet |
|---|---|---|
| `start` | `cwd`, `claudePath`, `model?`, `permissionMode`, `resume?`, `readRoots?` | ouvre la session en mode flux. `permissionMode` ∈ `default`, `acceptEdits`, `plan`. `resume` = identifiant de session à reprendre. `readRoots` = dossiers absolus (8 au plus) où les lectures Bash sans effet s'exécutent sans demande, en plus de `cwd` (le cœur y met le vault Obsidian) |
| `user` | `text` | envoie un tour utilisateur |
| `interrupt` | — | interrompt la réponse en cours ; la session reste utilisable |
| `set_model` | `model` | change de modèle pour les tours suivants |
| `set_permission_mode` | `mode` | mêmes valeurs que `start.permissionMode` |
| `list_models` | `requestId` | demande la liste ; réponse `models` avec le même `requestId` |
| `permission_response` | `requestId`, `decision`, `message?` | répond à une `permission_request` (§3) |
| `close` | — | termine proprement ; le pont répond `closed` puis sort avec le code 0 |

Le pont refuse toute autre valeur de `permissionMode` (dont `bypassPermissions`, `auto`, `dontAsk`) par
un `error` non fatal. `permissionMode` est toujours passé explicitement au SDK : sans lui, le CLI peut
démarrer en `auto`.

## 3. Pont → Rust

| `type` | Champs | Sens |
|---|---|---|
| `ready` | `sdkVersion` | le pont attend `start` |
| `sdk` | `message` | un message du SDK, intact |
| `permission_request` | `requestId`, `toolName`, `input`, `toolUseID`, `displayName?`, `description?`, `blockedPath?`, `canAlways` | une approbation est requise ; le pont attend sans délai |
| `permission_cancelled` | `requestId` | la demande n'a plus lieu d'être (interruption, session arrêtée) |
| `models` | `requestId`, `models` | tableau renvoyé par `supportedModels()`, intact ; une réponse sans demande en attente est ignorée |
| `error` | `message`, `fatal` | `fatal: true` : le pont sort ensuite avec un code non nul |
| `closed` | — | fin propre |

### Cycle d'une permission
1. Le pont émet `permission_request`. `canAlways` vaut `true` si le SDK a proposé au moins une
   suggestion de type `addRules`.
2. Rust répond `permission_response` avec `decision` :
   - `allow_once` — le pont renvoie `{behavior:"allow", updatedInput: input}`.
   - `allow_always` — idem, plus `updatedPermissions` = **uniquement** les suggestions `addRules`
     reçues. Les suggestions `setMode` et `addDirectories` ne sont jamais renvoyées par ce chemin.
     Refusé par un `error` si `canAlways` est faux.
   - `deny` — le pont renvoie `{behavior:"deny", message}` (`message` par défaut : `Refusé par l'utilisateur`).
3. Pas de délai d'expiration ni de réponse par défaut. Si `stdin` se ferme alors qu'une demande est en
   attente, le pont la refuse et sort.

Les règles « toujours » sont écrites par Claude Code dans `.claude/settings.local.json` à la racine du
dépôt git du projet (constaté : la racine du dépôt principal, même depuis un worktree). L'app ne les
stocke pas.

## 4. Champs du SDK lus par le cœur Rust
Tout message `sdk.message` porte `type`, `session_id`, `uuid`, et souvent `subtype`.

| Besoin | Où |
|---|---|
| Identifiant de session | `session_id` du premier message reçu (stable après reprise) |
| Modèle, mode, version, serveurs MCP | `type:"system"`, `subtype:"init"` : `model`, `permissionMode`, `claude_code_version`, `mcp_servers`, `apiKeySource` (un `init` par tour) |
| Fin d'un tour | `type:"result"` ; `subtype` = `success` ou `error_during_execution` ; `is_error` ; `terminal_reason` |
| Coût de la session | `result.total_cost_usd` — **cumulé** : remplacer, ne pas additionner |
| Coût et tokens du tour | `result.model_usage_since_last_result` |
| Coût par modèle (cumulé) | `result.modelUsage[<modèle>]` : `costUSD`, `inputTokens`, `outputTokens` |
| Refus du tour | `result.permission_denials[]` |
| Limites d'abonnement | `type:"rate_limit_event"` : `rate_limit_info.unifiedWindows.{five_hour,seven_day}.utilization` |
| Texte en direct | `type:"stream_event"` : `event.type:"content_block_delta"`, `event.delta.type` = `text_delta` ou `thinking_delta` |
| Bloc terminé | `type:"assistant"` : un message par bloc complet dans `message.content` |
| Résultat d'outil | `type:"user"` : blocs `tool_result` ; décision dans `tool_result_meta[].permission_decision` |
| Sous-agent | `parent_tool_use_id` non nul ; cycle de vie par `system` / `task_started`, `task_updated`, `task_notification` |

Après `interrupt`, le flux émet un `assistant` avec le texte partiel, puis un `result` avec
`subtype:"error_during_execution"` et `terminal_reason:"aborted_streaming"` : ce n'est pas une erreur à
afficher.

## 5. Options fixes du SDK
| Option | Valeur | Raison |
|---|---|---|
| `pathToClaudeCodeExecutable` | `start.claudePath` | binaire officiel déjà installé |
| `includePartialMessages` | `true` | streaming |
| `forwardSubagentText` | `true` | onglet Agents |
| `settingSources` | défaut du SDK (réglages utilisateur, projet, local) | l'app se comporte comme le CLI : hooks, plugins et `CLAUDE.md` de l'utilisateur sont chargés |

Ces noms sont ceux utilisés dans les scripts de `spikes/bridge/`, sauf `settingSources`, non testé par le spike.

## 6. Journal
Le cœur Rust journalise chaque événement dans `sessions/<clé de session>.ndjson` (clé locale, voir `contracts/ipc.md §4`) (voir
`ARCHITECTURE.md §8`). La reprise ne rejoue pas l'historique dans le flux : ce journal est la seule
source pour réafficher une conversation.

## Lectures Bash sans demande (v1.2)

Le pont répond `allow` sans `permission_request` à un outil `Bash` dont la commande est une suite de
`cat`, `grep`, `ls`, `find`, `head`, `tail`, `cd` reliées par `;`, `&&`, `||`, `|` ou un saut de ligne, et dont tous les
chemins restent dans `cwd` ou `readRoots` (liens symboliques résolus). Tout le reste est demandé comme avant :
redirections (`>`, `<`, sauf `2>&1` et `2>/dev/null`, qui ne déplacent que les messages d'erreur), `$`, accents graves, `\`, sous-shell, `&`, `find -exec/-delete/-fprint…`, `tail -f`, `..`
qui sortirait des dossiers, `~/.ssh`, `~/.gnupg`, `~/.aws`, `.credentials.json`, `dangerouslyDisableSandbox`. Code :
`bridge/readonly.mjs`, tests : `bridge/readonly.test.mjs`. `Write`, `Edit` et les autres outils ne sont jamais concernés.
