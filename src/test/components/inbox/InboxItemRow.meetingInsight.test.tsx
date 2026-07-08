import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { InboxItem, InboxTag } from '@/types/inbox';

// Covers the meeting_insight-specific triage UI (Confirm/Save/Dismiss) added
// per PLAN_idea3_meeting_insights.md §4/§5/§9.2: buttons render only for
// type==='meeting_insight' && status==='open', call onTriageInsight with the
// right action, and never appear for other item types or once triaged.
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
      select: () => q, eq: () => q, not: () => q, order: () => q, limit: () => q,
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
    status: 'open',
    done_at: null,
    archived_at: null,
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

function setup(item: InboxItem, onTriageInsight = vi.fn()) {
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
        onTriageInsight={onTriageInsight}
      />
    </TooltipProvider>
  );
  return { onTriageInsight };
}

describe('InboxItemRow — meeting_insight triage', () => {
  it('renders Confirm/Save/Dismiss for an open meeting_insight item', () => {
    setup(makeItem());
    expect(screen.getByLabelText('Confirm — turn into a task')).toBeInTheDocument();
    expect(screen.getByLabelText('Save as a note')).toBeInTheDocument();
    expect(screen.getByLabelText('Dismiss')).toBeInTheDocument();
  });

  it('does not render triage buttons once the insight is no longer open', () => {
    setup(makeItem({ status: 'archived' }));
    expect(screen.queryByLabelText('Confirm — turn into a task')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Save as a note')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Dismiss')).not.toBeInTheDocument();
  });

  it('does not render triage buttons for other item types', () => {
    setup(makeItem({ type: 'task' }));
    expect(screen.queryByLabelText('Confirm — turn into a task')).not.toBeInTheDocument();
  });

  it('does not render triage buttons when onTriageInsight is not provided', () => {
    render(
      <TooltipProvider>
        <InboxItemRow
          item={makeItem()}
          allTags={allTags}
          onArchive={noop}
          onDelete={noop}
          onRemoveTag={noop}
          onAddTag={noop}
          onCycleWorkflowStatus={noop}
          onCreateWorkstream={noopAsync}
          onUpdateItem={noopVoid}
        />
      </TooltipProvider>
    );
    expect(screen.queryByLabelText('Confirm — turn into a task')).not.toBeInTheDocument();
  });

  it('clicking Confirm calls onTriageInsight with the item and "confirm"', async () => {
    const item = makeItem();
    const { onTriageInsight } = setup(item);
    const user = userEvent.setup();
    await user.click(screen.getByLabelText('Confirm — turn into a task'));
    expect(onTriageInsight).toHaveBeenCalledWith(item, 'confirm');
  });

  it('clicking Save calls onTriageInsight with the item and "save"', async () => {
    const item = makeItem();
    const { onTriageInsight } = setup(item);
    const user = userEvent.setup();
    await user.click(screen.getByLabelText('Save as a note'));
    expect(onTriageInsight).toHaveBeenCalledWith(item, 'save');
  });

  it('clicking Dismiss calls onTriageInsight with the item and "dismiss"', async () => {
    const item = makeItem();
    const { onTriageInsight } = setup(item);
    const user = userEvent.setup();
    await user.click(screen.getByLabelText('Dismiss'));
    expect(onTriageInsight).toHaveBeenCalledWith(item, 'dismiss');
  });

  it('renders a "View in recording" link when source_ref has a recording_id', () => {
    setup(makeItem());
    expect(screen.getByText('View in recording')).toBeInTheDocument();
  });

  it('does not render "View in recording" when source_ref has no recording_id', () => {
    setup(makeItem({ source_ref: { type: 'manual' } }));
    expect(screen.queryByText('View in recording')).not.toBeInTheDocument();
  });

  it('clicking "View in recording" opens the drawer via onOpenDrawer', async () => {
    const item = makeItem();
    const onOpenDrawer = vi.fn();
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
    const user = userEvent.setup();
    await user.click(screen.getByText('View in recording'));
    expect(onOpenDrawer).toHaveBeenCalledWith(item);
  });
});
