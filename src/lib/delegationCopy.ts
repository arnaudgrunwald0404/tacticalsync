import type { PlanStep, ToolName } from './delegationSteps';

/** Per-tool tooltip copy, shown before the user decides to approve a step. Templated from the step's own (already server-resolved) params, never a generic placeholder — see PLAN_idea6_delegation_v2.md §9.2. */
export function tooltipForStep(step: PlanStep): string {
  const p = step.params as Record<string, unknown>;
  switch (step.tool) {
    case 'create_meeting_topic': {
      const name = (p.resolved_series_name as string) ?? 'your next meeting';
      const date = (p.resolved_date as string) ?? 'its next occurrence';
      return `What happens: Adds "${p.title}" as a topic to ${name} on ${date}. It'll show up on the agenda immediately and everyone with access to that meeting will see it.`;
    }
    case 'post_slack_update': {
      const target = p.channel ? `#${String(p.channel).replace(/^#/, '')}` : `a DM to ${p.dm_user_email}`;
      const preview = typeof p.message === 'string' && p.message.length > 140 ? `${p.message.slice(0, 140)}…` : p.message;
      return `What happens: Posts this message to ${target}, visible right away: "${preview}"`;
    }
    default:
      return 'What happens: this action runs immediately once approved.';
  }
}

/** Short, persistent (not hover-only) badge label per tool, so the action type survives a quick skim of the list. */
export function badgeForTool(tool: ToolName): string {
  switch (tool) {
    case 'create_meeting_topic': return 'Adds to meeting';
    case 'post_slack_update': return 'Posts to Slack';
    default: return '';
  }
}

/** Plain-language, past-tense description of what actually happened for a step that has run — for the audit-trail line under a succeeded/failed step (PLAN §9.4). Never raw log data; always names the actor explicitly. */
export function describeStepOutcome(step: PlanStep, actorName: string): string {
  const when = step.executed_at ? new Date(step.executed_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

  if (step.status === 'succeeded') {
    switch (step.tool) {
      case 'create_meeting_topic':
        return `${actorName}'s agent added this topic to the meeting${when ? ` on ${when}` : ''}.`;
      case 'post_slack_update':
        return `${actorName}'s agent posted this Slack update on your behalf${when ? ` on ${when}` : ''}.`;
      default:
        return `${actorName}'s agent completed this${when ? ` on ${when}` : ''}.`;
    }
  }

  if (step.status === 'failed') {
    return `This didn't go through${step.error ? ` — ${step.error}` : '.'}`;
  }

  if (step.status === 'rejected') {
    return `${actorName} chose not to do this.`;
  }

  return '';
}
