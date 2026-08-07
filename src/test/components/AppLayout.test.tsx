import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import React from 'react';
import { AppLayout } from '@/components/AppLayout';

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

vi.mock('@/hooks/useSessionManager', () => ({
  useSessionManager: vi.fn(),
}));

vi.mock('@/components/ui/app-navbar', () => ({
  AppNavbar: () => React.createElement('div', { 'data-testid': 'app-navbar' }),
}));

let currentPath = '';
function LocationSpy() {
  const location = useLocation();
  currentPath = location.pathname + location.search;
  return null;
}

function renderAppLayout(initialEntry = '/dashboard') {
  capturedAuthCallback = null;
  currentPath = '';

  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <LocationSpy />
      <Routes>
        <Route path="/auth" element={<div>Auth Page</div>} />
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<div>Dashboard Content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('AppLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a skeleton while auth state is loading', () => {
    const { queryByText, queryByTestId } = renderAppLayout();
    expect(queryByText('Dashboard Content')).not.toBeInTheDocument();
    expect(queryByTestId('app-navbar')).not.toBeInTheDocument();
  });

  it('redirects to /auth with a returnTo param when there is no session', async () => {
    renderAppLayout('/dashboard?foo=bar');

    await waitFor(() => expect(capturedAuthCallback).not.toBeNull());
    capturedAuthCallback!('INITIAL_SESSION', null);

    await waitFor(() => {
      expect(currentPath).toBe(`/auth?returnTo=${encodeURIComponent('/dashboard?foo=bar')}`);
    });
  });

  it('renders the outlet and navbar once a session is present', async () => {
    const { findByText, findByTestId } = renderAppLayout();

    await waitFor(() => expect(capturedAuthCallback).not.toBeNull());
    capturedAuthCallback!('INITIAL_SESSION', { user: { id: 'user-1' } });

    expect(await findByText('Dashboard Content')).toBeInTheDocument();
    expect(await findByTestId('app-navbar')).toBeInTheDocument();
  });
});
