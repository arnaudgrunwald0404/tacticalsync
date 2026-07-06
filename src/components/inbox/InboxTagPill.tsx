import { useState, useRef, useEffect } from 'react';
import { X, ChevronRight, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsTouch } from '@/hooks/use-breakpoint';
import { tagStyle } from '@/lib/inboxValidation';
import type { InboxTag } from '@/types/inbox';

interface InboxTagPillProps {
  tag: InboxTag;
  onRemove?: () => void;
  size?: 'sm' | 'xs';
  workstreamSuffix?: string;
  workstreams?: InboxTag[];
  onSelectWorkstream?: (ws: InboxTag) => void;
  onCreateWorkstream?: (name: string) => Promise<void>;
}

export function InboxTagPill({
  tag, onRemove, size = 'sm', workstreamSuffix,
  workstreams, onSelectWorkstream, onCreateWorkstream,
}: InboxTagPillProps) {
  const prefix = tag.type === 'person' ? '@' : tag.type === 'workstream' ? '›' : '#';
  const hasWorkstreamMenu = (workstreams !== undefined) || !!onCreateWorkstream;

  const [hovered, setHovered] = useState(false);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const isTouch = useIsTouch();
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
        setNewName('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (creating) setTimeout(() => inputRef.current?.focus(), 0);
  }, [creating]);

  const commitCreate = async () => {
    if (newName.trim() && onCreateWorkstream) {
      await onCreateWorkstream(newName.trim());
    }
    setCreating(false);
    setNewName('');
    setOpen(false);
  };

  const showActions = hovered || open || isTouch;
  // Touch devices get a larger tap target than the 14px hover affordance.
  const actionSize = isTouch ? 'h-6 w-6' : 'h-3.5 w-3.5';

  return (
    <span
      className="relative inline-flex items-center gap-0.5"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Pill */}
      <span
        className={cn(
          'inline-flex items-center gap-0.5 rounded-full border font-medium whitespace-nowrap',
          size === 'xs' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
        )}
        style={tagStyle(tag.color)}
      >
        <span className="opacity-60">{prefix}</span>
        {tag.name}
        {workstreamSuffix && (
          <>
            <span className="opacity-40 mx-0.5">›</span>
            <span>{workstreamSuffix}</span>
          </>
        )}
      </span>

      {/* Hover actions: X and › */}
      {showActions && (onRemove || hasWorkstreamMenu) && (
        <span className="inline-flex items-center gap-0.5">
          {onRemove && (
            <button
              onClick={e => { e.stopPropagation(); onRemove(); }}
              className={cn(
                'rounded-full flex items-center justify-center bg-gray-100 hover:bg-red-100 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0',
                actionSize,
              )}
              title="Remove tag"
            >
              <X className={isTouch ? 'h-3 w-3' : 'h-2 w-2'} />
            </button>
          )}

          {hasWorkstreamMenu && (
            <div ref={menuRef} className="relative">
              <button
                onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
                className={cn(
                  'rounded-full flex items-center justify-center transition-colors flex-shrink-0',
                  actionSize,
                  open
                    ? 'bg-gray-700 text-white'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-400 hover:text-gray-600',
                )}
                title="Workstreams"
              >
                <ChevronRight className={isTouch ? 'h-3 w-3' : 'h-2 w-2'} />
              </button>

              {open && (
                <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[160px] py-1">
                  {workstreams && workstreams.length > 0 && (
                    <>
                      {workstreams.map(ws => (
                        <button
                          key={ws.id}
                          onClick={() => { onSelectWorkstream?.(ws); setOpen(false); }}
                          className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2"
                        >
                          <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: ws.color }} />
                          {ws.name}
                        </button>
                      ))}
                      <div className="border-t border-gray-100 my-1" />
                    </>
                  )}

                  {creating ? (
                    <div className="px-3 py-1.5 flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-gray-300 flex-shrink-0" />
                      <input
                        ref={inputRef}
                        value={newName}
                        onChange={e => setNewName(e.target.value)}
                        placeholder="Workstream name…"
                        className="flex-1 text-xs outline-none min-w-0"
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); commitCreate(); }
                          if (e.key === 'Escape') { setCreating(false); setNewName(''); }
                        }}
                        onBlur={commitCreate}
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => setCreating(true)}
                      className="w-full text-left px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 flex items-center gap-2"
                    >
                      <Plus className="h-3 w-3" />
                      New workstream
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </span>
      )}
    </span>
  );
}
