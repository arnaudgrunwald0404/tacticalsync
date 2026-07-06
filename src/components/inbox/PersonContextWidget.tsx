import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DEFAULT_STATUS_OPTIONS } from '@/types/cos';
import {
  usePersonAccountabilitiesTopics,
  type PersonAccountability,
  type PersonTopic,
} from '@/hooks/usePersonAccountabilitiesTopics';

const STATUS_BADGE_COLORS = [
  'bg-blue-100 text-blue-800 border-blue-200',
  'bg-amber-100 text-amber-800 border-amber-200',
  'bg-green-100 text-green-800 border-green-200',
];

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function AccountabilityRow({ item, onUpdate, onDelete }: {
  item: PersonAccountability;
  onUpdate: (id: string, text: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(item.text === '');
  const [text, setText] = useState(item.text);

  const save = () => {
    const trimmed = text.trim();
    if (trimmed) onUpdate(item.id, trimmed);
    else onDelete(item.id);
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-1.5 group/row py-0.5">
      {editing ? (
        <>
          <input
            autoFocus
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') save();
              if (e.key === 'Escape') { setText(item.text); setEditing(false); }
            }}
            onBlur={save}
            className="flex-1 text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-gray-300"
          />
        </>
      ) : (
        <>
          <span className="text-gray-400 text-sm flex-shrink-0">•</span>
          <button
            onClick={() => setEditing(true)}
            className="flex-1 text-left text-sm text-gray-700 hover:text-gray-900 transition-colors leading-snug truncate"
          >
            {item.text}
          </button>
          <button
            onClick={() => onDelete(item.id)}
            className="p-0.5 text-gray-300 hover:text-red-500 opacity-0 group-hover/row:opacity-100 transition-opacity flex-shrink-0"
            aria-label="Delete accountability"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </>
      )}
    </div>
  );
}

function TopicRow({ topic, onUpdate, onDelete }: {
  topic: PersonTopic;
  onUpdate: (id: string, updates: Partial<Pick<PersonTopic, 'text' | 'status'>>) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(topic.text === '');
  const [text, setText] = useState(topic.text);

  const save = () => {
    const trimmed = text.trim();
    if (trimmed) onUpdate(topic.id, { text: trimmed });
    else onDelete(topic.id);
    setEditing(false);
  };

  const cycleStatus = () => {
    const idx = topic.status ? DEFAULT_STATUS_OPTIONS.indexOf(topic.status) : -1;
    const next = idx < DEFAULT_STATUS_OPTIONS.length - 1 ? DEFAULT_STATUS_OPTIONS[idx + 1] : null;
    onUpdate(topic.id, { status: next });
  };
  const statusIdx = topic.status ? DEFAULT_STATUS_OPTIONS.indexOf(topic.status) : -1;
  const statusColor = statusIdx >= 0 ? STATUS_BADGE_COLORS[statusIdx % STATUS_BADGE_COLORS.length] : null;

  return (
    <div className="flex items-center gap-1.5 group/row py-0.5">
      {editing ? (
        <input
          autoFocus
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') { setText(topic.text); setEditing(false); }
          }}
          onBlur={save}
          className="flex-1 text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-gray-300"
        />
      ) : (
        <>
          <button
            onClick={() => setEditing(true)}
            className="flex-1 text-left text-sm text-gray-700 hover:text-gray-900 transition-colors leading-snug truncate"
          >
            {topic.text}
          </button>
          <button
            onClick={cycleStatus}
            title={topic.status ? `Status: ${topic.status} — click to advance` : 'Click to set status'}
            className={cn(
              'text-[11px] font-medium h-5 min-w-[20px] px-1 rounded border flex-shrink-0 transition-colors',
              statusColor ?? 'bg-gray-50 text-gray-400 border-gray-200 hover:bg-gray-100',
            )}
          >
            {topic.status ?? '·'}
          </button>
          <button
            onClick={() => onDelete(topic.id)}
            className="p-0.5 text-gray-300 hover:text-red-500 opacity-0 group-hover/row:opacity-100 transition-opacity flex-shrink-0"
            aria-label="Delete topic"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </>
      )}
    </div>
  );
}

interface PersonContextWidgetProps {
  userId: string | null;
  memberId: string;
  memberName: string;
  color?: string;
}

export function PersonContextWidget({ userId, memberId, memberName, color }: PersonContextWidgetProps) {
  const {
    accountabilities, topics,
    addAccountability, updateAccountability, deleteAccountability,
    addTopic, updateTopic, deleteTopic,
  } = usePersonAccountabilitiesTopics(userId, memberId);

  return (
    <div className="flex-shrink-0 border-b border-gray-100 max-h-[45vh] overflow-y-auto">
      {/* Person header */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <span
          className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
          style={{ backgroundColor: color ?? '#6366f1' }}
        >
          {initials(memberName)}
        </span>
        <span className="text-sm font-semibold text-gray-900 truncate">{memberName}</span>
      </div>

      <div className="px-4 pb-3 space-y-3">
        {/* Accountabilities */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Accountabilities</h4>
            <button
              onClick={() => addAccountability()}
              className="flex items-center gap-0.5 text-xs text-gray-400 hover:text-gray-700 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />Add
            </button>
          </div>
          <div className="space-y-0.5">
            {accountabilities.map(a => (
              <AccountabilityRow key={a.id} item={a} onUpdate={updateAccountability} onDelete={deleteAccountability} />
            ))}
            {accountabilities.length === 0 && (
              <p className="text-xs text-gray-400 italic py-0.5">None yet</p>
            )}
          </div>
        </div>

        {/* Discussion topics */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Discussion Topics</h4>
              {topics.length > 0 && (
                <span className="text-[10px] font-semibold text-white bg-slate-500 rounded-full h-4 min-w-[16px] px-1 flex items-center justify-center">
                  {topics.length}
                </span>
              )}
            </div>
            <button
              onClick={() => addTopic()}
              className="flex items-center gap-0.5 text-xs text-gray-400 hover:text-gray-700 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />Add
            </button>
          </div>
          <div className="space-y-0.5">
            {topics.map(t => (
              <TopicRow key={t.id} topic={t} onUpdate={updateTopic} onDelete={deleteTopic} />
            ))}
            {topics.length === 0 && (
              <p className="text-xs text-gray-400 italic py-0.5">None yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
