---
id: TASK-043
title: Composer épuré (bloc unique, menus texte sous le champ) et accueil intégré
status: done
phase: 5
agent: ui
model: sonnet
depends_on: [TASK-042]
branch: task/TASK-043-composer-epure
---

## Objectif
L'utilisateur trouve la barre d'outils actuelle (selects encadrés, coût) pas belle et veut la mise en page
épurée d'une capture qu'il a donnée :
- **Un seul bloc arrondi** (fond légèrement surélevé, bord fin, grand rayon) contenant le champ de message
  (plusieurs lignes, placeholder « Comment puis-je t'aider ? ») ; en bas à gauche **dans** le bloc, un bouton
  « + » (ouvre la liste `@` pour joindre un fichier) ; en bas à droite dans le bloc, le bouton d'envoi
  (et Arrêter pendant une réponse).
- **Sous le bloc, en texte simple sans cadre** : à gauche « <nom du dossier> ⌄ » (le projet) ; à droite le
  modèle (« Sonnet 5.5 ») puis le mode (« Manuel », « Accepter les modifs », « Plan »). Chacun ouvre un
  petit menu accessible (`role="menu"`, clavier complet). Texte secondaire discret, accent au survol.
- **Plus aucun montant en dollars dans le Chat** (ni barre du haut ni composer) : le coût ne reste que dans
  l'onglet Usage. L'état de session (« En cours »…) reste discret (voyant) près de l'onglet de session.
- **Accueil** : grand titre, puis ce même composer ; le menu « Projet » liste les dossiers récents et
  « Parcourir… » (`pick_folder`) ; **envoyer le premier message démarre la session** dans ce projet (plus de
  champ chemin + bouton « Démarrer »). Les sessions récentes restent dessous, sans coût affiché.
- Garde l'autocomplétion `@` et `/` de TASK-042 telle quelle.
- **Ne pas reproduire l'identité d'Anthropic** (pas de logo étoilé de Claude, pas de typo serif imitant
  claude.ai) : le titre utilise le logo « A » et la police de l'app.

## Contexte utile
- Code actuel : `src/features/chat/ChatSession.tsx` (composer et barre d'outils), `Chat.tsx` (accueil, onglets),
  `chat.css`, `mention.ts`. Tokens : `design/tokens.css` ; règles : `DESIGN.md §8`.
- Logique de menu (ouverture, navigation clavier) et de démarrage depuis l'accueil dans des modules purs testés.

## Fichiers
- **Lire** : `src/features/chat/`, `src/App.tsx`, `src/ipc/`, `DESIGN.md §8`
- **Écrire** : `src/features/chat/**`, `src/App.tsx` (seulement si un reste du coût y vit), `design/tokens.css` (ajouts)
- **Contrats** : aucun changement

## Critères d'acceptation
- [ ] Composer et accueil conformes ; aucun « $ » dans le Chat ; Usage inchangé.
- [ ] Menus au clavier et à la souris ; tests des modules purs ; tests existants verts.

## Vérification
```bash
npm ci && npm run lint && npm test && npm run build
```

## Hors périmètre
Pas de Rust, pas de dictée vocale.

## Rapport (rempli par l'agent, 150 mots max)
- Fait :
- Fichiers touchés :
- Vérification (sortie résumée) :
- Raccourcis pris (`shortcut:`) :
- À remonter à l'architecte :
