import { useState, useRef, useCallback } from 'react';
import { Inbox, Zap, Clock, Archive, Hash, Folder, ChevronRight, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsTouch } from '@/hooks/use-breakpoint';
import type { InboxTag, InboxFilterState } from '@/types/inbox';

interface InboxSidebarProps {
  tags: InboxTag[];
  counts: Record<string, number>;
  filter: InboxFilterState;
  onFilterChange: (f: InboxFilterState) => void;
  onRenameTag: (id: string, name: string) => Promise<void>;
  onCreateWorkstream: (parentId: string, name: string) => Promise<InboxTag | null>;
  /** When true, fills its container (for use inside a mobile Sheet) instead of the fixed-width card. */
  bare?: boolean;
}

// ── Fixed (non-editable) item ─────────────────────────────────────────────────

function SidebarItem({
  label, icon, count, active, onClick,
}: { label: string; icon: React.ReactNode; count?: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors text-left',
        active ? 'bg-gray-100 text-gray-900 font-medium' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
      )}
    >
      {/* caret-width spacer so icons align with TagItem */}
      <span className="w-4 flex-shrink-0" />
      <span className="text-gray-400 flex-shrink-0 w-4 flex items-center justify-center">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined && count > 0 && (
        <span className={cn(
          'text-[11px] font-medium px-1.5 py-0.5 rounded-full',
          active ? 'bg-gray-200 text-gray-700' : 'bg-gray-100 text-gray-500',
        )}>{count}</span>
      )}
    </button>
  );
}

// ── Inline name editor (shared) ───────────────────────────────────────────────

function InlineInput({
  initialValue = '',
  placeholder,
  onCommit,
  onCancel,
  autoFocus = true,
  className,
}: {
  initialValue?: string;
  placeholder?: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
  autoFocus?: boolean;
  className?: string;
}) {
  const [value, setValue] = useState(initialValue);
  const ref = useRef<HTMLInputElement>(null);

  return (
    <input
      ref={ref}
      autoFocus={autoFocus}
      value={value}
      onChange={e => setValue(e.target.value)}
      placeholder={placeholder}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); if (value.trim()) onCommit(value.trim()); else onCancel(); }
        if (e.key === 'Escape') onCancel();
      }}
      onBlur={() => { if (value.trim()) onCommit(value.trim()); else onCancel(); }}
      className={cn('flex-1 text-sm outline-none bg-transparent text-gray-900 min-w-0', className)}
    />
  );
}

// ── Tag item with rename + caret for workstreams ──────────────────────────────

