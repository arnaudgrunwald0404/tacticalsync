import { useEffect, useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StatusBadge, nextStatus } from './StatusBadge';
import RichTextEditor from '@/components/ui/rich-text-editor-lazy';
import { isEmptyHtml, sanitizeHtmlForDisplay } from '@/lib/htmlUtils';
import type { QuarterlyPriority, CommitmentStatus } from '@/types/commitments';

const leftBorderByStatus: Record<CommitmentStatus, string> = {
  draft:       'border-l-gray-300',
  in_progress: 'border-l-yellow-400',
  done:        'border-l-green-500',
  not_done:    'border-l-red-500',
};

interface PrioritySlotProps {
  priority?: QuarterlyPriority;
  order: number; // 1-3
  readOnly?: boolean;
  onSave: (title: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onStatusChange?: (status: CommitmentStatus) => Promise<void>;
}

const isHtml = (s: string) => /<\/?[a-z][\s\S]*>/i.test(s);

export function PrioritySlot({ priority, order, readOnly = false, onSave, onDelete, onStatusChange }: PrioritySlotProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(priority?.title ?? '');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setValue(priority?.title ?? ''); }, [priority?.title]);

  const commit = async (nextValue: string) => {
    setEditing(false);
    const original = priority?.title ?? '';
    if (nextValue === original) return;
    if (isEmptyHtml(nextValue) && !priority) return;
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
        setValue(priority?.title ?? '');
        setEditing(false);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [editing, value, priority?.title]);

  if (!priority && !editing) {
    if (readOnly) {
      return (
        <div className="flex min-h-[4rem] items-center rounded-md border border-dashed border-border/30 p-3 text-xs text-muted-foreground/40">
          —
        </div>
      );
    }
    return (
      <button
        onClick={() => setEditing(true)}
        className="group flex min-h-[4rem] w-full items-start gap-2 rounded-md border border-dashed border-border/40 p-3 text-left text-sm text-muted-foreground/50 transition-all hover:border-border hover:text-muted-foreground"
      >
        <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
          {order}
        </span>
        <span className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
          <Plus className="h-3.5 w-3.5" /> Add priority
        </span>
      </button>
    );
  }

  const statusBorder = priority ? leftBorderByStatus[priority.status] : 'border-l-gray-300';
  const renderedHtml = priority?.title && isHtml(priority.title)
    ? sanitizeHtmlForDisplay(priority.title)
    : null;

  return (
    <div
      ref={containerRef}
      className={cn(
        'group relative flex min-h-[4rem] gap-2 rounded-md border border-l-4 bg-card p-3',
        statusBorder,
        editing && 'ring-1 ring-ring',
      )}
    >
      <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
        {order}
      </span>

      <div className="flex-1 flex flex-col gap-1 min-w-0">
        {editing ? (
          <RichTextEditor
            content={value}
            onChange={setValue}
            placeholder="Describe this quarterly priority…"
            bare
            autoFocus
            minHeight="1.25rem"
            className="commitments-rte"
          />
        ) : renderedHtml ? (
          <div
            className={cn(
              'commitments-rte-display flex-1 text-sm leading-relaxed text-foreground/90',
              !readOnly && 'cursor-text',
            )}
            onClick={() => !readOnly && setEditing(true)}
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />
        ) : (
          <p
            className={cn(
              'flex-1 whitespace-pre-line text-sm leading-relaxed text-foreground/90',
              !readOnly && 'cursor-text',
            )}
            onClick={() => !readOnly && setEditing(true)}
          >
            {priority?.title}
          </p>
        )}
        {priority && (
          <StatusBadge
            status={priority.status}
            onClick={!readOnly && onStatusChange ? () => onStatusChange(nextStatus(priority.status)) : undefined}
          />
        )}
      </div>

      {!readOnly && priority && (
        <button
          onClick={onDelete}
          className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-60 hover:!opacity-100"
        >
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      )}
    </div>
  );
}
