import { supabase } from '@/integrations/supabase/client';

// ─────────────────────────────────────────────────────────────────────────────
// Resolves "the next scheduled 1:1 with team member X" for the inbox's
// "snooze until my next 1:1 with X" feature. Backed by cos_one_on_one_events
// (Google Calendar-synced 1:1 events — see PLAN_idea2_dormant20.md Section 0.7
// for why this is the correct table and not cos_one_on_one_prep or
// dci_meeting_schedule).
//
// Mirrored (not shared) by supabase/functions/inbox-unsnooze-sweep/index.ts,
// which runs under Deno and can't import from src/ — keep the query logic in
// sync manually if this changes.
// ─────────────────────────────────────────────────────────────────────────────

export interface NextOneOnOne {
  start_time: string;
}

/**
 * Find the soonest upcoming (non-cancelled) 1:1 event with `teamMemberId`.
 * Returns null when no such event is scheduled — callers must treat that as
 * "cannot resolve a snooze target" rather than silently snoozing forever.
 */
export async function resolveNextOneOnOne(
  userId: string,
  teamMemberId: string,
): Promise<NextOneOnOne | null> {
  const { data } = await supabase
    .from('cos_one_on_one_events')
    .select('start_time')
    .eq('user_id', userId)
    .eq('team_member_id', teamMemberId)
    .neq('status', 'cancelled')
    .gte('start_time', new Date().toISOString())
    .order('start_time', { ascending: true })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}
