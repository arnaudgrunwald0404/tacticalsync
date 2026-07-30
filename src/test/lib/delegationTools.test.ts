import { describe, it, expect } from 'vitest';
import {
  validateCreateMeetingTopicParams,
  describeCreateMeetingTopic,
  validatePostSlackUpdateParams,
  describePostSlackUpdate,
  validateProposeMeetingTimeParams,
  describeProposeMeetingTime,
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

describe('validateProposeMeetingTimeParams', () => {
  const validParams = {
    team_member_id: UUID,
    window_start_utc: '2026-08-01T00:00:00.000Z',
    window_end_utc: '2026-08-02T00:00:00.000Z',
    duration_minutes: 30,
  };

  it('accepts valid params', () => {
    expect(validateProposeMeetingTimeParams(validParams)).toBeNull();
  });

  it('rejects missing required fields', () => {
    expect(validateProposeMeetingTimeParams({ team_member_id: UUID })).toMatch(/required/);
  });

  it('rejects a non-UUID team_member_id', () => {
    expect(validateProposeMeetingTimeParams({ ...validParams, team_member_id: 'not-a-uuid' })).toMatch(/UUID/);
  });

  it('rejects invalid ISO datetimes', () => {
    expect(validateProposeMeetingTimeParams({ ...validParams, window_start_utc: 'not-a-date' })).toMatch(/window_start_utc/);
    expect(validateProposeMeetingTimeParams({ ...validParams, window_end_utc: 'not-a-date' })).toMatch(/window_end_utc/);
  });

  it('rejects an end before the start', () => {
    expect(validateProposeMeetingTimeParams({
      ...validParams,
      window_start_utc: '2026-08-02T00:00:00.000Z',
      window_end_utc: '2026-08-01T00:00:00.000Z',
    })).toMatch(/after/);
  });

  it('rejects a window spanning more than 14 days', () => {
    expect(validateProposeMeetingTimeParams({
      ...validParams,
      window_start_utc: '2026-08-01T00:00:00.000Z',
      window_end_utc: '2026-08-20T00:00:00.000Z',
    })).toMatch(/14 days/);
  });

  it('rejects a duration outside 5-480 minutes', () => {
    expect(validateProposeMeetingTimeParams({ ...validParams, duration_minutes: 2 })).toMatch(/duration_minutes/);
    expect(validateProposeMeetingTimeParams({ ...validParams, duration_minutes: 500 })).toMatch(/duration_minutes/);
  });

  it('rejects a window shorter than the requested duration', () => {
    expect(validateProposeMeetingTimeParams({
      ...validParams,
      window_start_utc: '2026-08-01T00:00:00.000Z',
      window_end_utc: '2026-08-01T00:10:00.000Z',
      duration_minutes: 30,
    })).toMatch(/shorter/);
  });
});

describe('describeProposeMeetingTime', () => {
  it('names the resolved team member when available', () => {
    const desc = describeProposeMeetingTime({
      resolved_member_name: 'Melissa',
      window_start_utc: '2026-08-01T17:00:00.000Z',
      window_end_utc: '2026-08-01T18:00:00.000Z',
    });
    expect(desc).toContain('Melissa');
    expect(desc).toContain('UTC');
  });

  it('falls back to a generic pronoun when no member name has been resolved', () => {
    const desc = describeProposeMeetingTime({
      window_start_utc: '2026-08-01T17:00:00.000Z',
      window_end_utc: '2026-08-01T18:00:00.000Z',
    });
    expect(desc).toContain('them');
  });
});

describe('validateToolParams / describeToolStep dispatch', () => {
  it('dispatches to the right validator and describer per tool name', () => {
    expect(validateToolParams('create_meeting_topic', { series_id: UUID, title: 'x' })).toBeNull();
    expect(validateToolParams('post_slack_update', { message: 'hi', channel: 'x' })).toBeNull();
    expect(validateToolParams('propose_meeting_time', {
      team_member_id: UUID,
      window_start_utc: '2026-08-01T00:00:00.000Z',
      window_end_utc: '2026-08-02T00:00:00.000Z',
      duration_minutes: 30,
    })).toBeNull();
    expect(describeToolStep('create_meeting_topic', { title: 'x' })).toContain('x');
    expect(describeToolStep('post_slack_update', { message: 'hi', channel: 'x' })).toContain('hi');
    expect(describeToolStep('propose_meeting_time', {
      resolved_member_name: 'Sam',
      window_start_utc: '2026-08-01T17:00:00.000Z',
      window_end_utc: '2026-08-01T18:00:00.000Z',
    })).toContain('Sam');
  });
});
