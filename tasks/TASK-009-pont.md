---
id: TASK-009
title: Pont Node définitif (bridge/) selon le protocole v1
status: done
phase: 2
agent: core
model: opus
depends_on: [TASK-002]
branch: task/TASK-009-pont
---

## Objectif
`bridge/main.mjs` : le process qui traduit entre le cœur Rust (NDJSON sur stdio) et l'Agent SDK, exactement
comme décrit par `contracts/bridge-protocol.md`. Aucune logique métier.

## Contexte utile
- JavaScript ESM sans compilation, Node 24. Dépendance unique : `@anthropic-ai/claude-agent-sdk` en version
  **0.3.322 exacte**, installée avec `npm install --save-exact --ignore-scripts` dans `bridge/`.
- Les scripts du spike (`spikes/bridge/*.mjs`) montrent les appels SDK qui marchent : mode flux
  (itérable async de messages utilisateur), `canUseTool`, `interrupt()`, `setModel()`,
  `setPermissionMode()`, `supportedModels()`. Lis `lib.mjs`, `permission.mjs`, `always.mjs`.
- `stdout` ne reçoit **que** des lignes du protocole. Tout journal va sur `stderr`.
- Tests avec `node:test` (bibliothèque standard), le SDK remplacé par un faux `query` injecté : pas
  d'appel réseau dans les tests. Structure le code pour permettre cette injection, sans plus.
- Un seul test réel facultatif, `bridge/smoke.mjs`, lancé à la main (modèle `haiku`, un prompt d'une ligne).

## Fichiers
- **Lire** : `contracts/bridge-protocol.md`, `spikes/bridge/lib.mjs`, `spikes/bridge/permission.mjs`,
  `spikes/bridge/always.mjs`, `spikes/bridge/FINDINGS.md`
- **Écrire** : `bridge/**`
- **Contrats** : `contracts/bridge-protocol.md`

## Critères d'acceptation
- [ ] Tous les messages des §2 et §3 du contrat, avec les champs exacts.
- [ ] `permissionMode` hors de `default | acceptEdits | plan` → `error` non fatal, jamais transmis au SDK.
- [ ] `allow_always` ne renvoie que les suggestions `addRules` ; refusé si `canAlways` est faux.
- [ ] Fermeture de stdin avec une demande en attente → refus de la demande, puis sortie.
- [ ] Ligne d'entrée invalide ou type inconnu → `error` non fatal, le pont continue.
- [ ] Tests `node:test` couvrant chacun des points ci-dessus et le cycle complet d'une permission.

## Vérification
```bash
cd bridge && npm ci --ignore-scripts && node --test
```

## Hors périmètre
Pas de Rust, pas de journal sur disque (c'est le cœur), pas de dépendance de plus.

## Rapport (rempli par l'agent, 150 mots max)
- Fait : `bridge/main.mjs` (`createBridge` injectable + entrée stdio), tous les messages §2/§3, options §5, refus des modes hors liste, `allow_always` filtré `addRules`, annulation sur `interrupt`/abort SDK/fermeture stdin, fin de flux inattendue → `error` fatal (code 1). `console.log` redirigé vers stderr.
- Fichiers touchés : `bridge/package.json`, `bridge/package-lock.json`, `bridge/main.mjs`, `bridge/main.test.mjs`, `bridge/smoke.mjs`.
- Vérification (sortie résumée) : `npm ci` OK, `node --test` 12/12. Smoke réel (haiku) une fois : `ready` → `sdk`… → `result/success "pong"` → `closed`, code 0.
- Raccourcis pris (`shortcut:`) : aucun.
- À remonter à l'architecte : le contrat dit « type inconnu ignoré et journalisé », la fiche exige un `error` non fatal : le pont fait les deux. `sdkVersion` lu dans `node_modules/.../package.json`. `requestId` = celui du SDK (UUID généré s'il manque). Une commande avant `start` → `error` non fatal.
