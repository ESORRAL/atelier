# ADR-0004 — Onglet musique : MPRIS d'abord, lecteur local ensuite

- **Statut** : proposé
- **Date** : 2026-11-10

## Contexte
WebKitGTK n'a pas Widevine : un lecteur web (Spotify Web, Deezer…) ne peut pas tourner dans l'app.
Sous Linux, presque tous les lecteurs (Spotify desktop, VLC, Firefox, Rhythmbox…) exposent MPRIS sur D-Bus.

## Décision
1. **Télécommande MPRIS** (MVP) avec la crate `mpris` : lecteur actif, pochette, titre, lecture / pause /
   suivant / précédent, volume, choix du lecteur. C'est le mini-lecteur persistant de la barre du bas.
2. **Lecteur local** (v0.2) avec `rodio` : un dossier de musique, file d'attente simple.
3. **Exposer notre lecteur local en MPRIS** (v0.3) avec `mpris-server`, pour les touches multimédia et
   le panneau GNOME/KDE.

## Conséquences
- Spotify fonctionne via son application desktop, pilotée par l'app ; pas d'intégration de compte, pas de
  jeton, pas d'API tierce.
- Aucune dépendance système en plus (D-Bus est déjà là).

## Refusé
- Lecteur web embarqué à DRM : impossible sans changer de stack (Electron castlabs).
- Client Spotify non officiel (type librespot) : zone grise des CGU, et hors besoin.
