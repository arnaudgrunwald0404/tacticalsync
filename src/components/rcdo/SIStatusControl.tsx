import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { InitiativeStatus } from '@/types/rcdo';

export const SI_STATUS_OPTIONS: { value: InitiativeStatus; label: string }[] = [
  { value: 'not_started', label: 'Not Started' },
  { value: 'on_track', label: 'On Track' },
  { value: 'at_risk', label: 'At Risk' },
  { value: 'off_track', label: 'Off Track' },
  { value: 'completed', label: 'Completed' },
];

const VALID_STATUSES: InitiativeStatus[] = ['not_started', 'on_track', 'at_risk', 'off_track', 'completed'];

// Legacy pre-migration values that may still exist on older rows.
const LEGACY_STATUS_MAP: Record<string, InitiativeStatus> = {
  draft: 'not_started',
  initialized: 'not_started',
  delayed: 'at_risk',
  cancelled: 'off_track',
  active: 'on_track',
  blocked: 'at_risk',
  done: 'completed',
};

export function normalizeSIStatus(status: string | null | undefined): InitiativeStatus {
  if (!status) return 'not_started';
  if (VALID_STATUSES.includes(status as InitiativeStatus)) return status as InitiativeStatus;
  return LEGACY_STATUS_MAP[status] || 'not_started';
}

export function getSIStatusLabel(status: string | null | undefined): string {
  const normalized = normalizeSIStatus(status);
  return SI_STATUS_OPTIONS.find((o) => o.value === normalized)?.label || 'Not Started';
}

function statusBadgeClassName(status: InitiativeStatus): string {
  switch (status) {
    case 'not_started':
      return 'bg-[#5B6E7A]';
    case 'on_track':
      return 'bg-green-500';
    case 'at_risk':
      return 'bg-yellow-500';
    case 'off_track':
      return 'bg-yellow-500';
    case 'completed':
      return 'bg-green-500';
    default:
      return 'bg-gray-500';
  }
}

interface SIStatusControlProps {
  status: string | null | undefined;
  canEdit: boolean;
  taskCount: number;
  onStatusChange: (status: InitiativeStatus) => Promise<void>;
  /** 'select' = plain dropdown (Canvas/Sub-SI panels). 'badge' = colored pill dropdown (Detail page header). */
  variant: 'select' | 'badge';
}

export function SIStatusControl({ status, canEdit, taskCount, onStatusChange, variant }: SIStatusControlProps) {
  const current = normalizeSIStatus(status);
  const [pendingStatus, setPendingStatus] = useState<InitiativeStatus | null>(null);

  const applyChange = async (value: InitiativeStatus) => {
    await onStatusChange(value);
  };

  const handleValueChange = (value: InitiativeStatus) => {
    if (value === 'completed' && taskCount === 0) {
      setPendingStatus(value);
      return;
    }
    void applyChange(value);
  };

  if (!canEdit) {
    return (
      <Badge className={statusBadgeClassName(current)}>
        {current.replace('_', ' ').toUpperCase()}
      </Badge>
    );
  }

  return (
    <>
      <Select value={current} onValueChange={handleValueChange}>
        <SelectTrigger
          aria-label="Status"
          className={
            variant === 'badge'
              ? `h-auto w-auto border-none rounded-full px-2.5 py-0.5 text-xs font-semibold text-white [&>svg]:text-white ${statusBadgeClassName(current)}`
              : 'h-7 text-xs'
          }
        >
          {variant === 'badge' ? (
            <span>{current.replace('_', ' ').toUpperCase()}</span>
          ) : (
            <SelectValue placeholder="Select status" />
          )}
        </SelectTrigger>
        <SelectContent>
          {SI_STATUS_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <AlertDialog open={pendingStatus !== null} onOpenChange={(open) => { if (!open) setPendingStatus(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark as complete with no tasks?</AlertDialogTitle>
            <AlertDialogDescription>
              This initiative doesn't have any tasks linked yet. Are you sure you want to mark it as Completed?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingStatus(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const value = pendingStatus;
                setPendingStatus(null);
                if (value) await applyChange(value);
              }}
            >
              Mark Complete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
