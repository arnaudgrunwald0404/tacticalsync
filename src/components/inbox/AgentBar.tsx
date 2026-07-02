import { useState, useRef, useCallback } from 'react';
import { CheckSquare, FileText, Sparkles, ArrowUp, Hash, AtSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InboxTagPill } from './InboxTagPill';
import { useIsTouch } from '@/hooks/use-breakpoint';
import type { InboxTag, InboxItemType } from '@/types/inbox';

type Mode = 'task' | 'note' | 'agent';

interface AgentBarProps {
  tags: InboxTag[];
  onSubmit: (text: string, type: InboxItemType, tagIds: string[]) => Promise<void>;
  onCreateTag: (name: string, type: 'project' | 'person', color: string) => Promise<InboxTag | null>;
}

const MODE_CONFIG: Record<Mode, { label: string; icon: React.ReactNode; placeholder: string; type: InboxItemType }> = {
  task:  { label: 'Task',  icon: <CheckSquare className="h-3.5 w-3.5" />, placeholder: 'Add a task… # to tag',  type: 'task' },
  note:  { label: 'Note',  icon: <FileText className="h-3.5 w-3.5" />,    placeholder: 'Capture a note…',       type: 'note' },
  agent: { label: 'Agent', icon: <Sparkles className="h-3.5 w-3.5" />,   placeholder: 'Ask your agent…',       type: 'agent_nudge' },
};

const DEFAULT_COLORS = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6'];

