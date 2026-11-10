# DESIGN.md — Atelier, concept « Régie »

Spécification de design de référence. Chaque section `##` se lit seule. Valeurs exactes : `design/tokens.css` (source de vérité ; en cas d'écart, le CSS gagne).

## Sommaire
| § | Section | Contenu en une ligne |
|---|---|---|
| 1 | Intention | Concept « Régie », pourquoi, ce qu'on refuse. |
| 2 | Tokens | Couleurs (2 thèmes, contrastes vérifiés), typo, espacement, rayons, élévation, mouvement, z-index, layout. |
| 3 | Layout | Coquille, règles de repli, wireframes Shell / Chat / Agents / Musique / Usage / Graphe, écrans liste + détail, lanceur Instagram. |
| 4 | Composants | Inventaire minimal : rôle, anatomie, états, clavier, a11y. |
| 5 | Interactions critiques | Permission, streaming, changements d'état d'agent, Focus, palette, raccourcis AZERTY. |
| 6 | Mouvement, son, états vides, ton | Principes motion, notifications, vide/chargement/erreur, microcopie FR. |
| 7 | Moteur & ressources | Contraintes WebKitGTK, polices, icônes, chargement paresseux. |
| 8 | Règles pour les agents UI | Checklist de 10 lignes, suffisante seule. |

## 1. Intention & direction esthétique

**Concept : « Régie »** — la cabine de régie d'un studio d'enregistrement, la nuit. On y surveille des signaux, on valide des prises, et la musique y est chez elle.

| Idée | Traduction visuelle |
|---|---|
| Feutre acoustique | Fonds gris-vert profonds (`#111615` → `#252E2C`), pas de bleu nuit ni de noir pur. Surfaces mates, sans dégradé ni verre dépoli. |
| Patine | Un seul accent, vert-de-gris (`#6CC3B0` sombre / `#17705F` clair) : action principale, focus, sélection, liens. |
| Voyants « tally » | **Signature unique de l'app** : un voyant rond de 8 px + libellé pour tout ce qui vit (état CLI, agents, tâches, permission). Le voyant ambre clignotant lentement = « quelqu'un attend ta décision ». |
| Console | Densité maîtrisée, alignement à gauche, chiffres tabulaires, colonnes nettes. Le Chat reste aéré (mesure 72ch). |
| Studio | L'onglet Musique est le seul endroit expressif : grande pochette, teinte de pochette en fond (jamais sous du texte). |

Refusé : charte et typo d'Anthropic ou look Claude Desktop (crème + serif + terracotta), template de chat IA (bulles centrées, dégradés violets), kit de cartes SaaS identiques, labels en capitales espacées, emoji-icônes.

Principe directeur : *le calme par défaut, le signal quand ça compte*. L'interface est silencieuse tant que rien n'attend l'utilisateur ; seules les attentes (permission, revue, échec) attirent l'œil.

## 2. Design tokens

Préfixe `--`. Thème sombre par défaut, clair si `prefers-color-scheme: light`, forçage via `<html data-theme="light|dark">`. Hex uniquement.

### 2.1 Couleurs — surfaces & texte
| Token | Sombre « Régie de nuit » | Clair « Calque » | Usage |
|---|---|---|---|
| `color-bg-base` | `#111615` | `#E6EBE8` | Rail, barres haut/bas |
| `color-bg-surface` | `#161C1B` | `#F3F6F4` | Zone principale |
| `color-bg-raised` | `#1E2624` | `#FFFFFF` | Cartes, champs, blocs de code |
| `color-bg-overlay` | `#252E2C` | `#FFFFFF` | Dialogues, palette, menus |
| `color-bg-hover` / `-selected` | `#222B29` / `#1B3530` | `#E9EFEC` / `#D5EBE5` | Survol / sélection |
| `color-border-subtle` | `#2A3432` | `#D3DBD7` | Séparateurs décoratifs |
| `color-border-strong` | `#6B7B75` | `#74827C` | Bords de contrôles (≥ 3:1) |
| `color-text-primary` | `#E4EBE7` | `#17201D` | Texte courant |
| `color-text-secondary` | `#A8B4AF` | `#41504A` | Méta, libellés |
| `color-text-muted` | `#929F9A` | `#56645E` | Horodatages, placeholders |
| `color-accent` | `#6CC3B0` | `#17705F` | Action, focus, lien |
| `color-text-on-accent` | `#0E1A17` | `#FFFFFF` | Texte sur bouton primaire |

### 2.2 Couleurs — sémantique
| Token | Sombre | Clair | Icône Phosphor associée |
|---|---|---|---|
| `color-state-queued` | `#939F9A` | `#56645E` | `CircleDashed` |
| `color-state-running` | `#7DB4F5` | `#1F5FAF` | `CircleNotch` (rotation) |
| `color-state-waiting` (permission) | `#F2B33D` | `#875500` | `HandPalm` |
| `color-state-review` | `#BBA6F4` | `#6346B8` | `Eye` |
| `color-state-done` | `#7FCB8F` | `#2A6E37` | `CheckCircle` |
| `color-state-failed` | `#F07A71` | `#AD2C25` | `XCircle` |
| `color-danger` / `-solid` / `-bg` | `#F07A71` / `#B8352E` / `#3A1D1F` | `#AD2C25` / `#A72C26` / `#F9E0DD` | `Warning` |
| `color-permission-frame` | `#F2B33D` | `#875500` | cadre 2 px du dialogue |
| `color-diff-add-bg` / `-fg` | `#17301F` / `#A6E3B3` | `#DCF1E0` / `#1B5A2A` | préfixe `+` |
| `color-diff-remove-bg` / `-fg` | `#3A1D1F` / `#F6AFAA` | `#F9E0DD` / `#8A221C` | préfixe `−` |
| `color-chart-1…5` | patine, bleu, lilas, ambre, gris | idem foncés | max 5 séries |

Règle : un état n'est **jamais** porté par la couleur seule. Le « tally » est le voyant rond de 8 px de l'état, toujours suivi de son icône et de son libellé texte.

### 2.3 Contrastes vérifiés (WCAG 2.x)
| Paire | Sombre | Clair | Seuil |
|---|---|---|---|
| text-primary / surface · overlay | 14.26 · 11.51 | 15.31 · 16.66 | 4.5 |
| text-secondary / surface · overlay | 8.07 · 6.52 | 7.81 · 8.50 | 4.5 |
| text-muted / surface · overlay | 6.29 · 5.08 | 5.71 · 6.21 | 4.5 |
| text-muted / hover · selected | 5.29 · 4.78 | 5.33 · 4.98 | 4.5 |
| accent / base · raised | 8.76 · 7.42 | 4.95 · 5.97 | 4.5 |
| text-on-accent / accent | 8.54 | 5.97 | 4.5 |
| on-danger (#FFF) / danger-solid | 5.85 | 6.93 | 4.5 |
| état le plus faible / overlay | failed 5.13 | done 6.21 | 4.5 |
| state-waiting / waiting-bg | 8.30 | 5.58 | 4.5 |
| danger / danger-bg | 5.62 | 5.29 | 4.5 |
| diff-add fg/bg · remove fg/bg | 9.64 · 8.46 | 6.96 · 7.19 | 4.5 |
| text-primary / selected | 10.85 | 13.36 | 4.5 |
| border-strong / base · surface · overlay | 4.10 · 3.88 · 3.13 | 3.33 · 3.69 · 4.02 | 3 (UI) |
| danger-solid / surface (indicateur seul) | 2.95 ✗ | 6.37 | 3 (UI) → toujours avec libellé texte |
| focus-ring (accent) / base | 8.76 | 4.95 | 3 (UI) |

Tout nouveau couple texte/fond doit être vérifié et ajouté ici.

### 2.4 Typographie
Familles (OFL 1.1, embarquées, variables 200–800) : **Atkinson Hyperlegible Next** (UI et lecture), **Atkinson Hyperlegible Mono** (code, diffs, logs, chemins, commandes, `TASK-XXX`). Fallbacks : `"Cantarell", "Noto Sans", system-ui, sans-serif` / `"DejaVu Sans Mono", "Noto Sans Mono", monospace`. Choix : lisibilité de longue durée (formes de lettres désambiguïsées : `Il1`, `O0`), une seule super-famille cohérente, rien de commun avec la typo des apps Claude.

| Token | Taille / interligne | Usage |
|---|---|---|
| `text-xs` | 12 / 16 | Horodatages, méta, compteurs |
| `text-sm` | 13 / 18 | Tableaux, logs, libellés secondaires |
| `text-md` | 14 / 20 | UI par défaut, boutons |
| `text-read` | 15 / 24 | Corps du Chat et des notes (max `72ch`) |
| `text-lg` | 18 / 24 | Titres de carte / panneau |
| `text-xl` | 22 / 28 | Titre d'écran |
| `text-2xl` | 30 / 36 | Titre du morceau, chiffres du récap |

Graisses : 400 / 520 / 680. Chiffres : `font-variant-numeric: tabular-nums` sur coûts, tokens, durées. Casse de phrase partout ; pas de capitales espacées ; pas d'italique décoratif.

### 2.5 Espacement, rayons, élévation
| Espacement | `space-1` 2 · `-2` 4 · `-3` 8 · `-4` 12 · `-5` 16 · `-6` 24 · `-7` 32 · `-8` 48 (px) |
|---|---|
| **Rayons** | `radius-xs` 3 (chip, kbd) · `-sm` 5 (bouton, champ, ligne) · `-md` 8 (carte, code, tool card) · `-lg` 12 (dialogue, palette, pochette) · `-full` (voyant, interrupteur) |
| **Élévation** | Sombre : la hauteur = clarté de surface + bordure `border-subtle`, aucune ombre sauf `shadow-overlay` (dialogues, menus, palette). Clair : idem, ombre overlay plus douce. Scrim `--scrim` sous les modales. |

### 2.6 Mouvement & z-index
| Durée | Valeur | Usage | | z-index | Valeur |
|---|---|---|---|---|---|
| `dur-instant` | 90 ms | survol, pression | | `z-sticky` | 10 |
| `dur-fast` | 160 ms | menus, tooltips, onglets | | `z-drawer` | 20 |
| `dur-base` | 240 ms | panneaux, tiroir, dialogues | | `z-panel` | 30 |
| `dur-slow` | 400 ms | transition d'état d'agent | | `z-popover` | 40 |
| `dur-pulse` | 1600 ms | voyant running/waiting | | `z-palette` | 50 |
| `ease-standard` | `cubic-bezier(.2,0,0,1)` | défaut | | `z-toast` | 60 |
| `ease-enter` / `-exit` | `(0,0,0,1)` / `(.4,0,1,1)` | entrée / sortie | | `z-permission` | 70 (rien au-dessus) |

`prefers-reduced-motion: reduce` → toutes les durées à 0, voyants fixes.

### 2.7 Dimensions de layout
| Token | Valeur | | Token | Valeur |
|---|---|---|---|---|
| `app-min-w` × `app-min-h` | 960 × 600 | | `drawer-h` (min) | 260 (120) |
| `rail-w` | 56 | | `composer-min-h` / max | 56 / 40vh |
| `topbar-h` / `bottombar-h` | 40 / 44 | | `palette-w` / `dialog-w` | 640 / 560 |
| `panel-w` (min–max) | 340 (280–520) | | `agent-card-min-w` | 300 |
| `focus-ring-w` + offset | 2 + 2 | | `tally-size` / icônes | 8 / 16, 20 |

## 3. Layout & comportement responsive

Coquille fixe en CSS Grid : `rail | main | panel` sur 3 rangées `topbar / contenu / bottombar`. Le tiroir terminal/log s'ouvre au-dessus de la bottombar, dans la colonne main uniquement.

| Largeur fenêtre | Comportement |
|---|---|
| ≥ 1280 | Panneau droit ouvert si contexte disponible, redimensionnable (280–520). |
| 1100–1279 | Panneau droit replié par défaut ; s'ouvre en superposition (`z-panel`, ombre overlay) sur demande. |
| 960–1099 | Panneau toujours en superposition ; topbar masque le modèle (accessible via clic sur le projet). |
| < 960 | Interdit : `minWidth/minHeight` Tauri = 960 × 600. |

Règles : le rail ne se replie jamais (icônes seules, libellé en tooltip). Le tiroir est mémorisé par projet. Le Chat garde toujours ≥ 520 px utiles ; sinon le panneau passe en superposition.

### 3.1 Coquille
```
┌──────┬──────────────────────────────────────────────────────────────────────────────┐
│ ◉ At │ atelier-app ▾ │ modèle: opus ▾ │ ● CLI prêt │ Aujourd'hui 3,42 € │   ⌕ Ctrl+K │ topbar 40
├──────┼──────────────────────────────────────────────────────┬───────────────────────┤
│ Chat │                                                      │ Panneau contextuel     │
│ Agts │                 Zone principale                       │ [Fichiers|Diff|Notes|  │
│ Proj │                 (onglet actif)                        │  Tâche]               │
│ Cerv │                                                      │                       │
│ Grph │                                                      │                       │
│ Usag │                                                      │                       │
│ ──── │                                                      │                       │
│ Musq │  (onglets média masqués en mode Focus)               │                       │
│ Inst │                                                      │                       │
│ ⚙    ├──────────────────────────────────────────────────────┤                       │
│      │ Tiroir terminal / logs (repliable, Ctrl+² ou F12)    │                       │
├──────┴──────────────────────────────────────────────────────┴───────────────────────┤
│ ▶ Titre — Artiste   ⏮ ⏯ ⏭  ▁▃▅ vol │        │ ◔ Focus 18:24 │ ● 2 agents · 1 attend│ bottombar 44
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Chat
```
┌─ main ───────────────────────────────────────────────────┐
│ Session « refonte auth » ▾  Reprendre…   12,4k tok 0,38 € │  en-tête de session
├──────────────────────────────────────────────────────────┤
│  Toi                                             14:02    │
│  Ajoute la validation du formulaire.                      │
│                                                            │
│  Claude                                         14:02     │  aligné à gauche, pas de bulles
│  ◌ Réflexion… (repliable)                                  │
│  ┌ Read  src/form.ts ──────────────────── ● terminé ┐      │  tool card
│  └──────────────────────────────────────────────────┘      │
│  ┌ Edit  src/form.ts ──────────────────── ● en cours ┐     │
│  │ − const ok = true                                 │     │  diff inline
│  │ + const ok = schema.safeParse(v).success          │     │
│  └──────────────────────────────────────────────────┘     │
│  Texte Markdown en streaming▍                              │
│                                    ┌────────────────────┐  │
│                                    │ ↓ 3 nouveaux blocs │  │  pastille si scroll manuel
├──────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────────┐ │
│ │ Écris à Claude…   (Entrée envoie, Maj+Entrée = ligne)│ │  composer
│ └──────────────────────────────────────────────────────┘ │
│ opus ▾   @fichier   /commande            ■ Arrêter (Échap)│
└──────────────────────────────────────────────────────────┘
```

### 3.3 Agents (salle de contrôle)
```
┌─ main ──────────────────────────────────────────────────────────┐
│ Agents [Tous 6] [Actifs 2] [Attente 1] [En revue 1] [Échecs 1]   │
├──────────────────────────────────────────────────────────────────┤
│ ┌ ● Attend ta décision ─────┐ ┌ ● Échec ──────────┐ ┌ ● En revue ─┐│  ordre : attente, échec,
│ │ UI · sonnet · TASK-014    │ │ Tests · TASK-009  │ │ Doc·TASK-016││  revue, en cours,
│ │ « Bash: npm test »        │ │ « exit 1 : 3 KO » │ │ « Diff prêt »│  en file, terminé
│ │ 41k tok 0,62 € [Décider]  │ │ [Voir les logs]   │ │ [Relire]    ││
│ └───────────────────────────┘ └───────────────────┘ └─────────────┘│
│ ┌ ● En cours ───────────────┐ ┌ ● En file ────────┐ ┌ ● Terminé ──┐│
│ │ Backend · opus · TASK-011 │ │ Infra · TASK-017  │ │ Lint·TASK-08││
│ │ « Écriture api.rs »       │ │ « Démarre après   │ │ 12k 0,09 €  ││
│ │ 88k tok 1,10 € [Arrêter]  │ │   TASK-011 »      │ │             ││
│ └───────────────────────────┘ └───────────────────┘ └─────────────┘│
├──────────────────────────────────────────────────────────────────┤
│ Timeline  14:00 ──●────●──●───────●── maintenant                   │  1 piste par agent
│  UI      ▬▬▬▬▬▬▬▬▬▬▌attente                                       │
│  Backend      ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬                                 │
├──────────────────────────────────────────────────────────────────┤
│ Logs (agent sélectionné) — mono, filtrable, copie                  │
└──────────────────────────────────────────────────────────────────┘
```

### 3.4 Musique (côté studio)
```
┌─ main ──────────────────────────────────────────────────────────┐
│  Source: [Spotify ▾]  [Fichiers locaux]                           │
│  ┌──────────────┐                                                 │  fond: teinte de pochette
│  │              │   Titre du morceau            (text-2xl)        │  à 12 %, hors zone de texte
│  │   pochette   │   Artiste — Album                               │
│  │   240×240    │   01:42 ━━━━━━━●──────────── 03:58              │
│  │              │   ⏮   ⏯   ⏭        vol ━━━━●──                  │
│  └──────────────┘                                                 │
├──────────────────────────────────────────────────────────────────┤
│ File locale : liste des pistes (titre, artiste, durée)            │
└──────────────────────────────────────────────────────────────────┘
```
Les glyphes ci-dessus sont des repères ASCII ; l'UI utilise Phosphor (§7).

### 3.5 Usage
```
┌─ main ──────────────────────────────────────────────────────────┐
│ Usage   [7 j] [30 j] [Mois]      Total 18,40 € · 1,2 M tokens    │
├──────────────────────────────────────────────────────────────────┤
│ Par jour (MiniChart barres)  ▁▂▅▃▇▂▄                              │
├───────────────────────────────┬──────────────────────────────────┤
│ Par agent (barres horiz.)     │ Par modèle (barres horiz.)        │
│ Backend ▬▬▬▬▬▬▬ 7,10 €        │ opus   ▬▬▬▬▬▬▬▬ 12,30 €           │
│ UI      ▬▬▬▬ 4,20 €           │ sonnet ▬▬▬ 6,10 €                 │
├───────────────────────────────┴──────────────────────────────────┤
│ Tableau détaillé (date, agent, modèle, tokens, coût) — tri, copie │
└──────────────────────────────────────────────────────────────────┘
```

### 3.6 Graphe
```
┌─ main ──────────────────────────────────────────┬────────────────┐
│ Graphe  Recherche nœud… [Communautés ▾]  Zoom ± │ Nœud sélectionné│
├─────────────────────────────────────────────────┤ nom (mono)      │
│        ○──○        ●═══●                         │ communauté      │
│       ○  ○──●═════●   ●   (SVG depuis JSON,     │ degré, fichiers │
│        ○──○        ●═══●   couleur = communauté) │ [Ouvrir fichier]│
├─────────────────────────────────────────────────┤                 │
│ Nœuds clés (ListRow) · Communautés (ListRow)     │                 │
└─────────────────────────────────────────────────┴────────────────┘
```
Clavier : la liste « Nœuds clés » est la navigation principale ; le SVG suit la sélection (`aria-hidden`, liste = équivalent accessible).

### 3.7 Écrans « liste + détail »
| Écran | Volet gauche | Volet droit |
|---|---|---|
| Projets | `ListRow` (dossiers récents, branches/worktrees) | Colonnes de `TaskCard` par état (`Tabs` pour filtrer) |
| Second cerveau | `Field` recherche + `ListRow` (Tableau de bord, Journal, Décisions, Leçons) | Note Markdown (`text-read`, 72ch) + `Button` « Ouvrir dans Obsidian » |
| Réglages | `Tabs` verticaux (CLI, Modèles, Vault, Thème, Raccourcis, Onglets) | `Field`, `Toggle`, `Button` |

### 3.8 Instagram (lanceur)
Aucune webview dans la fenêtre principale. L'onglet Instagram affiche une seule `Card` :
| Élément | Spécification |
|---|---|
| Tuile | Icône `InstagramLogo` (Phosphor), titre « Reels », texte « S'ouvre dans une fenêtre séparée. Connexion manuelle. », `Button` primary « Ouvrir les Reels » (ou « Ramener la fenêtre » si déjà ouverte). |
| Interrupteur | `Toggle` « Pause focus » : activé, masque Musique et Instagram du rail et ferme la fenêtre Reels (même effet que le mode Focus, sans minuteur). |
| État | Tally (voyant rond 8 px + libellé) : « Fenêtre ouverte » / « Fermée ». |

## 4. Inventaire des composants

Liste fermée : réutiliser avant de créer. Tous : focus visible (`outline: 2px solid var(--color-focus-ring); outline-offset: 2px`), `:focus-visible` uniquement.

| Composant | Rôle & anatomie | États | Clavier | A11y |
|---|---|---|---|---|
| `Button` | Icône? + libellé. Variantes : primary (accent plein), secondary (bord strong), ghost, danger (danger-solid). | default, hover, active, focus, disabled, busy | Entrée/Espace | `<button>` natif ; busy → `aria-busy`, libellé inchangé |
| `IconButton` | Icône 16/20 dans 32×32 | idem + pressed | idem | `aria-label` obligatoire, tooltip identique |
| `Tally` | Voyant 8 px + libellé d'état | 6 états agent + idle/offline CLI ; pulse si running/waiting | — | Libellé texte toujours présent ; pulse décoratif |
| `Field` | Libellé + input/textarea/select + aide/erreur | default, focus, invalid, disabled | natif | `<label for>`, erreur via `aria-describedby` + `aria-invalid` |
| `Toggle` | Interrupteur (Focus, réglages) | on, off, disabled | Espace | `role="switch"` + `aria-checked` |
| `Tabs` | Segments (panneau droit, filtres) | selected, hover | ←/→, Home/End | `tablist`/`tab`/`tabpanel`, roving tabindex |
| `RailItem` | Icône 20 + tooltip ; actif = icône fill + barre accent 2 px | active, hover, hidden (Focus) | ↑/↓ dans le rail, `Ctrl+Digit1…9` ou `F1…F9` (§5.6) | `nav` + `aria-current="page"` |
| `Card` | Conteneur `raised`, `radius-md`, en-tête + corps | default, selected, attention (bord waiting) | focusable si actionnable | Titre = `h3` |
| `MessageBlock` | Auteur, heure, corps Markdown | streaming, complete, stopped, error | ↑/↓ entre messages (mode lecture) | `article` + `aria-label="Claude, 14:02"` |
| `CodeBlock` | Langue, bouton Copier, `pre` mono | default, copied (2 s) | Tab atteint Copier | Copier annonce « Copié » (live polite) |
| `DiffView` | Gutter n° + `+`/`−` + texte, vue unifiée | collapsed (>40 lignes), expanded | Entrée déplie | Préfixe `+`/`−` lu ; jamais la couleur seule |
| `ToolCard` | Nom outil (mono), cible, Tally, durée, détail repliable | running, done, failed, denied | Entrée déplie | `aria-expanded` ; erreur lisible en clair |
| `PermissionDialog` | Modale au-dessus de tout : commande complète, Refuser · Toujours… · Autoriser une fois ; jamais auto-fermée. Détail §5.1 | pending, confirming-always, cancelled | focus initial sur le titre, `Échap` = Refuser ; §5.1 | `alertdialog` |
| `AgentCard` | Tally, rôle, modèle, `TASK-XXX`, dernier message (2 lignes), tokens/coût, action contextuelle | 6 états | Entrée ouvre logs ; `D` = Décider si attente | Changement d'état annoncé (§5.3) |
| `Timeline` | Pistes horizontales par agent, segments colorés par état | hover segment → tooltip | ←/→ par événement | Alternative : liste d'événements tabulaire accessible |
| `LogView` | Lignes mono horodatées, filtre, suivi auto | following, paused | `F` suivre, `Ctrl+F` filtre | `role="log"`, `aria-live="off"` |
| `Meter` | Tokens/coût : valeur tabulaire + barre fine | normal, ≥80 % budget (warning) | — | Texte toujours présent ; barre `aria-hidden` |
| `MiniChart` | Barres/ligne SVG natives (Usage) | hover valeur | ←/→ entre points | `<figure>` + tableau de données caché accessible |
| `ListRow` | Icône, titre, méta, action au survol | hover, selected, focus | ↑/↓, Entrée | `listbox`/`option` ou `<ul>` + liens |
| `TaskCard` | `TASK-XXX`, titre, Tally, agent assigné | 6 états | Entrée ouvre panneau Tâche | — |
| `PlayerControls` | Pochette, titre, ⏮⏯⏭, volume, sélecteur de lecteur | playing, paused, no-player | Espace (si focus dans lecteur), `Ctrl+Alt+→` suivant | Boutons libellés ; titre en `aria-live="polite"` au changement de piste |
| `CommandPalette` | Recherche floue sur commandes, onglets, sessions, notes, agents. Détail §5.5 | open, empty-results | `Ctrl+K`, ↑/↓, Entrée, `Échap` | `combobox` + `listbox` |
| `Toast` | Icône + message + action optionnelle | info, success, error | `Ctrl+Maj+N` focus dernier toast | `status` (polite) ; erreurs `alert` ; jamais pour une permission |
| `Drawer` | Tiroir terminal/log redimensionnable | open, closed | `Ctrl+Backquote` (touche ² en AZERTY) ou `F12` | Région nommée `aria-label="Terminal"` |
| `EmptyState` | Icône 20, une phrase, une action | — | Action focusable | Texte réel, pas d'illustration seule |
| `Skeleton` | Blocs `raised` sans animation de vague | — | — | Conteneur `aria-busy="true"` |

Graphe : nœuds/liens rendus en SVG depuis le JSON, avec liste accessible équivalente (nœuds clés, communautés). Jamais d'`iframe` ni d'HTML externe.

## 5. Spécifications d'interactions critiques

### 5.1 Dialogue de permission (composant le plus critique)
| Aspect | Règle |
|---|---|
| Déclenchement | Toute demande d'outil soumise à permission. File d'attente FIFO si plusieurs ; compteur « 1 sur 3 ». |
| Forme | Modale `alertdialog`, `z-permission`, scrim, cadre 2 px `color-permission-frame`, `radius-lg`, largeur 560. Jamais un toast, jamais inline seul. |
| Contenu | Titre : « Claude veut exécuter une commande » (verbe selon l'outil). Agent demandeur + Tally. Bloc mono avec la commande / le chemin **complet**, non tronqué (scroll si long). Répertoire de travail. Portée de « toujours » énoncée en clair. |
| Boutons (ordre fixe) | `Refuser` (secondary, gauche) · `Toujours autoriser…` (secondary + icône `LockOpen`, libellé de portée : « Toujours autoriser `npm test` dans ce projet ») · `Autoriser une fois` (primary, droite). |
| Focus initial | Sur le titre du dialogue (`tabindex="-1"`), pas sur un bouton : `Entrée` seul ne valide rien. |
| Garde de frappe | Clics et touches ignorés pendant 500 ms (évite la validation par frappe en cours). Boutons visuellement désactivés pendant ce délai. Garde **réarmée** à chaque changement de contenu (demande suivante de la file) et à chaque retour du focus sur la fenêtre. |
| Demande arrivant pendant un dialogue ouvert | Ajoutée en fin de file ; le compteur se met à jour (« 1 sur 4 »), le focus ne bouge pas, annonce polite « Nouvelle demande en attente ». |
| Agent ou session arrêté(e) | Ses demandes en attente passent à « Annulée » (tracé dans la ToolCard) et la file avance ; une demande annulée n'est jamais approuvée. Si c'était la demande affichée : bandeau « Annulée : l'agent a été arrêté » 1 s, puis demande suivante (garde réarmée). |
| Raccourcis | `Échap` = Refuser (explicite, journalisé). `Alt+O` une fois, `Alt+T` toujours (ouvre la confirmation), `Alt+R` refuser (lettres via `event.key`, §5.6). Tab piégé dans le dialogue. |
| « Toujours » | Seconde étape inline (« Confirmer : toujours autoriser `npm test` ici ») avec [Retour] [Confirmer]. `Échap` à cette étape = retour à l'étape 1, **pas** un refus. Révocable dans Réglages. |
| Jamais | Fermeture automatique, timeout, clic sur le scrim qui ferme, empilement derrière une autre modale, mode silencieux en Focus. |
| A11y | `role="alertdialog"`, `aria-modal="true"`, `aria-labelledby` (titre), `aria-describedby` (commande + portée). Annonce assertive à l'ouverture. Retour du focus à l'élément d'origine à la fermeture. |
| Hors app | Si la fenêtre n'a pas le focus : notification desktop « Permission requise » + badge sur l'icône ; voyant ambre dans la topbar et sur l'AgentCard. |
| Trace | Chaque décision s'affiche dans la ToolCard (« Autorisé une fois », « Refusé ») avec l'heure. |

### 5.2 Rendu des messages en streaming
| Aspect | Règle |
|---|---|
| Rendu | Tampon de tokens vidé au plus une fois par frame (`requestAnimationFrame`). Markdown re-parsé seulement sur le bloc en cours ; blocs terminés figés (pas de re-rendu). |
| Curseur | Barre `▍` accent en fin de texte pendant le streaming, statique (pas de clignotement). |
| Réflexion | Ligne « Réflexion… » repliée par défaut avec durée ; dépliable. |
| Code incomplet | Bloc ouvert rendu comme code dès la clôture de ``` détectée ; coloration syntaxique appliquée à la fin du bloc seulement. |
| Scroll | Suivi auto si l'utilisateur est à < 48 px du bas. S'il remonte : suivi suspendu, pastille « N nouveaux blocs » (Entrée/clic = descendre). |
| Arrêt | `Échap` dans le composer ou bouton « Arrêter » ; message marqué « Arrêté » (texte, pas seulement couleur). |
| Lecteurs d'écran | Liste des messages `role="log"` avec `aria-live="off"` pendant le streaming et `aria-busy="true"` sur le message en cours. Une région `status` cachée annonce uniquement : « Claude écrit », « Outil Bash en cours », « Réponse terminée ». Le texte complet est lisible à la demande, jamais lu token par token. |

### 5.3 Changements d'état d'agent
Tally = voyant rond de 8 px coloré par état, toujours accompagné d'une icône et d'un libellé.

| Transition | Visuel | Annonce / notification |
|---|---|---|
| → queued | Tally gris fixe, libellé « En file », dépendance affichée (« Démarre après TASK-011 ») | aucune |
| → running | Tally bleu, pulse lent | aucune |
| → waiting-permission | Carte remontée en tête, bord ambre, bouton « Décider » | `status` assertive + notification desktop si fenêtre non focalisée |
| → review | Tally lilas, bouton « Relire » | `status` polite + notification |
| → done | Tally vert fixe, coût final | `status` polite + notification (regroupée si plusieurs en < 10 s) |
| → failed | Tally rouge, extrait d'erreur 2 lignes, « Voir les logs » | `status` assertive + notification |

Ordre des cartes (tri par défaut « urgence ») : attente, échec, revue, en cours, en file, terminé. Filtres : Tous, Actifs, Attente, En revue, Échecs. Transition visuelle : fondu de couleur du voyant `dur-slow` ; déplacement de carte `dur-base` (aucun si mouvement réduit). Focus clavier conservé sur la même carte après un réordonnancement.

### 5.4 Mode Focus
| Aspect | Règle |
|---|---|
| Activation | `Ctrl+Maj+F` (lettre, identique en AZERTY), palette, ou voyant Focus dans la bottombar. Raccourcis remappables (§5.6). |
| Effet | Masque Musique et Instagram du rail et de la palette ; ferme la fenêtre Reels ; mini-lecteur conservé (contrôle seulement). Notifications réduites aux permissions et échecs. |
| Minuteur | Pomodoro 25/5 par défaut (réglable), affiché dans la bottombar en `tabular-nums`. Fin de phase : notification silencieuse + toast. |
| Sortie | Même raccourci ; confirmation si le minuteur tourne (« Quitter le Focus avant la fin ? »). |
| Jamais | Masquer ou retarder une demande de permission. |

### 5.5 Palette de commandes
| Aspect | Règle |
|---|---|
| Ouverture | `Ctrl+K` partout (y compris dans le composer). Modale `z-palette`, 640 px, en haut à 20 % de la hauteur. |
| Contenu | Recherche floue sur : commandes, onglets, sessions, projets, notes, agents, réglages. Groupes nommés, raccourci affiché à droite (`kbd`). |
| Clavier | ↑/↓ naviguer, Entrée exécuter, `Tab` affiner un groupe, `Échap` fermer, `Ctrl+K` à nouveau = fermer. |
| Préfixes | `>` commandes, `@` fichiers, `#` tâches, `?` aide. |
| A11y | Input `role="combobox"` `aria-expanded` `aria-controls` ; liste `listbox`, option active via `aria-activedescendant`. Nombre de résultats annoncé (polite). |
| Perf | Index en mémoire ; résultats en < 50 ms ; ne charge jamais un onglet média. |

### 5.6 Raccourcis clavier (AZERTY d'abord)
Le poste principal est en AZERTY français. Lettres liées par `event.key` (mnémonique conservé), chiffres et ponctuation par `event.code` (position physique, sans AltGr ni Maj). Chaque raccourci a une alternative touche F. **Tous remappables dans Réglages → Raccourcis** ; conflit détecté et signalé à l'enregistrement.

| Action | Principal | Alternative |
|---|---|---|
| Palette | `Ctrl+K` | `Ctrl+P` |
| Onglet n du rail | `Ctrl+Digit1…9` (touches `& é " …` sans Maj) | `F1…F9` |
| Tiroir terminal | `Ctrl+Backquote` (touche ² en AZERTY) | `F12` |
| Mode Focus | `Ctrl+Maj+F` | — (lettre, sans conflit AZERTY) |
| Arrêter la réponse | `Échap` dans le composer | bouton « Arrêter » |
| Permission | `Alt+O` / `Alt+T` / `Alt+R`, `Échap` = Refuser | boutons, Tab |
| Musique suivant / précédent | `Ctrl+Alt+→` / `Ctrl+Alt+←` | touches média du clavier (MPRIS) |

## 6. Mouvement, son, états, ton

### 6.1 Principes de mouvement
- Le mouvement répond à une action (ouvrir, déplier, confirmer) ou signale une attente. Rien d'autre ne bouge.
- Seuls deux mouvements autonomes : pulse du voyant running/waiting et rotation `CircleNotch`. Aucun fond animé.
- Animer `opacity` et `transform` uniquement (pas `height`, `filter`, `box-shadow`).
- Panneaux et tiroirs : glissement 8 px + fondu `dur-base`. Dialogues : fondu + échelle 0.98→1 `dur-fast`.
- `prefers-reduced-motion` : tout instantané, voyants fixes, rotation remplacée par l'icône statique `Hourglass`.

### 6.2 Son & notifications
| Événement | Notification desktop | Son |
|---|---|---|
| Permission requise | Oui (toujours, même en Focus) | Un son court du thème système, si activé |
| Agent en échec | Oui | Non |
| Agent terminé / en revue | Oui, regroupées | Non |
| Fin de Pomodoro | Oui | Non |
| Récap de fin de journée | Une fois, à l'heure réglée | Non |

Notifications seulement si la fenêtre n'a pas le focus. Pas de son par défaut ; réglage « Son pour les permissions ». Aucune notification ne contient de secret ni de contenu de fichier.

### 6.3 Vide, chargement, erreur
| Cas | Rendu | Exemple |
|---|---|---|
| Vide | `EmptyState` : une phrase + une action | « Aucune session dans ce projet. » [Nouvelle session] |
| Chargement < 300 ms | Rien | — |
| Chargement > 300 ms | `Skeleton` statique à la forme du contenu | — |
| CLI absent | Bandeau en haut du Chat, voyant CLI rouge | « Claude Code introuvable dans le PATH. » [Choisir le chemin] |
| Erreur réseau / API | Inline sous le message, action explicite | « La réponse s'est interrompue (connexion perdue). » [Réessayer] |
| Lecteur MPRIS absent | EmptyState Musique | « Aucun lecteur détecté. Lance Spotify ou ouvre un fichier local. » |
| Vault absent | EmptyState Second cerveau | « Aucun vault Obsidian configuré. » [Choisir le dossier] |

### 6.4 Microcopie
Ton : direct, tutoiement, verbes à l'infinitif ou à l'impératif, casse de phrase, pas d'excuse, pas d'exclamation, pas de jargon interne.

| Contexte | Oui | Non |
|---|---|---|
| Bouton d'envoi | « Envoyer » | « Soumettre » |
| Permission | « Autoriser une fois » / « Refuser » | « OK » / « Annuler » |
| Après action | « Copié », « Session reprise » | « Succès ! » |
| Erreur | « Le fichier `api.rs` n'existe plus. » | « Oups, une erreur est survenue » |
| Coût | « Aujourd'hui 3,42 € » | « Coût total journalier » |
| Focus | « Focus · 18 min restantes » | « Mode concentration activé ! » |
| Agent | « Attend ta décision » | « En attente de validation utilisateur » |

Format : nombres FR (`12 400 tokens`, `3,42 €`), heures `14:02`, durées `1 min 20 s`. Une action garde son nom de bout en bout (bouton « Reprendre » → toast « Session reprise »).

## 7. Moteur WebKitGTK & ressources

| Sujet | Règle |
|---|---|
| CSS à éviter | `backdrop-filter`, `color-mix()`, `oklch()`, `@property`, `@container` style queries, CSS anchor positioning, scroll-driven animations, View Transitions, `text-wrap: balance` comme dépendance, `filter: blur` animé, grosses ombres floues. |
| CSS sûr | Custom properties, Grid/Flex, `:focus-visible`, `<dialog>` (avec gestion du focus manuelle en plus), `position: sticky`, `prefers-color-scheme`, `prefers-reduced-motion`. |
| Thème système | `prefers-color-scheme` suit GTK ; si non fiable (KDE), lire le thème via Tauri (`window.theme()`) et poser `data-theme`. Le choix manuel (Réglages) prime. |
| Polices | `.woff2` dans `fonts/` (chemins relatifs `../fonts/` depuis `design/tokens.css`), licence OFL jointe. Aucun appel réseau. |
| Icônes | **Phosphor Icons** (MIT), SVG inline, poids `regular` (16/20 px), `fill` pour l'élément actif du rail. Import par icône (tree-shaking). Couleur `currentColor`. Aucun emoji dans l'UI. |
| Lazy-loading | Musique, Instagram, Graphe, Usage : chunks séparés chargés au premier affichage ; rien n'est préchargé au démarrage. Le Chat est le seul chunk initial avec la coquille. |
| Mini-lecteur | Lit l'état MPRIS via événements Rust ; aucune lib média dans le chunk principal. |
| Instagram | Fenêtre Tauri séparée, webview isolée (profil propre, aucune IPC vers l'app). Dans la fenêtre principale : tuile de lancement + interrupteur « Pause focus » uniquement. |
| Contenu externe | Markdown assaini (pas d'HTML brut), liens ouverts dans le navigateur système, Graphe rendu depuis JSON. |

## 8. Règles pour les agents UI
1. Couleurs, tailles, durées : uniquement les variables de `design/tokens.css` (`--color-*`, `--space-*`, `--dur-*`…) ; jamais de hex en dur.
2. Composants autorisés, réutilise avant de créer : Button, IconButton, Tally, Field, Toggle, Tabs, RailItem, Card, MessageBlock, CodeBlock, DiffView, ToolCard, PermissionDialog, AgentCard, Timeline, LogView, Meter, MiniChart, ListRow, TaskCard, PlayerControls, CommandPalette, Toast, Drawer, EmptyState, Skeleton.
3. Un état (queued, running, waiting-permission, review, done, failed) = « tally » (voyant rond 8 px coloré `--color-state-*`) + icône Phosphor + libellé texte ; jamais la couleur seule.
4. Permission : `alertdialog` modal au-dessus de tout, commande complète visible, focus initial sur le titre (Entrée ne valide rien), entrées ignorées 500 ms à chaque nouvelle demande ou retour de focus, `Échap` = Refuser (sauf à l'étape de confirmation « Toujours » : retour), jamais de fermeture auto ; demande d'un agent arrêté = « Annulée », jamais approuvée.
5. Streaming : `role="log"` + `aria-live="off"` sur le message en cours, annonces brèves (« Claude écrit », « Réponse terminée ») via une région `status` cachée.
6. Tout au clavier, `:focus-visible` = `outline: 2px solid var(--color-focus-ring); outline-offset: 2px` ; lettres via `event.key`, chiffres/ponctuation via `event.code`, alternative touche F, raccourcis remappables.
7. Mouvement : `opacity`/`transform` seulement, durées `--dur-*`, tout à 0 sous `prefers-reduced-motion`.
8. Interdits WebKitGTK : `backdrop-filter`, `color-mix()`, `oklch()`, `@property`, polices/scripts CDN ; icônes Phosphor (SVG, `currentColor`), aucun emoji.
9. Musique, Instagram, Graphe, Usage en import dynamique ; rien de média dans le chunk du Chat ; jamais d'`iframe`/HTML externe.
10. Texte UI en français, casse de phrase, tutoiement, verbes précis (« Autoriser une fois », pas « OK ») ; contraste ≥ 4.5:1 pour le texte, ≥ 3:1 pour les bords de contrôle, vérifié par script ; `--color-danger-solid` jamais seul sans libellé.
