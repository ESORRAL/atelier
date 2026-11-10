---
id: TASK-013
title: Boîte de dialogue de permission
status: todo
phase: 2
agent: ui
model: opus
depends_on: [TASK-006]
branch: task/TASK-013-permission-dialog
---

## Objectif
Le composant le plus sensible de l'app : il affiche chaque demande de permission de Claude et renvoie la
décision de l'utilisateur. Il ne doit jamais approuver par accident.

## Contexte utile
- Spécification complète : `DESIGN.md §5.1` (file d'attente, garde de 500 ms, focus initial sur le titre,
  `Échap`, double confirmation de « Toujours », demandes annulées).
- API du composant (fixe, l'onglet Chat s'y branche) :
  ```ts
  export function PermissionHost(props: {
    requests: PermissionRequest[];          // file, dans l'ordre d'arrivée
    onDecide: (requestId: string, decision: Decision, message: string | null) => void;
  }): JSX.Element | null;
  ```
  `PermissionRequest` = l'événement `permission_request` de `contracts/ipc.md §2` sans le champ `kind`,
  plus `cancelled?: boolean`. Exporte ce type depuis le même fichier.
- « Toujours autoriser » n'est proposé que si `canAlways` est vrai.
- Affiche l'entrée complète de l'outil : pour Bash la commande entière, pour Write/Edit le chemin, pour le
  reste le JSON indenté. Texte brut, jamais interprété.
- La garde de 500 ms se teste avec un horloge contrôlée : mets la logique (file, garde, étapes) dans un
  module pur `src/ui/permissionMachine.ts` testé avec Vitest ; le composant ne fait qu'afficher cet état.

## Fichiers
- **Lire** : `DESIGN.md §5.1`, `DESIGN.md §4` (entrée PermissionDialog), `DESIGN.md §8`, `contracts/ipc.md §2`,
  `src/ui/Tally.tsx`
- **Écrire** : `src/ui/PermissionDialog.tsx`, `src/ui/PermissionDialog.css`, `src/ui/permissionMachine.ts`,
  `src/ui/permissionMachine.test.ts`
- **Contrats** : `contracts/ipc.md §2`

## Critères d'acceptation
- [ ] Tests de la machine : aucune décision possible pendant 500 ms après chaque nouvelle demande affichée
      et après un retour de focus ; `Entrée` ne décide rien au premier affichage ; `Échap` = refuser, sauf à
      l'étape de confirmation de « Toujours » (retour) ; une demande annulée n'est jamais approuvable et
      laisse passer la suivante ; une nouvelle demande ne vole pas le focus de la demande affichée.
- [ ] `role="alertdialog"`, titre et description reliés, focus piégé, annonce polie à chaque nouvelle demande.
- [ ] Aucune fermeture automatique, aucun délai qui décide à la place de l'utilisateur.

## Vérification
```bash
npm ci && npm run lint && npm test && npm run build
```

## Hors périmètre
Pas de branchement à l'onglet Chat (TASK-012 le fera), pas d'appel IPC dans ce composant.

## Rapport (rempli par l'agent, 150 mots max)
- Fait :
- Fichiers touchés :
- Vérification (sortie résumée) :
- Raccourcis pris (`shortcut:`) :
- À remonter à l'architecte :
