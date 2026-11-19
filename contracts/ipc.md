# Contrat — IPC de l'app (UI ↔ cœur Rust) et interfaces internes du cœur

Version 2.7 (phase 5). 2.7 : mode `auto` ; `session_send` accepte des images ; `effort` (`session_start`, `session_set_effort`).
Version 2.6 (phase 5). 2.6 : deux panneaux intégrés, YouTube Shorts et Instagram (§15 ter).
Version 2.5 (phase 5). 2.5 : le panneau §15 affiche YouTube Shorts ; Instagram garde la fenêtre §13 ; `instagramMode` retiré.
Version 2.4 (phase 5). 2.4 : `pause_open_browser` (§16).
Version 2.3 (phase 5). 2.3 : le second cerveau couvre tout le vault (§10, chemins relatifs à `vaultPath`) ; `graph_data` (§11).
Version 2.2 (phase 5). 2.2 : panneau Instagram intégré (§15).
Version 2.1 (phase 5). 2.1 : `project_files` (§14) pour les mentions `@`.
Version 2.0 (phase 5). 2.0 : second cerveau, graphe, projets, fenêtre Instagram (§10 à §13) ; `Settings` gagne `vaultPath` et `vaultProject`.
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
| `session_start` | `cwd: string`, `model: string \| null`, `permissionMode: PermissionMode`, `resume: string \| null`, `onEvent: Channel<SessionEvent>`, `effort?: string \| null` (`low`, `medium`, `high`, `xhigh`, `max` ; absent = celui de Claude Code) | `string` (clé de session) | lance un pont, envoie `start` ; les événements arrivent sur `onEvent` |
| `session_send` | `key`, `text: string`, `images?: { mediaType, data }[]` | `null` | un tour utilisateur ; `images` : 5 au plus, PNG, JPEG, GIF ou WebP en base64, 5 Mo au plus chacune (le journal garde « [N images jointes] », jamais les images) |
| `session_interrupt` | `key` | `null` | interrompt la réponse en cours |
| `session_set_model` | `key`, `model: string` | `null` | modèle des tours suivants |
| `session_set_permission_mode` | `key`, `mode: PermissionMode` | `null` | |
| `session_set_effort` | `key`, `effort: string \| null` | `null` | niveau de réflexion de la session (`null` = celui du modèle) ; rien n'est écrit dans les réglages |
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
type PermissionMode = "default" | "acceptEdits" | "plan" | "auto"; // auto = mode automatique de Claude Code (classifieur), v2.7
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
  vaultPath: string | null;        // dossier du vault Obsidian ; défaut : $ATELIER_VAULT s'il est défini, sinon null
  vaultProject: string;            // dossier du projet dans le vault, relatif ; défaut "01 - Projets/Atelier"
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

## 10. Second cerveau (module `vault`, phase 5)

Lecture des notes Markdown du projet dans le vault Obsidian ; **une seule écriture possible** : l'ajout en
tête du journal (récap de fin de journée). Racine = `vaultPath/vaultProject`.

| Commande | Arguments | Retour |
|---|---|---|
| `vault_list` | — | `VaultNote[]` (notes `.md` de la racine et de ses sous-dossiers, triées par modification décroissante, 500 au plus) |
| `vault_read` | `path: string` (relatif à la racine) | `string` (Markdown, 1 Mio au plus) |
| `vault_search` | `query: string` (2 à 100 caractères) | `VaultHit[]` (50 au plus, insensible à la casse et aux accents) |
| `vault_open` | `path: string` | `null` : ouvre la note dans Obsidian (`obsidian://open?vault=<nom>&file=<chemin>`, xdg-open détaché) |
| `vault_append_journal` | `markdown: string` (1 à 20 000 caractères) | `null` : insère le bloc sous le titre `# …` de `Journal.md` de la racine |

