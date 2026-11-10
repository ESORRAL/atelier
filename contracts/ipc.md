# Contrat — IPC de l'app (UI ↔ cœur Rust) et interfaces internes du cœur

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
| `sdk` `system/init` | `running` (un `init` ouvre chaque tour) |
| `sdk` `result` | `idle`, sauf demande encore en attente |
| `permission_request` | `waiting_permission` |
| `permission_response` envoyée ou `permission_cancelled`, plus aucune en attente | `running` |
| `closed` | `closed` |
| fin du process sans `closed` | `crashed` (+ `error`) ; toute demande en attente est annulée |

Chaque changement émet `{kind:"state"}`. Chaque `SessionEvent` émis est d'abord journalisé.

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
Lancé par `node <chemin du pont>/main.mjs` (JavaScript sans compilation). En développement, le chemin est
`<racine du repo>/bridge/`. `shortcut:` l'emplacement en paquet installé sera tranché avec le `.deb`
(phase 3).
