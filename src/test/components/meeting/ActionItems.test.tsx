import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@/test/test-utils';
import ActionItems from '@/components/meeting/ActionItems';
import { supabase } from '@/integrations/supabase/client';
import * as MeetingContextModule from '@/contexts/MeetingContext';
import type { ActionItem } from '@/types/action-items';
import type { DOHashtagOption } from '@/types/rcdo';
import type { ActiveInitiative } from '@/hooks/useActiveInitiatives';

// This suite covers the gap identified in the RCDO hashtag-integration audit:
// the meeting Action Items compose surface previously had no way to link an
// action item to a Defining Objective / Strategic Initiative at all (unlike
// meeting priorities, which already wrote to rc_links). These tests verify
// the read-back half (an existing rc_links row renders as a badge on the
// item) since driving the Radix Select to make a *new* selection is flaky
// under jsdom (see the skipped tests in SIPanelContent.test.tsx for the same
// limitation elsewhere in this codebase).
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
  },
}));

vi.mock('@/contexts/MeetingContext', async () => {
  const actual = await vi.importActual<typeof MeetingContextModule>('@/contexts/MeetingContext');
  return {
    ...actual,
    useMeetingContext: vi.fn(),
  };
});

const mockedSupabase = supabase as unknown as {
  auth: { getUser: ReturnType<typeof vi.fn> };
  from: ReturnType<typeof vi.fn>;
};

const mockedUseMeetingContext = MeetingContextModule.useMeetingContext as unknown as ReturnType<typeof vi.fn>;

const makeItem = (overrides: Partial<ActionItem> = {}): ActionItem => ({
  id: 'action-1',
  series_id: 'series-1',
  title: 'Follow up with legal',
  notes: '',
  assigned_to: null,
  due_date: null,
  completion_status: 'not_completed',
  order_index: 0,
  created_by: 'user-1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

const activeDOs: DOHashtagOption[] = [
  { id: 'do-1', title: 'Grow enterprise revenue', status: 'active', health: 'on_track' },
];
const activeSIs: ActiveInitiative[] = [
  { id: 'si-1', title: 'Launch partner program', doId: 'do-1', doTitle: 'Grow enterprise revenue', status: 'on_track' },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockedUseMeetingContext.mockReturnValue({
    teamId: 'team-1',
    currentUserId: 'user-1',
    isSuperAdmin: false,
    isTeamAdmin: false,
    teamMembers: [],
    memberNames: new Map(),
    loading: false,
    refetch: vi.fn(),
  });
  mockedSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
});

describe('MeetingActionItems — strategy linking', () => {
  it('shows a DO badge next to an action item that is already linked via rc_links', async () => {
    mockedSupabase.from.mockImplementation((table: string) => {
      if (table === 'rc_links') {
        return {
          select: () => ({
            eq: () => ({
              in: () =>
                Promise.resolve({
                  data: [{ parent_type: 'do', parent_id: 'do-1', ref_id: 'action-1' }],
                  error: null,
                }),
            }),
          }),
        };
      }
      return { select: () => ({ eq: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) }) };
    });

    render(
      <ActionItems
        items={[makeItem()]}
        meetingId="series-1"
        teamId="team-1"
        onUpdate={vi.fn()}
        activeDOs={activeDOs}
        activeSIs={activeSIs}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Grow enterprise revenue')).toBeInTheDocument();
    });
    expect(screen.getByText('Follow up with legal')).toBeInTheDocument();
  });

  it('shows an SI badge next to an action item linked to a Strategic Initiative', async () => {
    mockedSupabase.from.mockImplementation((table: string) => {
      if (table === 'rc_links') {
        return {
          select: () => ({
            eq: () => ({
              in: () =>
                Promise.resolve({
                  data: [{ parent_type: 'initiative', parent_id: 'si-1', ref_id: 'action-1' }],
                  error: null,
                }),
            }),
          }),
        };
      }
      return { select: () => ({ eq: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) }) };
    });

    render(
      <ActionItems
        items={[makeItem()]}
        meetingId="series-1"
        teamId="team-1"
        onUpdate={vi.fn()}
        activeDOs={activeDOs}
        activeSIs={activeSIs}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Launch partner program')).toBeInTheDocument();
    });
  });

  it('renders no strategy badge when the action item has no rc_links row', async () => {
    mockedSupabase.from.mockImplementation(() => ({
      select: () => ({ eq: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) }),
    }));

    render(
      <ActionItems
        items={[makeItem()]}
        meetingId="series-1"
        teamId="team-1"
        onUpdate={vi.fn()}
        activeDOs={activeDOs}
        activeSIs={activeSIs}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Follow up with legal')).toBeInTheDocument();
    });
    expect(screen.queryByText('Grow enterprise revenue')).not.toBeInTheDocument();
    expect(screen.queryByText('Launch partner program')).not.toBeInTheDocument();
  });

  it('renders the "Link to Strategy" selector in the new-item form so DOs/SIs are selectable when creating an action item', async () => {
    mockedSupabase.from.mockImplementation(() => ({
      select: () => ({ eq: () => ({ in: () => Promise.resolve({ data: [], error: null }) }) }),
    }));

    render(
      <ActionItems
        items={[]}
        meetingId="series-1"
        teamId="team-1"
        onUpdate={vi.fn()}
        activeDOs={activeDOs}
        activeSIs={activeSIs}
      />
    );

    await waitFor(() => {
      expect(
        screen.getAllByLabelText('Link to Defining Objective or Strategic Initiative').length
      ).toBeGreaterThan(0);
    });
  });
});
