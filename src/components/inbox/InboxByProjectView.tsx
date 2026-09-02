import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Hash, Pin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InboxItemRow } from './InboxItemRow';
import { isAutoPinnedItem, briefItemRank, priorityRank } from '@/lib/inboxValidation';
import type { InboxItem, InboxTag, TagSuggestion } from '@/types/inbox';
import type { TeamMember } from '@/hooks/useTeamMembers';

interface InboxByProjectViewProps {
  items: InboxItem[];
  allTags: InboxTag[];
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onRemoveTag: (itemId: string, tagId: string) => void;
  onAddTag: (itemId: string, tagId: string) => void;
  onCycleWorkflowStatus: (id: string, current: string | null) => void;
  onSetWorkflowStatus: (id: string, status: string | null) => void;
  onCreateWorkstream: (parentId: string, name: string) => Promise<InboxTag | null>;
  onQuickCreateTag?: (name: string) => Promise<InboxTag | null>;
  teamMembers?: TeamMember[];
  onCreatePersonTag?: (member: TeamMember) => Promise<InboxTag | null>;
  onUpdateItem: (id: string, patch: Partial<InboxItem>) => Promise<void>;
  onOpenDrawer?: (item: InboxItem) => void;
  onAcceptSuggestion?: (item: InboxItem, s: TagSuggestion) => void;
  onDismissSuggestion?: (itemId: string, tagId: string) => void;
  onCtaClick?: (item: InboxItem) => void;
  selectedIds?: Set<string>;
  onSelect?: (id: string, selected: boolean) => void;
  prioritizeMode?: boolean;
  newItemId?: string | null;
  onSnooze?: (id: string, until: Date) => void;
  onSnoozeUntilNext1on1?: (id: string, teamMemberId: string) => Promise<{ ok: true } | { ok: false }>;
  onUnsnooze?: (id: string) => void;
  focusedItemId?: string | null;
}

