import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { X, Tag, Minimize2, History, Cpu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-breakpoint';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { InboxTagPill } from './InboxTagPill';
import { BriefItemDetail } from './BriefItemDetail';
import { AgentBar } from './AgentBar';
import type { InboxItem, InboxTag, BriefPriority, InboxItemType } from '@/types/inbox';

const SUGGESTIONS = [
  "What needs my attention today?",
  "Summarize unread items",
  "Show me what's overdue",
  "Find items I'm waiting on",
];

const WORKFLOW_STYLES: Record<string, string> = {
  'Not started':        'bg-gray-100 text-gray-500 hover:bg-gray-200',
  'Work in progress':   'bg-amber-100 text-amber-700 hover:bg-amber-200',
  'Waiting on someone': 'bg-blue-100 text-blue-700 hover:bg-blue-200',
  'Blocked':            'bg-red-100 text-red-700 hover:bg-red-200',
};

interface InboxAssistantPanelProps {
  item: InboxItem | null;
  allTags: InboxTag[];
  userName?: string;
  onClose: () => void;
  onCycleWorkflowStatus: (id: string, current: string | null) => void;
  onRemoveTag: (itemId: string, tagId: string) => void;
  onAddTag: (itemId: string, tagId: string) => void;
  onCreateWorkstream: (parentId: string, name: string) => Promise<InboxTag | null>;
  onUpdateItem?: (id: string, patch: Partial<InboxItem>) => Promise<void>;
  onAddItem: (text: string, type: InboxItemType, tagIds: string[]) => Promise<void>;
  onCreateTag: (name: string, type: 'project' | 'person', color: string) => Promise<InboxTag | null>;
}

// ── Default state ─────────────────────────────────────────────────────────────

function DefaultState({ userName, onSuggestion }: { userName?: string; onSuggestion: (s: string) => void }) {
  const first = userName?.split(' ')[0];
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-5 gap-5">
      <div className="h-14 w-14 rounded-full bg-gray-100 flex items-center justify-center">
        <Cpu className="h-7 w-7 text-gray-400" />
      </div>
      <div className="text-center space-y-1">
        <p className="font-semibold text-gray-900 text-base">
          {first ? `What's up next, ${first}?` : "What's up next?"}
        </p>
        <p className="text-xs text-gray-400">Here are some things I can help with</p>
      </div>
      <div className="grid grid-cols-2 gap-2 w-full">
        {SUGGESTIONS.map(s => (
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
  );
}

// ── Item detail ───────────────────────────────────────────────────────────────

function ItemDetail({
  item, allTags, onClose, onCycleWorkflowStatus, onRemoveTag, onAddTag,
  onCreateWorkstream, onUpdateItem,
}: {
  item: InboxItem;
  allTags: InboxTag[];
  onClose: () => void;
  onCycleWorkflowStatus: (id: string, current: string | null) => void;
  onRemoveTag: (itemId: string, tagId: string) => void;
  onAddTag: (itemId: string, tagId: string) => void;
  onCreateWorkstream: (parentId: string, name: string) => Promise<InboxTag | null>;
  onUpdateItem?: (id: string, patch: Partial<InboxItem>) => Promise<void>;
}) {
  const [bodyDraft, setBodyDraft] = useState('');
  const [editingBody, setEditingBody] = useState(false);

  useEffect(() => {
    setBodyDraft(item.body ?? '');
    setEditingBody(false);
  }, [item.id]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5">
      {/* Brief item: priorities */}
      {item.type === 'brief_item' && item.agent_payload?.brief_priorities && (
        <BriefItemDetail
          priorities={item.agent_payload.brief_priorities}
          briefDate={item.agent_payload.brief_date ?? item.created_at.slice(0, 10)}
          onSave={async (priorities: BriefPriority[]) => {
            await onUpdateItem?.(item.id, {
              agent_payload: { ...item.agent_payload, brief_priorities: priorities },
            } as Partial<InboxItem>);
          }}
        />
      )}

      {/* Workflow status */}
      {item.type !== 'brief_item' && (
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400">Status</p>
          <button
            onClick={() => onCycleWorkflowStatus(item.id, item.workflow_status ?? null)}
            className={cn(
              'px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors',
              item.workflow_status
                ? WORKFLOW_STYLES[item.workflow_status]
                : 'bg-gray-100 text-gray-400 hover:bg-gray-200',
            )}
          >
            {item.workflow_status ?? 'Set status'}
          </button>
        </div>
      )}

      {/* Tags */}
      <div className="space-y-1.5">
        <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400">Tags</p>
        <div className="flex flex-wrap gap-1">
          {item.tags?.map(tag => {
            const childWorkstreams = allTags.filter(t => t.type === 'workstream' && t.parent_id === tag.id);
            return (
              <InboxTagPill
                key={tag.id}
                tag={tag}
                size="xs"
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
          <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400">Notes</p>
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
          <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400">Context</p>
          <p className="text-xs text-gray-500 italic leading-relaxed">{item.agent_payload.rationale}</p>
        </div>
      )}

      {/* History */}
      <div className="space-y-1.5">
        <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400">History</p>
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
  item, allTags, userName, onClose, onCycleWorkflowStatus, onRemoveTag, onAddTag,
  onCreateWorkstream, onUpdateItem, onAddItem, onCreateTag,
}: InboxAssistantPanelProps) {
  const [inputValue, setInputValue] = useState('');
  const isMobile = useIsMobile();

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
              <SheetTitle className="text-sm font-medium text-gray-900 truncate">{item?.text}</SheetTitle>
            </div>
            {item && (
              <ItemDetail
                item={item}
                allTags={allTags}
                onClose={onClose}
                onCycleWorkflowStatus={onCycleWorkflowStatus}
                onRemoveTag={onRemoveTag}
                onAddTag={onAddTag}
                onCreateWorkstream={onCreateWorkstream}
                onUpdateItem={onUpdateItem}
              />
            )}
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <div className="w-80 flex-shrink-0 bg-white rounded-xl shadow-sm border border-gray-200/80 flex flex-col overflow-hidden">
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
                <p className="flex-1 text-sm font-medium text-gray-900 truncate">{item.text}</p>
                <button
                  onClick={onClose}
                  className="flex-shrink-0 p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </>
            ) : (
              <>
                <span className="text-sm font-semibold text-gray-900 flex-1">Assistant</span>
                <button className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                  <Minimize2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

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
            />
          ) : (
            <DefaultState
              userName={userName}
              onSuggestion={s => setInputValue(s)}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Bottom bar */}
      <div className="flex-shrink-0 border-t border-gray-100">
        <AgentBar tags={allTags} onSubmit={onAddItem} onCreateTag={onCreateTag} />
        <div className="flex items-center gap-3 px-4 py-2">
          <button className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-gray-600 transition-colors">
            <History className="h-3 w-3" />History
          </button>
          <button className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-gray-600 transition-colors">
            <Cpu className="h-3 w-3" />Select Agent
          </button>
        </div>
      </div>
    </div>
  );
}
