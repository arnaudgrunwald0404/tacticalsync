---
name: draft-response
description: Draft a reply to an inbound email or Slack message/thread, saved as a draft (never sent). Use this whenever the user asks to draft, write, or help with a reply/response to an email, thread, DM, or Slack message — phrases like "draft a reply to this email", "help me respond to this thread", "write a Slack reply", "reply to John's message", or "draft a response saying X". Also trigger when the user pastes in guidance about tone or content alongside a request to respond ("draft a reply, keep it short and firm about the deadline"). Works for both email (Gmail) and Slack — pick the channel based on where the source message lives.
---

# Draft Response

Draft a reply to an email or Slack message and save it as a draft. This skill never sends or posts anything — it only creates a draft the user reviews and sends themselves.

## Why drafts only

Sending a message is listed as an action requiring explicit user permission in this session's rules, and that permission is separate from whatever prompted the draft. Treat "draft a response" as authorization to *compose and save a draft*, not to send it. Use `create_draft` (Gmail) or `slack_send_message_draft` (Slack) — never the send/post equivalents. If the user's phrasing sounds like they want it sent right now ("reply and tell them yes"), still stop at the draft and ask before sending.

## Step 1: Find the source message

You need the actual thread/message content before you can write anything — don't guess at context.

If the user names or links the thread/message directly, fetch it. Otherwise ask which message/thread they mean; a vague "reply to Sarah" could match several conversations.

**Email (Gmail):** use `search_threads` to locate it if not given directly, then `get_thread` (or `get_message` for a single message) to read the full history — subject, participants, and prior messages in the chain matter for a reply that fits.

**Slack:** use `slack_search_public`/`slack_search_channels` to locate it if not given directly, then `slack_read_thread` (for a threaded reply) or `slack_read_channel` (for channel context) to read the surrounding messages.

Read enough of the history to know what's actually being asked or discussed — not just the latest message in isolation. A reply that ignores earlier context in the thread reads as careless.

## Step 2: Take the user's guidance as the primary steering input

Whatever the user typed alongside the request — tone, length, specific points to make or avoid, a stance to take — is the main lever for how you write the draft. Weight it heavily over any default style. Examples of guidance and how it should show up:

- "keep it short and friendly" → a few sentences, warm, no hedging
- "push back politely on the deadline" → decline/counter clearly, but soften with acknowledgment
- "say yes but ask about X" → confirm first, then raise the question
- "match their tone" → mirror the formality/casualness of the incoming message

If the user gave no guidance at all, fall back to sensible defaults: professional but not stiff, concise, matches the tone of the message being replied to, and skips unnecessary throat-clearing ("I hope this finds you well," "Thanks for reaching out!") unless the thread's own tone calls for it.

If the guidance and the thread context pull in different directions (e.g. guidance says "say yes" but the thread shows the user already declined twice), flag the tension to the user rather than silently picking one.

## Step 3: Write for the channel

The drafting logic is the same either way — read, understand, respond — but email and Slack read very differently, so match the channel's own conventions rather than writing one generic reply and dropping it in both places.

**Email:**
- Standard email structure: greeting, body, sign-off — but keep each part short unless the content demands more.
- Reply goes at the top of the chain (top-posting), not interleaved.
- Preserve the subject line convention (`Re: ...`) implicitly by replying in-thread via `create_draft` against the existing thread.
- Slightly more formal than Slack by default, but let the existing thread's register override this — don't out-formalize a casual back-and-forth.

**Slack:**
- No greeting/sign-off needed — Slack messages start straight into content.
- Shorter, more conversational; line breaks over paragraphs.
- Reply in-thread (not a new channel message) when responding to a threaded conversation, so it doesn't create a parallel conversation.
- Use emoji/reactions sparingly and only if the channel's existing tone already uses them — don't introduce a register the thread doesn't have.

## Step 4: Create the draft and show it to the user

1. Show the drafted text in chat first, so the user can catch anything off before it's saved.
2. Create the draft via `create_draft` (Gmail) or `slack_send_message_draft` (Slack).
3. Tell the user it's saved as a draft and that sending is still theirs to do — don't imply it went out.

If the user then asks to adjust it, edit and re-save the draft (`update_draft` for Gmail) rather than creating a duplicate.
