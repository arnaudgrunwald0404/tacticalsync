# To-Do

## One-on-One Drawer Redesign — done

The "One-on-One Drawer Redesign" described here previously shipped across two
work sessions: items 1, 2, and 5 were already live on `main` before this file
was last updated; items 3, 4, 6, and 7 (the critical cross-1:1 "My To-Dos"
aggregation view) shipped in
[PR #159](https://github.com/arnaudgrunwald0404/tacticalsync/pull/159). See
`docs/SPECIFICATION.md` §14 for the as-shipped summary, including how the
"where does my personal to-do list live?" open question was resolved
(`inbox_items`, via the existing `cos_meeting_actions` sync trigger).

## Thread-aware Slack capture via message shortcut

Idea: let users capture a to-do from Slack without typing any text — invoke
an action on a thread and have the backend guess the item from recent
context, rather than requiring `/add-to-my-lists some text` to be typed out
in full.

Slash commands can't do this directly: the `/add-to-my-lists` and
`/add-to-1on1` payloads (handled by
`supabase/functions/slack-add-suggestion`) don't include a `thread_ts`, so
there's no way to know which thread the command was typed in, even when
typed from a thread's reply box.

The right Slack primitive is a **message shortcut** (the "⋯" action menu on
a specific message) — its payload includes `thread_ts`/`channel`/the
message itself, so a handler could pull the last few replies via
`conversations.replies` and pass them to an LLM to guess the item, then
show a confirm step before inserting into `dci_suggested_tasks`. Bigger than
a slash-command tweak: needs a new Slack app shortcut registration, a new
edge function branch, an LLM summarization step, and confirmation UX so it
doesn't silently misfile things.

Nothing outstanding here — add new entries above this line as they come up.
