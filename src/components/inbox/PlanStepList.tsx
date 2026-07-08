import { Check, X, RotateCcw, Loader2, CheckCircle2, XCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PlanStepBadge } from './PlanStepBadge';
import { DelegationApprovalIntro } from './DelegationApprovalIntro';
import { tooltipForStep, describeStepOutcome } from '@/lib/delegationCopy';
import type { PlanStep } from '@/lib/delegationSteps';

interface PlanStepListProps {
  steps: PlanStep[];
  actorName?: string;
  onApproveStep: (stepId: string) => void;
  onRejectStep: (stepId: string) => void;
  onRetryStep: (stepId: string) => void;
}

/** Per-step approve/reject list — the "Approve & Execute" surface that replaced v1's single whole-plan Approve button. Shared between the compact DelegationStatusRow and the chat-style DelegationChatView so both surfaces stay consistent. */
export function PlanStepList({ steps, actorName = 'You', onApproveStep, onRejectStep, onRetryStep }: PlanStepListProps) {
  if (steps.length === 0) {
    return <p className="text-xs text-gray-400 italic">No actions are waiting on you for this task.</p>;
  }

  const ordered = [...steps].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-2">
      <DelegationApprovalIntro />
      {ordered.map((step) => (
        <div key={step.id} className="rounded-lg border border-gray-200 p-2 text-xs">
          <div className="flex items-start gap-2">
            <span className="flex-shrink-0 mt-0.5">
              {step.status === 'succeeded' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
              {step.status === 'failed' && <XCircle className="h-3.5 w-3.5 text-red-500" />}
              {step.status === 'rejected' && <XCircle className="h-3.5 w-3.5 text-gray-300" />}
              {(step.status === 'running') && <Loader2 className="h-3.5 w-3.5 text-violet-500 animate-spin" />}
              {(step.status === 'proposed' || step.status === 'approved') && <Info className="h-3.5 w-3.5 text-gray-300" />}
            </span>

            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={cn('text-gray-700', step.status === 'rejected' && 'line-through text-gray-400')}
                  title={tooltipForStep(step)}
                >
                  {step.description}
                </span>
                <PlanStepBadge tool={step.tool} />
              </div>

              {(step.status === 'succeeded' || step.status === 'failed' || step.status === 'rejected') && (
                <p className={cn('mt-1', step.status === 'failed' ? 'text-red-600' : 'text-gray-400')}>
                  {describeStepOutcome(step, actorName)}
                </p>
              )}
            </div>

            {step.status === 'proposed' && (
              <div className="flex-shrink-0 flex gap-1">
                <button
                  onClick={() => onApproveStep(step.id)}
                  title={tooltipForStep(step)}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-violet-600 text-white hover:bg-violet-700 transition-colors"
                >
                  <Check className="h-3 w-3" /> Approve &amp; Execute
                </button>
                <button
                  onClick={() => onRejectStep(step.id)}
                  className="flex items-center gap-1 text-xs px-2 py-1 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  <X className="h-3 w-3" /> Reject
                </button>
              </div>
            )}

            {step.status === 'failed' && (
              <button
                onClick={() => onRetryStep(step.id)}
                className="flex-shrink-0 flex items-center gap-1 text-xs px-2 py-1 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
              >
                <RotateCcw className="h-3 w-3" /> Retry
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
