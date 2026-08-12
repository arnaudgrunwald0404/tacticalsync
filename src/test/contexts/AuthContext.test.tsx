import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthProvider, useCurrentUser, useAuth } from '@/contexts/AuthContext';

type AuthCallback = (event: string, session: unknown) => void;
let capturedAuthCallback: AuthCallback | null = null;
const unsubscribe = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn((cb: AuthCallback) => {
        capturedAuthCallback = cb;
        return { data: { subscription: { unsubscribe } } };
      }),
    },
  },
}));

function Consumer() {
  const { user, loading } = useCurrentUser();
  const { lastEvent } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user-id">{user?.id ?? 'none'}</span>
      <span data-testid="last-event">{lastEvent ?? 'none'}</span>
    </div>
  );
}

describe('AuthProvider / useCurrentUser / useAuth', () => {
  beforeEach(() => {
    capturedAuthCallback = null;
    vi.clearAllMocks();
  });

  it('starts in a loading state until the first auth event fires', () => {
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );

    expect(screen.getByTestId('loading').textContent).toBe('true');
    expect(screen.getByTestId('user-id').textContent).toBe('none');
  });

  it('exposes the user once INITIAL_SESSION fires with a session', async () => {
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );

    await waitFor(() => expect(capturedAuthCallback).not.toBeNull());

    capturedAuthCallback!('INITIAL_SESSION', { user: { id: 'user-1' } });

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
      expect(screen.getByTestId('user-id').textContent).toBe('user-1');
      expect(screen.getByTestId('last-event').textContent).toBe('INITIAL_SESSION');
    });
  });

  it('clears the user on SIGNED_OUT', async () => {
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );

    await waitFor(() => expect(capturedAuthCallback).not.toBeNull());

    capturedAuthCallback!('INITIAL_SESSION', { user: { id: 'user-1' } });
    await waitFor(() => expect(screen.getByTestId('user-id').textContent).toBe('user-1'));

    capturedAuthCallback!('SIGNED_OUT', null);
    await waitFor(() => {
      expect(screen.getByTestId('user-id').textContent).toBe('none');
      expect(screen.getByTestId('last-event').textContent).toBe('SIGNED_OUT');
    });
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );

    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
