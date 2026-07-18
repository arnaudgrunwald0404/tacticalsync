import { assertEquals, assertFalse, assert } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import {
  classifySenderTier,
  shouldSuppressMessage,
  shouldSuppressIntent,
  shouldIncludeSlackMessage,
  normalizeChannelName,
  parseSenderEmail,
  inferSuppressionRules,
  SUPPRESSED_BY_DEFAULT,
  type SuppressionRules,
  type DismissalRecord,
} from "./inboxTriageUtils.ts"

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeRules(overrides: Partial<SuppressionRules> = {}): SuppressionRules {
  return {
    suppressedSenders: new Set(),
    suppressedDomains: new Set(),
    suppressedIntents: new Set(),
    maxThreadAgeHours: null,
    ...overrides,
  }
}

function msAgo(hours: number): number {
  return Date.now() - hours * 3_600_000
}

function dismissals(
  count: number,
  overrides: Partial<DismissalRecord> = {},
): DismissalRecord[] {
  return Array.from({ length: count }, () => ({
    sender_email: "alice@example.com",
    sender_domain: "example.com",
    intent_type: "request",
    ...overrides,
  }))
}

// ─── parseSenderEmail ─────────────────────────────────────────────────────────

Deno.test("parseSenderEmail: extracts address from plain email", () => {
  assertEquals(parseSenderEmail("alice@example.com"), "alice@example.com")
})

Deno.test("parseSenderEmail: extracts address from display-name format", () => {
  assertEquals(parseSenderEmail("Alice Smith <alice@example.com>"), "alice@example.com")
})

Deno.test("parseSenderEmail: lowercases the result", () => {
  assertEquals(parseSenderEmail("Alice@Example.COM"), "alice@example.com")
})

Deno.test("parseSenderEmail: handles subdomains", () => {
  assertEquals(parseSenderEmail("Bob <bob@mail.company.co.uk>"), "bob@mail.company.co.uk")
})

Deno.test("parseSenderEmail: handles plus-addressing", () => {
  assertEquals(parseSenderEmail("user+tag@domain.com"), "user+tag@domain.com")
})

Deno.test("parseSenderEmail: returns null for 'unknown sender'", () => {
  assertEquals(parseSenderEmail("unknown sender"), null)
})

Deno.test("parseSenderEmail: returns null for empty string", () => {
  assertEquals(parseSenderEmail(""), null)
})

Deno.test("parseSenderEmail: returns null for header with no email address", () => {
  assertEquals(parseSenderEmail("Noreply Mailer"), null)
})

Deno.test("parseSenderEmail: extracts only the first address when To header has multiple", () => {
  const result = parseSenderEmail("alice@a.com, bob@b.com")
  assertEquals(result, "alice@a.com")
})

// ─── classifySenderTier ───────────────────────────────────────────────────────

Deno.test("classifySenderTier: returns 'active' when sender is in sent addresses", () => {
  const sent = new Set(["alice@example.com"])
  assertEquals(classifySenderTier("alice@example.com", sent), "active")
})

Deno.test("classifySenderTier: is case-insensitive for the lookup", () => {
  const sent = new Set(["alice@example.com"])
  assertEquals(classifySenderTier("Alice@Example.COM", sent), "active")
})

Deno.test("classifySenderTier: returns 'known' when sender is not in sent addresses", () => {
  const sent = new Set(["bob@example.com"])
  assertEquals(classifySenderTier("alice@example.com", sent), "known")
})

Deno.test("classifySenderTier: returns 'known' for empty sent set", () => {
  assertEquals(classifySenderTier("alice@example.com", new Set()), "known")
})

Deno.test("classifySenderTier: returns null when senderEmail is null", () => {
  assertEquals(classifySenderTier(null, new Set(["alice@example.com"])), null)
})

Deno.test("classifySenderTier: returns null when senderEmail is empty string", () => {
  assertEquals(classifySenderTier("", new Set()), null)
})

Deno.test("classifySenderTier: a large sent set does not affect correctness", () => {
  const sent = new Set(Array.from({ length: 500 }, (_, i) => `user${i}@example.com`))
  sent.add("needle@example.com")
  assertEquals(classifySenderTier("needle@example.com", sent), "active")
  assertEquals(classifySenderTier("missing@example.com", sent), "known")
})

// ─── shouldSuppressMessage ────────────────────────────────────────────────────

Deno.test("shouldSuppressMessage: suppresses when sender email is in suppressed-senders list", () => {
  const rules = makeRules({ suppressedSenders: new Set(["spam@example.com"]) })
  assert(shouldSuppressMessage("spam@example.com", null, rules))
})

