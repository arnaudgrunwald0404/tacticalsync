import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { X, Tag, Bot, ArrowUp, Loader2, Sparkles, CheckSquare, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-breakpoint';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { InboxTagPill } from './InboxTagPill';
import { ChatBubble } from './ChatBubble';
import { AssistantChatPanel, type AssistantChatMsg } from './AssistantChatPanel';
import { DelegationChatView } from './DelegationChatView';
import { BriefItemDetail } from './BriefItemDetail';
import { PersonBriefDetail } from './PersonBriefDetail';
import { AgentBar } from './AgentBar';
import { ProjectSettingsPanel } from './ProjectSettingsPanel';
import { PersonContextWidget } from './PersonContextWidget';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { WORKFLOW_STATUS_COLORS, WORKFLOW_STATUS_LABELS, WORKFLOW_CYCLE, tagStyle } from '@/lib/inboxValidation';
import type { InboxItem, InboxTag, BriefPriority, InboxItemType, ProjectSettings } from '@/types/inbox';
import type { UpcomingOneOnOneEvent } from '@/components/cos/OneOnOnesView';

const SUGGESTIONS = [
  "Help me set up TacticalSync",
  "What needs my attention today?",
  "Summarize unread items",
  "Show me what's overdue",
  "Find items I'm waiting on",
];

interface ChatMsg { id: string; role: 'user' | 'agent'; text: string }

const MEETING_CHIPS = ["What's overdue?", 'Recap the last meeting', 'What should I cover?', "What's their top priority?"];

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function MeetingChatPanel({ event }: { event: UpcomingOneOnOneEvent }) {
  const member = event.team_member;
  const name = member?.name ?? event.attendee_name ?? event.attendee_email ?? 'Unknown';
  const firstName = name.split(' ')[0];
  const isGroup = !member;

  const [chat, setChat] = useState<ChatMsg[]>([{
    id: 'a0',
    role: 'agent',
    text: isGroup
      ? `I'm ready to help with ${name}. Ask me about open action items, past decisions, or what to cover.`
      : `Hi — ask me anything about ${firstName}, the last 1:1, or what's still open.`,
  }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [chat]);

  const send = async (raw?: string) => {
    const q = (raw ?? input).trim();
    if (!q || loading) return;
    setInput('');
    setChat(prev => [...prev, { id: 'u' + Date.now(), role: 'user', text: q }]);
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const body = member
        ? { team_member_id: member.id, question: q }
        : { group_meeting_id: (event as any).group_meeting_id, question: q }; // eslint-disable-line @typescript-eslint/no-explicit-any
      const res = await fetch(`${supabaseUrl}/functions/v1/query-relationship-history`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as { answer: string };
      setChat(prev => [...prev, { id: 'a' + Date.now(), role: 'agent', text: data.answer }]);
    } catch (err) {
      setChat(prev => [...prev, {
        id: 'a' + Date.now(), role: 'agent',
        text: `Sorry — I couldn't reach your meeting history. ${err instanceof Error ? err.message : ''}`.trim(),
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {/* Person / group header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-gray-50/60 flex-shrink-0">
        <div className="w-9 h-9 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
          {initials(name)}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{name}</p>
          <p className="text-[11px] text-gray-400">{isGroup ? 'Group meeting context' : '1:1 context'}</p>
        </div>
      </div>

      {/* Chat messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto flex flex-col gap-3 px-4 py-4">
        {chat.map(msg => (
          <ChatBubble key={msg.id} role={msg.role}>{msg.text}</ChatBubble>
        ))}
        {loading && (
          <div className="flex gap-2 items-center text-gray-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span className="text-xs">Searching history…</span>
          </div>
        )}
      </div>

      {/* Quick chips */}
      <div className="px-4 pb-2 flex gap-1.5 flex-wrap">
        {MEETING_CHIPS.map((s, i) => (
          <button
            key={i}
            onClick={() => send(s)}
            disabled={loading}
            className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full border border-gray-200 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50 text-gray-600"
          >
            <Sparkles className="h-2.5 w-2.5 text-blue-500" />{s}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="flex-shrink-0 flex items-end gap-2 px-4 py-3 border-t border-gray-100">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          rows={1}
          placeholder={`Ask about ${firstName}…`}
          className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-300 resize-none max-h-[80px]"
        />
        <Button
          size="icon"
          className="h-9 w-9 rounded-xl flex-shrink-0"
          disabled={!input.trim() || loading}
          onClick={() => send()}
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

interface InboxAssistantPanelProps {
  item: InboxItem | null;
  meetingEvent?: UpcomingOneOnOneEvent | null;
  allTags: InboxTag[];
  userName?: string;
  onClose: () => void;
  onCycleWorkflowStatus: (id: string, current: string | null) => void;
  onSetWorkflowStatus: (id: string, status: string | null) => void;
  onRemoveTag: (itemId: string, tagId: string) => void;
  onAddTag: (itemId: string, tagId: string) => void;
  onCreateWorkstream: (parentId: string, name: string) => Promise<InboxTag | null>;
  onUpdateItem?: (id: string, patch: Partial<InboxItem>) => Promise<void>;
  /** Marks the open item done/not-done — the only way to complete an item from
   *  this detail view (the row-level checkbox was removed in favor of the
   *  bulk-select "Mark Done" action; this covers the single-item case). */
  onItemDone?: (id: string, done: boolean) => void;
  onAddItem: (text: string, type: InboxItemType, tagIds: string[]) => Promise<void>;
  onCreateTag: (name: string, type: 'project' | 'person', color: string) => Promise<InboxTag | null>;
  projectTag?: InboxTag | null;
  onCloseProject?: () => void;
  onSaveProjectSettings?: (tagId: string, settings: ProjectSettings, name: string) => Promise<void>;
  onDeleteProjectTag?: (tagId: string) => Promise<void>;
  onConvertFolderToProject?: (tagId: string) => Promise<void>;
  onSetTagPosition?: (tagId: string, groupType: 'folder' | 'project', newPosition: number) => Promise<void>;
  stakeholderOptions?: string[];
  slackChannelOptions?: string[];
  meetingOptions?: string[];
  /** The person tag currently selected in the left sidebar's People section, if any. */
  selectedPersonTag?: InboxTag | null;
  /** Navigates to /inbox/person/:memberId — the "View person page" entry
   *  point from the person context widget (PLAN_idea7_relationship_memory.md §2.1). */
  onViewPersonPage?: (memberId: string) => void;
  userId?: string | null;
  /** True when this account has never had any inbox items — swaps the default
   *  panel greeting from a returning-user framing ("what's up next") to a
   *  first-visit welcome. */
  isNewUser?: boolean;
  onMaterializeOnboarding: (items: { text: string }[]) => Promise<void>;
  /** Called after a chat turn that ran an action tool (e.g. generated a brief). */
  onMutated: () => void;
}

// ── Default state ─────────────────────────────────────────────────────────────

function DefaultState({
  userName, isNewUser, onSuggestion,
}: {
  userName?: string;
  isNewUser?: boolean;
  onSuggestion: (s: string) => void;
}) {
  const first = userName?.split(' ')[0];
  const [setup, ...rest] = SUGGESTIONS;
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-5 gap-5">
      <div className="h-14 w-14 rounded-full bg-gray-100 flex items-center justify-center">
        <Bot className="h-7 w-7 text-gray-400" />
      </div>
      <div className="text-center space-y-1">
        <p className="font-semibold text-gray-900 text-base">
          {isNewUser
            ? (first ? `Welcome, ${first}` : 'Welcome to TacticalSync')
            : (first ? `What's up next, ${first}?` : "What's up next?")}
        </p>
        <p className="text-xs text-gray-400">
          {isNewUser
            ? "Record a conversation and I'll turn it into tracked follow-ups — or let's get you set up"
            : 'Here are some things I can help with'}
        </p>
      </div>
      <div className="w-full space-y-2">
        <button
          onClick={() => onSuggestion(setup)}
          className="w-full flex items-center gap-2 text-left p-3 rounded-xl border border-violet-200 bg-violet-50 text-xs font-medium text-violet-700 hover:bg-violet-100 hover:border-violet-300 transition-colors leading-snug"
        >
          <Sparkles className="h-3.5 w-3.5 flex-shrink-0" />{setup}
        </button>
        <div className="grid grid-cols-2 gap-2">
          {rest.map(s => (
            <button
              key={s}
              onClick={() => onSuggestion(s)}
              className="text-left p-3 rounded-xl border border-gray-200 text-xs text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors leading-snug"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Item detail ───────────────────────────────────────────────────────────────

function ItemDetail({
  item, allTags, onClose, onCycleWorkflowStatus, onSetWorkflowStatus, onRemoveTag, onAddTag,
  onCreateWorkstream, onUpdateItem, onItemDone,
}: {
  item: InboxItem;
  allTags: InboxTag[];
  onClose: () => void;
  onCycleWorkflowStatus: (id: string, current: string | null) => void;
  onSetWorkflowStatus: (id: string, status: string | null) => void;
  onRemoveTag: (itemId: string, tagId: string) => void;
  onAddTag: (itemId: string, tagId: string) => void;
  onCreateWorkstream: (parentId: string, name: string) => Promise<InboxTag | null>;
  onUpdateItem?: (id: string, patch: Partial<InboxItem>) => Promise<void>;
  onItemDone?: (id: string, done: boolean) => void;
}) {
  const [textDraft, setTextDraft] = useState(item.text);
  const [editingText, setEditingText] = useState(false);
  const [bodyDraft, setBodyDraft] = useState('');
  const [editingBody, setEditingBody] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const isDone = item.status === 'done';

  useEffect(() => {
    setTextDraft(item.text);
    setEditingText(false);
    setBodyDraft(item.body ?? '');
    setEditingBody(false);
  }, [item.id]);

  const commitEditText = async () => {
    const trimmed = textDraft.trim();
    setEditingText(false);
    if (trimmed && trimmed !== item.text) {
      await onUpdateItem?.(item.id, { text: trimmed });
    } else {
      setTextDraft(item.text);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5">
      {/* Item text — editing lives only here (and in the mobile drawer), not
          inline in the main list, so it's a full multi-row field rather than
          the single-line input the list used to swap in. Brief items are
          auto-generated summaries, not user-editable, same as the Done
          toggle below. */}
      {item.type !== 'brief_item' && (
        editingText ? (
          <textarea
            autoFocus
            value={textDraft}
            onChange={e => setTextDraft(e.target.value)}
            onBlur={commitEditText}
            onKeyDown={e => {
              if (e.key === 'Escape') { e.preventDefault(); setEditingText(false); setTextDraft(item.text); }
            }}
            rows={2}
            className="w-full text-sm font-medium text-gray-900 bg-white rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-1 focus:ring-gray-300 resize-none leading-snug"
          />
        ) : (
          <button
            onClick={() => setEditingText(true)}
            className={cn(
              'w-full text-left text-sm font-medium rounded-lg px-3 py-2 -mx-3 hover:bg-gray-50 transition-colors leading-snug',
              isDone ? 'line-through text-gray-400' : 'text-gray-900',
            )}
          >
            {item.text}
          </button>
        )
      )}

      {/* Done toggle — the only way to complete an item from this view; brief
          items are auto-generated summaries, not user-completable. */}
      {item.type !== 'brief_item' && onItemDone && (
        <button
          onClick={() => onItemDone(item.id, !isDone)}
          className={cn(
            'w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors',
            isDone
              ? 'border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
          )}
        >
          <CheckSquare className="h-4 w-4" />
          {isDone ? 'Done — undo' : 'Mark done'}
        </button>
      )}

      {/* Active delegation — renders as a chat thread when this item was delegated to the Assistant */}
      <DelegationChatView itemId={item.id} />

      {/* Brief item: daily/weekly priorities */}
      {item.type === 'brief_item' && item.agent_payload?.brief_priorities && (
        <BriefItemDetail
          priorities={item.agent_payload.brief_priorities}
          briefDate={item.agent_payload.brief_date ?? item.created_at.slice(0, 10)}
          kind={item.agent_payload.brief_kind ?? 'daily'}
          onSave={async (priorities: BriefPriority[]) => {
            await onUpdateItem?.(item.id, {
              agent_payload: { ...item.agent_payload, brief_priorities: priorities },
            } as Partial<InboxItem>);
          }}
        />
      )}

      {/* Brief item: pre-1:1 person brief (Idea #7) */}
      {item.type === 'brief_item' && item.agent_payload?.person_brief && (
        <PersonBriefDetail brief={item.agent_payload.person_brief} />
      )}

      {/* Workflow status */}
      {item.type !== 'brief_item' && (
        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">Status</p>
          <Popover open={statusOpen} onOpenChange={setStatusOpen}>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  'px-2.5 py-0.5 rounded-full border text-xs font-medium transition-opacity hover:opacity-75',
                  !item.workflow_status && 'border-dashed border-gray-300 text-gray-400',
                )}
                style={item.workflow_status ? tagStyle(WORKFLOW_STATUS_COLORS[item.workflow_status]) : undefined}
              >
                {item.workflow_status ? WORKFLOW_STATUS_LABELS[item.workflow_status] : 'Set status'}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-1" align="start">
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
        </div>
      )}

      {/* Tags */}
      <div className="space-y-1.5">
        <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">Tags</p>
        <div className="flex flex-wrap gap-1">
          {item.tags?.filter(tag => tag.type !== 'workstream').map(tag => {
            const attachedWorkstream = item.tags?.find(t => t.type === 'workstream' && t.parent_id === tag.id);
            const childWorkstreams = allTags.filter(t => t.type === 'workstream' && t.parent_id === tag.id);
            return (
              <InboxTagPill
                key={tag.id}
                tag={tag}
                size="xs"
                workstreamSuffix={attachedWorkstream?.name}
                onRemove={() => onRemoveTag(item.id, tag.id)}
                workstreams={['project', 'person', 'folder'].includes(tag.type) ? childWorkstreams : undefined}
                onSelectWorkstream={ws => onAddTag(item.id, ws.id)}
                onCreateWorkstream={async name => {
                  const ws = await onCreateWorkstream(tag.id, name);
                  if (ws) onAddTag(item.id, ws.id);
                }}
              />
            );
          })}
          {(!item.tags || item.tags.length === 0) && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-dashed border-gray-300 text-[10px] text-gray-400">
              <Tag className="h-2.5 w-2.5" />No tags
            </span>
          )}
        </div>
      </div>

      {/* Notes */}
      {item.type !== 'brief_item' && (
        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">Notes</p>
          {editingBody ? (
            <textarea
              autoFocus
              value={bodyDraft}
              onChange={e => setBodyDraft(e.target.value)}
              onBlur={async () => {
                setEditingBody(false);
                if (bodyDraft !== (item.body ?? '')) {
                  await onUpdateItem?.(item.id, { body: bodyDraft } as Partial<InboxItem>);
                }
              }}
              onKeyDown={e => { if (e.key === 'Escape') { setEditingBody(false); setBodyDraft(item.body ?? ''); } }}
              rows={4}
              placeholder="Add notes…"
              className="w-full text-sm text-gray-700 bg-gray-50 rounded-lg border border-gray-200 px-3 py-2 outline-none focus:ring-1 focus:ring-gray-300 resize-none"
            />
          ) : (
            <button
              onClick={() => setEditingBody(true)}
              className="w-full text-left text-sm text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg px-3 py-2 transition-colors min-h-[60px]"
            >
              {item.body || <span className="text-gray-400">Add notes…</span>}
            </button>
          )}
        </div>
      )}

      {/* Agent rationale */}
      {item.agent_payload?.rationale && (
        <div className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">Context</p>
          <p className="text-xs text-gray-500 italic leading-relaxed">{item.agent_payload.rationale}</p>
        </div>
      )}

      {/* History */}
      <div className="space-y-1.5">
        <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">History</p>
        <ul className="text-xs text-gray-400 space-y-1">
          <li>Created {formatDistanceToNow(new Date(item.created_at))} ago</li>
          {item.updated_at !== item.created_at && (
            <li>Last updated {formatDistanceToNow(new Date(item.updated_at))} ago</li>
          )}
          {item.source_ref && (
            <li>From {item.source_ref.type.replace('_', ' ')}</li>
          )}
        </ul>
      </div>
    </div>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export function InboxAssistantPanel({
  item, allTags, userName, onClose, onCycleWorkflowStatus, onSetWorkflowStatus, onRemoveTag, onAddTag,
  onCreateWorkstream, onUpdateItem, onItemDone, onAddItem, onCreateTag,
  projectTag, onCloseProject, onSaveProjectSettings, onDeleteProjectTag, onConvertFolderToProject,
  onSetTagPosition,
  stakeholderOptions, slackChannelOptions, meetingOptions,
  meetingEvent, selectedPersonTag, onViewPersonPage, userId, isNewUser,
  onMaterializeOnboarding, onMutated,
}: InboxAssistantPanelProps) {
  const isMobile = useIsMobile();

  // ── Item title rename — click-to-edit (not double-click, so it works on
  //    touch), shared between the mobile Sheet header and the desktop header
  //    below since both render the same item.text.
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  useEffect(() => {
    setEditingTitle(false);
  }, [item?.id]);

  const startEditTitle = () => {
    if (!item) return;
    setTitleDraft(item.text);
    setEditingTitle(true);
  };

  const commitEditTitle = async () => {
    setEditingTitle(false);
    const trimmed = titleDraft.trim();
    if (item && trimmed && trimmed !== item.text) {
      await onUpdateItem?.(item.id, { text: trimmed } as Partial<InboxItem>);
    }
  };

  // ── Assistant chat (the "no item selected" home view) ─────────────────────
  const [chatMessages, setChatMessages] = useState<AssistantChatMsg[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatHistoryRef = useRef<AssistantChatMsg[]>([]);
  chatHistoryRef.current = chatMessages;

  const sendChatMessage = async (rawText: string, mentionTagIds: string[], webSearch?: boolean) => {
    const text = rawText.trim();
    if (!text || chatLoading) return;
    const mentions = mentionTagIds.map(id => allTags.find(t => t.id === id)).filter((t): t is InboxTag => !!t);
    const userMsg: AssistantChatMsg = { id: 'u' + Date.now(), role: 'user', text };
    const history = [...chatHistoryRef.current, userMsg];
    setChatMessages(history);
    setChatLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/inbox-assistant-chat`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history.map(m => ({ role: m.role === 'agent' ? 'assistant' : 'user', content: m.text })),
          mentions: mentions.map(t => ({ id: t.id, name: t.name, type: t.type, memberId: t.member_id ?? undefined })),
          webSearch: !!webSearch,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.message ?? err.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as {
        reply: string; proposedItems?: { text: string }[]; mutated?: boolean;
        actions?: ('connect_calendar' | 'connect_zoom')[];
      };
      setChatMessages(prev => [...prev, {
        id: 'a' + Date.now(), role: 'agent', text: data.reply,
        proposedItems: data.proposedItems, actions: data.actions,
      }]);
      if (data.mutated) onMutated();
    } catch (err) {
      setChatMessages(prev => [...prev, {
        id: 'a' + Date.now(), role: 'agent',
        text: `Sorry — I ran into a problem. ${err instanceof Error ? err.message : ''}`.trim(),
      }]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleAddChatItems = (msgId: string, items: { text: string }[]) => {
    setChatMessages(prev => prev.map(m => m.id === msgId ? { ...m, itemsAdded: true } : m));
    void onMaterializeOnboarding(items);
  };

  // Task/Note mode still create real items via onAddItem; "Assistant" mode
  // (agent_nudge) from this home view routes into the chat instead.
  const composerSubmit = async (text: string, type: InboxItemType, tagIds: string[], webSearch?: boolean) => {
    if (!item && !meetingEvent && !projectTag && type === 'agent_nudge') {
      await sendChatMessage(text, tagIds, webSearch);
      return;
    }
    await onAddItem(text, type, tagIds);
  };

  // Close on Escape when item is open
  useEffect(() => {
    if (!item) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [item, onClose]);

  // ── Mobile: the composer docks to the bottom of the screen, and tapping an
  //    item opens its detail in a full-height sheet instead of a side column.
  if (isMobile) {
    return (
      <>
        <div
          className="fixed inset-x-0 bottom-0 z-30 bg-white border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          <AgentBar tags={allTags} onSubmit={onAddItem} onCreateTag={onCreateTag} />
        </div>

        <Sheet open={!!item} onOpenChange={(open) => { if (!open) onClose(); }}>
          <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col gap-0">
            <div className="flex items-center gap-2 px-4 py-3 pr-12 border-b border-gray-100 flex-shrink-0">
              {editingTitle ? (
                <input
                  autoFocus
                  value={titleDraft}
                  onChange={e => setTitleDraft(e.target.value)}
                  onBlur={commitEditTitle}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); commitEditTitle(); }
                    if (e.key === 'Escape') { e.preventDefault(); setEditingTitle(false); }
                  }}
                  className="flex-1 text-sm font-medium text-gray-900 outline-none bg-white ring-1 ring-blue-300 rounded px-1 -mx-1"
                />
              ) : (
                <SheetTitle
                  onClick={startEditTitle}
                  className="text-sm font-medium text-gray-900 truncate cursor-text"
                >
                  {item?.text}
                </SheetTitle>
              )}
            </div>
            {item && (
              <ItemDetail
                item={item}
                allTags={allTags}
                onClose={onClose}
                onCycleWorkflowStatus={onCycleWorkflowStatus}
                onSetWorkflowStatus={onSetWorkflowStatus}
                onRemoveTag={onRemoveTag}
                onAddTag={onAddTag}
                onCreateWorkstream={onCreateWorkstream}
                onUpdateItem={onUpdateItem}
                onItemDone={onItemDone}
              />
            )}
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <div className="w-80 flex-shrink-0 bg-white rounded-xl shadow-sm border border-gray-200/80 flex flex-col overflow-hidden">
      {/* Project settings mode — takes over the whole panel */}
      {projectTag && onSaveProjectSettings ? (
        <ProjectSettingsPanel
          tag={projectTag}
          allTags={allTags}
          onClose={onCloseProject ?? (() => {})}
          onSave={onSaveProjectSettings}
          onDelete={onDeleteProjectTag}
          onConvertToProject={onConvertFolderToProject}
          onSetPosition={onSetTagPosition}
          stakeholderOptions={stakeholderOptions}
          slackChannelOptions={slackChannelOptions}
          meetingOptions={meetingOptions}
        />
      ) : meetingEvent ? (
        // Meeting mode — chat panel focused on this 1:1 or group meeting
        <>
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 flex-shrink-0">
            <span className="text-sm font-semibold text-gray-900 flex-1">Meeting Assistant</span>
          </div>
          <MeetingChatPanel event={meetingEvent} />
        </>
      ) : (
        <>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 flex-shrink-0 min-h-[48px] overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={item?.id ?? 'header-default'}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.14, ease: 'easeOut' }}
            className="flex items-center gap-2 w-full min-w-0"
          >
            {item ? (
              <>
                {editingTitle ? (
                  <input
                    autoFocus
                    value={titleDraft}
                    onChange={e => setTitleDraft(e.target.value)}
                    onBlur={commitEditTitle}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); commitEditTitle(); }
                      if (e.key === 'Escape') { e.preventDefault(); setEditingTitle(false); }
                    }}
                    className="flex-1 text-sm font-medium text-gray-900 outline-none bg-white ring-1 ring-blue-300 rounded px-1 -mx-1"
                  />
                ) : (
                  <p
                    onClick={startEditTitle}
                    className="flex-1 text-sm font-medium text-gray-900 truncate cursor-text"
                  >
                    {item.text}
                  </p>
                )}
                <button
                  onClick={onClose}
                  aria-label="Close item detail"
                  className="flex-shrink-0 p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </>
            ) : (
              <>
                <Bot className="h-4 w-4 flex-shrink-0 text-gray-400" />
                <span className="text-sm font-semibold text-gray-900 flex-1">Assistant</span>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Person context widget — shown when a person is selected in the left sidebar */}
      {selectedPersonTag?.member_id && (
        <PersonContextWidget
          userId={userId ?? null}
          memberId={selectedPersonTag.member_id}
          memberName={selectedPersonTag.name}
          color={selectedPersonTag.color}
          onViewPersonPage={onViewPersonPage}
        />
      )}

      {/* Body — animates when item changes */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={item?.id ?? 'default'}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
          className="flex-1 min-h-0 flex flex-col overflow-hidden"
        >
          {item ? (
            <ItemDetail
              item={item}
              allTags={allTags}
              onClose={onClose}
              onCycleWorkflowStatus={onCycleWorkflowStatus}
              onRemoveTag={onRemoveTag}
              onAddTag={onAddTag}
              onCreateWorkstream={onCreateWorkstream}
              onUpdateItem={onUpdateItem}
              onItemDone={onItemDone}
            />
          ) : chatMessages.length > 0 ? (
            <AssistantChatPanel
              messages={chatMessages}
              loading={chatLoading}
              onAddItems={handleAddChatItems}
            />
          ) : (
            <DefaultState
              userName={userName}
              isNewUser={isNewUser}
              onSuggestion={s => void sendChatMessage(s, [])}
            />
          )}
        </motion.div>
      </AnimatePresence>
        </>
      )}

      {/* Bottom bar — hidden in project settings mode */}
      {!projectTag && (
        <div className="flex-shrink-0 border-t border-gray-100">
          <AgentBar tags={allTags} onSubmit={composerSubmit} onCreateTag={onCreateTag} />
        </div>
      )}
    </div>
  );
}
