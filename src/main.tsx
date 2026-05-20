import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Auto-reload once when a lazy chunk fails to load (stale deploy cache)
window.addEventListener("vite:preloadError", () => {
  const reloaded = sessionStorage.getItem("chunk-reload");
  if (!reloaded) {
    sessionStorage.setItem("chunk-reload", "1");
    window.location.reload();
  }
});

createRoot(document.getElementById("root")!).render(<App />);
