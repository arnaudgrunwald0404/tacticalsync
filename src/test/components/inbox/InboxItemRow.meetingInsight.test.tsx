import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { InboxItem, InboxTag } from '@/types/inbox';

// Covers the "View in recording" affordance still rendered for legacy
// meeting_insight rows (archived/done rows created before quote suggestions
// moved to dci_suggested_tasks — see src/lib/meetingInsights.ts). There is no
// Confirm/Save/Dismiss triage UI on this row anymore: new quote suggestions
// surface via InboxSuggestionsPanel (accept/dismiss), same as email/Slack.
//
// InboxItemRow pulls in useInboxDelegation, which touches the real Supabase
// client module at import time (throws without VITE_SUPABASE_URL configured,
// which this environment doesn't have). Mock the client so the row's
// unrelated delegation-status fetch/subscription no-ops instead of crashing —
// none of these tests exercise delegation behavior.
vi.mock('@/integrations/supabase/client', () => {
  const chain: Record<string, unknown> = {};
  const builder = () => {
    const q = {
      select: () => q, eq: () => q, not: () => q, order: () => q, limit: () => q, in: () => q,
      maybeSingle: async () => ({ data: null }),
      then: (resolve: (v: { data: null }) => void) => resolve({ data: null }),
    };
    return q;
  };
  const channelStub = (): { on: () => ReturnType<typeof channelStub>; subscribe: () => Record<string, never> } =>
    ({ on: () => channelStub(), subscribe: () => ({}) });
  chain.from = () => builder();
  chain.channel = channelStub;
  chain.removeChannel = () => {};
  chain.auth = { getSession: async () => ({ data: { session: null } }) };
  return { supabase: chain };
});

const { InboxItemRow } = await import('@/components/inbox/InboxItemRow');

const allTags: InboxTag[] = [];

function makeItem(overrides: Partial<InboxItem> = {}): InboxItem {
  return {
    id: 'i1',
    user_id: 'u1',
    type: 'meeting_insight',
    text: 'Marcus said: "We ship Friday." — from Product Sync, Jul 3',
    body: null,
    status: 'archived',
    done_at: null,
    archived_at: '2026-07-03T00:00:00.000Z',
    snoozed_until: null,
    agent_payload: null,
    source_ref: {
      type: 'zoom_recording',
      id: 'rec1',
      recording_id: 'rec1',
      transcript_id: 'tr1',
      speaker_name: 'Marcus',
    },
    sort_order: 0,
    pinned: false,
    bucket: null,
    priority_due_at: null,
    priority_fixed: false,
    created_at: '2026-07-03T00:00:00.000Z',
    updated_at: '2026-07-03T00:00:00.000Z',
    workflow_status: null,
    ...overrides,
  };
}

function noop() {}
async function noopAsync() { return null; }
async function noopVoid() { /* noop */ };

function setup(item: InboxItem, onOpenDrawer = vi.fn()) {
  render(
    <TooltipProvider>
      <InboxItemRow
        item={item}
        allTags={allTags}
        onArchive={noop}
        onDelete={noop}
        onRemoveTag={noop}
        onAddTag={noop}
        onCycleWorkflowStatus={noop}
        onCreateWorkstream={noopAsync}
        onUpdateItem={noopVoid}
        onOpenDrawer={onOpenDrawer}
      />
    </TooltipProvider>
  );
  return { onOpenDrawer };
}

describe('InboxItemRow — legacy meeting_insight display', () => {
  it('renders a "View in recording" link when source_ref has a recording_id', () => {
    setup(makeItem());
    expect(screen.getByText('View in recording')).toBeInTheDocument();
  });

  it('does not render "View in recording" when source_ref has no recording_id', () => {
    setup(makeItem({ source_ref: { type: 'manual' } }));
    expect(screen.queryByText('View in recording')).not.toBeInTheDocument();
  });

  it('does not render "View in recording" for other item types', () => {
    setup(makeItem({ type: 'task' }));
    expect(screen.queryByText('View in recording')).not.toBeInTheDocument();
  });

  it('clicking "View in recording" opens the drawer via onOpenDrawer', async () => {
    const item = makeItem();
    const { onOpenDrawer } = setup(item);
    const user = userEvent.setup();
    await user.click(screen.getByText('View in recording'));
    expect(onOpenDrawer).toHaveBeenCalledWith(item);
  });
});
