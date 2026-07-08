/**
 * Shared Slack request-verification helpers for edge functions that receive
 * inbound webhooks from Slack (slash commands, interactive actions, etc).
 *
 * Slack signs every request with HMAC-SHA256 over the signing secret. See:
 * https://api.slack.com/authentication/verifying-requests-from-slack
 */

const SLACK_SIGNATURE_VERSION = 'v0'
// Reject requests whose timestamp is more than 5 minutes off (replay defence).
export const MAX_TIMESTAMP_SKEW_SECONDS = 60 * 5

/** Constant-time-ish comparison of two strings (e.g. hex signatures). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return mismatch === 0
}

/**
 * Verifies a Slack request signature against the raw request body.
 *
 * @param signingSecret The app's Slack signing secret (SLACK_SIGNING_SECRET).
 * @param timestamp     The `X-Slack-Request-Timestamp` header value.
 * @param signature     The `X-Slack-Signature` header value.
 * @param rawBody       The exact raw request body string (must be read/verified
 *                       before any JSON/form parsing, since parsing can alter
 *                       whitespace/ordering used to reconstruct the body).
 */
export async function verifySlackSignature(
  signingSecret: string,
  timestamp: string | null,
  signature: string | null,
  rawBody: string,
): Promise<boolean> {
  if (!signingSecret || !timestamp || !signature) return false

  const ts = parseInt(timestamp, 10)
  if (!Number.isFinite(ts)) return false
  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - ts) > MAX_TIMESTAMP_SKEW_SECONDS) return false

  const basestring = `${SLACK_SIGNATURE_VERSION}:${timestamp}:${rawBody}`
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(signingSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sigBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(basestring))
  const hex = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return safeEqual(`${SLACK_SIGNATURE_VERSION}=${hex}`, signature)
}
