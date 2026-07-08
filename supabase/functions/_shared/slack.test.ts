import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { MAX_TIMESTAMP_SKEW_SECONDS, safeEqual, verifySlackSignature } from "./slack.ts"

const SIGNING_SECRET = "8f742231b10e8888abcd99yyyzzz85a"

/**
 * Computes a valid Slack v0 signature for a given body/timestamp, mirroring
 * https://api.slack.com/authentication/verifying-requests-from-slack
 */
async function signSlackRequest(
  signingSecret: string,
  timestamp: string,
  rawBody: string,
): Promise<string> {
  const basestring = `v0:${timestamp}:${rawBody}`
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const sigBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(basestring))
  const hex = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
  return `v0=${hex}`
}

Deno.test("verifySlackSignature accepts a validly signed, fresh request", async () => {
  const rawBody = "payload=%7B%22type%22%3A%22block_actions%22%7D"
  const timestamp = String(Math.floor(Date.now() / 1000))
  const signature = await signSlackRequest(SIGNING_SECRET, timestamp, rawBody)

  const result = await verifySlackSignature(SIGNING_SECRET, timestamp, signature, rawBody)
  assert(result, "expected a validly signed request to pass verification")
})

Deno.test("verifySlackSignature rejects a request with an invalid signature", async () => {
  const rawBody = "payload=%7B%22type%22%3A%22block_actions%22%7D"
  const timestamp = String(Math.floor(Date.now() / 1000))
  const badSignature = "v0=" + "0".repeat(64)

  const result = await verifySlackSignature(SIGNING_SECRET, timestamp, badSignature, rawBody)
  assertFalse(result, "expected an invalid signature to fail verification")
})

Deno.test("verifySlackSignature rejects a request with no signature/timestamp headers", async () => {
  const rawBody = "payload=%7B%22type%22%3A%22block_actions%22%7D"

  assertFalse(await verifySlackSignature(SIGNING_SECRET, null, null, rawBody))
  assertFalse(
    await verifySlackSignature(SIGNING_SECRET, String(Math.floor(Date.now() / 1000)), null, rawBody),
  )
  assertFalse(
    await verifySlackSignature(SIGNING_SECRET, null, "v0=" + "a".repeat(64), rawBody),
  )
})

Deno.test("verifySlackSignature rejects when signing secret is missing/empty", async () => {
  const rawBody = "payload=%7B%7D"
  const timestamp = String(Math.floor(Date.now() / 1000))
  const signature = await signSlackRequest(SIGNING_SECRET, timestamp, rawBody)

  // Even though the signature itself is well-formed, verifying with an empty
  // configured secret must fail closed rather than silently accept.
  const result = await verifySlackSignature("", timestamp, signature, rawBody)
  assertFalse(result)
})

Deno.test("verifySlackSignature rejects a replayed request older than the skew window", async () => {
  const rawBody = "payload=%7B%22type%22%3A%22block_actions%22%7D"
  const staleTimestamp = String(
    Math.floor(Date.now() / 1000) - (MAX_TIMESTAMP_SKEW_SECONDS + 60),
  )
  const signature = await signSlackRequest(SIGNING_SECRET, staleTimestamp, rawBody)

  const result = await verifySlackSignature(SIGNING_SECRET, staleTimestamp, signature, rawBody)
  assertFalse(result, "expected a stale/replayed timestamp to fail verification")
})

Deno.test("verifySlackSignature rejects a timestamp too far in the future", async () => {
  const rawBody = "payload=%7B%7D"
  const futureTimestamp = String(
    Math.floor(Date.now() / 1000) + (MAX_TIMESTAMP_SKEW_SECONDS + 60),
  )
  const signature = await signSlackRequest(SIGNING_SECRET, futureTimestamp, rawBody)

  const result = await verifySlackSignature(SIGNING_SECRET, futureTimestamp, signature, rawBody)
  assertFalse(result)
})

Deno.test("verifySlackSignature rejects a valid signature replayed with a tampered body", async () => {
  const originalBody = "payload=%7B%22type%22%3A%22block_actions%22%7D"
  const timestamp = String(Math.floor(Date.now() / 1000))
  const signature = await signSlackRequest(SIGNING_SECRET, timestamp, originalBody)

  const tamperedBody = "payload=%7B%22type%22%3A%22tampered%22%7D"
  const result = await verifySlackSignature(SIGNING_SECRET, timestamp, signature, tamperedBody)
  assertFalse(result, "expected a signature to be bound to the exact body it signed")
})

Deno.test("safeEqual compares strings correctly", () => {
  assert(safeEqual("abc123", "abc123"))
  assertFalse(safeEqual("abc123", "abc124"))
  assertFalse(safeEqual("short", "muchlonger"))
  assertEquals(safeEqual("", ""), true)
})
