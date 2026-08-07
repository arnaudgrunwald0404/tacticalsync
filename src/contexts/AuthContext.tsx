import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { User, Session, AuthChangeEvent } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  lastEvent: AuthChangeEvent | null;
  lastEventAt: number;
}

interface AuthContextValue extends AuthState {
  refresh: () => Promise<void>;
}

const initialState: AuthState = {
  user: null,
  session: null,
  loading: true,
  lastEvent: null,
  lastEventAt: 0,
};

export const AuthContext = createContext<AuthContextValue>({
  ...initialState,
  refresh: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(initialState);

  useEffect(() => {
    // supabase-js v2 fires an initial INITIAL_SESSION event right after
    // subscribing, so this single subscription also covers the "get the
    // current session on mount" case — no separate getSession() call needed.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setState({
        user: session?.user ?? null,
        session,
        loading: false,
        lastEvent: event,
        lastEventAt: Date.now(),
      });
    });

    return () => subscription.unsubscribe();
  }, []);

  const refresh = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    setState((s) => ({ ...s, user: session?.user ?? null, session, loading: false }));
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

/** Primary hook for the common case: reading the current user's identity. */
export function useCurrentUser() {
  const { user, loading } = useContext(AuthContext);
  return { user, loading };
}

/** Full auth state, for consumers that need session/event-transition details. */
export function useAuth() {
  return useContext(AuthContext);
}
