/**
 * suggest-inbox-tags
 *
 * Given an inbox item that just landed, asks Claude to pick the best matching
 * top-level tags (projects, folders, people) from the user's tag library.
 *
 * POST { item_id: string, user_id: string }
 * → { suggestions: [{ tag_id, tag_name, color, reason }] }
 *
 * Writes the suggestions back to inbox_items.tag_suggestions so the frontend
 * can render them as one-click ghost pills.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import Anthropic from 'npm:@anthropic-ai/sdk'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { item_id, user_id } = await req.json()
    if (!item_id || !user_id) return json({ error: 'item_id and user_id required' }, 400)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // ── Fetch the item ────────────────────────────────────────────────────────
    const { data: item } = await supabase
      .from('inbox_items')
      .select('id, text, type, source_ref, tag_suggestions')
      .eq('id', item_id)
      .single()

    if (!item) return json({ error: 'item not found' }, 404)

    // If suggestions already exist, skip (avoid double-running)
    if (Array.isArray(item.tag_suggestions) && item.tag_suggestions.length > 0) {
      return json({ suggestions: item.tag_suggestions })
    }

    // ── Fetch candidate tags (top-level only: project, folder, person) ────────
    const { data: tags } = await supabase
      .from('inbox_tags')
      .select('id, name, type, color, settings')
      .eq('user_id', user_id)
      .in('type', ['project', 'folder', 'person'])
      .is('parent_id', null)
      .order('sort_order')

    if (!tags || tags.length === 0) return json({ suggestions: [] })

    // ── Build Claude prompt ───────────────────────────────────────────────────
    const tagList = tags.map(t => {
      const s = t.settings as {
        description?: string;
        stakeholders?: string[];
        recurring_meetings?: string[];
        slack_channels?: string[];
      } | null

      const lines: string[] = [`- ${t.name} (type: ${t.type}, id: ${t.id})`]
      if (s?.description)         lines.push(`  description: ${s.description}`)
      if (s?.stakeholders?.length)        lines.push(`  stakeholders: ${s.stakeholders.join(', ')}`)
      if (s?.recurring_meetings?.length)  lines.push(`  recurring meetings: ${s.recurring_meetings.join(', ')}`)
      if (s?.slack_channels?.length)      lines.push(`  slack channels: ${s.slack_channels.join(', ')}`)
      return lines.join('\n')
    }).join('\n')

    const sourceContext = (() => {
      const src = item.source_ref as { type?: string; id?: string } | null
      if (!src) return ''
      if (src.type === 'zoom_recording') return `\nSource: Zoom recording (meeting ID ${src.id ?? 'unknown'})`
      if (src.type === 'dci_brief')      return `\nSource: Daily brief`
      if (src.type === 'calendar')       return `\nSource: Calendar event`
      return ''
    })()

    const typeContext: Record<string, string> = {
      task:            'User task',
      note:            'Note / observation',
      agent_nudge:     'Agent nudge',
      agent_question:  'Agent question requiring response',
      meeting_insight: 'Insight from a meeting',
      brief_item:      'Daily brief item',
    }

    const prompt = `You are a tagging assistant for a team productivity tool. Your job is to suggest which tags from the user's library best match an inbox item.

INBOX ITEM
Type: ${typeContext[item.type] ?? item.type}${sourceContext}
Text: "${item.text}"

AVAILABLE TAGS
${tagList}

INSTRUCTIONS
- Return at most 2 tags, ranked by confidence (most confident first).
- Only suggest a tag if you are reasonably sure it matches.
- If no tag fits, return an empty array.
- Do NOT invent tags — only use IDs from the list above.
- A project tag fits if the item is clearly about that initiative. Use the description, stakeholders, recurring meetings, and Slack channels as matching signals — not just the name.
- A folder tag fits if the item's urgency or context matches the folder's purpose.
- A person tag fits if the item directly involves or mentions that person.
- For meeting insights and Zoom items, cross-reference the meeting title against recurring_meetings listed for each project.

Respond with valid JSON only — no prose, no markdown fences.
Schema: [{ "tag_id": "<id>", "tag_name": "<name>", "color": "<hex>", "reason": "<one short sentence>" }]`

    const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! })

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = (message.content[0] as { type: string; text: string }).text.trim()

    let suggestions: { tag_id: string; tag_name: string; color: string; reason: string }[] = []
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        // Validate each entry against the actual tag list
        const tagMap = new Map(tags.map(t => [t.id, t]))
        suggestions = parsed
          .filter(s => s.tag_id && tagMap.has(s.tag_id))
          .slice(0, 2)
          .map(s => {
            const tag = tagMap.get(s.tag_id)!
            return {
              tag_id:   tag.id,
              tag_name: tag.name,
              color:    tag.color,
              reason:   String(s.reason ?? '').slice(0, 120),
            }
          })
      }
    } catch {
      // Claude returned non-JSON — treat as no suggestions
    }

    // ── Persist suggestions ───────────────────────────────────────────────────
    await supabase
      .from('inbox_items')
      .update({ tag_suggestions: suggestions })
      .eq('id', item_id)

    return json({ suggestions })
  } catch (err) {
    console.error('suggest-inbox-tags error:', err)
    return json({ error: String(err) }, 500)
  }
})
