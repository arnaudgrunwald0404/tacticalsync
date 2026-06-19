import React, { useState } from 'react';
import { Users, ChevronDown, ChevronRight, Plus, X, Slack, Video, Mail, Pencil, Check } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useGroupMeetings, type GroupMeeting, type GroupMeetingSource } from '@/hooks/useGroupMeetings';

function initials(nameOrEmail: string): string {
  const base = nameOrEmail.includes('@') ? nameOrEmail.split('@')[0] : nameOrEmail;
  const parts = base.replace(/[._-]+/g, ' ').trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || base.slice(0, 2).toUpperCase();
}

const SOURCE_ICON: Record<GroupMeetingSource['source_type'], React.ComponentType<{ className?: string }>> = {
  slack_channel: Slack,
  zoom: Video,
  email: Mail,
};

function SourceChips({
  meeting,
  onAdd,
  onRemove,
  onToggle,
}: {
  meeting: GroupMeeting;
  onAdd: (type: GroupMeetingSource['source_type'], ref: string) => void;
  onRemove: (id: string) => void;
  onToggle: (id: string, enabled: boolean) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {meeting.sources.length === 0 && (
        <span className="text-[11px] text-muted-foreground">No context sources yet.</span>
      )}
      {meeting.sources.map(s => {
        const Icon = SOURCE_ICON[s.source_type];
        return (
          <Badge
            key={s.id}
            variant="outline"
            className={cn(
              'gap-1 cursor-pointer select-none',
              s.enabled ? 'bg-accent/40' : 'opacity-50',
            )}
            onClick={() => onToggle(s.id, !s.enabled)}
            title={s.enabled ? 'Click to mute this source' : 'Click to use this source'}
          >
            <Icon className="h-3 w-3" />
            <span className="text-xs">{s.label ?? s.ref}</span>
            <button
              className="ml-0.5 rounded-full hover:bg-muted"
              onClick={e => { e.stopPropagation(); onRemove(s.id); }}
            >
              <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
            </button>
          </Badge>
        );
      })}
      {adding ? (
        <div className="flex items-center gap-1">
          <Input
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="#channel or topic"
            className="h-7 w-40 text-xs"
            onKeyDown={e => {
              if (e.key === 'Enter' && draft.trim()) {
                const ref = draft.trim();
                onAdd(ref.startsWith('#') ? 'slack_channel' : 'zoom', ref);
                setDraft('');
                setAdding(false);
              } else if (e.key === 'Escape') {
                setAdding(false);
                setDraft('');
              }
            }}
          />
        </div>
      ) : (
        <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-[11px]" onClick={() => setAdding(true)}>
          <Plus className="h-3 w-3" /> Add source
        </Button>
      )}
    </div>
  );
}

function Roster({ meeting }: { meeting: GroupMeeting }) {
  const shown = meeting.participants.slice(0, 8);
  const extra = meeting.participants.length - shown.length;
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {shown.map(p => {
        const label = p.name ?? p.email ?? '?';
        return (
          <span
            key={p.id}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]',
              p.team_member_id ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-muted/50',
            )}
            title={p.team_member_id ? `${label} (tracked)` : `${label} (not tracked)`}
          >
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-background text-[9px] font-semibold">
              {initials(label)}
            </span>
            {p.name ?? p.email}
          </span>
        );
      })}
      {extra > 0 && <span className="text-[11px] text-muted-foreground">+{extra} more</span>}
    </div>
  );
}

