// Pure (DB-free) validation + description logic for Delegation v2 tools,
// mirrored (not imported — Deno can't import from the app bundle) in
// supabase/functions/delegate-inbox-task/tools/*.ts, which additionally
// implement `execute()` (the actual side effect, which needs the DB/Slack
// clients only available at runtime in the edge function).

import type { ToolName } from './delegationSteps';

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function validateCreateMeetingTopicParams(params: Record<string, unknown>): string | null {
  if (typeof params.series_id !== 'string' || typeof params.title !== 'string') {
    return 'series_id and title are required.';
  }
  if (!UUID_RE.test(params.series_id)) return 'series_id must be a UUID.';
  if (!params.title.trim()) return 'title cannot be empty.';
  if (params.title.length > 200) return 'title is too long (max 200 characters).';
  if (params.notes !== undefined && typeof params.notes !== 'string') return 'notes must be a string.';
  return null;
}

export function describeCreateMeetingTopic(params: Record<string, unknown>): string {
  const title = params.title as string;
  const seriesName = params.resolved_series_name as string | undefined;
  const date = params.resolved_date as string | undefined;
  if (seriesName && date) {
    return `Add "${title}" as a topic to your next ${seriesName} meeting on ${date}`;
  }
  return `Add "${title}" as a topic to your next meeting`;
}

export function validatePostSlackUpdateParams(params: Record<string, unknown>): string | null {
  if (typeof params.message !== 'string' || !params.message.trim()) return 'message cannot be empty.';
  if (params.message.length > 3000) return 'message is too long (max 3000 characters).';
  const hasChannel = typeof params.channel === 'string' && params.channel.trim().length > 0;
  const hasDm = typeof params.dm_user_email === 'string' && params.dm_user_email.trim().length > 0;
  if (hasChannel === hasDm) return 'exactly one of channel or dm_user_email must be provided.';
  return null;
}

export function describePostSlackUpdate(params: Record<string, unknown>): string {
  const message = params.message as string;
  const preview = message.length > 140 ? `${message.slice(0, 140)}…` : message;
  const target = typeof params.channel === 'string' ? `#${params.channel.replace(/^#/, '')}` : (params.dm_user_email as string);
  return `Post to ${target}: "${preview}"`;
}

const MAX_PROPOSE_MEETING_WINDOW_DAYS = 14;

export function validateProposeMeetingTimeParams(params: Record<string, unknown>): string | null {
  if (
    typeof params.team_member_id !== 'string'
    || typeof params.window_start_utc !== 'string'
    || typeof params.window_end_utc !== 'string'
    || typeof params.duration_minutes !== 'number'
  ) {
    return 'team_member_id, window_start_utc, window_end_utc and duration_minutes are required.';
  }
  if (!UUID_RE.test(params.team_member_id)) return 'team_member_id must be a UUID.';

  const start = Date.parse(params.window_start_utc);
  const end = Date.parse(params.window_end_utc);
  if (Number.isNaN(start)) return 'window_start_utc must be a valid ISO datetime.';
  if (Number.isNaN(end)) return 'window_end_utc must be a valid ISO datetime.';
  if (end <= start) return 'window_end_utc must be after window_start_utc.';
  if (end - start > MAX_PROPOSE_MEETING_WINDOW_DAYS * 86_400_000) {
    return `window cannot span more than ${MAX_PROPOSE_MEETING_WINDOW_DAYS} days.`;
  }

  if (!Number.isFinite(params.duration_minutes) || params.duration_minutes < 5 || params.duration_minutes > 480) {
    return 'duration_minutes must be between 5 and 480.';
  }
  if (end - start < params.duration_minutes * 60_000) return 'the window is shorter than duration_minutes.';

  return null;
}

function formatProposeMeetingWindow(startUtc: string, endUtc: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' };
  const start = new Date(startUtc).toLocaleString('en-US', opts);
  const end = new Date(endUtc).toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
  return `${start}–${end} UTC`;
}

export function describeProposeMeetingTime(params: Record<string, unknown>): string {
  const name = (params.resolved_member_name as string | undefined) ?? 'them';
  const windowStart = params.window_start_utc as string;
  const windowEnd = params.window_end_utc as string;
  return `Check my calendar ${formatProposeMeetingWindow(windowStart, windowEnd)} and send ${name} time options via Slack`;
}

export function validateToolParams(tool: ToolName, params: Record<string, unknown>): string | null {
  switch (tool) {
    case 'create_meeting_topic': return validateCreateMeetingTopicParams(params);
    case 'post_slack_update': return validatePostSlackUpdateParams(params);
    case 'propose_meeting_time': return validateProposeMeetingTimeParams(params);
    default: return 'unknown tool';
  }
}

export function describeToolStep(tool: ToolName, params: Record<string, unknown>): string {
  switch (tool) {
    case 'create_meeting_topic': return describeCreateMeetingTopic(params);
    case 'post_slack_update': return describePostSlackUpdate(params);
    case 'propose_meeting_time': return describeProposeMeetingTime(params);
    default: return `Run ${tool}`;
  }
}
