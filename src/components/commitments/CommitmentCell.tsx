import { useRef, useState, useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StatusBadge, nextStatus } from './StatusBadge';
import type { MonthlyCommitment, CommitmentStatus } from '@/types/commitments';

interface CommitmentCellProps {
  commitment?: MonthlyCommitment;
  quarterId: string;
  userId: string;
  monthNumber: number;
  displayOrder: number;
  readOnly?: boolean;
  onSave: (value: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onStatusChange: (status: CommitmentStatus) => Promise<void>;
}

export function CommitmentCell({
  commitment,
  quarterId,
  userId,
  monthNumber,
  displayOrder,
  readOnly = false,
  onSave,
  onDelete,
  onStatusChange,
}: CommitmentCellProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(commitment?.title ?? '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setValue(commitment?.title ?? ''); }, [commitment?.title]);

  const handleBlur = async () => {
    setEditing(false);
    const trimmed = value.trim();
    if (trimmed === (commitment?.title ?? '').trim()) return;
    if (!trimmed && !commitment) return; // nothing to save
    await onSave(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setValue(commitment?.title ?? ''); setEditing(false); }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); textareaRef.current?.blur(); }
  };

  if (!commitment && !editing) {
    if (readOnly) return null;
    return (
      <button
        onClick={() => setEditing(true)}
        className="group flex h-full min-h-[3rem] w-full items-start gap-1.5 rounded-md border border-dashed border-border/40 p-2 text-left text-xs text-muted-foreground/50 transition-all hover:border-border hover:text-muted-foreground"
      >
        <Plus className="mt-0.5 h-3 w-3 flex-shrink-0 opacity-0 group-hover:opacity-100" />
        <span className="opacity-0 group-hover:opacity-100">Add commitment</span>
      </button>
    );
  }

  return (
    <div
      className={cn(
        'group relative flex min-h-[3rem] flex-col gap-1 rounded-md border bg-card p-2 text-xs',
        editing && 'ring-1 ring-ring',
      )}
    >
      {editing ? (
        <textarea
          ref={textareaRef}
          autoFocus
          value={value}
          onChange={e => setValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          rows={3}
          className="w-full resize-none bg-transparent text-xs leading-relaxed outline-none"
          placeholder="Describe this commitment…"
        />
      ) : (
        <p
          className={cn(
            'flex-1 cursor-text leading-relaxed text-foreground/90',
            readOnly && 'cursor-default',
          )}
          onClick={() => !readOnly && setEditing(true)}
        >
          {commitment?.title}
        </p>
      )}

      <div className="flex items-center justify-between">
        {commitment && (
          <StatusBadge
            status={commitment.status}
            onClick={readOnly ? undefined : () => onStatusChange(nextStatus(commitment.status))}
          />
        )}
        {!readOnly && commitment && (
          <button
            onClick={onDelete}
            className="ml-auto opacity-0 transition-opacity group-hover:opacity-60 hover:!opacity-100"
          >
            <X className="h-3 w-3 text-muted-foreground" />
          </button>
        )}
      </div>
    </div>
  );
}
