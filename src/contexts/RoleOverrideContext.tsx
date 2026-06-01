import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';

export type OverrideRole = 'admin' | 'member' | null;

interface RoleOverrideState {
  override: OverrideRole;
  setOverride: (role: OverrideRole) => void;
  isOverriding: boolean;
}

const RoleOverrideContext = createContext<RoleOverrideState>({
  override: null,
  setOverride: () => {},
  isOverriding: false,
});

const STORAGE_KEY = 'ts_role_override';

export function RoleOverrideProvider({ children }: { children: ReactNode }) {
  const [override, setOverrideState] = useState<OverrideRole>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'admin' || stored === 'member' ? stored : null;
  });

  const setOverride = useCallback((role: OverrideRole) => {
    setOverrideState(role);
    if (role) {
      localStorage.setItem(STORAGE_KEY, role);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        const v = e.newValue;
        setOverrideState(v === 'admin' || v === 'member' ? v : null);
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  return (
    <RoleOverrideContext.Provider value={{ override, setOverride, isOverriding: override !== null }}>
      {children}
    </RoleOverrideContext.Provider>
  );
}

export function useRoleOverride() {
  return useContext(RoleOverrideContext);
}
