// Single source of truth for "what we do with this / why it matters" copy per
// integration. Rendered on the Settings integration pages (IntegrationExplainer)
// and in the onboarding wizard (IntegrationInfoPopover) so the two surfaces
// never drift out of sync. Keep every claim here true to what the code
// actually does — this exists specifically to be honest with users, including
// about things they wouldn't think to ask (what gets written, not just read;
// where a data boundary is drawn on purpose).

export interface IntegrationCopy {
  id: string;
  name: string;
  /** Concrete, factual actions taken with this connection — not marketing copy. */
  whatWeDo: string[];
  /** Benefits, ordered obvious-first, non-obvious-second. */
  whyItMatters: string[];
  /** Explicit limits — what this integration does NOT do, or a data boundary
   *  worth calling out. Optional; only meaningful ones are included. */
  boundaries?: string[];
}

export const INTEGRATION_COPY: Record<string, IntegrationCopy> = {
  calendar: {
    id: 'calendar',
    name: 'Google Calendar',
    whatWeDo: [
      "Reads your calendar to find recurring 1:1s and other meetings automatically, so you don't add them by hand.",
      "Infers how often you meet with each person from the recurrence pattern (weekly, biweekly, etc.), so we can tell when a 1:1 is skipped or drifting off-cadence.",
      'Matches attendees on each invite to the people you track, so meetings get attributed to the right person without you tagging them.',
    ],
    whyItMatters: [
      'Your 1:1 list builds itself from your real calendar instead of manual entry.',
      'Cadence detection lets the app notice "you usually meet weekly, but it\'s been three weeks" — a signal no single meeting record can give you on its own.',
    ],
    boundaries: [
      "Read-only — we never create, edit, or delete anything on your calendar.",
    ],
  },

  zoom: {
    id: 'zoom',
    name: 'Zoom',
    whatWeDo: [
      'Pulls recordings, transcripts, and AI-generated summaries for meetings you host, and stores the transcript so action items can be extracted from it.',
      "For meetings someone else hosts — found via your calendar connection — separately fetches that meeting's AI Companion transcript and summary.",
      "Falls back to Zoom's \"Meeting assets ready\" emails when the API comes up empty, since Zoom's AI Companion sometimes generates a summary even when a meeting was never cloud-recorded.",
      'Runs everything captured through an AI pass that proposes action items into a review queue.',
    ],
    whyItMatters: [
      "You don't have to rewatch or re-read a call to remember what was decided.",
      "Because this also covers meetings hosted by other people, it catches commitments made in 1:1s you didn't personally schedule — which is most 1:1s with a manager or peer.",
      'Suggested action items are proposals you approve, never auto-added to your task list — deliberately conservative so the app never puts words in your mouth.',
    ],
    boundaries: [
      'We never join or record meetings ourselves — only read what Zoom already generated after the fact.',
    ],
  },

  gmail: {
    id: 'gmail',
    name: 'Gmail',
    whatWeDo: [
      'Searches for and reads Zoom\'s "Meeting assets ready" emails, using their summary as a backup source when the Zoom API pipeline misses a meeting.',
      'Caches the email thread history between you and each person you track, for use as context before a 1:1.',
    ],
    whyItMatters: [
      "Catches meeting content the primary Zoom pipeline would otherwise miss — for example, when cloud recording is off but Zoom still emailed an AI summary.",
      'A lot of the real substance of a working relationship — commitments, decisions, tone — lives in email between meetings, not just in the meetings themselves; this is what lets prep briefs reflect that.',
    ],
    boundaries: [
      "Read-only — never sends, deletes, or modifies email on your behalf.",
      "Only reads messages matching specific patterns (Zoom notifications) or threads with people you've explicitly added as team members — not your whole inbox.",
    ],
  },

  slack: {
    id: 'slack',
    name: 'Slack',
    whatWeDo: [
      'Reads recent DMs and channel messages involving the people you track, to surface as context before a 1:1.',
      'Can send Slack DMs on your behalf — for example, notifying you when action items were extracted from a meeting, or delivering a prep note.',
      'Installs an `/add-to-my-lists` slash command in your workspace.',
    ],
    whyItMatters: [
      'Pulls recent conversation context into your prep without you hunting through channels.',
      "This is a two-way integration, not just a read pipe — the app can post DMs as you, which is worth knowing since most \"read your Slack\" integrations only read.",
    ],
    boundaries: [
      'Sends DMs only — never posts into channels on your behalf.',
      'The slash command is installed workspace-wide when you connect, not just for your own account.',
    ],
  },

  stackone: {
    id: 'stackone',
    name: 'StackOne',
    whatWeDo: [
      'Connects to 200+ third-party tools — CRM, ticketing, HRIS, messaging — through a single integration gateway, instead of a custom connector per tool.',
      'Treats each connected tool differently by type: CRM/ticketing data (Salesforce, HubSpot, Jira, Linear) becomes per-person prep context; direct-comms tools (Gong) are treated like Zoom or Slack — as primary meeting signal.',
    ],
    whyItMatters: [
      'One connection unlocks a long tail of tools without waiting on custom integration work.',
      "HRIS data (Workday, BambooHR, ADP, Rippling, Gusto) is deliberately used only for org-wide context — headcount, reporting lines — and is never projected onto an individual's prep sheet. That boundary is enforced on purpose so sensitive HR system data can't leak into a note about a specific person.",
    ],
    boundaries: [
      'Each provider is connected with read scopes for the specific data types listed for it — connecting through StackOne does not grant blanket write access to your CRM or HRIS.',
    ],
  },
};
