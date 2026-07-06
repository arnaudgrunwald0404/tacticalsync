import {
  DndContext, DragEndEvent, DragOverEvent, DragOverlay,
  PointerSensor, TouchSensor, useSensor, useSensors, closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { useState } from 'react';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsTouch } from '@/hooks/use-breakpoint';
import { InboxItemRow } from './InboxItemRow';
import type { InboxItem, InboxBucket, InboxTag, TagSuggestion } from '@/types/inbox';
import type { TeamMember } from '@/hooks/useTeamMembers';

// ── Auto-assign bucket based on tags ─────────────────────────────────────────

export function autoBucket(item: InboxItem): InboxBucket {
  if (item.bucket) return item.bucket;
  if (item.type === 'agent_question' && item.agent_payload?.action_required) return 'now';
  const tagNames = item.tags?.map(t => t.name.toLowerCase()) ?? [];
  if (tagNames.includes('asap')) return 'now';
  if (tagNames.includes('later') || tagNames.includes('someday')) return 'later';
  return 'next';
}

// ── Bucket config ─────────────────────────────────────────────────────────────

const BUCKETS: { id: InboxBucket; label: string; description: string; accent: string }[] = [
  { id: 'now',  label: 'Now',  description: 'Urgent — handle today',      accent: 'border-red-200 bg-red-50/40' },
  { id: 'next', label: 'Next', description: 'Important — handle this week', accent: 'border-amber-200 bg-amber-50/30' },
  { id: 'later',label: 'Later',description: 'Backlog — when you have time', accent: 'border-gray-200 bg-gray-50/40' },
];

// ── Draggable item wrapper ────────────────────────────────────────────────────

function SortableItem({
  item, allTags, onArchive, onDelete, onRemoveTag, onAddTag,
  onCycleWorkflowStatus, onCreateWorkstream, onQuickCreateTag, teamMembers, onCreatePersonTag,
  onUpdateItem, onOpenDrawer, onAcceptSuggestion, onDismissSuggestion, isSelected, onSelect,
  prioritizeMode,
}: {
  item: InboxItem;
  allTags: InboxTag[];
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onRemoveTag: (itemId: string, tagId: string) => void;
  onAddTag: (itemId: string, tagId: string) => void;
  onCycleWorkflowStatus: (id: string, current: string | null) => void;
  onCreateWorkstream: (parentId: string, name: string) => Promise<InboxTag | null>;
  onQuickCreateTag?: (name: string, type: 'project' | 'folder') => Promise<InboxTag | null>;
  teamMembers?: TeamMember[];
  onCreatePersonTag?: (member: TeamMember) => Promise<InboxTag | null>;
  onUpdateItem: (id: string, patch: Partial<InboxItem>) => Promise<void>;
  onOpenDrawer?: (item: InboxItem) => void;
  onAcceptSuggestion?: (item: InboxItem, s: TagSuggestion) => void;
  onDismissSuggestion?: (itemId: string, tagId: string) => void;
  isSelected?: boolean;
  onSelect?: (id: string, selected: boolean) => void;
  prioritizeMode?: boolean;
}) {
  const isTouch = useIsTouch();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('flex items-stretch', isDragging && 'opacity-40')}
    >
      <div
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        // touch-none keeps the press-and-hold drag from being read as a scroll.
        className={cn(
          'flex items-center justify-center cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 flex-shrink-0 touch-none',
          isTouch ? 'w-9' : 'px-1',
        )}
      >
        <GripVertical className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <InboxItemRow
          item={item}
          allTags={allTags}
          onArchive={onArchive}
          onDelete={onDelete}
          onRemoveTag={onRemoveTag}
          onAddTag={onAddTag}
          onCycleWorkflowStatus={onCycleWorkflowStatus}
          onCreateWorkstream={onCreateWorkstream}
          onQuickCreateTag={onQuickCreateTag}
          teamMembers={teamMembers}
          onCreatePersonTag={onCreatePersonTag}
          onUpdateItem={onUpdateItem}
          onOpenDrawer={onOpenDrawer}
          onAcceptSuggestion={onAcceptSuggestion}
          onDismissSuggestion={onDismissSuggestion}
          isSelected={isSelected}
          onSelect={onSelect}
          prioritizeMode={prioritizeMode}
        />
      </div>
    </div>
  );
}

// ── Drop zone section (horizontal) ───────────────────────────────────────────

