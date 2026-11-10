---
id: TASK-005
title: Spike — aucun process orphelin, même après SIGKILL
status: todo
phase: 1
agent: core
model: opus
depends_on: []
branch: task/TASK-005-spike-orphelins
---

## Objectif
Trouver et prouver la recette qui garantit qu'aucun process enfant ou petit-enfant ne survit à l'app,
quelle que soit la façon dont elle meurt. Cette recette deviendra le module `supervisor`.

## Contexte utile
- Rust est dans `~/.cargo/bin` : commence par `export PATH="$HOME/.cargo/bin:$PATH"`.
- Fait établi par un spike précédent : tuer un process Node qui a lancé `claude` (SIGTERM ou SIGKILL)
  laisse `claude` vivant. L'enfant ne nettoie donc pas ses propres enfants.
- Imite cette chaîne sans lancer Claude : parent Rust → `node -e` (qui lance un petit-enfant) →
  `sleep 300`. Donne aux process un marqueur unique dans leurs arguments pour les retrouver avec `pgrep -f`.
- Pistes à comparer : groupe de process ou session (`process-wrap`), `PR_SET_PDEATHSIG` dans `pre_exec`
  (attention : il se déclenche à la mort du **thread** parent, et ne se transmet pas au petit-enfant),
  `kill_on_drop` de tokio, `PR_SET_CHILD_SUBREAPER`, portée cgroup par `systemd-run --user --scope`.
- Dépendances autorisées : `tokio`, `process-wrap`, `libc` ou `nix`. Rien d'autre.

## Fichiers
- **Lire** : `ARCHITECTURE.md §3`
- **Écrire** : `spikes/orphans/**` uniquement
- **Contrats** : aucun

## Critères d'acceptation
- [ ] `spikes/orphans/` est une crate Rust autonome avec un binaire parent et des tests d'intégration.
- [ ] Quatre morts du parent sont testées : sortie normale, panique, SIGTERM, SIGKILL. Pour chacune, le
      test vérifie après 2 secondes qu'il ne reste ni enfant ni petit-enfant.
- [ ] Le cas où l'enfant se détache lui-même (`setsid`) est testé et son résultat documenté.
- [ ] Les tests échouent réellement quand la protection est retirée (montre-le une fois dans FINDINGS).
- [ ] `spikes/orphans/FINDINGS.md` (français, 60 lignes max) : tableau « technique × type de mort »,
      la recette retenue en 10 lignes de code au plus, ses limites, et ce qu'elle exige du lanceur
      (thread, runtime tokio).

## Vérification
```bash
export PATH="$HOME/.cargo/bin:$PATH"
cd spikes/orphans && cargo test 2>&1 | tail -15
pgrep -fa atelier-orphan-spike && echo "ORPHELINS RESTANTS" || echo OK
```

## Hors périmètre
Pas de Tauri, pas de module définitif, pas de lancement de `claude`. Tue tout process de test restant
avant de rendre.

## Rapport (rempli par l'agent, 150 mots max)
- Fait :
- Fichiers touchés :
- Vérification (sortie résumée) :
- Raccourcis pris (`shortcut:`) :
- À remonter à l'architecte :
