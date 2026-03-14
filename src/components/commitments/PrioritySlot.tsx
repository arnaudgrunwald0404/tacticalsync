import { useRef, useState, useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PersonalPriority } from '@/types/commitments';

interface PrioritySlotProps {
  priority?: PersonalPriority;
  order: number; // 1-3
  readOnly?: boolean;
  onSave: (title: string) => Promise<void>;
  onDelete: () => Promise<void>;
}

export function PrioritySlot({ priority, order, readOnly = false, onSave, onDelete }: PrioritySlotProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(priority?.title ?? '');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setValue(priority?.title ?? ''); }, [priority?.title]);

  const handleBlur = async () => {
    setEditing(false);
    const trimmed = value.trim();
    if (trimmed === (priority?.title ?? '').trim()) return;
    if (!trimmed && !priority) return;
    await onSave(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setValue(priority?.title ?? ''); setEditing(false); }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); textareaRef.current?.blur(); }
  };

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

  return (
    <div
      className={cn(
        'group relative flex min-h-[4rem] gap-2 rounded-md border bg-card p-3',
        editing && 'ring-1 ring-ring',
      )}
    >
      <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
        {order}
      </span>

      <div className="flex-1">
        {editing ? (
          <textarea
            ref={textareaRef}
            autoFocus
            value={value}
            onChange={e => setValue(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            rows={3}
            className="w-full resize-none bg-transparent text-sm leading-relaxed outline-none"
            placeholder="Describe this quarterly priority…"
          />
        ) : (
          <p
            className={cn(
              'text-sm leading-relaxed text-foreground/90',
              !readOnly && 'cursor-text',
            )}
            onClick={() => !readOnly && setEditing(true)}
          >
            {priority?.title}
          </p>
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
