import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

/**
 * Escalation pattern detection.
 *
 * Called by agent-tick for each enabled user. Detects systemic patterns:
 * 1. Chronic overdue: 3+ pending actions with same member, all overdue > 7 days
 * 2. Stalled topics: standing topics unchanged > 30 days
 * 3. Missing meetings: no calendar event with a direct_report in > 2x cadence
 * 4. Commitment drift: quarterly/monthly commitments still draft/in_progress near period end
 *
 * Escalations are sent to the USER (not their manager) as pattern alerts.
 * Suppressed for 30 days if dismissed.
 */

interface EscalationPattern {
  type: 'chronic_overdue' | 'stalled_topics' | 'missing_meetings' | 'commitment_drift'
  member_id?: string
  member_name?: string
  details: string
  severity: 'warning' | 'critical'
}

const CADENCE_DAYS: Record<string, number> = {
  direct_report: 7,
  collaborator: 14,
  boss: 14,
  peer: 14,
  skip_level: 30,
  stakeholder: 30,
  external: 30,
}

export async function detectEscalations(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<EscalationPattern[]> {
  const patterns: EscalationPattern[] = []
  const today = new Date().toISOString().slice(0, 10)
  const todayMs = Date.now()

  // Check for recently dismissed escalations (suppress for 30 days)
  const thirtyDaysAgo = new Date(todayMs - 30 * 86_400_000).toISOString()
  const { data: dismissed } = await supabase
    .from('cos_agent_log')
    .select('payload')
    .eq('user_id', userId)
    .eq('event_type', 'escalation_dismissed')
    .gte('created_at', thirtyDaysAgo)

  const dismissedKeys = new Set(
    (dismissed ?? []).map((d: { payload: Record<string, unknown> }) =>
      `${d.payload?.type ?? ''}:${d.payload?.member_id ?? ''}`
    )
  )

  // Also check for recently sent escalations (same day = suppress)
  const { data: sentToday } = await supabase
    .from('cos_agent_log')
    .select('payload')
    .eq('user_id', userId)
    .eq('event_type', 'escalation_flagged')
    .gte('created_at', today + 'T00:00:00Z')

  const sentTodayKeys = new Set(
    (sentToday ?? []).map((d: { payload: Record<string, unknown> }) =>
      `${d.payload?.type ?? ''}:${d.payload?.member_id ?? ''}`
    )
  )

  // ── 1. Chronic overdue ──────────────────────────────────────────────────

  const sevenDaysAgo = new Date(todayMs - 7 * 86_400_000).toISOString()

  const { data: overdueActions } = await supabase
    .from('cos_meeting_actions')
    .select('id, member_id, text, created_at, due_date')
    .eq('user_id', userId)
    .eq('status', 'pending')

  // Group by member
  const overdueByMember: Record<string, Array<{ text: string; days: number }>> = {}
  for (const action of (overdueActions ?? []) as Array<{
    member_id: string; text: string; created_at: string; due_date: string | null
  }>) {
    const isOverdue = action.due_date
      ? action.due_date < today
      : action.created_at < sevenDaysAgo

    if (!isOverdue) continue

    const days = action.due_date
      ? Math.floor((todayMs - new Date(action.due_date).getTime()) / 86_400_000)
      : Math.floor((todayMs - new Date(action.created_at).getTime()) / 86_400_000)

    if (!overdueByMember[action.member_id]) overdueByMember[action.member_id] = []
    overdueByMember[action.member_id].push({ text: action.text, days })
  }

  // Get member names
  const memberIds = Object.keys(overdueByMember)
  let memberNames: Record<string, string> = {}
  if (memberIds.length > 0) {
    const { data: members } = await supabase
      .from('cos_team_members')
      .select('id, name')
      .in('id', memberIds)

    memberNames = Object.fromEntries(
      (members ?? []).map((m: { id: string; name: string }) => [m.id, m.name])
    )
  }

  for (const [memberId, items] of Object.entries(overdueByMember)) {
    if (items.length < 3) continue

    const key = `chronic_overdue:${memberId}`
    if (dismissedKeys.has(key) || sentTodayKeys.has(key)) continue

    patterns.push({
      type: 'chronic_overdue',
      member_id: memberId,
      member_name: memberNames[memberId] ?? 'Team member',
      details: `${items.length} action items overdue (oldest: ${Math.max(...items.map(i => i.days))} days)`,
      severity: items.some(i => i.days > 30) ? 'critical' : 'warning',
    })
  }

  // ── 2. Missing meetings ─────────────────────────────────────────────────

  const { data: allMembers } = await supabase
    .from('cos_team_members')
    .select('id, name, relationship_type, last_1on1_date')
    .eq('user_id', userId)
    .in('relationship_type', ['direct_report', 'collaborator', 'boss'])

  for (const member of (allMembers ?? []) as Array<{
    id: string; name: string; relationship_type: string; last_1on1_date: string | null
  }>) {
    if (!member.last_1on1_date) continue

    const cadence = CADENCE_DAYS[member.relationship_type] ?? 14
    const maxGap = cadence * 2 // Escalate at 2x cadence
    const daysSinceLast = Math.floor(
      (todayMs - new Date(member.last_1on1_date + 'T00:00:00').getTime()) / 86_400_000
    )

    if (daysSinceLast <= maxGap) continue

    const key = `missing_meetings:${member.id}`
    if (dismissedKeys.has(key) || sentTodayKeys.has(key)) continue

    // Check if there's an upcoming event scheduled
    const { count: upcomingCount } = await supabase
      .from('cos_one_on_one_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('team_member_id', member.id)
      .eq('status', 'confirmed')
      .gte('start_time', new Date().toISOString())

    if ((upcomingCount ?? 0) > 0) continue // Meeting is scheduled

    patterns.push({
      type: 'missing_meetings',
      member_id: member.id,
      member_name: member.name,
      details: `No 1:1 in ${daysSinceLast} days (expected every ${cadence} days) and none scheduled`,
      severity: daysSinceLast > cadence * 3 ? 'critical' : 'warning',
    })
  }

  // ── 3. Commitment drift ─────────────────────────────────────────────────

  const { data: activeQuarter } = await supabase
    .from('commitment_quarters')
    .select('id, label, end_date')
    .lte('start_date', today)
    .gte('end_date', today)
    .limit(1)
    .maybeSingle()

  if (activeQuarter) {
    const daysToEnd = Math.floor(
      (new Date(activeQuarter.end_date + 'T00:00:00').getTime() - todayMs) / 86_400_000
    )

    if (daysToEnd <= 14) {
      const { data: driftingPriorities } = await supabase
        .from('quarterly_priorities')
        .select('title, status')
        .eq('quarter_id', activeQuarter.id)
        .eq('user_id', userId)
        .in('status', ['draft', 'in_progress'])

      const drifting = (driftingPriorities ?? []) as Array<{ title: string; status: string }>

      if (drifting.length > 0) {
        const key = `commitment_drift:`
        if (!dismissedKeys.has(key) && !sentTodayKeys.has(key)) {
          patterns.push({
            type: 'commitment_drift',
            details: `${drifting.length} quarterly priorities still ${drifting.map(d => d.status).join('/')} with ${daysToEnd} days left in ${activeQuarter.label}: ${drifting.map(d => d.title).join(', ')}`,
            severity: daysToEnd <= 7 ? 'critical' : 'warning',
          })
        }
      }
    }
  }

  return patterns
}
