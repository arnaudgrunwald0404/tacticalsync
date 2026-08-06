import { describe, it, expect } from 'vitest';
import {
  isNoisySpeakerName,
  buildQuoteSuggestionFields,
  capMeetingInsights,
  MEETING_INSIGHT_CAP_PER_TRANSCRIPT,
  commitmentDedupKey,
  buildCommitmentSourceRef,
  buildCommitmentText,
  COMMITMENT_CAP_PER_TRANSCRIPT,
  type CommitmentContext,
  type ExtractedCommitment,
} from '@/lib/meetingInsights';

// ─────────────────────────────────────────────────────────────────────────────
// Covers the pure logic behind wiring extract-zoom-quotes -> dci_suggested_tasks
// (quote suggestions, source_type: 'meeting' — the same recommendation
// surface email/Slack action items use) and the commitment ("who owes whom")
// inbox rows.
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

describe('buildQuoteSuggestionFields', () => {
  it('builds a title from speaker + quote only, no meeting/date suffix', () => {
    const fields = buildQuoteSuggestionFields(
      { speaker: 'Marcus', quote: "We're not going to hit Q3 unless we cut scope now." },
      'Product Sync',
    );
    expect(fields.title).toBe('Marcus said: "We\'re not going to hit Q3 unless we cut scope now."');
  });

  it('sets source_type to meeting and carries the meeting topic as source', () => {
    const fields = buildQuoteSuggestionFields({ speaker: 'Marcus', quote: 'Ship it.' }, 'Product Sync');
    expect(fields.source_type).toBe('meeting');
    expect(fields.source).toBe('Product Sync');
  });

  it('falls back to a null source when meetingTopic is missing', () => {
    const fields = buildQuoteSuggestionFields({ speaker: 'Marcus', quote: 'Ship it.' }, null);
    expect(fields.source).toBeNull();
  });

  it('carries context as rationale, null when absent', () => {
    const withContext = buildQuoteSuggestionFields({ speaker: 'Marcus', quote: 'Ship it.', context: 'commitment' }, null);
    expect(withContext.rationale).toBe('commitment');
    const withoutContext = buildQuoteSuggestionFields({ speaker: 'Marcus', quote: 'Ship it.' }, null);
    expect(withoutContext.rationale).toBeNull();
  });

  it('carries the trimmed verbatim quote as raw_context', () => {
    const fields = buildQuoteSuggestionFields({ speaker: 'Marcus', quote: '  Ship it.  ' }, null);
    expect(fields.raw_context).toBe('Ship it.');
  });

  it('defaults urgency to watching (informational, no follow-through implied)', () => {
    const fields = buildQuoteSuggestionFields({ speaker: 'Marcus', quote: 'Ship it.' }, null);
    expect(fields.urgency).toBe('watching');
  });

  it('trims speaker and quote', () => {
    const fields = buildQuoteSuggestionFields({ speaker: '  Marcus  ', quote: '  Ship it.  ' }, null);
    expect(fields.title).toBe('Marcus said: "Ship it."');
  });
});

describe('capMeetingInsights', () => {
  it('defaults to the mandated cap of 2', () => {
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
  const ctx: CommitmentContext = {
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
