import { describe, it, expect } from 'vitest';
import {
  isNoisySpeakerName,
  meetingInsightDedupKey,
  buildMeetingInsightSourceRef,
  buildMeetingInsightText,
  capMeetingInsights,
  planTriageInsert,
  planTriagePatch,
  MEETING_INSIGHT_CAP_PER_TRANSCRIPT,
  commitmentDedupKey,
  buildCommitmentSourceRef,
  buildCommitmentText,
  COMMITMENT_CAP_PER_TRANSCRIPT,
  type ExtractedQuote,
  type MeetingInsightContext,
  type ExtractedCommitment,
} from '@/lib/meetingInsights';
import type { InboxItem } from '@/types/inbox';

// ─────────────────────────────────────────────────────────────────────────────
// Covers the pure logic behind wiring extract-zoom-quotes -> inbox_items
// (meeting_insight rows) and the Confirm/Save/Dismiss triage transitions.
// See PLAN_idea3_meeting_insights.md §§3-4, 6.
// ─────────────────────────────────────────────────────────────────────────────

describe('isNoisySpeakerName', () => {
  it('flags known garbage labels', () => {
    expect(isNoisySpeakerName('Unknown')).toBe(true);
    expect(isNoisySpeakerName('unknown')).toBe(true);
    expect(isNoisySpeakerName('Guest')).toBe(true);
    expect(isNoisySpeakerName('Guest 1')).toBe(true);
    expect(isNoisySpeakerName('Guest12')).toBe(true);
  });

  it('flags bare phone numbers (dial-in participants)', () => {
    expect(isNoisySpeakerName('+14155551234')).toBe(true);
    expect(isNoisySpeakerName('4155551234')).toBe(true);
  });

  it('flags empty/whitespace-only names', () => {
    expect(isNoisySpeakerName('')).toBe(true);
    expect(isNoisySpeakerName('   ')).toBe(true);
  });

  it('does not flag real names', () => {
    expect(isNoisySpeakerName('Marcus Chen')).toBe(false);
    expect(isNoisySpeakerName('Jane Smith')).toBe(false);
    // Short numeric-looking but not a phone number (under 7 digits) should pass.
    expect(isNoisySpeakerName('Room 42')).toBe(false);
  });
});

describe('meetingInsightDedupKey', () => {
  it('trims speaker and quote for a stable key', () => {
    const key = meetingInsightDedupKey('t1', '  Marcus  ', '  We ship Friday.  ');
    expect(key).toEqual({ transcript_id: 't1', speaker_name: 'Marcus', quote: 'We ship Friday.' });
  });

  it('produces identical keys for the same tuple regardless of incidental whitespace', () => {
    const a = meetingInsightDedupKey('t1', 'Marcus', 'We ship Friday.');
    const b = meetingInsightDedupKey('t1', ' Marcus ', ' We ship Friday. ');
    expect(a).toEqual(b);
  });

  it('produces different keys for different transcripts even with the same quote', () => {
    const a = meetingInsightDedupKey('t1', 'Marcus', 'Same quote');
    const b = meetingInsightDedupKey('t2', 'Marcus', 'Same quote');
    expect(a).not.toEqual(b);
  });
});

describe('buildMeetingInsightSourceRef', () => {
  const ctx: MeetingInsightContext = {
    userId: 'u1',
    transcriptId: 'tr1',
    recordingId: 'rec1',
    quoteId: 'q1',
    meetingTopic: 'Product Sync',
    saidOn: '2026-07-03',
  };
  const quote: ExtractedQuote = { speaker: 'Marcus', quote: 'We ship Friday.', context: 'commitment' };

  it('sets type to zoom_recording and mirrors id onto recording_id', () => {
    const ref = buildMeetingInsightSourceRef(ctx, quote);
    expect(ref.type).toBe('zoom_recording');
    expect(ref.id).toBe('rec1');
    expect(ref.recording_id).toBe('rec1');
  });

  it('carries transcript_id, quote_id, speaker_name, meeting_topic, said_on, context', () => {
    const ref = buildMeetingInsightSourceRef(ctx, quote);
    expect(ref.transcript_id).toBe('tr1');
    expect(ref.quote_id).toBe('q1');
    expect(ref.speaker_name).toBe('Marcus');
    expect(ref.meeting_topic).toBe('Product Sync');
    expect(ref.said_on).toBe('2026-07-03');
    expect(ref.context).toBe('commitment');
  });

  it('omits quote_id when the speaker was unmatched', () => {
    const unmatchedCtx: MeetingInsightContext = { ...ctx, quoteId: null };
    const ref = buildMeetingInsightSourceRef(unmatchedCtx, quote);
    expect(ref.quote_id).toBeUndefined();
    // speaker_name must still be present even without a match (plan §3).
    expect(ref.speaker_name).toBe('Marcus');
  });
});

