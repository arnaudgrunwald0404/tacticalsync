import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"
import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.39.0"
import { getStackOneConfig } from "../_shared/stackone.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Tools whose data generate-1on1-prep can actually gather today.
const TOOL_IDS = ['zoom', 'slack', 'stackone'] as const
type ToolId = typeof TOOL_IDS[number]

interface Recommendation {
  tool: ToolId
  action: 'add' | 'remove'
  reason: string
}

/**
 * Recommends which data-source tools best serve a given 1:1's prep, surfaced as
 * add/remove nudges in the 1:1 drawer. Looks at what's connected and recent
 * signal volume per tool, then asks Claude (Haiku) to suggest changes to the
 * member's effective toolset. Falls back to a deterministic heuristic if the
 * model is unavailable.
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY') ?? ''

    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!jwt) return jsonResponse({ error: 'missing_authorization' }, 401)

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    let body: { team_member_id?: string; _batch_user_id?: string }
    try { body = await req.json() } catch { return jsonResponse({ error: 'invalid_body' }, 400) }

    let userId: string
    if (jwt === serviceRoleKey && body._batch_user_id) {
      userId = body._batch_user_id
    } else {
      const { data: userData, error: userErr } = await supabase.auth.getUser(jwt)
      if (userErr || !userData?.user) return jsonResponse({ error: 'invalid_token' }, 401)
      userId = userData.user.id
    }

    const teamMemberId = body.team_member_id
    if (!teamMemberId) return jsonResponse({ error: 'team_member_id_required' }, 400)

    // ── Load member + current toolset + connection/signal data ──────────────
    const since14 = new Date(Date.now() - 14 * 86_400_000).toISOString()
    const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString()

    const [memberRes, scheduleRes, settingsRes, zoomCredRes, slackCredRes, mcpRes, slackCountRes, zoomCountRes] = await Promise.all([
      supabase.from('cos_team_members')
        .select('id, name, role, relationship_type, email, agent_overrides')
        .eq('id', teamMemberId).eq('user_id', userId).single(),
      supabase.from('cos_prep_schedule').select('prep_tools').eq('user_id', userId).maybeSingle(),
      supabase.from('cos_settings').select('agent_config').eq('user_id', userId).maybeSingle(),
      supabase.from('user_zoom_credentials').select('access_token').eq('user_id', userId).maybeSingle(),
      supabase.from('user_slack_credentials').select('access_token').eq('user_id', userId).maybeSingle(),
      supabase.from('cos_mcp_integrations').select('integration_key, is_connected').eq('user_id', userId),
      supabase.from('cos_slack_messages').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('team_member_id', teamMemberId).gte('message_date', since14),
      supabase.from('cos_zoom_recordings').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('team_member_id', teamMemberId).gte('start_time', since30),
    ])

    if (memberRes.error || !memberRes.data) return jsonResponse({ error: 'member_not_found' }, 404)
    const member = memberRes.data as {
      id: string; name: string; role: string; relationship_type: string;
      email: string | null; agent_overrides: Record<string, unknown> | null
    }

    const globalTools = (scheduleRes.data?.prep_tools as string[] | undefined) ?? ['zoom', 'slack']
    const override = member.agent_overrides?.['prep_tools']
    const currentTools: string[] = Array.isArray(override) && override.length > 0 ? override as string[] : globalTools

    const mcp = (mcpRes.data ?? []) as Array<{ integration_key: string; is_connected: boolean }>
    const stackoneConnected = mcp.some(m => m.integration_key === 'stackone' && m.is_connected)
    let stackoneUsable = false
    if (stackoneConnected && member.email) {
      try { stackoneUsable = !!(await getStackOneConfig(supabase, userId)) } catch { stackoneUsable = false }
    }

    const connected: Record<ToolId, boolean> = {
      zoom: !!zoomCredRes.data?.access_token,
      slack: !!slackCredRes.data?.access_token,
      stackone: stackoneUsable,
    }
    const signals = {
      slack_messages_14d: slackCountRes.count ?? 0,
      zoom_recordings_30d: zoomCountRes.count ?? 0,
      crm_hr_available: stackoneUsable,
      relationship_type: member.relationship_type,
    }

    // The "Tool recommendations" agent behavior gates whether we generate
    // suggestions. When off, we still report the current toolset (read-only).
    const agentConfig = (settingsRes.data?.agent_config ?? {}) as Record<string, unknown>
    const recommendEnabled = agentConfig['recommend_tools'] === true

    // ── Recommendation: Claude (Haiku) with deterministic fallback ──────────
    let recommendations: Recommendation[] = []
    const has = (t: ToolId) => currentTools.includes(t)

    if (recommendEnabled && anthropicApiKey) {
      try {
        const anthropic = new Anthropic({ apiKey: anthropicApiKey })
        const sys = `You advise which data-source tools to attach to a 1:1 meeting prep so the brief is well-informed but not noisy. Tools: zoom (call recordings/transcripts), slack (DMs & channel messages), stackone (CRM, HR & ticketing data).

Rules:
- Only recommend "add" for a tool that is connected (see "connected").
- Recommend "add" when a tool is connected, not in current_tools, and the signals suggest it'd help (recent activity, or relationship_type implies it — e.g. CRM for external/stakeholder, slack for collaborators).
- Recommend "remove" when a tool is in current_tools but has no recent signal and is unlikely to help.
- Be conservative: return 0-3 recommendations. Omit a tool entirely if no clear change is warranted.
- Respond with ONLY valid JSON (no markdown fences): {"recommendations":[{"tool":"zoom|slack|stackone","action":"add|remove","reason":"short reason"}]}`
        const usr = `current_tools: ${JSON.stringify(currentTools)}
connected: ${JSON.stringify(connected)}
signals: ${JSON.stringify(signals)}
member: ${member.name} (${member.role}, ${member.relationship_type})`

        const msg = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 400,
          system: sys,
          messages: [{ role: 'user', content: usr }],
        })
        const text = msg.content
          .filter((b: { type: string }) => b.type === 'text')
          .map((b: { type: string; text: string }) => b.text).join('\n')
          .replace(/```json?\n?/g, '').replace(/```\n?$/g, '').trim()
        const parsed = JSON.parse(text) as { recommendations?: Recommendation[] }
        recommendations = (parsed.recommendations ?? []).filter(r =>
          TOOL_IDS.includes(r.tool) && (r.action === 'add' || r.action === 'remove') &&
          // never suggest adding a disconnected tool
          (r.action === 'remove' || connected[r.tool])
        )
      } catch (err) {
        console.warn('recommend-prep-tools: model call failed, using heuristic:', err)
      }
    }

    if (recommendEnabled && recommendations.length === 0) {
      // Heuristic fallback.
      if (connected.slack && !has('slack') && signals.slack_messages_14d > 0)
        recommendations.push({ tool: 'slack', action: 'add', reason: `${signals.slack_messages_14d} recent Slack messages with ${member.name}` })
      if (connected.zoom && !has('zoom') && signals.zoom_recordings_30d > 0)
        recommendations.push({ tool: 'zoom', action: 'add', reason: `${signals.zoom_recordings_30d} recent Zoom recording(s)` })
      if (connected.stackone && !has('stackone') && ['external', 'stakeholder'].includes(member.relationship_type))
        recommendations.push({ tool: 'stackone', action: 'add', reason: 'CRM/HR context available for this relationship' })
      if (has('zoom') && !connected.zoom)
        recommendations.push({ tool: 'zoom', action: 'remove', reason: 'Zoom is not connected' })
      if (has('slack') && connected.slack && signals.slack_messages_14d === 0)
        recommendations.push({ tool: 'slack', action: 'remove', reason: 'No recent Slack activity with this person' })
    }

    // ── Log (best-effort) ───────────────────────────────────────────────────
    try {
      await supabase.from('cos_agent_log').insert({
        user_id: userId,
        event_type: 'tools_recommended',
        member_id: teamMemberId,
        payload: { current_tools: currentTools, connected, signals, recommendations },
      })
    } catch (_) { /* non-fatal */ }

    return jsonResponse({ current_tools: currentTools, connected, recommendations }, 200)
  } catch (error) {
    return jsonResponse({ error: (error as Error).message }, 500)
  }
})
