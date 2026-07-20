import { useState } from 'react';
import { Bot, Loader2, ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Delegation, DelegationStatus } from '@/hooks/useInboxDelegation';
import { PlanStepList } from './PlanStepList';

// ── Status display config ─────────────────────────────────────────────────────

const STATUS_LABEL: Record<DelegationStatus, string> = {
  ramping_up:       'Ramping up…',
  clarifying:       'Clarifying…',
  planning:         'Planning…',
  getting_it_done:  'Getting it done…',
  seeking_approval: 'Seeking approval',
  done:             'Done',
  cancelled:        'Cancelled',
};

const STATUS_SPINNING: DelegationStatus[] = ['ramping_up', 'planning', 'getting_it_done'];

// ── Clarifying question UI ────────────────────────────────────────────────────

export function ClarifyingQuestion({
  question,
  choices,
  onAnswer,
}: {
  question: string;
  choices: string[];
  onAnswer: (answer: string) => void;
}) {
  const [custom, setCustom] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  return (
    <div className="mt-2 space-y-1.5">
      <p className="text-xs text-gray-700 font-medium">{question}</p>
      <div className="flex flex-col gap-1">
        {choices.map((choice) => {
          const isOther = choice.toLowerCase() === 'other';
          return (
            <button
              key={choice}
              onClick={() => {
                if (isOther) { setShowCustom(true); return; }
                onAnswer(choice);
              }}
              className={cn(
                'text-left text-xs px-3 py-1.5 rounded-lg border transition-colors',
                'border-gray-200 hover:border-violet-400 hover:bg-violet-50 hover:text-violet-700',
              )}
            >
              {choice}
            </button>
          );
        })}
      </div>
      {showCustom && (
        <div className="flex gap-2 mt-1">
          <input
            autoFocus
            value={custom}
            onChange={e => setCustom(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && custom.trim()) onAnswer(custom.trim()); }}
            placeholder="Type your answer…"
            className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-violet-400"
          />
          <button
            disabled={!custom.trim()}
            onClick={() => onAnswer(custom.trim())}
            className="text-xs px-3 py-1.5 rounded-lg bg-violet-600 text-white disabled:opacity-40 hover:bg-violet-700 transition-colors"
          >
            Submit
          </button>
        </div>
      )}
    </div>
  );
}

// ── Plan / log detail panel ───────────────────────────────────────────────────

function DelegationDetail({ delegation }: { delegation: Delegation }) {
  return (
    <div className="mt-2 space-y-2 text-xs text-gray-500">
      {delegation.plan && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Plan</p>
          <pre className="whitespace-pre-wrap font-sans text-gray-600 leading-relaxed">{delegation.plan}</pre>
        </div>
      )}
      {delegation.approval_summary && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Summary for approval</p>
          <p className="text-gray-600 leading-relaxed">{delegation.approval_summary}</p>
        </div>
      )}
      {delegation.agent_log.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">Agent log</p>
          <ul className="space-y-0.5">
            {delegation.agent_log.map((entry, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-gray-300 flex-shrink-0">
                  {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}
                </span>
                <span>{entry.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface DelegationStatusRowProps {
  delegation: Delegation;
  onAnswer: (answer: string) => void;
  onApproveStep: (stepId: string) => void;
  onRejectStep: (stepId: string) => void;
  onRetryStep: (stepId: string) => void;
  actorName?: string;
}

export function DelegationStatusRow({ delegation, onAnswer, onApproveStep, onRejectStep, onRetryStep, actorName }: DelegationStatusRowProps) {
  const [expanded, setExpanded] = useState(false);
  const spinning = STATUS_SPINNING.includes(delegation.status);
  const hasStructuredSteps = delegation.plan_steps.length > 0;
  // Legacy (v1) delegations have no plan_steps but may still have an
  // approval_summary — render those read-only, with no approval affordance,
  // per the backward-compatibility requirement in PLAN_idea6_delegation_v2.md §8.
  const showLegacySummaryInline = !hasStructuredSteps && delegation.status === 'seeking_approval' && !!delegation.approval_summary;

  return (
    <div className="ml-7 mb-2 border-l-2 border-violet-200 pl-3">
      {/* Status line */}
      <div className="flex items-center gap-2">
        <span className={cn(
          'flex-shrink-0 text-violet-500',
          spinning && 'animate-spin',
        )}>
          {spinning
            ? <Loader2 className="h-3.5 w-3.5" />
            : delegation.status === 'done'
            ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            : <Bot className="h-3.5 w-3.5" />
          }
        </span>

        <span className={cn(
          'text-xs font-medium',
          delegation.status === 'seeking_approval' ? 'text-violet-700' : 'text-gray-500',
        )}>
          {STATUS_LABEL[delegation.status]}
        </span>

        {/* Expand/collapse log */}
        {(delegation.agent_log.length > 0 || delegation.plan) && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="ml-auto text-gray-300 hover:text-gray-500 transition-colors"
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        )}
      </div>

      {/* Per-step approval list — the "Approve & Execute" surface */}
      {hasStructuredSteps && (delegation.status === 'seeking_approval' || delegation.status === 'getting_it_done' || delegation.status === 'done') && (
        <div className="mt-1.5">
          <PlanStepList
            steps={delegation.plan_steps}
            actorName={actorName}
            onApproveStep={onApproveStep}
            onRejectStep={onRejectStep}
            onRetryStep={onRetryStep}
          />
        </div>
      )}

      {/* Legacy summary — shown inline so user knows what they're approving */}
      {showLegacySummaryInline && (
        <p className="mt-1.5 text-xs text-gray-600 leading-relaxed">{delegation.approval_summary}</p>
      )}

      {/* Clarifying question */}
      {delegation.status === 'clarifying' && delegation.current_question && (
        <ClarifyingQuestion
          question={delegation.current_question.question}
          choices={delegation.current_question.choices}
          onAnswer={onAnswer}
        />
      )}

      {/* Expanded detail */}
      {expanded && <DelegationDetail delegation={delegation} />}
    </div>
  );
}
