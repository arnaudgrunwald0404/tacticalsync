// Pure step-array logic for Delegation v2 (idea #6). Mirrored (not imported —
// this runs under Vite/Node; the edge function runs under Deno) in
// supabase/functions/delegate-inbox-task/planSteps.ts, following this
// repo's existing pattern for logic shared between the two runtimes (see
// src/lib/slack/verifySlackSignature.ts / supabase/functions/_shared/slackSignature.ts).

export type ToolName = 'create_meeting_topic' | 'post_slack_update';

export type PlanStepStatus =
  | 'proposed'
  | 'approved'
  | 'rejected'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'skipped';

export interface PlanStep {
  id: string;
  order: number;
  tool: ToolName;
  description: string;
  params: Record<string, unknown>;
  status: PlanStepStatus;
  result?: unknown;
  error?: string;
  approved_by?: string;
  approved_at?: string;
  executed_at?: string;
  idempotency_key: string;
}

export type DelegationStatus =
  | 'ramping_up' | 'clarifying' | 'planning'
  | 'getting_it_done' | 'seeking_approval' | 'done' | 'cancelled';

const TERMINAL: PlanStepStatus[] = ['succeeded', 'rejected', 'skipped'];

/**
 * Recomputes the coarse-grained delegation status from the per-step statuses.
 * Returns null for an empty step array (legacy v1 delegations with no
 * plan_steps yet) so callers know to leave the existing status untouched
 * rather than misreading "no steps" as "done".
 */
export function computeAggregateStatus(steps: PlanStep[]): DelegationStatus | null {
  if (steps.length === 0) return null;
  if (steps.some((s) => s.status === 'proposed')) return 'seeking_approval';
  if (steps.every((s) => TERMINAL.includes(s.status))) return 'done';
  // At least one approved/running/failed and none proposed: still in progress,
  // including the "a step failed and needs attention" case — never silently
  // flip to done while a step is stuck in failed (per plan §5.2).
  return 'getting_it_done';
}

/** Renders the structured steps as a numbered markdown list, for the legacy `plan` text column and any UI that hasn't been updated to render structured steps yet. */
export function buildMarkdownFromSteps(steps: PlanStep[]): string {
  return steps
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((s, i) => `${i + 1}. ${s.description}`)
    .join('\n');
}

export interface ToolParamValidator {
  (tool: ToolName, params: Record<string, unknown>): string | null;
}

interface RawStep {
  tool?: unknown;
  description?: unknown;
  params?: unknown;
}

/**
 * Validates and normalizes Claude's raw JSON tool-call output into real
 * PlanStep objects. Invalid entries (unknown tool, failed param validation)
 * are dropped rather than persisted — mirrors this codebase's existing
 * try/catch-then-fall-back-safely convention (see rampUp()'s clarity check).
 */
export function buildPlanSteps(
  rawSteps: unknown,
  knownTools: ToolName[],
  validateParams: ToolParamValidator,
  genId: () => string,
): { steps: PlanStep[]; dropped: string[] } {
  const dropped: string[] = [];
  if (!Array.isArray(rawSteps)) return { steps: [], dropped: ['response was not an array'] };

  const steps: PlanStep[] = [];
  let order = 0;
  for (const raw of rawSteps as RawStep[]) {
    if (!raw || typeof raw !== 'object') { dropped.push('entry was not an object'); continue; }
    const tool = raw.tool;
    if (typeof tool !== 'string' || !knownTools.includes(tool as ToolName)) {
      dropped.push(`unknown tool: ${String(tool)}`);
      continue;
    }
    const params = (raw.params && typeof raw.params === 'object') ? raw.params as Record<string, unknown> : {};
    const paramError = validateParams(tool as ToolName, params);
    if (paramError) { dropped.push(`${tool}: ${paramError}`); continue; }

    const description = typeof raw.description === 'string' && raw.description.trim()
      ? raw.description.trim()
      : `Run ${tool}`;

    steps.push({
      id: genId(),
      order: order++,
      tool: tool as ToolName,
      description,
      params,
      status: 'proposed',
      idempotency_key: genId(),
    });
  }

  return { steps, dropped };
}
