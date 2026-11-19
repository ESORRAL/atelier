/** "Aucune confirmation": asked once when it is switched on, never again for what Claude does afterwards. */
export const BYPASS = "bypassPermissions";
export const confirmBypass = () =>
  window.confirm(
    "Aucune confirmation : Claude pourra modifier, supprimer ou envoyer n'importe quoi sans rien te demander, " +
      "y compris sur la consigne cachée d'une page web ou d'une note qu'il lit.\n\nActiver ce mode ?",
  );

/** Reasoning effort levels (Claude Code's `effort`); "" = the model's own default. Session-only, nothing written to the user's settings. */
export const EFFORTS: [string, string][] = [
  ["", "Effort par défaut"],
  ["low", "Effort faible"],
  ["medium", "Effort moyen"],
  ["high", "Effort élevé"],
  ["xhigh", "Effort très élevé"],
  ["max", "Effort maximum"],
];

/** Models offered before a session exists (the welcome screen); the same aliases as Réglages. "" = Claude Code's own default. */
export const START_MODELS: [string, string][] = [
  ["", "Modèle par défaut"],
  ["opus", "Opus"],
  ["sonnet", "Sonnet"],
  ["haiku", "Haiku"],
  ["fable", "Fable"],
];
