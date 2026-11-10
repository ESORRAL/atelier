# Spike TASK-002 — constats sur l'Agent SDK

SDK `@anthropic-ai/claude-agent-sdk` 0.3.322, CLI 2.1.322 via `pathToClaudeCodeExecutable`, Node 24,
modèle `haiku`, `permissionMode: 'default'` explicite (sans lui, le CLI peut démarrer en `auto`).
Captures brutes : `samples/<scénario>.ndjson`, une ligne `{t, kind, data}` (`t` en ms, `data` = message SDK).
Tous les messages portent `type`, `session_id`, `uuid` ; la plupart ajoutent `subtype`.

## Lecture transversale
- **Identifiant de session** : `session_id` sur chaque message, dès `system/hook_started` (avant `system/init`).
  Identique après `resume` (pas de nouvel id).
- **Coût et tokens** : message `result` → `total_cost_usd` (**cumulé sur la session**, pas par tour),
  `usage` (tokens du dernier appel), `modelUsage[modèle].costUSD/inputTokens/outputTokens/cache*`
  (cumulé), `model_usage_since_last_result` (delta du tour : c'est lui pour un coût par tour),
  `num_turns`, `duration_ms`, `result_index` (0, 1, … par tour en mode flux).
  Tokens en direct : `stream_event` `message_start`/`message_delta` → `event.usage`.
- **Limites d'abonnement** : `rate_limit_event.rate_limit_info.unifiedWindows.{five_hour,seven_day}.utilization`.
- **Sous-agent** : `parent_tool_use_id` = id du `tool_use` `Agent` qui l'a lancé (null sinon), plus
  `agent_id`, `subagent_type`, `task_description` sur le premier message. Cycle de vie : `system/task_started`
  (`task_id`, `tool_use_id`, `subagent_type`), `system/task_updated` (`patch.status`),
  `system/task_notification` (`status`, `summary`, `usage`). Par défaut le SDK ne relaie que les blocs
  tool_use/tool_result du sous-agent ; `forwardSubagentText: true` relaie aussi son texte
  (`subagent.mjs`). L'outil `Agent` n'est pas passé par `canUseTool`. Fin de session : `result.subagent_stats`.
- **Mode flux** (prompt = itérable async de `{type:'user', message:{role,content}, parent_tool_use_id:null}`) :
  un `system/init` et un `result` **par tour**.
- La session charge les réglages de l'utilisateur : hooks (`system/hook_started|hook_response`), plugins,
  serveurs MCP, skills (voir `system/init`). À trancher : `settingSources` pour l'app.

## 1. stream — OK
Ordre : `system/hook_*` → `system/init` → `system/status` (`status:"requesting"`) → `rate_limit_event` →
`stream_event` (`event.type` = `message_start`, `content_block_start`, `content_block_delta`
(`delta.type` = `text_delta` | `thinking_delta`), `content_block_stop`, `message_delta`, `message_stop`) →
`assistant` (un par bloc **complet**, `message.content` = ce seul bloc, `stop_reason:null`) → `result/success`.
Autres types vus ailleurs : `system/thinking_tokens` (`estimated_tokens`), `system/commands_changed`.
`system/init` utile : `model`, `permissionMode`, `tools`, `mcp_servers[{name,status}]`, `apiKeySource`,
`claude_code_version`, `cwd`. Le texte de la pensée arrive vide (`thinking:""`, seule la signature).

    {"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hello from haiku"}},"parent_tool_use_id":null,"session_id":"…","uuid":"…","api_message_id":"msg_…"}

## 2. permission — OK
`canUseTool(toolName, input, options)` ; `options` observé :
`{signal, suggestions, displayName, description, toolUseID, requestId}` (+ `blockedPath` pour Bash).
Write : `suggestions = [{type:"setMode", mode:"acceptEdits", destination:"session"}]`.
- Refus `{behavior:'deny', message}` → message `user` avec `tool_result` `is_error:true`, `content` = notre
  message, `tool_result_meta[].permission_decision = {decision:"reject", source:"user_reject"}` ;
  le modèle s'arrête et le `result` liste l'appel dans `permission_denials[{tool_name,tool_use_id,tool_input}]`.
