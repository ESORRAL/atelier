import "./Logo.css";

/**
 * Atelier mark: a capital « A » in the accent colour. When `working`, it turns gently in 3D
 * (the activity indicator, and the only continuous motion in the top bar).
 */
export function Logo({ size, working = false }: { size: string | number; working?: boolean }) {
  return (
    <span className={`logo${working ? " logo--working" : ""}`} style={{ height: size, fontSize: size }} aria-hidden="true">
      <span className="logo__glyph">A</span>
    </span>
  );
}
