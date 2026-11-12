# Spike TASK-049 — constats : lenteur d'Instagram intégré

Tauri 2.12.5, WebKitGTK 2.52.6, GNOME Wayland, i9-13900H (GPU intégré). Page locale lourde (images, vidéos
en boucle), défilement piloté par la page de test ; jamais instagram.com. `./run.sh`.

## Mesures (% d'un cœur : processus UI / WebKit principal / WebKit panneau ; images/s)
| Montage | UI | principal | panneau | images |
|---|---|---|---|---|
| (a) fenêtre séparée, défilement | 6,9 | 0,3 | 16,8 | 45, p99 38 ms |
| (b) webview enfant simple | 7,2 | 0,2 | 16,3 | 45, p99 36 ms |
| (c) GtkOverlay + GtkRevealer | 7,6 | 0,3 | 16,1 | 45, p99 34 ms |
| (c) build debug | 13,7 | 2,2 | 13,6 | idem |
| (c) sans rendu DMABuf | 8,9 | 0,2 | 19,2 | 49 |
| fermé, vidéos seules | 0,7 | 0,2 | 2,3 | — |
| fermé, un AudioContext muet | 5,7 | 2,0 | 13,6 | — |
| fermé, `about:blank` | 0,3 | 0,2 | 0 | — |
| repos, copie du fond Beams | **34,8** | **16,6** | — | — |

## Causes
1. **Le fond Beams** fait l'essentiel des ~39 % au repos : la couche `backdrop-filter: blur(50px)` plein
   écran dont l'opacité boucle sans fin (jamais en pause), plus les flous du canvas.
2. **La page Instagram cachée continue de tourner** : WebKitGTK ne suspend ni WebAudio ni les flux média
   (≈ 26 % et 770 Mo d'après la mesure en conditions proches).
3. **Le montage GTK n'est pas en cause** : accélération matérielle active, DMABuf actif, aucune variable
   `WEBKIT_*`/`GDK_GL` posée par wry/Tauri, l'enfant caché du revealer ne peint pas.
4. Le build debug (`tauri dev`) double le coût UI panneau ouvert.
5. 45 images/s (moitié de 90 Hz) dans les trois montages : limite WebKit. Gels non reproduits localement.

## Correctifs (par gain/coût)
1. Fond : retirer la couche animée `backdrop-filter`, rien dessiner fenêtre inactive — **appliqué**.
2. Décharger Instagram (`about:blank`) après 2 min fermé, recharger à l'ouverture — **appliqué**
   (coût : rechargement, position de défilement perdue).
3. Utiliser le build release au quotidien (−6 points UI panneau ouvert).
4. Sans effet mesurable : forcer l'accélération, `GDK_GL=always`, couper DMABuf, remplacer l'overlay.

Limites : `perf`/gdb bloqués sur l'app réelle (`perf_event_paranoid=4`, `ptrace_scope=1`) ; cause trouvée
par reproduction. Défilement réel d'Instagram à vérifier à la main.
