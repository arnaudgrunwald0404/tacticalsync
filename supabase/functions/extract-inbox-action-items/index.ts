import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"
import Anthropic from "npm:@anthropic-ai/sdk"

// ── Inbox action-item scanner ─────────────────────────────────────────────────
//
// Runs 4x/day (see the cron entry in 20260721000000_inbox_action_item_scan.sql).
// For each connected user, looks only at Slack/Gmail content newer than the
// last scan (cos_action_item_scan_state), asks Claude to flag anything that
// reads as an action item, question, or commitment, and lands each finding as
// an `agent_question` inbox item (the existing "Waiting" review view — see
// applyInboxClientFilters in src/lib/inboxValidation.ts — so nothing is
// auto-created without review). Dedup is by source_ref, same pattern as
// syncBriefItem in src/hooks/useInboxItems.ts.
//
// Two invocation modes, mirroring daily-prep-batch:
// 1. Cron mode (service-role key, no x-supabase-user-id): all connected users.
// 2. Manual mode (user JWT, or service-role + x-supabase-user-id): one user,
//    for a "Scan now" button.

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

const MAX_ITEMS_PER_RUN = 60
const MAX_TEXT_LEN = 300

interface ScanItem {
  id: string                    // synthetic id referenced by the model, e.g. "s3"
  source: 'slack' | 'gmail'
  sourceId: string              // stable id for source_ref, e.g. "C123:170000.001" or a gmail message id
  label: string                 // human-readable origin, e.g. "#launch-plan" or "Email from jane@co.com"
  text: string
}

interface Finding {
  item_id: string
  kind: 'action_item' | 'question' | 'commitment'
  summary: string
  rationale: string
  owed_by: 'me' | 'them' | null
}

const ai = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') })

