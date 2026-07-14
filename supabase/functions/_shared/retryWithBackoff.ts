/**
 * Shared retry/backoff helper for outbound calls to external integrations
 * (Zoom, Slack, Gmail, Google Calendar APIs). None of the edge functions that
 * call these APIs had any resilience against transient failures — a single
 * network blip, 5xx, or 429 would fail the whole sync run. See
 * docs/SPECIFICATION.md §13 item 8.
 *
 * Usage — wrap the `fetch()` call itself, not the surrounding logic:
 *
 *   const res = await retryWithBackoff(
 *     () => fetch(url, { headers }),
 *     { integration: 'zoom', label: 'list recordings' },
 *   )
 *
 * The wrapped function's return value / thrown error is passed through
 * unchanged once retries are exhausted, so callers' existing
 * `if (!res.ok) { ... }` / try-catch handling keeps working as-is.
 */

export interface RetryOptions {
  /** Integration name for log lines, e.g. 'zoom', 'slack', 'gmail', 'google-calendar'. */
  integration: string
  /** Short human label for what's being called, e.g. 'list recordings'. Optional. */
  label?: string
  /**
   * Total attempts including the first try. Default 3 (1 initial + 2 retries).
   * Three total attempts is enough to ride out a transient network blip or a
   * single rate-limit window without letting one flaky call block a whole
   * sync run for an excessive amount of wall-clock time (edge functions have
   * limited execution budgets).
   */
  maxAttempts?: number
  /** Base delay in ms before the first retry. Default 500ms. */
  baseDelayMs?: number
  /** Upper bound for the computed backoff delay (before jitter), in ms. Default 8000ms. */
  maxDelayMs?: number
}

const DEFAULT_MAX_ATTEMPTS = 3
const DEFAULT_BASE_DELAY_MS = 500
const DEFAULT_MAX_DELAY_MS = 8_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Exponential backoff (base * 2^attempt) capped at maxDelayMs, plus full jitter. */
function computeBackoffDelayMs(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const exp = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs)
  // Full jitter: random value in [0, exp) — avoids thundering-herd retries
  // when many concurrent syncs hit a rate limit at the same moment.
  return Math.floor(Math.random() * exp)
}

/** Parses a `Retry-After` header value (seconds, or an HTTP-date) into ms. Returns null if unparseable. */
function parseRetryAfterMs(value: string | null): number | null {
  if (!value) return null
  const asSeconds = Number(value)
  if (Number.isFinite(asSeconds)) return Math.max(0, asSeconds * 1000)
  const asDate = Date.parse(value)
  if (Number.isFinite(asDate)) return Math.max(0, asDate - Date.now())
  return null
}

/**
 * Returns true if a Response should be retried: 429 (rate limit) or any 5xx.
 * Other 4xx (400/401/403/404/etc.) are treated as non-retryable client
 * errors — retrying them just wastes time and can mask a real auth/config
 * problem.
 */
function isRetryableResponse(res: Response): boolean {
  return res.status === 429 || res.status >= 500
}

/**
 * Wraps an async function (typically a `fetch()` call) with retry/backoff.
 *
 * Retries on: thrown errors (network failures, DNS issues, timeouts), HTTP
 * 5xx responses, and HTTP 429. Does not retry other 4xx responses. Honors a
 * `Retry-After` header on 429 responses when present (used most by
 * Slack/Zoom, both of which rate-limit).
 *
 * The final error/response after exhausting retries is thrown/returned
 * exactly as `fn` produced it — callers' existing error handling is
 * untouched.
 */
export async function retryWithBackoff<T extends Response>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const {
    integration,
    label,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    maxDelayMs = DEFAULT_MAX_DELAY_MS,
  } = options
  const what = label ? `${integration} (${label})` : integration

  let lastError: unknown
  let lastResponse: T | undefined

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const isLastAttempt = attempt === maxAttempts - 1

    try {
      const res = await fn()

      if (!isRetryableResponse(res)) {
        return res
      }

      lastResponse = res
      if (isLastAttempt) {
        return res
      }

      const retryAfterMs = res.status === 429 ? parseRetryAfterMs(res.headers.get('Retry-After')) : null
      const delayMs = retryAfterMs ?? computeBackoffDelayMs(attempt, baseDelayMs, maxDelayMs)

      console.log(
        `[retryWithBackoff] ${what}: attempt ${attempt + 1}/${maxAttempts} got HTTP ${res.status} — retrying in ${delayMs}ms`,
      )
      await sleep(delayMs)
      continue
    } catch (err) {
      lastError = err
      if (isLastAttempt) {
        throw err
      }

      const delayMs = computeBackoffDelayMs(attempt, baseDelayMs, maxDelayMs)
      console.log(
        `[retryWithBackoff] ${what}: attempt ${attempt + 1}/${maxAttempts} threw (${(err as Error)?.message ?? String(err)}) — retrying in ${delayMs}ms`,
      )
      await sleep(delayMs)
      continue
    }
  }

  // Unreachable in practice (the loop always returns/throws on the last
  // attempt above), but keeps the type checker happy and fails safe.
  if (lastResponse) return lastResponse
  throw lastError
}
