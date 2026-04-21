/**
 * Regression tests: Password reset auth flow
 *
 * Verifies that PASSWORD_RECOVERY events are handled correctly in Auth.tsx:
 * - PASSWORD_RECOVERY → navigate to /reset-password (NOT /dashboard)
 * - SIGNED_IN → navigate to /dashboard as normal
 *
 * Regression for: clicking password reset email link auto-logged the user in
 * instead of showing the "set new password" form.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import Auth from '@/pages/Auth';

// Capture the onAuthStateChange callback so we can fire events in tests
type AuthCallback = (event: string, session: unknown) => void;
let capturedAuthCallback: AuthCallback | null = null;

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn((cb: AuthCallback) => {
        capturedAuthCallback = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
    },
  },
}));

// Prevent useSessionManager from interfering with navigation in tests
vi.mock('@/hooks/useSessionManager', () => ({
  useSessionManager: vi.fn(),
}));

// Minimal mocks for heavy UI deps that don't affect auth logic
vi.mock('@/components/Logo', () => ({
  default: () => React.createElement('div', { 'data-testid': 'logo' }),
}));
vi.mock('@/components/ui/grid-background', () => ({
  default: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
}));
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) =>
      React.createElement('div', props, children),
  },
  AnimatePresence: ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

// Tracks current pathname so tests can assert navigation occurred
let currentPath = '/auth';
function LocationSpy() {
  const location = useLocation();
  currentPath = location.pathname;
  return null;
}

function renderAuthPage() {
  capturedAuthCallback = null;
  currentPath = '/auth';

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/auth']}>
        <LocationSpy />
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route path="/reset-password" element={<div>Reset Password Page</div>} />
          <Route path="/dashboard" element={<div>Dashboard Page</div>} />
          <Route path="/join/:code" element={<div>Join Page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Regression: PASSWORD_RECOVERY should not auto-login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('navigates to /reset-password on PASSWORD_RECOVERY event', async () => {
    renderAuthPage();

    await waitFor(() => {
      expect(capturedAuthCallback).not.toBeNull();
    });

    // Simulate the event Supabase fires when a recovery link is clicked
    capturedAuthCallback!('PASSWORD_RECOVERY', { user: { id: 'u1' } });

    await waitFor(() => {
      expect(currentPath).toBe('/reset-password');
    });
  });

  it('navigates to /dashboard on SIGNED_IN event (normal login)', async () => {
    renderAuthPage();

    await waitFor(() => {
      expect(capturedAuthCallback).not.toBeNull();
    });

    capturedAuthCallback!('SIGNED_IN', { user: { id: 'u1' } });

    await waitFor(() => {
      expect(currentPath).toBe('/dashboard');
    });
  });

  it('does NOT navigate to /dashboard on PASSWORD_RECOVERY event', async () => {
    renderAuthPage();

    await waitFor(() => {
      expect(capturedAuthCallback).not.toBeNull();
    });

    capturedAuthCallback!('PASSWORD_RECOVERY', { user: { id: 'u1' } });

    await waitFor(() => {
      expect(currentPath).not.toBe('/dashboard');
    });
  });
});
