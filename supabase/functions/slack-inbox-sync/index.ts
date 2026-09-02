import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"
import { geminiGenerateText } from "../_shared/gemini.ts"
import { logAiUsage } from "../_shared/aiUsage.ts"
import {
  readScanCursor,
  isInCooldown,
  scanWindowStartMs,
  advanceScanCursor,
} from "../_shared/scanCursor.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Slack deep link: works across workspaces (redirects when logged in).
// ts format: "1716000000.123456" → "1716000000123456"
function slackUrl(channelId: string, ts: string): string {
  return `https://slack.com/archives/${channelId}/p${ts.replace('.', '')}`
}

function normalizeWords(text: string): Set<string> {
  return new Set(text.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 3))
}

function isSimilarText(a: string, b: string, threshold = 0.45): boolean {
  const wa = normalizeWords(a)
  const wb = normalizeWords(b)
  if (wa.size === 0 || wb.size === 0) return false
  let intersection = 0
  for (const w of wa) if (wb.has(w)) intersection++
  const union = wa.size + wb.size - intersection
  return union > 0 && intersection / union >= threshold
}

interface InboxTagRow { id: string; name: string; type: string; color: string }
interface TagSuggestion { tag_id: string; tag_name: string; color: string; reason: string }

async function suggestTagsForSuggestion(
  googleApiKey: string,
  tags: InboxTagRow[],
  opts: { title: string; rawContext: string | null },
): Promise<TagSuggestion[]> {
  if (tags.length === 0) return []
  const tagList = tags.map(t => `- ${t.name} (type: ${t.type}, id: ${t.id})`).join('\n')
  const prompt = `You are a tagging assistant for a team productivity tool. Suggest which tags best match a task extracted from a Slack message.

SUGGESTED TASK
Title: "${opts.title}"
${opts.rawContext ? `Context: "${opts.rawContext}"` : ''}

AVAILABLE TAGS
${tagList}

Return at most 2 tags. Only suggest if confident. A person tag fits ONLY if that person is explicitly assigned the action. Return valid JSON only.
Schema: [{ "tag_id": "<id>", "tag_name": "<name>", "color": "<hex>", "reason": "<one sentence>" }]`

  try {
    const raw = await geminiGenerateText(googleApiKey, prompt, {
      label: 'suggest slack tags',
      log: { functionName: 'slack-inbox-sync' },
    })
    const jsonStr = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const parsed = JSON.parse(jsonStr)
    if (!Array.isArray(parsed)) return []
    const tagMap = new Map(tags.map(t => [t.id, t]))
    return parsed
      .filter((s: { tag_id?: string }) => s.tag_id && tagMap.has(s.tag_id))
      .slice(0, 2)
      .map((s: { tag_id: string; reason?: string }) => {
        const tag = tagMap.get(s.tag_id)!
        return { tag_id: tag.id, tag_name: tag.name, color: tag.color, reason: String(s.reason ?? '').slice(0, 120) }
      })
  } catch (err) {
    console.error('slack-inbox-sync: suggestTagsForSuggestion failed:', err)
    return []
  }
}

interface SlackMessageRow {
  channel_id: string
  channel_name: string | null
  message_ts: string
  thread_ts: string | null
  sender_slack_id: string | null
  sender_name: string | null
  content: string
  is_dm: boolean
  message_date: string
}

interface SlackThread {
  channelId: string
  channelName: string | null
  isDm: boolean
  rootTs: string            // COALESCE(thread_ts, message_ts) of root msg
  messages: SlackMessageRow[]
  sourceId: string          // "{channelId}:{rootTs}"
}

