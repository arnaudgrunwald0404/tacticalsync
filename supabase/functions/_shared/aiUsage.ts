/**
 * Central token-usage logging for every Anthropic call made by edge functions.
 *
 * Call after each `anthropic.messages.create(...)` resolves:
 *
 *   await logAiUsage('my-function', message, { userId, durationMs })
 *
 * Writes one row to ai_usage_log via a service-role client so it works
 * regardless of which client (or none) the calling function holds. Never
 * throws — a logging failure must not break the feature that made the call.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

interface AnthropicUsageShape {
  model?: string
  usage?: {
    input_tokens?: number
    output_tokens?: number
    cache_creation_input_tokens?: number | null
    cache_read_input_tokens?: number | null
  }
}

export async function logAiUsage(
  functionName: string,
  message: AnthropicUsageShape,
  opts: { userId?: string | null; durationMs?: number } = {},
): Promise<void> {
  try {
    const url = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !serviceKey) return

    const supabase = createClient(url, serviceKey)
    const { error } = await supabase.from('ai_usage_log').insert({
      function_name: functionName,
      model: message.model ?? 'unknown',
      input_tokens: message.usage?.input_tokens ?? 0,
      output_tokens: message.usage?.output_tokens ?? 0,
      cache_creation_input_tokens: message.usage?.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: message.usage?.cache_read_input_tokens ?? 0,
      user_id: opts.userId ?? null,
      duration_ms: opts.durationMs ?? null,
    })
    if (error) console.error(`[aiUsage] failed to log ${functionName}:`, error.message)
  } catch (e) {
    console.error(`[aiUsage] failed to log ${functionName}:`, e)
  }
}