Deno.test("shouldSuppressMessage: suppression check is case-insensitive for sender email", () => {
  const rules = makeRules({ suppressedSenders: new Set(["spam@example.com"]) })
  assert(shouldSuppressMessage("SPAM@Example.COM", null, rules))
})

Deno.test("shouldSuppressMessage: does not suppress when sender is not in the list", () => {
  const rules = makeRules({ suppressedSenders: new Set(["other@example.com"]) })
  assertFalse(shouldSuppressMessage("alice@example.com", null, rules))
})

Deno.test("shouldSuppressMessage: suppresses when sender domain is in suppressed-domains list", () => {
  const rules = makeRules({ suppressedDomains: new Set(["newsletter.com"]) })
  assert(shouldSuppressMessage("promo@newsletter.com", null, rules))
})

Deno.test("shouldSuppressMessage: does not suppress when only a sibling domain matches", () => {
  const rules = makeRules({ suppressedDomains: new Set(["newsletter.com"]) })
  assertFalse(shouldSuppressMessage("alice@not-newsletter.com", null, rules))
})

Deno.test("shouldSuppressMessage: suppresses when message exceeds maxThreadAgeHours", () => {
  const rules = makeRules({ maxThreadAgeHours: 24 })
  const thirtyHoursAgo = msAgo(30)
  assert(shouldSuppressMessage("alice@example.com", thirtyHoursAgo, rules))
})

Deno.test("shouldSuppressMessage: does not suppress when message is within maxThreadAgeHours", () => {
  const rules = makeRules({ maxThreadAgeHours: 48 })
  const tenHoursAgo = msAgo(10)
  assertFalse(shouldSuppressMessage("alice@example.com", tenHoursAgo, rules))
})

Deno.test("shouldSuppressMessage: does not suppress when maxThreadAgeHours is null (no limit)", () => {
  const rules = makeRules({ maxThreadAgeHours: null })
  const veryOldMs = msAgo(9999)
  assertFalse(shouldSuppressMessage("alice@example.com", veryOldMs, rules))
})

Deno.test("shouldSuppressMessage: does not suppress when internalDateMs is null (age unknown)", () => {
  const rules = makeRules({ maxThreadAgeHours: 24 })
  assertFalse(shouldSuppressMessage("alice@example.com", null, rules))
})

Deno.test("shouldSuppressMessage: does not suppress when all rules are empty and no age limit", () => {
  const rules = makeRules()
  assertFalse(shouldSuppressMessage("alice@example.com", msAgo(100), rules))
})

Deno.test("shouldSuppressMessage: sender rule takes priority (checked before domain rule)", () => {
  const rules = makeRules({
    suppressedSenders: new Set(["alice@example.com"]),
    suppressedDomains: new Set(["example.com"]),
  })
  // Both rules match; function still returns true
  assert(shouldSuppressMessage("alice@example.com", null, rules))
})

Deno.test("shouldSuppressMessage: domain suppresses even when sender is not individually listed", () => {
  const rules = makeRules({
    suppressedSenders: new Set(["bob@example.com"]),
    suppressedDomains: new Set(["badomain.com"]),
  })
  assert(shouldSuppressMessage("anyone@badomain.com", null, rules))
  assertFalse(shouldSuppressMessage("alice@example.com", null, rules))
})

Deno.test("shouldSuppressMessage: null sender email skips sender and domain checks", () => {
  const rules = makeRules({
    suppressedSenders: new Set(["alice@example.com"]),
    suppressedDomains: new Set(["example.com"]),
    maxThreadAgeHours: null,
  })
  assertFalse(shouldSuppressMessage(null, null, rules))
})

// ─── shouldSuppressIntent ─────────────────────────────────────────────────────

Deno.test("shouldSuppressIntent: suppresses 'fyi' (always in default list)", () => {
  assert(shouldSuppressIntent("fyi", new Set()))
})

Deno.test("SUPPRESSED_BY_DEFAULT contains only 'fyi'", () => {
  assertEquals(SUPPRESSED_BY_DEFAULT, ["fyi"])
})

Deno.test("shouldSuppressIntent: does not suppress 'question' by default", () => {
  assertFalse(shouldSuppressIntent("question", new Set()))
})

Deno.test("shouldSuppressIntent: does not suppress 'request' by default", () => {
  assertFalse(shouldSuppressIntent("request", new Set()))
})

Deno.test("shouldSuppressIntent: does not suppress 'introduction' by default", () => {
  assertFalse(shouldSuppressIntent("introduction", new Set()))
})

Deno.test("shouldSuppressIntent: does not suppress 'decision_needed' by default", () => {
  assertFalse(shouldSuppressIntent("decision_needed", new Set()))
})

