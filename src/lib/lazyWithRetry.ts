import { lazy } from "react";

type ComponentModule = { default: React.ComponentType<unknown> };

const RELOAD_KEY = "chunk-retry-reload";

export function lazyWithRetry(
  importFn: () => Promise<ComponentModule>
) {
  return lazy(() =>
    importFn().catch(() => {
      const hasReloaded = sessionStorage.getItem(RELOAD_KEY);
      if (!hasReloaded) {
        sessionStorage.setItem(RELOAD_KEY, "1");
        window.location.reload();
        return new Promise<ComponentModule>(() => {});
      }
      sessionStorage.removeItem(RELOAD_KEY);
      return importFn();
    })
  );
}
