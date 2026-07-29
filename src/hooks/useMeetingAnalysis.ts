import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

// ── Meeting Intelligence Enrichment, Phase A ────────────────────────────────
// (PLAN_idea10_meeting_intelligence_enrichment.md §4 A3)
//
// FRAMING IS LOAD-BEARING HERE, NOT DECORATION — mirrors the house style
// established by useManagerSignals.ts (see that file's own header comment).
// `cos_meeting_analysis.talk_time_seconds` is stored keyed by RAW SPEAKER
// NAME STRING, not identity — it is only ever resolved here into "you" /
// this-report's-name / unattributed, and per the plan's open-question
// resolution (§5.2, §8 of the implementing task) is scoped SELF-REFLECTIVE
// ONLY for v1: a user sees their own talk-time in their own meetings, never
// a manager's read on how much a report talked in a meeting the manager
// wasn't part of. Consumers must not present this as a verdict on the other
// person, and must not build any cross-meeting/cross-person comparison on
// top of it (no leaderboard, matching the Manager Signals guardrail).

export type MeetingSentiment = 'positive' | 'negative' | 'neutral' | 'mixed';

export interface MeetingAnalysis {
  id: string;
  recordingId: string;
  /** Seconds spoken per raw speaker-name string, as stored — see the shared
   *  Deno module supabase/functions/_shared/talkTime.ts for how these are
   *  computed. Not resolved to any identity at the storage layer. */
  talkTimeSeconds: Record<string, number>;
  meetingDurationSeconds: number | null;
  overallSentiment: MeetingSentiment | null;
  sentimentRationale: string | null;
  analyzedAt: string;
}

interface MeetingAnalysisRow {
  id: string;
  recording_id: string;
  talk_time_seconds: Record<string, number> | null;
  meeting_duration_seconds: number | null;
  overall_sentiment: MeetingSentiment | null;
  sentiment_rationale: string | null;
  analyzed_at: string;
}

function rowToMeetingAnalysis(r: MeetingAnalysisRow): MeetingAnalysis {
  return {
    id: r.id,
    recordingId: r.recording_id,
    talkTimeSeconds: r.talk_time_seconds ?? {},
    meetingDurationSeconds: r.meeting_duration_seconds,
    overallSentiment: r.overall_sentiment,
    sentimentRationale: r.sentiment_rationale,
    analyzedAt: r.analyzed_at,
  };
}

// ── useMeetingAnalysis ───────────────────────────────────────────────────────
// Thin view-consumer hook, following the useRelationshipTopics.ts /
// useManagerSignals.ts convention: one table, no client-side computation
// beyond row shaping (the actual talk-time/sentiment math already happened
// server-side in extract-zoom-quotes).

