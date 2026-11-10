---
id: TASK-002
title: Spike — piloter Claude Code avec l'Agent SDK et capturer les événements réels
status: todo
phase: 1
agent: core
model: opus
depends_on: []
branch: task/TASK-002-spike-pont-sdk
---

## Objectif
Prouver, avec du code jetable, que l'Agent SDK TypeScript officiel permet tout ce dont l'app a besoin, et
rapporter la **forme exacte** des messages. L'architecte écrira `contracts/bridge-protocol.md` à partir
de tes captures : ce qui compte est l'exactitude, pas l'élégance du code.

## Contexte utile
- Paquet : `@anthropic-ai/claude-agent-sdk`, version **0.3.322 exacte** (officiel, repo
  `anthropics/claude-agent-sdk-typescript`). Installe-le avec `npm install --save-exact --ignore-scripts`.
  Aucune autre dépendance.
- Le SDK doit lancer le binaire déjà installé : option `pathToClaudeCodeExecutable` avec le résultat de
  `which claude` (CLI 2.1.322). L'utilisateur est déjà connecté ; tu ne touches à aucun identifiant.
- Node 24 : écris en `.mjs`, sans étape de compilation.
- Chaque scénario lance une vraie session : utilise le modèle `haiku`, des prompts d'une ligne, et un
  dossier de travail vide `spikes/bridge/sandbox/` (ignoré par git).
- Si la doc te manque : https://code.claude.com/docs/en/agent-sdk/typescript.md et `/agent-sdk/user-input.md`.
  Ne devine pas un nom de champ : observe-le.

## Fichiers
- **Lire** : `docs/adr/0002-integration-cli.md`
- **Écrire** : `spikes/bridge/**` uniquement
- **Contrats** : aucun (ils n'existent pas encore)

## Scénarios (un script par scénario, sortie brute dans `spikes/bridge/samples/<nom>.ndjson`)
1. `stream` — un prompt simple, avec les messages partiels activés. Capturer tous les types de messages.
2. `permission` — un prompt qui provoque un appel d'outil soumis à approbation (créer un fichier dans le
   bac à sable). `canUseTool` : refuser la première demande, autoriser la suivante. Capturer les
   arguments reçus, dont `suggestions`, et l'effet de chaque réponse.
3. `always` — renvoyer les `suggestions` pour « toujours autoriser » ; vérifier où la règle est écrite
   et que la demande suivante identique ne repasse pas par `canUseTool`.
4. `interrupt` — interrompre une réponse longue en cours ; capturer ce que le flux émet ensuite.
5. `model` — changer de modèle en cours de session (mode entrée en flux), et lister les modèles disponibles.
6. `resume` — terminer une session, puis la reprendre par son identifiant et vérifier que le contexte est là.
7. `kill` — tuer le process Node pendant une réponse ; vérifier avec `pgrep -f` s'il reste un `claude`.

## Critères d'acceptation
- [ ] Les 7 scénarios tournent avec `node spikes/bridge/<nom>.mjs` et produisent leur fichier de capture.
- [ ] `spikes/bridge/FINDINGS.md` (français, 120 lignes max) : pour chaque scénario, ce qui marche, ce qui
      ne marche pas, et les formes de messages observées (types, champs utiles, un exemple court).
- [ ] FINDINGS indique : où lire le coût et les tokens, l'identifiant de session, comment un message de
      sous-agent se distingue, et le résultat du scénario `kill`.
- [ ] Les captures ne contiennent aucune donnée personnelle : remplace chemins du dossier personnel,
      adresse e-mail, nom de compte et identifiants d'organisation par `<redacted>` avant de committer.
- [ ] Aucun mode `bypassPermissions`, aucune lecture de `~/.claude/.credentials*` ni du trousseau.

## Vérification
```bash
cd spikes/bridge && for s in stream permission always interrupt model resume kill; do node $s.mjs || echo "FAIL $s"; done
grep -rIl "$HOME\|@gmail" spikes/bridge/samples spikes/bridge/FINDINGS.md && echo "DONNEES PERSONNELLES" || echo OK
```

## Hors périmètre
Pas de pont définitif, pas de Rust, pas de protocole inventé, pas de tests unitaires. Un scénario qui
échoue est un résultat : documente-le, ne le contourne pas.

## Rapport (rempli par l'agent, 150 mots max)
- Fait : 7 scénarios + `subagent.mjs` (forme des messages de sous-agent), captures expurgées.
  stream/permission/always/interrupt/model/resume OK ; kill : le `claude` enfant survit (SIGTERM et SIGKILL).
- Fichiers touchés : `spikes/bridge/{lib,stream,permission,always,interrupt,model,resume,kill,subagent}.mjs`,
  `package.json`, `package-lock.json`, `samples/*.ndjson`.
- Vérification (sortie résumée) : boucle des 7 scénarios sans FAIL ; grep données personnelles : OK.
- Raccourcis pris (`shortcut:`) : aucun.
- À remonter à l'architecte : `FINDINGS.md` non écrit (écriture de .md bloquée pour le sous-agent ; contenu
  dans le rapport). La règle « toujours » est écrite dans `.claude/settings.local.json` du checkout principal
  (fichier créé, non supprimé : suppression refusée). `total_cost_usd` est cumulé par session. Supervision :
  `killpg`/`PR_SET_PDEATHSIG` indispensables.
