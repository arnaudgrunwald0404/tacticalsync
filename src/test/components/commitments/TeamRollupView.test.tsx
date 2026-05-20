import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import { TeamRollupView } from '@/components/commitments/TeamRollupView';
import type {
  CommitmentQuarter,
  PersonalPriority,
  MonthlyCommitment,
  TeamReportingLine,
} from '@/types/commitments';

vi.mock('@/components/ui/fancy-avatar', () => ({
  default: ({ displayName }: { displayName: string }) => <span data-testid="avatar">{displayName}</span>,
}));

const makeQuarter = (overrides: Partial<CommitmentQuarter> = {}): CommitmentQuarter => ({
  id: 'q-1',
  team_id: 't-1',
  label: 'Q1 2026',
  start_date: '2026-01-01',
  end_date: '2026-03-31',
  status: 'active',
  created_by: 'u-1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

const makeMember = (id: string, full_name: string) => ({
  id,
  full_name,
  avatar_url: null,
  avatar_name: null,
});

const makePriority = (overrides: Partial<PersonalPriority> = {}): PersonalPriority => ({
  id: `p-${Math.random()}`,
  quarter_id: 'q-1',
  user_id: 'u-1',
  title: 'Priority title',
  description: null,
  status: 'draft',
  display_order: 1,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

const makeCommitment = (overrides: Partial<MonthlyCommitment> = {}): MonthlyCommitment => ({
  id: `c-${Math.random()}`,
  quarter_id: 'q-1',
  user_id: 'u-1',
  month_number: 1,
  title: 'Commitment title',
  description: null,
  status: 'draft',
  display_order: 1,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('TeamRollupView', () => {
  const quarter = makeQuarter();

  describe('empty state', () => {
    it('should show empty state message when no members', () => {
      render(
        <TeamRollupView
          quarter={quarter}
          members={[]}
          priorities={[]}
          commitments={[]}
        />
      );
      expect(screen.getByText(/No direct reports found/i)).toBeInTheDocument();
    });
  });

  describe('member cards', () => {
    it('should render a card for each member', () => {
      const members = [
        makeMember('u-1', 'Alice Smith'),
        makeMember('u-2', 'Bob Jones'),
      ];
      render(
        <TeamRollupView
          quarter={quarter}
          members={members}
          priorities={[]}
          commitments={[]}
        />
      );
      expect(screen.getAllByText('Alice Smith').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Bob Jones').length).toBeGreaterThan(0);
    });

    it('should show "No commitments yet" for members with no data', () => {
      render(
        <TeamRollupView
          quarter={quarter}
          members={[makeMember('u-1', 'Alice Smith')]}
          priorities={[]}
          commitments={[]}
        />
      );
      expect(screen.getByText('No commitments yet')).toBeInTheDocument();
    });

    it('should show priorities as full cards (always visible, not collapsed)', () => {
      const priorities = [makePriority({ user_id: 'u-1', title: 'Grow revenue' })];
      render(
        <TeamRollupView
          quarter={quarter}
          members={[makeMember('u-1', 'Alice Smith')]}
          priorities={priorities}
          commitments={[]}
        />
      );
      expect(screen.getByText('Grow revenue')).toBeInTheDocument();
      expect(screen.getByText('Q Priorities')).toBeInTheDocument();
    });

    it('should show monthly commitments collapsed by default and expand on click', async () => {
      const user = userEvent.setup();
      const commitments = [
        makeCommitment({ user_id: 'u-1', title: 'Launch feature', month_number: 1 }),
      ];
      render(
        <TeamRollupView
          quarter={quarter}
          members={[makeMember('u-1', 'Alice Smith')]}
          priorities={[]}
          commitments={commitments}
        />
      );
      expect(screen.queryByText('Launch feature')).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /Monthly Commitments/i }));
      expect(screen.getByText('Launch feature')).toBeInTheDocument();
      expect(screen.getByText('January')).toBeInTheDocument();
    });
  });

  describe('tree/org mode', () => {
    it('should render members in hierarchical order when reportingLines provided', () => {
      const members = [
        makeMember('u-1', 'Manager'),
        makeMember('u-2', 'Report'),
      ];
      const reportingLines: TeamReportingLine[] = [{
        id: 'rl-1',
        team_id: 't-1',
        manager_id: 'u-1',
        report_id: 'u-2',
        created_at: '2026-01-01T00:00:00Z',
      }];
      render(
        <TeamRollupView
          quarter={quarter}
          members={members}
          priorities={[]}
          commitments={[]}
          currentUserId="u-1"
          reportingLines={reportingLines}
        />
      );
      expect(screen.getAllByText('Manager').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Report').length).toBeGreaterThan(0);
    });
  });

  describe('commitment status dots', () => {
    it('should render status dot for each commitment', () => {
      const commitments = [
        makeCommitment({ user_id: 'u-1', status: 'done' }),
        makeCommitment({ user_id: 'u-1', status: 'not_done' }),
      ];
      const { container } = render(
        <TeamRollupView
          quarter={quarter}
          members={[makeMember('u-1', 'Alice')]}
          priorities={[]}
          commitments={commitments}
        />
      );
      expect(container.querySelector('.bg-green-500')).toBeInTheDocument();
      expect(container.querySelector('.bg-red-500')).toBeInTheDocument();
    });
  });
});