export function AgentBar({ tags, onSubmit, onCreateTag }: AgentBarProps) {
  const isTouch = useIsTouch();
  const [mode, setMode] = useState<Mode>('task');
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [pendingTags, setPendingTags] = useState<InboxTag[]>([]);
  const [autocomplete, setAutocomplete] = useState<{ type: '#' | '@'; query: string } | null>(null);
  const [acActiveIdx, setAcActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleInput = useCallback((value: string) => {
    setText(value);
    const match = value.match(/[#@]([a-zA-Z0-9 _-]*)$/);
    if (match) {
      setAutocomplete({ type: match[0][0] as '#' | '@', query: match[1] });
      setAcActiveIdx(0);
    } else {
      setAutocomplete(null);
    }
  }, []);

  const applyTag = useCallback(async (name: string, tagType: 'project' | 'person') => {
    const color = DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)];
    const existing = tags.find(t => t.name.toLowerCase() === name.toLowerCase());
    const tag = existing ?? await onCreateTag(name, tagType, color);
    if (tag && !pendingTags.find(t => t.id === tag.id)) {
      setPendingTags(prev => [...prev, tag]);
    }
    setText(prev => prev.replace(/[#@][a-zA-Z0-9 _-]*$/, '').trimEnd());
    setAutocomplete(null);
    inputRef.current?.focus();
  }, [tags, pendingTags, onCreateTag]);

  const handleSubmit = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed && pendingTags.length === 0) return;
    await onSubmit(trimmed || '(no text)', MODE_CONFIG[mode].type, pendingTags.map(t => t.id));
    setText('');
    setPendingTags([]);
    setAutocomplete(null);
  }, [text, pendingTags, mode, onSubmit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (autocomplete) {
      const options = tags.filter(t =>
        t.name.toLowerCase().includes(autocomplete.query.toLowerCase()) &&
        (autocomplete.type === '@' ? t.type === 'person' : t.type === 'project')
      );
      if (e.key === 'ArrowDown') { e.preventDefault(); setAcActiveIdx(i => Math.min(i + 1, Math.max(0, options.length - 1))); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setAcActiveIdx(i => Math.max(0, i - 1)); return; }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        const tagType = autocomplete.type === '@' ? 'person' : 'project';
        if (options.length > 0) applyTag(options[Math.min(acActiveIdx, options.length - 1)].name, tagType);
        else if (autocomplete.query) applyTag(autocomplete.query, tagType);
        return;
      }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSubmit(); }
    if (e.key === 'Escape') { setAutocomplete(null); inputRef.current?.blur(); }
  }, [autocomplete, acActiveIdx, tags, applyTag, handleSubmit]);

  const filtered = autocomplete
    ? tags.filter(t =>
        t.name.toLowerCase().includes(autocomplete.query.toLowerCase()) &&
        (autocomplete.type === '@' ? t.type === 'person' : t.type === 'project')
      )
    : [];

  return (
    <div className="flex-shrink-0 relative px-3 pb-3 pt-2">
      {/* Autocomplete — pops upward */}
      {autocomplete && (
        <div className="absolute bottom-full left-3 right-3 z-20 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto mb-1">
          {filtered.length === 0 ? (
            <button
              className="w-full text-left px-3 py-2 text-sm text-gray-500 hover:bg-gray-50 flex items-center gap-2"
              onClick={() => applyTag(autocomplete.query || 'new', autocomplete.type === '@' ? 'person' : 'project')}
            >
              {autocomplete.type === '@' ? <AtSign className="h-3.5 w-3.5" /> : <Hash className="h-3.5 w-3.5" />}
              Create "{autocomplete.query || '...'}"
            </button>
          ) : (
            filtered.map((tag, idx) => (
              <button
                key={tag.id}
                className={cn(
                  'w-full text-left px-3 py-2 text-sm flex items-center gap-2',
                  idx === acActiveIdx ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-50',
                )}
                onMouseEnter={() => setAcActiveIdx(idx)}
                onClick={() => applyTag(tag.name, tag.type as 'project' | 'person')}
              >
                {autocomplete.type === '@' ? (
                  <span
                    className="h-4 w-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                    style={{ backgroundColor: tag.color }}
                  >
                    {tag.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                  </span>
                ) : (
                  <Hash className="h-4 w-4 flex-shrink-0" style={{ color: tag.color }} />
                )}
                <span className="truncate">{tag.name}</span>
              </button>
            ))
          )}
        </div>
      )}

      {/* Input card */}
      <div
        className={cn(
          'rounded-xl border transition-all duration-150 bg-white',
          focused
            ? 'border-gray-400 shadow-md ring-2 ring-gray-900/8'
            : 'border-gray-300 shadow-sm hover:border-gray-400 hover:shadow',
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {/* Pending tags row */}
        {pendingTags.length > 0 && (
          <div className="flex flex-wrap gap-1 px-3 pt-2.5">
            {pendingTags.map(tag => (
              <InboxTagPill
                key={tag.id}
                tag={tag}
                size="xs"
                onRemove={() => setPendingTags(prev => prev.filter(t => t.id !== tag.id))}
              />
            ))}
          </div>
        )}

        {/* Main input row */}
        <div className="flex items-center gap-2 px-3 py-2.5">
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={e => handleInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => { setFocused(false); setTimeout(() => setAutocomplete(null), 150); }}
            placeholder={MODE_CONFIG[mode].placeholder}
            // 16px on touch avoids iOS auto-zoom on focus.
            className={cn(
              'flex-1 outline-none placeholder:text-gray-400 bg-transparent min-w-0',
              isTouch ? 'text-base' : 'text-sm',
            )}
          />
          <button
            onClick={handleSubmit}
            disabled={!text.trim() && pendingTags.length === 0}
            aria-label="Add"
            className={cn(
              'flex-shrink-0 rounded-full flex items-center justify-center transition-all',
              isTouch ? 'h-9 w-9' : 'h-7 w-7',
              text.trim() || pendingTags.length > 0
                ? 'bg-gray-900 text-white hover:bg-gray-700 shadow-sm'
                : 'bg-gray-100 text-gray-300',
            )}
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>

        {/* Mode selector row */}
        <div className="flex items-center gap-1 px-2.5 pb-2">
          {(Object.keys(MODE_CONFIG) as Mode[]).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); inputRef.current?.focus(); }}
              className={cn(
                'flex items-center gap-1 rounded-full text-xs font-medium transition-colors',
                isTouch ? 'px-3 py-1.5' : 'px-2 py-0.5',
                mode === m
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100',
              )}
              title={MODE_CONFIG[m].label}
            >
              {MODE_CONFIG[m].icon}
              <span>{MODE_CONFIG[m].label}</span>
            </button>
          ))}
          <span className="ml-auto text-[10px] text-gray-300 select-none">⌘↵</span>
        </div>
      </div>
    </div>
  );
}
