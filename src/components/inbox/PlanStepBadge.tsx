import { cn } from '@/lib/utils';
import { badgeForTool } from '@/lib/delegationCopy';
import type { ToolName } from '@/lib/delegationSteps';

/** Persistent (not hover-only) per-tool badge so the action type survives a quick skim, not just a hover a user might never trigger. */
export function PlanStepBadge({ tool }: { tool: ToolName }) {
  const label = badgeForTool(tool);
  if (!label) return null;
  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium',
      'bg-gray-100 text-gray-500',
    )}>
      {label}
    </span>
  );
}
