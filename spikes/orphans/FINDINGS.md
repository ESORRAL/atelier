# TASK-005 — aucun process orphelin : résultats

Chaîne imitée : parent Rust → `node -e` (E) → `sleep 300` renommé par `exec -a` (P).
Morts : sortie normale (SIGUSR1 → retour de `main`), panique (`panic = unwind`), SIGTERM capté
par `tokio::signal` puis retour de `main`, SIGKILL. Relevé 2 s après la mort du parent.
Cellule = ce qui survit (E enfant, P petit-enfant, W watchdog, `-` rien). `cargo test` : 9/9 verts.

| Technique | normale | panique | SIGTERM | SIGKILL |
|---|---|---|---|---|
| aucune | EP | EP | EP | EP |
| `kill_on_drop` tokio | P | P | P | EP |
| `process-wrap` `ProcessGroup` + `KillOnDrop` | P | P | P | EP |
| `PR_SET_PDEATHSIG` dans `pre_exec` | P | P | P | P |
| groupe + `killpg` dans un `Drop` | - | - | - | EP |
| **groupe + `killpg` + watchdog (retenue)** | - | - | - | - |
| retenue, petit-enfant en `setsid` | P | P | P | P |
| scope `systemd-run --user` + watchdog | - | - | - | - |
| scope, petit-enfant en `setsid` | - | - | - | - |

Constats :
- `kill_on_drop` et `PDEATHSIG` ne visent que l'enfant direct : le petit-enfant survit toujours.
- `process-wrap` 10.0.1 sous Unix ne tue **pas** le groupe au drop : `KillOnDrop` pose seulement
  `kill_on_drop` tokio (SIGKILL au leader). Il faut appeler `start_kill()` (killpg) soi-même. Il
  n'apporte alors rien de plus que `Command::process_group(0)` + `libc::killpg`.
- SIGKILL n'exécute aucun `Drop` : seul un process extérieur peut nettoyer. Le watchdog lit un
  pipe dont le parent tient seul l'écriture (fd `O_CLOEXEC`) ; l'EOF arrive à la mort du
  **process** parent, quelle qu'elle soit, et ne dépend d'aucun thread (contrairement à PDEATHSIG).
- `PR_SET_CHILD_SUBREAPER` non retenu : à la mort du subreaper, ses descendants remontent à init ;
  ça n'aide pas pour SIGKILL. Non testé.
- `setsid` sort le petit-enfant du groupe : seul le cgroup (scope systemd) le rattrape.

Preuve que les tests mordent : `cargo test -- --ignored unprotected` relance la recette avec
`ATELIER_SPIKE_UNPROTECT=1` (protection retirée) :

    | recipe (normal) | EP | EP | EP | EP |
      left: ["EP", "EP", "EP", "EP"]
     right: ["-", "-", "-", "-"]
    test result: FAILED. 0 passed; 1 failed

## Recette retenue (voir `src/main.rs`, technique `recipe`)

    let child = Command::new("node").args(args).process_group(0).spawn()?;   // tokio
    let pgid = child.id().unwrap() as i32;
    let watchdog = std::process::Command::new(std::env::current_exe()?)
        .args(["watchdog", &pgid.to_string()]).stdin(Stdio::piped()).process_group(0).spawn()?;
    let guard = Guard { pgid, _keep: (child, watchdog) };   // Drop: libc::killpg(pgid, SIGKILL)
    // côté watchdog : io::stdin().read_to_end(&mut v); libc::killpg(pgid, SIGKILL);

## Limites
- Un descendant qui fait `setsid` ou `setpgid` s'échappe. Parade : lancer l'enfant dans un scope
  `systemd-run --user --scope --unit <id>` et tuer par `systemctl --user kill --signal=SIGKILL`
  (testé, tout est propre) ; exige systemd utilisateur.
- `killpg` différé du watchdog : si le groupe est mort et le pgid réutilisé, un autre groupe peut
  être visé (`shortcut:` dans le code ; parade : pidfd du leader).
- Watchdog tué en même temps que l'app (ex. `kill -9 -<pgid de l'app>`) : plus de filet.
- `panic = "abort"` dans le profil supprime le `Drop` ; le watchdog couvre quand même.

## Ce que la recette exige du lanceur
- Un binaire capable de se relancer en mode `watchdog` (ou un petit binaire compagnon).
- Garder le `Guard` vivant tant que l'enfant doit vivre ; aucun thread dédié requis.
- Runtime tokio quelconque (testé en `current_thread`) ; capter SIGTERM et sortir de `main`
  proprement pour que le `Drop` tue tout sans attendre le watchdog.

## Non vérifié
`PR_SET_CHILD_SUBREAPER`, un runtime tokio multi-thread, le profil `panic = "abort"`.
