import { useState, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { CalendarDays, CalendarPlus, Radar, Bot, Users, Search, Loader2, X, Star, Trash2 } from 'lucide-react';
import { Inbox, Zap, Clock, CheckSquare, Archive, Hash, Folder, FolderPlus, ChevronRight, Plus, Settings2, Pin, FolderOutput, ListOrdered } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsTouch } from '@/hooks/use-breakpoint';
import type { InboxTag, InboxFilterState, InboxView, InboxViewSort } from '@/types/inbox';
import { planTagGroupReindex } from '@/lib/inboxValidation';

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export interface MeetingsSyncInfo {
  lastSyncAt: string | null;
  syncing: boolean;
  calendarConnected: boolean;
  onSync: () => void;
}

interface InboxSidebarProps {
  tags: InboxTag[];
  counts: Record<string, number>;
  filter: InboxFilterState;
  onFilterChange: (f: InboxFilterState) => void;
  onRenameTag: (id: string, name: string) => Promise<void>;
  onCreateWorkstream: (parentId: string, name: string) => Promise<InboxTag | null>;
  onUpdateTag?: (id: string, patch: Partial<Pick<InboxTag, 'type' | 'parent_id' | 'sort_order'>>) => Promise<void>;
  onEditProject?: (tag: InboxTag) => void;
  onTogglePin?: (tag: InboxTag) => void;
  /** When true, fills its container (for use inside a mobile Sheet) instead of the fixed-width card. */
  bare?: boolean;
  meetingsSearch?: string;
  onMeetingsSearchChange?: (v: string) => void;
  meetingsSyncInfo?: MeetingsSyncInfo;

  // ── Saved views ──────────────────────────────────────────────────────────
  views?: InboxView[];
  /** Current sort-mode half of "current view", for the save-view action —
   *  sort mode lives in page-level state, not in `filter`. */
  currentSort?: InboxViewSort;
  onSaveView?: (name: string, filter: InboxFilterState, sort: InboxViewSort) => void;
  onApplyView?: (view: InboxView) => void;
  onToggleStarView?: (id: string, starred: boolean) => void;
  onDeleteView?: (id: string) => void;
  /** Progressive disclosure gate (Section 5.4): only show the "Save this
   *  view" ghost row once the user has changed the filter/sort at least once
   *  this session — an empty inbox shouldn't also ask to save a view of
   *  nothing. */
  hasChangedViewThisSession?: boolean;
}

// ── Fixed (non-editable) item ─────────────────────────────────────────────────

