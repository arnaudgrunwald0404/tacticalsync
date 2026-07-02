import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  CheckSquare, Square, FileText, Zap, HelpCircle, Video, Calendar,
  Check, Pin,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { InboxTagPill } from './InboxTagPill';
import { TagPickerDropdown } from './TagPickerDropdown';
import { DelegationStatusRow } from './DelegationStatusRow';
import { useInboxDelegation } from '@/hooks/useInboxDelegation';
import { useIsTouch } from '@/hooks/use-breakpoint';
import type { InboxItem, InboxTag } from '@/types/inbox';

interface InboxItemRowProps {
  item: InboxItem;
  allTags: InboxTag[];
  onDone: (id: string, done: boolean) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onRemoveTag: (itemId: string, tagId: string) => void;
  onAddTag: (itemId: string, tagId: string) => void;
  onCycleWorkflowStatus: (id: string, current: string | null) => void;
  onCreateWorkstream: (parentId: string, name: string) => Promise<InboxTag | null>;
  onQuickCreateTag?: (name: string) => Promise<InboxTag | null>;
  onUpdateItem?: (id: string, patch: Partial<InboxItem>) => Promise<void>;
  onCtaClick?: (item: InboxItem) => void;
  onOpenDrawer?: (item: InboxItem) => void;
  isSelected?: boolean;
  onSelect?: (id: string, selected: boolean) => void;
  isNew?: boolean;
}

const TYPE_ICON: Record<InboxItem['type'], React.ReactNode> = {
  task:             <Square className="h-4 w-4" />,
  note:             <FileText className="h-4 w-4" />,
  agent_nudge:      <Zap className="h-4 w-4" />,
  agent_question:   <HelpCircle className="h-4 w-4" />,
  meeting_insight:  <Video className="h-4 w-4" />,
  brief_item:       <Calendar className="h-4 w-4" />,
};

const TYPE_ACCENT: Record<InboxItem['type'], string> = {
  task:             'border-l-transparent',
  note:             'border-l-slate-300',
  agent_nudge:      'border-l-amber-400',
  agent_question:   'border-l-violet-400',
  meeting_insight:  'border-l-blue-400',
  brief_item:       'border-l-emerald-400',
};

const AGENT_BG: Record<InboxItem['type'], string> = {
  task:             '',
  note:             '',
  agent_nudge:      'bg-amber-50',
  agent_question:   'bg-violet-50',
  meeting_insight:  'bg-blue-50',
  brief_item:       'bg-emerald-50',
};

