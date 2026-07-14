import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { LinkedMeetingItems } from '@/components/rcdo/LinkedMeetingItems';
import type { RCLinkWithDetails } from '@/types/rcdo';

const makeLink = (overrides: Partial<RCLinkWithDetails> = {}): RCLinkWithDetails => ({
  id: 'link-1',
  parent_type: 'do',
  parent_id: 'do-1',
  kind: 'meeting_priority',
  ref_id: 'priority-1',
  created_by: 'user-1',
  created_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('LinkedMeetingItems', () => {
  it('shows a loading state', () => {
    render(<LinkedMeetingItems links={[]} loading />);
    expect(screen.getByTestId('linked-meeting-items-loading')).toBeInTheDocument();
  });

  it('shows an empty message when there are no meeting_priority/action_item links', () => {
    render(<LinkedMeetingItems links={[]} />);
    expect(screen.getByTestId('linked-meeting-items-empty')).toBeInTheDocument();
    expect(
      screen.getByText('Not linked to any meeting priorities or action items yet.')
    ).toBeInTheDocument();
  });

  it('uses a custom empty message when provided', () => {
    render(<LinkedMeetingItems links={[]} emptyMessage="Custom empty message" />);
    expect(screen.getByText('Custom empty message')).toBeInTheDocument();
  });

  it('renders a linked meeting priority with its title and meeting name', () => {
    const links = [
      makeLink({
        linked_item: { title: 'Ship the onboarding flow', meeting_name: 'Weekly Sync' },
      }),
    ];

    render(<LinkedMeetingItems links={links} />);

    expect(screen.getByTestId('linked-meeting-items')).toBeInTheDocument();
    expect(screen.getByText('Ship the onboarding flow')).toBeInTheDocument();
    expect(screen.getByText('Weekly Sync')).toBeInTheDocument();
    expect(screen.getByText('Meeting Priority')).toBeInTheDocument();
  });

  it('renders a linked action item with the Action Item badge', () => {
    const links = [
      makeLink({
        id: 'link-2',
        kind: 'action_item',
        ref_id: 'action-1',
        linked_item: { title: 'Follow up with legal', meeting_name: 'Leadership Sync' },
      }),
    ];

    render(<LinkedMeetingItems links={links} />);

    expect(screen.getByText('Follow up with legal')).toBeInTheDocument();
    expect(screen.getByText('Action Item')).toBeInTheDocument();
  });

  it('ignores link kinds that are not meeting_priority or action_item', () => {
    const links = [makeLink({ kind: 'jira', ref_id: 'jira-1' })];
    render(<LinkedMeetingItems links={links} />);
    expect(screen.getByTestId('linked-meeting-items-empty')).toBeInTheDocument();
  });

  it('falls back to "Untitled item" when linked_item details are missing', () => {
    const links = [makeLink({ linked_item: undefined })];
    render(<LinkedMeetingItems links={links} />);
    expect(screen.getByText('Untitled item')).toBeInTheDocument();
  });
});
