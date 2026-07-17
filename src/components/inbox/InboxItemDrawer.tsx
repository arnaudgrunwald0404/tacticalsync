import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { X, Hash, Tag, Info, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WORKFLOW_STATUS_LABELS, WORKFLOW_STATUS_COLORS, WORKFLOW_CYCLE, tagStyle } from '@/lib/inboxValidation';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { InboxTagPill } from './InboxTagPill';
import { BriefItemDetail } from './BriefItemDetail';
import { PersonBriefDetail } from './PersonBriefDetail';
import { getSourceLink, isSyncedSourceRef } from '@/hooks/useInboxItems';
import type { InboxItem, InboxTag, BriefPriority } from '@/types/inbox';

interface InboxItemDrawerProps {
  item: InboxItem | null;
  allTags: InboxTag[];
  onClose: () => void;
  onCycleWorkflowStatus: (id: string, current: string | null) => void;
  onSetWorkflowStatus: (id: string, status: string | null) => void;
  onRemoveTag: (itemId: string, tagId: string) => void;
  onAddTag: (itemId: string, tagId: string) => void;
  onCreateWorkstream: (parentId: string, name: string) => Promise<InboxTag | null>;
  onUpdateItem?: (id: string, patch: Partial<InboxItem>) => Promise<void>;
}

const WORKFLOW_STYLES: Record<string, string> = {
  'Do Now':             'bg-rose-100 text-rose-700 hover:bg-rose-200',
  'Not started':        'bg-gray-100 text-gray-500 hover:bg-gray-200',
  'Work in progress':   'bg-amber-100 text-amber-700 hover:bg-amber-200',
  'Waiting on someone': 'bg-blue-100 text-blue-700 hover:bg-blue-200',
  'Blocked':            'bg-red-100 text-red-700 hover:bg-red-200',
};

export function InboxItemDrawer({
  item, allTags, onClose, onCycleWorkflowStatus, onSetWorkflowStatus, onRemoveTag, onAddTag,
  onCreateWorkstream, onUpdateItem,
}: InboxItemDrawerProps) {
  const [textDraft, setTextDraft] = useState('');
  const [editingText, setEditingText] = useState(false);
  const [bodyDraft, setBodyDraft] = useState('');
  const [editingBody, setEditingBody] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);

  useEffect(() => {
    setTextDraft(item?.text ?? '');
    setEditingText(false);
    setBodyDraft(item?.body ?? '');
    setEditingBody(false);
  }, [item?.id]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const open = !!item;

  const commitEditText = async () => {
    if (!item) return;
    const trimmed = textDraft.trim();
    setEditingText(false);
    if (trimmed && trimmed !== item.text) {
      await onUpdateItem?.(item.id, { text: trimmed });
    } else {
      setTextDraft(item.text);
    }
  };

  return (
    <div
      className={cn(
        'flex-shrink-0 border-l border-gray-200 bg-white flex flex-col overflow-hidden transition-all duration-200 ease-in-out',
        open ? 'w-80' : 'w-0 border-l-0',
      )}
    >
      {item && (
        <>
          {/* Header — editing lives only here (and in the desktop detail
              panel), not inline in the main list, so it's a full multi-row
              field. Brief items are auto-generated summaries, not editable. */}
          <div className="flex items-start gap-2 px-4 pt-4 pb-3 border-b border-gray-100 flex-shrink-0">
            {item.type !== 'brief_item' ? (
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
                  className="flex-1 text-sm font-medium text-gray-900 bg-white rounded-lg border border-gray-300 px-2 py-1 -mx-2 -my-1 outline-none focus:ring-1 focus:ring-gray-300 resize-none leading-snug"
                />
              ) : (
                <button
                  onClick={() => setEditingText(true)}
                  className="flex-1 text-left text-sm font-medium text-gray-900 leading-snug hover:bg-gray-50 rounded-lg px-2 py-1 -mx-2 -my-1 transition-colors"
                >
                  {item.text}
                </button>
              )
            ) : (
              <p className="flex-1 text-sm font-medium text-gray-900 leading-snug">{item.text}</p>
            )}
            <button
              onClick={onClose}
              className="flex-shrink-0 p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors mt-0.5"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5">
            {/* Brief item: daily/weekly priorities */}
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
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-dashed border-gray-300 text-xs text-gray-500">
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
                {item.source_ref && (() => {
                  const link = getSourceLink(item.source_ref);
                  const synced = isSyncedSourceRef(item.source_ref);
                  return (
                    <li className="flex items-center gap-1">
                      {link ? (
                        <Link to={link.href} title={link.label} className="underline hover:text-gray-600">
                          {link.label}
                        </Link>
                      ) : (
                        <span>From {item.source_ref.type.replace('_', ' ')}</span>
                      )}
                      {synced && (
                        <span
                          title="Synced from a meeting or 1:1 — completing it here keeps it in sync there, but editing the text here does not update the original."
                        >
                          <Info className="h-3 w-3 flex-shrink-0 text-gray-400" />
                        </span>
                      )}
                    </li>
                  );
                })()}
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
