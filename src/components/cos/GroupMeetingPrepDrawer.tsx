import React, { useEffect, useMemo, useState } from 'react';
import {
  X, RefreshCw, Sparkles, Loader2, Users, Repeat, Calendar, Slack, Video, Mail,
  ListChecks, Plus, UserPlus, ChevronDown,
} from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import * as SheetPrimitive from '@radix-ui/react-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { parseLocalDate } from '@/lib/dateUtils';
import { parsePrepMarkdown } from '@/components/cos/OneOnOnePrepDrawer';
import type { GroupMeeting, GroupMeetingSource } from '@/hooks/useGroupMeetings';

// The cos_* tables aren't in the generated Supabase types (CoS module convention).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

// Derive initials from a name or email — mirrors GroupMeetingsManager.
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtShort(iso: string): string {
  const d = parseLocalDate(iso);
  return d ? `${MONTHS[d.getMonth()]} ${d.getDate()}` : iso;
}

interface GroupAction {
  id: string;
  text: string;
  due_date: string | null;
  owner: 'them' | 'me';
  member_id: string | null;
}

interface GroupPrepDrawerProps {
  open: boolean;
  meeting: GroupMeeting | null;
  content: string;
  generatedAt: string;
  generating?: boolean;
  onClose: () => void;
  onRefresh: () => void;
  /** Refetch the meeting list (after promoting an untracked participant). */
  onMeetingChanged?: () => void;
}

