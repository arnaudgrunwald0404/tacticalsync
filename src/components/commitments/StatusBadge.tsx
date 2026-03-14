import { cn } from '@/lib/utils';
import type { CommitmentStatus } from '@/types/commitments';

const config: Record<CommitmentStatus, { dot: string; label: string }> = {
  pending:     { dot: 'bg-gray-300',   label: 'Pending' },
  in_progress: { dot: 'bg-yellow-400', label: 'In Progress' },
  done:        { dot: 'bg-green-500',  label: 'Done' },
  at_risk:     { dot: 'bg-red-500',    label: 'At Risk' },
};

interface StatusBadgeProps {
  status: CommitmentStatus;
  onClick?: () => void;
  className?: string;
}

export function StatusBadge({ status, onClick, className }: StatusBadgeProps) {
  const { dot, label } = config[status];
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={cn(
        'flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-opacity',
        onClick ? 'cursor-pointer hover:opacity-80' : 'cursor-default',
        className,
      )}
    >
      <span className={cn('h-2 w-2 rounded-full flex-shrink-0', dot)} />
      <span className="text-muted-foreground">{label}</span>
    </button>
  );
}

const cycle: CommitmentStatus[] = ['pending', 'in_progress', 'done', 'at_risk'];

export function nextStatus(current: CommitmentStatus): CommitmentStatus {
  return cycle[(cycle.indexOf(current) + 1) % cycle.length];
}
