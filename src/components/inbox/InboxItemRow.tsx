import { useState, useRef } from 'react';
import { format } from 'date-fns';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as DueDateCalendar } from '@/components/ui/calendar';
import {
  WORKFLOW_STATUS_COLORS, tagStyle,
  PRIORITY_TIERS, computePriorityDueAt, currentPriorityTier,
} from '@/lib/inboxValidation';
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
  /** Prioritize mode: shrinks the status column and reveals per-row tier
   *  pills for setting `priority_due_at`. */
  prioritizeMode?: boolean;
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

// Blue used for both the fixed-due-date tag and the active calendar pill, so
// the two visually read as the same thing.
const PRIORITY_DATE_COLOR = '#2563eb';

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
  isSelected, onSelect, isNew, prioritizeMode,
}: InboxItemRowProps) {
  const [hovered, setHovered] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [editingText, setEditingText] = useState(false);
  const [textDraft, setTextDraft] = useState(item.text);
  const textInputRef = useRef<HTMLInputElement>(null);
  const isTouch = useIsTouch();
  const revealControls = hovered || isTouch;
  const isDone = item.status === 'done';
  const { delegation, submitAnswer, approve } = useInboxDelegation(item.id);

  const isAgentItem = ['agent_nudge', 'agent_question', 'meeting_insight', 'brief_item'].includes(item.type);
  // A fixed due date shows as a tag (see the Tags column below) so it survives
  // leaving Prioritize mode — it's not scoped to `prioritizeMode` like the tier
  // pills are.
  const fixedDueDate = item.priority_fixed && item.priority_due_at
    ? new Date(item.priority_due_at)
    : null;
  const activeTier = prioritizeMode && !item.priority_fixed ? currentPriorityTier(item.priority_due_at) : null;

  // Tier pills are "loosey goosey" — the tier they read as decays over time.
  // Picking one always clears any fixed calendar date.
  const setTier = (tierKey: (typeof PRIORITY_TIERS)[number]['key']) => {
    onUpdateItem?.(item.id, { priority_due_at: computePriorityDueAt(tierKey), priority_fixed: false });
  };

  // The calendar picker sets a hard due date that does not decay.
  const setFixedDueDate = (date: Date | undefined) => {
    if (!date) return;
    onUpdateItem?.(item.id, { priority_due_at: date.toISOString(), priority_fixed: true });
    setDatePickerOpen(false);
  };

  const startEditText = () => {
    setTextDraft(item.text);
    setEditingText(true);
  };

  const commitEditText = () => {
    const trimmed = textDraft.trim();
    if (trimmed && trimmed !== item.text) {
      onUpdateItem?.(item.id, { text: trimmed });
    }
    setEditingText(false);
  };

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
      <div className={cn(
        'grid items-start gap-3 py-2.5 min-h-[44px]',
        // Explicit grid tracks, not flex + absolute percentages: each column
        // gets a real, reserved slot, so nothing can ever overlap regardless
        // of how much text a tag or status label holds or how many lines
        // Tags wraps to. Column boundaries: 50% / 75% normally; 50% / 70% /
        // 77% in Prioritize mode (Tags narrows slightly there to make room
        // for Status + the tier pills).
        prioritizeMode ? 'grid-cols-[50%_20%_7%_1fr]' : 'grid-cols-[50%_25%_1fr]',
      )}>
        {/* Main content — checkbox, type icon, text, pin. */}
        <div className="flex items-center gap-3 min-w-0">
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
          {editingText ? (
            <input
              ref={textInputRef}
              autoFocus
              value={textDraft}
              onChange={e => setTextDraft(e.target.value)}
              onClick={e => e.stopPropagation()}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); commitEditText(); }
                if (e.key === 'Escape') { e.preventDefault(); setEditingText(false); }
              }}
              onBlur={commitEditText}
              className="flex-1 text-sm min-w-0 outline-none bg-white ring-1 ring-blue-300 rounded px-1 -mx-1"
            />
          ) : (
            <button
              className="flex-1 text-left text-sm min-w-0 break-words"
              onClick={() => onOpenDrawer?.(item)}
              onDoubleClick={e => { e.stopPropagation(); startEditText(); }}
            >
              <span className={cn(isDone && 'line-through text-gray-400')}>
                {item.text}
              </span>
            </button>
          )}

          {/* Pin indicator — right after text */}
          {item.pinned && (
            <Pin className="h-3 w-3 flex-shrink-0 text-amber-400 rotate-45" />
          )}
        </div>

        {/* Tags — its own grid column (50%-75%, or 50%-70% in Prioritize mode).
            Wraps to a second line — since Status/Pills are separate columns,
            not absolutely positioned over this one, a wrapped second line
            can't overlap them the way it could before. */}
        <div className="flex flex-wrap items-center gap-1 gap-y-1.5 py-1 min-w-0">
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
          {/* Fixed due date — rendered as a tag so it stays visible outside
              Prioritize mode too. Not a real InboxTag; driven directly by
              priority_due_at/priority_fixed. Blue matches the calendar pill
              in the Prioritize row so the two read as the same thing. */}
          {fixedDueDate && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
              style={tagStyle(PRIORITY_DATE_COLOR)}
              title={`Due ${format(fixedDueDate, 'MMM d')}`}
            >
              <Calendar className="h-3 w-3" />
              {format(fixedDueDate, 'MMM d')}
            </span>
          )}
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

        {/* Status — a single tag-style chip; click cycles through the workflow
            statuses. Its own grid column, right after Tags (75%-100% normally,
            70%-77% in Prioritize mode) — hugs the start of that column
            (justify-self-start) instead of the row's far right edge.
            `min-w-0` is load-bearing: without it, a grid item's default
            min-width is its content's min-content size, so a wide label like
            "Waiting on someone" silently grows this column past its 7%/25%
            track — and since every row is its own independent grid, that
            growth differs per row, pushing the Pills column to a different
            x-position on every row instead of a shared, strict start point. */}
        <div className="flex items-center justify-self-start min-w-0 overflow-hidden">
          {item.type !== 'brief_item' && (
            <button
              title="Click to change status"
              onClick={e => {
                e.stopPropagation();
                onCycleWorkflowStatus(item.id, item.workflow_status ?? null);
              }}
              className={cn(
                'inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-medium whitespace-nowrap transition-opacity hover:opacity-75 max-w-full truncate',
                !item.workflow_status && 'border-dashed border-gray-300 text-gray-400',
              )}
              style={item.workflow_status ? tagStyle(WORKFLOW_STATUS_COLORS[item.workflow_status]) : undefined}
            >
              {item.workflow_status ?? 'Set status'}
            </button>
          )}
        </div>

        {/* Prioritize mode — per-row tier pills for setting the informal due
            date. Its own grid column (the 4th track), right after Status. */}
        {prioritizeMode && (
          <div className="flex flex-wrap items-center gap-1 justify-self-start">
            {PRIORITY_TIERS.map(tier => {
              const active = activeTier === tier.key;
              if (tier.key === 'now') {
                return (
                  <button
                    key={tier.key}
                    title="Do now"
                    onClick={e => { e.stopPropagation(); setTier(tier.key); }}
                    className={cn(
                      'flex-shrink-0 flex items-center justify-center h-5 w-5 rounded-full border transition-colors',
                      active
                        ? 'bg-rose-500 border-rose-500 text-white'
                        : 'border-gray-200 text-gray-300 hover:text-rose-400 hover:border-rose-300',
                    )}
                  >
                    <Zap className="h-3 w-3" fill={active ? 'currentColor' : 'none'} />
                  </button>
                );
              }
              return (
                <button
                  key={tier.key}
                  title={tier.label}
                  onClick={e => { e.stopPropagation(); setTier(tier.key); }}
                  className={cn(
                    'flex-shrink-0 flex items-center justify-center h-5 min-w-[20px] px-1 rounded-full border text-[9px] font-medium whitespace-nowrap transition-colors',
                    active
                      ? 'bg-gray-900 border-gray-900 text-white'
                      : 'border-gray-200 text-gray-400 hover:text-gray-700 hover:border-gray-300',
                  )}
                >
                  {tier.key}
                </button>
              );
            })}

            {/* Fixed due date toggle — the date itself shows as a tag (see the
                Tags column), not here. This just stays lit blue, matching the
                tag's color, to visually connect the two. */}
            <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
              <PopoverTrigger asChild>
                <button
                  onClick={e => e.stopPropagation()}
                  title={fixedDueDate ? `Due ${format(fixedDueDate, 'MMM d')}` : 'Pick a due date'}
                  className={cn(
                    'flex-shrink-0 flex items-center justify-center h-5 w-5 rounded-full border transition-colors',
                    fixedDueDate
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'border-gray-200 text-gray-300 hover:text-gray-700 hover:border-gray-300',
                  )}
                >
                  <Calendar className="h-3 w-3" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                className="w-auto p-0"
                align="end"
                onClick={e => e.stopPropagation()}
              >
                <DueDateCalendar
                  mode="single"
                  selected={fixedDueDate ?? undefined}
                  onSelect={setFixedDueDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        )}

        {/* Agent CTA — always the last grid column, right-aligned within it,
            so it sits at the row's true right edge regardless of how many
            columns exist. */}
        {item.type === 'agent_question' && item.agent_payload?.action_required && (
          <button
            onClick={() => onCtaClick?.(item)}
            style={{ gridColumn: '-1' }}
            className="justify-self-end px-2.5 py-1 text-xs rounded-md bg-violet-100 text-violet-700 hover:bg-violet-200 transition-colors"
          >
            {item.agent_payload.cta_label ?? 'Respond'}
          </button>
        )}
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