// Auto-resolves pending Slack suggestions the user has since answered directly
// in Slack: a message of their own in the same channel/DM after the flagged
// thread root means the suggestion is handled, so it leaves the panel without
// polluting the accepted/dismissed learning history (status 'resolved' skips
// the outcome_at trigger). Pure DB work — runs on every invocation, cooldown
// or not.
async function resolveAnsweredSlackSuggestions(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  mySlackId: string,
): Promise<number> {
  if (!mySlackId) return 0
  const { data: pending } = await supabase
    .from('dci_suggested_tasks')
    .select('id, source_thread_id')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .in('source_type', ['slack_dm', 'slack_channel'])
    .not('source_thread_id', 'is', null)
    .limit(50)

  let resolved = 0
  for (const row of (pending ?? []) as Array<{ id: string; source_thread_id: string }>) {
    const [channelId, rootTs] = row.source_thread_id.split(':')
    if (!channelId || !rootTs) continue
    const { data: laterOwn } = await supabase
      .from('cos_slack_messages')
      .select('id')
      .eq('user_id', userId)
      .eq('channel_id', channelId)
      .eq('sender_slack_id', mySlackId)
      .gt('message_ts', rootTs)
      .limit(1)
    if (laterOwn && laterOwn.length > 0) {
      const { error } = await supabase
        .from('dci_suggested_tasks')
        .update({ status: 'resolved' })
        .eq('id', row.id)
        .eq('status', 'pending')
      if (!error) resolved++
    }
  }
  return resolved
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const googleApiKey = Deno.env.get('GOOGLE_AI_API_KEY') ?? ''

    if (!googleApiKey) return jsonResponse({ error: 'google_ai_api_key_not_configured' }, 500)

    // Auth: service-role from agent-tick or user JWT.
    const authHeader = req.headers.get('Authorization') ?? ''
    const xUserId = req.headers.get('x-supabase-user-id') ?? ''
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()

    let userId: string
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    if (xUserId && token === serviceRoleKey) {
      userId = xUserId
    } else if (token && token !== serviceRoleKey) {
      const { data: { user }, error } = await supabase.auth.getUser(token)
      if (error || !user) return jsonResponse({ error: 'unauthorized' }, 401)
      userId = user.id
    } else {
      return jsonResponse({ error: 'unauthorized' }, 401)
    }

    const body = await req.json().catch(() => ({})) as { days?: number }
    const days = Math.min(Math.max(body.days ?? 7, 1), 30)

    // ── 1. Check Slack credentials ──────────────────────────────────────────
    const { data: creds } = await supabase
      .from('user_slack_credentials')
      .select('access_token, slack_user_id, slack_team_id')
      .eq('user_id', userId)
      .maybeSingle()

    if (!creds?.access_token) return jsonResponse({ skipped: 'no_slack_credentials', suggestions_added: 0 }, 200)

    const mySlackId: string = creds.slack_user_id ?? ''

    // Validation pass (free, every invocation): close out suggestions the user
    // already answered in Slack itself.
    const resolvedCount = await resolveAnsweredSlackSuggestions(supabase, userId, mySlackId)

    // Cost guardrail: a completed scan in the last 10 minutes means there is
    // nothing meaningfully new — skip the fetch + LLM extraction entirely so
    // repeated refresh-button clicks don't burn model calls.
    const cursorMs = await readScanCursor(supabase, userId, 'slack_suggestions')
    if (isInCooldown(cursorMs)) {
      return jsonResponse({ skipped: 'cooldown', suggestions_added: 0, suggestions_resolved: resolvedCount }, 200)
    }

    // ── 2. Load recent messages from cos_slack_messages ─────────────────────
    // Incremental: only since the last completed scan (24h overlap for retry
    // safety — suggestion_source_processed dedups anything re-fetched), capped
    // at the requested days window.
    const since = new Date(scanWindowStartMs(cursorMs, days)).toISOString()
    const { data: msgRows, error: msgErr } = await supabase
      .from('cos_slack_messages')
      .select('channel_id, channel_name, message_ts, thread_ts, sender_slack_id, sender_name, content, is_dm, message_date')
      .eq('user_id', userId)
      .gte('message_date', since)
      .order('message_date', { ascending: true })

    if (msgErr) return jsonResponse({ error: msgErr.message }, 500)
    const messages = (msgRows ?? []) as SlackMessageRow[]
    if (messages.length === 0) {
      await advanceScanCursor(supabase, userId, 'slack_suggestions')
      return jsonResponse({ processed: 0, suggestions_added: 0, suggestions_resolved: resolvedCount, message: 'no_messages' }, 200)
    }

    // ── 3. Group into threads ───────────────────────────────────────────────
    // Thread key: "{channel_id}:{root_ts}" where root_ts = thread_ts ?? message_ts
    const threadMap = new Map<string, SlackThread>()
    for (const msg of messages) {
      const rootTs = msg.thread_ts ?? msg.message_ts
      const sourceId = `${msg.channel_id}:${rootTs}`
      if (!threadMap.has(sourceId)) {
        threadMap.set(sourceId, {
          channelId: msg.channel_id,
          channelName: msg.channel_name,
          isDm: msg.is_dm,
          rootTs,
          messages: [],
          sourceId,
        })
      }
      threadMap.get(sourceId)!.messages.push(msg)
    }

    const allThreads = Array.from(threadMap.values())

    // ── 4. Skip already-processed threads ──────────────────────────────────
    const allSourceIds = allThreads.map(t => t.sourceId)
    const { data: processedRows } = await supabase
      .from('suggestion_source_processed')
      .select('source_id')
      .eq('user_id', userId)
      .in('source_type', ['slack_dm', 'slack_channel'])
      .in('source_id', allSourceIds)

    const processedIds = new Set((processedRows ?? []).map((r: { source_id: string }) => r.source_id))
    const unprocessed = allThreads.filter(t => !processedIds.has(t.sourceId))

    if (unprocessed.length === 0) {
      await advanceScanCursor(supabase, userId, 'slack_suggestions')
      return jsonResponse({ processed: 0, suggestions_added: 0, suggestions_resolved: resolvedCount, message: 'all_already_processed' }, 200)
    }

    // Cap at 40 threads per run to stay within time budget.
    const toProcess = unprocessed.slice(0, 40)

    // ── 5. Filter out threads where all messages are from the user ──────────
    // (nothing to act on if only we spoke)
    const actionable = toProcess.filter(t => {
      if (!mySlackId) return true
      return t.messages.some(m => m.sender_slack_id && m.sender_slack_id !== mySlackId)
    })

    // ── 6. Load context for prompts ─────────────────────────────────────────
    const [inboxTagsRes, recentOutcomesRes, existingPendingRes] = await Promise.all([
      supabase.from('inbox_tags').select('id, name, type, color').eq('user_id', userId).in('type', ['project', 'folder', 'person']).is('parent_id', null),
      supabase.from('dci_suggested_tasks')
        .select('title, raw_context, status')
        .eq('user_id', userId)
        .in('status', ['accepted', 'dismissed'])
        .not('outcome_at', 'is', null)
        .order('outcome_at', { ascending: false })
        .limit(40),
      supabase.from('dci_suggested_tasks').select('title').eq('user_id', userId).eq('status', 'pending'),
    ])

    const inboxTags = (inboxTagsRes.data ?? []) as InboxTagRow[]
    const existingTitles = (existingPendingRes.data ?? []).map((r: { title: string }) => r.title)
    const { data: openItems } = await supabase.from('inbox_items').select('text').eq('user_id', userId).eq('status', 'open')
    const existingTexts = [...existingTitles, ...(openItems ?? []).map((r: { text: string }) => r.text)]

    const outcomes = (recentOutcomesRes.data ?? []) as Array<{ title: string; raw_context: string | null; status: string }>
    const accepted = outcomes.filter(o => o.status === 'accepted').slice(0, 10)
    const dismissed = outcomes.filter(o => o.status === 'dismissed').slice(0, 10)
    let learningSection = ''
    if (accepted.length > 0 || dismissed.length > 0) {
      learningSection = '\nUSER FEEDBACK HISTORY (calibrate based on this)\n'
      if (accepted.length > 0) learningSection += 'Recently ACCEPTED:\n' + accepted.map(o => `- "${o.title}"`).join('\n') + '\n'
      if (dismissed.length > 0) learningSection += 'Recently DISMISSED (avoid similar):\n' + dismissed.map(o => `- "${o.title}"`).join('\n') + '\n'
    }

    // ── 7. Batch threads to Gemini ──────────────────────────────────────────
    const BATCH_SIZE = 6
    const allItems: Array<{
      sourceId: string
      isDm: boolean
      channelId: string
      rootTs: string
      title: string
      urgency: string
      rationale: string
      raw_context: string
      source: string
    }> = []
    // Threads whose batch failed to extract (Gemini error / bad JSON) — excluded from
    // suggestion_source_processed below so they're retried on the next tick instead of
    // being silently lost forever.
    const failedSourceIds = new Set<string>()

    for (let i = 0; i < actionable.length; i += BATCH_SIZE) {
      const batch = actionable.slice(i, i + BATCH_SIZE)

      const threadsSection = batch.map((t, idx) => {
        const label = t.isDm
          ? `DM with ${t.messages.find(m => m.sender_slack_id !== mySlackId)?.sender_name ?? 'colleague'}`
          : `#${t.channelName ?? t.channelId}`
        const transcript = t.messages
          .map(m => `${m.sender_name ?? 'Unknown'}: ${m.content}`)
          .join('\n')
        return `--- THREAD ${idx + 1} ---\nSource-ID: ${t.sourceId}\nChannel: ${label}\nMessages:\n${transcript}`
      }).join('\n\n')

      const prompt = `You are an executive assistant analyzing Slack messages to identify genuine action items.
${learningSection}
INSTRUCTIONS
- Extract ONLY items where the user needs to DO something, DECIDE something, or RESPOND.
- Prioritize: direct asks, questions awaiting the user's answer, explicit assignments, deadlines.
- Skip: FYI updates, reactions, bot messages, things already resolved in the thread, casual banter.
- For DMs: focus on asks from the other person. For channels: focus on @-mentions or direct asks to the user.
- Urgency: "urgent" = time-sensitive or explicitly asked ASAP, "this_week" = needs attention soon, "watching" = low priority.
- raw_context: the exact Slack message text that justifies this (max 150 chars).
- Include Source-ID exactly as shown. Omit threads with no genuine action item. Max 2 items per thread.

THREADS TO ANALYZE
${threadsSection}

Respond with valid JSON only:
[{"source_id":"<Source-ID>","title":"<action item max 80 chars>","urgency":"urgent|this_week|watching","rationale":"<one sentence>","raw_context":"<verbatim message text max 150 chars>","source":"<sender name>"}]`

      const markBatchFailed = async (reason: string) => {
        for (const t of batch) failedSourceIds.add(t.sourceId)
        console.error('slack-inbox-sync: batch extraction failed, will retry next tick:', reason)
        await supabase.from('cos_agent_log').insert({
          user_id: userId,
          event_type: 'error',
          payload: { handler: 'slack_inbox_sync_extract', error: reason, thread_count: batch.length },
        })
      }

      try {
        const geminiRes = await fetch(
          'https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': googleApiKey },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
          },
        )
        if (!geminiRes.ok) { await markBatchFailed(`gemini_http_${geminiRes.status}: ${await geminiRes.text()}`); continue }
        // deno-lint-ignore no-explicit-any
        const geminiData = await geminiRes.json() as any
        await logAiUsage('slack-inbox-sync', {
          model: 'gemini-2.5-flash',
          inputTokens: geminiData?.usageMetadata?.promptTokenCount ?? 0,
          outputTokens: geminiData?.usageMetadata?.candidatesTokenCount ?? 0,
          userId,
        })
        const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
        const jsonStr = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
        let parsed: Array<{ source_id?: string; title?: string; urgency?: string; rationale?: string; raw_context?: string; source?: string }> = []
        try { parsed = JSON.parse(jsonStr) } catch { await markBatchFailed(`json_parse_error: ${jsonStr.slice(0, 300)}`); continue }
        if (!Array.isArray(parsed)) { await markBatchFailed('gemini_response_not_array'); continue }

        for (const item of parsed) {
          const thread = batch.find(t => t.sourceId === item.source_id)
          if (!thread || !item.title?.trim()) continue
          allItems.push({
            sourceId: thread.sourceId,
            isDm: thread.isDm,
            channelId: thread.channelId,
            rootTs: thread.rootTs,
            title: item.title.trim().slice(0, 200),
            urgency: ['urgent', 'this_week', 'watching'].includes(item.urgency ?? '') ? item.urgency! : 'this_week',
            rationale: (item.rationale ?? '').slice(0, 300),
            raw_context: (item.raw_context ?? '').slice(0, 300),
            source: (item.source ?? '').slice(0, 200),
          })
        }
      } catch (err) { await markBatchFailed((err as Error).message) }
    }

    // ── 8. Deduplicate + insert ─────────────────────────────────────────────
    const today = new Date().toISOString().slice(0, 10)
    let suggestionsAdded = 0
    const addedBySourceId = new Map<string, number>()

    for (const item of allItems) {
      if (existingTexts.some(t => isSimilarText(item.title, t))) continue

      const tagSuggestions = await suggestTagsForSuggestion(googleApiKey, inboxTags, {
        title: item.title,
        rawContext: item.raw_context || null,
      })

      const sourceType = item.isDm ? 'slack_dm' : 'slack_channel'
      const sourceUrl = slackUrl(item.channelId, item.rootTs)

      const { error: insertErr } = await supabase.from('dci_suggested_tasks').insert({
        user_id: userId,
        date: today,
        title: item.title,
        source: item.source || (item.isDm ? 'Slack DM' : `#${item.sourceId.split(':')[0]}`),
        source_type: sourceType,
        source_thread_id: item.sourceId,
        source_url: sourceUrl,
        urgency: item.urgency,
        rationale: item.rationale,
        raw_context: item.raw_context,
        tag_suggestions: tagSuggestions,
      })

      if (!insertErr) {
        suggestionsAdded++
        existingTexts.push(item.title)
        addedBySourceId.set(item.sourceId, (addedBySourceId.get(item.sourceId) ?? 0) + 1)
      } else {
        // A DB insert failure for an already-successfully-extracted item was
        // previously unlogged AND not excluded from processed-marking below —
        // the thread would be marked "processed" and this action item
        // permanently lost, the same class of bug as item 19
        // (SPECIFICATION.md §13.16) just one step later in the pipeline.
        failedSourceIds.add(item.sourceId)
        console.error('slack-inbox-sync: dci_suggested_tasks insert failed:', insertErr)
        await supabase.from('cos_agent_log').insert({
          user_id: userId,
          event_type: 'error',
          payload: { handler: 'dci_suggested_tasks_insert', source_id: item.sourceId, error: insertErr.message },
        })
      }
    }

    // ── 9. Mark processed threads ───────────────────────────────────────────
    // Mark both actionable and skipped (user-only) threads so we don't retry —
    // but never mark a thread whose extraction batch failed, so it's retried
    // next tick instead of being silently dropped forever.
    const allToMark = toProcess.filter(t => !failedSourceIds.has(t.sourceId))
    if (allToMark.length > 0) {
      await supabase.from('suggestion_source_processed').insert(
        allToMark.map(t => ({
          user_id: userId,
          source_type: t.isDm ? 'slack_dm' : 'slack_channel',
          source_id: t.sourceId,
          suggestions_added: addedBySourceId.get(t.sourceId) ?? 0,
        }))
      )
    }

    // Failed threads stay retryable through the 24h fetch-window overlap even
    // though the cursor advances — they were excluded from
    // suggestion_source_processed above, so the next run re-analyzes them.
    await advanceScanCursor(supabase, userId, 'slack_suggestions')

    return jsonResponse({
      processed: actionable.length,
      suggestions_added: suggestionsAdded,
      suggestions_resolved: resolvedCount,
      failed_threads: failedSourceIds.size,
    })

  } catch (err) {
    console.error('slack-inbox-sync error:', (err as Error).message)
    return jsonResponse({ error: (err as Error).message }, 500)
  }
})