function SidebarItem({
  label, icon, count, active, onClick,
}: { label: string; icon: React.ReactNode; count?: number; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2 px-2 py-1 rounded-md text-sm transition-colors text-left',
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

// ── Editable position badge — shows a project/folder's 1-based slot within its
// group; typing a new number reorders the whole group via the same reindex math
// drag-and-drop uses. A less error-prone alternative to dragging on trackpads.

function PositionBadge({
  value, max, onCommit,
}: { value: number; max: number; onCommit: (newPosition: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  const commit = () => {
    const n = parseInt(draft, 10);
    setEditing(false);
    if (Number.isFinite(n) && n !== value) onCommit(n);
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
        onFocus={e => e.target.select()}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          if (e.key === 'Escape') { setDraft(String(value)); setEditing(false); }
        }}
        onClick={e => e.stopPropagation()}
        className="w-5 h-5 flex-shrink-0 text-center text-[11px] font-medium rounded bg-white ring-1 ring-blue-300 outline-none"
      />
    );
  }

  return (
    <span
      onClick={e => { e.stopPropagation(); setDraft(String(value)); setEditing(true); }}
      title={`Position ${value} of ${max} — click to move`}
      className="w-5 h-5 flex-shrink-0 flex items-center justify-center text-[11px] font-medium text-gray-400 rounded hover:bg-gray-200 hover:text-gray-600 cursor-text"
    >
      {value}
    </span>
  );
}

// ── Tag item with rename + caret for workstreams ──────────────────────────────

function TagItem({
  tag, workstreams, counts, filter, onFilterChange, onRename, onCreateWorkstream, onUpdateTag, onEditProject, onTogglePin, icon, depth = 0,
  draggingId, draggingWsId, onDragStart, onDragEnd, position, groupSize, onSetPosition,
}: {
  tag: InboxTag;
  workstreams: InboxTag[];
  counts: Record<string, number>;
  filter: InboxFilterState;
  onFilterChange: (f: InboxFilterState) => void;
  onRename: (id: string, name: string) => Promise<void>;
  onCreateWorkstream: (parentId: string, name: string) => Promise<InboxTag | null>;
  onUpdateTag?: (id: string, patch: Partial<Pick<InboxTag, 'type' | 'parent_id' | 'sort_order'>>) => Promise<void>;
  onEditProject?: (tag: InboxTag) => void;
  onTogglePin?: (tag: InboxTag) => void;
  icon: React.ReactNode;
  depth?: number;
  draggingId?: string | null;
  draggingWsId?: string | null;
  onDragStart?: (id: string) => void;
  onDragEnd?: () => void;
  /** 1-based slot within its top-level group (projects or folders). Only set at depth 0. */
  position?: number;
  groupSize?: number;
  onSetPosition?: (newPosition: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [addingWorkstream, setAddingWorkstream] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [dropTarget, setDropTarget] = useState(false);
  const isTouch = useIsTouch();
  const showActions = hovered || isTouch;

  const isDragging = draggingId === tag.id || draggingWsId === tag.id;
  const canReceiveDrop = !isDragging && depth === 0 && onUpdateTag && (draggingId || draggingWsId);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDropTarget(false);
    if (!canReceiveDrop || !onUpdateTag) return;
    const raw = e.dataTransfer.getData('text/plain');
    const draggedId = raw.startsWith('ws:') ? raw.slice(3) : raw;
    if (!draggedId || draggedId === tag.id) return;

    // Nest the dragged project under the target as a workstream. The target keeps
    // its own type — a project stays a project (projects can hold workstreams too),
    // a folder stays a folder.
    if (tag.type === 'folder' || tag.type === 'project') {
      await onUpdateTag(draggedId, { type: 'workstream', parent_id: tag.id });
    }
  }, [canReceiveDrop, onUpdateTag, tag.id, tag.type]);

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
          className="flex items-center gap-2 px-2 py-1 rounded-md bg-white ring-1 ring-blue-300 shadow-sm"
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
          draggable={
            (depth === 0 && (tag.type === 'project' || tag.type === 'folder')) ||
            (depth === 1 && tag.type === 'workstream')
          }
          onDragStart={e => {
            const payload = depth === 1 ? `ws:${tag.id}` : tag.id;
            e.dataTransfer.setData('text/plain', payload);
            e.dataTransfer.effectAllowed = 'move';
            onDragStart?.(tag.id);
          }}
          onDragEnd={() => { onDragEnd?.(); setDropTarget(false); }}
          onDragOver={e => { if (canReceiveDrop) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDropTarget(true); } }}
          onDragLeave={() => setDropTarget(false)}
          onDrop={handleDrop}
          className={cn(
            'group w-full flex items-center gap-2 py-1 rounded-md text-sm transition-colors text-left',
            isTouch && 'min-h-[44px]',
            depth > 0 ? 'pr-2' : 'px-2',
            isActive ? 'bg-gray-100 text-gray-900 font-medium' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
            isDragging && 'opacity-40',
            dropTarget && 'ring-2 ring-blue-400 bg-blue-50 text-blue-700',
          )}
          style={{ paddingLeft: depth > 0 ? `${8 + depth * 16}px` : undefined }}
        >
          {/* Caret — fixed w-4 slot so icon column aligns with SidebarItem */}
          {depth === 0 ? (
            <span
              onClick={e => { e.stopPropagation(); setExpanded(x => !x); }}
              className={cn(
                'flex-shrink-0 w-4 flex items-center justify-center rounded transition-all text-gray-400 hover:text-gray-600',
                (hasWorkstreams || showActions) ? 'opacity-100' : 'opacity-0 pointer-events-none',
              )}
            >
              <ChevronRight className={cn('h-4 w-4 transition-transform', expanded && 'rotate-90')} />
            </span>
          ) : (
            <span className="w-4 flex-shrink-0" />
          )}

          {depth === 0 && (tag.type === 'project' || tag.type === 'folder') && position !== undefined && groupSize !== undefined && onSetPosition ? (
            <PositionBadge value={position} max={groupSize} onCommit={onSetPosition} />
          ) : null}

          <span className="text-gray-400 flex-shrink-0 w-4 flex items-center justify-center">{icon}</span>
          <span className="flex-1 truncate">{tag.name}</span>

          {/* Actions — always available on touch, hover-revealed otherwise */}
          {showActions && (
            <span className="flex items-center gap-0.5 flex-shrink-0">
              {/* Gear — project/folder settings; pencil — rename for others */}
              {depth === 0 && (tag.type === 'project' || tag.type === 'folder') && onEditProject ? (
                <>
                  {tag.type === 'project' && (
                    <span
                      onClick={e => { e.stopPropagation(); onTogglePin?.(tag); }}
                      className={cn(
                        'rounded hover:bg-gray-200 flex items-center justify-center',
                        isTouch ? 'h-8 w-8' : 'p-0.5',
                        tag.settings?.pinned ? 'text-amber-400 hover:text-amber-500' : 'text-gray-300 hover:text-gray-500',
                      )}
                      title={tag.settings?.pinned ? 'Unpin project' : 'Pin project'}
                    >
                      <Pin className="h-3.5 w-3.5" />
                    </span>
                  )}
                  <span
                    onClick={e => { e.stopPropagation(); onEditProject(tag); }}
                    className={cn(
                      'rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 flex items-center justify-center',
                      isTouch ? 'h-8 w-8' : 'p-0.5',
                    )}
                    title={tag.type === 'folder' ? 'Folder settings' : 'Project settings'}
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                  </span>
                </>

              ) : (
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
              )}
              {/* Move out — promote a workstream to a top-level folder */}
              {depth > 0 && tag.type === 'workstream' && onUpdateTag && (
                <span
                  onClick={e => { e.stopPropagation(); onUpdateTag(tag.id, { type: 'folder', parent_id: null }); }}
                  className={cn(
                    'rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 flex items-center justify-center',
                    isTouch ? 'h-8 w-8' : 'p-0.5',
                  )}
                  title="Move out of folder"
                >
                  <FolderOutput className="h-3.5 w-3.5" />
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
              onUpdateTag={onUpdateTag}
              icon={<span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: ws.color }} />}
              depth={1}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              draggingId={draggingId}
              draggingWsId={draggingWsId}
            />
          ))}

          {/* New workstream input */}
          {addingWorkstream ? (
            <div className="flex items-center gap-2 py-1 rounded-md" style={{ paddingLeft: '28px' }}>
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

function SectionHeader({ label, action }: { label: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 pt-4 pb-1">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400">
        {label}
      </p>
      {action}
    </div>
  );
}

// ── Reorder toggle — reveals position numbers on a group's rows so they can be
// retyped to reorder; numbers are otherwise hidden and disappear again once a
// move is saved (see `setGroupPosition`).
function ReorderToggle({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={active ? 'Hide position numbers' : 'Show position numbers to reorder'}
      className={cn(
        'flex-shrink-0 h-5 w-5 flex items-center justify-center rounded transition-colors',
        active ? 'bg-gray-200 text-gray-700' : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100',
      )}
    >
      <ListOrdered className="h-3 w-3" />
    </button>
  );
}

// ── Drop gap — a landing zone between/around folders while dragging a project
// or workstream. Dropping here makes the dragged tag a top-level folder at this
// position (vs. dropping ON a row, which nests it as a workstream).
// `label` renders a larger, self-explaining zone — used when the section is empty.

function DropGap({ active, onDrop, label }: { active: boolean; onDrop: () => void; label?: string }) {
  const [over, setOver] = useState(false);
  if (!active) return null; // eslint-disable-line -- useState must come before this return; keeping hook order valid because useState is unconditional

  const handlers = {
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOver(true); },
    onDragLeave: () => setOver(false),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); setOver(false); onDrop(); },
  };

  if (label) {
    return (
      <div {...handlers} className="mx-2 my-1">
        <div className={cn(
          'flex items-center justify-center gap-1.5 rounded-md border border-dashed py-2.5 text-[11px] transition-colors',
          over ? 'border-blue-400 bg-blue-50 text-blue-600' : 'border-gray-300 text-gray-400',
        )}>
          <FolderPlus className="h-3.5 w-3.5" />
          {label}
        </div>
      </div>
    );
  }

  // Slim gap with a generous (h-2) invisible hit area so it's easy to aim at.
  return (
    <div {...handlers} className="mx-2 h-2 flex items-center" aria-label="Drop to create a folder here">
      <div className={cn('h-0.5 w-full rounded transition-colors', over ? 'bg-blue-400' : 'bg-transparent')} />
    </div>
  );
}

