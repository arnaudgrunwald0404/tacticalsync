import { useState, useRef, useCallback } from 'react';
import { CheckSquare, FileText, Sparkles, ArrowUp, Hash, AtSign, Globe, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InboxTagPill } from './InboxTagPill';
import { useIsTouch } from '@/hooks/use-breakpoint';
import { useTagMentionInput } from '@/hooks/useTagMentionInput';
import type { InboxTag, InboxItemType } from '@/types/inbox';

type Mode = 'task' | 'note' | 'agent';

interface AgentBarProps {
  tags: InboxTag[];
  onSubmit: (text: string, type: InboxItemType, tagIds: string[], webSearch?: boolean) => Promise<void>;
  onCreateTag: (name: string, type: 'project' | 'person', color: string) => Promise<InboxTag | null>;
}

const MODE_CONFIG: Record<Mode, { label: string; icon: React.ReactNode; placeholder: string; type: InboxItemType }> = {
  task:  { label: 'Task',      icon: <CheckSquare className="h-3.5 w-3.5" />, placeholder: 'Add a task… # to tag',  type: 'task' },
  note:  { label: 'Note',      icon: <FileText className="h-3.5 w-3.5" />,    placeholder: 'Capture a note…',       type: 'note' },
  agent: { label: 'Assistant', icon: <Sparkles className="h-3.5 w-3.5" />,   placeholder: 'Ask your assistant…',   type: 'agent_nudge' },
};

export function AgentBar({ tags, onSubmit, onCreateTag }: AgentBarProps) {
  const isTouch = useIsTouch();
  const [mode, setMode] = useState<Mode>('task');
  const [focused, setFocused] = useState(false);
  const [pendingTags, setPendingTags] = useState<InboxTag[]>([]);
  // Not persisted across sends on purpose — web search is billed per-use, so
  // it must be re-selected for every message rather than staying sticky.
  const [webSearch, setWebSearch] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const justAddedTimer = useRef<ReturnType<typeof setTimeout>>();

  const mention = useTagMentionInput({
    tags,
    // Asking the assistant a question shouldn't silently create a tag — only
    // Task/Note mode (composing a real item) offers "Create ...".
    allowCreate: mode !== 'agent',
    onCreateTag,
    onSelect: tag => setPendingTags(prev => prev.find(t => t.id === tag.id) ? prev : [...prev, tag]),
  });
  const { text, setText, autocomplete, acActiveIdx, filteredOptions } = mention;

  const handleSubmit = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed && pendingTags.length === 0) return;
    const submittedMode = mode;
    await onSubmit(trimmed || '(no text)', MODE_CONFIG[mode].type, pendingTags.map(t => t.id), webSearch);
    mention.clearText();
    setPendingTags([]);
    setWebSearch(false);
    // Assistant mode routes into a chat reply, which is its own confirmation —
    // only Task/Note (which otherwise vanish silently into the list) get the pill.
    if (submittedMode !== 'agent') {
      setJustAdded(true);
      clearTimeout(justAddedTimer.current);
      justAddedTimer.current = setTimeout(() => setJustAdded(false), 1600);
    }
  }, [text, pendingTags, mode, webSearch, onSubmit, mention]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (mention.handleAutocompleteKeyDown(e)) return;
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSubmit(); }
    if (e.key === 'Escape') { mention.closeAutocomplete(); inputRef.current?.blur(); }
  }, [mention, handleSubmit]);

  return (
    <div className="flex-shrink-0 relative px-3 pb-3 pt-2">
      {/* Autocomplete — pops upward */}
      {autocomplete && (
        <div className="absolute bottom-full left-3 right-3 z-20 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto mb-1">
          {filteredOptions.length === 0 ? (
            mode === 'agent' ? (
              <p className="px-3 py-2 text-xs text-gray-400">No match — only existing projects/people can be mentioned here.</p>
            ) : (
              <button
                className="w-full text-left px-3 py-2 text-sm text-gray-500 hover:bg-gray-50 flex items-center gap-2"
                onClick={() => mention.createTagFromQuery()}
              >
                {autocomplete.type === '@' ? <AtSign className="h-3.5 w-3.5" /> : <Hash className="h-3.5 w-3.5" />}
                Create "{autocomplete.query || '...'}"
              </button>
            )
          ) : (
            filteredOptions.map((tag, idx) => (
              <button
                key={tag.id}
                className={cn(
                  'w-full text-left px-3 py-2 text-sm flex items-center gap-2',
                  idx === acActiveIdx ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-50',
                )}
                onMouseEnter={() => mention.setAcActiveIdx(idx)}
                onClick={() => mention.selectTag(tag)}
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

      {/* Success pill — pops upward in the same slot as autocomplete, briefly */}
      {justAdded && !autocomplete && (
        <div className="absolute bottom-full left-3 mb-1 z-20">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium rounded-lg px-3 py-1.5 bg-emerald-50 text-emerald-600 shadow-sm border border-emerald-100">
            <Check className="h-3.5 w-3.5" />Added to your inbox
          </span>
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
            onChange={e => { setText(e.target.value); setJustAdded(false); }}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => { setFocused(false); setTimeout(() => mention.closeAutocomplete(), 150); }}
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
          {mode === 'agent' && (
            <button
              onClick={() => { setWebSearch(v => !v); inputRef.current?.focus(); }}
              title="Search the web for this message only"
              className={cn(
                'flex items-center gap-1 rounded-full text-xs font-medium transition-colors',
                isTouch ? 'px-3 py-1.5' : 'px-2 py-0.5',
                webSearch
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100',
              )}
            >
              <Globe className="h-3.5 w-3.5" />
              <span>Web</span>
            </button>
          )}
          <span className="ml-auto text-[10px] text-gray-300 select-none">⌘↵</span>
        </div>
      </div>
    </div>
  );
}
