import { useId } from "react";
import "./Logo.css";

/**
 * Atelier mark « Veilleuse » : a pendant dome lamp, half its bulb showing under the rim,
 * casting a cone and a pool of light. When `working`, it sways gently in 3D (activity indicator).
 * Geometry mirrored in design/logo.svg.
 */
export function Logo({ size, working = false }: { size: string | number; working?: boolean }) {
  const cone = useId();
  return (
    <span className={`logo${working ? " logo--working" : ""}`} style={{ width: size, height: size }} aria-hidden="true">
      <svg className="logo__svg" viewBox="0 0 64 64" width="100%" height="100%">
        <defs>
          <linearGradient id={cone} x1="0" y1="0" x2="0" y2="1">
            <stop className="logo__light" offset="0" stopOpacity="0.32" />
            <stop className="logo__light" offset="1" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M14 36.5h36l9 21H5Z" fill={`url(#${cone})`} />
        <ellipse className="logo__pool" cx="32" cy="57" rx="22" ry="3.5" />
        <circle className="logo__bulb" cx="32" cy="37" r="5.5" />
        <rect className="logo__shade" x="30.5" y="3" width="3" height="12" rx="1.5" />
        <path
          className="logo__shade"
          d="M9.6 34.2C10.3 21.9 19.6 13.6 32.3 13.8 44.6 14 53.8 22.3 54.4 34c.1 1.4-1 2.5-2.4 2.5H12c-1.4 0-2.5-1-2.4-2.3Z"
        />
        <path className="logo__sheen" d="M17.5 29.5c1.6-6.4 6.6-10.4 12.6-11" />
      </svg>
    </span>
  );
}
