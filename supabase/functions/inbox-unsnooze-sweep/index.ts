import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Inbox unsnooze sweep — called every 10 minutes by pg_cron
 * (see 20260726000001_inbox_unsnooze_cron.sql).
 *
 * Two passes:
 *  1. Re-resolve person-bound snoozes ("until my next 1:1 with X") against
 *     cos_one_on_one_events, since the meeting may have moved, been
 *     cancelled, or a replacement occurrence may now exist. Updates the
 *     cached `snoozed_until` so pass 2's simple `<= now()` comparison stays
 *     correct without every reader needing to know about person-binding.
 *  2. Flip any item whose `snoozed_until` has passed back to `status='open'`.
 *
 * Person-bound items with no resolvable meeting are left snoozed (not
 * force-unsnoozed, not deleted) — see PLAN_idea2_dormant20.md Section 1b's
 * risk notes. They're surfaced in the Snoozed view as stale so the user can
 * pick a new date instead of the item silently vanishing forever.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ── Pass 1: re-resolve person-bound snoozes ────────────────────────────
    const { data: personBound, error: personBoundError } = await supabase
      .from('inbox_items')
      .select('id, user_id, snooze_until_member_id, snoozed_until')
      .eq('status', 'snoozed')
      .not('snooze_until_member_id', 'is', null);

    if (personBoundError) throw personBoundError;

    let reresolved = 0;
    const nowIso = new Date().toISOString();

    for (const item of personBound ?? []) {
      const { data: nextEvent } = await supabase
        .from('cos_one_on_one_events')
        .select('start_time')
        .eq('user_id', item.user_id)
        .eq('team_member_id', item.snooze_until_member_id)
        .neq('status', 'cancelled')
        .gte('start_time', nowIso)
        .order('start_time', { ascending: true })
        .limit(1)
        .maybeSingle();

      // No upcoming meeting found: leave the cached snoozed_until as-is (it
      // may be in the past already — that's exactly the "stale" signal the
      // Snoozed view uses to prompt the user to pick a new date). Never
      // clear it to null, since pass 2's `<= now()` filter would then never
      // match and the item would need a separate un-snooze path anyway.
      if (!nextEvent) continue;

      if (nextEvent.start_time !== item.snoozed_until) {
        const { error: updateError } = await supabase
          .from('inbox_items')
          .update({ snoozed_until: nextEvent.start_time, updated_at: nowIso })
          .eq('id', item.id);
        if (!updateError) reresolved++;
      }
    }

    // ── Pass 2: flip due items back to open ─────────────────────────────────
    const { data: due, error: dueError } = await supabase
      .from('inbox_items')
      .select('id')
      .eq('status', 'snoozed')
      .not('snoozed_until', 'is', null)
      .lte('snoozed_until', nowIso);

    if (dueError) throw dueError;

    let unsnoozed = 0;
    if (due && due.length > 0) {
      const { error: flipError } = await supabase
        .from('inbox_items')
        .update({ status: 'open', snoozed_until: null, snooze_until_member_id: null, updated_at: nowIso })
        .in('id', due.map((d) => d.id));
      if (flipError) throw flipError;
      unsnoozed = due.length;
    }

    return new Response(
      JSON.stringify({ ok: true, reresolved, unsnoozed }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('inbox-unsnooze-sweep failed', err);
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
