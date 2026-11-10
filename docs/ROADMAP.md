# Feuille de route — Atelier

## Faisabilité (réponse courte)
**Oui.** Une interface graphique qui pilote Claude Code en arrière-plan est le cas d'usage prévu par
l'Agent SDK officiel : streaming, permissions affichées par l'hôte, interruption, reprise de session,
choix du modèle. Détails : `docs/adr/0002-integration-cli.md`.

Limites :
| Limite | Conséquence |
|---|---|
| Les commandes interactives du terminal (`/config`, sélecteurs, Agent Teams) n'existent pas en mode piloté | l'app refait les écrans utiles (modèle, sessions, réglages) ; pas d'Agent Teams |
| Le format des transcriptions de Claude Code est interne | l'app tient son propre journal ; une session ouverte dans le terminal ne s'affiche pas dans l'app sans reprise |
| La facturation du mode programmatique peut changer (réforme de juin 2026 en pause) | affichage du coût et du mode d'authentification ; compatible clé API |
| Les conditions d'utilisation ne citent pas le cas « interface personnelle » | outil strictement personnel, binaire officiel, aucun jeton manipulé |
| WebKitGTK n'a pas Widevine | pas de lecteur web à DRM ; musique par MPRIS |
| Instagram dans WebKitGTK n'est confirmé par aucune source | spike en phase 1, plan B par navigateur en mode application |

## Face à Claude Desktop Linux (bêta officielle)
| | Bêta officielle | Atelier |
|---|---|---|
| Chat claude.ai, Cowork (VM), connecteurs | oui | non : on ne refait pas ça |
| Code (sessions Claude Code) | oui | oui |
| Salle de contrôle des sous-agents, coût par agent | non | oui |
| Tâches, worktrees, revue par un autre agent | non | oui |
| Second cerveau Obsidian, graphe Graphify | non | oui |
| Musique, fenêtres « pause », mode Focus | non | oui |
| Panneau de sécurité des plugins et skills | non | oui |
| Authentification par clé API | non (CLI) | oui |
| Dictée, Computer Use | non (pas encore) | non |

Atelier ne remplace pas l'app officielle : c'est le poste de pilotage d'un développeur qui orchestre des
agents, avec ses outils personnels autour.

## Fonctionnalités

### v0.1 — MVP : discuter et garder la main
- Chat en streaming : Markdown, blocs de code, cartes d'outils, diffs, indicateur de réflexion.
- Boîte de dialogue de permission (une fois / toujours / refuser), mode `manual` par défaut.
- Interruption, choix du modèle, reprise et duplication de session.
- Choix du projet, sessions récentes, coût et tokens par session.
- Cadre de l'app : rail, barre du haut, panneau droit, thèmes sombre et clair.
- Notifications : agent terminé, permission en attente.
- Réglages : chemin du CLI, modèle par défaut, vault, thème.
- Aucun process orphelin (testé).

### v0.2 — Cockpit
- Onglet Agents : une carte par sous-agent, état, modèle, coût, dernier message, chronologie.
- Onglet Usage : tokens et coût par jour, par modèle, par agent.
- Musique : télécommande MPRIS et mini-lecteur persistant.
- Palette de commandes (`Ctrl+K`), raccourcis globaux, icône de zone de notification.
- Mode Focus : onglets média masqués, minuteur Pomodoro.
- Plusieurs sessions en parallèle.

### v0.3 — Second cerveau et pauses
- Second cerveau : notes Obsidian du projet, recherche, ouverture dans Obsidian.
- Graphe : rapport Graphify, nœuds clés, communautés, requêtes.
- Projets : branches, worktrees, tableau des tâches lu depuis `tasks/`.
- Instagram : fenêtre isolée, connexion manuelle (ADR-0003).
- Récap de fin de journée écrit dans le journal Obsidian.

### v0.4 et après — idées, à trier ensemble
| Idée | Intérêt |
|---|---|
| Lecteur local et exposition MPRIS (touches multimédia) | musique sans autre appli |
| Fenêtres « pause » configurables (YouTube, etc.) sur le modèle Instagram | même isolation, plus de choix |
| Sons d'ambiance locaux pour le mode Focus | pluie, café, bruit brun |
| Panneau de sécurité : plugins, skills, MCP installés, version, source, mise à jour auto | répond au risque des plugins malveillants |
| Éditeur de `.claude/` avec diff obligatoire avant enregistrement | « relire `.claude/` comme du code » |
| Revue de diff par bloc (accepter / rejeter) | contrôle fin des modifications |
| Bibliothèque de prompts et de fiches de tâche | réutilisation |
| Points de reprise par session (retour arrière sur les fichiers) | filet de sécurité |
| Gestionnaire de serveurs MCP | configuration sans JSON |
| Saisie rapide par raccourci global | poser une question sans ouvrir l'app |
| Série de jours actifs, temps de pause mesuré | motivation, honnêteté sur les pauses |
| Thèmes personnalisables | plaisir |

## Phases de réalisation

| Phase | Contenu | Sortie |
|---|---|---|
| **0 — Architecture** (en cours) | faisabilité, stack, ADR, système d'agents, design | ce plan |
| **1 — Fondations** | installations validées, 3 spikes (pont SDK, Instagram, orphelins), échafaudage, contrats, premier graphe | app vide qui démarre, contrats figés |
| **2 — Chat** | modules `supervisor`, `claude`, `store` ; onglet Chat ; permissions | conversation complète |
| **3 — Cadre et finitions** | shell, réglages, notifications, thèmes, paquet `.deb` | **v0.1** |
| **4 — Cockpit** | Agents, Usage, Musique, palette, Focus | **v0.2** |
| **5 — Cerveau et pauses** | Obsidian, Graphe, Projets, Instagram, récap | **v0.3** |
| **6 — Extras** | idées retenues de la v0.4 | à définir |

Chaque phase se termine par un point (fait, reste, risques, décisions) et attend un GO.

## Tâches de la phase 1

| Tâche | Agent | Modèle | Dépend de |
|---|---|---|---|
| TASK-001 Vérifier les prérequis installés | `core` | haiku | validation des installations |
| TASK-002 Spike : pont Agent SDK (flux, permission, interruption, modèle) | `core` | opus | 001 |
| TASK-003 Spike : fenêtre Instagram isolée | `core` | opus | 001 |
| TASK-004 Échafaudage Tauri + React, commandes, CI | `core` | sonnet | 001 |
| TASK-005 Spike : aucun orphelin après SIGKILL | `core` | opus | 004 |
| TASK-006 Tokens de design, polices, icônes dans l'app | `ui` | sonnet | 004 |
| TASK-007 Premier graphe et règles par chemin | `scribe` | haiku | 004 |

Les contrats `contracts/bridge-protocol.md` et `contracts/ipc.md` sont écrits par l'architecte après
TASK-002 et TASK-004. Les fiches détaillées sont rédigées au GO.