export function InboxItemRow({
  item, allTags, onDone, onArchive, onDelete, onRemoveTag, onAddTag,
  onCycleWorkflowStatus, onCreateWorkstream, onQuickCreateTag, onUpdateItem, onCtaClick,
  onOpenDrawer, isSelected, onSelect, isNew,
}: InboxItemRowProps) {
  const [hovered, setHovered] = useState(false);
  const isTouch = useIsTouch();
  const revealControls = hovered || isTouch;
  const isDone = item.status === 'done';
  const { delegation, submitAnswer, approve } = useInboxDelegation(item.id);

  const relTime = formatDistanceToNow(new Date(item.created_at), { addSuffix: false })
    .replace('about ', '')
    .replace(' minutes', 'm')
    .replace(' minute', 'm')
    .replace(' hours', 'h')
    .replace(' hour', 'h')
    .replace(' days', 'd')
    .replace(' day', 'd')
    .replace(' weeks', 'w')
    .replace(' week', 'w');

  const isAgentItem = ['agent_nudge', 'agent_question', 'meeting_insight', 'brief_item'].includes(item.type);

  return (
    <div
      className={cn(
        'group border-l-2 px-4 transition-colors',
        TYPE_ACCENT[item.type],
        AGENT_BG[item.type],
        isNew && 'animate-inbox-flash',
        hovered && !isAgentItem && 'bg-gray-50',
        isDone && 'opacity-50',
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-center gap-3 py-2.5 min-h-[44px]">
        {/* Multi-select checkbox — shown on hover/touch or when selected */}
        <button
          onClick={(e) => { e.stopPropagation(); onSelect?.(item.id, !isSelected); }}
          aria-label={isSelected ? 'Deselect item' : 'Select item'}
          className={cn(
            'flex-shrink-0 flex items-center justify-center transition-all',
            // Larger tap surface on touch, compact box on pointer devices.
            isTouch ? 'w-8 h-8 -ml-1' : 'w-4 h-4',
            !isSelected && !revealControls && 'opacity-0',
          )}
        >
          <span className={cn(
            'w-4 h-4 rounded border flex items-center justify-center',
            isSelected
              ? 'bg-gray-900 border-gray-900 text-white'
              : 'border-gray-300 text-transparent hover:border-gray-500',
          )}>
            <Check className="h-2.5 w-2.5" strokeWidth={3} />
          </span>
        </button>

        {/* Type icon (non-task) */}
        {item.type !== 'task' && (
          <span className={cn('flex-shrink-0', isAgentItem ? 'text-gray-400' : 'text-gray-300')}>
            {TYPE_ICON[item.type]}
          </span>
        )}

        {/* Main text */}
        <button
          className="flex-1 text-left text-sm truncate min-w-0"
          onClick={() => onOpenDrawer?.(item)}
        >
          <span className={cn(isDone && 'line-through text-gray-400')}>
            {item.text}
          </span>
        </button>

        {/* Tags — fixed column on wide screens, shrinks/caps on narrow ones */}
        <div className="flex items-center gap-1 overflow-visible max-sm:max-w-[40%] max-sm:min-w-0 sm:w-40 sm:flex-shrink-0 lg:w-48">
          {item.tags?.map(tag => {
            const childWorkstreams = allTags.filter(t => t.type === 'workstream' && t.parent_id === tag.id);
            return (
              <InboxTagPill
                key={tag.id}
                tag={tag}
                size="xs"
                onRemove={revealControls ? () => onRemoveTag(item.id, tag.id) : undefined}
                workstreams={['project', 'person', 'folder'].includes(tag.type) ? childWorkstreams : undefined}
                onSelectWorkstream={ws => onAddTag(item.id, ws.id)}
                onCreateWorkstream={async name => {
                  const ws = await onCreateWorkstream(tag.id, name);
                  if (ws) onAddTag(item.id, ws.id);
                }}
              />
            );
          })}
          {/* Tag picker — show on hover when tags exist, or always when no tags */}
          {item.tags && item.tags.length > 0 ? revealControls && (
            <TagPickerDropdown
              allTags={allTags}
              itemTags={item.tags}
              onAddTag={tagId => onAddTag(item.id, tagId)}
              onCreateTag={onQuickCreateTag}
            />
          ) : (
            <TagPickerDropdown
              allTags={allTags}
              itemTags={item.tags ?? []}
              onAddTag={tagId => onAddTag(item.id, tagId)}
              onCreateTag={onQuickCreateTag}
            />
          )}
        </div>

        {/* Agent CTA */}
        {item.type === 'agent_question' && item.agent_payload?.action_required && (
          <button
            onClick={() => onCtaClick?.(item)}
            className="flex-shrink-0 px-2.5 py-1 text-xs rounded-md bg-violet-100 text-violet-700 hover:bg-violet-200 transition-colors"
          >
            {item.agent_payload.cta_label ?? 'Respond'}
          </button>
        )}

        {/* Pin indicator */}
        {item.pinned && (
          <Pin className="h-3 w-3 flex-shrink-0 text-amber-400 rotate-45" />
        )}

        {/* Timestamp */}
        <span className="flex-shrink-0 text-[11px] text-gray-400 w-14 text-right">
          {relTime}
        </span>

      </div>

      {/* Delegation status — stays inline */}
      {delegation && delegation.status !== 'done' && delegation.status !== 'cancelled' && (
        <DelegationStatusRow
          delegation={delegation}
          onAnswer={submitAnswer}
          onApprove={approve}
        />
      )}

      {/* Divider */}
      <div className="border-b border-gray-100" />
    </div>
  );
}
