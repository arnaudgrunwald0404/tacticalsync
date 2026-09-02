/**
 * Central token-usage logging for every AI call made by edge functions.
 *
 * Call sites don't use this directly — _shared/gemini.ts calls it when a
 * `log: { functionName, userId }` option is passed to geminiGenerateText /
 * geminiChat, so coverage lives in one place. (Rows written before the
 * Gemini provider port carry Anthropic model ids; src/lib/aiPricing.ts
 * prices both.)
 *
 * Writes one row to ai_usage_log via a service-role client so it works
 * regardless of which client (or none) the calling function holds. Never
 * throws — a logging failure must not break the feature that made the call.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

export interface AiUsageLogEntry {
  model: string
  inputTokens: number
  outputTokens: number
  userId?: string | null
  durationMs?: number
}

export async function logAiUsage(
  functionName: string,
  entry: AiUsageLogEntry,
): Promise<void> {
  try {
    const url = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !serviceKey) return

    const supabase = createClient(url, serviceKey)
    const { error } = await supabase.from('ai_usage_log').insert({
      function_name: functionName,
      model: entry.model,
      input_tokens: entry.inputTokens,
      output_tokens: entry.outputTokens,
      user_id: entry.userId ?? null,
      duration_ms: entry.durationMs ?? null,
    })
    if (error) console.error(`[aiUsage] failed to log ${functionName}:`, error.message)
  } catch (e) {
    console.error(`[aiUsage] failed to log ${functionName}:`, e)
  }
}
