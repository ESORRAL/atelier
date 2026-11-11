# Recherche — 3D et mouvement sobres (TASK-021, novembre 2026)

Références consultées ; idées reprises, aucun asset ni code copié.

1. Lummi, « UI trends 2026 » — https://staticpages.lummi.ai/blog/ui-trends-2026
   Le plat redevient profond : ombres, matière, petits détails 3D, sans surcharge.
2. Pixelmatters, « UI design trends » — https://pixelmatters.com/insights/7-UI-design-trends-to-watch-in-2026
   Comportements optiques (lumière, profondeur) qui répondent au contexte : notre halo qui suit le pointeur.
3. Tubik, « UI design trends 2026 » — https://blog.tubikstudio.com/ui-design-trends-2026
   Mouvement rapide, discret, porteur de sens plutôt que décoratif : une seule boucle visible à la fois.
4. jvinhit, « CSS 3D : interactive tilt and parallax » — https://jvinhit.github.io/blog/css-3d-03-interactive-tilt-and-parallax/
   Écrire la position du pointeur dans deux variables CSS, sans état React : aucun rendu par mouvement.
5. Frontend Masters, « The Deep Card Conundrum » — https://frontendmasters.com/blog/?p=7957
   `overflow`/`opacity` aplatissent le contexte 3D : perspective portée par l'élément lui-même.
6. Motion, « 3D transforms » — https://motion.dev/docs/3d-transforms
   Petits angles (≤ 10°), perspective courte pour les petits objets, longue pour les panneaux.
7. Figma, aide « Shaders » — https://help.figma.com/hc/en-us/articles/41159710233623
   Décrire la lumière (« une lueur douce qui s'estompe vers les bords ») plutôt que la technique : notre `--glow-orb`.
8. Framer, « AI Orb Lab » — https://www.framer.com/marketplace/components/ai-orb-lab/
   L'orbe IA en WebGL est devenu un cliché : on garde une lampe en CSS, propre à l'atelier.

Conclusion : pas de WebGL. Trois effets CSS (transform/opacity) qui prolongent la lampe
de « Veilleuse » : la lampe qui se balance pendant le travail, le halo qui respire à
l'accueil avec un léger parallaxe, l'entrée inclinée des messages.
