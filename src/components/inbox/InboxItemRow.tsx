import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  CheckSquare, Square, FileText, Zap, HelpCircle, Video, Calendar,
  Check, Pin, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { InboxTagPill } from './InboxTagPill';
import { TagPickerDropdown } from './TagPickerDropdown';
import { DelegationStatusRow } from './DelegationStatusRow';
import { useInboxDelegation } from '@/hooks/useInboxDelegation';
import { useIsTouch } from '@/hooks/use-breakpoint';
import type { InboxItem, InboxTag, TagSuggestion } from '@/types/inbox';
import type { TeamMember } from '@/hooks/useTeamMembers';

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
  onQuickCreateTag?: (name: string, type: 'project' | 'folder') => Promise<InboxTag | null>;
  onCreatePersonTag?: (member: TeamMember) => Promise<InboxTag | null>;
  teamMembers?: TeamMember[];
  onUpdateItem?: (id: string, patch: Partial<InboxItem>) => Promise<void>;
  onCtaClick?: (item: InboxItem) => void;
  onOpenDrawer?: (item: InboxItem) => void;
  onAcceptSuggestion?: (item: InboxItem, suggestion: TagSuggestion) => void;
  onDismissSuggestion?: (itemId: string, tagId: string) => void;
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
  onCycleWorkflowStatus, onCreateWorkstream, onQuickCreateTag, onCreatePersonTag, teamMembers,
  onUpdateItem, onCtaClick, onOpenDrawer, onAcceptSuggestion, onDismissSuggestion,
  isSelected, onSelect, isNew,
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
          className="flex-1 text-left text-sm min-w-0 break-words"
          onClick={() => onOpenDrawer?.(item)}
        >
          <span className={cn(isDone && 'line-through text-gray-400')}>
            {item.text}
          </span>
        </button>

        {/* Pin indicator — right after text */}
        {item.pinned && (
          <Pin className="h-3 w-3 flex-shrink-0 text-amber-400 rotate-45" />
        )}

        {/* Tags — fixed column, shifted left vs timestamp */}
        <div className="flex items-center gap-1 overflow-visible max-sm:max-w-[52%] max-sm:min-w-0 sm:w-52 sm:flex-shrink-0 lg:w-64">
          {/* AI-suggested tags — ghost pills, one click to accept */}
          {(item.tag_suggestions ?? []).map(s => (
            <span
              key={s.tag_id}
              className="inline-flex items-center gap-0.5 group/sug"
              title={s.reason}
            >
              <button
                onClick={e => { e.stopPropagation(); onAcceptSuggestion?.(item, s); }}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border border-dashed transition-all hover:opacity-90 hover:scale-105"
                style={{ borderColor: s.color, color: s.color, backgroundColor: `${s.color}12` }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: s.color, opacity: 0.6 }}
                />
                {s.tag_name}
              </button>
              <button
                onClick={e => { e.stopPropagation(); onDismissSuggestion?.(item.id, s.tag_id); }}
                className="opacity-0 group-hover/sug:opacity-100 p-0.5 rounded text-gray-300 hover:text-gray-500 transition-all flex-shrink-0"
                title="Dismiss suggestion"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
          {(() => {
            const itemTags = item.tags ?? [];
            const workstreamParentIds = new Set(
              itemTags.filter(t => t.type === 'workstream').map(t => t.parent_id).filter(Boolean)
            );
            const order = ['project', 'person', 'folder', 'workstream', 'context', 'urgency'];
            return [...itemTags]
              .sort((a, b) => (order.indexOf(a.type) ?? 99) - (order.indexOf(b.type) ?? 99))
              .filter(tag => {
                // skip standalone workstream pills — they'll be fused onto their parent
                if (tag.type === 'workstream') return false;
                return true;
              })
              .map(tag => {
                // find the workstream(s) of this tag that are also on this item
                const attachedWorkstream = itemTags.find(
                  t => t.type === 'workstream' && t.parent_id === tag.id
                );
                const childWorkstreams = allTags.filter(t => t.type === 'workstream' && t.parent_id === tag.id);
                return (
                  <InboxTagPill
                    key={tag.id}
                    tag={tag}
                    workstreamSuffix={attachedWorkstream?.name}
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
              });
          })()}
          {/* Tag picker — show on hover when tags exist, or always when no tags */}
          {item.tags && item.tags.length > 0 ? revealControls && (
            <TagPickerDropdown
              allTags={allTags}
              itemTags={item.tags}
              onSelectTags={tagIds => tagIds.forEach(tagId => onAddTag(item.id, tagId))}
              onCreateTag={onQuickCreateTag}
              teamMembers={teamMembers}
              onCreatePersonTag={onCreatePersonTag}
            />
          ) : (
            <TagPickerDropdown
              allTags={allTags}
              itemTags={item.tags ?? []}
              onSelectTags={tagIds => tagIds.forEach(tagId => onAddTag(item.id, tagId))}
              onCreateTag={onQuickCreateTag}
              teamMembers={teamMembers}
              onCreatePersonTag={onCreatePersonTag}
            />
          )}
        </div>

        {/* Status column — one-click picker for non-agent items */}
        {item.type !== 'brief_item' && (
          <div className="flex-shrink-0 w-36 flex items-center justify-end">
            {revealControls ? (
              <div className="flex items-center gap-0.5">
                {([
                  { label: 'Not started',        color: '#9ca3af', dot: 'bg-gray-300' },
                  { label: 'Work in progress',   color: '#f59e0b', dot: 'bg-amber-400' },
                  { label: 'Waiting on someone', color: '#3b82f6', dot: 'bg-blue-400' },
                  { label: 'Blocked',            color: '#ef4444', dot: 'bg-red-400' },
                ] as const).map(({ label, color, dot }) => {
                  const active = item.workflow_status === label;
                  return (
                    <button
                      key={label}
                      title={label}
                      onClick={e => {
                        e.stopPropagation();
                        onUpdateItem?.(item.id, { workflow_status: active ? null : label } as Partial<InboxItem>);
                      }}
                      className={cn(
                        'flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium transition-all whitespace-nowrap',
                        active
                          ? 'text-white shadow-sm'
                          : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100',
                      )}
                      style={active ? { backgroundColor: color } : {}}
                    >
                      <span className={cn('h-1.5 w-1.5 rounded-full flex-shrink-0', dot, active && 'bg-white/70')} />
                      {active ? label : null}
                    </button>
                  );
                })}
              </div>
            ) : item.workflow_status ? (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium text-white"
                style={{
                  backgroundColor: {
                    'Not started': '#9ca3af',
                    'Work in progress': '#f59e0b',
                    'Waiting on someone': '#3b82f6',
                    'Blocked': '#ef4444',
                  }[item.workflow_status] ?? '#9ca3af',
                }}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-white/70 flex-shrink-0" />
                {item.workflow_status}
              </span>
            ) : null}
          </div>
        )}

        {/* Agent CTA */}
        {item.type === 'agent_question' && item.agent_payload?.action_required && (
          <button
            onClick={() => onCtaClick?.(item)}
            className="flex-shrink-0 px-2.5 py-1 text-xs rounded-md bg-violet-100 text-violet-700 hover:bg-violet-200 transition-colors"
          >
            {item.agent_payload.cta_label ?? 'Respond'}
          </button>
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
