import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"
import Anthropic from "npm:@anthropic-ai/sdk"

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

// ── HTML → plain text ────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function decodeBase64Url(s: string): string {
  const base64 = s.replace(/-/g, '+').replace(/_/g, '/')
  const pad = base64.length % 4 === 0 ? '' : '===='.slice(base64.length % 4)
  try {
    return atob(base64 + pad)
  } catch {
    return ''
  }
}

// ── Extract text body from Gmail message parts ───────────────────────────────

interface GmailPart {
  mimeType: string
  body?: { data?: string; size?: number }
  parts?: GmailPart[]
  headers?: Array<{ name: string; value: string }>
}

function extractBody(parts: GmailPart[], preferHtml = false): string {
  // Prefer text/plain; fall back to text/html stripped.
  const candidates: Array<{ type: string; text: string }> = []

  function walk(ps: GmailPart[]) {
    for (const p of ps) {
      if (p.parts) walk(p.parts)
      if (p.body?.data) {
        const text = decodeBase64Url(p.body.data)
        if (p.mimeType === 'text/plain') candidates.push({ type: 'plain', text })
        if (p.mimeType === 'text/html') candidates.push({ type: 'html', text: stripHtml(text) })
      }
    }
  }
  walk(parts)

  const plain = candidates.find(c => c.type === 'plain')
  const html = candidates.find(c => c.type === 'html')
  if (!preferHtml && plain) return plain.text
  return (html ?? plain)?.text ?? ''
}

// ── Word-overlap dedup (mirrors generate-meeting-suggestions) ────────────────

function normalizeWords(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 3)
  )
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

// ── Tag suggestion (mirrors generate-meeting-suggestions) ───────────────────

interface InboxTagRow { id: string; name: string; type: string; color: string }
interface TagSuggestion { tag_id: string; tag_name: string; color: string; reason: string }