```ts
type VaultNote = { path: string; title: string; modified: number };  // title = premier titre # ou nom du fichier ; ms Unix
type VaultHit = { path: string; title: string; line: number; excerpt: string };  // excerpt ≤ 160 caractères
```
- Tout `path` est validé : relatif, extension `.md`, sans `..`, résolu (liens symboliques suivis) **à
  l'intérieur** de la racine ; sinon erreur française. Vault non réglé ou absent : erreur « Vault Obsidian non
  configuré » (l'UI propose les Réglages).
- `vault_append_journal` n'écrit que `Journal.md` de la racine, par écriture atomique ; le crée s'il manque.

## 11. Graphe du code (module `project`, phase 5)

| Commande | Arguments | Retour |
|---|---|---|
| `graph_summary` | `dir: string` (dossier de projet absolu) | `GraphSummary \| null` (`null` : pas de `graphify-out/graph.json`) |
| `graph_update` | `dir: string` | `GraphSummary` : lance `graphify update .` dans `dir` (superviseur, 180 s au plus) puis relit |

```ts
type GraphSummary = {
  nodes: number; edges: number; builtAtCommit: string | null; headCommit: string | null; // fraîcheur
  communities: { id: number; name: string; size: number }[];      // 30 plus grandes
  topNodes: { label: string; degree: number; file: string | null; community: string | null }[]; // 25 plus connectés
  reportMarkdown: string | null;                                     // GRAPH_REPORT.md, 256 Kio au plus
};
```
Format réel : `graph.json` a `nodes[]` (`id`, `label`, `community`, `community_name`, `source_file`),
`links[]` (`source`, `target`) et `built_at_commit`. **`graph.html` n'est jamais lu ni affiché.**

## 12. Projets (module `project`, phase 5)

| Commande | Arguments | Retour |
|---|---|---|
| `project_info` | `dir: string` | `ProjectInfo` (lecture seule) |

```ts
type ProjectInfo = {
  isGit: boolean; branch: string | null; dirtyFiles: number;
  worktrees: { path: string; branch: string | null; head: string; locked: boolean }[];
  recentCommits: { hash: string; subject: string; date: number }[];   // 10 derniers ; date en ms Unix
  tasks: { id: string; title: string; status: string; agent: string | null; model: string | null; file: string }[]; // tasks/TASK-*.md
};
```
`git` lancé par le superviseur, **lecture seule** (`rev-parse`, `status --porcelain`, `worktree list
--porcelain`, `log`), délai 10 s par commande. Tâches : en-tête YAML simple des fiches (`id`, `title`,
`status`, `agent`, `model`), lu sans dépendance YAML.

## 13. Fenêtre « pause » Instagram (module `windows`, phase 5)

| Commande | Arguments | Retour |
|---|---|---|
| `pause_window_open` | — | `null` : ouvre la fenêtre `instagram`, ou la ramène au premier plan si elle existe |
| `pause_window_close` | — | `null` |

Règles d'ADR-0003 **avec les corrections de sa revue** : fenêtre `WebviewWindow` séparée, label
`instagram`, **aucune capability**, aucune entrée `remote`, aucun script injecté, `data_directory` propre,
user-agent par défaut. Navigation : `https` uniquement, hôtes `instagram.com`, `cdninstagram.com`,
`facebook.com`, `fbsbx.com`, `google.com`, `gstatic.com`, `recaptcha.net` (et leurs sous-domaines), plus
`about:blank` ; tout autre lien (dont le redirecteur `l.facebook.com`) est bloqué dans la fenêtre et ouvert
dans le navigateur système s'il est `https`.

## 14. Fichiers du projet pour les mentions `@` (module `project`)

| Commande | Arguments | Retour |
|---|---|---|
| `project_files` | `dir: string`, `query: string` (0 à 200), `limit: number` (1 à 50) | `string[]` |

Chemins **relatifs** à `dir`, triés par pertinence (le nom de fichier qui commence par `query` d'abord,
puis le chemin qui contient `query`, sans casse ni accents ; `query` vide → fichiers récemment modifiés).
Source : `git ls-files --cached --others --exclude-standard` (lancé par le superviseur, 5 s) dans un dépôt
git ; sinon parcours du dossier (5 000 fichiers au plus, dossiers cachés, `node_modules` et `target`
ignorés). `dir` validé comme le `cwd` des sessions. Les commandes `/` viennent de `system/init.slash_commands`
(aucune commande cœur).

## 15. Panneau Instagram intégré (module `windows`, phase 5)

| Commande | Arguments | Retour | Effet |
|---|---|---|---|
| `pause_panel_toggle` | `open: boolean` | `"panel" \| "window"` | ouvre ou ferme le panneau Instagram dans la fenêtre principale ; si le panneau ne peut pas être installé, ouvre la fenêtre séparée (§13) et renvoie `"window"` |

Panneau : webview enfant `instagram-panel` de la fenêtre `main`, re-parentée dans un `GtkOverlay` +
`GtkRevealer` (glissement depuis la gauche, à côté du rail : marge gauche 56 px, haut 56 px, largeur 420 px),
selon `spikes/instagram-panneau/FINDINGS.md`. Mêmes règles d'isolation que §13 (aucune capability, aucun
script, données à part, liste blanche de navigation partagée). **Les capabilities ciblent `webviews:
["main"]`, jamais la fenêtre.** Le réglage `instagramMode: "panel" | "window"` (défaut `"panel"`) choisit le
mode ; `"window"` garde le comportement §13.

## 10 bis. Second cerveau sur tout le vault (v2.3 — remplace les points de §10 qui diffèrent)

