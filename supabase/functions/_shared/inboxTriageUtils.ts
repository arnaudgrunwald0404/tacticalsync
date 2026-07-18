/**
 * Pure helpers for the Gmail inbox triage feature.
 * Extracted from extract-inbox-action-items/index.ts so they can be
 * unit-tested independently of the edge function runtime.
 */

export type SenderTier = 'active' | 'known'
export type IntentType = 'question' | 'request' | 'introduction' | 'decision_needed' | 'fyi'

// Phase 2: surface all actionable intents; only fyi is filtered out by default.
export const SUPPRESSED_BY_DEFAULT: IntentType[] = ['fyi']

export interface SuppressionRules {
  suppressedSenders: Set<string>
  suppressedDomains: Set<string>
  suppressedIntents: Set<string>
  maxThreadAgeHours: number | null
}

export interface DismissalRecord {
  sender_email: string | null
  sender_domain: string | null
  intent_type: string | null
}

export interface InferredSuppressions {
  newSenders: string[]
  newDomains: string[]
  newIntents: string[]
}

/**
 * Classifies the sender tier based on whether the user has previously replied
 * to them. Returns null when no email address can be parsed (skip the item).
 *
 * - 'active': user has sent at least one email to this address.
 * - 'known':  sender has emailed user but user has never replied.
 * - null:     no parseable email address → skip entirely.
 */
export function classifySenderTier(
  senderEmail: string | null,
  sentAddresses: Set<string>,
): SenderTier | null {
  if (!senderEmail) return null
  return sentAddresses.has(senderEmail.toLowerCase()) ? 'active' : 'known'
}

/**
 * Returns true when a Gmail message should be suppressed before classification,
 * based on learned per-user suppression rules.
 *
 * Checks (in order):
 * 1. Sender email is in the suppressed-senders list.
 * 2. Sender domain is in the suppressed-domains list.
 * 3. Message age exceeds the configured max_thread_age_hours.
 */
export function shouldSuppressMessage(
  senderEmail: string | null,
  internalDateMs: number | null,
  rules: SuppressionRules,
): boolean {
  if (senderEmail && rules.suppressedSenders.has(senderEmail.toLowerCase())) return true

  if (senderEmail) {
    const domain = senderEmail.split('@')[1]
    if (domain && rules.suppressedDomains.has(domain.toLowerCase())) return true
  }

  if (rules.maxThreadAgeHours !== null && internalDateMs !== null) {
    const ageHours = (Date.now() - internalDateMs) / 3_600_000
    if (ageHours > rules.maxThreadAgeHours) return true
  }

  return false
}

/**
 * Returns true when an intent type should be suppressed for a Gmail item,
 * combining the global default list and per-user preferences.
 */
export function shouldSuppressIntent(
  intentType: IntentType,
  suppressedIntents: Set<string>,
): boolean {
  return SUPPRESSED_BY_DEFAULT.includes(intentType) || suppressedIntents.has(intentType)
}

/**
 * Returns true when a Slack message should be included in the scan batch.
 *
 * DMs are always in scope. Channel messages are only included when the
 * channel name appears in the user's sync allowlist. The allowlist entries
 * are already normalized (lowercase, no leading #).
 */
export function shouldIncludeSlackMessage(
  isDm: boolean,
  channelName: string | null,
  normalizedAllowlist: string[],
): boolean {
  if (isDm) return true
  if (!channelName) return false
  return normalizedAllowlist.includes(channelName.toLowerCase())
}

/**
 * Normalizes a raw channel list entry: lower-cases and strips a leading '#'.
 */
export function normalizeChannelName(raw: string): string {
  return raw.toLowerCase().replace(/^#/, '')
}

/**
 * Parses the sender email address out of a raw "From" header value.
 * Handles plain addresses ("user@example.com") and display-name format
 * ("Display Name <user@example.com>").
 * Returns null when no valid address can be found.
 */
export function parseSenderEmail(fromHeader: string): string | null {
  const match = fromHeader.match(/[\w.+-]+@[\w.-]+\.\w+/)
  return match ? match[0].toLowerCase() : null
}

/**
 * Infers new suppression rules from the full dismissal history for a user.
 *
 * Thresholds:
 * - Suppress a sender after ≥ 5 dismissals from that address.
 * - Suppress a domain after ≥ 10 dismissals from that domain.
 * - Suppress an intent type when it accounts for > 80 % of all dismissals
 *   AND has at least 5 dismissals.
 *
 * Returns only the *new* entries to add (caller merges with existing lists).
 */
export function inferSuppressionRules(dismissals: DismissalRecord[]): InferredSuppressions {
  if (dismissals.length < 3) {
    return { newSenders: [], newDomains: [], newIntents: [] }
  }

  const senderCounts = new Map<string, number>()
  const domainCounts = new Map<string, number>()
  const intentCounts = new Map<string, number>()

  for (const d of dismissals) {
    if (d.sender_email) {
      senderCounts.set(d.sender_email, (senderCounts.get(d.sender_email) ?? 0) + 1)
    }
    if (d.sender_domain) {
      domainCounts.set(d.sender_domain, (domainCounts.get(d.sender_domain) ?? 0) + 1)
    }
    if (d.intent_type) {
      intentCounts.set(d.intent_type, (intentCounts.get(d.intent_type) ?? 0) + 1)
    }
  }

  const total = dismissals.length

  const newSenders = [...senderCounts.entries()].filter(([, n]) => n >= 5).map(([s]) => s)
  const newDomains = [...domainCounts.entries()].filter(([, n]) => n >= 10).map(([d]) => d)
  const newIntents = [...intentCounts.entries()]
    .filter(([, n]) => n >= 5 && n / total > 0.8)
    .map(([i]) => i)

  return { newSenders, newDomains, newIntents }
}
