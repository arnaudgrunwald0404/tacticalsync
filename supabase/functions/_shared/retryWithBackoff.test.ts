import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import { retryWithBackoff } from "./retryWithBackoff.ts"

function jsonResponse(status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({}), { status, headers })
}

Deno.test("retryWithBackoff returns immediately on a successful response", async () => {
  let calls = 0
  const res = await retryWithBackoff(
    () => {
      calls++
      return Promise.resolve(jsonResponse(200))
    },
    { integration: "test", baseDelayMs: 1, maxDelayMs: 2 },
  )
  assertEquals(calls, 1)
  assertEquals(res.status, 200)
})

Deno.test("retryWithBackoff does not retry non-retryable 4xx responses", async () => {
  let calls = 0
  const res = await retryWithBackoff(
    () => {
      calls++
      return Promise.resolve(jsonResponse(404))
    },
    { integration: "test", baseDelayMs: 1, maxDelayMs: 2 },
  )
  assertEquals(calls, 1, "expected no retries for a 404")
  assertEquals(res.status, 404)
})

Deno.test("retryWithBackoff retries 5xx responses up to maxAttempts, then returns the last response", async () => {
  let calls = 0
  const res = await retryWithBackoff(
    () => {
      calls++
      return Promise.resolve(jsonResponse(503))
    },
    { integration: "test", maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2 },
  )
  assertEquals(calls, 3)
  assertEquals(res.status, 503)
})

Deno.test("retryWithBackoff retries 429 responses and succeeds once the caller recovers", async () => {
  let calls = 0
  const res = await retryWithBackoff(
    () => {
      calls++
      return Promise.resolve(calls < 2 ? jsonResponse(429) : jsonResponse(200))
    },
    { integration: "test", maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2 },
  )
  assertEquals(calls, 2)
  assertEquals(res.status, 200)
})

Deno.test("retryWithBackoff honors a numeric Retry-After header on 429", async () => {
  let calls = 0
  const start = Date.now()
  const res = await retryWithBackoff(
    () => {
      calls++
      return Promise.resolve(
        calls < 2 ? jsonResponse(429, { "Retry-After": "0" }) : jsonResponse(200),
      )
    },
    { integration: "test", maxAttempts: 3, baseDelayMs: 5_000, maxDelayMs: 10_000 },
  )
  const elapsed = Date.now() - start
  assertEquals(res.status, 200)
  // Retry-After: 0 should short-circuit the much larger computed backoff delay.
  assert(elapsed < 1_000, `expected Retry-After to override backoff delay, took ${elapsed}ms`)
})

Deno.test("retryWithBackoff retries thrown/network errors and eventually rethrows", async () => {
  let calls = 0
  let thrown: unknown = null
  try {
    await retryWithBackoff(
      () => {
        calls++
        throw new Error("network down")
      },
      { integration: "test", maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2 },
    )
  } catch (err) {
    thrown = err
  }
  assertEquals(calls, 3)
  assert(thrown instanceof Error)
  assertEquals((thrown as Error).message, "network down")
})

Deno.test("retryWithBackoff recovers from a thrown error on a later attempt", async () => {
  let calls = 0
  const res = await retryWithBackoff(
    () => {
      calls++
      if (calls < 2) throw new Error("transient")
      return Promise.resolve(jsonResponse(200))
    },
    { integration: "test", maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2 },
  )
  assertEquals(calls, 2)
  assertEquals(res.status, 200)
})
