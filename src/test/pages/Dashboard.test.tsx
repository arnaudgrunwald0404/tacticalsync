/**
 * Regression tests: Dashboard.tsx OAuth-callback handling after Phase 1
 * (consolidating its local onAuthStateChange subscription into the shared
 * AuthContext). Verifies the exact branch logic is preserved:
 * - No OAuth callback params in the URL -> immediate redirect to /commitments
 * - OAuth callback + session established via SIGNED_IN/INITIAL_SESSION -> /commitments
 * - OAuth callback + SIGNED_OUT or an error param -> /auth
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import Dashboard from '@/pages/Dashboard';
import { useAuth } from '@/contexts/AuthContext';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/hooks/useRoles', () => ({
  useRoles: () => ({ isSuperAdmin: false }),
}));

let currentPath = '';
function LocationSpy() {
  const location = useLocation();
  currentPath = location.pathname;
  return null;
}

function renderDashboard(windowUrl: string) {
  currentPath = '';
  // Dashboard.tsx reads window.location directly (to detect OAuth callback
  // params), independent of MemoryRouter's own virtual location, so it must
  // be set explicitly here rather than via initialEntries.
  window.history.pushState({}, '', windowUrl);
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <LocationSpy />
      <Routes>
        <Route path="/auth" element={<div>Auth Page</div>} />
        <Route path="/commitments" element={<div>Commitments Page</div>} />
        <Route path="/dashboard" element={<Dashboard />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Dashboard OAuth callback (Phase 1: shared AuthContext)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects immediately to /commitments when there is no OAuth callback in the URL', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null, session: null, loading: false, lastEvent: null, lastEventAt: 0, refresh: vi.fn(),
    });

    renderDashboard('/dashboard');

    await waitFor(() => expect(currentPath).toBe('/commitments'));
  });

  it('redirects to /commitments once the shared context reports INITIAL_SESSION with a session, during an OAuth callback', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'u1' } as never,
      session: { user: { id: 'u1' } } as never,
      loading: false,
      lastEvent: 'INITIAL_SESSION' as never,
      lastEventAt: Date.now(),
      refresh: vi.fn(),
    });

    renderDashboard('/dashboard?code=abc123');

    await waitFor(() => expect(currentPath).toBe('/commitments'));
  });

  it('redirects to /auth when the shared context reports SIGNED_OUT during an OAuth callback', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null, session: null, loading: false, lastEvent: 'SIGNED_OUT' as never, lastEventAt: Date.now(), refresh: vi.fn(),
    });

    renderDashboard('/dashboard?code=abc123');

    await waitFor(() => expect(currentPath).toBe('/auth'));
  });

  it('redirects to /auth when the URL carries an OAuth error, even without a SIGNED_OUT event', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null, session: null, loading: false, lastEvent: null, lastEventAt: 0, refresh: vi.fn(),
    });

    renderDashboard('/dashboard#error=access_denied');

    await waitFor(() => expect(currentPath).toBe('/auth'));
  });

  it('shows the "Completing sign in..." state while waiting, during an OAuth callback', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null, session: null, loading: false, lastEvent: null, lastEventAt: 0, refresh: vi.fn(),
    });

    const { getByText } = renderDashboard('/dashboard?code=abc123');
    expect(getByText('Completing sign in...')).toBeInTheDocument();
  });
});
