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

export function validateToolParams(tool: ToolName, params: Record<string, unknown>): string | null {
  switch (tool) {
    case 'create_meeting_topic': return validateCreateMeetingTopicParams(params);
    case 'post_slack_update': return validatePostSlackUpdateParams(params);
    default: return 'unknown tool';
  }
}

export function describeToolStep(tool: ToolName, params: Record<string, unknown>): string {
  switch (tool) {
    case 'create_meeting_topic': return describeCreateMeetingTopic(params);
    case 'post_slack_update': return describePostSlackUpdate(params);
    default: return `Run ${tool}`;
  }
}
