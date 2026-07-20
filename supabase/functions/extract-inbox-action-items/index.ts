import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"
import Anthropic from "npm:@anthropic-ai/sdk"
import { retryWithBackoff } from "../_shared/retryWithBackoff.ts"
import {
  classifySenderTier,
  shouldSuppressMessage,
  shouldSuppressIntent,
  shouldIncludeSlackMessage,
  normalizeChannelName,
  parseSenderEmail,
  inferSuppressionRules,
  SUPPRESSED_BY_DEFAULT,
  type SenderTier,
  type IntentType,
  type SuppressionRules,
} from "../_shared/inboxTriageUtils.ts"

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

// SenderTier, IntentType, SUPPRESSED_BY_DEFAULT, SuppressionRules imported from inboxTriageUtils

interface ScanItem {
  id: string                    // synthetic id referenced by the model, e.g. "s3"
  source: 'slack' | 'gmail'
  sourceId: string              // stable id for source_ref, e.g. "C123:170000.001" or a gmail message id
  label: string                 // human-readable origin, e.g. "#launch-plan" or "Email from jane@co.com"
  text: string
  senderEmail?: string          // gmail only
  senderTier?: SenderTier       // gmail only
  gmailUrl?: string             // gmail only — direct link to thread
}

// IntentType, SUPPRESSED_BY_DEFAULT imported from inboxTriageUtils

interface Finding {
  item_id: string
  intent_type: IntentType
  summary: string
  rationale: string
  owed_by: 'me' | 'them' | null
  due_date: string | null
}

const ai = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') })

