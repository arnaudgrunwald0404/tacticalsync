import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { format } from 'date-fns';
import {
  FileText, Zap, HelpCircle, Video, Calendar,
  Check, Pin, X, Clock, RotateCcw, Users, ThumbsUp, BookmarkPlus, XCircle, Pencil, ExternalLink, Mail,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { InboxTagPill } from './InboxTagPill';
import { TagPickerDropdown } from './TagPickerDropdown';
import { DelegationStatusRow } from './DelegationStatusRow';
import { WaitingOnBadge, FromBadge } from './DelegatedBadge';
import { SnoozePopover } from './SnoozePopover';
import { useInboxDelegation } from '@/hooks/useInboxDelegation';
import { useOutgoingDelegation, useIncomingDelegationForItem } from '@/hooks/useInboxItemDelegation';
import { useIsTouch } from '@/hooks/use-breakpoint';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as DueDateCalendar } from '@/components/ui/calendar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  WORKFLOW_STATUS_COLORS, WORKFLOW_STATUS_LABELS, WORKFLOW_CYCLE, tagStyle,
  PRIORITY_TIERS, computePriorityDueAt, currentPriorityTier, isAutoPinnedItem,
  formatSnoozeLabel,
} from '@/lib/inboxValidation';
import type { TriageAction } from '@/lib/meetingInsights';
import type { InboxItem, InboxTag, TagSuggestion } from '@/types/inbox';
import type { TeamMember } from '@/hooks/useTeamMembers';

interface InboxItemRowProps {
  item: InboxItem;
  allTags: InboxTag[];
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onRemoveTag: (itemId: string, tagId: string) => void;
  onAddTag: (itemId: string, tagId: string) => void;
  onCycleWorkflowStatus: (id: string, current: string | null) => void;
  onSetWorkflowStatus: (id: string, status: string | null) => void;
  onCreateWorkstream: (parentId: string, name: string) => Promise<InboxTag | null>;
  onQuickCreateTag?: (name: string, type: 'project' | 'folder') => Promise<InboxTag | null>;
  onCreatePersonTag?: (member: TeamMember) => Promise<InboxTag | null>;
  teamMembers?: TeamMember[];
  onUpdateItem?: (id: string, patch: Partial<InboxItem>) => Promise<void>;
  onCtaClick?: (item: InboxItem) => void;
  onOpenDrawer?: (item: InboxItem) => void;
  onAcceptSuggestion?: (item: InboxItem, suggestion: TagSuggestion) => void;
  onDismissSuggestion?: (itemId: string, tagId: string) => void;
  /** Confirm/Save/Dismiss triage for meeting_insight rows (plan §4/§5). */
  onTriageInsight?: (item: InboxItem, action: TriageAction) => void;
  isSelected?: boolean;
  onSelect?: (id: string, selected: boolean) => void;
  isNew?: boolean;
  /** Prioritize mode: shrinks the status column and reveals per-row tier
   *  pills for setting `priority_due_at`. */
  prioritizeMode?: boolean;
  /** Snooze — fixed date/relative. Omitted (no button rendered) for views
   *  where snoozing doesn't make sense, e.g. the Snoozed view itself. */
  onSnooze?: (id: string, until: Date) => void;
  onSnoozeUntilNext1on1?: (id: string, teamMemberId: string) => Promise<{ ok: true } | { ok: false }>;
  /** Un-snooze — only relevant when rendering the Snoozed view. */
  onUnsnooze?: (id: string) => void;
  /** Keyboard-nav focus ring (Section 4) — a synthetic, app-level "current
   *  row" concept, distinct from :hover/:focus and from `isSelected`'s
   *  checkbox multi-select. */
  isFocused?: boolean;
}

