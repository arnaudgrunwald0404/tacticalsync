/**
 * Shared Gemini text-generation helper for edge functions.
 *
 * Mirrors the inline pattern already used by gmail-inbox-sync,
 * slack-inbox-sync, generate-meeting-suggestions, and extract-zoom-quotes
 * (v1 endpoint, x-goog-api-key header, prompt-only contents) so the
 * remaining Anthropic call sites could be ported onto the same provider
 * without inventing a second convention. Deliberately no maxOutputTokens
 * cap: gemini-2.5-flash spends thinking tokens from the same budget, and a
 * small cap can starve the visible answer.
 */

import { retryWithBackoff } from './retryWithBackoff.ts'

export const GEMINI_MODEL = 'gemini-2.5-flash'

/**
 * Sends one prompt to Gemini and returns the response text (all parts
 * joined, trimmed). Callers strip markdown fences / parse JSON themselves,
 * same as with the previous Anthropic responses. Throws on HTTP errors
 * (after retryWithBackoff's 429/5xx retries) so callers' existing
 * try/catch fallbacks keep working.
 */
export async function geminiGenerateText(
  apiKey: string,
  prompt: string,
  opts: { model?: string; label?: string } = {},
): Promise<string> {
  const model = opts.model ?? GEMINI_MODEL
  const res = await retryWithBackoff(
    () => fetch(
      `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      },
    ),
    { integration: 'gemini', label: opts.label ?? `generateContent ${model}` },
  )
  if (!res.ok) {
    throw new Error(`gemini_http_${res.status}: ${(await res.text()).slice(0, 300)}`)
  }
  const data = await res.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  return (data.candidates?.[0]?.content?.parts ?? []).map(p => p.text ?? '').join('').trim()
}