async function extractFindings(items: ScanItem[]): Promise<Finding[]> {
  const numbered = items.map(i => `${i.id}) [${i.label}] ${i.text}`).join('\n')

  const msg = await ai.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 2048,
    system: `You review a batch of Slack messages and emails for things the reader
should not miss: explicit action items, direct questions aimed at them, and
commitments someone (them or someone else) made. Ignore small talk, FYI-only
notes, acknowledgments ("thanks!", "sounds good"), and anything already fully
resolved within the same text. Respond ONLY with valid JSON: an array of
{"item_id": "<id from the list>", "kind": "action_item"|"question"|"commitment",
"summary": "<one-line paraphrase, imperative or question form, under 140 chars>",
"rationale": "<one short clause on why this needs attention>",
"owed_by": "me"|"them"|null}.

For "owed_by", decide who owes the next response or action in the exchange,
from the reader's point of view:
- "me": the reader is the one being asked for something, and hasn't clearly
  delivered it yet — the reader is the blocker. Example: "Can you review this
  by Friday?" or "Waiting on your sign-off before we ship" directed at the
  reader → owed_by: "me".
- "them": someone else owes the reader a response or deliverable — the reader
  is waiting on them. Example: "I'll get you the numbers tomorrow" or "Let me
  check and get back to you" said TO the reader → owed_by: "them".
- null: there's no clear directionality — a pure FYI/announcement, a question
  with no obvious owner, or something already resolved. Example: "Heads up,
  the office is closed Monday" → owed_by: null.
Return [] if nothing qualifies.`,
    messages: [{ role: 'user', content: numbered }],
  })

  const text = (msg.content[0] as { text: string }).text
  try {
    const parsed = JSON.parse(text)
    if (!Array.isArray(parsed)) return []
    // Guard against the model returning something other than 'me'/'them'/null
    // for owed_by — the column has a check constraint, so an unexpected value
    // (or a missing field on an older/odd response) would fail the insert.
    return (parsed as Finding[]).map(f => ({
      ...f,
      owed_by: f.owed_by === 'me' || f.owed_by === 'them' ? f.owed_by : null,
    }))
  } catch {
    console.warn('extract-inbox-action-items: failed to parse Claude response:', text.slice(0, 200))
    return []
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405)
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const googleClientId = Deno.env.get('GOOGLE_CLIENT_ID') ?? ''
    const googleClientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? ''

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const authHeader = req.headers.get('Authorization') ?? ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim()
    const overrideUserId = req.headers.get('x-supabase-user-id')

    let targetUserIds: string[] = []

    if (overrideUserId && jwt === serviceRoleKey) {
      targetUserIds = [overrideUserId]
    } else if (jwt && jwt !== serviceRoleKey) {
      const { data: userData, error: userErr } = await supabase.auth.getUser(jwt)
      if (userErr || !userData?.user) return jsonResponse({ error: 'invalid_token' }, 401)
      targetUserIds = [userData.user.id]
    } else {
      // Cron mode: every user with either integration connected.
      const { data: slackUsers } = await supabase
        .from('user_slack_credentials')
        .select('user_id')
        .not('access_token', 'is', null)
      const { data: calUsers } = await supabase
        .from('user_calendar_credentials')
        .select('user_id, scope')
      const gmailUserIds = ((calUsers ?? []) as Array<{ user_id: string; scope: string | null }>)
        .filter(c => c.scope?.includes('gmail'))
        .map(c => c.user_id)
      targetUserIds = Array.from(new Set([
        ...((slackUsers ?? []) as Array<{ user_id: string }>).map(s => s.user_id),
        ...gmailUserIds,
      ]))
    }

    const results: Array<{ user_id: string; items_created: number; error?: string }> = []

    for (const userId of targetUserIds) {
      try {
        const items: ScanItem[] = []
        let scannedSlack = false
        let scannedGmail = false

        // ── Slack: refresh the cache, then read only what's new ────────────
        const { data: slackCreds } = await supabase
          .from('user_slack_credentials')
          .select('access_token, sync_channels')
          .eq('user_id', userId)
          .maybeSingle()

        const syncChannels: string[] = Array.isArray(slackCreds?.sync_channels) ? slackCreds.sync_channels : []

        if (slackCreds?.access_token && syncChannels.length > 0) {
          scannedSlack = true
          try {
            await fetch(`${supabaseUrl}/functions/v1/slack-messages-sync`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${serviceRoleKey}`,
                'Content-Type': 'application/json',
                'x-supabase-user-id': userId,
              },
              body: JSON.stringify({ days: 1, channels: syncChannels }),
            })
          } catch (err) {
            console.warn(`extract-inbox-action-items: slack-messages-sync failed for ${userId}:`, (err as Error).message)
          }

          const { data: cursorRow } = await supabase
            .from('cos_action_item_scan_state')
            .select('last_scanned_at')
            .eq('user_id', userId)
            .eq('source', 'slack')
            .maybeSingle()
          const since = cursorRow?.last_scanned_at ?? new Date(Date.now() - 24 * 3600_000).toISOString()

          const normalizedChannels = syncChannels.map(c => c.toLowerCase().replace(/^#/, ''))
          const { data: slackMsgs } = await supabase
            .from('cos_slack_messages')
            .select('channel_id, channel_name, sender_name, content, message_date, message_ts')
            .eq('user_id', userId)
            .eq('is_dm', false)
            .gt('message_date', since)
            .order('message_date', { ascending: true })
            .limit(MAX_ITEMS_PER_RUN)

          for (const m of (slackMsgs ?? []) as Array<{
            channel_id: string; channel_name: string | null; sender_name: string | null
            content: string; message_date: string; message_ts: string
          }>) {
            if (!m.channel_name || !normalizedChannels.includes(m.channel_name.toLowerCase())) continue
            items.push({
              id: `s${items.length}`,
              source: 'slack',
              sourceId: `${m.channel_id}:${m.message_ts}`,
              label: `#${m.channel_name} — ${m.sender_name ?? 'unknown'}`,
              text: m.content.slice(0, MAX_TEXT_LEN),
            })
          }
        }

        // ── Gmail: live inbox query since last scan ─────────────────────────
        const { data: calCreds } = await supabase
          .from('user_calendar_credentials')
          .select('access_token, refresh_token, expires_at, scope')
          .eq('user_id', userId)
          .maybeSingle()

        const hasGmailScope = calCreds?.scope?.includes('gmail') || calCreds?.scope?.includes('mail.google.com')

        if (calCreds?.access_token && hasGmailScope) {
          scannedGmail = true
          let accessToken = calCreds.access_token as string

          const needsRefresh = !calCreds.expires_at
            || (new Date(calCreds.expires_at).getTime() - Date.now() < 30_000)
          if (needsRefresh && calCreds.refresh_token) {
            const form = new URLSearchParams()
            form.set('client_id', googleClientId)
            form.set('client_secret', googleClientSecret)
            form.set('refresh_token', calCreds.refresh_token as string)
            form.set('grant_type', 'refresh_token')
            const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: form.toString(),
            })
            if (refreshRes.ok) {
              const refreshData = await refreshRes.json() as { access_token?: string; expires_in?: number }
              if (refreshData.access_token && typeof refreshData.expires_in === 'number') {
                accessToken = refreshData.access_token
                await supabase.from('user_calendar_credentials').update({
                  access_token: accessToken,
                  expires_at: new Date(Date.now() + refreshData.expires_in * 1000).toISOString(),
                }).eq('user_id', userId)
              }
            }
          }

          const { data: gmailCursorRow } = await supabase
            .from('cos_action_item_scan_state')
            .select('last_scanned_at')
            .eq('user_id', userId)
            .eq('source', 'gmail')
            .maybeSingle()
          const sinceEpochSec = Math.floor(
            new Date(gmailCursorRow?.last_scanned_at ?? Date.now() - 24 * 3600_000).getTime() / 1000,
          )

          try {
            const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages')
            listUrl.searchParams.set('q', `in:inbox after:${sinceEpochSec} -category:promotions -category:social`)
            listUrl.searchParams.set('maxResults', String(MAX_ITEMS_PER_RUN))
            const listRes = await fetch(listUrl.toString(), { headers: { Authorization: `Bearer ${accessToken}` } })
            if (listRes.ok) {
              const listData = await listRes.json() as { messages?: Array<{ id: string }> }
              for (const { id } of listData.messages ?? []) {
                const msgRes = await fetch(
                  `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
                  { headers: { Authorization: `Bearer ${accessToken}` } },
                )
                if (!msgRes.ok) continue
                const detail = await msgRes.json() as {
                  snippet?: string
                  payload?: { headers?: Array<{ name: string; value: string }> }
                }
                const headers = detail.payload?.headers ?? []
                const from = headers.find(h => h.name.toLowerCase() === 'from')?.value ?? 'unknown sender'
                const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value ?? '(no subject)'
                items.push({
                  id: `g${items.length}`,
                  source: 'gmail',
                  sourceId: id,
                  label: `Email from ${from}`,
                  text: `${subject} — ${(detail.snippet ?? '').slice(0, MAX_TEXT_LEN)}`,
                })
              }
            }
          } catch (err) {
            console.warn(`extract-inbox-action-items: gmail fetch failed for ${userId}:`, (err as Error).message)
          }
        }

        // ── Extract + upsert ────────────────────────────────────────────────
        let itemsCreated = 0
        if (items.length > 0) {
          const findings = await extractFindings(items)
          const byId = new Map(items.map(i => [i.id, i]))

          for (const finding of findings) {
            const source = byId.get(finding.item_id)
            if (!source) continue

            const sourceRefType = source.source === 'slack' ? 'slack_message' : 'gmail_message'
            const { data: existing } = await supabase
              .from('inbox_items')
              .select('id')
              .eq('user_id', userId)
              .eq('type', 'agent_question')
              .contains('source_ref', { type: sourceRefType, id: source.sourceId })
              .maybeSingle()

            if (existing) continue

            const { error: insertErr } = await supabase.from('inbox_items').insert({
              user_id: userId,
              type: 'agent_question',
              text: finding.summary.slice(0, 2000),
              agent_payload: {
                source: source.source,
                rationale: finding.rationale,
                action_required: true,
                cta_label: 'Add to inbox',
              },
              source_ref: { type: sourceRefType, id: source.sourceId },
              owed_by: finding.owed_by,
            })
            if (!insertErr) itemsCreated++
          }
        }

        // Advance cursors for every source actually checked this run, even if
        // nothing qualified — otherwise a quiet channel keeps rescanning the
        // same growing window on every future run.
        const nowIso = new Date().toISOString()
        for (const source of (['slack', 'gmail'] as const)) {
          if ((source === 'slack' && scannedSlack) || (source === 'gmail' && scannedGmail)) {
            await supabase.from('cos_action_item_scan_state').upsert({
              user_id: userId,
              source,
              last_scanned_at: nowIso,
              updated_at: nowIso,
            }, { onConflict: 'user_id,source' })
          }
        }

        results.push({ user_id: userId, items_created: itemsCreated })
      } catch (err) {
        results.push({ user_id: userId, items_created: 0, error: (err as Error).message })
      }
    }

    return jsonResponse({
      processed: results.length,
      total_items_created: results.reduce((sum, r) => sum + r.items_created, 0),
      results,
    }, 200)
  } catch (error) {
    return jsonResponse({ error: (error as Error).message }, 500)
  }
})