Deno.test("shouldSuppressIntent: suppresses an intent in the per-user suppressed set", () => {
  assert(shouldSuppressIntent("request", new Set(["request"])))
})

Deno.test("shouldSuppressIntent: suppresses 'introduction' when user has opted it out", () => {
  assert(shouldSuppressIntent("introduction", new Set(["introduction", "decision_needed"])))
})

Deno.test("shouldSuppressIntent: fyi is suppressed even when not in per-user set", () => {
  assert(shouldSuppressIntent("fyi", new Set(["question"])))
})

// ─── shouldIncludeSlackMessage ────────────────────────────────────────────────

Deno.test("shouldIncludeSlackMessage: always includes DMs regardless of allowlist", () => {
  assert(shouldIncludeSlackMessage(true, null, []))
  assert(shouldIncludeSlackMessage(true, "some-channel", []))
  assert(shouldIncludeSlackMessage(true, "#general", []))
})

Deno.test("shouldIncludeSlackMessage: includes a channel message when channel is in allowlist", () => {
  assert(shouldIncludeSlackMessage(false, "engineering", ["engineering", "product"]))
})

Deno.test("shouldIncludeSlackMessage: excludes a channel message when channel is not in allowlist", () => {
  assertFalse(shouldIncludeSlackMessage(false, "random", ["engineering", "product"]))
})

Deno.test("shouldIncludeSlackMessage: excludes a channel message when allowlist is empty", () => {
  assertFalse(shouldIncludeSlackMessage(false, "general", []))
})

Deno.test("shouldIncludeSlackMessage: excludes a channel message when channelName is null", () => {
  assertFalse(shouldIncludeSlackMessage(false, null, ["engineering"]))
})

Deno.test("shouldIncludeSlackMessage: channel matching is case-insensitive", () => {
  assert(shouldIncludeSlackMessage(false, "Engineering", ["engineering"]))
})

Deno.test("shouldIncludeSlackMessage: allowlist already normalized (no # prefix handling needed)", () => {
  // The normalizeChannelName helper strips # before building the allowlist.
  // By the time shouldIncludeSlackMessage is called the list is normalized.
  assert(shouldIncludeSlackMessage(false, "general", ["general"]))
})

// ─── normalizeChannelName ─────────────────────────────────────────────────────

Deno.test("normalizeChannelName: strips leading # and lowercases", () => {
  assertEquals(normalizeChannelName("#General"), "general")
})

Deno.test("normalizeChannelName: lowercases without a # prefix", () => {
  assertEquals(normalizeChannelName("Engineering"), "engineering")
})

Deno.test("normalizeChannelName: leaves already-normalized names unchanged", () => {
  assertEquals(normalizeChannelName("engineering"), "engineering")
})

Deno.test("normalizeChannelName: only strips one leading # (not double ##)", () => {
  assertEquals(normalizeChannelName("##double"), "#double")
})

Deno.test("normalizeChannelName: handles channel names with hyphens", () => {
  assertEquals(normalizeChannelName("#back-end-team"), "back-end-team")
})

// ─── inferSuppressionRules ────────────────────────────────────────────────────

Deno.test("inferSuppressionRules: returns empty lists when fewer than 3 dismissals", () => {
  const result = inferSuppressionRules(dismissals(2))
  assertEquals(result.newSenders, [])
  assertEquals(result.newDomains, [])
  assertEquals(result.newIntents, [])
})

Deno.test("inferSuppressionRules: returns empty lists when exactly 2 dismissals", () => {
  const result = inferSuppressionRules(dismissals(2, { sender_email: "x@y.com" }))
  assertEquals(result.newSenders, [])
})

Deno.test("inferSuppressionRules: adds sender to newSenders after 5 dismissals", () => {
  const result = inferSuppressionRules(dismissals(5, { sender_email: "spam@example.com" }))
  assert(result.newSenders.includes("spam@example.com"))
})

Deno.test("inferSuppressionRules: does not add sender with only 4 dismissals", () => {
  const result = inferSuppressionRules(dismissals(4, { sender_email: "spam@example.com" }))
  assertFalse(result.newSenders.includes("spam@example.com"))
})

Deno.test("inferSuppressionRules: adds domain to newDomains after 10 dismissals", () => {
  const result = inferSuppressionRules(dismissals(10, { sender_domain: "newsletter.com" }))
  assert(result.newDomains.includes("newsletter.com"))
})

Deno.test("inferSuppressionRules: does not add domain with only 9 dismissals", () => {
  const result = inferSuppressionRules(dismissals(9, { sender_domain: "newsletter.com" }))
  assertFalse(result.newDomains.includes("newsletter.com"))
})

