import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/bricolage-grotesque/latin-400.css";
import "@fontsource/bricolage-grotesque/latin-500.css";
import "@fontsource/bricolage-grotesque/latin-700.css";
import "@fontsource/bricolage-grotesque/latin-800.css";
import "@fontsource/fragment-mono/latin-400.css";
import "../design/tokens.css";
import "./index.css";
import "./ui/base.css";
import { getTheme, setTheme } from "./ui/theme";
import App from "./App";

// Ambient loops (logo sway, welcome halo) pause while the window is hidden or unfocused.
const idle = () => document.documentElement.toggleAttribute("data-idle", document.hidden || !document.hasFocus());
window.addEventListener("blur", idle);
window.addEventListener("focus", idle);
document.addEventListener("visibilitychange", idle);

// Apply the saved theme before the first render (no flash).
setTheme(getTheme());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
