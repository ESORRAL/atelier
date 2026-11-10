---
id: TASK-006
title: Brancher les tokens de design, les polices, les icônes et le thème dans l'app
status: todo
phase: 1
agent: ui
model: sonnet
depends_on: [TASK-004]
branch: task/TASK-006-tokens-polices-icones
---

## Objectif
L'app vide prend l'identité « Régie » : couleurs, polices et icônes viennent du design, les thèmes
sombre et clair fonctionnent, et le premier composant partagé (`Tally`) existe. Une page de
démonstration permet de le voir d'un coup d'œil.

## Contexte utile
- `design/tokens.css` est la source de vérité des variables. L'app l'importe tel quel ; elle ne recopie
  aucune valeur.
- Polices : paquets npm `@fontsource/atkinson-hyperlegible-next` et
  `@fontsource/atkinson-hyperlegible-mono` (OFL-1.1, fichiers embarqués, aucun CDN). Importe leur CSS dans
  le point d'entrée et **supprime les trois blocs `@font-face` de `design/tokens.css`**, qui pointent vers
  des fichiers inexistants.
- Icônes : `@phosphor-icons/react` (MIT), imports nommés un par un.
- Thème : l'attribut `data-theme` sur `<html>` vaut `dark` ou `light` quand l'utilisateur force un thème ;
  absent, le thème suit le système (`prefers-color-scheme`). Le choix est gardé dans `localStorage`.
- La CSP est `default-src 'self'` : si les polices ou les styles sont bloqués à l'exécution, arrête-toi et
  remonte la directive exacte qui manque. Ne modifie pas `src-tauri/`.
- Dépendances autorisées : les trois paquets ci-dessus. Rien d'autre (pas de jsdom, pas de bibliothèque
  de test de composants).

## Fichiers
- **Lire** : `DESIGN.md §2` (tokens), `DESIGN.md §8` (règles pour les agents UI), `design/tokens.css`,
  `src/main.tsx`, `src/App.tsx`
- **Écrire** : `src/**`, `design/tokens.css` (uniquement la suppression des `@font-face`), `index.html`,
  `package.json`, `package-lock.json`
- **Contrats** : aucun

## Critères d'acceptation
- [ ] `src/ui/base.css` : remise à zéro minimale, `body` (fond, couleur, police), `:focus-visible` selon
      `DESIGN.md §8`, tout mouvement à 0 sous `prefers-reduced-motion`. Aucune couleur, taille ou durée en dur.
- [ ] `src/ui/theme.ts` : `getTheme()`, `setTheme('dark' | 'light' | 'system')`, appliqué avant le premier
      rendu (pas de flash). Test Vitest de la logique pure (lecture et écriture du choix).
- [ ] `src/ui/Tally.tsx` : voyant 8 px + icône Phosphor + libellé pour les six états (queued, running,
      waiting-permission, review, done, failed) ; jamais la couleur seule ; libellés en français.
- [ ] `src/features/demo/` : page chargée en import dynamique qui montre les surfaces, les couleurs de
      texte, l'échelle typographique, les deux polices, les six `Tally` et un bouton de bascule du thème
      utilisable au clavier. `App.tsx` l'affiche sous le titre « Atelier ».
- [ ] `grep -rnE "#[0-9a-fA-F]{3,8}\b" src --include=*.css --include=*.tsx` ne renvoie rien.
- [ ] Les fichiers de police se retrouvent dans `dist/` après `npm run build`.

## Vérification
```bash
npm ci && npm run lint && npm test && npm run build
ls dist/assets | grep -ci woff2
grep -rnE "#[0-9a-fA-F]{3,8}\b" src --include=*.css --include=*.tsx && echo "COULEUR EN DUR" || echo OK
```

## Hors périmètre
Pas de rail, de barres ni de panneaux (phase 3). Pas d'autre composant que `Tally`. Aucun changement de
valeur dans `design/tokens.css`.

## Rapport (rempli par l'agent, 150 mots max)
- Fait :
- Fichiers touchés :
- Vérification (sortie résumée) :
- Raccourcis pris (`shortcut:`) :
- À remonter à l'architecte :