- Accord `{behavior:'allow', updatedInput}` → l'outil s'exécute, `permission_decision.decision:"accept"`.
- Aucun délai : le CLI attend la promesse.

## 3. always — OK, avec une surprise
Bash `touch always.txt` → `suggestions` :

    [{"type":"addRules","rules":[{"toolName":"Bash","ruleContent":"touch always.txt"}],"behavior":"allow","destination":"localSettings"},
     {"type":"addDirectories","directories":["…/sandbox"],"destination":"session"},
     {"type":"setMode","mode":"acceptEdits","destination":"session"}]

Renvoyées telles quelles dans `updatedPermissions`. La règle `Bash(touch always.txt)` est écrite dans
`.claude/settings.local.json` **du dépôt principal** (racine du checkout, pas le worktree, pas le `cwd`) ;
le fichier a été créé. Ensuite : même session et nouvelle session → `canUseTool` n'est plus appelé,
`tool_result_meta[].permission_decision = {decision:"accept", source:"user_permanent", reason_type:"rule"}`.
Le premier passage est dans `samples/always-first-run.ndjson` ; les relances trouvent la règle déjà là
(`ruleWasAlreadyThere: true`, 0 appel).

## 4. interrupt — OK
`q.interrupt()` résout en `{still_queued: []}` en ~2 ms. Le flux émet ensuite : un `assistant` avec le texte
**partiel** déjà reçu, un `user` `[Request interrupted by user]`, `content_block_stop`, `message_delta`
(`stop_reason:null`), `message_stop` avec `abandoned_blocks`, puis
`result` `subtype:"error_during_execution"`, `is_error:true`, `terminal_reason:"aborted_streaming"`, `result:""`.
La session reste vivante : le tour suivant répond normalement. Pendant la pensée, même séquence sans texte.

## 5. model — OK
`q.supportedModels()` → `[{value, resolvedModel, displayName, description, supportsEffort,
supportedEffortLevels, supportsAdaptiveThinking, supportsFastMode, supportsAutoMode, supportsThinkingOff}]`
(`default`, `opus`, `sonnet`, `fable`, `haiku`, puis des ids complets). `q.setModel('sonnet')` résout en
`undefined` ; le tour suivant a `system/init.model:"claude-sonnet-5-5"` et `assistant.message.model` idem.
`modelUsage` du `result` liste les deux modèles.

## 6. resume — OK
`query({prompt, options:{resume: sessionId}})` : même `session_id`, contexte présent (« PELICAN-42 »
retrouvé). Hook `SessionStart:resume`. L'historique **n'est pas rejoué** dans le flux : le pont doit tenir
son propre journal pour réafficher la conversation.

## 7. kill — ÉCHEC : le `claude` survit
Le pont Node tué (SIGTERM ou SIGKILL) pendant la réponse : son enfant `claude` reste vivant et visible dans
`pgrep -f` à 0,5 s, 2 s et 5 s (`samples/kill.ndjson`). Le script tue ensuite ces orphelins lui-même.
Conséquence : la supervision doit tuer le **groupe de process** (`killpg`) ou utiliser `PR_SET_PDEATHSIG`
côté pont ; on ne peut pas compter sur le SDK.

## Ce qui ne marche pas / à noter
- Règles « toujours » écrites hors du dossier de travail (racine du dépôt git principal).
- `setMode acceptEdits` arrive en suggestion même pour un simple Write : l'UI doit distinguer
  « toujours cette règle » de « passer en acceptEdits ».
- `total_cost_usd` cumulé : ne pas l'additionner tour par tour.

## Non vérifié
- Durée de vie d'un `claude` orphelin au-delà de 5 s (le script le tue à ce moment).
- Emplacement de `localSettings` pour un dépôt simple, hors worktree.
- Comportement avec `settingSources: []`.
