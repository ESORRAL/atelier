# DESIGN.md — brouillon de départ (à compléter par l'architecte / l'agent UI)

## Intention
Une app qui donne **envie** de l'ouvrir : un vrai cockpit, pas un terminal habillé.
Calme et lisible pour travailler, avec un côté "studio" (musique, reels) pour les pauses.
Ne pas imiter l'identité visuelle d'Anthropic (pas de logo ni de charte officielle) : c'est un outil perso.

## Ambiance
- Thème sombre par défaut, thème clair disponible. Respecter le thème système GNOME/KDE si possible.
- Fond profond (gris-bleu nuit), surfaces légèrement surélevées, une couleur d'accent chaude (ambre/corail)
  pour l'action principale, un accent froid (cyan) pour l'état des agents.
- Typo : une sans-serif lisible pour l'UI (Inter / système), une monospace pour le code (JetBrains Mono).
- Coins arrondis modérés (8–12 px), ombres discrètes, animations courtes (150–250 ms) et désactivables
  (`prefers-reduced-motion`).

## Layout (proposition)
```
┌───────────────────────────────────────────────────────────────┐
│ Barre du haut : projet actif · modèle · état CLI · coût du jour │
├────┬──────────────────────────────────────────┬───────────────┤
│Rail│              Zone principale              │ Panneau droit │
│ 💬 │   (onglet actif : Chat, Agents, …)        │ (contextuel : │
│ 🤖 │                                          │  fichiers,    │
│ 📁 │                                          │  diff, notes, │
│ 🧠 │                                          │  tâche)       │
│ 🕸 │                                          │               │
│ 📊 │                                          │               │
│ 🎵 │                                          │               │
│ 📱 │                                          │               │
├────┴──────────────────────────────────────────┴───────────────┤
│ Mini-lecteur musique (persistant) · terminal repliable (option) │
└───────────────────────────────────────────────────────────────┘
```

## Onglets (premier jet)
| Onglet | Contenu |
|---|---|
| **Chat** | Conversation en streaming, Markdown, blocs de code, diffs, outils utilisés, boîte de dialogue de permission (autoriser une fois / toujours / refuser), choix du modèle, reprise de session. |
| **Agents** | "Salle de contrôle" : une carte par agent (rôle, modèle, tâche, état, tokens/coût, dernier message), timeline, logs. |
| **Projets** | Dossiers récents, branches/worktrees, tâches en cours. |
| **Second cerveau** | Notes Obsidian du projet : tableau de bord, journal, décisions, leçons ; recherche ; ouvrir dans Obsidian. |
| **Graphe** | Vue Graphify du code + rapport (nœuds clés, communautés). |
| **Usage** | Tokens et coûts par jour, par agent, par modèle. |
| **Musique** | Contrôle du lecteur en cours (pochette, titre, lecture/pause/suivant) + lecteur local + mini-lecteur persistant en bas. |
| **Instagram** | Reels dans une webview isolée, connexion manuelle, bouton "pause focus" pour masquer l'onglet. |
| **Réglages** | Chemin du CLI, modèles, vault, thème, raccourcis, onglets visibles. |

## Idées "attractivité" à explorer (l'architecte tranche)
- Mode **Focus** (masque les onglets média, minuteur type Pomodoro, musique douce).
- Notifications desktop quand un agent finit ou attend une permission.
- Palette de commandes (`Ctrl+K`) pour tout faire au clavier.
- Thèmes personnalisables / fond animé léger.
- Récap de fin de journée envoyé dans le journal Obsidian.

## Principes UX
- Toujours montrer **ce que fait Claude** (outil en cours, fichier touché) et **ce qui attend l'utilisateur**.
- Aucune action destructive sans confirmation explicite.
- Tout au clavier, accessibilité (contraste AA, focus visible, lecteurs d'écran).
- Les onglets média ne doivent jamais ralentir le Chat (chargés à la demande).

<!-- À compléter : tokens de design (couleurs, espacements, typo), composants, états, maquettes. -->