function MeetingRow({
  meeting,
  hook,
  onOpenPrep,
}: {
  meeting: GroupMeeting;
  hook: ReturnType<typeof useGroupMeetings>;
  onOpenPrep?: (m: GroupMeeting) => void;
}) {
  const [editingSubject, setEditingSubject] = useState(false);
  const [subjectDraft, setSubjectDraft] = useState(meeting.subject ?? meeting.title);

  const handleInclude = async (checked: boolean) => {
    await hook.setIncluded(meeting.id, checked);
    if (checked) hook.suggestSources({ ...meeting, included: true });
  };

  return (
    <div className="rounded-lg border p-3 space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {editingSubject ? (
            <div className="flex items-center gap-1">
              <Input
                autoFocus
                value={subjectDraft}
                onChange={e => setSubjectDraft(e.target.value)}
                className="h-7 text-sm"
                onKeyDown={e => {
                  if (e.key === 'Enter') { hook.updateSubject(meeting.id, subjectDraft.trim() || meeting.title); setEditingSubject(false); }
                  else if (e.key === 'Escape') { setSubjectDraft(meeting.subject ?? meeting.title); setEditingSubject(false); }
                }}
              />
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { hook.updateSubject(meeting.id, subjectDraft.trim() || meeting.title); setEditingSubject(false); }}>
                <Check className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-sm truncate">{meeting.subject ?? meeting.title}</span>
              {meeting.included && (
                <button className="text-muted-foreground hover:text-foreground" onClick={() => setEditingSubject(true)} title="Edit subject">
                  <Pencil className="h-3 w-3" />
                </button>
              )}
            </div>
          )}
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
            {meeting.subject && meeting.subject !== meeting.title && <span className="truncate">from “{meeting.title}”</span>}
            {meeting.cadence && <span>· {meeting.cadence}</span>}
            <span>· {meeting.participants.length} people</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {meeting.included && onOpenPrep && (
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onOpenPrep(meeting)}>
              Open prep
            </Button>
          )}
          <Switch checked={meeting.included} onCheckedChange={handleInclude} aria-label="Include meeting" />
        </div>
      </div>

      <Roster meeting={meeting} />

      {meeting.included && (
        <SourceChips
          meeting={meeting}
          onAdd={(type, ref) => hook.addSource(meeting.id, type, ref)}
          onRemove={hook.removeSource}
          onToggle={hook.toggleSource}
        />
      )}
    </div>
  );
}

// Shared management surface for recurring group meetings. Rendered in both
// Settings (Calendar panel) and the 1:1s tab. Pass `heading` to wrap the list
// in its own titled section (used in the 1:1s tab); omit it when an enclosing
// card already supplies the title (used in Settings).
export default function GroupMeetingsManager({
  onOpenPrep,
  defaultShowDiscovered = true,
  heading,
  hideWhenEmpty = false,
}: {
  onOpenPrep?: (m: GroupMeeting) => void;
  defaultShowDiscovered?: boolean;
  heading?: string;
  hideWhenEmpty?: boolean;
}) {
  const hook = useGroupMeetings();
  const [showDiscovered, setShowDiscovered] = useState(defaultShowDiscovered);

  if (hook.loading) return null;

  if (hook.meetings.length === 0) {
    if (hideWhenEmpty) return null;
    return (
      <p className="text-sm text-muted-foreground">
        No recurring group meetings discovered yet. Sync your calendar — meetings with three or more
        people will appear here for you to include.
      </p>
    );
  }

  const body = (
    <div className="space-y-4">
      {hook.included.length > 0 && (
        <div className="space-y-2">
          {hook.included.map(m => (
            <MeetingRow key={m.id} meeting={m} hook={hook} onOpenPrep={onOpenPrep} />
          ))}
        </div>
      )}

      {hook.discovered.length > 0 && (
        <div className="space-y-2">
          <button
            className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground"
            onClick={() => setShowDiscovered(v => !v)}
          >
            {showDiscovered ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            <Users className="h-3.5 w-3.5" />
            Discovered group meetings ({hook.discovered.length})
          </button>
          {showDiscovered && (
            <div className="space-y-2">
              {hook.discovered.map(m => (
                <MeetingRow key={m.id} meeting={m} hook={hook} onOpenPrep={onOpenPrep} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (!heading) return body;

  return (
    <section className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Users className="h-4 w-4 text-primary" />
        <span className="font-semibold text-sm">{heading}</span>
        <Badge variant="secondary" className="text-[10px]">{hook.included.length}</Badge>
      </div>
      <div className="px-4 py-3">{body}</div>
    </section>
  );
}
