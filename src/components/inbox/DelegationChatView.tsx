import { Loader2, CheckCircle2 } from 'lucide-react';
import { ChatBubble } from './ChatBubble';
import { ClarifyingQuestion } from './DelegationStatusRow';
import { PlanStepList } from './PlanStepList';
import type { Delegation, DelegationStatus } from '@/hooks/useInboxDelegation';

const SPINNING_STATUSES: DelegationStatus[] = ['ramping_up', 'planning', 'getting_it_done'];

interface DelegationChatViewProps {
  delegation: Delegation | null;
  submitAnswer: (answer: string) => Promise<void>;
  approveStep: (stepId: string) => Promise<void>;
  rejectStep: (stepId: string) => Promise<void>;
  retryStep: (stepId: string) => Promise<void>;
}

/** Renders an active delegation as a chat thread inside the item's Assistant
 *  panel view — each agent_log entry is its own turn, arriving live via the
 *  realtime subscription the parent panel already holds via useInboxDelegation
 *  (subscribing again here would open a second realtime channel for the same
 *  item). The compact DelegationStatusRow in the list stays as a separate,
 *  quicker-glance surface. */
export function DelegationChatView({ delegation, submitAnswer, approveStep, rejectStep, retryStep }: DelegationChatViewProps) {
  if (!delegation) return null;

  const spinning = SPINNING_STATUSES.includes(delegation.status);
  const hasStructuredSteps = delegation.plan_steps.length > 0;

  return (
    <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-3 flex flex-col gap-2.5">
      {delegation.agent_log.map((entry, i) => (
        <ChatBubble key={`${entry.timestamp}-${i}`} role="agent">{entry.text}</ChatBubble>
      ))}

      {delegation.status === 'clarifying' && delegation.current_question && (
        <ChatBubble role="agent">
          <ClarifyingQuestion
            question={delegation.current_question.question}
            choices={delegation.current_question.choices}
            onAnswer={submitAnswer}
          />
        </ChatBubble>
      )}

      {hasStructuredSteps && (delegation.status === 'seeking_approval' || delegation.status === 'getting_it_done' || delegation.status === 'done') && (
        <ChatBubble role="agent">
          <PlanStepList
            steps={delegation.plan_steps}
            onApproveStep={approveStep}
            onRejectStep={rejectStep}
            onRetryStep={retryStep}
          />
        </ChatBubble>
      )}

      {!hasStructuredSteps && delegation.status === 'seeking_approval' && delegation.approval_summary && (
        <ChatBubble role="agent">
          <p>{delegation.approval_summary}</p>
        </ChatBubble>
      )}

      {delegation.status === 'done' && (
        <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium pl-1">
          <CheckCircle2 className="h-3.5 w-3.5" />Approved
        </div>
      )}

      {spinning && (
        <div className="flex gap-2 items-center text-gray-400 pl-1">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span className="text-xs">Working…</span>
        </div>
      )}
    </div>
  );
}