describe('buildMeetingInsightText', () => {
  it('includes speaker, quote, meeting name, and short date when all present', () => {
    const text = buildMeetingInsightText(
      { speaker: 'Marcus', quote: "We're not going to hit Q3 unless we cut scope now." },
      'Product Sync',
      '2026-07-03',
    );
    expect(text).toBe('Marcus said: "We\'re not going to hit Q3 unless we cut scope now." — from Product Sync, Jul 3');
  });

  it('falls back to omitting the date when saidOn is missing', () => {
    const text = buildMeetingInsightText({ speaker: 'Marcus', quote: 'Ship it.' }, 'Product Sync', null);
    expect(text).toBe('Marcus said: "Ship it." — from Product Sync');
  });

  it('falls back to just speaker+quote when meetingTopic is missing', () => {
    const text = buildMeetingInsightText({ speaker: 'Marcus', quote: 'Ship it.' }, null, '2026-07-03');
    expect(text).toBe('Marcus said: "Ship it."');
  });

  it('trims speaker and quote', () => {
    const text = buildMeetingInsightText({ speaker: '  Marcus  ', quote: '  Ship it.  ' }, null, null);
    expect(text).toBe('Marcus said: "Ship it."');
  });
});

describe('capMeetingInsights', () => {
  it('defaults to the plan-mandated cap of 2', () => {
    expect(MEETING_INSIGHT_CAP_PER_TRANSCRIPT).toBe(2);
    expect(capMeetingInsights([1, 2, 3])).toEqual([1, 2]);
  });

  it('preserves order (prefix-take, not re-rank)', () => {
    expect(capMeetingInsights(['a', 'b', 'c'], 2)).toEqual(['a', 'b']);
  });

  it('is a no-op when under the cap', () => {
    expect(capMeetingInsights([1], 2)).toEqual([1]);
    expect(capMeetingInsights([], 2)).toEqual([]);
  });

  it('accepts a custom cap', () => {
    expect(capMeetingInsights([1, 2, 3, 4], 3)).toEqual([1, 2, 3]);
  });

  it('clamps a negative cap to zero results rather than throwing', () => {
    expect(capMeetingInsights([1, 2], -1)).toEqual([]);
  });
});

describe('planTriageInsert', () => {
  const baseItem: Pick<InboxItem, 'text' | 'source_ref'> = {
    text: 'Marcus said: "We ship Friday." — from Product Sync, Jul 3',
    source_ref: {
      type: 'zoom_recording',
      id: 'rec1',
      recording_id: 'rec1',
      transcript_id: 'tr1',
      speaker_name: 'Marcus',
      context: 'commitment',
    },
  };

  it('confirm: plans a task row seeded from the insight text, source_ref carried over', () => {
    const plan = planTriageInsert(baseItem, 'confirm');
    expect(plan).not.toBeNull();
    expect(plan!.type).toBe('task');
    expect(plan!.text).toBe('Follow up: ' + baseItem.text);
    expect(plan!.body).toBeNull();
    expect(plan!.source_ref).toEqual(baseItem.source_ref);
  });

  it('save: plans a note row with the context as the short label and full text as body', () => {
    const plan = planTriageInsert(baseItem, 'save');
    expect(plan).not.toBeNull();
    expect(plan!.type).toBe('note');
    expect(plan!.text).toBe('commitment');
    expect(plan!.body).toBe(baseItem.text);
    expect(plan!.source_ref).toEqual(baseItem.source_ref);
  });

  it('save: falls back to a truncated item text as the label when context is absent', () => {
    const noContext = { ...baseItem, source_ref: { type: 'zoom_recording' as const, id: 'rec1' } };
    const plan = planTriageInsert(noContext, 'save');
    expect(plan!.text).toBe(baseItem.text.slice(0, 80));
  });

  it('dismiss: plans no new row', () => {
    expect(planTriageInsert(baseItem, 'dismiss')).toBeNull();
  });

  it('confirm/save: default to a manual source_ref when the original item has none', () => {
    const noRef = { text: 'Something said in a meeting', source_ref: null };
    const plan = planTriageInsert(noRef, 'confirm');
    expect(plan!.source_ref).toEqual({ type: 'manual' });
  });
});