async function suggestTagsForSuggestion(
  anthropic: Anthropic,
  tags: InboxTagRow[],
  opts: { title: string; rawContext: string | null },
): Promise<TagSuggestion[]> {
  if (tags.length === 0) return []
  const tagList = tags.map(t => `- ${t.name} (type: ${t.type}, id: ${t.id})`).join('\n')
  const prompt = `You are a tagging assistant for a team productivity tool. Your job is to suggest which tags from the user's library best match a suggested task extracted from an email.

SUGGESTED TASK
Title: "${opts.title}"
${opts.rawContext ? `Context quote: "${opts.rawContext}"` : ''}

AVAILABLE TAGS
${tagList}

INSTRUCTIONS
- Return at most 2 tags, ranked by confidence (most confident first).
- Only suggest a tag if you are reasonably sure it matches.
- If no tag fits, return an empty array.
- Do NOT invent tags — only use IDs from the list above.
- A project tag fits if the task is clearly about that initiative.
- A person tag fits ONLY if that person is explicitly assigned the action or is its direct subject. NEVER tag a person merely because they sent the email.

Respond with valid JSON only — no prose, no markdown fences.
Schema: [{ "tag_id": "<id>", "tag_name": "<name>", "color": "<hex>", "reason": "<one short sentence>" }]`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    })
    const raw = (message.content[0] as { type: string; text: string }).text.trim()
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
  } catch {
    return []
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY') ?? ''
    const googleApiKey = Deno.env.get('GOOGLE_AI_API_KEY') ?? ''

    if (!anthropicApiKey) return jsonResponse({ error: 'anthropic_api_key_not_configured' }, 500)
    if (!googleApiKey) return jsonResponse({ error: 'google_ai_api_key_not_configured' }, 500)

    // Auth: service-role from agent-tick (no Authorization header) or explicit user.
    const authHeader = req.headers.get('Authorization') ?? ''
    const xUserId = req.headers.get('x-supabase-user-id') ?? ''
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()

    let userId: string
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    if (xUserId) {
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

    // ── 1. Load Google credentials ──────────────────────────────────────────
    const { data: creds } = await supabase
      .from('user_calendar_credentials')
      .select('access_token, refresh_token, expires_at, scope')
      .eq('user_id', userId)
      .maybeSingle()

    if (!creds?.access_token) {
      return jsonResponse({ skipped: 'no_google_credentials', suggestions_added: 0 }, 200)
    }

    if (!creds.scope?.includes('gmail.readonly') && !creds.scope?.includes('https://www.googleapis.com/auth/gmail.readonly')) {
      return jsonResponse({ skipped: 'gmail_scope_not_granted', suggestions_added: 0 }, 200)
    }

    // Refresh token if within 60s of expiry.
    let accessToken = creds.access_token
    if (creds.expires_at && new Date(creds.expires_at).getTime() - Date.now() < 60_000) {
      if (!creds.refresh_token) return jsonResponse({ skipped: 'token_expired_no_refresh', suggestions_added: 0 }, 200)
      const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: Deno.env.get('GOOGLE_CLIENT_ID') ?? '',
          client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '',
          refresh_token: creds.refresh_token,
          grant_type: 'refresh_token',
        }),
      })
      const refreshData = await refreshRes.json() as { access_token?: string; expires_in?: number }
      if (!refreshData.access_token) return jsonResponse({ skipped: 'token_refresh_failed', suggestions_added: 0 }, 200)
      accessToken = refreshData.access_token
      await supabase.from('user_calendar_credentials').update({
        access_token: accessToken,
        expires_at: new Date(Date.now() + (refreshData.expires_in ?? 3600) * 1000).toISOString(),
      }).eq('user_id', userId)
    }

    // ── 2. Fetch recent Primary inbox threads ───────────────────────────────
    // category:primary excludes Promotions, Social, Updates, Forums tabs —
    // this covers newsletters, automated notifications, and calendar emails.
    const query = `in:inbox category:primary newer_than:${days}d`
    const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/threads')
    listUrl.searchParams.set('q', query)
    listUrl.searchParams.set('maxResults', '50')

    const listRes = await fetch(listUrl.toString(), {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })
    if (!listRes.ok) {
      const errText = await listRes.text()
      console.error('gmail-inbox-sync: thread list failed:', listRes.status, errText)
      return jsonResponse({ error: 'gmail_api_error', suggestions_added: 0 }, 200)
    }
    const listData = await listRes.json() as { threads?: Array<{ id: string }> }
    const threadIds = (listData.threads ?? []).map(t => t.id)

    if (threadIds.length === 0) {
      return jsonResponse({ processed: 0, suggestions_added: 0, message: 'no_threads' }, 200)
    }

    // ── 3. Skip already-processed threads ──────────────────────────────────
    const { data: processedRows } = await supabase
      .from('suggestion_source_processed')
      .select('source_id')
      .eq('user_id', userId)
      .eq('source_type', 'gmail_thread')
      .in('source_id', threadIds)

    const processedIds = new Set((processedRows ?? []).map((r: { source_id: string }) => r.source_id))
    const unprocessedIds = threadIds.filter(id => !processedIds.has(id))

    if (unprocessedIds.length === 0) {
      return jsonResponse({ processed: 0, suggestions_added: 0, message: 'all_already_processed' }, 200)
    }

    // ── 4. Fetch thread details (cap at 30 to stay within time budget) ──────
    const toProcess = unprocessedIds.slice(0, 30)

    interface ThreadSummary {
      threadId: string
      subject: string
      sender: string
      snippet: string
      bodyText: string
    }

    const threads: ThreadSummary[] = []

    for (const threadId of toProcess) {
      try {
        const threadRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=full`,
          { headers: { 'Authorization': `Bearer ${accessToken}` } },
        )
        if (!threadRes.ok) continue

        const threadData = await threadRes.json() as {
          messages?: Array<{
            payload?: {
              headers?: Array<{ name: string; value: string }>
              parts?: GmailPart[]
              body?: { data?: string }
              mimeType?: string
            }
            snippet?: string
          }>
        }

        const messages = threadData.messages ?? []
        if (messages.length === 0) continue

        // Use the first message for headers, concatenate bodies.
        const firstMsg = messages[0]
        const headers = firstMsg.payload?.headers ?? []
        const subject = headers.find(h => h.name.toLowerCase() === 'subject')?.value ?? '(no subject)'
        const from = headers.find(h => h.name.toLowerCase() === 'from')?.value ?? ''
        const sender = from.replace(/<[^>]+>/, '').trim() || from

        // Skip hard-coded automated senders that slip through category:primary.
        const senderLower = (from + subject).toLowerCase()
        const autoPatterns = [
          'noreply', 'no-reply', 'donotreply', 'do-not-reply',
          'notifications@', 'alerts@', 'updates@', 'support@',
          'jira@', 'github@', 'gitlab@', 'confluence@',
          'zoom.us', 'docusign', 'hellosign',
          'unsubscribe', 'you have been invited',
          'accepted your invitation', 'declined your invitation',
        ]
        if (autoPatterns.some(p => senderLower.includes(p))) continue

        // Take the most recent message body (last in thread = latest reply).
        const latestMsg = messages[messages.length - 1]
        let bodyText = ''
        if (latestMsg.payload?.parts) {
          bodyText = extractBody(latestMsg.payload.parts)
        } else if (latestMsg.payload?.body?.data) {
          const raw = decodeBase64Url(latestMsg.payload.body.data)
          bodyText = latestMsg.payload.mimeType === 'text/html' ? stripHtml(raw) : raw
        }

        // Cap body length to keep prompt size reasonable.
        const words = bodyText.split(/\s+/)
        const truncatedBody = words.length > 600 ? words.slice(0, 600).join(' ') + ' [...]' : bodyText

        threads.push({
          threadId,
          subject,
          sender,
          snippet: firstMsg.snippet ?? '',
          bodyText: truncatedBody,
        })
      } catch (err) {
        console.warn(`gmail-inbox-sync: failed to fetch thread ${threadId}:`, (err as Error).message)
      }
    }

    if (threads.length === 0) {
      // Mark all as processed so we don't retry them.
      await supabase.from('suggestion_source_processed').insert(
        toProcess.map(id => ({ user_id: userId, source_type: 'gmail_thread', source_id: id, suggestions_added: 0 }))
      )
      return jsonResponse({ processed: toProcess.length, suggestions_added: 0 }, 200)
    }

    // ── 5. Load context for prompt ─────────────────────────────────────────
    const [membersRes, inboxTagsRes, recentOutcomesRes, existingPendingRes] = await Promise.all([
      supabase.from('cos_team_members').select('id, name').eq('user_id', userId),
      supabase.from('inbox_tags').select('id, name, type, color').eq('user_id', userId).in('type', ['project', 'folder', 'person']).is('parent_id', null),
      // Recent accept/dismiss signals for few-shot learning.
      supabase.from('dci_suggested_tasks')
        .select('title, raw_context, status, source_type')
        .eq('user_id', userId)
        .in('status', ['accepted', 'dismissed'])
        .not('outcome_at', 'is', null)
        .order('outcome_at', { ascending: false })
        .limit(40),
      supabase.from('dci_suggested_tasks')
        .select('title')
        .eq('user_id', userId)
        .eq('status', 'pending'),
    ])

    const inboxTags = (inboxTagsRes.data ?? []) as InboxTagRow[]
    const existingTitles = (existingPendingRes.data ?? []).map((r: { title: string }) => r.title)

    // Also dedup against open inbox items.
    const { data: openInboxItems } = await supabase
      .from('inbox_items')
      .select('text')
      .eq('user_id', userId)
      .eq('status', 'open')
    const existingTexts = [
      ...existingTitles,
      ...(openInboxItems ?? []).map((r: { text: string }) => r.text),
    ]

    // Build few-shot signal from recent outcomes.
    const outcomes = (recentOutcomesRes.data ?? []) as Array<{ title: string; raw_context: string | null; status: string; source_type: string }>
    const accepted = outcomes.filter(o => o.status === 'accepted').slice(0, 10)
    const dismissed = outcomes.filter(o => o.status === 'dismissed').slice(0, 10)

    let learningSection = ''
    if (accepted.length > 0 || dismissed.length > 0) {
      learningSection = '\nUSER FEEDBACK HISTORY (use to calibrate what this user finds valuable)\n'
      if (accepted.length > 0) {
        learningSection += 'Recently ACCEPTED (keep these):\n'
        learningSection += accepted.map(o => `- "${o.title}"${o.raw_context ? ` | context: "${o.raw_context.slice(0, 80)}"` : ''}`).join('\n') + '\n'
      }
      if (dismissed.length > 0) {
        learningSection += 'Recently DISMISSED (avoid similar):\n'
        learningSection += dismissed.map(o => `- "${o.title}"${o.raw_context ? ` | context: "${o.raw_context.slice(0, 80)}"` : ''}`).join('\n') + '\n'
      }
    }

    // ── 6. Analyze threads in batches of 8 via Gemini ──────────────────────
    const BATCH_SIZE = 8
    const allItems: Array<{
      threadId: string
      title: string
      urgency: string
      rationale: string
      raw_context: string
      source: string
      sender: string
    }> = []

    for (let i = 0; i < threads.length; i += BATCH_SIZE) {
      const batch = threads.slice(i, i + BATCH_SIZE)

      const emailsSection = batch.map((t, idx) =>
        `--- EMAIL ${idx + 1} ---
Thread-ID: ${t.threadId}
From: ${t.sender}
Subject: ${t.subject}
Body:
${t.bodyText || t.snippet}`
      ).join('\n\n')

      const prompt = `You are an executive assistant analyzing emails to identify genuine action items the user needs to track.
${learningSection}
INSTRUCTIONS
- Extract ONLY concrete action items that require the user to DO something, DECIDE something, or RESPOND to someone. Prioritize things the user is explicitly asked about.
- Skip: FYI updates, newsletters, receipts, status updates where no action is required, invitations that are already accepted/declined, anything social or promotional.
- Urgency: "urgent" = due soon or explicitly time-sensitive, "this_week" = needs attention this week, "watching" = low priority / informational but worth tracking.
- raw_context: the exact sentence(s) from the email that justify this action item (max 150 chars).
- source: the From name / company.
- Include the Thread-ID from the email header — exactly as shown.
- If an email has no genuine action item, omit it entirely. Quality over quantity.
- Return between 0 and 3 items per email.

EMAILS TO ANALYZE
${emailsSection}

Respond with valid JSON only — an array of objects. Schema:
[{
  "thread_id": "<Thread-ID from email header>",
  "title": "<concise action item, max 80 chars>",
  "urgency": "urgent|this_week|watching",
  "rationale": "<one sentence why this matters>",
  "raw_context": "<verbatim excerpt, max 150 chars>",
  "source": "<sender name / company>"
}]`

      try {
        const geminiRes = await fetch(
          'https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': googleApiKey },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
          },
        )
        if (!geminiRes.ok) {
          console.error('gmail-inbox-sync: Gemini failed:', await geminiRes.text())
          continue
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const geminiData = await geminiRes.json() as any
        const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
        const jsonStr = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

        let parsed: Array<{ thread_id?: string; title?: string; urgency?: string; rationale?: string; raw_context?: string; source?: string }> = []
        try { parsed = JSON.parse(jsonStr) } catch { continue }
        if (!Array.isArray(parsed)) continue

        for (const item of parsed) {
          const threadId = item.thread_id ?? ''
          const thread = batch.find(t => t.threadId === threadId)
          if (!thread || !item.title?.trim()) continue
          allItems.push({
            threadId,
            title: item.title.trim().slice(0, 200),
            urgency: ['urgent', 'this_week', 'watching'].includes(item.urgency ?? '') ? item.urgency! : 'this_week',
            rationale: (item.rationale ?? '').slice(0, 300),
            raw_context: (item.raw_context ?? '').slice(0, 300),
            source: (item.source ?? thread.sender).slice(0, 200),
            sender: thread.sender,
          })
        }
      } catch (err) {
        console.warn('gmail-inbox-sync: batch analysis failed:', (err as Error).message)
      }
    }

    // ── 7. Deduplicate + insert ─────────────────────────────────────────────
    const anthropic = new Anthropic({ apiKey: anthropicApiKey })
    const today = new Date().toISOString().slice(0, 10)
    let suggestionsAdded = 0
    const processedByThread = new Map<string, number>()

    for (const item of allItems) {
      // Dedup against existing pending suggestions and open inbox items.
      const isDuplicate = existingTexts.some(t => isSimilarText(item.title, t))
      if (isDuplicate) continue

      const tagSuggestions = await suggestTagsForSuggestion(anthropic, inboxTags, {
        title: item.title,
        rawContext: item.raw_context || null,
      })

      const { error: insertErr } = await supabase.from('dci_suggested_tasks').insert({
        user_id: userId,
        date: today,
        title: item.title,
        source: item.source,
        source_type: 'email',
        source_thread_id: item.threadId,
        source_url: `https://mail.google.com/mail/u/0/#inbox/${item.threadId}`,
        urgency: item.urgency,
        rationale: item.rationale,
        raw_context: item.raw_context,
        tag_suggestions: tagSuggestions,
      })

      if (!insertErr) {
        suggestionsAdded++
        existingTexts.push(item.title) // prevent within-batch dupes
        processedByThread.set(item.threadId, (processedByThread.get(item.threadId) ?? 0) + 1)
      }
    }

    // ── 8. Mark all processed threads ──────────────────────────────────────
    // Insert all threads (processed ones = 0 suggestions, active ones = N).
    const processedInserts = toProcess.map(id => ({
      user_id: userId,
      source_type: 'gmail_thread',
      source_id: id,
      suggestions_added: processedByThread.get(id) ?? 0,
    }))
    await supabase.from('suggestion_source_processed').insert(processedInserts)

    return jsonResponse({
      processed: threads.length,
      suggestions_added: suggestionsAdded,
    })

  } catch (err) {
    console.error('gmail-inbox-sync error:', (err as Error).message)
    return jsonResponse({ error: (err as Error).message }, 500)
  }
})
