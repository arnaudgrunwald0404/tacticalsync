// Per-user scan cursors for the suggestion pipelines, stored in
// cos_action_item_scan_state (source values 'slack_suggestions' /
// 'gmail_suggestions' — see 20260901120000_rescan_incremental_guardrails.sql).
//
// Two jobs:
// 1. Incremental windows — each sync fetches only content newer than its
//    cursor (with a 24h overlap so threads whose extraction failed last run,
//    and were therefore not marked processed, are re-fetched and retried).
// 2. Cost guardrail — a run that completed less than COOLDOWN_MS ago means the
//    LLM extraction phase is skipped entirely, so mashing the panel's refresh
//    button costs DB queries, not model calls. Callers still run their free
//    reconcile/cleanup steps before consulting the cooldown.

// deno-lint-ignore no-explicit-any
type AnySupabaseClient = any

export const SCAN_COOLDOWN_MS = 10 * 60 * 1000
export const SCAN_OVERLAP_MS = 24 * 3600 * 1000

export type SuggestionScanSource = 'slack_suggestions' | 'gmail_suggestions'

export async function readScanCursor(
  supabase: AnySupabaseClient,
  userId: string,
  source: SuggestionScanSource,
): Promise<number | null> {
  const { data } = await supabase
    .from('cos_action_item_scan_state')
    .select('last_scanned_at')
    .eq('user_id', userId)
    .eq('source', source)
    .maybeSingle()
  return data?.last_scanned_at ? new Date(data.last_scanned_at as string).getTime() : null
}

export function isInCooldown(cursorMs: number | null, nowMs = Date.now()): boolean {
  return cursorMs !== null && nowMs - cursorMs < SCAN_COOLDOWN_MS
}

/**
 * Start of the fetch window: from the cursor minus a 24h retry overlap, but
 * never wider than the caller's own days-based cap.
 */
export function scanWindowStartMs(cursorMs: number | null, daysCap: number, nowMs = Date.now()): number {
  const capStart = nowMs - daysCap * 24 * 3600 * 1000
  return cursorMs === null ? capStart : Math.max(cursorMs - SCAN_OVERLAP_MS, capStart)
}

export async function advanceScanCursor(
  supabase: AnySupabaseClient,
  userId: string,
  source: SuggestionScanSource,
): Promise<void> {
  const nowIso = new Date().toISOString()
  await supabase.from('cos_action_item_scan_state').upsert({
    user_id: userId,
    source,
    last_scanned_at: nowIso,
    updated_at: nowIso,
  }, { onConflict: 'user_id,source' })
}
