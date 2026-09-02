import { describe, it, expect } from 'vitest';
import { getItemSourceLinks } from '@/components/inbox/SourceLinks';
import type { InboxItem, AgentPayload, SourceRef } from '@/types/inbox';

// Pure-function tests for the sidebar "Source" section's link builder:
// email/Slack-sourced items must always offer a way back to the original
// message, and email items additionally surface the action's direct target
// (agent_payload.action_url) when extract-inbox-action-items found one.

function makeItem(overrides: {
  source_ref?: SourceRef | null;
  agent_payload?: AgentPayload | null;
}): InboxItem {
  return {
    id: 'i1',
    user_id: 'u1',
    type: 'agent_question',
    text: 'Complete the training',
    body: null,
    status: 'open',
    done_at: null,
    archived_at: null,
    snoozed_until: null,
    snooze_until_member_id: null,
    agent_payload: overrides.agent_payload ?? null,
    source_ref: overrides.source_ref ?? null,
    sort_order: 0,
    pinned: false,
  } as InboxItem;
}

describe('getItemSourceLinks', () => {
  it('links a gmail-sourced item to its original email via agent_payload.gmail_url', () => {
    const links = getItemSourceLinks(makeItem({
      source_ref: { type: 'gmail_message', id: 'msg123' },
      agent_payload: { gmail_url: 'https://mail.google.com/mail/u/0/#inbox/thread123' },
    }));
    expect(links).toHaveLength(1);
    expect(links[0].href).toBe('https://mail.google.com/mail/u/0/#inbox/thread123');
    expect(links[0].label).toMatch(/email/i);
  });

  it('falls back to a #all/<message id> deep link for gmail items that predate gmail_url', () => {
    const links = getItemSourceLinks(makeItem({
      source_ref: { type: 'gmail_message', id: 'msg123' },
      agent_payload: { rationale: 'old item' },
    }));
    expect(links).toHaveLength(1);
    expect(links[0].href).toBe('https://mail.google.com/mail/u/0/#all/msg123');
  });

  it('returns no email link when a gmail item has neither gmail_url nor a message id', () => {
    expect(getItemSourceLinks(makeItem({
      source_ref: { type: 'gmail_message' },
    }))).toHaveLength(0);
  });

  it('adds the extracted action link after the email link, using its label', () => {
    const links = getItemSourceLinks(makeItem({
      source_ref: { type: 'gmail_message', id: 'msg123' },
      agent_payload: {
        gmail_url: 'https://mail.google.com/mail/u/0/#inbox/t1',
        action_url: 'https://lms.example.com/course/42',
        action_label: 'Open the training',
      },
    }));
    expect(links).toHaveLength(2);
    expect(links[1].href).toBe('https://lms.example.com/course/42');
    expect(links[1].label).toBe('Open the training');
  });

  it('gives the action link a generic label when action_label is missing', () => {
    const links = getItemSourceLinks(makeItem({
      source_ref: { type: 'gmail_message', id: 'msg123' },
      agent_payload: { gmail_url: 'https://mail.google.com/mail/u/0/#inbox/t1', action_url: 'https://x.example.com' },
    }));
    expect(links[1].label).toMatch(/linked resource/i);
  });

  it('links a slack-sourced item to the source message via agent_payload.slack_url', () => {
    const links = getItemSourceLinks(makeItem({
      source_ref: { type: 'slack_message', id: 'C1:123.456' },
      agent_payload: { slack_url: 'https://slack.com/archives/C1/p123456' },
    }));
    expect(links).toHaveLength(1);
    expect(links[0].href).toBe('https://slack.com/archives/C1/p123456');
    expect(links[0].label).toMatch(/slack/i);
  });

  it('returns nothing for items without an external source (manual, meeting, brief)', () => {
    expect(getItemSourceLinks(makeItem({ source_ref: { type: 'manual' } }))).toHaveLength(0);
    expect(getItemSourceLinks(makeItem({ source_ref: { type: 'cos_meeting_action', id: 'x' } }))).toHaveLength(0);
    expect(getItemSourceLinks(makeItem({ source_ref: null }))).toHaveLength(0);
  });
});
