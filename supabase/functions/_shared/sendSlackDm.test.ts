import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.168.0/testing/asserts.ts"
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"
import { sendSlackDM } from "./sendSlackDm.ts"

/** Minimal fake of the `supabase.from(...).select(...).eq(...).maybeSingle()` chain. */
function fakeSupabase(creds: { access_token: string; slack_user_id: string } | null): SupabaseClient {
  return {
    from(_table: string) {
      return {
        select(_cols: string) {
          return {
            eq(_col: string, _val: string) {
              return {
                maybeSingle: () => Promise.resolve({ data: creds, error: null }),
              }
            },
          }
        },
      }
    },
  } as unknown as SupabaseClient
}

/** Swaps global fetch for the duration of `fn`, then restores it. */
async function withStubbedFetch(
  handler: (input: string, init?: RequestInit) => Response | Promise<Response>,
  fn: () => Promise<void>,
): Promise<void> {
  const original = globalThis.fetch
  // deno-lint-ignore no-explicit-any
  globalThis.fetch = ((input: any, init?: RequestInit) => Promise.resolve(handler(String(input), init))) as typeof fetch
  try {
    await fn()
  } finally {
    globalThis.fetch = original
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

Deno.test("sendSlackDM returns false when the user has no Slack credentials", async () => {
  let fetchCalls = 0
  await withStubbedFetch(
    () => {
      fetchCalls++
      return jsonResponse({ ok: true })
    },
    async () => {
      const ok = await sendSlackDM(fakeSupabase(null), "user-1", "hello")
      assertFalse(ok)
    },
  )
  assertEquals(fetchCalls, 0, "expected no Slack API calls when credentials are missing")
})

Deno.test("sendSlackDM returns false when conversations.open fails", async () => {
  await withStubbedFetch(
    (url) => {
      if (url.includes("conversations.open")) {
        return jsonResponse({ ok: false, error: "user_not_found" })
      }
      throw new Error(`unexpected fetch to ${url}`)
    },
    async () => {
      const ok = await sendSlackDM(
        fakeSupabase({ access_token: "xoxp-test", slack_user_id: "U123" }),
        "user-1",
        "hello",
      )
      assertFalse(ok)
    },
  )
})

Deno.test("sendSlackDM opens a DM and posts the message, returning true on success", async () => {
  const posted: { url: string; body: Record<string, unknown> }[] = []
  await withStubbedFetch(
    (url, init) => {
      if (url.includes("conversations.open")) {
        posted.push({ url, body: JSON.parse(String(init?.body ?? "{}")) })
        return jsonResponse({ ok: true, channel: { id: "D123" } })
      }
      if (url.includes("chat.postMessage")) {
        posted.push({ url, body: JSON.parse(String(init?.body ?? "{}")) })
        return jsonResponse({ ok: true })
      }
      throw new Error(`unexpected fetch to ${url}`)
    },
    async () => {
      const ok = await sendSlackDM(
        fakeSupabase({ access_token: "xoxp-test", slack_user_id: "U123" }),
        "user-1",
        "hello there",
        [{ type: "section", text: { type: "mrkdwn", text: "hi" } }],
      )
      assert(ok)
    },
  )

  assertEquals(posted.length, 2)
  assertEquals(posted[0].body, { users: "U123" })
  assertEquals(posted[1].body.channel, "D123")
  assertEquals(posted[1].body.text, "hello there")
  assert(Array.isArray(posted[1].body.blocks))
})

Deno.test("sendSlackDM omits the blocks field when none are given", async () => {
  let postedBody: Record<string, unknown> | null = null
  await withStubbedFetch(
    (url, init) => {
      if (url.includes("conversations.open")) {
        return jsonResponse({ ok: true, channel: { id: "D456" } })
      }
      if (url.includes("chat.postMessage")) {
        postedBody = JSON.parse(String(init?.body ?? "{}"))
        return jsonResponse({ ok: true })
      }
      throw new Error(`unexpected fetch to ${url}`)
    },
    async () => {
      const ok = await sendSlackDM(
        fakeSupabase({ access_token: "xoxp-test", slack_user_id: "U999" }),
        "user-1",
        "no blocks here",
      )
      assert(ok)
    },
  )

  assert(postedBody !== null)
  assertFalse("blocks" in (postedBody as Record<string, unknown>))
})

Deno.test("sendSlackDM returns false when chat.postMessage reports a Slack-side failure", async () => {
  await withStubbedFetch(
    (url) => {
      if (url.includes("conversations.open")) {
        return jsonResponse({ ok: true, channel: { id: "D789" } })
      }
      if (url.includes("chat.postMessage")) {
        return jsonResponse({ ok: false, error: "channel_not_found" })
      }
      throw new Error(`unexpected fetch to ${url}`)
    },
    async () => {
      const ok = await sendSlackDM(
        fakeSupabase({ access_token: "xoxp-test", slack_user_id: "U1" }),
        "user-1",
        "hello",
      )
      assertFalse(ok)
    },
  )
})
