import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Dev-only: attach window.__devSignInAsTestUser so preview/preview_eval can drive an
// authenticated session for verification. import.meta.env.DEV gates this so the prod
// bundle never includes the credentials. Wrapped in import() to keep the dev path off
// the prod module graph entirely.
if (import.meta.env.DEV) {
  import("./dev/test-user").catch(() => {
    // The dev/test-user file is gitignored; missing it shouldn't break dev startup.
  });
}

// Auto-reload once when a lazy chunk fails to load (stale deploy cache)
window.addEventListener("vite:preloadError", () => {
  const reloaded = sessionStorage.getItem("chunk-reload");
  if (!reloaded) {
    sessionStorage.setItem("chunk-reload", "1");
    window.location.reload();
  }
});

createRoot(document.getElementById("root")!).render(<App />);
