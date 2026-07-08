import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test/test-utils';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PersonBriefDetail } from '@/components/inbox/PersonBriefDetail';
import type { PersonBriefPayload } from '@/types/inbox';

// Idea #7 (Relationship memory) — PLAN_idea7_relationship_memory.md §7a.2.
// Acceptance criterion: every person_brief inbox item has a discoverable
// explanation of "what changed" and "suggested talking points" containing
// no ML/algorithm jargon.

function renderBrief(brief: PersonBriefPayload) {
  return render(
    <TooltipProvider>
      <PersonBriefDetail brief={brief} />
    </TooltipProvider>,
  );
}

const BASE_BRIEF: PersonBriefPayload = {
  member_id: 'member-1',
  member_name: 'Jordan Lee',
  meeting_time: '2026-07-08T15:00:00.000Z',
  open_items_mine: [{ inbox_item_id: 'i1', text: 'Send Jordan the Q3 roadmap doc', owed_by: 'me' }],
  open_items_theirs: [{ inbox_item_id: '', text: 'Follow up on the budget approval', owed_by: 'them' }],
  changes_since_last: ['New topic: hiring plan for Q4'],
  talking_points: [
    { text: 'Check in on the budget approval timeline', from: 'Note, Jul 2' },
    { text: 'Discuss Q4 hiring plan', from: 'Topic: hiring plan (mentioned 2x)' },
  ],
};

describe('PersonBriefDetail', () => {
  it('renders open items from both directions with a "who owes it" label', () => {
    renderBrief(BASE_BRIEF);
    expect(screen.getByText('Send Jordan the Q3 roadmap doc')).toBeInTheDocument();
    expect(screen.getByText('Follow up on the budget approval')).toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.getByText('Jordan')).toBeInTheDocument(); // first name of member_name
  });

  it('renders "what changed since last time"', () => {
    renderBrief(BASE_BRIEF);
    expect(screen.getByText('What changed since last time')).toBeInTheDocument();
    expect(screen.getByText('New topic: hiring plan for Q4')).toBeInTheDocument();
  });

  it('renders talking points with a "from:" source caption instead of requiring a hover', () => {
    renderBrief(BASE_BRIEF);
    expect(screen.getByText('Suggested talking points')).toBeInTheDocument();
    expect(screen.getByText('Check in on the budget approval timeline')).toBeInTheDocument();
    expect(screen.getByText('from: Note, Jul 2')).toBeInTheDocument();
    expect(screen.getByText('from: Topic: hiring plan (mentioned 2x)')).toBeInTheDocument();
  });

  it('contains no ML/algorithm jargon anywhere in the rendered output', () => {
    const { container } = renderBrief(BASE_BRIEF);
    const text = container.textContent ?? '';
    // The plan's explicit ask: describe what it looked at, not how the
    // model works. None of these terms should ever appear in this UI.
    for (const jargon of ['algorithm', 'AI-detected', 'confidence', 'embedding', 'model', 'neural', 'machine learning']) {
      expect(text.toLowerCase()).not.toContain(jargon.toLowerCase());
    }
  });

  it('shows a graceful early-1:1 message when there is no history at all, not a blank section', () => {
    const emptyBrief: PersonBriefPayload = {
      ...BASE_BRIEF,
      open_items_mine: [],
      open_items_theirs: [],
      changes_since_last: [],
      talking_points: [],
    };
    renderBrief(emptyBrief);
    expect(screen.getByText(/No prior history with Jordan Lee yet/i)).toBeInTheDocument();
  });
});
