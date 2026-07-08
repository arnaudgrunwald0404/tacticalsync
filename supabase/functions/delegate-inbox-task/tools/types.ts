// Delegation v2 tool framework — shared types.
//
// v1 shipped exactly two tools (see PLAN_idea6_delegation_v2.md §6): the plan
// doc's other two candidates (draft_email, schedule_checkin) both need infra
// or a product decision this pass doesn't make, so ToolName only lists the
// two that are actually wired.

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

export interface ToolContext {
  db: unknown; // ReturnType<typeof createClient> — kept loose to avoid importing supabase-js types here
  userId: string;
  delegationId: string;
  stepId: string;
}

export interface ToolExecutionResult {
  result: unknown;
  targetTable?: string;
  targetId?: string;
}

export interface Tool {
  name: ToolName;
  /** Validates agent-produced params before they're shown to the user or executed. Returns an error string, or null if valid. */
  validateParams(params: Record<string, unknown>): string | null;
  /** Human-readable one-liner for the approval UI, using the real resolved target where possible. */
  describe(params: Record<string, unknown>): string;
  /** The actual side effect. Only called after a human has approved this step. */
  execute(ctx: ToolContext, params: Record<string, unknown>): Promise<ToolExecutionResult>;
}