Deno.test("inferSuppressionRules: adds intent to newIntents when it exceeds 80% threshold with min 5", () => {
  // 9 'fyi' + 1 'request' = 10 total; fyi is 90% > 80%, count ≥ 5 ✓
  const mixed: DismissalRecord[] = [
    ...Array.from({ length: 9 }, () => ({
      sender_email: "a@b.com",
      sender_domain: "b.com",
      intent_type: "fyi",
    })),
    { sender_email: "a@b.com", sender_domain: "b.com", intent_type: "request" },
  ]
  const result = inferSuppressionRules(mixed)
  assert(result.newIntents.includes("fyi"))
})

Deno.test("inferSuppressionRules: does not add intent that is exactly 80% (must exceed)", () => {
  // 4 'fyi' + 1 'request' = 5 total; fyi is 80%, not > 80%
  const mixed: DismissalRecord[] = [
    ...Array.from({ length: 4 }, () => ({
      sender_email: "a@b.com",
      sender_domain: "b.com",
      intent_type: "fyi",
    })),
    { sender_email: "a@b.com", sender_domain: "b.com", intent_type: "request" },
  ]
  const result = inferSuppressionRules(mixed)
  assertFalse(result.newIntents.includes("fyi"))
})

Deno.test("inferSuppressionRules: does not add intent when count < 5 even if percentage is high", () => {
  // 3 'fyi' + 0 others = 100% but only 3 dismissals total (below min-5 guard for intents)
  const recs: DismissalRecord[] = Array.from({ length: 3 }, () => ({
    sender_email: "a@b.com",
    sender_domain: "b.com",
    intent_type: "fyi",
  }))
  const result = inferSuppressionRules(recs)
  assertFalse(result.newIntents.includes("fyi"))
})

Deno.test("inferSuppressionRules: correctly suppresses multiple senders from mixed history", () => {
  const recs: DismissalRecord[] = [
    ...dismissals(5, { sender_email: "a@x.com", sender_domain: "x.com" }),
    ...dismissals(5, { sender_email: "b@x.com", sender_domain: "x.com" }),
  ]
  const result = inferSuppressionRules(recs)
  assert(result.newSenders.includes("a@x.com"))
  assert(result.newSenders.includes("b@x.com"))
})

Deno.test("inferSuppressionRules: handles records with null sender_email gracefully", () => {
  const recs: DismissalRecord[] = Array.from({ length: 5 }, () => ({
    sender_email: null,
    sender_domain: "x.com",
    intent_type: "request",
  }))
  const result = inferSuppressionRules(recs)
  assertEquals(result.newSenders, [])
})

Deno.test("inferSuppressionRules: handles records with null sender_domain gracefully", () => {
  const recs: DismissalRecord[] = Array.from({ length: 10 }, () => ({
    sender_email: "a@x.com",
    sender_domain: null,
    intent_type: "request",
  }))
  const result = inferSuppressionRules(recs)
  assertEquals(result.newDomains, [])
})

Deno.test("inferSuppressionRules: handles records with null intent_type gracefully", () => {
  const recs: DismissalRecord[] = Array.from({ length: 6 }, () => ({
    sender_email: "a@x.com",
    sender_domain: "x.com",
    intent_type: null,
  }))
  const result = inferSuppressionRules(recs)
  assertEquals(result.newIntents, [])
})

Deno.test("inferSuppressionRules: a sender with exactly 5 dismissals is added (boundary)", () => {
  const result = inferSuppressionRules(dismissals(5, { sender_email: "edge@case.com" }))
  assert(result.newSenders.includes("edge@case.com"))
})

Deno.test("inferSuppressionRules: a domain with exactly 10 dismissals is added (boundary)", () => {
  const result = inferSuppressionRules(dismissals(10, { sender_domain: "edge.com" }))
  assert(result.newDomains.includes("edge.com"))
})

Deno.test("inferSuppressionRules: does not double-count the same sender across two different addresses on the same domain", () => {
  const recs: DismissalRecord[] = [
    ...dismissals(3, { sender_email: "a@foo.com", sender_domain: "foo.com" }),
    ...dismissals(3, { sender_email: "b@foo.com", sender_domain: "foo.com" }),
  ]
  const result = inferSuppressionRules(recs)
  // Neither individual sender reaches 5
  assertFalse(result.newSenders.includes("a@foo.com"))
  assertFalse(result.newSenders.includes("b@foo.com"))
  // Domain has 6 dismissals — not yet 10
  assertFalse(result.newDomains.includes("foo.com"))
})

Deno.test("inferSuppressionRules: empty dismissal list returns empty results", () => {
  const result = inferSuppressionRules([])
  assertEquals(result.newSenders, [])
  assertEquals(result.newDomains, [])
  assertEquals(result.newIntents, [])
})
