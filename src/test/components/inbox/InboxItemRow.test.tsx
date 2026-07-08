import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InboxItemRow } from '@/components/inbox/InboxItemRow';
import type { InboxItem, InboxTag } from '@/types/inbox';

// InboxItemRow pulls in useInboxDelegation, which talks to Supabase directly —
// mock it so this test doesn't need real Supabase credentials (matches the
// project's convention of unit-testing components in isolation from the
// client, e.g. TagPickerDropdown.test.tsx).
vi.mock('@/hooks/useInboxDelegation', () => ({
  useInboxDelegation: () => ({ delegation: null, submitAnswer: vi.fn(), approve: vi.fn() }),
}));

// ─────────────────────────────────────────────────────────────────────────────
// Covers the onboarding/provenance UI added for
// PLAN_idea4_agentic_followthrough.md (Idea #4 — agentic follow-through):
// - agent_nudge rows show a persistent provenance caption + tooltip
//   ("why am I seeing this"), sourced from agent_payload.rationale.
// - agent_question rows (used for the one-time opt-in prompt) render a CTA
//   button when action_required is set, and clicking it invokes onCtaClick
//   with the item — the wiring this feature depends on end-to-end.
// ─────────────────────────────────────────────────────────────────────────────

const allTags: InboxTag[] = [];

function baseItem(overrides: Partial<InboxItem> = {}): InboxItem {
  return {
    id: 'item-1',
    user_id: 'u1',
    type: 'task',
    text: 'Some task',
    body: null,
    status: 'open',
    done_at: null,
    archived_at: null,
    snoozed_until: null,
    agent_payload: null,
    source_ref: null,
    sort_order: 0,
    pinned: false,
    bucket: null,
    priority_due_at: null,
    priority_fixed: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    workflow_status: null,
    tags: [],
    ...overrides,
  };
}

function noop() {}
function noopAsync() { return Promise.resolve(null); }

function renderRow(item: InboxItem, extraProps: Partial<React.ComponentProps<typeof InboxItemRow>> = {}) {
  return render(
    <InboxItemRow
      item={item}
      allTags={allTags}
      onArchive={noop}
      onDelete={noop}
      onRemoveTag={noop}
      onAddTag={noop}
      onCycleWorkflowStatus={noop}
      onCreateWorkstream={noopAsync}
      {...extraProps}
    />,
  );
}

describe('InboxItemRow — agent_nudge provenance (plan Section 5.2/5.3)', () => {
  it('shows a persistent provenance caption under the item text when a rationale is present', () => {
    const item = baseItem({
      type: 'agent_nudge',
      text: '3 open items tagged to Priya — 1:1 today at 2:00 PM',
      agent_payload: {
        source: 'agent_nudge_before_1on1',
        rationale: 'Suggested by your agent · based on your 1:1 with Priya today at 2:00 PM — 3 open items tagged to them',
      },
    });
    renderRow(item);

    expect(screen.getByText('3 open items tagged to Priya — 1:1 today at 2:00 PM')).toBeInTheDocument();
    expect(screen.getByText(/Suggested by your agent/)).toBeInTheDocument();
  });

  it('does not render a caption when there is no rationale', () => {
    const item = baseItem({ type: 'agent_nudge', text: 'Nudge with no rationale', agent_payload: null });
    renderRow(item);

    expect(screen.queryByText(/Suggested by your agent/)).not.toBeInTheDocument();
  });

  it('does not render the provenance caption on a plain task, even if agent_payload is set', () => {
    const item = baseItem({
      type: 'task',
      text: 'A regular task',
      agent_payload: { source: 'agent_nudge_due_date', rationale: 'Suggested by your agent · due date approaching' },
    });
    renderRow(item);

    expect(screen.queryByText(/Suggested by your agent/)).not.toBeInTheDocument();
  });

  it('puts the full rationale on the type icon as a title tooltip', () => {
    const rationale = 'Suggested by your agent · due date approaching';
    const item = baseItem({
      type: 'agent_nudge',
      text: 'Approve budget line — due tomorrow',
      agent_payload: { source: 'agent_nudge_due_date', rationale },
    });
    const { container } = renderRow(item);

    const iconSpan = container.querySelector(`[title="${rationale}"]`);
    expect(iconSpan).not.toBeNull();
  });
});

describe('InboxItemRow — agent_question opt-in CTA (plan Section 5.1)', () => {
  it('renders the CTA button for an action_required agent_question', () => {
    const item = baseItem({
      type: 'agent_question',
      text: 'Want me to flag open items before your 1:1s and as due dates approach?',
      agent_payload: {
        source: 'inbox_agent_optin_prompt',
        rationale: 'I noticed you have items tagged to people you meet with regularly.',
        action_required: true,
        cta_label: 'Turn on nudges',
        cta_action: 'enable_inbox_nudges',
      },
    });
    renderRow(item);

    expect(screen.getByRole('button', { name: 'Turn on nudges' })).toBeInTheDocument();
  });

  it('calls onCtaClick with the item when the CTA is clicked', async () => {
    const user = userEvent.setup();
    const onCtaClick = vi.fn();
    const item = baseItem({
      type: 'agent_question',
      text: 'Want me to flag open items before your 1:1s and as due dates approach?',
      agent_payload: {
        source: 'inbox_agent_optin_prompt',
        action_required: true,
        cta_label: 'Turn on nudges',
        cta_action: 'enable_inbox_nudges',
      },
    });
    renderRow(item, { onCtaClick });

    await user.click(screen.getByRole('button', { name: 'Turn on nudges' }));

    expect(onCtaClick).toHaveBeenCalledTimes(1);
    expect(onCtaClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'item-1' }));
  });

  it('does not render a CTA button when action_required is false', () => {
    const item = baseItem({
      type: 'agent_question',
      text: 'Some other agent question',
      agent_payload: { source: 'inbox_agent_optin_prompt', action_required: false },
    });
    renderRow(item);

    expect(screen.queryByRole('button', { name: /turn on/i })).not.toBeInTheDocument();
  });
});
