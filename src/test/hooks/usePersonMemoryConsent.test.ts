import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { usePersonMemoryConsent } from '@/hooks/usePersonMemoryConsent';

// Idea #7 (Relationship memory) — PLAN_idea7_relationship_memory.md §7a.4.
// Acceptance criterion: the consent modal is shown before the user's first
// person-page view or first received brief — not after — and only once.

let mockSeenAt: string | null = null;
const upsertSpy = vi.fn((row: { user_id: string; person_memory_consent_seen_at: string }) => {
  mockSeenAt = row.person_memory_consent_seen_at;
  return Promise.resolve({ data: null, error: null });
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve({ data: { person_memory_consent_seen_at: mockSeenAt } })),
        })),
      })),
      upsert: upsertSpy,
    })),
  },
}));

describe('usePersonMemoryConsent', () => {
  beforeEach(() => {
    mockSeenAt = null;
    upsertSpy.mockClear();
  });

  it('does not show the modal while still loading (avoids a flash-open)', () => {
    // Asserts against the hook's very first synchronous render, before the
    // mocked async load resolves — intentionally not awaited. React Testing
    // Library logs an act() warning here because the mock's promise resolves
    // on a later microtask than this assertion; that's expected and benign
    // for this specific "what does the very first render look like" check.
    const { result } = renderHook(() => usePersonMemoryConsent('user-1'));
    expect(result.current.shouldShow).toBe(false);
    expect(result.current.loading).toBe(true);
  });

  it('shows the modal once loaded when person_memory_consent_seen_at is null (never acknowledged)', async () => {
    mockSeenAt = null;
    const { result } = renderHook(() => usePersonMemoryConsent('user-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.shouldShow).toBe(true);
  });

  it('does not show the modal once already acknowledged', async () => {
    mockSeenAt = '2026-07-01T00:00:00.000Z';
    const { result } = renderHook(() => usePersonMemoryConsent('user-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.shouldShow).toBe(false);
  });

  it('acknowledge() upserts a timestamp and immediately hides the modal', async () => {
    mockSeenAt = null;
    const { result } = renderHook(() => usePersonMemoryConsent('user-1'));
    await waitFor(() => expect(result.current.shouldShow).toBe(true));

    await act(async () => {
      await result.current.acknowledge();
    });

    expect(upsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-1', person_memory_consent_seen_at: expect.any(String) }),
      expect.objectContaining({ onConflict: 'user_id' }),
    );
    expect(result.current.shouldShow).toBe(false);
  });

  it('never shows the modal when there is no user', () => {
    const { result } = renderHook(() => usePersonMemoryConsent(null));
    expect(result.current.shouldShow).toBe(false);
  });
});