async function extractFindings(items: ScanItem[]): Promise<Finding[]> {
  const numbered = items.map(i => `${i.id}) [${i.label}] ${i.text}`).join('\n')
  const todayIso = new Date().toISOString().slice(0, 10)

  const msg = await ai.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 4096,
    system: `Today's date is ${todayIso}. You review a batch of Slack messages and
emails for things the reader should not miss: direct questions aimed at them,
requests for action or decisions, introductions to new people, threads where
a decision is stalled waiting on them, commitments that need follow-up, and
deadline or training reminders that require the reader to complete something.
Automated emails (from no-reply or system addresses) still qualify if they
contain a concrete action the reader must take — e.g. complete a training,
fill out a form, approve a request, respond by a deadline.
Ignore small talk, FYI-only updates, acknowledgments ("thanks!", "sounds good"),
and anything already fully resolved within the same text.

Respond ONLY with valid JSON: an array of
{"item_id": "<id from the list>",
 "intent_type": "question"|"request"|"introduction"|"decision_needed"|"fyi",
 "summary": "<one-line paraphrase, imperative or question form, under 140 chars>",
 "rationale": "<one short clause on why this needs attention>",
 "owed_by": "me"|"them"|null,
 "due_date": "<YYYY-MM-DD>"|null}.

intent_type rules:
- "question": sender is asking the reader something that needs an answer.
- "request": sender is asking the reader to do something or decide something.
- "introduction": sender is introducing the reader to a new person or opportunity.
- "decision_needed": a thread has stalled and the reader needs to unblock it.
- "fyi": informational only — no response or action implied.

owed_by rules:
- "me": the reader is being asked for something and hasn't clearly delivered it.
- "them": someone else owes the reader a response or deliverable.
- null: no clear directionality, or FYI.

For "due_date", resolve any explicit or clearly-implied deadline to an
absolute YYYY-MM-DD date — e.g. "by Friday" → next Friday, "EOD tomorrow" →
tomorrow. Use null when no deadline is stated or implied.
Return [] if nothing qualifies.`,
    messages: [{ role: 'user', content: numbered }],
  })

  const raw = (msg.content[0] as { text: string }).text
  // Strip markdown code fences if Claude wraps the JSON (```json ... ``` or ``` ... ```)
  const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
  try {
    const parsed = JSON.parse(text)
    if (!Array.isArray(parsed)) return []
    const isoDateRe = /^\d{4}-\d{2}-\d{2}$/
    const validIntents: IntentType[] = ['question', 'request', 'introduction', 'decision_needed', 'fyi']
    return (parsed as Finding[]).map(f => ({
      ...f,
      intent_type: validIntents.includes(f.intent_type) ? f.intent_type : 'fyi',
      owed_by: f.owed_by === 'me' || f.owed_by === 'them' ? f.owed_by : null,
      due_date: typeof f.due_date === 'string' && isoDateRe.test(f.due_date) ? f.due_date : null,
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
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
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
    } else if (jwt && jwt !== serviceRoleKey && jwt !== anonKey) {
      // User JWT: manual invocation from the frontend ("Scan now").
      const { data: userData, error: userErr } = await supabase.auth.getUser(jwt)
      if (userErr || !userData?.user) return jsonResponse({ error: 'invalid_token' }, 401)
      targetUserIds = [userData.user.id]
    } else {
      // Cron mode: no JWT, service-role key, or anon key.
      // pg_net on some Supabase project configs appends the anon key as the
      // Authorization header even when the migration omits it — treating the
      // anon key as equivalent to no token keeps the cron working correctly.
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

        // The channel allowlist a user configures in Settings → Briefs &
        // Schedule → Tools is stored on cos_prep_schedule.slack_channels —
        // that's the source of truth, not user_slack_credentials.sync_channels
        // (which nothing in the codebase ever writes to). Merge both so a
        // user's selection there takes effect on this scheduled scan, not
        // just via the manual "Sync now" button.
        const { data: scheduleRow } = await supabase
          .from('cos_prep_schedule')
          .select('slack_channels')
          .eq('user_id', userId)
          .maybeSingle()
        const scheduleChannels: string[] = Array.isArray(scheduleRow?.slack_channels) ? scheduleRow.slack_channels : []
        const credsChannels: string[] = Array.isArray(slackCreds?.sync_channels) ? slackCreds.sync_channels : []
        const syncChannels: string[] = Array.from(new Set([...scheduleChannels, ...credsChannels]))

        // DMs are always scanned once Slack is connected — they aren't part
        // of the channel allowlist (syncChannels), which only opts specific
        // *channels* in. slack-messages-sync itself already syncs DMs
        // unconditionally (its own step 1, independent of the channels
        // param), so gating this whole block on syncChannels.length > 0 was
        // silently skipping DMs (and re-syncing) for anyone who hadn't opted
        // any channels in.
        if (slackCreds?.access_token) {
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

          const normalizedChannels = syncChannels.map(normalizeChannelName)
          const { data: slackMsgs } = await supabase
            .from('cos_slack_messages')
            .select('channel_id, channel_name, sender_name, content, message_date, message_ts, is_dm')
            .eq('user_id', userId)
            .gt('message_date', since)
            .order('message_date', { ascending: true })
            .limit(MAX_ITEMS_PER_RUN)

          for (const m of (slackMsgs ?? []) as Array<{
            channel_id: string; channel_name: string | null; sender_name: string | null
            content: string; message_date: string; message_ts: string; is_dm: boolean
          }>) {
            if (!shouldIncludeSlackMessage(m.is_dm, m.channel_name, normalizedChannels)) continue
            items.push({
              id: `s${items.length}`,
              source: 'slack',
              sourceId: `${m.channel_id}:${m.message_ts}`,
              label: m.is_dm ? `DM from ${m.sender_name ?? 'unknown'}` : `#${m.channel_name} — ${m.sender_name ?? 'unknown'}`,
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

        // Inbox triage is opt-in — skip Gmail scan if user hasn't enabled it.
        // Also load suppression rules for filtering before insert.
        const { data: triagePref } = await supabase
          .from('email_triage_preferences')
          .select('enabled, suppressed_senders, suppressed_domains, suppressed_intents, max_thread_age_hours')
          .eq('user_id', userId)
          .maybeSingle()
        const inboxTriageEnabled = triagePref?.enabled ?? false
        const suppressedSenders = new Set<string>((triagePref?.suppressed_senders ?? []) as string[])
        const suppressedDomains = new Set<string>((triagePref?.suppressed_domains ?? []) as string[])
        const suppressedIntents = new Set<string>((triagePref?.suppressed_intents ?? []) as string[])
        const maxThreadAgeHours: number | null = (triagePref?.max_thread_age_hours as number | null) ?? null

        if (calCreds?.access_token && hasGmailScope && inboxTriageEnabled) {
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
            const refreshRes = await retryWithBackoff(
              () => fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: form.toString(),
              }),
              { integration: 'gmail', label: 'refresh access token' },
            )
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
            const listRes = await retryWithBackoff(
              () => fetch(listUrl.toString(), { headers: { Authorization: `Bearer ${accessToken}` } }),
              { integration: 'gmail', label: 'list messages' },
            )
            if (listRes.ok) {
              const listData = await listRes.json() as { messages?: Array<{ id: string }> }

              // Build a sent-mail lookup for sender tier classification.
              // Active = user has replied to this sender at least once.
              // Known = sender has emailed user; no reply on record.
              // Unknown = no prior email history → skip entirely.
              // We query sent mail once per batch run, not per message.
              const sentAddresses = new Set<string>()
              try {
                const sentRes = await retryWithBackoff(
                  () => fetch(
                    'https://gmail.googleapis.com/gmail/v1/users/me/messages?q=in:sent&maxResults=500',
                    { headers: { Authorization: `Bearer ${accessToken}` } },
                  ),
                  { integration: 'gmail', label: 'list sent messages' },
                )
                if (sentRes.ok) {
                  const sentData = await sentRes.json() as { messages?: Array<{ id: string }> }
                  // Fetch To headers in parallel (batched to avoid rate limits)
                  const sentIds = (sentData.messages ?? []).map(m => m.id).slice(0, 100)
                  await Promise.all(sentIds.map(async (sid) => {
                    try {
                      const sr = await fetch(
                        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${sid}?format=metadata&metadataHeaders=To`,
                        { headers: { Authorization: `Bearer ${accessToken}` } },
                      )
                      if (!sr.ok) return
                      const sd = await sr.json() as { payload?: { headers?: Array<{ name: string; value: string }> } }
                      const toHeader = sd.payload?.headers?.find(h => h.name.toLowerCase() === 'to')?.value ?? ''
                      // Extract email addresses from the To header
                      const emails = toHeader.match(/[\w.+-]+@[\w.-]+\.\w+/g) ?? []
                      emails.forEach(e => sentAddresses.add(e.toLowerCase()))
                    } catch { /* skip */ }
                  }))
                }
              } catch (err) {
                console.warn(`extract-inbox-action-items: sent-mail lookup failed for ${userId}:`, (err as Error).message)
              }

              for (const { id } of listData.messages ?? []) {
                const msgRes = await retryWithBackoff(
                  () => fetch(
                    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
                    { headers: { Authorization: `Bearer ${accessToken}` } },
                  ),
                  { integration: 'gmail', label: 'get message' },
                )
                if (!msgRes.ok) continue
                const detail = await msgRes.json() as {
                  snippet?: string
                  threadId?: string
                  internalDate?: string
                  payload?: { headers?: Array<{ name: string; value: string }> }
                }
                const headers = detail.payload?.headers ?? []
                const from = headers.find(h => h.name.toLowerCase() === 'from')?.value ?? 'unknown sender'
                const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value ?? '(no subject)'

                const senderEmail = parseSenderEmail(from)
                const tier = classifySenderTier(senderEmail, sentAddresses)
                if (tier === null) continue
                const senderTier: SenderTier = tier

                const internalDateMs = detail.internalDate
                  ? parseInt(detail.internalDate as string, 10)
                  : null
                const suppressionRules: SuppressionRules = {
                  suppressedSenders,
                  suppressedDomains,
                  suppressedIntents,
                  maxThreadAgeHours,
                }
                if (shouldSuppressMessage(senderEmail, internalDateMs, suppressionRules)) continue

                const gmailUrl = detail.threadId
                  ? `https://mail.google.com/mail/u/0/#inbox/${detail.threadId}`
                  : 'https://mail.google.com'

                items.push({
                  id: `g${items.length}`,
                  source: 'gmail',
                  sourceId: id,
                  label: `Email from ${from}`,
                  text: `${subject} — ${(detail.snippet ?? '').slice(0, MAX_TEXT_LEN)}`,
                  senderEmail: senderEmail ?? undefined,
                  senderTier,
                  gmailUrl,
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

            const intentSuppressed = source.source === 'gmail'
              ? shouldSuppressIntent(finding.intent_type, suppressedIntents)
              : SUPPRESSED_BY_DEFAULT.includes(finding.intent_type)
            if (intentSuppressed) continue

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
                intent_type: finding.intent_type,
                ...(source.senderEmail ? { sender_email: source.senderEmail } : {}),
                ...(source.senderTier ? { sender_tier: source.senderTier } : {}),
                ...(source.gmailUrl ? { gmail_url: source.gmailUrl } : {}),
                action_required: true,
                cta_label: source.source === 'gmail' ? 'Reply in Gmail' : 'Add to inbox',
                cta_action: 'approve_suggestion',
              },
              source_ref: { type: sourceRefType, id: source.sourceId },
              owed_by: finding.owed_by,
              ...(finding.due_date
                ? { priority_due_at: `${finding.due_date}T00:00:00Z`, priority_fixed: true }
                : {}),
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

        // ── Suppression inference ───────────────────────────────────────────
        // After each scan, check dismissal patterns and update per-user
        // suppression rules. Runs only when inbox triage is enabled and
        // Gmail was scanned this run (no point inferring if there's no signal).
        if (inboxTriageEnabled && scannedGmail) {
          try {
            const { data: dismissals } = await supabase
              .from('email_dismissal_log')
              .select('sender_email, sender_domain, intent_type')
              .eq('user_id', userId)

            if (dismissals && dismissals.length >= 3) {
              const { newSenders, newDomains, newIntents } = inferSuppressionRules(
                dismissals as Array<{ sender_email: string | null; sender_domain: string | null; intent_type: string | null }>,
              )

              const merged = (existing: string[], additions: string[]) =>
                Array.from(new Set([...existing, ...additions]))

              if (newSenders.length || newDomains.length || newIntents.length) {
                const { data: cur } = await supabase
                  .from('email_triage_preferences')
                  .select('suppressed_senders, suppressed_domains, suppressed_intents')
                  .eq('user_id', userId)
                  .maybeSingle()

                await supabase.from('email_triage_preferences').upsert({
                  user_id: userId,
                  suppressed_senders: merged(cur?.suppressed_senders ?? [], newSenders),
                  suppressed_domains: merged(cur?.suppressed_domains ?? [], newDomains),
                  suppressed_intents: merged(cur?.suppressed_intents ?? [], newIntents),
                  updated_at: new Date().toISOString(),
                }, { onConflict: 'user_id' })
              }
            }
          } catch (err) {
            console.warn(`extract-inbox-action-items: suppression inference failed for ${userId}:`, (err as Error).message)
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
