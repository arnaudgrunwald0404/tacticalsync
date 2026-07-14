import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/test-utils';
import userEvent from '@testing-library/user-event';
import { MyOneOnOneTodosPanel } from '@/components/cos/MyOneOnOneTodosPanel';
import type { CosTeamMember } from '@/pages/ChiefOfStaff';
import { useMyOneOnOneTodos } from '@/hooks/useMyOneOnOneTodos';

vi.mock('@/hooks/useMyOneOnOneTodos', () => ({
  useMyOneOnOneTodos: vi.fn(),
}));

const mockedUseMyOneOnOneTodos = vi.mocked(useMyOneOnOneTodos);

// TODO.md item 7 (critical): the "My 1:1 To-Dos" panel is the single place a
// manager sees every "to-do for me" across all their one-on-ones, instead of
// having to open each person's prep drawer one at a time. These tests pin the
// empty state, the per-person grouping, the overdue badge, and that clicking
// a person's group header jumps into their prep drawer (via onOpenPrep).

const members: CosTeamMember[] = [
  {
    id: 'm1', user_id: 'u1', name: 'Jamie Lee', email: 'jamie@example.com', role: 'Engineer',
    relationship_type: 'direct_report', context_notes: null, last_1on1_date: null, reports_to_id: null,
  },
  {
    id: 'm2', user_id: 'u2', name: 'Sam Rivera', email: 'sam@example.com', role: 'PM',
    relationship_type: 'collaborator', context_notes: null, last_1on1_date: null, reports_to_id: null,
  },
];

function mockHook(overrides: Partial<ReturnType<typeof useMyOneOnOneTodos>>) {
  mockedUseMyOneOnOneTodos.mockReturnValue({
    todos: [],
    groupedByMember: [],
    overdueCount: 0,
    loading: false,
    refetch: vi.fn(),
    markDone: vi.fn(),
    ...overrides,
  });
}

describe('MyOneOnOneTodosPanel', () => {
  it('shows a caught-up empty state when there are no open to-dos', () => {
    mockHook({});
    render(<MyOneOnOneTodosPanel members={members} onOpenPrep={vi.fn()} />);
    expect(screen.getByText(/you're all caught up/i)).toBeInTheDocument();
  });

  it('groups to-dos by member and renders each person once', () => {
    mockHook({
      groupedByMember: [
        {
          memberId: 'm1', memberName: 'Jamie Lee', relationshipType: 'direct_report',
          todos: [
            { id: 't1', text: 'Send the doc', due_date: null, created_at: '2026-07-01T00:00:00Z', member_id: 'm1', member_name: 'Jamie Lee', member_relationship_type: 'direct_report' },
          ],
        },
        {
          memberId: 'm2', memberName: 'Sam Rivera', relationshipType: 'collaborator',
          todos: [
            { id: 't2', text: 'Intro to design', due_date: null, created_at: '2026-07-01T00:00:00Z', member_id: 'm2', member_name: 'Sam Rivera', member_relationship_type: 'collaborator' },
          ],
        },
      ],
    });
    render(<MyOneOnOneTodosPanel members={members} onOpenPrep={vi.fn()} />);
    expect(screen.getByText('Jamie Lee')).toBeInTheDocument();
    expect(screen.getByText('Sam Rivera')).toBeInTheDocument();
    expect(screen.getByText('Send the doc')).toBeInTheDocument();
    expect(screen.getByText('Intro to design')).toBeInTheDocument();
  });

  it('shows the overdue badge count when overdueCount > 0', () => {
    mockHook({
      overdueCount: 2,
      groupedByMember: [{
        memberId: 'm1', memberName: 'Jamie Lee', relationshipType: 'direct_report',
        todos: [
          { id: 't1', text: 'Overdue thing', due_date: '2000-01-01', created_at: '2026-07-01T00:00:00Z', member_id: 'm1', member_name: 'Jamie Lee', member_relationship_type: 'direct_report' },
        ],
      }],
    });
    render(<MyOneOnOneTodosPanel members={members} onOpenPrep={vi.fn()} />);
    expect(screen.getByText('2 overdue')).toBeInTheDocument();
  });

  it('opens the matching member\'s prep drawer when a group header is clicked', async () => {
    const onOpenPrep = vi.fn();
    mockHook({
      groupedByMember: [{
        memberId: 'm2', memberName: 'Sam Rivera', relationshipType: 'collaborator',
        todos: [
          { id: 't2', text: 'Intro to design', due_date: null, created_at: '2026-07-01T00:00:00Z', member_id: 'm2', member_name: 'Sam Rivera', member_relationship_type: 'collaborator' },
        ],
      }],
    });
    render(<MyOneOnOneTodosPanel members={members} onOpenPrep={onOpenPrep} />);

    await userEvent.click(screen.getByText(/open prep/i));
    expect(onOpenPrep).toHaveBeenCalledWith(members[1]);
  });
});
