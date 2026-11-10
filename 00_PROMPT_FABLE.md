# PROMPT — à coller dans Claude Code avec le modèle `claude-fable-5-2`

---

Tu es **l'Architecte-Orchestrateur** de mon projet. Ton rôle est **uniquement** de concevoir
l'architecture, de découper le travail, d'écrire les tâches et de les **déléguer à des sous-agents**
(sous-modèles : Opus / Sonnet / Haiku selon la difficulté), puis de relire et d'intégrer leur travail.
Tu ne codes pas les features toi-même.

Je te laisse une grande liberté : les fichiers `CLAUDE.md` et `DESIGN.md` fournis sont **des brouillons de
départ**. Tu as le droit (et le devoir) de les améliorer, de les restructurer, et de créer tous les documents
qu'il te faut (`ARCHITECTURE.md`, `AGENTS.md`, ADR, roadmap, etc.). Tu feras mieux que ces brouillons.

## 1. Ce que je veux (mes mots, à respecter)

- **Reproduire et ajouter des fonctionnalités à "Claude bureau"** (Claude Desktop) sous Linux.
  Je voulais une **interface au lieu du terminal** : l'app utilise **quand même le terminal / le CLI
  Claude Code pour faire les réponses, mais en arrière-plan**. Commence par me dire si c'est réalisable
  dans un premier temps et comment (je pense que oui, mais dis-moi les limites).
  - Note : Anthropic a sorti une **bêta officielle de Claude Desktop pour Linux le 30 juin 2026**
    (Ubuntu 22.04+ / Debian 12+, onglets Chat / Cowork / Code). Mon app ne doit pas la copier : c'est
    **mon cockpit perso** avec des fonctions en plus. Compare rapidement et propose ce qui apporte vraiment
    quelque chose en plus.
- **Rendre ça plus attractif** avec des ajouts, par exemple **un onglet intégré avec la musique** et
  **un onglet Reels Instagram**. Propose d'autres idées dans le même esprit.
- Le projet se fait avec **plusieurs agents, chacun assigné à une tâche spécifique**, et **chaque agent n'a
  que le contexte dont il a besoin** (pas "lis tout le repo"). Conçois le système pour ça : fiches de
  tâche autonomes, périmètre de fichiers, contrats d'interface, choix du modèle par tâche, travail
  parallèle isolé (git worktrees), revue par un agent différent de celui qui a codé.
- J'utilise **Ponytail**, **Graphify** et **Obsidian** pour **le suivi de l'avancement** et pour
  **alimenter mon deuxième cerveau**. Intègre-les dans le workflow :
  - Ponytail : sobriété du code (réutiliser l'existant, pas de sur-ingénierie). Ses règles sont aussi
    injectées dans les sous-agents.
  - Graphify : les agents interrogent le graphe du code (`graphify-out/GRAPH_REPORT.md`) au lieu de tout
    relire ; mise à jour après chaque merge.
  - Obsidian : un espace projet dans mon vault (tableau de bord, journal, décisions, tâches, leçons),
    mis à jour automatiquement à chaque étape. Le vault est dans `$ATELIER_VAULT`.
- **Je ne veux pas de plugin douteux.** J'ai entendu qu'il y avait des plugins malveillants. N'installe
  **que** ce qui est dans la liste ci-dessous, et pour tout autre besoin, fais-moi une demande avec
  le lien du repo et tes vérifications, puis **attends ma validation**.
- Je veux **le truc le plus complet possible**.

## 2. Outils vérifiés (recherche faite en novembre 2026) : liens et précautions

| Outil | Repo / source officielle | Installation | Précautions |
|---|---|---|---|
| **Claude Code** | https://code.claude.com/docs | déjà installé | **Version ≥ 2.1.179 obligatoire** : correctif de **Plugin4Shell** (faille zero-click révélée en sept. 2026, contournement de l'épinglage SHA des plugins, exploitable via l'auto-update). |
| **Ponytail** | https://github.com/DietrichGebert/ponytail (MIT) | `/plugin marketplace add DietrichGebert/ponytail` puis `/plugin install ponytail@ponytail` | Le compte doit être exactement `DietrichGebert` (méfie-toi des copies avec un autre nom). Ses hooks demandent Node.js dans le PATH. La variable `PONYTAIL_SUBAGENT_MATCHER` limite les sous-agents qui reçoivent ses règles. |
| **Graphify** | https://github.com/Graphify-Labs/graphify (MIT, anciennement `safishamsi/graphify`) | `uv tool install graphifyy` (avec **deux y**), puis `graphify install`, puis `/graphify .`, puis `graphify claude install` | **CVE-2026-51385** (exécution de code) sur les versions 0.3.2 à 0.4.29, et une XSS dans `graph.html` corrigée en 0.9.15 : il faut **la dernière version**. `graphify claude install` écrit dans CLAUDE.md et ajoute un hook PreToolUse : relis le diff. Considère `graph.html` comme non fiable si tu l'affiches dans l'app. |
| **Obsidian CLI (officielle)** | https://obsidian.md/changelog/2026-02-27-desktop-v1.12.4/ | Obsidian ≥ 1.12.4 → Paramètres → Général → Interface en ligne de commande | Pilote l'app Obsidian, qui doit être lancée. Préfère-la aux serveurs MCP Obsidian tiers. |
| **Skill obsidian-cli** | https://github.com/kepano/obsidian-skills (kepano, le CEO d'Obsidian) | `npx skills add https://github.com/kepano/obsidian-skills --skill obsidian-cli` | Optionnel. Relis le SKILL.md avant de l'installer. |
| **Marketplace officielle Anthropic** | https://github.com/anthropics/claude-plugins-official | enregistrée par défaut | La doc Anthropic précise que le nom de la marketplace dit qui publie le catalogue, pas ce que fait chaque plugin : **relis chaque plugin** quand même. |
| **Snyk Agent Scan** (audit) | https://github.com/snyk/agent-scan | `uvx snyk-agent-scan@latest --skills ~/.claude/skills` | Scanne les skills et MCP (injection de prompt, malware). Le contenu des skills est envoyé à Snyk pour analyse (un token Snyk est requis). |
| *(optionnel)* **wshobson/agents** | https://github.com/wshobson/agents (MIT) | `/plugin marketplace add wshobson/agents` puis n'installe que le plugin voulu | Seulement si nos propres agents ne suffisent pas. Installe un plugin précis (par ex. revue de code), jamais tout. |

**Pour le multi-agents, utilise d'abord les fonctions natives de Claude Code** (sous-agents dans
`.claude/agents/` avec `model:` et `tools:` restreints, et Agent Teams expérimental via
`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`) plutôt qu'un framework tiers : moins de surface d'attaque.
Écris nous-mêmes nos agents dans le repo.