Racine de lecture = **`vaultPath`** (tout le vault), plus `vaultPath/vaultProject`. Tous les `path` sont
**relatifs à `vaultPath`**. Mêmes validations qu'au §10 (relatif, pas de `..`, résolu sous la racine, liens
symboliques sortants refusés, dossiers cachés ignorés).

| Commande | Arguments | Retour |
|---|---|---|
| `vault_list` | `folder: string \| null` (relatif ; `null` = racine du vault) | `VaultFolder` |
| `vault_recent` | `limit: number` (1 à 50) | `VaultNote[]` (notes les plus récemment modifiées de tout le vault) |
| `vault_read` | `path` | `string` (inchangé, 1 Mio au plus) |
| `vault_search` | `query` | `VaultHit[]` (tout le vault, 2 000 fichiers parcourus au plus, 50 résultats) |
| `vault_open` | `path` | `null` (inchangé) |
| `vault_append_journal` | `markdown` | `null` (inchangé : toujours `vaultPath/vaultProject/Journal.md`) |

```ts
type VaultFolder = { path: string; folders: string[]; notes: VaultNote[] }; // un seul niveau ; folders = noms
```
`VaultNote.path` et `VaultHit.path` deviennent relatifs à `vaultPath`. `vaultProject` sert de raccourci dans l'UI.

## 11 bis. Données du graphe à dessiner (v2.3)

| Commande | Arguments | Retour |
|---|---|---|
| `graph_data` | `dir: string` | `GraphData \| null` (`null` : pas de `graphify-out/graph.json`) |

```ts
type GraphData = {
  nodes: { id: string; label: string; community: number; communityName: string | null; file: string | null; degree: number }[];
  links: { source: string; target: string }[];
  truncated: boolean;   // vrai si plafonné
};
```
Plafonds : 3 000 nœuds (les plus connectés) et 8 000 liens (entre nœuds gardés). Lecture seule de `graph.json`.

## 16. Instagram dans le navigateur du système (module `windows`, v2.4)

| Commande | Arguments | Retour | Effet |
|---|---|---|---|
| `pause_open_browser` | — | `null` | ouvre `https://www.instagram.com/reels/` (adresse fixe) dans le navigateur par défaut, via `desktop::open_detached` |

Raison : WebKitGTK n'affiche les Reels qu'à ~10 images/s (`spikes/instagram-perf`, `spikes/instagram-cef`).
L'adresse est fixe : l'app ne lit jamais l'adresse ni le contenu du panneau.

## 15 bis. Le panneau devient YouTube Shorts (v2.5 — remplace §15 et §16 là où ils diffèrent)

WebKitGTK lit les Reels d'Instagram à ~10 images/s, les Shorts de YouTube de façon fluide.
- `pause_panel_toggle(open)` → `"panel" | "browser"` : panneau `shorts-panel` (même montage GTK, même
  isolation), départ `https://www.youtube.com/shorts`, données `shorts-panel`. S'il ne peut pas être installé,
  les Shorts s'ouvrent dans le navigateur du système (`"browser"`).
- Navigation du panneau : liste blanche propre (youtube.com, youtu.be, youtube-nocookie.com, ytimg.com,
  googlevideo.com, ggpht.com, google.com, google.fr, gstatic.com). Hors liste : bloqué **sans** ouverture du navigateur
  (les cadres publicitaires de YouTube ouvriraient des onglets). Pages et popups refusées.
- `pause_open_browser` ouvre `https://www.youtube.com/shorts`.
- Instagram : uniquement la fenêtre séparée du §13 (`pause_window_open`), pour les messages ; sa liste blanche
  ne contient pas YouTube. Le réglage `instagramMode` est retiré (ignoré s'il reste dans un ancien fichier).

## 15 ter. Deux panneaux intégrés : YouTube Shorts et Instagram (v2.6 — remplace §15 bis là où il diffère)

| Commande | Arguments | Retour |
|---|---|---|
| `pause_panel_toggle` | `site: "shorts" \| "instagram"`, `open: boolean` | `"panel" \| "browser" \| "window"` |
| `pause_open_browser` | `site: "shorts" \| "instagram"` | `null` (adresses fixes : `youtube.com/shorts`, `instagram.com/`) |

- Deux webviews enfants de `main` (`shorts-panel`, `instagram-panel`), chacune dans son `GtkRevealer` au-dessus
  du même `GtkOverlay`. Ouvrir l'une ferme l'autre. Données séparées (`shorts-panel`, `instagram-panel`).
- Navigation : Shorts = liste du §15 bis, hors-liste bloqué en silence ; Instagram = liste du §13, liens
  externes vers le navigateur (limités à 1 / 2 s), comme la fenêtre.
- Repli si le panneau ne s'installe pas : Shorts → navigateur (`"browser"`), Instagram → fenêtre §13 (`"window"`).
- Chaque panneau fermé se décharge après 2 min.
