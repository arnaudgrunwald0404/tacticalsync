import { useMemo } from 'react';
import { Hash, Pin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { InboxItemRow } from './InboxItemRow';
import { isAutoPinnedItem, priorityRank } from '@/lib/inboxValidation';
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
}

export function InboxByProjectView({
  items, allTags, onArchive, onDelete, onRemoveTag, onAddTag,
  onCycleWorkflowStatus, onCreateWorkstream, onQuickCreateTag, teamMembers, onCreatePersonTag,
  onUpdateItem, onOpenDrawer, onAcceptSuggestion, onDismissSuggestion, onCtaClick, selectedIds, onSelect,
  prioritizeMode, newItemId,
}: InboxByProjectViewProps) {
  const { pinnedItems, projectGroups } = useMemo(() => {
    const projectTags = allTags.filter(t => t.type === 'project');

    // Weekly priorities/daily check-ins (never belong to a project) and
    // manually pinned items both get pulled out up front so they float in
    // their own section above every project group, regardless of which
    // project(s) a manually pinned item is tagged with.
    const pinnedItems: InboxItem[] = [];

    // Map each item to the project tags it carries
    const byProject = new Map<string, InboxItem[]>();
    const noProject: InboxItem[] = [];

    for (const item of items) {
      if (isAutoPinnedItem(item) || item.pinned) {
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

    // Within each section, most-urgent-first: Do Now, then the informal due
    // date tiers (now/1d/3d/1w/2w/1m), least urgent (or no due date) last.
    const now = new Date();
    const byUrgency = (a: InboxItem, b: InboxItem) => priorityRank(a, now) - priorityRank(b, now);
    pinnedItems.sort(byUrgency);
    for (const group of groups) group.items.sort(byUrgency);

    return { pinnedItems, projectGroups: groups };
  }, [items, allTags]);

  const sharedRowProps = {
    allTags, onArchive, onDelete, onRemoveTag, onAddTag,
    onCycleWorkflowStatus, onCreateWorkstream, onQuickCreateTag, teamMembers, onCreatePersonTag,
    onUpdateItem, onOpenDrawer, onAcceptSuggestion, onDismissSuggestion, onCtaClick, prioritizeMode,
  };

  return (
    <div className="flex flex-col overflow-y-auto">
      {pinnedItems.length > 0 && (
        <div className="border-b border-gray-100">
          <div
            className="flex items-center gap-2 px-4 py-2.5 border-b"
            style={{ backgroundColor: '#fffbeb', borderColor: '#fde68a', borderLeftWidth: 3, borderLeftColor: '#fbbf24' }}
          >
            <Pin className="h-3.5 w-3.5 flex-shrink-0 text-amber-400" />
            <span className="font-semibold text-sm text-amber-700">Pinned</span>
            <span className="ml-auto text-[11px] font-medium px-1.5 py-0.5 rounded-full text-amber-700 bg-amber-200/50">
              {pinnedItems.length}
            </span>
          </div>

          {pinnedItems.map(item => (
            <InboxItemRow
              key={item.id}
              item={item}
              {...sharedRowProps}
              isSelected={selectedIds?.has(item.id)}
              onSelect={onSelect}
              isNew={item.id === newItemId}
            />
          ))}
        </div>
      )}

      {projectGroups.map(({ tag, items: groupItems }) => (
        <div key={tag?.id ?? '__none__'} className="border-b border-gray-100">
          <div
            className="flex items-center gap-2 px-4 py-2.5 border-b"
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
            {tag ? (
              <>
                <Hash className="h-3.5 w-3.5 flex-shrink-0" style={{ color: tag.color }} />
                <span className="font-semibold text-sm" style={{ color: tag.color }}>{tag.name}</span>
                {tag.settings?.pinned && <Pin className="h-3 w-3 text-amber-400 flex-shrink-0" />}
              </>
            ) : (
              <>
                <span className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="font-semibold text-sm text-gray-400">No project</span>
              </>
            )}
            <span
              className="ml-auto text-[11px] font-medium px-1.5 py-0.5 rounded-full"
              style={tag ? { color: tag.color, backgroundColor: tag.color + '20' } : { color: '#9ca3af' }}
            >
              {groupItems.length}
            </span>
          </div>

          {groupItems.map(item => (
            <InboxItemRow
              key={item.id}
              item={item}
              {...sharedRowProps}
              isSelected={selectedIds?.has(item.id)}
              onSelect={onSelect}
              isNew={item.id === newItemId}
            />
          ))}
        </div>
      ))}

      {projectGroups.length === 0 && pinnedItems.length === 0 && (
        <div className={cn('flex items-center justify-center h-24')}>
          <p className="text-sm text-gray-300">No items</p>
        </div>
      )}
    </div>
  );
}
