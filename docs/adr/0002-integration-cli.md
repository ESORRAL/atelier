# ADR-0002 — Piloter Claude Code en arrière-plan : pont Node avec l'Agent SDK officiel

- **Statut** : proposé
- **Date** : 2026-11-10 (doc officielle relue ce jour, CLI 2.1.322)

## Contexte
L'app doit : streamer les réponses, afficher chaque demande de permission dans l'UI (une fois / toujours /
refuser), interrompre, changer de modèle en cours de session, reprendre une session, et ne jamais
toucher aux identifiants.

Faits vérifiés dans la doc :
- `claude -p --output-format stream-json --verbose --include-partial-messages` produit un flux
  d'événements (`system/init`, `assistant`, `user`, `stream_event`, `result` avec `total_cost_usd`).
- Depuis la 2.1.302, `claude -p` démarre en mode **manual** : tout ce qui demande une approbation est
  refusé si aucun hôte ne répond. C'est le bon défaut pour nous.
- Le protocole brut sur stdin (messages de contrôle : interruption, changement de modèle) **n'est pas
  documenté** comme contrat public. Seule l'API du SDK l'est.
- L'Agent SDK TypeScript lance le binaire Claude Code. Il offre `canUseTool` (permission, avec les
  `suggestions` à renvoyer pour « toujours autoriser »), `interrupt()`, `setModel()`,
  `supportedModels()`. `pathToClaudeCodeExecutable` permet d'utiliser le `claude` déjà installé.
- Il n'existe pas de SDK Rust officiel ; les crates communautaires ne sont pas affiliées.

## Options
| Option | Pour | Contre |
|---|---|---|
| A. Rust lance `claude -p` + serveur MCP maison pour `--permission-prompt-tool` | pas de Node à l'exécution | interruption et changement de modèle reposent sur un protocole non documenté ; un serveur MCP à écrire et maintenir |
| **B. Petit pont Node utilisant l'Agent SDK officiel** | tout est documenté et maintenu par Anthropic ; peu de code à nous | Node requis à l'exécution (déjà installé) ; une dépendance npm officielle |
| C. Crate Rust communautaire | tout en Rust | tiers non vérifié : contraire à la règle « pas de plugin douteux » |

## Décision
**Option B.** Un process `bridge/` (TypeScript, ~200 lignes visées) :
- utilise `@anthropic-ai/claude-agent-sdk` avec `pathToClaudeCodeExecutable` pointant sur le binaire
  `claude` installé et **non modifié** ;
- parle au cœur Rust en NDJSON sur stdin/stdout (contrat `contracts/bridge-protocol.md`) ;
- relaie chaque `canUseTool` vers l'UI et attend la réponse, sans délai d'expiration ni réponse par défaut ;
- ne lit, ne stocke et ne transmet **aucun** jeton : la connexion se fait par le flux d'Anthropic
  (`claude` en terminal, une fois).

Le cœur Rust supervise le pont (groupe de process + `PR_SET_PDEATHSIG` + `killpg` à la fermeture), donc
le `claude` enfant meurt avec lui.

Jamais de `bypassPermissions` ni de `--dangerously-skip-permissions` : le mode par défaut de l'app est
`manual`, `acceptEdits` et `plan` sont proposés dans l'UI, `bypassPermissions` n'est pas proposé.

## Facturation (vérifiée le 2026-11-10)
- La séparation « usage programmatique facturé au tarif API », annoncée pour le 15 juin 2026, a été
  **mise en pause** par Anthropic (article d'aide 15036540).
- Aujourd'hui, connecté avec un abonnement, `claude -p` et le SDK consomment **les limites de
  l'abonnement**, comme une session interactive.
- Les crédits API mensuels (Max 100 $, Ultra 200 $ ; Pro non éligible) ne servent que si l'on lance avec
  une **clé API** d'une organisation Console liée.
- **Risque** : la réforme peut revenir. L'app n'en dépend pas : elle affiche le mode d'authentification
  actif et le coût de chaque session (`total_cost_usd`), et marche aussi avec une clé API.

## Conditions d'utilisation
La doc autorise l'utilisateur à se connecter au binaire Claude Code non modifié avec son propre abonnement,
et interdit à un tiers de collecter, stocker ou relayer des identifiants claude.ai. Notre cas (outil
personnel, binaire officiel, aucun jeton manipulé) correspond au schéma autorisé, mais **aucune clause ne
cite explicitement une interface personnelle** : c'est une lecture, pas une garantie. Conséquence : l'app
reste un outil personnel, non distribué comme service de connexion pour d'autres.

## Sessions
- Reprise par `resume` (id de session) ; `fork` possible.
- Le format des fichiers `~/.claude/projects/**.jsonl` est **interne et instable** : l'app ne les lit pas.
  Le pont écrit son propre journal d'événements par session, qui sert à réafficher l'historique et à
  calculer l'usage.
- Les sessions `-p`/SDK n'apparaissent pas dans le sélecteur du CLI ; `claude --resume <id>` fonctionne.

## Agent Teams
Non utilisé : les coéquipiers ne se lancent pas en mode `-p`/SDK, et la doc annonce environ 7 fois plus
de tokens qu'une session standard. Les sous-agents classiques suffisent (voir `AGENTS.md`).

## Résultat du spike (TASK-002, 2026-11-10)
Six scénarios sur sept fonctionnent : flux, permission, « toujours », interruption, changement de modèle,
reprise. Constats qui changent la conception :
- Tuer le pont Node ne tue pas `claude` (SIGTERM comme SIGKILL) : l'arrêt par groupe de process est
  obligatoire, on ne peut pas compter sur le SDK.
- `total_cost_usd` est cumulé sur la session ; le coût d'un tour est dans `model_usage_since_last_result`.
- Les règles « toujours » sont écrites dans `.claude/settings.local.json` à la racine du dépôt du projet.
- Le SDK propose aussi de passer en `acceptEdits` : l'app ne renvoie que les règles, jamais ce changement
  de mode, quand l'utilisateur choisit « toujours ».
- La reprise ne rejoue pas l'historique : le journal propre à l'app est nécessaire.
- Sans `permissionMode` explicite, le CLI peut démarrer en `auto` : le pont le fixe toujours.

Détail : `spikes/bridge/FINDINGS.md`. Contrat qui en découle : `contracts/bridge-protocol.md`.

## Sources
- https://code.claude.com/docs/en/headless.md · /agent-sdk/overview.md · /agent-sdk/user-input.md
- https://code.claude.com/docs/en/sessions.md · /legal-and-compliance.md · /agent-teams.md · /costs.md
- https://support.claude.com/en/articles/15036540 · https://support.claude.com/en/articles/17154008
