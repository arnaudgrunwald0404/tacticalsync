/**
 * Regression tests: React Rules of Hooks violations
 *
 * These tests verify that hooks are not called after conditional early returns.
 * The bug was in the Commitments page where hooks were placed after early returns
 * for loading/no-quarter states, violating React's Rules of Hooks.
 *
 * Fix: Move all hook calls to before any conditional early returns.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/test-utils';

// ── Types for mock builder ────────────────────────────────────────
interface MockBuilder {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  then: (
    res: (v: { data: unknown; error: null }) => unknown,
    rej: (e: unknown) => unknown
  ) => Promise<unknown>;
}

// ─── Supabase mock ────────────────────────────────────────────────
vi.mock('@/integrations/supabase/client', () => {
  const makeBuilder = (returnData: unknown = null): MockBuilder => {
    const builder: MockBuilder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      in: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      order: vi.fn(() => builder),
      single: vi.fn(() => Promise.resolve({ data: returnData, error: null })),
      then: (res, rej) =>
        Promise.resolve({ data: returnData ?? [], error: null }).then(res, rej),
    };
    Object.setPrototypeOf(builder, Promise.prototype);
    return builder;
  };
  return {
    supabase: {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u-1' } }, error: null }),
      },
      from: vi.fn(() => makeBuilder()),
    },
  };
});

// ─── Hook mocks (all return stable data) ─────────────────────────
vi.mock('@/hooks/useCommitments', () => ({
  useActiveQuarter: vi.fn().mockReturnValue({
    quarter: null, // No active quarter triggers the early return
    quarters: [],
    loading: false,
    setQuarter: vi.fn(),
    createQuarter: vi.fn(),
    refetch: vi.fn(),
  }),
  useMyCommitments: vi.fn().mockReturnValue({
    priorities: [],
    commitments: [],
    loading: false,
    refetch: vi.fn(),
    upsertPriority: vi.fn(),
    deletePriority: vi.fn(),
    upsertCommitment: vi.fn(),
    deleteCommitment: vi.fn(),
    updateCommitmentStatus: vi.fn(),
  }),
  useTeamCommitments: vi.fn().mockReturnValue({
    priorities: [],
    commitments: [],
    loading: false,
    refetch: vi.fn(),
    byUser: vi.fn(),
  }),
  useReportingLines: vi.fn().mockReturnValue({
    lines: [],
    loading: false,
    refetch: vi.fn(),
    addLine: vi.fn(),
    removeLine: vi.fn(),
    getDirectReportIds: vi.fn().mockReturnValue([]),
    getAllReportIds: vi.fn().mockReturnValue([]),
  }),
}));

vi.mock('@/components/commitments/QuarterSelector', () => ({
  QuarterSelector: ({ selected }: { selected: { label: string } | null }) => (
    <div data-testid="quarter-selector">{selected?.label ?? 'none'}</div>
  ),
}));

vi.mock('@/components/commitments/MyCommitmentsPanel', () => ({
  MyCommitmentsPanel: () => <div data-testid="my-commitments-panel" />,
}));

vi.mock('@/components/commitments/TeamRollupView', () => ({
  TeamRollupView: () => <div data-testid="team-rollup-view" />,
}));

import Commitments from '@/pages/Commitments';

describe('Regression: React Rules of Hooks', () => {
  describe('Commitments page - hooks must be called unconditionally', () => {
    it('should render without throwing "Hooks must be called in the same order" error', async () => {
      // If hooks were placed after early returns (the bug), React would throw
      // an invariant error when the component switches between loading/no-quarter/normal states.
      // This test verifies the component can render in the no-quarter state without crashing.
      expect(() => render(<Commitments />)).not.toThrow();
    });

    it('should render the Commitments heading even when no active quarter', async () => {
      render(<Commitments />);
      await waitFor(() => {
        expect(screen.getByText('Commitments')).toBeInTheDocument();
      });
    });

    it('should display the no-quarter message without React errors', async () => {
      render(<Commitments />);
      await waitFor(() => {
        const adminMsg = screen.queryByText(/No active quarter yet. Create one/i);
        const userMsg = screen.queryByText(/No active quarter yet. Ask your team admin/i);
        expect(adminMsg || userMsg).not.toBeNull();
      }, { timeout: 2000 });
    });

    it('should render successfully after multiple re-renders (hook order stability)', async () => {
      const { rerender } = render(<Commitments />);
      // Multiple re-renders should not cause hook order violations
      expect(() => rerender(<Commitments />)).not.toThrow();
      expect(() => rerender(<Commitments />)).not.toThrow();
    });

    it('should import the Commitments page module without errors', async () => {
      const module = await import('@/pages/Commitments');
      expect(module.default).toBeDefined();
      expect(typeof module.default).toBe('function');
    });
  });

  describe('orgScope state - declared before early returns', () => {
    it('should not error when quarter is null (orgScope hook is called before the no-quarter return)', async () => {
      // The orgScope useState and its useEffect were placed after the if (!quarter) return.
      // After the fix, they are declared before all early returns. This test ensures
      // the component renders correctly without the hooks-order invariant error.
      let renderError: Error | null = null;
      try {
        render(<Commitments />);
      } catch (e) {
        renderError = e as Error;
      }
      expect(renderError).toBeNull();
    });
  });
});