// No entry for 'task' — task rows render no type icon (see below).
const TYPE_ICON: Partial<Record<InboxItem['type'], React.ReactNode>> = {
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

// Slate for a soft (decaying) tier tag — deliberately distinct from
// PRIORITY_DATE_COLOR (a hard due date) and from the rose used by workflow
// status's "Do Now" (an operational state, not a schedule). Shown even
// outside Prioritize mode so picking a tier leaves a visible trace.
const PRIORITY_SOFT_COLOR = '#64748b';
// A soft tier that has fully decayed reads as "now" — same urgency as Do Now,
// so it borrows that color, but only for this passive readout, never for a
// clickable "set to Do Now" control (see the tier pills below).
const PRIORITY_OVERDUE_COLOR = '#f43f5e';

// Source label for items auto-synced in by a DB trigger (meeting action items
// / 1:1 "for me" commitments — see src/types/inbox.ts's SourceRef doc
// comment). Generic on purpose: the meeting title / 1:1 counterpart's name
// isn't loaded onto InboxItem today, and adding a join just for this label
// isn't worth it for v1 — see PLAN_idea1_unified_funnel.md §6.1.
const SYNC_SOURCE_LABEL: Partial<Record<NonNullable<InboxItem['source_ref']>['type'], string>> = {
  meeting_action_item: 'From a meeting',
  cos_meeting_action: 'From a 1:1',
  gmail_message: 'From email',
};

const INTENT_BADGE: Record<string, { label: string; className: string }> = {
  question:        { label: 'Question',        className: 'bg-blue-50 text-blue-700 border-blue-200' },
  request:         { label: 'Request',         className: 'bg-amber-50 text-amber-700 border-amber-200' },
  introduction:    { label: 'Introduction',    className: 'bg-purple-50 text-purple-700 border-purple-200' },
  decision_needed: { label: 'Decision needed', className: 'bg-rose-50 text-rose-700 border-rose-200' },
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
  item, allTags, onArchive, onDelete, onRemoveTag, onAddTag,
  onCycleWorkflowStatus, onSetWorkflowStatus, onCreateWorkstream, onQuickCreateTag, onCreatePersonTag, teamMembers,
  onUpdateItem, onCtaClick, onOpenDrawer, onAcceptSuggestion, onDismissSuggestion, onTriageInsight,
  isSelected, onSelect, isNew, prioritizeMode,
  onSnooze, onSnoozeUntilNext1on1, onUnsnooze, isFocused,
}: InboxItemRowProps) {
  const [hovered, setHovered] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const isTouch = useIsTouch();
  const { toast } = useToast();
  const revealControls = hovered || isTouch;
  const isDone = item.status === 'done';
  const isSnoozed = item.status === 'snoozed';
  const { delegation, submitAnswer, approveStep, rejectStep, retryStep } = useInboxDelegation(item.id);
  // Person delegation (Idea #8) — only fetches when this row actually points
  // at an active delegation, so rows without one don't pay for the query.
  const { delegation: outgoingDelegation } = useOutgoingDelegation(
    item.active_delegation_id ? item.id : null,
  );
  // Delegatee-side: is this row itself a copy someone delegated to the
  // current user? Cheap no-op query (maybeSingle on an indexed column) when
  // it isn't.
  const incomingDelegation = useIncomingDelegationForItem(item.id);
  const personTags = allTags.filter(t => t.type === 'person');
  const snoozeLabel = isSnoozed ? formatSnoozeLabel(item, personTags.find(t => t.member_id === item.snooze_until_member_id)?.name ?? null) : null;

  const isAgentItem = ['agent_nudge', 'agent_question', 'meeting_insight', 'brief_item'].includes(item.type);
  // A fixed due date shows as a tag (see the Tags column below) so it survives
  // leaving Prioritize mode — it's not scoped to `prioritizeMode` like the tier
  // pills are.
  const fixedDueDate = item.priority_fixed && item.priority_due_at
    ? new Date(item.priority_due_at)
    : null;
  // The soft (decaying) tier, computed regardless of prioritizeMode so it can
  // render as a small always-visible tag (see the Tags column below) — a tier
  // pick otherwise left zero trace once you toggled Prioritize back off.
  const softTier = !item.priority_fixed ? currentPriorityTier(item.priority_due_at) : null;
  const activeTier = prioritizeMode ? softTier : null;
  const syncSourceLabel = item.source_ref ? SYNC_SOURCE_LABEL[item.source_ref.type] : undefined;

  // Tier pills are "loosey goosey" — the tier they read as decays over time.
  // Picking one always clears any fixed calendar date.
  const handleMarkHandled = useCallback(async () => {
    const payload = item.agent_payload as Record<string, unknown> | null;
    const senderEmail = payload?.sender_email as string | undefined;

    if (senderEmail || payload?.intent_type) {
      const domain = senderEmail ? senderEmail.split('@')[1] : undefined;
      const receivedAt = item.created_at ? new Date(item.created_at).getTime() : Date.now();
      const threadAgeHours = Math.round((Date.now() - receivedAt) / 3_600_000);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      await db.from('email_dismissal_log').insert({
        inbox_item_id: item.id,
        sender_email: senderEmail ?? null,
        sender_tier: payload?.sender_tier ?? null,
        intent_type: payload?.intent_type ?? null,
        sender_domain: domain ?? null,
        thread_age_hours: threadAgeHours,
      });

      // After 3 dismissals of the same sender, offer to suppress them.
      if (senderEmail) {
        const { count } = await db
          .from('email_dismissal_log')
          .select('id', { count: 'exact', head: true })
          .eq('sender_email', senderEmail);
        if ((count ?? 0) >= 3) {
          const senderName = (payload?.sender_name as string | undefined) ?? senderEmail;
          toast({
            title: `Often dismissing emails from ${senderName}?`,
            description: 'Hide them going forward so they never surface again.',
            action: (
              <ToastAction
                altText="Hide sender"
                onClick={async () => {
                  const { data: pref } = await db
                    .from('email_triage_preferences')
                    .select('suppressed_senders')
                    .maybeSingle();
                  const current: string[] = pref?.suppressed_senders ?? [];
                  if (!current.includes(senderEmail)) {
                    await db.from('email_triage_preferences').upsert({
                      suppressed_senders: [...current, senderEmail],
                      updated_at: new Date().toISOString(),
                    }, { onConflict: 'user_id' });
                  }
                }}
              >
                Hide
              </ToastAction>
            ),
          });
        }
      }
    }
    onArchive(item.id);
  }, [item, onArchive, toast]);

  const setTier = (tierKey: (typeof PRIORITY_TIERS)[number]['key']) => {
    onUpdateItem?.(item.id, { priority_due_at: computePriorityDueAt(tierKey), priority_fixed: false });
  };

  // The calendar picker sets a hard due date that does not decay.
  const setFixedDueDate = (date: Date | undefined) => {
    if (!date) return;
    onUpdateItem?.(item.id, { priority_due_at: date.toISOString(), priority_fixed: true });
    setDatePickerOpen(false);
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
        // Keyboard-nav focus ring — a synthetic "current row" indicator,
        // additive to (not a replacement for) native Tab-key accessibility.
        isFocused && 'ring-2 ring-inset ring-blue-400',
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className={cn(
        'grid items-start gap-3 py-2.5 min-h-[44px]',
        // Single column on mobile — text runs the full row width and every
        // other column (tags, status, pills) stacks underneath it instead of
        // being squeezed into a narrow percentage slot, which is what caused
        // pills/badges to overlap on small screens. Explicit percentage
        // tracks only kick in at `sm` and up, where each column has enough
        // room to actually hold its content: each gets a real, reserved
        // slot, so nothing can ever overlap regardless of how much text a
        // tag or status label holds or how many lines Tags wraps to. Column
        // boundaries: 45% / 75% normally; 45% / 70% / 77% in Prioritize mode
        // (Tags narrows slightly there to make room for Status + the tier
        // pills).
        'grid-cols-1',
        prioritizeMode ? 'sm:grid-cols-[45%_25%_7%_1fr]' : 'sm:grid-cols-[45%_30%_1fr]',
      )}>
        {/* Main content — checkbox, type icon, text, pin. */}
        <div className="flex items-center gap-3 min-w-0">
          {/* Multi-select checkbox — shown on hover/touch or when selected.
              This is the only checkbox-shaped control on the row; marking a
              task done happens via multi-select + the "Mark Done" bulk
              action, not a per-row checkmark, so there's nothing here to
              double up with. */}
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

          {/* Type icon — tasks show no icon at all (done state reads from
              the strikethrough/opacity on the text below), so this slot
              never renders a checkbox-shaped glyph next to the select
              checkbox above. */}
          {item.type !== 'task' && (
            <span
              className={cn('flex-shrink-0', isAgentItem ? 'text-gray-500' : 'text-gray-400')}
              // "Why am I seeing this" affordance for agent-generated nudges
              // (PLAN_idea4_agentic_followthrough.md, Section 5.3) — the
              // persistent caption below covers the short version; this
              // tooltip carries the full rationale on hover.
              title={item.type === 'agent_nudge' ? item.agent_payload?.rationale : undefined}
            >
              {/* Pre-1:1 person briefs (Idea #7) get a distinct icon from
                  daily/weekly briefs — both are type 'brief_item', and
                  without a visual difference they'd compete for attention
                  indistinguishably (see PLAN_idea7_relationship_memory.md §6). */}
              {item.type === 'brief_item' && item.agent_payload?.person_brief
                ? <Users className="h-4 w-4" />
                : TYPE_ICON[item.type]}
            </span>
          )}

          {/* Main text — editing happens only in the detail panel now, not
              inline here; clicking always opens the drawer. */}
          <button
            className="flex-1 flex flex-col items-start text-left text-sm min-w-0 break-words"
            onClick={() => onOpenDrawer?.(item)}
          >
            <span className={cn(isDone && 'line-through text-gray-400')}>
              {item.text}
            </span>
            {/* Persistent (not hover-only) provenance caption for agent
                nudges — answers "who generated this, why now" inline, per
                PLAN_idea4_agentic_followthrough.md Section 5.2. The fuller
                rationale is also available via the type icon's tooltip
                above (Section 5.3). */}
            {item.type === 'agent_nudge' && item.agent_payload?.rationale && (
              <span className="text-[11px] text-amber-700/70 mt-0.5">
                {item.agent_payload.rationale}
              </span>
            )}
          </button>

          {/* Pin indicator — right after text. Weekly priorities and daily
              check-ins are always pinned; other items can be pinned manually. */}
          {(item.pinned || isAutoPinnedItem(item)) && (
            <Pin className="h-3 w-3 flex-shrink-0 text-amber-400 rotate-45" />
          )}

          {/* Rename — hover-revealed on pointer devices, always visible on
              touch (mirrors InboxSidebar's TagItem rename affordance), since
              onDoubleClick above has no reliable touch equivalent and is
              preempted by the row's own tap-to-open onClick. */}
          {onUpdateItem && revealControls && (
            <button
              onClick={e => { e.stopPropagation(); startEditText(); }}
              title="Rename"
              className={cn(
                'flex-shrink-0 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors flex items-center justify-center',
                isTouch ? 'h-8 w-8' : 'p-0.5',
              )}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}

          {/* Person delegation (Idea #8, PLAN §8.3): persistent origin badge
              on items a colleague delegated to this user — always visible,
              not hover-only, since the point is a scannable paper trail. */}
          {incomingDelegation && (
            <FromBadge
              delegatorName={incomingDelegation.delegatorName}
              since={incomingDelegation.created_at}
              note={incomingDelegation.note}
            />
          )}

        </div>

        {/* Tags — its own grid column (45%-75%, or 45%-70% in Prioritize mode).
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
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium border border-dashed transition-all hover:opacity-90 hover:scale-105"
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
                className="opacity-0 group-hover/sug:opacity-100 p-0.5 rounded text-gray-400 hover:text-gray-600 transition-all flex-shrink-0"
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
          {/* Soft (decaying) tier — the informal-priority equivalent of the
              fixed-due-date tag above, so picking a tier pill in Prioritize
              mode leaves a visible trace once the mode is toggled back off.
              Slate normally; switches to the "overdue" rose once the picked
              tier has fully decayed (same urgency as workflow Do Now, but
              this is a readout, not a second way to set it). */}
          {softTier && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap"
              style={tagStyle(softTier === 'now' ? PRIORITY_OVERDUE_COLOR : PRIORITY_SOFT_COLOR)}
              title={softTier === 'now' ? 'Overdue — past its informal priority tier' : `Informal priority — due around ${format(new Date(item.priority_due_at!), 'MMM d')}`}
            >
              <Clock className="h-3 w-3" />
              {softTier === 'now' ? 'Overdue' : softTier}
            </span>
          )}
          {/* "View in recording" — meeting_insight only, links back to the
              source Zoom recording (plan §3/§9.2). Doesn't promise seeking to
              the exact quote timestamp — that deep-link isn't built yet. */}
          {item.type === 'meeting_insight' && item.source_ref?.recording_id && (
            <button
              onClick={e => { e.stopPropagation(); onOpenDrawer?.(item); }}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap border border-blue-200 text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors"
              title="Open the recording this quote is from"
            >
              <Video className="h-3 w-3" />
              View in recording
            </button>
          )}
          {/* Source chip — for items auto-synced in from a meeting, 1:1, or email. */}
          {syncSourceLabel && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap border border-gray-200 bg-gray-50 text-gray-500"
              title={syncSourceLabel}
            >
              {item.source_ref?.type === 'gmail_message' && <Mail className="h-3 w-3" />}
              {syncSourceLabel}
            </span>
          )}
          {/* Intent badge — email-sourced items only. */}
          {item.source_ref?.type === 'gmail_message' && item.agent_payload?.intent_type && (
            (() => {
              const badge = INTENT_BADGE[item.agent_payload.intent_type as string];
              return badge ? (
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap border ${badge.className}`}>
                  {badge.label}
                </span>
              ) : null;
            })()
          )}
          {/* Sender tier label — email-sourced items only. */}
          {item.source_ref?.type === 'gmail_message' && item.agent_payload?.sender_tier === 'active' && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap border border-emerald-200 bg-emerald-50 text-emerald-700">
              Active contact
            </span>
          )}
          {/* Tag picker — show on hover when tags exist, or always when no tags.
              Skipped for brief_item rows: they're auto-generated daily/weekly
              summaries, not taggable content, so the picker would just sit
              there as a suggestion that can never be acted on. */}
          {item.type !== 'brief_item' && (
            item.tags && item.tags.length > 0 ? (
              <span className={cn('transition-opacity', revealControls ? 'opacity-100' : 'opacity-0 pointer-events-none')}>
                <TagPickerDropdown
                  allTags={allTags}
                  itemTags={item.tags}
                  onSelectTags={tagIds => tagIds.forEach(tagId => onAddTag(item.id, tagId))}
                  onCreateTag={onQuickCreateTag}
                  teamMembers={teamMembers}
                  onCreatePersonTag={onCreatePersonTag}
                />
              </span>
            ) : (
              <TagPickerDropdown
                allTags={allTags}
                itemTags={item.tags ?? []}
                onSelectTags={tagIds => tagIds.forEach(tagId => onAddTag(item.id, tagId))}
                onCreateTag={onQuickCreateTag}
                teamMembers={teamMembers}
                onCreatePersonTag={onCreatePersonTag}
              />
            )
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
        <div className="flex items-center gap-1.5 justify-self-start min-w-0 overflow-hidden">
          {item.type !== 'brief_item' && (
            item.active_delegation_id && outgoingDelegation ? (
              // Person delegation (Idea #8, PLAN §8.3): a live delegation
              // replaces the generic cycle-through-statuses chip with a
              // named, timestamped badge — "Waiting on someone" only applies
              // to the self-referential case with no real delegatee.
              <WaitingOnBadge
                delegateeName={outgoingDelegation.delegateeName}
                since={outgoingDelegation.created_at}
                note={outgoingDelegation.note}
              />
            ) : (
              <Popover open={statusOpen} onOpenChange={setStatusOpen}>
                <PopoverTrigger asChild>
                  <button
                    onClick={e => e.stopPropagation()}
                    className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-medium whitespace-nowrap transition-opacity hover:opacity-75 max-w-full truncate',
                      !item.workflow_status && 'border-dashed border-gray-300 text-gray-400',
                    )}
                    style={item.workflow_status ? tagStyle(WORKFLOW_STATUS_COLORS[item.workflow_status]) : undefined}
                  >
                    {item.workflow_status ? WORKFLOW_STATUS_LABELS[item.workflow_status] : 'Set status'}
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-44 p-1"
                  align="start"
                  onClick={e => e.stopPropagation()}
                >
                  {WORKFLOW_CYCLE.map(status => (
                    <button
                      key={status}
                      onClick={() => { onSetWorkflowStatus(item.id, status); setStatusOpen(false); }}
                      className={cn(
                        'w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left hover:bg-gray-100 transition-colors',
                        item.workflow_status === status && 'font-semibold',
                      )}
                    >
                      <span
                        className="h-2 w-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: WORKFLOW_STATUS_COLORS[status] }}
                      />
                      {status}
                      {item.workflow_status === status && (
                        <Check className="h-3 w-3 ml-auto text-gray-500" />
                      )}
                    </button>
                  ))}
                  {item.workflow_status && (
                    <>
                      <div className="my-1 border-t border-gray-100" />
                      <button
                        onClick={() => { onSetWorkflowStatus(item.id, null); setStatusOpen(false); }}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left text-gray-400 hover:bg-gray-100 transition-colors"
                      >
                        <X className="h-3 w-3" />
                        Clear status
                      </button>
                    </>
                  )}
                </PopoverContent>
              </Popover>
            )
          )}

          {/* Snooze — moved after Status (last column) so the row reads
              left-to-right as content → status → snooze, rather than
              splitting snooze off next to the text. Hover-revealed; hidden
              once an item is already snoozed (see the chip + unsnooze
              button below instead). */}
          {!isSnoozed && onSnooze && revealControls && (
            <SnoozePopover
              personTags={personTags}
              teamMembers={teamMembers}
              onSnooze={until => onSnooze(item.id, until)}
              onSnoozeUntilNext1on1={async memberId => {
                if (!onSnoozeUntilNext1on1) return false;
                const result = await onSnoozeUntilNext1on1(item.id, memberId);
                return result.ok;
              }}
              trigger={
                <button
                  onClick={e => e.stopPropagation()}
                  title="Snooze"
                  className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <Clock className="h-3.5 w-3.5" />
                </button>
              }
            />
          )}

          {/* Snoozed-until chip + unsnooze — only ever shown in the Snoozed view. */}
          {isSnoozed && snoozeLabel && (
            <span
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0',
                snoozeLabel.stale ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-gray-100 text-gray-500',
              )}
            >
              <Clock className="h-3 w-3" />
              {snoozeLabel.text}
              {onUnsnooze && (
                <button
                  onClick={e => { e.stopPropagation(); onUnsnooze(item.id); }}
                  title="Bring back to inbox now"
                  className="ml-0.5 hover:text-gray-800"
                >
                  <RotateCcw className="h-3 w-3" />
                </button>
              )}
            </span>
          )}
        </div>

        {/* Prioritize mode — per-row tier pills for setting the informal due
            date. Its own grid column (the 4th track), right after Status.
            No pill sets "now" directly — that's what workflow Status's Do Now
            is for (a manual, always-visible operational state). These tiers
            are purely deferral ("push N days/weeks"); a picked tier decaying
            past its threshold reads as overdue automatically (the indicator
            below), not by user action. Keeps the two urgency signals from
            overlapping: Status says "handle this now", tiers say "resurface
            this by then". */}
        {prioritizeMode && (
          <div className="flex flex-wrap items-center gap-1 justify-self-start">
            {activeTier === 'now' && (
              <span
                title="Overdue — past its informal priority tier. Use Status → Do Now if this needs to jump the queue instead."
                className="flex-shrink-0 flex items-center justify-center h-5 w-5 rounded-full bg-rose-100 text-rose-600"
              >
                <Clock className="h-3 w-3" />
              </span>
            )}
            {PRIORITY_TIERS.filter(tier => tier.key !== 'now').map(tier => {
              const active = activeTier === tier.key;
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
                      : 'border-gray-200 text-gray-400 hover:text-gray-700 hover:border-gray-300',
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

        {/* Agent CTA — always the last grid column, right-aligned within it. */}
        {item.type === 'agent_question' && item.agent_payload?.action_required && (
          item.source_ref?.type === 'gmail_message' ? (
            <div style={{ gridColumn: '-1' }} className="justify-self-end flex items-center gap-1">
              <a
                href={item.agent_payload.gmail_url as string ?? 'https://mail.google.com'}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
              >
                <ExternalLink className="h-3 w-3" />
                Reply in Gmail
              </a>
              <button
                onClick={e => { e.stopPropagation(); void handleMarkHandled(); }}
                className="px-2.5 py-1 text-xs rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
              >
                Mark handled
              </button>
            </div>
          ) : (
            <button
              onClick={() => (onCtaClick ?? onOpenDrawer)?.(item)}
              style={{ gridColumn: '-1' }}
              className="justify-self-end px-2.5 py-1 text-xs rounded-md bg-violet-100 text-violet-700 hover:bg-violet-200 transition-colors"
            >
              {item.agent_payload.cta_label ?? 'Respond'}
            </button>
          )
        )}

        {/* Meeting-insight triage — Confirm/Save/Dismiss, same CTA slot as the
            agent_question button above (mutually exclusive by type, so no
            layout conflict). Only while the insight hasn't been triaged yet. */}
        {item.type === 'meeting_insight' && item.status === 'open' && onTriageInsight && (
          <div
            style={{ gridColumn: '-1' }}
            className="justify-self-end flex items-center gap-1"
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={e => { e.stopPropagation(); onTriageInsight(item, 'confirm'); }}
                  aria-label="Confirm — turn into a task"
                  className="flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors"
                >
                  <ThumbsUp className="h-3 w-3" />
                  <span className="hidden sm:inline">Confirm</span>
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-[220px] text-xs">
                Turns this into a task on your list. The original quote stays linked so you can always trace it back to the meeting.
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={e => { e.stopPropagation(); onTriageInsight(item, 'save'); }}
                  aria-label="Save as a note"
                  className="flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
                >
                  <BookmarkPlus className="h-3 w-3" />
                  <span className="hidden sm:inline">Save</span>
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-[220px] text-xs">
                Keeps the full quote as a note — no follow-up expected, just saved for reference.
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={e => { e.stopPropagation(); onTriageInsight(item, 'dismiss'); }}
                  aria-label="Dismiss"
                  className="flex items-center gap-1 px-2 py-1 text-xs rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                >
                  <XCircle className="h-3 w-3" />
                  <span className="hidden sm:inline">Dismiss</span>
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-[220px] text-xs">
                Not useful? Dismiss it — this just clears it from your inbox, nothing is held against you and it won't come back.
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>

      {/* Delegation status — stays inline */}
      {delegation && delegation.status !== 'done' && delegation.status !== 'cancelled' && (
        <DelegationStatusRow
          delegation={delegation}
          onAnswer={submitAnswer}
          onApproveStep={approveStep}
          onRejectStep={rejectStep}
          onRetryStep={retryStep}
        />
      )}

      {/* Divider */}
      <div className="border-b border-gray-100" />
    </div>
  );
}
