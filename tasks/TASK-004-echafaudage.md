---
id: TASK-004
title: Échafaudage Tauri 2 + React/TypeScript, commandes et CI
status: done
phase: 1
agent: core
model: sonnet
depends_on: []
branch: task/TASK-004-echafaudage
---

## Objectif
Une app vide qui démarre : une fenêtre `main` affichant « Atelier », avec la structure de dossiers
définitive, les commandes de dev, test, lint et build, et une CI GitHub.

## Contexte utile
- Rust est dans `~/.cargo/bin` (pas dans le PATH par défaut) : commence par
  `export PATH="$HOME/.cargo/bin:$PATH"`.
- Vérifie d'abord `pkg-config --modversion webkit2gtk-4.1`. S'il échoue, arrête-toi et remonte-le :
  n'installe rien.
- Tauri **2.12.x** (pas la 3 alpha), sans la feature `unstable`. React 19, Vite, TypeScript strict.
- Génère avec l'outil officiel `npm create tauri-app@latest` (modèle React + TypeScript) dans un dossier
  temporaire, puis déplace les fichiers à la racine. Supprime le code de démonstration.
- Dépendances autorisées : celles du modèle officiel, plus `vitest`. Rien d'autre (pas d'ESLint, pas de
  bibliothèque de composants, pas de plugin Tauri : ni `shell`, ni `opener`).
- Identifiant de l'app : `dev.atelier.app`. Nom du produit : `Atelier`.

## Fichiers
- **Lire** : `ARCHITECTURE.md §2`, `ARCHITECTURE.md §7`
- **Écrire** : `src-tauri/**`, `src/**`, `index.html`, `package.json`, `package-lock.json`,
  `tsconfig*.json`, `vite.config.ts`, `.github/workflows/ci.yml`, `.gitignore`
- **Contrats** : aucun

## Critères d'acceptation
- [ ] Arborescence : `src-tauri/src/` avec `main.rs` et `lib.rs` ; `src/shell/`, `src/features/`,
      `src/ui/`, `src/ipc/` (un `README.md` d'une ligne dans chaque dossier vide).
- [ ] `src-tauri/capabilities/main.json` ne vise que la fenêtre `main`, avec le minimum de permissions.
      Aucune entrée `remote`.
- [ ] CSP stricte dans `tauri.conf.json` : `default-src 'self'`, aucune source distante.
- [ ] Une commande Tauri `app_version` (renvoie la version) appelée par l'UI, avec un test Rust et un
      test Vitest : ils prouvent que la chaîne de test marche des deux côtés.
- [ ] Scripts npm : `dev`, `build`, `test` (vitest run), `lint` (`tsc --noEmit`), `tauri`.
- [ ] CI sur `ubuntu-24.04` : paquets apt des prérequis Tauri, puis `cargo fmt --check`,
      `cargo clippy -- -D warnings`, `cargo test`, `npm run lint`, `npm test`. Actions épinglées par SHA.
- [ ] `Cargo.lock` et `package-lock.json` committés.

## Vérification
```bash
export PATH="$HOME/.cargo/bin:$PATH"
npm ci && npm run lint && npm test && npm run build
cd src-tauri && cargo fmt --check && cargo clippy -- -D warnings && cargo test
```

## Hors périmètre
Pas de design (TASK-006), pas de module métier, pas de pont, pas de paquet `.deb`. Ne lance pas
`tauri dev` de façon bloquante.

## Rapport (rempli par l'agent, 150 mots max)
- Fait : app Tauri 2.12.5 + React 19/Vite/TS strict, fenêtre `main` « Atelier », commande `app_version` appelée par l'UI (`src/ipc/app.ts`), capability `main` (core:default seul), CSP `default-src 'self'`, arborescence + README, scripts npm, CI ubuntu-24.04 (actions épinglées par SHA).
- Fichiers touchés : src-tauri/**, src/**, index.html, package(-lock).json, tsconfig*.json, vite.config.ts, .github/workflows/ci.yml, .gitignore (+ cette fiche).
- Vérification : npm ci, lint, test (1 Vitest), build OK ; cargo fmt --check, clippy -D warnings, cargo test (1 test) OK.
- Raccourcis pris (`shortcut:`) : test Vitest sur l'appel IPC mocké, pas de rendu du composant (pas de jsdom, dépendance non autorisée). `status:` de la fiche non modifié.
- À remonter à l'architecte : `vitest` 5.1.0 installé ; SHA des actions résolus via `gh api` (tags v4/v2/stable), à relire ; `tauri dev` non lancé.