// Subject-centric prep drawer for recurring group meetings. Distinct from the
// 1:1 drawer: the brief is a shared agenda about the meeting's subject, and
// action items are assigned to tracked participants (or "Me").
export function GroupMeetingPrepDrawer({
  open, meeting, content, generatedAt, generating,
  onClose, onRefresh, onMeetingChanged,
}: GroupPrepDrawerProps) {
  const { toast } = useToast();

  const [actions, setActions] = useState<GroupAction[]>([]);
  const [actionText, setActionText] = useState('');
  // Assignee: 'me' or a tracked team_member_id.
  const [assignee, setAssignee] = useState<string>('me');
  const [adding, setAdding] = useState(false);
  const [promotingId, setPromotingId] = useState<string | null>(null);

  const subject = meeting?.subject?.trim() || meeting?.title || '';
  const topics = useMemo(() => parsePrepMarkdown(content), [content]);

  // Tracked participants are assignable; untracked must be promoted first.
  const trackedParticipants = useMemo(
    () => (meeting?.participants ?? []).filter(p => p.team_member_id),
    [meeting],
  );
  const untrackedParticipants = useMemo(
    () => (meeting?.participants ?? []).filter(p => !p.team_member_id),
    [meeting],
  );

  const nameForMember = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of meeting?.participants ?? []) {
      if (p.team_member_id) map.set(p.team_member_id, p.name ?? p.email ?? 'Participant');
    }
    return map;
  }, [meeting]);

  // Load open action items for this meeting whenever it opens.
  useEffect(() => {
    if (!open || !meeting) return;
    setActionText('');
    setAssignee('me');
    sb.from('cos_meeting_actions')
      .select('id, text, due_date, owner, member_id')
      .eq('group_meeting_id', meeting.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .then(({ data }: { data: GroupAction[] | null }) => setActions(data ?? []));
  }, [open, meeting]);

  if (!meeting) return null;

  const addAction = async () => {
    const text = actionText.trim();
    if (!text) return;
    setAdding(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in');
      const owner = assignee === 'me' ? 'me' : 'them';
      const member_id = assignee === 'me' ? null : assignee;
      const { data, error } = await sb
        .from('cos_meeting_actions')
        .insert({
          user_id: user.id,
          group_meeting_id: meeting.id,
          member_id,
          owner,
          text,
          status: 'pending',
        })
        .select('id, text, due_date, owner, member_id')
        .single();
      if (error) throw error;
      setActions(prev => [data as GroupAction, ...prev]);
      setActionText('');
    } catch (err) {
      toast({ title: 'Could not add action', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setAdding(false);
    }
  };

  const toggleDone = async (id: string) => {
    setActions(prev => prev.filter(a => a.id !== id));
    await sb.from('cos_meeting_actions').update({ status: 'done' }).eq('id', id);
  };

  // Promote an untracked attendee into a tracked team member, then link the
  // participant row so they become assignable.
  const promoteParticipant = async (participantId: string, name: string | null, email: string | null) => {
    setPromotingId(participantId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in');
      const memberName = (name && !name.includes('@'))
        ? name
        : (email?.split('@')[0] ?? name ?? 'Unknown');
      const { data: inserted, error } = await sb
        .from('cos_team_members')
        .insert({ user_id: user.id, name: memberName, role: '', relationship_type: 'collaborator', email })
        .select('id')
        .single();
      if (error) throw error;
      await sb
        .from('cos_group_meeting_participants')
        .update({ team_member_id: inserted.id })
        .eq('id', participantId);
      toast({ title: `${memberName} added to your team` });
      onMeetingChanged?.();
    } catch (err) {
      toast({ title: 'Could not add team member', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setPromotingId(null);
    }
  };

  const assigneeLabel = assignee === 'me' ? 'Me' : (nameForMember.get(assignee) ?? 'Participant');
  const enabledSources = meeting.sources.filter(s => s.enabled);

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent
        side="right"
        className="w-screen sm:max-w-full inset-0 p-0 border-0 flex flex-col gap-0 [&>button]:hidden bg-background"
      >
        <SheetPrimitive.Title className="sr-only">{subject} — Group meeting prep</SheetPrimitive.Title>

        {/* ===== HEADER ===== */}
        <header className="flex-shrink-0 px-7 pt-[18px] pb-4 border-b border-border/60">
          <div className="flex items-start gap-4">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
              <Users className="h-7 w-7" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="font-heading font-bold text-[23px] tracking-[-0.02em] leading-none truncate">{subject}</h1>
              <div className="flex items-center gap-[18px] mt-[9px] text-[13px] text-muted-foreground flex-wrap">
                {meeting.subject && meeting.subject !== meeting.title && (
                  <span className="truncate">from “{meeting.title}”</span>
                )}
                {meeting.cadence && (
                  <span className="inline-flex items-center gap-1.5"><Repeat className="h-[15px] w-[15px]" />{meeting.cadence}</span>
                )}
                {meeting.next_start_at && (
                  <span className="inline-flex items-center gap-1.5"><Calendar className="h-[15px] w-[15px]" />{fmtShort(meeting.next_start_at)}</span>
                )}
                <span className="inline-flex items-center gap-1.5"><Users className="h-[15px] w-[15px]" />{meeting.participants.length} people</span>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button size="sm" variant="secondary" className="h-9 gap-1.5" disabled={generating} onClick={onRefresh}>
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {generating ? 'Generating…' : 'Refresh brief'}
              </Button>
              <div className="w-px h-6 bg-border mx-0.5" />
              <button onClick={onClose} aria-label="Close" className="h-[34px] w-[34px] grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* roster */}
          <div className="flex items-center gap-1.5 flex-wrap mt-3.5">
            {meeting.participants.map(p => {
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
          </div>
        </header>

        {/* ===== BODY ===== */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-[1280px] mx-auto px-7 pt-[22px] pb-10 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_344px] gap-6 items-start">

            {/* LEFT — the brief */}
            <div className="flex flex-col gap-4 min-w-0">
              <div className="flex gap-3.5 px-5 py-[17px] rounded-lg bg-accent/50 border border-border/70">
                <span className="w-[34px] h-[34px] flex-shrink-0 rounded-[9px] bg-card grid place-items-center shadow-sm">
                  <Sparkles className="h-[19px] w-[19px] text-primary" />
                </span>
                <div className="flex-1 min-w-0 text-[13px] text-muted-foreground leading-relaxed">
                  Shared agenda for <span className="font-medium text-foreground">{subject}</span>, drawn from this meeting's bound context sources.
                  {content && <span className="block mt-0.5 text-[11.5px]">Generated {fmtShort(generatedAt.slice(0, 10))}</span>}
                </div>
              </div>

              {generating && !content ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground px-1 py-8">
                  <Loader2 className="h-4 w-4 animate-spin" /> Generating brief…
                </div>
              ) : topics.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">
                  No brief yet. Click “Refresh brief” to generate one from this meeting's sources.
                </div>
              ) : (
                topics.map((t, i) => (
                  <div key={i} className="rounded-lg border border-border bg-card px-5 py-4">
                    <h3 className="font-semibold text-[15px] mb-2">{t.heading}</h3>
                    {t.paragraphs.map((p, j) => (
                      <p key={j} className="text-[13.5px] text-foreground/90 leading-relaxed mb-1.5">{p}</p>
                    ))}
                    {t.bullets.length > 0 && (
                      <ul className="flex flex-col gap-1.5">
                        {t.bullets.map((b, j) => (
                          <li key={j} className="flex gap-2 text-[13.5px] text-foreground/90 leading-relaxed">
                            <span className="mt-2 h-1 w-1 rounded-full bg-primary flex-shrink-0" />
                            <span className="min-w-0">{b}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* RIGHT — open items, capture, sources */}
            <div className="flex flex-col gap-4 min-w-0">

              {/* Open items */}
              <div className="rounded-lg border border-border bg-card">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                  <ListChecks className="h-[17px] w-[17px] text-muted-foreground" />
                  <span className="text-[11px] font-semibold tracking-[0.06em] uppercase text-muted-foreground">Open items</span>
                  <Badge variant="secondary" className="ml-auto text-[10px]">{actions.length}</Badge>
                </div>
                <div className="px-4 py-3 flex flex-col gap-2">
                  {actions.length === 0 && (
                    <p className="text-[12.5px] text-muted-foreground">No open items yet.</p>
                  )}
                  {actions.map(a => (
                    <div key={a.id} className="flex items-start gap-2.5">
                      <button
                        onClick={() => toggleDone(a.id)}
                        className="w-[18px] h-[18px] flex-shrink-0 mt-px rounded-[5px] border-[1.5px] border-input bg-background hover:border-primary"
                        aria-label="Mark done"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] leading-snug">{a.text}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                          <span>{a.owner === 'me' ? 'Me' : (a.member_id ? (nameForMember.get(a.member_id) ?? 'Participant') : 'Participant')}</span>
                          {a.due_date && <span>· due {fmtShort(a.due_date)}</span>}
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* capture */}
                  <div className="flex items-center gap-1.5 mt-1">
                    <Input
                      value={actionText}
                      onChange={e => setActionText(e.target.value)}
                      placeholder="Add an action item…"
                      className="h-8 text-[13px]"
                      onKeyDown={e => { if (e.key === 'Enter' && !adding) addAction(); }}
                    />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 gap-1 px-2 text-xs shrink-0">
                          {assigneeLabel}<ChevronDown className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setAssignee('me')}>Me</DropdownMenuItem>
                        {trackedParticipants.map(p => (
                          <DropdownMenuItem key={p.id} onSelect={() => setAssignee(p.team_member_id!)}>
                            {p.name ?? p.email}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button size="icon" className="h-8 w-8 shrink-0" disabled={adding || !actionText.trim()} onClick={addAction}>
                      {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Promote untracked attendees */}
              {untrackedParticipants.length > 0 && (
                <div className="rounded-lg border border-border bg-card">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                    <UserPlus className="h-[17px] w-[17px] text-muted-foreground" />
                    <span className="text-[11px] font-semibold tracking-[0.06em] uppercase text-muted-foreground">Not yet tracked</span>
                  </div>
                  <div className="px-4 py-3 flex flex-col gap-2">
                    <p className="text-[11.5px] text-muted-foreground">Add an attendee as a team member to assign actions to them.</p>
                    {untrackedParticipants.map(p => (
                      <div key={p.id} className="flex items-center justify-between gap-2">
                        <span className="text-[13px] truncate">{p.name ?? p.email}</span>
                        <Button
                          variant="outline" size="sm" className="h-7 gap-1 px-2 text-[11px] shrink-0"
                          disabled={promotingId === p.id}
                          onClick={() => promoteParticipant(p.id, p.name, p.email)}
                        >
                          {promotingId === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
                          Add as team member
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Bound sources */}
              <div className="rounded-lg border border-border bg-card">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                  <Sparkles className="h-[17px] w-[17px] text-muted-foreground" />
                  <span className="text-[11px] font-semibold tracking-[0.06em] uppercase text-muted-foreground">Context sources</span>
                </div>
                <div className="px-4 py-3 flex flex-wrap gap-1.5">
                  {enabledSources.length === 0 && (
                    <span className="text-[12.5px] text-muted-foreground">No context sources bound. Add some from the 1:1s tab.</span>
                  )}
                  {enabledSources.map(s => {
                    const Icon = SOURCE_ICON[s.source_type];
                    return (
                      <Badge key={s.id} variant="outline" className="gap-1 bg-accent/40">
                        <Icon className="h-3 w-3" />
                        <span className="text-xs">{s.label ?? s.ref}</span>
                      </Badge>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default GroupMeetingPrepDrawer;
