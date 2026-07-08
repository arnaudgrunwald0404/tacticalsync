// Deno-side mirror of src/lib/delegationSteps.ts — kept byte-for-byte
// equivalent in logic (not imported directly, since this runs under Deno and
// that runs under Vite/Node). See that file for the tested, documented
// version; this copy exists only because the edge function can't import from
// the app bundle.

export type ToolName = 'create_meeting_topic' | 'post_slack_update'

export type PlanStepStatus =
  | 'proposed' | 'approved' | 'rejected' | 'running' | 'succeeded' | 'failed' | 'skipped'

export interface PlanStep {
  id: string
  order: number
  tool: ToolName
  description: string
  params: Record<string, unknown>
  status: PlanStepStatus
  result?: unknown
  error?: string
  approved_by?: string
  approved_at?: string
  executed_at?: string
  idempotency_key: string
}

export type DelegationStatus =
  | 'ramping_up' | 'clarifying' | 'planning' | 'getting_it_done' | 'seeking_approval' | 'done' | 'cancelled'

const TERMINAL: PlanStepStatus[] = ['succeeded', 'rejected', 'skipped']

export function computeAggregateStatus(steps: PlanStep[]): DelegationStatus | null {
  if (steps.length === 0) return null
  if (steps.some((s) => s.status === 'proposed')) return 'seeking_approval'
  if (steps.every((s) => TERMINAL.includes(s.status))) return 'done'
  return 'getting_it_done'
}

export function buildMarkdownFromSteps(steps: PlanStep[]): string {
  return steps
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((s, i) => `${i + 1}. ${s.description}`)
    .join('\n')
}

export type ToolParamValidator = (tool: ToolName, params: Record<string, unknown>) => string | null

interface RawStep {
  tool?: unknown
  description?: unknown
  params?: unknown
}

export function buildPlanSteps(
  rawSteps: unknown,
  knownTools: ToolName[],
  validateParams: ToolParamValidator,
  genId: () => string,
): { steps: PlanStep[]; dropped: string[] } {
  const dropped: string[] = []
  if (!Array.isArray(rawSteps)) return { steps: [], dropped: ['response was not an array'] }

  const steps: PlanStep[] = []
  let order = 0
  for (const raw of rawSteps as RawStep[]) {
    if (!raw || typeof raw !== 'object') { dropped.push('entry was not an object'); continue }
    const tool = raw.tool
    if (typeof tool !== 'string' || !knownTools.includes(tool as ToolName)) {
      dropped.push(`unknown tool: ${String(tool)}`)
      continue
    }
    const params = (raw.params && typeof raw.params === 'object') ? raw.params as Record<string, unknown> : {}
    const paramError = validateParams(tool as ToolName, params)
    if (paramError) { dropped.push(`${tool}: ${paramError}`); continue }

    const description = typeof raw.description === 'string' && raw.description.trim()
      ? raw.description.trim()
      : `Run ${tool}`

    steps.push({
      id: genId(),
      order: order++,
      tool: tool as ToolName,
      description,
      params,
      status: 'proposed',
      idempotency_key: genId(),
    })
  }

  return { steps, dropped }
}
