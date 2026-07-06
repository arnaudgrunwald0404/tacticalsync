import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import { startOfWeek, addDays } from 'date-fns';
import { OneOnOnesView, type UpcomingOneOnOneEvent } from '@/components/cos/OneOnOnesView';

// Regression test: the search box in the 1:1s calendar view (shared by
// /inbox/meetings and /chief-of-staff) used to compute filtered event lists
// that were never passed to CalendarWeekView, so typing had zero effect on
// the grid. These tests pin the fix: search now filters the events rendered
// in the week grid, and a no-results search shows an explicit empty state
// instead of a silently blank grid.

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: null } })),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
    })),
  },
}));

// Tuesday of the real current week — computed relative to actual "now" (rather
// than a fixed/faked date) so it always falls inside CalendarWeekView's default
// (current-week) view without needing fake timers, which conflict with
// userEvent's internal scheduling.
const EVENT_DAY = addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), 1);

function makeEvent(overrides: Partial<UpcomingOneOnOneEvent> & { id: string }): UpcomingOneOnOneEvent {
  const start = new Date(EVENT_DAY);
  start.setHours(10, 0, 0, 0);
  const end = new Date(start.getTime() + 30 * 60_000);
  return {
    id: overrides.id,
    google_event_id: `g-${overrides.id}`,
    team_member_id: null,
    team_member: null,
    attendee_name: null,
    attendee_email: null,
    inferred_category: 'peer',
    title: null,
    start_time: start.toISOString(),
    end_time: end.toISOString(),
    status: 'confirmed',
    prep_available: false,
    recurring_event_id: null,
    attendee_count: 1,
    ...overrides,
  };
}

describe('OneOnOnesView search filtering', () => {
  function setup(events: UpcomingOneOnOneEvent[]) {
    return render(
      <OneOnOnesView
        members={[]}
        loadingPrep={false}
        loadingInitial={false}
        onViewPrep={vi.fn()}
        upcomingEvents={events}
        pastEvents={[]}
        calendarConnected
        lastSyncAt={null}
        syncing={false}
        onSyncCalendar={vi.fn()}
      />,
    );
  }

  it('shows all events on the grid when the search box is empty', () => {
    setup([
      makeEvent({ id: 'e1', attendee_name: 'Alice Anderson' }),
      makeEvent({ id: 'e2', attendee_name: 'Bob Baker' }),
    ]);
    expect(screen.getByText('Alice Anderson')).toBeInTheDocument();
    expect(screen.getByText('Bob Baker')).toBeInTheDocument();
  });

  it('filters the calendar grid down to matching events as the user types', async () => {
    const user = userEvent.setup({ delay: null });
    setup([
      makeEvent({ id: 'e1', attendee_name: 'Alice Anderson' }),
      makeEvent({ id: 'e2', attendee_name: 'Bob Baker' }),
    ]);

    await user.type(screen.getByPlaceholderText('Quick search...'), 'alice');

    expect(screen.getByText('Alice Anderson')).toBeInTheDocument();
    expect(screen.queryByText('Bob Baker')).not.toBeInTheDocument();
  });

  it('shows a "no matches" empty state instead of a blank grid when nothing matches', async () => {
    const user = userEvent.setup({ delay: null });
    setup([makeEvent({ id: 'e1', attendee_name: 'Alice Anderson' })]);

    await user.type(screen.getByPlaceholderText('Quick search...'), 'zzz-no-such-person');

    expect(screen.queryByText('Alice Anderson')).not.toBeInTheDocument();
    expect(screen.getByText(/No matches for "zzz-no-such-person"/i)).toBeInTheDocument();
  });
});