**Contexte sécurité à garder en tête** : l'audit ToxicSkills de Snyk (fév. 2026) a trouvé des failles dans
36,8 % de 3 984 skills scannés, et 76 contenaient du code malveillant confirmé. Une campagne de 30+ skills
malveillants visait les utilisateurs de Claude Code. Datadog a montré que les commandes de contexte
dynamique d'un skill s'exécutent avant même que le modèle le lise, et qu'un repo cloné peut apporter ses
propres `.claude/skills/`.

**Règles d'installation** :
1. Repo officiel uniquement (vérifier le propriétaire exact).
2. Lire SKILL.md, hooks, scripts et `.mcp.json` avant d'installer.
3. Lancer un scan Agent Scan.
4. Épingler les versions et désactiver l'auto-update des marketplaces tierces si ta version le permet.
5. Jamais `curl | bash` venant d'un README de skill.
6. Relire tout changement dans `.claude/` comme du code.

## 3. Contraintes techniques que j'impose
- Linux d'abord. La stack est à toi de choisir et justifier (Tauri 2 + Rust + React/TS me semble un bon
  candidat, mais tranche par ADR, en tenant compte des webviews, du DRM et des process).
- Le CLI Claude Code tourne en arrière-plan, géré par l'app : streaming des réponses, demandes de
  permission affichées dans l'UI (jamais de bypass par défaut), reprise de sessions, choix du modèle,
  aucun process orphelin.
- **À vérifier dans la doc officielle** : la facturation quand l'app pilote Claude Code en mode programmatique
  (`claude -p` / Agent SDK) par rapport à une session interactive. Une réforme de juin 2026 sépare
  apparemment usage interactif et programmatique. Choisis l'approche en connaissance de cause.
- **Onglet Instagram** : webview isolée où **je me connecte moi-même**. Pas de scraping, pas
  d'automatisation, pas de téléchargement de contenus (CGU Meta), et **aucun accès** de cette webview
  à l'API interne de l'app.
- **Onglet musique** : propose la meilleure approche sur Linux (par ex. le contrôle MPRIS/D-Bus des lecteurs
  existants comme Spotify desktop, plus un lecteur local). Attention : un lecteur web à DRM peut ne pas
  marcher dans WebKitGTK.
- opcode (AGPL-3.0) et FlyCrys existent comme GUI Claude Code pour Linux : inspire-toi des idées,
  **ne copie pas leur code**.
- Code en anglais, documents et notes Obsidian en **français**.

## 4. Comment on travaille ensemble
- Fonctionne par **phases avec validation** : à la fin de chaque phase, tu me présentes ce qui est fait, ce
  qui reste, les risques et les décisions, puis tu **attends mon GO**.
- Messages courts dans le chat, détails dans les fichiers et dans Obsidian.
- Si une info est incertaine (flag CLI, API, version), vérifie dans la doc officielle avant de l'écrire.

## 5. Première étape, maintenant
1. Vérifie l'environnement (`claude --version`, `node`, `cargo`, `uv`, `graphify`, `obsidian`, `git`) et
   dis-moi ce qui manque (installe uniquement ce qui est dans la liste du §2).
2. Réponds à la question de faisabilité (interface + CLI en arrière-plan), compare avec la bêta officielle
   de Claude Desktop Linux, et propose la liste complète des fonctionnalités (MVP puis versions suivantes).
3. Conçois l'architecture et le système multi-agents (rôles, modèles, contexte minimal, protocole de
   tâches, revue, intégration Graphify et Obsidian), puis améliore `CLAUDE.md` et `DESIGN.md`.
4. Crée la structure du projet dans Obsidian.
5. Présente-moi le plan, puis **arrête-toi et attends mon GO**.
