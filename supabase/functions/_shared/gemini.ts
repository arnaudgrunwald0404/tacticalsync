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
import { logAiUsage } from './aiUsage.ts'

/**
 * Pass `log` to geminiGenerateText / geminiChat to record the call's token
 * usage in ai_usage_log (admin AI Usage panel in Settings). Logging happens
 * here, in the shared wrapper, so every call site — current and future —
 * gets cost tracking by adding one option rather than its own insert.
 */
export interface GeminiLogContext {
  functionName: string
  userId?: string | null
}

export const GEMINI_MODEL = 'gemini-2.5-flash'
// For call sites that ran Claude Sonnet before the provider port — the
// quality-sensitive long-form work (briefs, chat, delegation drafts).
// The alias tracks Google's current stable pro model: this project's API
// key can no longer call gemini-2.5-pro directly (404 "no longer available
// to new users"), and the alias avoids pinning a preview that will churn.
export const GEMINI_PRO_MODEL = 'gemini-pro-latest'

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
  opts: { model?: string; label?: string; log?: GeminiLogContext } = {},
): Promise<string> {
  const model = opts.model ?? GEMINI_MODEL
  const startMs = Date.now()
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
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
  }
  if (opts.log) {
    await logAiUsage(opts.log.functionName, {
      model,
      inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
      userId: opts.log.userId,
      durationMs: Date.now() - startMs,
    })
  }
  return (data.candidates?.[0]?.content?.parts ?? []).map(p => p.text ?? '').join('').trim()
}

// ── Multi-turn / function-calling variant ────────────────────────────────────

export interface GeminiFunctionCall { name: string; args: Record<string, unknown> }

export interface GeminiPart {
  text?: string
  functionCall?: GeminiFunctionCall
  functionResponse?: { name: string; response: Record<string, unknown> }
}

export interface GeminiContent { role: 'user' | 'model'; parts: GeminiPart[] }

export interface GeminiChatResult {
  /** The model turn exactly as returned — push this back onto `contents` when continuing a tool loop. */
  content: GeminiContent
  text: string
  functionCalls: GeminiFunctionCall[]
  usage: { inputTokens: number; outputTokens: number }
}

/**
 * Full-featured generateContent call: multi-turn history, a system
 * instruction, optional tools (functionDeclarations and/or google_search),
 * and token usage back for cost logging. Uses the v1beta endpoint, which
 * carries systemInstruction and tools. Function-calling loops mirror the
 * Anthropic shape: run, execute any functionCalls, append the returned
 * `content` plus a user turn of functionResponse parts, call again.
 */
export async function geminiChat(
  apiKey: string,
  opts: {
    contents: GeminiContent[]
    system?: string
    tools?: unknown[]
    model?: string
    label?: string
    log?: GeminiLogContext
  },
): Promise<GeminiChatResult> {
  const model = opts.model ?? GEMINI_MODEL
  const startMs = Date.now()
  const tools = opts.tools ?? []
  // Mixing a built-in tool (e.g. { google_search: {} }) with function
  // declarations is rejected unless this flag is set — verified against the
  // live API ("Please enable tool_config.include_server_side_tool_invocations
  // to use Built-in tools with Function calling").
  const isFnDecl = (t: unknown) => typeof t === 'object' && t !== null && 'functionDeclarations' in t
  const mixesBuiltInAndFunctions = tools.some(isFnDecl) && tools.some(t => !isFnDecl(t))
  const res = await retryWithBackoff(
    () => fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: opts.contents,
          ...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
          ...(tools.length > 0 ? { tools } : {}),
          ...(mixesBuiltInAndFunctions ? { toolConfig: { includeServerSideToolInvocations: true } } : {}),
        }),
      },
    ),
    { integration: 'gemini', label: opts.label ?? `chat ${model}` },
  )
  if (!res.ok) {
    throw new Error(`gemini_http_${res.status}: ${(await res.text()).slice(0, 300)}`)
  }
  const data = await res.json() as {
    candidates?: Array<{ content?: { role?: string; parts?: GeminiPart[] } }>
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
  }
  const parts = data.candidates?.[0]?.content?.parts ?? []
  const usage = {
    inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
  }
  if (opts.log) {
    await logAiUsage(opts.log.functionName, {
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      userId: opts.log.userId,
      durationMs: Date.now() - startMs,
    })
  }
  return {
    content: { role: 'model', parts },
    text: parts.map(p => p.text ?? '').join('').trim(),
    functionCalls: parts.filter(p => p.functionCall).map(p => p.functionCall!),
    usage,
  }
}

/**
 * Converts Anthropic-style tool definitions ({name, description,
 * input_schema}) to a Gemini functionDeclarations tools entry. Gemini
 * rejects OBJECT schemas with zero properties, so parameterless tools omit
 * `parameters` entirely.
 */
export function toGeminiFunctionDeclarations(
  tools: Array<{ name: string; description: string; input_schema?: { type: string; properties?: Record<string, unknown>; required?: string[] } }>,
): { functionDeclarations: Array<Record<string, unknown>> } {
  return {
    functionDeclarations: tools.map(t => ({
      name: t.name,
      description: t.description,
      ...(t.input_schema?.properties && Object.keys(t.input_schema.properties).length > 0
        ? { parameters: t.input_schema }
        : {}),
    })),
  }
}