function TagItem({
  tag, workstreams, counts, filter, onFilterChange, onRename, onCreateWorkstream, icon, depth = 0,
}: {
  tag: InboxTag;
  workstreams: InboxTag[];
  counts: Record<string, number>;
  filter: InboxFilterState;
  onFilterChange: (f: InboxFilterState) => void;
  onRename: (id: string, name: string) => Promise<void>;
  onCreateWorkstream: (parentId: string, name: string) => Promise<InboxTag | null>;
  icon: React.ReactNode;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [addingWorkstream, setAddingWorkstream] = useState(false);
  const [hovered, setHovered] = useState(false);
  const isTouch = useIsTouch();
  const showActions = hovered || isTouch;

  const hasWorkstreams = workstreams.length > 0;
  const isActive = JSON.stringify(filter) === JSON.stringify({ tagIds: [tag.id] });

  const startEdit = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing(true);
  }, []);

  const startAddWorkstream = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(true);
    setAddingWorkstream(true);
  }, []);

  return (
    <div>
      {/* Main row */}
      {editing ? (
        <div
          className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-white ring-1 ring-blue-300 shadow-sm"
          style={{ paddingLeft: depth > 0 ? `${8 + depth * 16}px` : undefined }}
        >
          {icon}
          <InlineInput
            initialValue={tag.name}
            onCommit={name => { onRename(tag.id, name); setEditing(false); }}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : (
        <button
          onClick={() => onFilterChange({ tagIds: [tag.id] })}
          onDoubleClick={startEdit}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className={cn(
            'group w-full flex items-center gap-2 py-1.5 rounded-md text-sm transition-colors text-left',
            isTouch && 'min-h-[44px]',
            depth > 0 ? 'pr-2' : 'px-2',
            isActive ? 'bg-gray-100 text-gray-900 font-medium' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
          )}
          style={{ paddingLeft: depth > 0 ? `${8 + depth * 16}px` : undefined }}
        >
          {/* Caret — fixed w-4 slot so icon column aligns with SidebarItem */}
          {depth === 0 ? (
            <span
              onClick={e => { e.stopPropagation(); setExpanded(x => !x); }}
              className={cn(
                'flex-shrink-0 w-4 flex items-center justify-center rounded transition-all text-gray-300 hover:text-gray-500',
                (hasWorkstreams || showActions) ? 'opacity-100' : 'opacity-0 pointer-events-none',
              )}
            >
              <ChevronRight className={cn('h-3 w-3 transition-transform', expanded && 'rotate-90')} />
            </span>
          ) : (
            <span className="w-4 flex-shrink-0" />
          )}

          <span className="text-gray-400 flex-shrink-0 w-4 flex items-center justify-center">{icon}</span>
          <span className="flex-1 truncate">{tag.name}</span>

          {/* Rename / add-workstream actions — always available on touch, hover-revealed otherwise */}
          {showActions && (
            <span className="flex items-center gap-0.5 flex-shrink-0">
              {/* Pencil — rename */}
              <span
                onClick={startEdit}
                className={cn(
                  'rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 flex items-center justify-center',
                  isTouch ? 'h-8 w-8' : 'p-0.5',
                )}
                title="Rename"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M11.5 2.5l2 2-8 8H3.5v-2l8-8z" />
                </svg>
              </span>
              {/* Plus — add workstream (only on top-level) */}
              {depth === 0 && (
                <span
                  onClick={startAddWorkstream}
                  className={cn(
                    'rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 flex items-center justify-center',
                    isTouch ? 'h-8 w-8' : 'p-0.5',
                  )}
                  title="Add workstream"
                >
                  <Plus className="h-3.5 w-3.5" />
                </span>
              )}
            </span>
          )}

          {counts[tag.id] !== undefined && counts[tag.id] > 0 && (
            <span className={cn(
              'text-[11px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0',
              isActive ? 'bg-gray-200 text-gray-700' : 'bg-gray-100 text-gray-500',
            )}>{counts[tag.id]}</span>
          )}
        </button>
      )}

      {/* Workstreams (expanded) */}
      {expanded && (
        <div className="ml-1">
          {workstreams.map(ws => (
            <TagItem
              key={ws.id}
              tag={ws}
              workstreams={[]}
              counts={counts}
              filter={filter}
              onFilterChange={onFilterChange}
              onRename={onRename}
              onCreateWorkstream={onCreateWorkstream}
              icon={<span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: ws.color }} />}
              depth={1}
            />
          ))}

          {/* New workstream input */}
          {addingWorkstream ? (
            <div className="flex items-center gap-2 py-1.5 rounded-md" style={{ paddingLeft: '28px' }}>
              <span className="h-1.5 w-1.5 rounded-full bg-gray-300 flex-shrink-0" />
              <InlineInput
                placeholder="Workstream name…"
                onCommit={async name => {
                  await onCreateWorkstream(tag.id, name);
                  setAddingWorkstream(false);
                }}
                onCancel={() => setAddingWorkstream(false)}
              />
            </div>
          ) : (
            <button
              onClick={startAddWorkstream}
              className="w-full flex items-center gap-2 py-1 text-xs text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-50 transition-colors"
              style={{ paddingLeft: '28px' }}
            >
              <Plus className="h-3 w-3" />
              Add workstream
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <p className="px-3 pt-4 pb-1 text-[10px] uppercase tracking-wider font-semibold text-gray-400">
      {label}
    </p>
  );
}

// ── Main sidebar ──────────────────────────────────────────────────────────────

export function InboxSidebar({
  tags, counts, filter, onFilterChange, onRenameTag, onCreateWorkstream, bare = false,
}: InboxSidebarProps) {
  const isActive = (f: InboxFilterState) => JSON.stringify(f) === JSON.stringify(filter);

  const workstreamsByParent = tags
    .filter(t => t.type === 'workstream' && t.parent_id)
    .reduce<Record<string, InboxTag[]>>((acc, t) => {
      const p = t.parent_id!;
      if (!acc[p]) acc[p] = [];
      acc[p].push(t);
      return acc;
    }, {});

  const projectTags = tags.filter(t => t.type === 'project');
  const personTags  = tags.filter(t => t.type === 'person');
  const folderTags  = tags.filter(t => t.type === 'folder');

  return (
    <div className={cn(
      'h-full bg-white flex flex-col overflow-hidden',
      bare ? 'w-full' : 'w-[240px] flex-shrink-0 rounded-xl shadow-sm border border-gray-200/80',
    )}>
      <div className="px-4 py-4 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Inbox className="h-5 w-5 text-gray-700" />
          <span className="font-semibold text-gray-900 text-sm">Inbox</span>
        </div>
      </div>

      <div className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto">
        <SectionHeader label="Views" />
        <SidebarItem label="All"           icon={<Inbox className="h-4 w-4" />} count={counts['all']}     active={isActive({ builtIn: 'all' })}     onClick={() => onFilterChange({ builtIn: 'all' })} />
        <SidebarItem label="ASAP"          icon={<Zap className="h-4 w-4" />}   count={counts['asap']}    active={isActive({ builtIn: 'asap' })}    onClick={() => onFilterChange({ builtIn: 'asap' })} />
        <SidebarItem label="Waiting on me" icon={<Clock className="h-4 w-4" />} count={counts['waiting']} active={isActive({ builtIn: 'waiting' })} onClick={() => onFilterChange({ builtIn: 'waiting' })} />

        {personTags.length > 0 && (
          <>
            <SectionHeader label="People" />
            {personTags.map(tag => (
              <TagItem
                key={tag.id}
                tag={tag}
                workstreams={workstreamsByParent[tag.id] ?? []}
                counts={counts}
                filter={filter}
                onFilterChange={onFilterChange}
                onRename={onRenameTag}
                onCreateWorkstream={onCreateWorkstream}
                icon={
                  <span
                    className="h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                    style={{ backgroundColor: tag.color }}
                  >
                    {tag.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                  </span>
                }
              />
            ))}
          </>
        )}

        {projectTags.length > 0 && (
          <>
            <SectionHeader label="Projects" />
            {projectTags.map(tag => (
              <TagItem
                key={tag.id}
                tag={tag}
                workstreams={workstreamsByParent[tag.id] ?? []}
                counts={counts}
                filter={filter}
                onFilterChange={onFilterChange}
                onRename={onRenameTag}
                onCreateWorkstream={onCreateWorkstream}
                icon={<Hash className="h-4 w-4" style={{ color: tag.color }} />}
              />
            ))}
          </>
        )}

        {folderTags.length > 0 && (
          <>
            <SectionHeader label="Folders" />
            {folderTags.map(tag => (
              <TagItem
                key={tag.id}
                tag={tag}
                workstreams={workstreamsByParent[tag.id] ?? []}
                counts={counts}
                filter={filter}
                onFilterChange={onFilterChange}
                onRename={onRenameTag}
                onCreateWorkstream={onCreateWorkstream}
                icon={<Folder className="h-4 w-4" style={{ color: tag.color }} />}
              />
            ))}
          </>
        )}
      </div>

      <div className="px-2 py-1 border-t border-gray-200 flex-shrink-0">
        <SidebarItem
          label="Archive"
          icon={<Archive className="h-4 w-4" />}
          count={counts['archive']}
          active={isActive({ builtIn: 'archive' })}
          onClick={() => onFilterChange({ builtIn: 'archive' })}
        />
      </div>

    </div>
  );
}