export function useMeetingAnalysis(recordingId: string | null) {
  const [analysis, setAnalysis] = useState<MeetingAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalysis = useCallback(async () => {
    if (!recordingId) {
      setAnalysis(null);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const { data, error: fetchError } = await supabase
        .from('cos_meeting_analysis')
        .select('*')
        .eq('recording_id', recordingId)
        .maybeSingle();

      if (fetchError) throw fetchError;
      setAnalysis(data ? rowToMeetingAnalysis(data as unknown as MeetingAnalysisRow) : null);
    } catch (err) {
      console.error('Failed to fetch meeting analysis:', err);
      setError(err instanceof Error ? err.message : String(err));
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  }, [recordingId]);

  useEffect(() => { fetchAnalysis(); }, [fetchAnalysis]);

  return { analysis, loading, error, refetch: fetchAnalysis };
}

// ── Self-reflective talk-time resolution ────────────────────────────────────
// Pure function, unit-testable independent of the hook/network. Resolves the
// raw name-keyed talk_time_seconds map into exactly three buckets: "you"
// (the viewing/logged-in user), the named direct report/team member, and
// "other" (any additional named speaker neither of the above — e.g. a third
// attendee on what turned out not to be a strict 1:1). Never surfaces a raw
// list of speaker names.

export const UNATTRIBUTED_SPEAKER_KEY = 'unattributed'; // mirrors supabase/functions/_shared/talkTime.ts — kept in sync manually (Deno functions can't import from src/, see extract-zoom-quotes/index.ts's own file-level mirror comment)

/** Below this, a talk-time percentage is more noise than signal (a 20-second
 *  call rounding to "You: 100%" is misleading) — mirrors the
 *  MIN_ITEMS_FOR_RATE low-N guard pattern in useManagerSignals.ts. */
export const MIN_MEETING_SECONDS_FOR_TALK_TIME = 60;

export interface ResolvedTalkTime {
  youSeconds: number;
  memberSeconds: number;
  /** Any additional named speaker matched to neither "you" nor the member —
   *  deliberately never labeled by name in the UI. */
  otherSeconds: number;
  unattributedSeconds: number;
  meetingDurationSeconds: number;
  hasEnoughData: boolean;
}

/** Finds the single speaker-name key that best matches `candidateName`,
 *  using the same exact → unambiguous-first-name → unambiguous-last-name
 *  fallback chain extract-zoom-quotes/index.ts already uses for speaker
 *  attribution (kept in sync manually, same reasoning as the constant
 *  above) — but scoped to just the candidate keys passed in here, since at
 *  this call site we're matching against at most a couple of known names,
 *  not the caller's whole team roster. */
function bestKeyMatch(keys: string[], candidateName: string): string | null {
  const candidateLower = candidateName.toLowerCase().trim();
  if (!candidateLower) return null;

  const exact = keys.find(k => k.toLowerCase().trim() === candidateLower);
  if (exact) return exact;

  const candidateFirst = candidateLower.split(' ')[0];
  const firstMatches = keys.filter(k => k.toLowerCase().trim().split(' ')[0] === candidateFirst);
  if (firstMatches.length === 1) return firstMatches[0];

  const candidateLast = candidateLower.split(' ').pop();
  const lastMatches = keys.filter(k => k.toLowerCase().trim().split(' ').pop() === candidateLast);
  if (lastMatches.length === 1) return lastMatches[0];

  return null;
}

/**
 * Resolves a raw `talk_time_seconds` map into self-reflective buckets.
 *
 * `myName` is the viewing user's own display name (e.g. `profiles.full_name`)
 * — may not match the transcript's speaker label verbatim (Zoom's own
 * participant name can differ from what's saved in the profile). When that
 * happens but the transcript only has two named speakers total and the other
 * one already matched the team member, the remaining speaker is attributed
 * to "you" by elimination — the ordinary 1:1 case this feature is scoped to
 * (plan open-question resolution: self-reflective only, not a manager
 * viewing a report's meeting with someone else).
 */
export function resolveSelfReflectiveTalkTime(
  talkTimeSeconds: Record<string, number>,
  memberName: string,
  myName: string | null,
  meetingDurationSeconds: number | null,
): ResolvedTalkTime {
  const unattributedSeconds = talkTimeSeconds[UNATTRIBUTED_SPEAKER_KEY] ?? 0;
  const namedKeys = Object.keys(talkTimeSeconds).filter(k => k !== UNATTRIBUTED_SPEAKER_KEY);

  const memberKey = bestKeyMatch(namedKeys, memberName);
  const remainingAfterMember = namedKeys.filter(k => k !== memberKey);
  let myKey = myName ? bestKeyMatch(remainingAfterMember, myName) : null;

  // By-elimination fallback for the ordinary 1:1 case (see doc comment above).
  if (!myKey && memberKey && remainingAfterMember.length === 1) {
    myKey = remainingAfterMember[0];
  }

  let youSeconds = 0;
  let memberSeconds = 0;
  let otherSeconds = 0;

  for (const key of namedKeys) {
    const seconds = talkTimeSeconds[key] ?? 0;
    if (key === memberKey) memberSeconds += seconds;
    else if (key === myKey) youSeconds += seconds;
    else otherSeconds += seconds;
  }

  const derivedDuration = meetingDurationSeconds ??
    (youSeconds + memberSeconds + otherSeconds + unattributedSeconds);

  return {
    youSeconds,
    memberSeconds,
    otherSeconds,
    unattributedSeconds,
    meetingDurationSeconds: derivedDuration,
    hasEnoughData: derivedDuration >= MIN_MEETING_SECONDS_FOR_TALK_TIME,
  };
}
