import { describe, it, expect } from 'vitest';
import {
  validateCreateMeetingTopicParams,
  describeCreateMeetingTopic,
  validatePostSlackUpdateParams,
  describePostSlackUpdate,
  validateToolParams,
  describeToolStep,
} from '@/lib/delegationTools';

const UUID = '11111111-1111-1111-1111-111111111111';

describe('validateCreateMeetingTopicParams', () => {
  it('accepts valid params', () => {
    expect(validateCreateMeetingTopicParams({ series_id: UUID, title: 'Discuss Q3 roadmap' })).toBeNull();
  });

  it('rejects a missing series_id or title', () => {
    expect(validateCreateMeetingTopicParams({ title: 'x' })).toMatch(/required/);
    expect(validateCreateMeetingTopicParams({ series_id: UUID })).toMatch(/required/);
  });

  it('rejects a non-UUID series_id', () => {
    expect(validateCreateMeetingTopicParams({ series_id: 'not-a-uuid', title: 'x' })).toMatch(/UUID/);
  });

  it('rejects an empty or overlong title', () => {
    expect(validateCreateMeetingTopicParams({ series_id: UUID, title: '   ' })).toMatch(/empty/);
    expect(validateCreateMeetingTopicParams({ series_id: UUID, title: 'x'.repeat(201) })).toMatch(/too long/);
  });

  it('rejects a non-string notes field', () => {
    expect(validateCreateMeetingTopicParams({ series_id: UUID, title: 'x', notes: 42 })).toMatch(/notes/);
  });
});

describe('describeCreateMeetingTopic', () => {
  it('uses the real resolved meeting name and date when available', () => {
    const desc = describeCreateMeetingTopic({ title: 'Renewal risk', resolved_series_name: 'Weekly Sync', resolved_date: '2026-07-14' });
    expect(desc).toBe('Add "Renewal risk" as a topic to your next Weekly Sync meeting on 2026-07-14');
  });

  it('falls back to a generic description when nothing has been resolved yet', () => {
    expect(describeCreateMeetingTopic({ title: 'Renewal risk' })).toBe('Add "Renewal risk" as a topic to your next meeting');
  });
});

describe('validatePostSlackUpdateParams', () => {
  it('accepts a valid channel message', () => {
    expect(validatePostSlackUpdateParams({ message: 'hi', channel: 'eng-standup' })).toBeNull();
  });

  it('accepts a valid DM message', () => {
    expect(validatePostSlackUpdateParams({ message: 'hi', dm_user_email: 'a@b.com' })).toBeNull();
  });

  it('rejects an empty message', () => {
    expect(validatePostSlackUpdateParams({ message: '   ', channel: 'x' })).toMatch(/empty/);
  });

  it('rejects an overlong message', () => {
    expect(validatePostSlackUpdateParams({ message: 'x'.repeat(3001), channel: 'x' })).toMatch(/too long/);
  });

  it('rejects specifying neither channel nor dm_user_email', () => {
    expect(validatePostSlackUpdateParams({ message: 'hi' })).toMatch(/exactly one/);
  });

  it('rejects specifying both channel and dm_user_email', () => {
    expect(validatePostSlackUpdateParams({ message: 'hi', channel: 'x', dm_user_email: 'a@b.com' })).toMatch(/exactly one/);
  });
});

describe('describePostSlackUpdate', () => {
  it('formats a channel target with a leading #', () => {
    expect(describePostSlackUpdate({ message: 'hi team', channel: 'eng-standup' })).toBe('Post to #eng-standup: "hi team"');
  });

  it('formats a DM target by email', () => {
    expect(describePostSlackUpdate({ message: 'hi', dm_user_email: 'a@b.com' })).toBe('Post to a@b.com: "hi"');
  });

  it('truncates long messages in the preview', () => {
    const long = 'x'.repeat(200);
    const desc = describePostSlackUpdate({ message: long, channel: 'x' });
    expect(desc).toContain('…');
    expect(desc.length).toBeLessThan(long.length + 30);
  });
});

describe('validateToolParams / describeToolStep dispatch', () => {
  it('dispatches to the right validator and describer per tool name', () => {
    expect(validateToolParams('create_meeting_topic', { series_id: UUID, title: 'x' })).toBeNull();
    expect(validateToolParams('post_slack_update', { message: 'hi', channel: 'x' })).toBeNull();
    expect(describeToolStep('create_meeting_topic', { title: 'x' })).toContain('x');
    expect(describeToolStep('post_slack_update', { message: 'hi', channel: 'x' })).toContain('hi');
  });
});
