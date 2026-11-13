# ADR-0005 — Instagram et YouTube Shorts en panneaux intégrés

- **Statut** : accepté
- **Date** : 2026-11-13

## Contexte
L'utilisateur veut les pages « pause » (Instagram, YouTube Shorts) dans l'app, pas dans des fenêtres
flottantes. Sous Linux, les webviews enfants de Tauri 2.12 sont empilées pleine largeur et ignorent leur
position et leur taille (tauri#10420 ; `spikes/instagram-integre/FINDINGS.md`). L'API Tauri ne permet donc
pas de les placer à côté du rail.

## Décision
1. **Re-parentage GTK** : pour chaque panneau, le widget WebKit de la webview enfant sort du `GtkBox` de la
   fenêtre et entre dans un `GtkOverlay` commun, avec un `GtkRevealer` par panneau. Le panneau glisse depuis
   la gauche, à côté du rail ; un seul est ouvert à la fois, et l'interface pousse la page principale de côté.
2. **Isolation inchangée (ADR-0003)** :
   - aucune capability pour les panneaux : les capabilities ciblent `webviews: ["main"]`, jamais une fenêtre
     (un test le vérifie) ;
   - aucune entrée `remote`, aucun script injecté ;
   - un dossier de données par panneau, et une liste blanche de navigation https propre à chaque panneau.
3. **Versions épinglées** : Tauri `=2.12.5` avec `unstable`, `gtk =0.18.2`, `webkit2gtk =2.0.2`. Le code GTK
   reste dans `src-tauri/src/windows/panel.rs`.
4. **Replis** : si un panneau ne s'installe pas, Shorts s'ouvre dans le navigateur du système et Instagram
   dans la fenêtre séparée. Cette fenêtre reste aussi disponible pour les messages.

Pourquoi YouTube Shorts : WebKitGTK ne lit les Reels d'Instagram qu'à environ 10 images/s, même avec décodage
matériel (`spikes/instagram-perf/FINDINGS.md`) ; les Shorts sont fluides.

## Alternatives refusées
- **Chromium embarqué (CEF)** (`spikes/instagram-cef/FINDINGS.md`) : la sandbox demande une étape root sur
  Ubuntu 24.04, pas de H.264, embarquement seulement sous X11, environ 2 fois plus de CPU, 1,3 Go de plus.
  À revoir quand le runtime CEF de Tauri 3, en alpha, sera stable.
- **Fenêtre Firefox ou Chrome** : sous Wayland, on ne peut pas embarquer la fenêtre d'une autre application.

## Conséquences
- Les décodeurs VA-API d'Intel (`vah264dec`, `vah265dec`, `vavp9dec`, `vaav1dec`) sont classés à 0 au démarrage
  dans `src-tauri/src/main.rs`, via `GST_PLUGIN_FEATURE_RANK` : avec eux, les Shorts gelaient après quelques
  vidéos. Le décodage passe en logiciel.
- Un panneau caché est mis en sourdine nativement (`set_is_muted`). WebKitGTK ne sait pas mettre une page en
  pause sans injecter de script, ce qui est interdit.
- Un panneau fermé est déchargé vers `about:blank` après 2 minutes.
- Le montage repose sur des détails internes de `tauri-runtime-wry`. Toute mise à jour de Tauri exige de faire
  passer le test `mount_checks` et une vérification à la main (clics, focus).

## Sources
- `spikes/instagram-integre/FINDINGS.md`, `spikes/instagram-panneau/FINDINGS.md`
- `spikes/instagram-perf/FINDINGS.md`, `spikes/instagram-cef/FINDINGS.md`
- `contracts/ipc.md` §13, §15 ter, §16