function BucketSection({
  bucket, items, allTags, onArchive, onDelete, onRemoveTag, onAddTag,
  onCycleWorkflowStatus, onCreateWorkstream, onQuickCreateTag, teamMembers, onCreatePersonTag,
  onUpdateItem, onOpenDrawer, onAcceptSuggestion, onDismissSuggestion, selectedIds, onSelect,
  prioritizeMode,
}: {
  bucket: typeof BUCKETS[number];
  items: InboxItem[];
  allTags: InboxTag[];
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onRemoveTag: (itemId: string, tagId: string) => void;
  onAddTag: (itemId: string, tagId: string) => void;
  onCycleWorkflowStatus: (id: string, current: string | null) => void;
  onCreateWorkstream: (parentId: string, name: string) => Promise<InboxTag | null>;
  onQuickCreateTag?: (name: string, type: 'project' | 'folder') => Promise<InboxTag | null>;
  teamMembers?: TeamMember[];
  onCreatePersonTag?: (member: TeamMember) => Promise<InboxTag | null>;
  onUpdateItem: (id: string, patch: Partial<InboxItem>) => Promise<void>;
  onOpenDrawer?: (item: InboxItem) => void;
  onAcceptSuggestion?: (item: InboxItem, s: TagSuggestion) => void;
  onDismissSuggestion?: (itemId: string, tagId: string) => void;
  selectedIds?: Set<string>;
  onSelect?: (id: string, selected: boolean) => void;
  prioritizeMode?: boolean;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: bucket.id });

  return (
    <div className={cn('border-b border-gray-200', bucket.accent)}>
      <div className="flex items-baseline gap-2 px-4 py-2 border-b border-gray-200/60">
        <span className="font-semibold text-sm text-gray-800">{bucket.label}</span>
        <span className="text-xs text-gray-400">{bucket.description}</span>
        <span className="ml-auto text-[11px] text-gray-400">{items.length}</span>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          'transition-colors',
          isOver && 'bg-blue-50/60',
          items.length === 0 && 'min-h-[52px]',
        )}
      >
        <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
          {items.map(item => (
            <SortableItem
              key={item.id}
              item={item}
              allTags={allTags}
              onArchive={onArchive}
              onDelete={onDelete}
              onRemoveTag={onRemoveTag}
              onAddTag={onAddTag}
              onCycleWorkflowStatus={onCycleWorkflowStatus}
              onCreateWorkstream={onCreateWorkstream}
              onQuickCreateTag={onQuickCreateTag}
              teamMembers={teamMembers}
              onCreatePersonTag={onCreatePersonTag}
              onUpdateItem={onUpdateItem}
              onOpenDrawer={onOpenDrawer}
              onAcceptSuggestion={onAcceptSuggestion}
              onDismissSuggestion={onDismissSuggestion}
              isSelected={selectedIds?.has(item.id)}
              onSelect={onSelect}
              prioritizeMode={prioritizeMode}
            />
          ))}
        </SortableContext>

        {items.length === 0 && (
          <div className={cn(
            'flex items-center justify-center h-[52px]',
            isOver ? 'border-2 border-dashed border-blue-300 rounded-md mx-3 my-1.5' : '',
          )}>
            <p className="text-xs text-gray-300 select-none">Drop here</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface InboxGroupedViewProps {
  items: InboxItem[];
  allTags: InboxTag[];
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onRemoveTag: (itemId: string, tagId: string) => void;
  onAddTag: (itemId: string, tagId: string) => void;
  onCycleWorkflowStatus: (id: string, current: string | null) => void;
  onCreateWorkstream: (parentId: string, name: string) => Promise<InboxTag | null>;
  onQuickCreateTag?: (name: string, type: 'project' | 'folder') => Promise<InboxTag | null>;
  teamMembers?: TeamMember[];
  onCreatePersonTag?: (member: TeamMember) => Promise<InboxTag | null>;
  onUpdateItem: (id: string, patch: Partial<InboxItem>) => Promise<void>;
  onMoveBucket: (itemId: string, bucket: InboxBucket) => void;
  onOpenDrawer?: (item: InboxItem) => void;
  onAcceptSuggestion?: (item: InboxItem, s: TagSuggestion) => void;
  onDismissSuggestion?: (itemId: string, tagId: string) => void;
  selectedIds?: Set<string>;
  onSelect?: (id: string, selected: boolean) => void;
  prioritizeMode?: boolean;
}

export function InboxGroupedView({
  items, allTags, onArchive, onDelete, onRemoveTag, onAddTag,
  onCycleWorkflowStatus, onCreateWorkstream, onQuickCreateTag, teamMembers, onCreatePersonTag,
  onUpdateItem, onMoveBucket, onOpenDrawer, onAcceptSuggestion, onDismissSuggestion, selectedIds, onSelect,
  prioritizeMode,
}: InboxGroupedViewProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Press-and-hold on touch so a normal swipe still scrolls the list.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  // Group items by effective bucket
  const grouped = BUCKETS.reduce<Record<InboxBucket, InboxItem[]>>(
    (acc, b) => { acc[b.id] = []; return acc; },
    { now: [], next: [], later: [] },
  );
  for (const item of items) {
    grouped[autoBucket(item)].push(item);
  }

  const activeItem = activeId ? items.find(i => i.id === activeId) : null;

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    // If dropped onto a bucket droppable (not another item), move to that bucket
    const targetBucket = BUCKETS.find(b => b.id === over.id);
    if (targetBucket && active.id !== over.id) {
      onMoveBucket(active.id as string, targetBucket.id);
      return;
    }

    // If dropped onto another item, infer bucket from that item's position
    const overItem = items.find(i => i.id === over.id);
    if (overItem) {
      const destBucket = autoBucket(overItem);
      const srcBucket = autoBucket(items.find(i => i.id === active.id)!);
      if (destBucket !== srcBucket) {
        onMoveBucket(active.id as string, destBucket);
      }
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={({ active }) => setActiveId(active.id as string)}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex flex-col overflow-y-auto">
        {BUCKETS.map(bucket => (
          <BucketSection
            key={bucket.id}
            bucket={bucket}
            items={grouped[bucket.id]}
            allTags={allTags}
            onArchive={onArchive}
            onDelete={onDelete}
            onRemoveTag={onRemoveTag}
            onAddTag={onAddTag}
            onCycleWorkflowStatus={onCycleWorkflowStatus}
            onCreateWorkstream={onCreateWorkstream}
            onQuickCreateTag={onQuickCreateTag}
            teamMembers={teamMembers}
            onCreatePersonTag={onCreatePersonTag}
            onUpdateItem={onUpdateItem}
            onOpenDrawer={onOpenDrawer}
            onAcceptSuggestion={onAcceptSuggestion}
            onDismissSuggestion={onDismissSuggestion}
            selectedIds={selectedIds}
            onSelect={onSelect}
            prioritizeMode={prioritizeMode}
          />
        ))}
      </div>

      <DragOverlay>
        {activeItem && (
          <div className="bg-white shadow-lg rounded border border-gray-200 opacity-95 text-sm px-4 py-2.5 max-w-sm truncate">
            {activeItem.text}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
