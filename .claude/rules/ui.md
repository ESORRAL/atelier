---
paths:
  - "src/**"
  - "design/**"
---

# Règles interface (React / TypeScript)

- Avant de rendre : `npm run lint`, `npm test`, `npm run build`.
- Lis `DESIGN.md §8` (règles pour les agents UI) avant d'écrire un composant ; il se suffit à lui-même.
- Styles : variables de `design/tokens.css` uniquement. Aucune couleur, taille ou durée en dur.
- Un onglet = un dossier `src/features/<onglet>/`, chargé en import dynamique s'il est média ou graphe.
- Les composants partagés vivent dans `src/ui/` ; réutilise avant de créer.
- Le système n'est accessible que par les appels typés de `src/ipc/`, miroir de `contracts/ipc.md`.
- Jamais de HTML non fiable (`dangerouslySetInnerHTML`, `iframe`).
- Texte d'interface en français.