export function InboxByProjectView({
  items, allTags, onArchive, onDelete, onRemoveTag, onAddTag,
  onCycleWorkflowStatus, onSetWorkflowStatus, onCreateWorkstream, onQuickCreateTag, teamMembers, onCreatePersonTag,
  onUpdateItem, onOpenDrawer, onAcceptSuggestion, onDismissSuggestion, onCtaClick, selectedIds, onSelect,
  prioritizeMode, newItemId,
  onSnooze, onSnoozeUntilNext1on1, onUnsnooze, focusedItemId,
}: InboxByProjectViewProps) {
  const { briefItems, pinnedItems, projectGroups } = useMemo(() => {
    const projectTags = allTags.filter(t => t.type === 'project');

    // The daily brief and weekly priorities (never belong to a project) always
    // sit at the very top, in that order, above the Pinned section. Manually
    // pinned items get pulled out into their own Pinned section below them,
    // above every project group, regardless of which project(s) a manually
    // pinned item is tagged with.
    const briefItems: InboxItem[] = [];
    const pinnedItems: InboxItem[] = [];

    // Map each item to the project tags it carries
    const byProject = new Map<string, InboxItem[]>();
    const noProject: InboxItem[] = [];

    for (const item of items) {
      if (isAutoPinnedItem(item)) {
        briefItems.push(item);
        continue;
      }
      if (item.pinned) {
        pinnedItems.push(item);
        continue;
      }
      const itemProjects = item.tags?.filter(t => t.type === 'project') ?? [];
      if (itemProjects.length === 0) {
        noProject.push(item);
      } else {
        for (const proj of itemProjects) {
          if (!byProject.has(proj.id)) byProject.set(proj.id, []);
          byProject.get(proj.id)!.push(item);
        }
      }
    }

    // Build sorted list: pinned first, then most items first
    const groups = projectTags
      .filter(t => byProject.has(t.id))
      .map(tag => ({ tag, items: byProject.get(tag.id)! }))
      .sort((a, b) => {
        const aPinned = a.tag.settings?.pinned ? 1 : 0;
        const bPinned = b.tag.settings?.pinned ? 1 : 0;
        if (bPinned !== aPinned) return bPinned - aPinned;
        return b.items.length - a.items.length;
      });

    if (noProject.length > 0) {
      groups.push({ tag: null as unknown as InboxTag, items: noProject });
    }

    // Prioritize mode only: re-rank each section most-urgent-first — Do Now,
    // then the informal due-date tiers (now/1d/3d/1w/2w/1m), least urgent (or
    // no due date) last. Gated on prioritizeMode so toggling it actually
    // changes ordering here, the same as it does in the Now/Next/Later view —
    // previously this sorted unconditionally, so the Prioritize toggle had no
    // visible effect in By Project mode (items were already urgency-sorted
    // whether or not the toggle was on).
    if (prioritizeMode) {
      const now = new Date();
      const byUrgency = (a: InboxItem, b: InboxItem) => priorityRank(a, now) - priorityRank(b, now);
      pinnedItems.sort(byUrgency);
      for (const group of groups) group.items.sort(byUrgency);
    }

    // Daily brief first, weekly priorities second — fixed, even in
    // prioritize mode.
    briefItems.sort((a, b) => briefItemRank(a) - briefItemRank(b));

    return { briefItems, pinnedItems, projectGroups: groups };
  }, [items, allTags, prioritizeMode]);

  // Section headers (Pinned + each project group) collapse their items when
  // clicked. Keyed by tag id, with sentinels for the Pinned and No-project
  // sections; session-local, resets on remount.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleCollapsed = (key: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const sharedRowProps = {
    allTags, onArchive, onDelete, onRemoveTag, onAddTag,
    onCycleWorkflowStatus, onSetWorkflowStatus, onCreateWorkstream, onQuickCreateTag, teamMembers, onCreatePersonTag,
    onUpdateItem, onOpenDrawer, onAcceptSuggestion, onDismissSuggestion, onCtaClick, prioritizeMode,
    onSnooze, onSnoozeUntilNext1on1, onUnsnooze,
  };

  return (
    <div className="flex flex-col overflow-y-auto">
      {briefItems.length > 0 && (
        <div className="border-b border-gray-100">
          {briefItems.map(item => (
            <div key={item.id} data-inbox-item-id={item.id}>
              <InboxItemRow
                item={item}
                {...sharedRowProps}
                isSelected={selectedIds?.has(item.id)}
                onSelect={onSelect}
                isNew={item.id === newItemId}
                isFocused={item.id === focusedItemId}
              />
            </div>
          ))}
        </div>
      )}

      {pinnedItems.length > 0 && (
        <div className="border-b border-gray-100">
          <button
            type="button"
            onClick={() => toggleCollapsed('__pinned__')}
            aria-expanded={!collapsed.has('__pinned__')}
            className="w-full flex items-center gap-2 px-4 py-2.5 border-b text-left cursor-pointer"
            style={{ backgroundColor: '#fffbeb', borderColor: '#fde68a', borderLeftWidth: 3, borderLeftColor: '#fbbf24' }}
          >
            {collapsed.has('__pinned__')
              ? <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-amber-400" />
              : <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-amber-400" />}
            <Pin className="h-3.5 w-3.5 flex-shrink-0 text-amber-400" />
            <span className="font-semibold text-sm text-amber-700">Pinned</span>
            <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full text-amber-700 bg-amber-200/50">
              {pinnedItems.length}
            </span>
          </button>

          {!collapsed.has('__pinned__') && pinnedItems.map(item => (
            <div key={item.id} data-inbox-item-id={item.id}>
              <InboxItemRow
                item={item}
                {...sharedRowProps}
                isSelected={selectedIds?.has(item.id)}
                onSelect={onSelect}
                isNew={item.id === newItemId}
                isFocused={item.id === focusedItemId}
              />
            </div>
          ))}
        </div>
      )}

      {projectGroups.map(({ tag, items: groupItems }) => {
        const groupKey = tag?.id ?? '__none__';
        const isCollapsed = collapsed.has(groupKey);
        return (
        <div key={groupKey} className="border-b border-gray-100">
          <button
            type="button"
            onClick={() => toggleCollapsed(groupKey)}
            aria-expanded={!isCollapsed}
            className="w-full flex items-center gap-2 px-4 py-2.5 border-b text-left cursor-pointer"
            style={tag ? {
              backgroundColor: tag.color + '14',
              borderColor: tag.color + '30',
              borderLeftWidth: 3,
              borderLeftColor: tag.color,
            } : {
              backgroundColor: '#f3f4f6',
              borderColor: '#e5e7eb',
            }}
          >
            {isCollapsed
              ? <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" style={tag ? { color: tag.color } : { color: '#9ca3af' }} />
              : <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" style={tag ? { color: tag.color } : { color: '#9ca3af' }} />}
            {tag ? (
              <>
                <Hash className="h-3.5 w-3.5 flex-shrink-0" style={{ color: tag.color }} />
                <span className="font-semibold text-sm" style={{ color: tag.color }}>{tag.name}</span>
                {tag.settings?.pinned && <Pin className="h-3 w-3 text-amber-400 flex-shrink-0" />}
              </>
            ) : (
              <span className="font-semibold text-sm text-gray-400">No project</span>
            )}
            <span
              className="text-[11px] font-medium px-1.5 py-0.5 rounded-full"
              style={tag ? { color: tag.color, backgroundColor: tag.color + '20' } : { color: '#9ca3af' }}
            >
              {groupItems.length}
            </span>
          </button>

          {!isCollapsed && groupItems.map(item => (
            <div key={item.id} data-inbox-item-id={item.id}>
              <InboxItemRow
                item={item}
                {...sharedRowProps}
                isSelected={selectedIds?.has(item.id)}
                onSelect={onSelect}
                isNew={item.id === newItemId}
                isFocused={item.id === focusedItemId}
              />
            </div>
          ))}
        </div>
        );
      })}

      {projectGroups.length === 0 && pinnedItems.length === 0 && (
        <div className={cn('flex items-center justify-center h-24')}>
          <p className="text-sm text-gray-300">No items</p>
        </div>
      )}
    </div>
  );
}
