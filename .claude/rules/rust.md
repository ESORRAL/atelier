---
paths:
  - "src-tauri/**"
  - "spikes/**/*.rs"
---

# Règles Rust (cœur Tauri)

- Avant de rendre : `cargo fmt --check`, `cargo clippy -- -D warnings`, `cargo test`, depuis `src-tauri/`.
- Rust est dans `~/.cargo/bin` : `export PATH="$HOME/.cargo/bin:$PATH"`.
- Un module = un dossier `src-tauri/src/<module>/` avec ses tests. Les commandes Tauri d'un module sont
  dans son `commands.rs` et suivent `contracts/ipc.md`.
- Tout process enfant passe par le module `supervisor` (groupe de process + watchdog). Jamais de
  `Command::spawn` ailleurs.
- Pas de `unwrap()` ni `expect()` hors des tests : les erreurs remontent en `Result` jusqu'à la commande.
- Aucune permission ajoutée dans `src-tauri/capabilities/` sans que la fiche de tâche la nomme.
- Aucun plugin Tauri sans que la fiche de tâche le nomme.
