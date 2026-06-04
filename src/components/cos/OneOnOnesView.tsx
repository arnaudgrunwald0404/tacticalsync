import React, { useEffect, useMemo, useState } from 'react';
import { format, differenceInCalendarDays, formatDistanceToNow } from 'date-fns';
import {
  Play, Clock, FileText, ChevronRight, ChevronDown, CheckSquare,
  ListChecks, Sparkles, CalendarPlus, RefreshCw, Loader2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { parseLocalDate } from '@/lib/dateUtils';
import { cn } from '@/lib/utils';
import { type EventCategory } from '@/lib/calendar/matchEventToMember';

// Member shape used by this view (matches CosTeamMember in ChiefOfStaff.tsx)
export interface OneOnOneMember {
  id: string;
  user_id: string;
  name: string;
  role: string;
  relationship_type: 'direct_report' | 'collaborator';
  context_notes: string | null;
  last_1on1_date: string | null;
  reports_to_id: string | null;
}

export interface UpcomingOneOnOneEvent {
  id: string;                          // cos_one_on_one_events.id
  google_event_id: string;
  team_member_id: string | null;        // nullable — unmatched attendees have no member
  team_member: OneOnOneMember | null;   // null for unmatched attendees
  attendee_name: string | null;         // raw Google display name fallback
  attendee_email: string | null;        // raw Google email fallback
  inferred_category: EventCategory;
  title: string | null;
  start_time: string;                   // ISO
  end_time: string;                     // ISO
  status: 'confirmed' | 'tentative' | 'cancelled';
  prep_available: boolean;
}

// Re-export for convenience
export type { EventCategory };

interface OneOnOnesViewProps {
  members: OneOnOneMember[];
  loadingPrep: boolean;
  onViewPrep: (member: OneOnOneMember) => void;
  upcomingEvents: UpcomingOneOnOneEvent[];
  calendarConnected: boolean;
  lastSyncAt: string | null;
  syncing: boolean;
  onSyncCalendar: () => void;
}

// Pending action plus a bit of denormalized member info for the central aggregation.
interface PendingAction {
  id: string;
  text: string;
  created_at: string;
  member_id: string;
}

// CoS priority shape — only the fields we read for "my to-dos".
interface MyTodo {
  id: string;
  text: string;
  notes: string | null;
  done_at: string | null;
  archived_at: string | null;
  created_at: string;
}

// Assumed cadence (days) by relationship — refine when we add cadence to cos_team_members.
const ASSUMED_CADENCE_DAYS: Record<OneOnOneMember['relationship_type'], number> = {
  direct_report: 7,
  collaborator: 14,
};

// Visual tone per relationship (mirrors the design's color coding) — used by PersonCard
const REL_STYLE: Record<OneOnOneMember['relationship_type'], { label: string; rail: string; chipBg: string; chipFg: string; avatarBg: string }> = {
  direct_report: {
    label: 'Direct report',
    rail: 'bg-blue-500',
    chipBg: 'bg-blue-50',
    chipFg: 'text-blue-700',
    avatarBg: 'bg-gradient-to-br from-blue-500 to-blue-700',
  },
  collaborator: {
    label: 'Collaborator',
    rail: 'bg-teal-500',
    chipBg: 'bg-teal-50',
    chipFg: 'text-teal-700',
    avatarBg: 'bg-gradient-to-br from-teal-500 to-teal-700',
  },
};

const SKIP_STYLE = {
  label: 'Skip-level',
  rail: 'bg-violet-500',
  chipBg: 'bg-violet-50',
  chipFg: 'text-violet-700',
  avatarBg: 'bg-gradient-to-br from-violet-500 to-violet-700',
};

// Category config for the grouped upcoming events section
type CategoryConfig = { label: string; rail: string; chipBg: string; chipFg: string; avatarBg: string };
const CATEGORY_CONFIG: Record<EventCategory, CategoryConfig> = {
  direct_report: { label: 'My directs',        rail: 'bg-blue-500',   chipBg: 'bg-blue-50',   chipFg: 'text-blue-700',   avatarBg: 'bg-gradient-to-br from-blue-500 to-blue-700' },
  skip_level:    { label: 'My org',             rail: 'bg-violet-500', chipBg: 'bg-violet-50', chipFg: 'text-violet-700', avatarBg: 'bg-gradient-to-br from-violet-500 to-violet-700' },
  peer:          { label: 'My peers',           rail: 'bg-teal-500',   chipBg: 'bg-teal-50',   chipFg: 'text-teal-700',   avatarBg: 'bg-gradient-to-br from-teal-500 to-teal-700' },
  boss:          { label: 'My boss',            rail: 'bg-orange-500', chipBg: 'bg-orange-50', chipFg: 'text-orange-700', avatarBg: 'bg-gradient-to-br from-orange-500 to-orange-700' },
  stakeholder:   { label: 'Other stakeholders', rail: 'bg-slate-400',  chipBg: 'bg-slate-50',  chipFg: 'text-slate-700',  avatarBg: 'bg-gradient-to-br from-slate-400 to-slate-600' },
  external:      { label: 'Externals',          rail: 'bg-stone-400',  chipBg: 'bg-stone-50',  chipFg: 'text-stone-700',  avatarBg: 'bg-gradient-to-br from-stone-400 to-stone-600' },
};

const CATEGORY_ORDER: EventCategory[] = ['boss', 'direct_report', 'peer', 'skip_level', 'stakeholder', 'external'];

interface MemberWithSchedule extends OneOnOneMember {
  daysSinceLast: number | null;
  daysUntilNext: number | null; // negative = overdue
  bucket: 'overdue' | 'this_week' | 'later' | 'never';
  isSkip: boolean;
}

export function bucketise(members: OneOnOneMember[], now: Date = new Date()): MemberWithSchedule[] {
  // Detect skip-levels: a member whose reports_to_id matches another (direct_report) member's id.
  const directReportIds = new Set(members.filter(m => m.relationship_type === 'direct_report').map(m => m.id));
  const today = now;
  return members.map(m => {
    const last = m.last_1on1_date ? parseLocalDate(m.last_1on1_date) : null;
    const daysSinceLast = last ? differenceInCalendarDays(today, last) : null;
    const cadence = ASSUMED_CADENCE_DAYS[m.relationship_type] ?? 14;
    const daysUntilNext = daysSinceLast == null ? null : cadence - daysSinceLast;
    let bucket: MemberWithSchedule['bucket'];
    if (daysUntilNext == null) bucket = 'never';
    else if (daysUntilNext < 0) bucket = 'overdue';
    else if (daysUntilNext <= 7) bucket = 'this_week';
    else bucket = 'later';
    const isSkip = !!m.reports_to_id && directReportIds.has(m.reports_to_id);
    return { ...m, daysSinceLast, daysUntilNext, bucket, isSkip };
  });
}

// ── View ─────────────────────────────────────────────────────────────────────

export function OneOnOnesView({
  members,
  loadingPrep,
  onViewPrep,
  upcomingEvents,
  calendarConnected,
  lastSyncAt,
  syncing,
  onSyncCalendar,
}: OneOnOnesViewProps) {
  const scheduled = useMemo(() => bucketise(members), [members]);

  const grouped = useMemo(() => {
    const active = (upcomingEvents ?? []).filter(e => e.status !== 'cancelled');
    const map = new Map<EventCategory, UpcomingOneOnOneEvent[]>();
    for (const cat of CATEGORY_ORDER) map.set(cat, []);
    for (const ev of active) {
      map.get(ev.inferred_category)?.push(ev);
    }
    return map;
  }, [upcomingEvents]);
  const hasUpcoming = Array.from(grouped.values()).some(arr => arr.length > 0);

  // ── Central aggregation: "my to-dos from 1:1s" ─────────────────────────────
  const [myTodos, setMyTodos] = useState<MyTodo[]>([]);
  const [todosOpen, setTodosOpen] = useState(true);
  const [allPendingActions, setAllPendingActions] = useState<Record<string, number>>({});

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const [{ data: priorities }, { data: actions }] = await Promise.all([
        db.from('cos_priorities')
          .select('id, text, notes, done_at, archived_at, created_at')
          .eq('user_id', user.id)
          .is('done_at', null).is('archived_at', null)
          .ilike('notes', 'From 1:1 with %')
          .order('created_at', { ascending: false }),
        db.from('cos_meeting_actions')
          .select('member_id, status')
          .eq('user_id', user.id)
          .eq('status', 'pending'),
      ]);
      setMyTodos((priorities ?? []) as MyTodo[]);
      const counts: Record<string, number> = {};
      for (const a of (actions ?? []) as Array<{ member_id: string }>) {
        counts[a.member_id] = (counts[a.member_id] ?? 0) + 1;
      }
      setAllPendingActions(counts);
    }
    load();
  }, [members]);

  const markTodoDone = async (id: string) => {
    // Optimistic
    setMyTodos(prev => prev.filter(t => t.id !== id));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('cos_priorities')
      .update({ done_at: new Date().toISOString() })
      .eq('id', id);
  };

  // Split into buckets for rendering
  const overdue = scheduled
    .filter(m => m.bucket === 'overdue' && !m.isSkip)
    .sort((a, b) => (a.daysUntilNext ?? 0) - (b.daysUntilNext ?? 0));
  const thisWeek = scheduled
    .filter(m => m.bucket === 'this_week' && !m.isSkip)
    .sort((a, b) => (a.daysUntilNext ?? 0) - (b.daysUntilNext ?? 0));
  const later = scheduled
    .filter(m => (m.bucket === 'later' || m.bucket === 'never') && !m.isSkip && m.relationship_type === 'direct_report')
    .sort((a, b) => a.name.localeCompare(b.name));
  const collaboratorsLater = scheduled
    .filter(m => m.relationship_type === 'collaborator' && m.bucket !== 'overdue' && m.bucket !== 'this_week' && !m.isSkip)
    .sort((a, b) => a.name.localeCompare(b.name));
  const skipLevels = scheduled.filter(m => m.isSkip);

  // Hero pick: the most overdue direct report, or the first this-week one.
  const hero = overdue[0] ?? thisWeek[0] ?? null;
  const heroRest = hero ? [...overdue.slice(hero.bucket === 'overdue' ? 1 : 0), ...thisWeek.slice(hero.bucket === 'this_week' ? 1 : 0)] : [...overdue, ...thisWeek];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold tracking-tight font-heading">1:1s</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {scheduled.length} {scheduled.length === 1 ? 'person' : 'people'} ·{' '}
            {overdue.length > 0 ? <span className="text-destructive font-medium">{overdue.length} overdue</span> : 'all on track'}
          </p>
        </div>
        <div className="ml-auto flex flex-col items-end">
          {calendarConnected ? (
            <Button variant="outline" size="sm" onClick={onSyncCalendar} disabled={syncing} className="gap-1.5">
              {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <RefreshCw className="h-3.5 w-3.5"/>}
              Sync calendar
            </Button>
          ) : (
            <Button variant="default" size="sm" onClick={onSyncCalendar} disabled={syncing} className="gap-1.5">
              <CalendarPlus className="h-3.5 w-3.5"/>
              Connect Google Calendar
            </Button>
          )}
          {lastSyncAt && (
            <p className="text-[10px] text-muted-foreground mt-1 text-right">
              Last synced {formatRelativeTime(lastSyncAt)}
            </p>
          )}
        </div>
      </div>

      {/* Upcoming 1:1s from calendar — grouped by category */}
      {hasUpcoming && (
        <p className="text-[11px] text-muted-foreground -mt-4">From your calendar — next 14 days</p>
      )}
      {hasUpcoming && (
        <div className="space-y-6">
          {CATEGORY_ORDER.map(cat => {
            const events = grouped.get(cat) ?? [];
            if (events.length === 0) return null;
            const cfg = CATEGORY_CONFIG[cat];
            return (
              <section key={cat}>
                <div className="flex items-baseline gap-3 mb-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">{cfg.label}</h3>
                  <Badge variant="secondary" className="ml-auto text-[10px]">{events.length}</Badge>
                </div>
                <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
                  {events
                    .sort((a, b) => a.start_time.localeCompare(b.start_time))
                    .map(ev => (
                      <UpcomingEventCard
                        key={ev.id}
                        event={ev}
                        onOpen={onViewPrep}
                        loading={loadingPrep}
                        categoryConfig={cfg}
                      />
                    ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Central aggregation: My to-dos from 1:1s */}
      <section className="rounded-xl border border-border bg-card overflow-hidden">
        <button
          onClick={() => setTodosOpen(o => !o)}
          className="w-full flex items-center gap-2 px-4 py-3 hover:bg-muted/40 transition-colors text-left"
        >
          {todosOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          <CheckSquare className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">My to-dos from 1:1s</span>
          <Badge variant="secondary" className="text-[10px]">{myTodos.length}</Badge>
          <span className="ml-auto text-[11px] text-muted-foreground">
            Central place for everything you owe out of any 1:1
          </span>
        </button>

        {todosOpen && (
          <div className="border-t border-border px-4 py-3">
            {myTodos.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-2">
                No open to-dos. Capture them from any 1:1 prep — they'll land here.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {myTodos.map(t => {
                  const sourceName = (t.notes ?? '').replace(/^From 1:1 with /i, '');
                  return (
                    <li key={t.id} className="flex items-start gap-2.5 group">
                      <Checkbox
                        id={`todo-${t.id}`}
                        className="mt-0.5"
                        onCheckedChange={(c) => { if (c) markTodoDone(t.id); }}
                      />
                      <label htmlFor={`todo-${t.id}`} className="flex-1 text-sm leading-snug cursor-pointer">
                        {t.text}
                        {sourceName && (
                          <span className="ml-2 text-[10px] text-muted-foreground">
                            ← {sourceName}
                          </span>
                        )}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </section>

      {!hasUpcoming && (
        <>
          {/* Hero: Up next */}
          {hero && (
            <UpNextHero member={hero} pendingForThem={allPendingActions[hero.id] ?? 0} onOpen={onViewPrep} loading={loadingPrep} />
          )}

          {/* Overdue + this-week siblings (excluding the hero) */}
          {heroRest.length > 0 && (
            <SectionGroup
              title="Coming up"
              subtitle="Next 7 days"
              tone="primary"
              members={heroRest}
              pendingForThemMap={allPendingActions}
              onOpen={onViewPrep}
              loading={loadingPrep}
            />
          )}
        </>
      )}

      {/* Later direct reports */}
      {later.length > 0 && (
        <SectionGroup
          title="Later"
          subtitle="Direct reports — not due yet"
          tone="muted"
          members={later}
          pendingForThemMap={allPendingActions}
          onOpen={onViewPrep}
          loading={loadingPrep}
          dense
        />
      )}

      {/* Collaborators */}
      {collaboratorsLater.length > 0 && (
        <SectionGroup
          title="Collaborators"
          subtitle="Cross-functional partners"
          tone="muted"
          members={collaboratorsLater}
          pendingForThemMap={allPendingActions}
          onOpen={onViewPrep}
          loading={loadingPrep}
          dense
        />
      )}

      {/* Skip-levels — folded under */}
      {skipLevels.length > 0 && (
        <SectionGroup
          title="Skip-levels"
          subtitle="One level below your direct reports"
          tone="muted"
          members={skipLevels}
          pendingForThemMap={allPendingActions}
          onOpen={onViewPrep}
          loading={loadingPrep}
          dense
          skipStyle
        />
      )}

      {scheduled.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              No team members yet. Add people in <strong>Settings → Team</strong> to start running 1:1s here.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Hero card ────────────────────────────────────────────────────────────────

function UpNextHero({
  member, pendingForThem, onOpen, loading,
}: {
  member: MemberWithSchedule;
  pendingForThem: number;
  onOpen: (m: OneOnOneMember) => void;
  loading: boolean;
}) {
  const isOverdue = member.bucket === 'overdue';
  const dueLabel = member.daysUntilNext == null
    ? 'Never met'
    : member.daysUntilNext < 0
      ? `${Math.abs(member.daysUntilNext)}d overdue`
      : member.daysUntilNext === 0
        ? 'Due today'
        : `Due in ${member.daysUntilNext}d`;

  return (
    <div className="relative rounded-xl overflow-hidden shadow-lg bg-gradient-to-br from-[#042a55] via-[#0a3f7a] to-[#0760c6] text-white">
      {/* Warm radial highlight */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(120% 80% at 90% -10%, rgba(240,140,0,0.32), transparent 60%)' }} />
      <div className="relative p-6 flex flex-col gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Badge className={cn(
            'gap-1 font-semibold tracking-wide uppercase text-[11px] border-0',
            isOverdue ? 'bg-red-500 text-white' : 'bg-amber-500 text-white',
          )}>
            <Play className="h-3 w-3 fill-current" />
            UP NEXT · {dueLabel}
          </Badge>
          <span className="text-[12px] text-white/60 inline-flex items-center gap-1.5">
            <Clock className="h-3 w-3" />
            Last 1:1 {member.last_1on1_date ? format(parseLocalDate(member.last_1on1_date), 'MMM d') : '—'}
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-full bg-white/15 border-2 border-white/25 flex items-center justify-center font-bold text-lg flex-shrink-0">
            {initials(member.name)}
          </div>
          <div className="min-w-0">
            <h3 className="font-heading font-extrabold text-2xl tracking-tight leading-tight">{member.name}</h3>
            <p className="text-sm text-white/70 mt-0.5">{member.role}</p>
          </div>
        </div>

        {member.context_notes && (
          <div className="bg-white/10 rounded-lg px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/60 mb-1">Context</p>
            <p className="text-sm leading-snug">{member.context_notes}</p>
          </div>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          {pendingForThem > 0 && (
            <span className="inline-flex items-center gap-1.5 text-sm font-bold text-amber-200">
              <AlertTriangle className="h-3.5 w-3.5" />
              {pendingForThem} open action{pendingForThem !== 1 ? 's' : ''}
            </span>
          )}
          <span className="ml-auto" />
          <Button
            onClick={() => onOpen(member)}
            disabled={loading}
            className="bg-white text-[#04356c] hover:bg-white/90 gap-1.5 font-semibold"
          >
            <FileText className="h-4 w-4" />
            Open prep
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Section group ────────────────────────────────────────────────────────────

function SectionGroup({
  title, subtitle, tone, members, pendingForThemMap, onOpen, loading, dense, skipStyle,
}: {
  title: string;
  subtitle: string;
  tone: 'primary' | 'muted';
  members: MemberWithSchedule[];
  pendingForThemMap: Record<string, number>;
  onOpen: (m: OneOnOneMember) => void;
  loading: boolean;
  dense?: boolean;
  skipStyle?: boolean;
}) {
  return (
    <section>
      <div className="flex items-baseline gap-3 mb-3">
        <h3 className={cn(
          'text-xs font-bold uppercase tracking-wider',
          tone === 'primary' ? 'text-foreground' : 'text-muted-foreground',
        )}>
          {title}
        </h3>
        <span className="text-[11px] text-muted-foreground">{subtitle}</span>
        <Badge variant="secondary" className="ml-auto text-[10px]">{members.length}</Badge>
      </div>
      <div className={cn(
        'grid gap-3',
        dense ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1 md:grid-cols-2',
      )}>
        {members.map(m => (
          <PersonCard
            key={m.id}
            member={m}
            pendingForThem={pendingForThemMap[m.id] ?? 0}
            onOpen={onOpen}
            loading={loading}
            dense={dense}
            skipStyle={skipStyle}
          />
        ))}
      </div>
    </section>
  );
}

// ── Person card ──────────────────────────────────────────────────────────────

function PersonCard({
  member, pendingForThem, onOpen, loading, dense, skipStyle,
}: {
  member: MemberWithSchedule;
  pendingForThem: number;
  onOpen: (m: OneOnOneMember) => void;
  loading: boolean;
  dense?: boolean;
  skipStyle?: boolean;
}) {
  const style = skipStyle ? SKIP_STYLE : REL_STYLE[member.relationship_type];
  const dueLabel = member.daysUntilNext == null
    ? 'Never met'
    : member.daysUntilNext < 0
      ? `${Math.abs(member.daysUntilNext)}d overdue`
      : member.daysUntilNext === 0
        ? 'Due today'
        : `Due in ${member.daysUntilNext}d`;
  const isOverdue = (member.daysUntilNext ?? 0) < 0;

  return (
    <button
      onClick={() => onOpen(member)}
      disabled={loading}
      className={cn(
        'relative flex flex-col items-stretch text-left rounded-lg border border-border bg-card overflow-hidden',
        'shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        'disabled:opacity-60 disabled:cursor-not-allowed',
      )}
    >
      {/* Color rail */}
      <span className={cn('absolute left-0 top-0 bottom-0 w-1', style.rail)} aria-hidden />

      <div className={cn('flex items-start gap-3', dense ? 'p-3 pl-4' : 'p-4 pl-5')}>
        {/* Avatar */}
        <div className={cn(
          'rounded-full flex items-center justify-center font-bold text-white flex-shrink-0',
          dense ? 'h-9 w-9 text-xs' : 'h-11 w-11 text-sm',
          style.avatarBg,
        )}>
          {initials(member.name)}
        </div>

        {/* Identity */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn('font-semibold leading-tight truncate', dense ? 'text-sm' : 'text-base')}>
              {member.name}
            </span>
            <Badge className={cn('text-[9px] font-semibold uppercase tracking-wide border-0', style.chipBg, style.chipFg)}>
              {style.label}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5">{member.role}</p>

          {/* Schedule + items row */}
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span className={cn(
              'text-[11px] font-semibold inline-flex items-center gap-1',
              isOverdue ? 'text-destructive' : 'text-muted-foreground',
            )}>
              <Clock className="h-3 w-3" />
              {dueLabel}
            </span>
            {pendingForThem > 0 && (
              <span className="text-[11px] font-semibold inline-flex items-center gap-1 text-amber-700">
                <ListChecks className="h-3 w-3" />
                {pendingForThem} open
              </span>
            )}
            {member.last_1on1_date && !dense && (
              <span className="text-[10px] text-muted-foreground/70 inline-flex items-center gap-1">
                Last {format(parseLocalDate(member.last_1on1_date), 'MMM d')}
              </span>
            )}
          </div>
        </div>

        {/* Open prep affordance */}
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary flex-shrink-0 mt-0.5">
          <Sparkles className="h-3 w-3" />
          {dense ? '' : 'Prep'}
        </span>
      </div>
    </button>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatRelativeTime(iso: string): string {
  return formatDistanceToNow(new Date(iso), { addSuffix: true });
}

// ── Upcoming event card (calendar-driven) ────────────────────────────────────

function UpcomingEventCard({
  event, onOpen, loading, categoryConfig,
}: {
  event: UpcomingOneOnOneEvent;
  onOpen: (m: OneOnOneMember) => void;
  loading: boolean;
  categoryConfig: CategoryConfig;
}) {
  const displayName = event.team_member?.name ?? event.attendee_name ?? event.attendee_email ?? 'Unknown';
  const displayRole = event.team_member?.role ?? (event.attendee_email ? event.attendee_email : '');
  const disabled = loading || !event.team_member;
  const start = new Date(event.start_time);
  return (
    <button
      onClick={() => { if (event.team_member) onOpen(event.team_member); }}
      disabled={disabled}
      title={!event.team_member ? 'Add this person to Settings → Team to enable prep' : undefined}
      className={cn(
        'relative flex items-stretch text-left rounded-lg border border-border bg-card overflow-hidden',
        'shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        'disabled:opacity-60 disabled:cursor-not-allowed',
      )}
    >
      <span className={cn('absolute left-0 top-0 bottom-0 w-1', categoryConfig.rail)} aria-hidden />
      <div className="flex items-start gap-3 p-4 pl-5 w-full">
        <div className="flex flex-col items-center justify-center min-w-[44px] text-center">
          <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
            {format(start, 'MMM')}
          </span>
          <span className="font-heading text-2xl font-extrabold leading-none">
            {format(start, 'd')}
          </span>
          <span className="text-[11px] text-muted-foreground mt-0.5">
            {format(start, 'h:mm a')}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold leading-tight truncate text-base">{displayName}</span>
            <Badge className={cn('text-[9px] font-semibold uppercase tracking-wide border-0', categoryConfig.chipBg, categoryConfig.chipFg)}>
              {categoryConfig.label}
            </Badge>
            {event.prep_available && (
              <Badge className="text-[9px] font-semibold uppercase tracking-wide border-0 bg-emerald-50 text-emerald-700 gap-1">
                <Sparkles className="h-2.5 w-2.5" />
                Prep ready
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5">{displayRole}</p>
          {event.title && event.title.toLowerCase() !== `1:1 with ${displayName.toLowerCase()}` && (
            <p className="text-[11px] text-muted-foreground/80 truncate mt-1 italic">{event.title}</p>
          )}
        </div>
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary flex-shrink-0 mt-0.5">
          <FileText className="h-3 w-3" />
        </span>
      </div>
    </button>
  );
}
