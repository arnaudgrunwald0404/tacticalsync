import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StatusBadge, nextStatus } from './StatusBadge';
import RichTextEditor from '@/components/ui/rich-text-editor-lazy';
import { isEmptyHtml, sanitizeHtmlForDisplay } from '@/lib/htmlUtils';
import type { MonthlyCommitment, CommitmentStatus } from '@/types/commitments';

const leftBorderByStatus: Record<CommitmentStatus, string> = {
  draft:       'border-l-gray-300',
  in_progress: 'border-l-yellow-400',
  done:        'border-l-green-500',
  not_done:    'border-l-red-500',
};

const isHtml = (s: string) => /<\/?[a-z][\s\S]*>/i.test(s);

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
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setValue(commitment?.title ?? ''); }, [commitment?.title]);

  const commit = async (nextValue: string) => {
    setEditing(false);
    const original = commitment?.title ?? '';
    if (nextValue === original) return;
    if (isEmptyHtml(nextValue) && !commitment) return;
    await onSave(isEmptyHtml(nextValue) ? '' : nextValue);
  };

  useEffect(() => {
    if (!editing) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        void commit(value);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setValue(commitment?.title ?? '');
        setEditing(false);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [editing, value, commitment?.title]);

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

  const statusBorder = commitment ? leftBorderByStatus[commitment.status] : 'border-l-gray-300';
  const renderedHtml = commitment?.title && isHtml(commitment.title)
    ? sanitizeHtmlForDisplay(commitment.title)
    : null;

  return (
    <div
      ref={containerRef}
      className={cn(
        'group relative flex min-h-[3rem] flex-col gap-1 rounded-md border border-l-4 bg-card p-2 text-xs',
        statusBorder,
        editing && 'ring-1 ring-ring',
      )}
    >
      {editing ? (
        <RichTextEditor
          content={value}
          onChange={setValue}
          placeholder="Describe this commitment…"
          bare
          autoFocus
          minHeight="1.25rem"
          className="commitments-rte commitments-rte-sm"
        />
      ) : renderedHtml ? (
        <div
          className={cn(
            'commitments-rte-display commitments-rte-display-sm flex-1 leading-relaxed text-foreground/90',
            !readOnly && 'cursor-text',
          )}
          onClick={() => !readOnly && setEditing(true)}
          dangerouslySetInnerHTML={{ __html: renderedHtml }}
        />
      ) : (
        <p
          className={cn(
            'flex-1 whitespace-pre-line cursor-text leading-relaxed text-foreground/90',
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
