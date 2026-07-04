import { useState, useEffect } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { InboxTag, ProjectSettings } from '@/types/inbox';

interface ProjectSettingsPanelProps {
  tag: InboxTag;
  onClose: () => void;
  onSave: (tagId: string, settings: ProjectSettings, name: string) => Promise<void>;
  onDelete?: (tagId: string) => Promise<void>;
}

function StringListEditor({
  label, placeholder, values, onChange,
}: {
  label: string;
  placeholder: string;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const [draft, setDraft] = useState('');

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && !values.includes(trimmed)) onChange([...values, trimmed]);
    setDraft('');
  };

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400">{label}</p>
      <div className="space-y-1">
        {values.map((v, i) => (
          <div key={i} className="flex items-center gap-1.5 group">
            <span className="flex-1 text-xs text-gray-700 bg-gray-50 rounded px-2 py-1 truncate">{v}</span>
            <button
              onClick={() => onChange(values.filter((_, j) => j !== i))}
              className="flex-shrink-0 opacity-0 group-hover:opacity-100 p-0.5 rounded text-gray-400 hover:text-red-500 transition-all"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
        <div className="flex items-center gap-1">
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder={placeholder}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } if (e.key === 'Escape') setDraft(''); }}
            className="flex-1 text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-blue-300 placeholder-gray-400"
          />
          <button
            onClick={commit}
            disabled={!draft.trim()}
            className="flex-shrink-0 p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-30 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function ProjectSettingsPanel({ tag, onClose, onSave, onDelete }: ProjectSettingsPanelProps) {
  const s = tag.settings ?? {};
  const [name, setName] = useState(tag.name);
  const [description, setDescription] = useState(s.description ?? '');
  const [stakeholders, setStakeholders] = useState<string[]>(s.stakeholders ?? []);
  const [slackChannels, setSlackChannels] = useState<string[]>(s.slack_channels ?? []);
  const [meetings, setMeetings] = useState<string[]>(s.recurring_meetings ?? []);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Reset when tag changes
  useEffect(() => {
    const s = tag.settings ?? {};
    setName(tag.name);
    setDescription(s.description ?? '');
    setStakeholders(s.stakeholders ?? []);
    setSlackChannels(s.slack_channels ?? []);
    setMeetings(s.recurring_meetings ?? []);
    setDirty(false);
  }, [tag.id]);

  // Mark dirty on any change
  useEffect(() => { setDirty(true); }, [name, description, stakeholders, slackChannels, meetings]);

  const handleSave = async () => {
    setSaving(true);
    await onSave(tag.id, { description, stakeholders, slack_channels: slackChannels, recurring_meetings: meetings }, name);
    setSaving(false);
    setDirty(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 flex-shrink-0">
        <span
          className="h-2.5 w-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: tag.color }}
        />
        <span className="flex-1 text-sm font-semibold text-gray-900 truncate">{tag.name}</span>
        <button
          onClick={onClose}
          className="flex-shrink-0 p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {/* Name */}
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400">Name</p>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
            className="w-full text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded px-2.5 py-2 outline-none focus:ring-1 focus:ring-blue-300"
          />
        </div>

        {tag.type !== 'folder' && (
          <>
            {/* Description */}
            <div className="space-y-1.5">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400">Description</p>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="What is this project? What's the goal? Any important context the agent should know…"
                rows={5}
                className="w-full text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded px-2.5 py-2 outline-none focus:ring-1 focus:ring-blue-300 placeholder-gray-400 resize-none leading-relaxed"
              />
            </div>

            <StringListEditor
              label="Key Stakeholders"
              placeholder="Add name or role…"
              values={stakeholders}
              onChange={v => setStakeholders(v)}
            />

            <StringListEditor
              label="Slack Channels"
              placeholder="Add channel (e.g. #project-x)…"
              values={slackChannels}
              onChange={v => setSlackChannels(v)}
            />

            <StringListEditor
              label="Recurring Meetings"
              placeholder="Add meeting name…"
              values={meetings}
              onChange={v => setMeetings(v)}
            />
          </>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-100 flex-shrink-0 space-y-2">
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          className={cn(
            'w-full py-2 rounded-lg text-sm font-medium transition-colors',
            dirty && !saving
              ? 'bg-gray-900 text-white hover:bg-gray-700'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed',
          )}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>

        {onDelete && !confirmDelete && (
          <button
            onClick={() => setConfirmDelete(true)}
            className="w-full py-2 rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 transition-colors"
          >
            Delete
          </button>
        )}

        {onDelete && confirmDelete && (
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmDelete(false)}
              className="flex-1 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={async () => { await onDelete(tag.id); onClose(); }}
              className="flex-1 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors"
            >
              Confirm delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
