# Contrat — IPC de l'app (UI ↔ cœur Rust) et interfaces internes du cœur

Version 1.6 (phase 4). 1.6 : §9 retiré à la demande de l'utilisateur (seuls des aperçus de 30 s étaient jouables).
Version 1.5 (phase 4). 1.5 : recherche dans le catalogue Apple (§9).
Version 1.4 (phase 4). 1.4 : `pick_folder` et `music_open` (§8).
Version 1.3 (phase 4). 1.3 : commandes `music_*` et `usage_summary` (§6, §7).
Version 1.2 (phase 3). 1.2 : états revus (`idle` dès que le pont est prêt, `running` dès l'envoi), reprise sur la même clé, index créé au premier message.
Version 1.1 (phase 2 : Chat). 1.1 : ajout de `SessionEvent` `user`, pour réafficher les messages de l'utilisateur à la reprise. Seul l'architecte modifie ce fichier. Les noms sont exacts : les tâches
parallèles s'appuient dessus sans se voir.

## 1. Commandes Tauri (UI → Rust)

Appelées depuis `src/ipc/` uniquement. Arguments en camelCase côté TypeScript (conversion par défaut de
Tauri). Toute erreur est rejetée avec une chaîne lisible en français.

| Commande | Arguments | Retour | Effet |
|---|---|---|---|
| `session_start` | `cwd: string`, `model: string \| null`, `permissionMode: PermissionMode`, `resume: string \| null`, `onEvent: Channel<SessionEvent>` | `string` (clé de session) | lance un pont, envoie `start` ; les événements arrivent sur `onEvent` |
| `session_send` | `key`, `text: string` | `null` | un tour utilisateur |
| `session_interrupt` | `key` | `null` | interrompt la réponse en cours |
| `session_set_model` | `key`, `model: string` | `null` | modèle des tours suivants |
| `session_set_permission_mode` | `key`, `mode: PermissionMode` | `null` | |
| `session_models` | `key` | `ModelInfo[]` | liste des modèles (réponse `models` du pont) |
| `permission_respond` | `key`, `requestId: string`, `decision: Decision`, `message: string \| null` | `null` | répond à une demande en attente |
| `session_close` | `key` | `null` | `close` au pont, puis arrêt du groupe de process |
| `sessions_list` | — | `SessionEntry[]` | index, du plus récent au plus ancien |
| `session_history` | `key` | `SessionEvent[]` | événements journalisés d'une session, dans l'ordre |
| `settings_get` | — | `Settings` | |
| `settings_set` | `settings: Settings` | `null` | |

`key` est toujours une `string` produite par `session_start`. Une clé inconnue → erreur
`Session inconnue`.

`cwd` de `session_start` : `~` développé, chemin absolu exigé, dossier existant, `/` refusé ; sinon erreur
française. `settings_set` refuse un `claudePath` qui n'est pas un fichier exécutable absolu.

## 2. Types partagés

```ts
type PermissionMode = "default" | "acceptEdits" | "plan";
type Decision = "allow_once" | "allow_always" | "deny";

type SessionState =
  | "starting"            // pont lancé, pas encore de system/init
  | "idle"                // prêt, en attente d'un message
  | "running"             // tour en cours
  | "waiting_permission"  // au moins une demande en attente
  | "closed"              // fin propre
  | "crashed";            // le pont est mort sans `closed`

type SessionEvent =
  | { kind: "sdk"; message: unknown }                 // message du SDK, intact (bridge-protocol §4)
  | { kind: "permission_request"; requestId: string; toolName: string; input: unknown;
      toolUseID: string; displayName?: string; description?: string; blockedPath?: string;
      canAlways: boolean }
  | { kind: "permission_cancelled"; requestId: string }
  | { kind: "user"; text: string }                    // tour envoyé par session_send (émis et journalisé par Rust)
  | { kind: "state"; state: SessionState; error?: string }
  | { kind: "error"; message: string; fatal: boolean };

type ModelInfo = { value: string; displayName: string; description?: string }; // autres champs du SDK conservés

type SessionEntry = {
  key: string; claudeSessionId: string | null; cwd: string; title: string;
  model: string | null; createdAt: number; updatedAt: number; costUsd: number; // ms Unix ; coût cumulé
};

type Settings = {
  claudePath: string | null;       // null → `claude` trouvé dans le PATH
  defaultModel: string | null;
  defaultPermissionMode: PermissionMode;
  recentCwds: string[];            // 10 au plus, le plus récent en tête
};
```

Côté Rust, les mêmes types avec `#[serde(rename_all = "camelCase")]` ; `SessionEvent` est un enum
`#[serde(tag = "kind", rename_all = "snake_case")]`.

## 3. Règles d'état (module `claude`)

| Reçu | Nouvel état |
|---|---|
| lancement | `starting` |
| `start` envoyé au pont avec succès | `idle` (pas d'attente du premier `system/init`, qui n'arrive qu'avec le premier tour) |
| `session_send` écrit au pont avec succès | `running` |
| `sdk` `system/init` | aucun changement (met à jour le modèle affiché) |
| `sdk` `result` | `idle`, sauf demande encore en attente |
| `permission_request` | `waiting_permission` |
| `permission_response` envoyée ou `permission_cancelled`, plus aucune en attente | `running` |
| `closed` | `closed` |
| fin du process sans `closed` | `crashed` (+ `error`) ; toute demande en attente est annulée |

Chaque changement émet `{kind:"state"}`. Chaque `SessionEvent` émis est d'abord journalisé, **sauf**
les `sdk` de type `stream_event` (fragments de streaming) : ils sont émis vers l'UI mais pas journalisés,
car les messages `assistant` complets suffisent à réafficher l'historique.

### Reprise et index
- `session_start` avec `resume` = un `claudeSessionId` présent dans l'index : la session **réutilise la clé
  de cette entrée** (même journal, même ligne d'index) au lieu d'en créer une nouvelle.
- Le SDK remet `total_cost_usd` à zéro dans un nouveau process : `costUsd` de l'index = coût de l'entrée au
  moment de la reprise + `total_cost_usd` courant. L'UI affiche ce même total.
- Une entrée d'index n'est créée qu'au premier `session_send` (pas de session vide dans la liste).
- L'index n'est réécrit que si une de ses valeurs change (modèle, coût, titre, `claudeSessionId`).

## 4. Interfaces internes du cœur Rust

Signatures exactes. Chaque module vit dans `src-tauri/src/<module>/mod.rs` (plus des fichiers à lui).

### `supervisor`
```rust
pub struct Supervised {
    pub stdin: Option<tokio::process::ChildStdin>,
    pub stdout: Option<tokio::process::ChildStdout>,
    pub stderr: Option<tokio::process::ChildStderr>,
    // + champs privés : enfant, watchdog, pgid
}
/// Lance `cmd` dans son propre groupe de process, avec un watchdog.
/// stdin/stdout/stderr sont forcés en `piped`.
pub fn spawn(cmd: tokio::process::Command) -> std::io::Result<Supervised>;
impl Supervised {
    pub async fn wait(&mut self) -> std::io::Result<std::process::ExitStatus>;
    /// SIGKILL au groupe entier ; idempotent.
    pub fn kill(&mut self);
}
impl Drop for Supervised { /* kill() */ }
/// À appeler en tête de `main()` : si l'app a été relancée en mode watchdog, fait le travail et
/// ne revient jamais ; sinon ne fait rien.
pub fn maybe_run_watchdog();
```

### `store`
Dossier de base : `app_data_dir()` de Tauri (`~/.local/share/dev.atelier.app/`), passé par l'appelant.
```rust
pub struct Store { /* base: PathBuf */ }
impl Store {
    pub fn open(base: std::path::PathBuf) -> std::io::Result<Store>;      // crée les dossiers
    pub fn append_event(&self, key: &str, event: &serde_json::Value) -> std::io::Result<()>; // sessions/<key>.ndjson
    pub fn read_events(&self, key: &str) -> std::io::Result<Vec<serde_json::Value>>;          // lignes illisibles ignorées
    pub fn upsert_session(&self, entry: &SessionEntry) -> std::io::Result<()>;               // sessions.json
    pub fn list_sessions(&self) -> std::io::Result<Vec<SessionEntry>>;                        // tri updatedAt décroissant
    pub fn load_settings(&self) -> std::io::Result<Settings>;                                 // défauts si absent
    pub fn save_settings(&self, s: &Settings) -> std::io::Result<()>;
}
```
`SessionEntry` et `Settings` sont définis dans `store` (types du §2). Écritures de `sessions.json` et
`settings.json` atomiques (fichier temporaire puis `rename`). `key` est validée : `[A-Za-z0-9-]` seulement,
sinon erreur (pas de chemin arbitraire).

### `claude`
Possède les commandes du §1 (dans `claude/commands.rs`) et l'état géré par Tauri. Il lance le pont par
`supervisor::spawn` et suit `contracts/bridge-protocol.md`. Clé de session : `s-<ms Unix>-<compteur>`.

## 5. Pont
Lancé par `node <dossier du pont>/main.mjs` (JavaScript sans compilation). Le cœur cherche le pont dans
`resource_dir()` de Tauri (paquet installé : `/usr/lib/Atelier/bridge/main.mjs`), avec repli sur
`<racine du repo>/bridge/` en build debug seulement. `bridge/node_modules` doit exister avant tout
`cargo build` (ressource vérifiée par `tauri-build`) : `npm run build:bridge`.

## 6. Musique (module `music`, phase 4)

Télécommande des lecteurs MPRIS du bureau (Spotify, VLC, Firefox…) par la crate `mpris`. Les appels D-Bus
sont bloquants : ils passent par `tokio::task::spawn_blocking`. L'UI interroge `music_status` toutes les
secondes quand le mini-lecteur est visible (pas d'événement poussé en v0.2).

| Commande | Arguments | Retour |
|---|---|---|
| `music_players` | — | `PlayerInfo[]` |
| `music_status` | `player: string \| null` | `NowPlaying \| null` (`null` : aucun lecteur) |
| `music_control` | `player: string`, `action: "play_pause" \| "next" \| "previous" \| "stop"` | `null` |
| `music_set_volume` | `player: string`, `volume: number` (0 à 1) | `null` |

`player: null` → le lecteur en lecture s'il y en a un, sinon le premier trouvé.

```ts
type PlayerInfo = { id: string; name: string };            // id = nom de bus D-Bus, name = identité lisible
type NowPlaying = {
  player: string; name: string;
  status: "playing" | "paused" | "stopped";
  title: string | null; artist: string | null; album: string | null;
  lengthMs: number | null; positionMs: number | null; volume: number | null;
  canGoNext: boolean; canGoPrevious: boolean; canControl: boolean;
};
```
`shortcut:` pas de pochette en v0.2 (URL distante ou `file://`, bloquées par la CSP) ; à ajouter en
servant l'image par le cœur.

## 7. Usage (module `store`, phase 4)

| Commande | Arguments | Retour |
|---|---|---|
| `usage_summary` | `days: number` (1 à 365) | `UsageSummary` |

```ts
type ModelUsage = { costUsd: number; inputTokens: number; outputTokens: number };
type UsageDay = { day: string; costUsd: number; byModel: Record<string, ModelUsage> }; // day = AAAA-MM-JJ, heure locale
type UsageSummary = { days: UsageDay[]; totalCostUsd: number; byModel: Record<string, ModelUsage> };
```
Calcul : pour chaque entrée d'index dont `updatedAt` tombe dans la fenêtre, le dernier `result.modelUsage`
de son journal (cumulé sur la session) ; jour = jour local de `updatedAt`. `days` est trié du plus ancien
au plus récent, jours vides inclus (coût 0). `shortcut:` une session qui s'étale sur plusieurs jours est
comptée sur son dernier jour ; à affiner en journalisant l'heure de chaque `result`.

## 8. Choix de dossier et ouverture d'Apple Music (phase 4)

| Commande | Arguments | Retour | Effet |
|---|---|---|---|
| `pick_folder` | — | `string \| null` | boîte native « Choisir un dossier » ; `null` si annulée |
| `music_open` | `target: "home" \| "search" \| "library" \| "playlists"`, `query: string \| null` | `null` | ouvre Apple Music web dans le navigateur par défaut |

`music_open` construit l'URL **côté cœur** à partir de `target` ; l'UI ne fournit jamais d'URL :
`home` → `https://music.apple.com/`, `search` → `https://music.apple.com/search?term=<query encodé>`
(`query` obligatoire, 1 à 200 caractères), `library` → `https://music.apple.com/library`, `playlists` →
`https://music.apple.com/library/playlists`. Ouverture par `xdg-open`, **détaché** du groupe de process de
l'app (le navigateur lancé ne doit pas mourir avec Atelier) : c'est la seule exception à « tout process passe
par `supervisor` », justifiée parce que `xdg-open` rend la main aussitôt.

## 9. Recherche dans le catalogue Apple — retirée

Commandes `music_search`, `music_lookup`, `music_open_url` supprimées (v1.6) : sans compte développeur
Apple, l'app ne pouvait jouer que des aperçus de 30 s. La recherche passe par `music_open` (§8), qui ouvre
les résultats dans Apple Music sur le navigateur. CSP revenue à `default-src 'self'`.