// ── Main sidebar ──────────────────────────────────────────────────────────────

export function InboxSidebar({
  tags, counts, filter, onFilterChange, onRenameTag, onCreateWorkstream, onUpdateTag, onEditProject, onTogglePin, bare = false,
  meetingsSearch = '', onMeetingsSearchChange, meetingsSyncInfo,
  views = [], currentSort, onSaveView, onApplyView, onToggleStarView, onDeleteView, hasChangedViewThisSession,
}: InboxSidebarProps) {
  const [savingView, setSavingView] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const isMeetings = location.pathname.startsWith('/inbox/meetings');
  const meetingsSubView = location.pathname.includes('/meetings/group-coverage')
    ? 'group-coverage'
    : location.pathname.includes('/meetings/coverage')
    ? 'coverage'
    : location.pathname.includes('/meetings/activity')
    ? 'activity'
    : 'calendar';
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingWsId, setDraggingWsId] = useState<string | null>(null);
  const [showProjectPositions, setShowProjectPositions] = useState(false);
  const [showFolderPositions, setShowFolderPositions] = useState(false);
  const isActive = (f: InboxFilterState) => JSON.stringify(f) === JSON.stringify(filter);

  const handleDragStart = (id: string) => {
    // Determine if this is a workstream drag by checking tag type
    const tag = tags.find(t => t.id === id);
    if (tag?.type === 'workstream') setDraggingWsId(id);
    else setDraggingId(id);
  };
  const handleDragEnd = () => { setDraggingId(null); setDraggingWsId(null); };

  const workstreamsByParent = tags
    .filter(t => t.type === 'workstream' && t.parent_id)
    .reduce<Record<string, InboxTag[]>>((acc, t) => {
      const p = t.parent_id!;
      if (!acc[p]) acc[p] = [];
      acc[p].push(t);
      return acc;
    }, {});

  const bySortOrder = (a: InboxTag, b: InboxTag) => a.sort_order - b.sort_order;
  const projectTags = tags.filter(t => t.type === 'project').sort(bySortOrder);
  const personTags  = tags.filter(t => t.type === 'person').sort(bySortOrder);
  const folderTags  = tags.filter(t => t.type === 'folder').sort(bySortOrder);

  // A folder, project, or workstream is being dragged — show the section landing zones.
  const dragging = !!(draggingId || draggingWsId);

  // Move a project/folder to a new 1-based position within its own group, via the
  // typed position badge (an alternative to drag-and-drop for the same reorder).
  const setGroupPosition = async (
    group: InboxTag[],
    groupType: 'folder' | 'project',
    tagId: string,
    newPosition: number,
  ) => {
    if (!onUpdateTag) return;
    const index = Math.max(0, Math.min(Math.trunc(newPosition) - 1, group.length - 1));
    const updates = planTagGroupReindex(group, tagId, index, groupType);
    await Promise.all(updates.map(u => onUpdateTag(u.id, u.patch)));
    // Position numbers are shown temporarily to reorder — hide them again once saved.
    if (groupType === 'project') setShowProjectPositions(false);
    else setShowFolderPositions(false);
  };

  // Drop into a folder-section gap: convert the dragged folder/project/workstream
  // into a top-level folder and slot it at `index`, renumbering the folder group
  // so the order is stable (and reflected optimistically). Reindex math is a
  // pure, unit-tested helper.
  const dropIntoFolders = async (index: number) => {
    const draggedId = draggingId ?? draggingWsId;
    setDraggingId(null);
    setDraggingWsId(null);
    if (!draggedId || !onUpdateTag) return;

    const updates = planTagGroupReindex(folderTags, draggedId, index, 'folder');
    await Promise.all(updates.map(u => onUpdateTag(u.id, u.patch)));
  };

  // Drop into the Projects-section gap: convert the dragged folder/workstream
  // into a top-level project at `index`, renumbering the project group.
  const dropIntoProjects = async (index: number) => {
    const draggedId = draggingId ?? draggingWsId;
    setDraggingId(null);
    setDraggingWsId(null);
    if (!draggedId || !onUpdateTag) return;

    const updates = planTagGroupReindex(projectTags, draggedId, index, 'project');
    await Promise.all(updates.map(u => onUpdateTag(u.id, u.patch)));
  };

  return (
    <div className={cn(
      'h-full bg-white flex flex-col overflow-hidden',
      bare ? 'w-full' : 'w-[240px] flex-shrink-0 rounded-xl shadow-sm border border-gray-200/80',
    )}>
      {/* Tab switcher */}
      <div className="flex border-b border-gray-200 flex-shrink-0">
        <button
          onClick={() => navigate('/inbox')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-3.5 text-sm font-medium transition-colors relative',
            !isMeetings
              ? 'text-gray-900 after:absolute after:bottom-0 after:left-4 after:right-4 after:h-0.5 after:bg-gray-900 after:rounded-full'
              : 'text-gray-400 hover:text-gray-700',
          )}
        >
          <Inbox className="h-3.5 w-3.5" />Inbox
        </button>
        <button
          onClick={() => navigate('/inbox/meetings')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-3.5 text-sm font-medium transition-colors relative',
            isMeetings
              ? 'text-gray-900 after:absolute after:bottom-0 after:left-4 after:right-4 after:h-0.5 after:bg-gray-900 after:rounded-full'
              : 'text-gray-400 hover:text-gray-700',
          )}
        >
          <CalendarDays className="h-3.5 w-3.5" />Meetings
        </button>
      </div>

      <div className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto">
        {isMeetings ? (
          <>
            {/* Search */}
            <div className="pb-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                <input
                  value={meetingsSearch}
                  onChange={e => onMeetingsSearchChange?.(e.target.value)}
                  placeholder="Quick search…"
                  className="w-full h-8 pl-8 pr-7 text-sm rounded-md border border-gray-200 bg-gray-50 focus:outline-none focus:ring-1 focus:ring-gray-300 placeholder:text-gray-400"
                />
                {meetingsSearch && (
                  <button
                    onClick={() => onMeetingsSearchChange?.('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            <SectionHeader label="Views" />
            {[
              { sub: 'calendar',       label: 'Calendar',       icon: <CalendarPlus className="h-4 w-4" />, path: '/inbox/meetings' },
              { sub: 'coverage',       label: '1:1 coverage',   icon: <Radar className="h-4 w-4" />,        path: '/inbox/meetings/coverage' },
              { sub: 'group-coverage', label: 'Group coverage', icon: <Users className="h-4 w-4" />,        path: '/inbox/meetings/group-coverage' },
              { sub: 'activity',       label: 'Agent',          icon: <Bot className="h-4 w-4" />,          path: '/inbox/meetings/activity' },
            ].map(({ sub, label, icon, path }) => {
              const active = meetingsSubView === sub;
              if (sub === 'calendar' && meetingsSyncInfo) {
                return (
                  <div key={sub}>
                    <div
                      className={cn(
                        'w-full flex items-center gap-2 pl-2 pr-1 py-1 rounded-md text-sm transition-colors',
                        active ? 'bg-gray-100 text-gray-900 font-medium' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                      )}
                    >
                      <button onClick={() => navigate(path)} className="flex-1 min-w-0 flex items-center gap-2 text-left">
                        <span className="w-4 flex-shrink-0" />
                        <span className="text-gray-400 flex-shrink-0 w-4 flex items-center justify-center">{icon}</span>
                        <span className="flex-1 truncate">{label}</span>
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); meetingsSyncInfo.onSync(); }}
                        disabled={meetingsSyncInfo.syncing}
                        className="flex-shrink-0 flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-700 hover:underline disabled:opacity-50 transition-colors"
                      >
                        {meetingsSyncInfo.syncing && <Loader2 className="h-3 w-3 animate-spin" />}
                        {meetingsSyncInfo.syncing
                          ? 'Syncing…'
                          : meetingsSyncInfo.calendarConnected ? 'Sync' : 'Connect'}
                      </button>
                    </div>
                    {meetingsSyncInfo.lastSyncAt && (
                      <p className="pl-8 pr-1 text-[10px] text-gray-400 truncate">
                        Synced {formatRelativeTime(meetingsSyncInfo.lastSyncAt)}
                      </p>
                    )}
                  </div>
                );
              }
              return (
                <SidebarItem
                  key={sub}
                  label={label}
                  icon={icon}
                  active={active}
                  onClick={() => navigate(path)}
                />
              );
            })}
          </>
        ) : (
          <>
            <SectionHeader
              label="Views"
              action={onSaveView ? (
                <button
                  onClick={() => setSavingView(true)}
                  title="Save this filter and sort as a view you can jump back to anytime."
                  className="flex-shrink-0 h-5 w-5 flex items-center justify-center rounded text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              ) : undefined}
            />
            <SidebarItem label="All"           icon={<Inbox className="h-4 w-4" />} count={counts['all']}     active={isActive({ builtIn: 'all' })}     onClick={() => onFilterChange({ builtIn: 'all' })} />
            <SidebarItem label="Do Now"        icon={<Zap className="h-4 w-4" />}   count={counts['asap']}    active={isActive({ builtIn: 'asap' })}    onClick={() => onFilterChange({ builtIn: 'asap' })} />
            <SidebarItem label="Waiting on me" icon={<Clock className="h-4 w-4" />} count={counts['waiting']} active={isActive({ builtIn: 'waiting' })} onClick={() => onFilterChange({ builtIn: 'waiting' })} />

            {savingView && onSaveView && currentSort && (
              <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-white ring-1 ring-blue-300 shadow-sm mt-0.5">
                <Star className="h-3.5 w-3.5 text-gray-300 flex-shrink-0" />
                <InlineInput
                  placeholder="View name…"
                  onCommit={name => { onSaveView(name, filter, currentSort); setSavingView(false); }}
                  onCancel={() => setSavingView(false)}
                />
              </div>
            )}

            {views.length === 0 && hasChangedViewThisSession && onSaveView && !savingView && (
              // One-time ghost row (Section 5.1/5.4) — disappears for good once
              // the user has ever saved a view, and is gated behind having
              // actually changed the filter/sort this session so a brand new,
              // empty inbox doesn't also ask to save a view of nothing.
              <button
                onClick={() => setSavingView(true)}
                className="w-full flex items-center gap-2 px-2 py-1 rounded-md text-xs text-gray-400 hover:text-gray-600 border border-dashed border-gray-300 hover:border-gray-400 transition-colors mt-0.5"
              >
                <Star className="h-3.5 w-3.5 flex-shrink-0" />
                Save this view — filters + sort, one click away
              </button>
            )}

            {views.map(view => {
              const active = onApplyView ? JSON.stringify(view.filter_json) === JSON.stringify(filter) : false;
              return (
                <div
                  key={view.id}
                  className={cn(
                    'group w-full flex items-center gap-2 px-2 py-1 rounded-md text-sm transition-colors',
                    active ? 'bg-gray-100 text-gray-900 font-medium' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                  )}
                >
                  <button
                    onClick={() => onApplyView?.(view)}
                    className="flex-1 min-w-0 flex items-center gap-2 text-left"
                  >
                    <span className="w-4 flex-shrink-0" />
                    <span className="text-gray-400 flex-shrink-0 w-4 flex items-center justify-center">
                      <ListOrdered className="h-3.5 w-3.5" />
                    </span>
                    <span className="flex-1 truncate">{view.name}</span>
                  </button>
                  <span className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100">
                    {onToggleStarView && (
                      <button
                        onClick={() => onToggleStarView(view.id, !view.is_starred)}
                        title={view.is_starred ? 'This is your default view' : 'Make this your default view when you open your inbox'}
                        className={cn(
                          'p-0.5 rounded hover:bg-gray-200',
                          view.is_starred ? 'text-amber-400 hover:text-amber-500' : 'text-gray-300 hover:text-gray-500',
                        )}
                      >
                        <Star className="h-3.5 w-3.5" fill={view.is_starred ? 'currentColor' : 'none'} />
                      </button>
                    )}
                    {onDeleteView && (
                      <button
                        onClick={() => onDeleteView(view.id)}
                        title="Delete view"
                        className="p-0.5 rounded hover:bg-gray-200 text-gray-300 hover:text-gray-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </span>
                </div>
              );
            })}

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

        {(projectTags.length > 0 || dragging) && (
          <>
            <SectionHeader
              label="Projects"
              action={projectTags.length > 1 ? (
                <ReorderToggle active={showProjectPositions} onClick={() => setShowProjectPositions(v => !v)} />
              ) : undefined}
            />
            {projectTags.length === 0 ? (
              // No projects yet: a single, obvious landing zone that creates the first one.
              <DropGap active={dragging} onDrop={() => dropIntoProjects(0)} label="Drop here to make a project" />
            ) : (
              <>
                <DropGap active={dragging} onDrop={() => dropIntoProjects(0)} />
                {projectTags.map((tag, i) => (
                  <div key={tag.id}>
                    <TagItem
                      tag={tag}
                      workstreams={workstreamsByParent[tag.id] ?? []}
                      counts={counts}
                      filter={filter}
                      onFilterChange={onFilterChange}
                      onRename={onRenameTag}
                      onCreateWorkstream={onCreateWorkstream}
                      onUpdateTag={onUpdateTag}
                      onEditProject={onEditProject}
                      onTogglePin={onTogglePin}
                      draggingId={draggingId}
                      draggingWsId={draggingWsId}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      icon={<Hash className="h-4 w-4" style={{ color: tag.color }} />}
                      position={showProjectPositions ? i + 1 : undefined}
                      groupSize={showProjectPositions ? projectTags.length : undefined}
                      onSetPosition={showProjectPositions ? newPosition => setGroupPosition(projectTags, 'project', tag.id, newPosition) : undefined}
                    />
                    <DropGap active={dragging} onDrop={() => dropIntoProjects(i + 1)} />
                  </div>
                ))}
              </>
            )}
          </>
        )}

        {(folderTags.length > 0 || dragging) && (
          <>
            <SectionHeader
              label="Folders"
              action={folderTags.length > 1 ? (
                <ReorderToggle active={showFolderPositions} onClick={() => setShowFolderPositions(v => !v)} />
              ) : undefined}
            />
            {folderTags.length === 0 ? (
              // No folders yet: a single, obvious landing zone that creates the first one.
              <DropGap active={dragging} onDrop={() => dropIntoFolders(0)} label="Drop here to make a folder" />
            ) : (
              <>
                <DropGap active={dragging} onDrop={() => dropIntoFolders(0)} />
                {folderTags.map((tag, i) => (
                  <div key={tag.id}>
                    <TagItem
                      tag={tag}
                      workstreams={workstreamsByParent[tag.id] ?? []}
                      counts={counts}
                      filter={filter}
                      onFilterChange={onFilterChange}
                      onRename={onRenameTag}
                      onCreateWorkstream={onCreateWorkstream}
                      onUpdateTag={onUpdateTag}
                      onEditProject={onEditProject}
                      draggingId={draggingId}
                      draggingWsId={draggingWsId}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      icon={<Folder className="h-4 w-4" style={{ color: tag.color }} />}
                      position={showFolderPositions ? i + 1 : undefined}
                      groupSize={showFolderPositions ? folderTags.length : undefined}
                      onSetPosition={showFolderPositions ? newPosition => setGroupPosition(folderTags, 'folder', tag.id, newPosition) : undefined}
                    />
                    <DropGap active={dragging} onDrop={() => dropIntoFolders(i + 1)} />
                  </div>
                ))}
              </>
            )}
          </>
        )}

        <SectionHeader label="More" />
        <SidebarItem
          label="Snoozed"
          icon={<Clock className="h-4 w-4" />}
          count={counts['snoozed']}
          active={isActive({ builtIn: 'snoozed' })}
          onClick={() => onFilterChange({ builtIn: 'snoozed' })}
        />
        <SidebarItem
          label="Done"
          icon={<CheckSquare className="h-4 w-4" />}
          count={counts['done']}
          active={isActive({ builtIn: 'done' })}
          onClick={() => onFilterChange({ builtIn: 'done' })}
        />
        <SidebarItem
          label="Archive"
          icon={<Archive className="h-4 w-4" />}
          count={counts['archive']}
          active={isActive({ builtIn: 'archive' })}
          onClick={() => onFilterChange({ builtIn: 'archive' })}
        />
          </>
        )}
      </div>
    </div>
  );
}