describe('commitmentDedupKey', () => {
  it('trims owner and commitment for a stable key', () => {
    const key = commitmentDedupKey('t1', '  Marcus  ', '  Send the numbers by EOD.  ');
    expect(key).toEqual({ transcript_id: 't1', speaker_name: 'Marcus', commitment: 'Send the numbers by EOD.' });
  });

  it('produces different keys for different transcripts even with the same commitment', () => {
    const a = commitmentDedupKey('t1', 'Marcus', 'Same commitment');
    const b = commitmentDedupKey('t2', 'Marcus', 'Same commitment');
    expect(a).not.toEqual(b);
  });
});

describe('buildCommitmentSourceRef', () => {
  const ctx: MeetingInsightContext = {
    userId: 'u1',
    transcriptId: 'tr1',
    recordingId: 'rec1',
    meetingTopic: 'Product Sync',
    saidOn: '2026-07-03',
  };

  it('sets type to zoom_recording and mirrors id onto recording_id', () => {
    const ref = buildCommitmentSourceRef(ctx, { owner_name: 'Marcus' });
    expect(ref.type).toBe('zoom_recording');
    expect(ref.id).toBe('rec1');
    expect(ref.recording_id).toBe('rec1');
  });

  it('carries transcript_id, speaker_name (from owner_name), meeting_topic, said_on', () => {
    const ref = buildCommitmentSourceRef(ctx, { owner_name: '  Marcus  ' });
    expect(ref.transcript_id).toBe('tr1');
    expect(ref.speaker_name).toBe('Marcus');
    expect(ref.meeting_topic).toBe('Product Sync');
    expect(ref.said_on).toBe('2026-07-03');
  });
});

describe('buildCommitmentText', () => {
  const meFixture: Pick<ExtractedCommitment, 'owner_name' | 'owed_by' | 'commitment'> = {
    owner_name: 'Host',
    owed_by: 'me',
    commitment: 'Send the updated deck by Friday.',
  };
  const themFixture: Pick<ExtractedCommitment, 'owner_name' | 'owed_by' | 'commitment'> = {
    owner_name: 'Marcus',
    owed_by: 'them',
    commitment: 'Get you the numbers by EOD.',
  };

  it('renders a "You committed" headline for owed_by: me', () => {
    const text = buildCommitmentText(meFixture, 'Product Sync', '2026-07-03');
    expect(text).toBe('You committed: Send the updated deck by Friday. — from Product Sync, Jul 3');
  });

  it('renders an "<Owner> committed" headline for owed_by: them', () => {
    const text = buildCommitmentText(themFixture, 'Product Sync', '2026-07-03');
    expect(text).toBe('Marcus committed: Get you the numbers by EOD. — from Product Sync, Jul 3');
  });

  it('falls back to omitting the date when saidOn is missing', () => {
    const text = buildCommitmentText(themFixture, 'Product Sync', null);
    expect(text).toBe('Marcus committed: Get you the numbers by EOD. — from Product Sync');
  });

  it('falls back to just the commitment when meetingTopic is missing', () => {
    const text = buildCommitmentText(themFixture, null, '2026-07-03');
    expect(text).toBe('Marcus committed: Get you the numbers by EOD.');
  });

  it('trims owner_name and commitment', () => {
    const text = buildCommitmentText({ owner_name: '  Marcus  ', owed_by: 'them', commitment: '  Ship it.  ' }, null, null);
    expect(text).toBe('Marcus committed: Ship it.');
  });
});

describe('COMMITMENT_CAP_PER_TRANSCRIPT', () => {
  it('defaults to 5 and works with capMeetingInsights (shared prefix-take helper)', () => {
    expect(COMMITMENT_CAP_PER_TRANSCRIPT).toBe(5);
    expect(capMeetingInsights([1, 2, 3, 4, 5, 6], COMMITMENT_CAP_PER_TRANSCRIPT)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('planTriagePatch', () => {
  const now = new Date('2026-07-07T12:00:00.000Z');

  it('confirm: marks the original insight done, not archived', () => {
    const patch = planTriagePatch('confirm', now);
    expect(patch.status).toBe('done');
    expect(patch.done_at).toBe(now.toISOString());
    expect(patch.archived_at).toBeNull();
  });

  it('save: archives the original insight (no follow-through expected)', () => {
    const patch = planTriagePatch('save', now);
    expect(patch.status).toBe('archived');
    expect(patch.archived_at).toBe(now.toISOString());
    expect(patch.done_at).toBeNull();
  });

  it('dismiss: archives the original insight, same as save', () => {
    const patch = planTriagePatch('dismiss', now);
    expect(patch.status).toBe('archived');
    expect(patch.archived_at).toBe(now.toISOString());
    expect(patch.done_at).toBeNull();
  });
});
