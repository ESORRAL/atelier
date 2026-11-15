# Atelier

Un cockpit de bureau pour [Claude Code](https://claude.com/claude-code) sous Linux : une vraie interface
graphique, le CLI tourne en arrière-plan. Conversation, sous-agents, coûts, notes Obsidian, graphe du code,
musique et petites pauses vidéo dans une seule fenêtre.

> Projet personnel, construit de bout en bout avec Claude Code : un architecte (la session principale) qui
> découpe le travail, des sous-agents qui l'exécutent, d'autres qui le relisent. Voir [Comment il a été
> construit](#comment-il-a-été-construit).

**Statut** : v0.3 (phases 0 à 5 terminées), Linux uniquement, usage personnel.

## Ce qu'il fait

| Onglet | Rôle |
|---|---|
| **Chat** | Conversation en streaming avec Claude Code : Markdown, cartes d'outils, diffs, plusieurs sessions en onglets, choix du modèle et du mode de permission sous le champ de saisie, `@` pour les fichiers du projet, `/` pour les commandes. |
| **Agents** | Salle de contrôle des sous-agents : une carte par agent (état, modèle, coût, dernier message). |
| **Projets** | Branche, worktrees, commits récents, tableau des tâches lu depuis `tasks/`. |
| **Second cerveau** | Tout un vault [Obsidian](https://obsidian.md) : arborescence, récents, recherche, liens `[[…]]`, ouverture dans Obsidian, récap de fin de journée écrit dans le journal. |
| **Graphe** | Le graphe de connaissances Graphify du projet, dessiné (nœuds colorés par communauté, zoom, survol, fiche au clic). |
| **Usage** | Tokens et coût par jour et par modèle. |
| **Réglages** | Chemin du CLI, modèle par défaut, vault, thème. |

Autour : une **palette de commandes** (`Ctrl+K`), un **mode Focus** (minuteur Pomodoro, onglets média
masqués), des **notifications** (agent terminé, permission en attente), un **panneau Musique**
(télécommande du lecteur du bureau via MPRIS, Apple Music par Firefox) et deux **panneaux de pause**,
YouTube Shorts et Instagram, intégrés dans la fenêtre.

## Sécurité, les règles du projet

- **Aucun jeton Claude n'est lu, stocké ou transmis.** L'app lance le `claude` installé, connecté à *ton*
  compte.
- **Permissions affichées dans l'interface**, jamais de contournement : le mode `bypassPermissions` et
  `--dangerously-skip-permissions` sont interdits.
- **Aucun processus orphelin** : tout process enfant passe par un superviseur (groupe de processus + chien
  de garde), testé même après `SIGKILL`.
- **Les panneaux de pause sont cloisonnés** : aucune capability, aucun script injecté, données et liste de
  sites autorisés propres à chacun. Pas de scraping, d'automatisation ni de téléchargement de contenus.
- **Pas de HTML non fiable** affiché, pas de lien cliquable dans les réponses de Claude.
- Contenu de la fenêtre servi sous `default-src 'self'`.

## Stack

Tauri 2 + Rust (`src-tauri/`) · React 19 + TypeScript + Vite + Tailwind 4 (`src/`) · pont Node vers
l'[Agent SDK](https://docs.claude.com/en/api/agent-sdk/overview) de Claude (`bridge/`, protocole NDJSON).
Thème « Veilleuse » (bruns chauds, ambre, corail), sombre et clair.

```
┌ interface React ─────────────┐   IPC typé    ┌ cœur Rust ──────────────────────────┐
│ Chat · Agents · Projets …    │ ◄───────────► │ supervisor · claude · store · vault │
└──────────────────────────────┘ contracts/    │ project · music · windows · notify  │
                                               └───────────────┬─────────────────────┘
                                                               │ NDJSON
                                                     pont Node ▼ Agent SDK → CLI claude
```

## Installer et lancer

Prérequis : Linux (testé sur Ubuntu 24.04, GNOME, Wayland), Rust, Node 18+, les bibliothèques système de
Tauri 2 (WebKitGTK 4.1, GTK 3), et le CLI `claude` installé et connecté.

```bash
export PATH="$HOME/.cargo/bin:$PATH"
npm ci && npm run build:bridge
npm run tauri dev                          # lancer en développement
npm run tauri build -- --bundles deb       # paquet .deb
sudo apt install ./src-tauri/target/release/bundle/deb/Atelier_0.1.0_amd64.deb
```

Détails, et installation chez quelqu'un d'autre : [`docs/INSTALL.md`](docs/INSTALL.md). Variable
optionnelle `ATELIER_VAULT` (chemin du vault Obsidian).

Vérifications :

```bash
npm run lint && npm test && npm run build
cd src-tauri && cargo fmt --check && cargo clippy -- -D warnings && cargo test
```

## Limites connues

- **Linux seulement.** Mac et Windows demandent du travail : supervision des processus, musique, panneaux GTK.
- **Instagram saccade dans l'app** : WebKitGTK lit les Reels à environ 10 images/s, même avec le décodage
  matériel. D'où YouTube Shorts en panneau principal. Chromium embarqué a été essayé et écarté
  ([constats](spikes/instagram-cef/FINDINGS.md)).
- Les panneaux reposent sur des détails internes de Tauri (re-parentage GTK) : Tauri est figé en version
  exacte, avec un repli automatique (navigateur ou fenêtre séparée).
- Pas de lecteur web à DRM : la musique passe par MPRIS.
- Pas d'Agent Teams ni de commandes interactives du terminal (`/config`…), non disponibles en mode piloté.

## Comment il a été construit

Le projet est un banc d'essai du travail multi-agents :

- **Un architecte** (la session principale) découpe, délègue, fait relire et intègre ; il ne code pas les
  fonctionnalités. Chaque phase se termine par un point et attend un GO.
- **Des sous-agents** (`core` pour Rust, `ui` pour React, `reviewer` en lecture seule, `scribe` pour les
  notes) reçoivent une **fiche de tâche** `tasks/TASK-XXX-*.md` qui liste les seuls fichiers à lire et à
  écrire. Un modèle adapté à la difficulté : Haiku, Sonnet ou Opus.
- **Des contrats** (`contracts/`) fixent le pont et l'IPC avant le code ; ils sont la source de vérité.
- **Des spikes** (`spikes/`) prouvent ce qui est faisable avant de toucher à l'app : pont SDK, aucun
  orphelin, panneau GTK, essais Instagram et Chromium, mesures de performance.
- Une branche et une pull request par tâche. Graphify limite le contexte lu par chaque agent.

## Licence

[MIT](LICENSE).

## Pour aller plus loin

| | |
|---|---|
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | modules, sécurité, données locales |
| [`DESIGN.md`](DESIGN.md) | système de design |
| [`docs/adr/`](docs/adr) | décisions d'architecture (stack, intégration du CLI, panneaux de pause…) |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | fonctionnalités par version et phases |
| [`contracts/`](contracts) | contrats du pont et de l'IPC |
| [`AGENTS.md`](AGENTS.md) | fonctionnement des agents |
