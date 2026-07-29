import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import {
  useMeetingAnalysis,
  resolveSelfReflectiveTalkTime,
  MIN_MEETING_SECONDS_FOR_TALK_TIME,
  UNATTRIBUTED_SPEAKER_KEY,
} from '@/hooks/useMeetingAnalysis';
import { supabase } from '@/integrations/supabase/client';

// ─────────────────────────────────────────────────────────────────────────────
// Coverage for PLAN_idea10_meeting_intelligence_enrichment.md Phase A (§4 A3).
//
// resolveSelfReflectiveTalkTime is the load-bearing logic here: it's what
// keeps this feature scoped self-reflective-only (plan §5.2/§8) by resolving
// the raw name-keyed talk_time_seconds map into "you" / the named team
// member / "other" (never a raw roster of names). The hasEnoughData /
// MIN_MEETING_SECONDS_FOR_TALK_TIME guard mirrors useManagerSignals.ts's
// MIN_ITEMS_FOR_RATE low-N guard.
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveSelfReflectiveTalkTime', () => {
  it('resolves via exact name match on both sides', () => {
    const result = resolveSelfReflectiveTalkTime(
      { 'Jane Smith': 200, 'John Doe': 100 },
      'Jane Smith',
      'John Doe',
      300,
    );
    expect(result.memberSeconds).toBe(200);
    expect(result.youSeconds).toBe(100);
    expect(result.otherSeconds).toBe(0);
    expect(result.hasEnoughData).toBe(true);
  });

  it('falls back to unambiguous first-name match', () => {
    const result = resolveSelfReflectiveTalkTime(
      { 'Jane Smith-Kowalski': 200, 'John Doe': 100 },
      'Jane', // profile/team-member name is just a first name
      'John',
      300,
    );
    expect(result.memberSeconds).toBe(200);
    expect(result.youSeconds).toBe(100);
  });

  it('falls back to unambiguous last-name match', () => {
    const result = resolveSelfReflectiveTalkTime(
      { 'Jane A. Smith': 200, 'John B. Doe': 100 },
      'Smith',
      'Doe',
      300,
    );
    expect(result.memberSeconds).toBe(200);
    expect(result.youSeconds).toBe(100);
  });

  it('resolves "you" by elimination when myName has no match but exactly two named speakers exist', () => {
    // Common real-world case: the transcript's <v Name> label for the
    // connected Zoom account owner doesn't match their saved profile name
    // verbatim (e.g. a nickname or a different capitalization scheme).
    const result = resolveSelfReflectiveTalkTime(
      { 'Jane Smith': 200, 'J. Smith (Host)': 100 },
      'Jane Smith',
      'Completely Different Name',
      300,
    );
    expect(result.memberSeconds).toBe(200);
    expect(result.youSeconds).toBe(100);
  });

  it('buckets a third named speaker as "other", never labeling them by name', () => {
    const result = resolveSelfReflectiveTalkTime(
      { 'Jane Smith': 150, 'John Doe': 100, 'Guest Stakeholder': 50 },
      'Jane Smith',
      'John Doe',
      300,
    );
    expect(result.memberSeconds).toBe(150);
    expect(result.youSeconds).toBe(100);
    expect(result.otherSeconds).toBe(50);
  });

  it('separates unattributed seconds from named speakers', () => {
    const result = resolveSelfReflectiveTalkTime(
      { 'Jane Smith': 150, 'John Doe': 100, [UNATTRIBUTED_SPEAKER_KEY]: 20 },
      'Jane Smith',
      'John Doe',
      300,
    );
    expect(result.unattributedSeconds).toBe(20);
    expect(result.memberSeconds).toBe(150);
    expect(result.youSeconds).toBe(100);
  });

  it('flags hasEnoughData=false below the minimum meeting-length floor', () => {
    const result = resolveSelfReflectiveTalkTime(
      { 'Jane Smith': 10, 'John Doe': 8 },
      'Jane Smith',
      'John Doe',
      MIN_MEETING_SECONDS_FOR_TALK_TIME - 1,
    );
    expect(result.hasEnoughData).toBe(false);
  });

  it('flags hasEnoughData=true at exactly the minimum meeting-length floor', () => {
    const result = resolveSelfReflectiveTalkTime(
      { 'Jane Smith': 40, 'John Doe': 20 },
      'Jane Smith',
      'John Doe',
      MIN_MEETING_SECONDS_FOR_TALK_TIME,
    );
    expect(result.hasEnoughData).toBe(true);
  });

  it('derives meeting duration from the talk-time map when no duration is stored', () => {
    const result = resolveSelfReflectiveTalkTime(
      { 'Jane Smith': 40, 'John Doe': 20 },
      'Jane Smith',
      'John Doe',
      null,
    );
    expect(result.meetingDurationSeconds).toBe(60);
  });

  it('handles a null myName gracefully (no profile name available yet)', () => {
    const result = resolveSelfReflectiveTalkTime(
      { 'Jane Smith': 150, 'John Doe': 100 },
      'Jane Smith',
      null,
      300,
    );
    expect(result.memberSeconds).toBe(150);
    // With no myName and no elimination candidate distinct from member match
    // this still resolves by elimination since only one other speaker exists.
    expect(result.youSeconds).toBe(100);
  });
});

// ── useMeetingAnalysis (thin view-consumer hook) ────────────────────────────

let analysisRow: unknown = null;

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn() },
}));

const mockedFrom = (supabase as unknown as { from: ReturnType<typeof vi.fn> }).from;

function buildBuilder(resolveWith: unknown) {
  const builder: Record<string, unknown> = {};
  const passthrough = ['select', 'eq'];
  for (const m of passthrough) builder[m] = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(() => Promise.resolve({ data: resolveWith, error: null }));
  return builder;
}

beforeEach(() => {
  analysisRow = null;
  mockedFrom.mockReset();
  mockedFrom.mockImplementation(() => buildBuilder(analysisRow));
});

describe('useMeetingAnalysis', () => {
  it('returns null analysis when no recordingId is given', async () => {
    const { result } = renderHook(() => useMeetingAnalysis(null));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.analysis).toBeNull();
    expect(mockedFrom).not.toHaveBeenCalled();
  });

  it('returns null analysis when no row exists yet (transcript not analyzed)', async () => {
    analysisRow = null;
    const { result } = renderHook(() => useMeetingAnalysis('rec-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.analysis).toBeNull();
  });

  it('shapes a found row into the MeetingAnalysis view model', async () => {
    analysisRow = {
      id: 'a1',
      recording_id: 'rec-1',
      talk_time_seconds: { 'Jane Smith': 200, 'John Doe': 100 },
      meeting_duration_seconds: 300,
      overall_sentiment: 'positive',
      sentiment_rationale: 'Constructive and forward-looking.',
      analyzed_at: '2026-07-01T00:00:00Z',
    };
    const { result } = renderHook(() => useMeetingAnalysis('rec-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.analysis).toEqual({
      id: 'a1',
      recordingId: 'rec-1',
      talkTimeSeconds: { 'Jane Smith': 200, 'John Doe': 100 },
      meetingDurationSeconds: 300,
      overallSentiment: 'positive',
      sentimentRationale: 'Constructive and forward-looking.',
      analyzedAt: '2026-07-01T00:00:00Z',
    });
  });
});
