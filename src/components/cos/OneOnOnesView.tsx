import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { format, differenceInCalendarDays, formatDistanceToNow, isToday, isTomorrow, differenceInDays, startOfDay, addDays, startOfWeek } from 'date-fns';
import {
  Play, Clock, FileText, ChevronRight, ChevronDown, CheckSquare,
  ListChecks, Sparkles, CalendarPlus, RefreshCw, Loader2,
  Search, X, AlertTriangle, Repeat,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { parseLocalDate } from '@/lib/dateUtils';
import { cn } from '@/lib/utils';
import { type EventCategory } from '@/lib/calendar/matchEventToMember';

export type MemberRelationshipType =
  | 'direct_report' | 'collaborator' | 'boss' | 'peer' | 'skip_level' | 'stakeholder' | 'external';

export interface OneOnOneMember {
  id: string;
  user_id: string;
  name: string;
  role: string;
  relationship_type: MemberRelationshipType;
  context_notes: string | null;
  last_1on1_date: string | null;
  reports_to_id: string | null;
}

export interface UpcomingOneOnOneEvent {
  id: string;
  google_event_id: string;
  team_member_id: string | null;
  team_member: OneOnOneMember | null;
  attendee_name: string | null;
  attendee_email: string | null;
  inferred_category: EventCategory;
  title: string | null;
  start_time: string;
  end_time: string;
  status: 'confirmed' | 'tentative' | 'cancelled';
  prep_available: boolean;
}

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
  toolbarPortalId?: string;
}

interface MyTodo {
  id: string;
  text: string;
  notes: string | null;
  done_at: string | null;
  archived_at: string | null;
  created_at: string;
}

const ASSUMED_CADENCE_DAYS: Partial<Record<MemberRelationshipType, number>> = {
  direct_report: 7,
  collaborator: 14,
  boss: 14,
  peer: 14,
  skip_level: 30,
  stakeholder: 30,
  external: 30,
};

type RelStyle = {
  label: string;
  short: string;
  rail: string;
  chipBg: string;
  chipFg: string;
  avatarBg: string;
  dotColor: string;
};

const REL_STYLE: Partial<Record<MemberRelationshipType, RelStyle>> = {
  boss:          { label: 'My manager',    short: 'Manager',  rail: 'bg-[#254677]', chipBg: 'bg-[#e8eef7]', chipFg: 'text-[#04356c]', avatarBg: 'bg-gradient-to-br from-[#04356c] to-[#254677]', dotColor: 'bg-[#254677]' },
  direct_report: { label: 'Direct report', short: 'Report',   rail: 'bg-blue-600',  chipBg: 'bg-blue-50',   chipFg: 'text-blue-700',  avatarBg: 'bg-gradient-to-br from-blue-500 to-blue-700',   dotColor: 'bg-blue-600' },
  skip_level:    { label: 'Skip-level',    short: 'Skip',     rail: 'bg-violet-500', chipBg: 'bg-violet-50', chipFg: 'text-violet-700', avatarBg: 'bg-gradient-to-br from-violet-500 to-violet-700', dotColor: 'bg-violet-500' },
  collaborator:  { label: 'Collaborator',  short: 'Collab',   rail: 'bg-teal-600',  chipBg: 'bg-teal-50',   chipFg: 'text-teal-700',  avatarBg: 'bg-gradient-to-br from-teal-500 to-teal-700',   dotColor: 'bg-teal-600' },
  peer:          { label: 'Peer',          short: 'Peer',     rail: 'bg-gray-400',  chipBg: 'bg-gray-100',  chipFg: 'text-gray-600',  avatarBg: 'bg-gradient-to-br from-gray-400 to-gray-600',   dotColor: 'bg-gray-400' },
  stakeholder:   { label: 'Stakeholder',   short: 'Stake',    rail: 'bg-slate-400', chipBg: 'bg-slate-50',  chipFg: 'text-slate-700', avatarBg: 'bg-gradient-to-br from-slate-400 to-slate-600', dotColor: 'bg-slate-400' },
  external:      { label: 'External',      short: 'External', rail: 'bg-stone-400', chipBg: 'bg-stone-50',  chipFg: 'text-stone-700', avatarBg: 'bg-gradient-to-br from-stone-400 to-stone-600', dotColor: 'bg-stone-400' },
};

const DEFAULT_REL_STYLE: RelStyle = {
  label: 'Team member', short: 'Team', rail: 'bg-slate-400', chipBg: 'bg-slate-50', chipFg: 'text-slate-700', avatarBg: 'bg-gradient-to-br from-slate-400 to-slate-600', dotColor: 'bg-slate-400',
};

type CategoryConfig = { label: string; rail: string; chipBg: string; chipFg: string; avatarBg: string };
const CATEGORY_CONFIG: Record<EventCategory, CategoryConfig> = {
  direct_report: { label: 'Direct report', rail: 'bg-blue-600',   chipBg: 'bg-blue-50',   chipFg: 'text-blue-700',   avatarBg: 'bg-gradient-to-br from-blue-500 to-blue-700' },
  skip_level:    { label: 'Skip-level',    rail: 'bg-violet-500', chipBg: 'bg-violet-50', chipFg: 'text-violet-700', avatarBg: 'bg-gradient-to-br from-violet-500 to-violet-700' },
  peer:          { label: 'Peer',          rail: 'bg-gray-400',   chipBg: 'bg-gray-100',  chipFg: 'text-gray-600',   avatarBg: 'bg-gradient-to-br from-gray-400 to-gray-600' },
  boss:          { label: 'Manager',       rail: 'bg-[#254677]',  chipBg: 'bg-[#e8eef7]', chipFg: 'text-[#04356c]',  avatarBg: 'bg-gradient-to-br from-[#04356c] to-[#254677]' },
  stakeholder:   { label: 'Stakeholder',   rail: 'bg-slate-400',  chipBg: 'bg-slate-50',  chipFg: 'text-slate-700',  avatarBg: 'bg-gradient-to-br from-slate-400 to-slate-600' },
  external:      { label: 'External',      rail: 'bg-stone-400',  chipBg: 'bg-stone-50',  chipFg: 'text-stone-700',  avatarBg: 'bg-gradient-to-br from-stone-400 to-stone-600' },
};


type TimeBucket = 'today' | 'tomorrow' | 'this_week' | 'later';

interface MemberWithSchedule extends OneOnOneMember {
  daysSinceLast: number | null;
  daysUntilNext: number | null;
  bucket: TimeBucket;
  isSkip: boolean;
}

export function bucketise(members: OneOnOneMember[], now: Date = new Date()): MemberWithSchedule[] {
  const directReportIds = new Set(members.filter(m => m.relationship_type === 'direct_report').map(m => m.id));
  const today = now;
  return members.map(m => {
    const last = m.last_1on1_date ? parseLocalDate(m.last_1on1_date) : null;
    const daysSinceLast = last ? differenceInCalendarDays(today, last) : null;
    const cadence = ASSUMED_CADENCE_DAYS[m.relationship_type] ?? 14;
    const daysUntilNext = daysSinceLast == null ? null : cadence - daysSinceLast;
    let bucket: TimeBucket;
    if (daysUntilNext == null) bucket = 'later';
    else if (daysUntilNext <= 0) bucket = 'today';
    else if (daysUntilNext === 1) bucket = 'tomorrow';
    else if (daysUntilNext <= 7) bucket = 'this_week';
    else bucket = 'later';
    const isSkip = !!m.reports_to_id && directReportIds.has(m.reports_to_id);
    return { ...m, daysSinceLast, daysUntilNext, bucket, isSkip };
  });
}

function bucketEvent(ev: UpcomingOneOnOneEvent): TimeBucket {
  const start = new Date(ev.start_time);
  if (isToday(start)) return 'today';
  if (isTomorrow(start)) return 'tomorrow';
  const daysOut = differenceInDays(startOfDay(start), startOfDay(new Date()));
  if (daysOut >= 2 && daysOut <= 7) return 'this_week';
  return 'later';
}

type BucketTone = 'today' | 'tomorrow' | 'week' | 'muted';
const BUCKET_CONFIG: Record<TimeBucket, { label: string; dateLabel: () => string; tone: BucketTone }> = {
  today:     { label: 'Today',     dateLabel: () => format(new Date(), 'EEE, MMM d'), tone: 'today' },
  tomorrow:  { label: 'Tomorrow',  dateLabel: () => format(addDays(new Date(), 1), 'EEE, MMM d'), tone: 'tomorrow' },
  this_week: { label: 'Coming up', dateLabel: () => {
    const d2 = addDays(new Date(), 2);
    const d7 = addDays(new Date(), 7);
    return `${format(d2, 'MMM d')} – ${format(d7, 'MMM d')}`;
  }, tone: 'week' },
  later:     { label: 'Later',     dateLabel: () => `${format(addDays(new Date(), 8), 'MMM d')} +`, tone: 'muted' },
};

const BUCKET_ORDER: TimeBucket[] = ['today', 'tomorrow', 'this_week', 'later'];

// ── Helpers ─────────────────────────────────────────────────────────────────

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatRelativeTime(iso: string): string {
  return formatDistanceToNow(new Date(iso), { addSuffix: true });
}

function dueLabel(m: MemberWithSchedule): string {
  if (m.daysUntilNext == null) return 'Never met';
  if (m.daysUntilNext < 0) return `${Math.abs(m.daysUntilNext)}d overdue`;
  if (m.daysUntilNext === 0) return 'Due today';
  return `in ${m.daysUntilNext}d`;
}

function cadenceLabel(relType: MemberRelationshipType): string {
  const days = ASSUMED_CADENCE_DAYS[relType] ?? 14;
  if (days <= 7) return 'Weekly';
  if (days <= 14) return 'Bi-weekly';
  return 'Monthly';
}

// ── Date-based section helpers ─────────────────────────────────────────────

function smartDateLabel(dateStr: string): { label: string; subtitle: string; tone: BucketTone } {
  const date = startOfDay(parseLocalDate(dateStr));
  const now = startOfDay(new Date());
  const diff = differenceInDays(date, now);
  if (diff === 0) return { label: 'Today', subtitle: format(date, 'EEE, MMM d'), tone: 'today' };
  if (diff === 1) return { label: 'Tomorrow', subtitle: format(date, 'EEE, MMM d'), tone: 'tomorrow' };
  if (diff <= 6) return { label: format(date, 'EEEE'), subtitle: format(date, 'MMM d'), tone: 'week' };
  return { label: format(date, 'EEEE'), subtitle: format(date, 'MMM d'), tone: 'muted' };
}

function remainingSectionLabel(dates: string[]): { label: string; subtitle: string } {
  if (dates.length === 0) return { label: '', subtitle: '' };
  const firstDate = parseLocalDate(dates[0]);
  const lastDate = parseLocalDate(dates[dates.length - 1]);
  const now = startOfDay(new Date());
  const nowWeek = startOfWeek(now, { weekStartsOn: 1 });
  const firstWeek = startOfWeek(firstDate, { weekStartsOn: 1 });
  const nextWeek = addDays(nowWeek, 7);
  const range = `${format(firstDate, 'EEE, MMM d')} – ${format(lastDate, 'EEE, MMM d')}`;
  if (firstWeek.getTime() === nowWeek.getTime()) {
    return { label: 'Later this week', subtitle: range };
  }
  if (firstWeek.getTime() === nextWeek.getTime()) {
    return { label: 'Next week', subtitle: range };
  }
  return { label: 'Coming up', subtitle: `${format(firstDate, 'MMM d')} +` };
}

// ── View ────────────────────────────────────────────────────────────────────

export function OneOnOnesView({
  members,
  loadingPrep,
  onViewPrep,
  upcomingEvents,
  calendarConnected,
  lastSyncAt,
  syncing,
  onSyncCalendar,
  toolbarPortalId,
}: OneOnOnesViewProps) {
  const [search, setSearch] = useState('');
  const scheduled = useMemo(() => bucketise(members), [members]);

  // Calendar events: deduplicate and group by date for dynamic featured sections
  const dedupedEvents = useMemo(() => {
    const active = (upcomingEvents ?? [])
      .filter(e => e.status !== 'cancelled')
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
    const seen = new Set<string>();
    return active.filter(ev => {
      const key = ev.team_member_id ?? ev.attendee_email ?? ev.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [upcomingEvents]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, UpcomingOneOnOneEvent[]>();
    for (const ev of dedupedEvents) {
      const dateStr = format(new Date(ev.start_time), 'yyyy-MM-dd');
      if (!map.has(dateStr)) map.set(dateStr, []);
      map.get(dateStr)!.push(ev);
    }
    return map;
  }, [dedupedEvents]);

  const sortedEventDates = useMemo(() => [...eventsByDate.keys()].sort(), [eventsByDate]);
  const hasUpcoming = dedupedEvents.length > 0;

  // Central aggregation: to-dos from 1:1s
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
    setMyTodos(prev => prev.filter(t => t.id !== id));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('cos_priorities')
      .update({ done_at: new Date().toISOString() })
      .eq('id', id);
  };

  // Search filter
  const q = search.trim().toLowerCase();
  const matchesSearch = (name: string, role: string) =>
    !q || name.toLowerCase().includes(q) || role.toLowerCase().includes(q);

  // Chronological member buckets (cadence-based fallback)
  const membersByBucket = useMemo(() => {
    const map = new Map<TimeBucket, MemberWithSchedule[]>();
    for (const b of BUCKET_ORDER) map.set(b, []);
    for (const m of scheduled) {
      if (!matchesSearch(m.name, m.role)) continue;
      map.get(m.bucket)!.push(m);
    }
    // Sort each bucket: most urgent first
    for (const [, arr] of map) {
      arr.sort((a, b) => (a.daysUntilNext ?? 999) - (b.daysUntilNext ?? 999));
    }
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheduled, q]);

  // Hero: first "today" person (cadence fallback)
  const todayMembers = membersByBucket.get('today') ?? [];
  const hero = todayMembers[0] ?? null;

  // Calendar events filtered by search, grouped by date
  const filteredEventsByDate = useMemo(() => {
    if (!q) return eventsByDate;
    const map = new Map<string, UpcomingOneOnOneEvent[]>();
    for (const [date, events] of eventsByDate) {
      const filtered = events.filter(ev => {
        const name = ev.team_member?.name ?? ev.attendee_name ?? ev.attendee_email ?? '';
        const role = ev.team_member?.role ?? '';
        return matchesSearch(name, role);
      });
      if (filtered.length > 0) map.set(date, filtered);
    }
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventsByDate, q]);

  const filteredDates = useMemo(() => [...filteredEventsByDate.keys()].sort(), [filteredEventsByDate]);

  const portalTarget = toolbarPortalId ? document.getElementById(toolbarPortalId) : null;

  const toolbar = (
    <div className="flex items-center">
      {/* Search — far left */}
      <div className="relative w-56">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Quick search..."
          className="h-8 pl-8 pr-8 text-sm"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Sync — far right */}
      <div className="flex flex-col items-end gap-1">
        {calendarConnected ? (
          <Button variant="outline" size="sm" onClick={onSyncCalendar} disabled={syncing} className="gap-1.5 h-8">
            {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Sync
          </Button>
        ) : (
          <Button variant="default" size="sm" onClick={onSyncCalendar} disabled={syncing} className="gap-1.5 h-8">
            <CalendarPlus className="h-3.5 w-3.5" />
            Connect calendar
          </Button>
        )}
        {lastSyncAt && (
          <span className="text-[10px] text-muted-foreground">
            Synced {formatRelativeTime(lastSyncAt)}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {portalTarget ? createPortal(toolbar, portalTarget) : toolbar}

      {/* Central aggregation: My to-dos from 1:1s */}
      {myTodos.length > 0 && (
        <section className="rounded-xl border border-border bg-card overflow-hidden">
          <button
            onClick={() => setTodosOpen(o => !o)}
            className="w-full flex items-center gap-2 px-4 py-3 hover:bg-muted/40 transition-colors text-left"
          >
            {todosOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            <CheckSquare className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">My to-dos from 1:1s</span>
            <Badge variant="secondary" className="text-[10px]">{myTodos.length}</Badge>
          </button>
          {todosOpen && (
            <div className="border-t border-border px-4 py-3">
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
            </div>
          )}
        </section>
      )}

      {/* Calendar-driven: dynamic featured sections */}
      {hasUpcoming && (
        <div className="space-y-8">
          {/* Featured sections: first 2 unique dates */}
          {filteredDates.slice(0, 2).map((dateStr, secIdx) => {
            const events = filteredEventsByDate.get(dateStr) ?? [];
            if (events.length === 0) return null;
            const dateMeta = smartDateLabel(dateStr);
            const isFirst = secIdx === 0;
            const showHero = isFirst && !q;

            return (
              <TimelineSection
                key={dateStr}
                label={dateMeta.label}
                subtitle={dateMeta.subtitle}
                count={events.length}
                tone="primary"
                bucketTone={isFirst ? 'today' : 'tomorrow'}
              >
                {showHero ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-stretch">
                    <UpNextHeroEvent event={events[0]} onOpen={onViewPrep} loading={loadingPrep} />
                    {events.length === 1 ? (
                      <PrepCompanionPanel event={events[0]} onOpen={onViewPrep} loading={loadingPrep} />
                    ) : (
                      <div className="flex flex-col gap-3">
                        {events.slice(1).map(ev => (
                          <UpcomingEventCard key={ev.id} event={ev} onOpen={onViewPrep} loading={loadingPrep} />
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                    {events.map(ev => (
                      <UpcomingEventCard key={ev.id} event={ev} onOpen={onViewPrep} loading={loadingPrep} />
                    ))}
                  </div>
                )}
              </TimelineSection>
            );
          })}

          {/* Remaining events after the 2 featured dates */}
          {filteredDates.length > 2 && (() => {
            const remaining = filteredDates.slice(2);
            const allEvents = remaining.flatMap(d => filteredEventsByDate.get(d) ?? []);
            if (allEvents.length === 0) return null;
            const { label: remLabel, subtitle: remSub } = remainingSectionLabel(remaining);
            return (
              <TimelineSection
                label={remLabel}
                subtitle={remSub}
                count={allEvents.length}
                tone="muted"
                bucketTone="muted"
              >
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {allEvents.map(ev => (
                    <UpcomingEventCard key={ev.id} event={ev} onOpen={onViewPrep} loading={loadingPrep} />
                  ))}
                </div>
              </TimelineSection>
            );
          })()}
        </div>
      )}

      {/* Cadence-based: chronological sections (no calendar) */}
      {!hasUpcoming && (
        <div className="space-y-6">
          {BUCKET_ORDER.map(bucket => {
            const people = membersByBucket.get(bucket) ?? [];
            if (people.length === 0) return null;
            const cfg = BUCKET_CONFIG[bucket];
            const showHero = bucket === 'today' && !q && people.length > 0;
            const compact = bucket === 'this_week' || bucket === 'later';
            const cols = compact
              ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
              : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
            return (
              <TimelineSection
                key={bucket}
                label={cfg.label}
                subtitle={cfg.dateLabel()}
                count={people.length}
                tone={bucket === 'later' ? 'muted' : 'primary'}
                bucketTone={cfg.tone}
              >
                {showHero ? (
                  /* Today with hero: 2-col, hero left stretches to match stacked cards right */
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-stretch">
                    <UpNextHero
                      member={people[0]}
                      pendingForThem={allPendingActions[people[0].id] ?? 0}
                      onOpen={onViewPrep}
                      loading={loadingPrep}
                    />
                    {people.length > 1 && (
                      <div className="flex flex-col gap-3">
                        {people.slice(1).map(m => (
                          <CompactPersonCard
                            key={m.id}
                            member={m}
                            pendingForThem={allPendingActions[m.id] ?? 0}
                            onOpen={onViewPrep}
                            loading={loadingPrep}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className={cn('grid gap-3', cols)}>
                    {people.map(m => (
                      <CompactPersonCard
                        key={m.id}
                        member={m}
                        pendingForThem={allPendingActions[m.id] ?? 0}
                        onOpen={onViewPrep}
                        loading={loadingPrep}
                        compact={compact}
                        forceStyle={m.isSkip ? REL_STYLE.skip_level : undefined}
                      />
                    ))}
                  </div>
                )}
              </TimelineSection>
            );
          })}
        </div>
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

// ── Timeline section ────────────────────────────────────────────────────────

const TONE_PILL: Record<BucketTone, string> = {
  today:    'bg-amber-500 text-white',
  tomorrow: 'bg-[#e8eef7] text-[#254677]',
  week:     'bg-muted text-muted-foreground',
  muted:    'bg-muted text-muted-foreground',
};

function TimelineSection({
  label, subtitle, count, tone, bucketTone, children,
}: {
  label: string;
  subtitle?: string;
  count: number;
  tone: 'primary' | 'muted';
  bucketTone?: BucketTone;
  children: React.ReactNode;
}) {
  const pillCls = bucketTone ? TONE_PILL[bucketTone] : (tone === 'primary' ? TONE_PILL.today : TONE_PILL.muted);
  return (
    <section>
      <div className="flex items-center gap-3 mb-3">
        <span className={cn('inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide', pillCls)}>
          {label}
        </span>
        {subtitle && <span className="text-sm text-muted-foreground">{subtitle}</span>}
        <span className="ml-auto text-[11px] font-bold text-muted-foreground bg-muted rounded-full px-2.5 py-0.5 border border-border">
          {count}
        </span>
      </div>
      {children}
    </section>
  );
}

// ── Hero card (cadence-based) ───────────────────────────────────────────────

function UpNextHero({
  member, pendingForThem, onOpen, loading,
}: {
  member: MemberWithSchedule;
  pendingForThem: number;
  onOpen: (m: OneOnOneMember) => void;
  loading: boolean;
}) {
  const isOverdue = member.daysUntilNext != null && member.daysUntilNext < 0;
  const style = REL_STYLE[member.relationship_type] ?? DEFAULT_REL_STYLE;

  return (
    <button
      onClick={() => onOpen(member)}
      disabled={loading}
      className="relative rounded-xl overflow-hidden shadow-lg text-white text-left transition-shadow hover:shadow-xl disabled:opacity-60 disabled:cursor-not-allowed h-full"
      style={{ background: 'linear-gradient(135deg, #042a55 0%, #0a3f7a 55%, #0760c6 130%)' }}
    >
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(110% 120% at 100% -20%, rgba(240,140,0,0.3), transparent 55%)' }} />
      <div className="relative p-4 flex flex-col gap-2.5 h-full justify-between">
        {/* Person row */}
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-full bg-white/15 border-2 border-white/20 flex items-center justify-center font-bold text-sm flex-shrink-0">
            {initials(member.name)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-heading font-extrabold text-[15px] tracking-tight leading-tight">{member.name}</div>
            <div className="text-xs text-white/65 mt-0.5">{member.role}</div>
          </div>
          <Badge className={cn(
            'gap-1 font-extrabold tracking-wide uppercase text-[10px] border-0 flex-shrink-0 whitespace-nowrap',
            isOverdue ? 'bg-red-500 text-white' : 'bg-amber-500 text-white',
          )}>
            <Play className="h-2.5 w-2.5 fill-current" />
            {dueLabel(member)}
          </Badge>
        </div>

        {/* Context preview */}
        {member.context_notes && (
          <div className="bg-white/10 rounded-lg px-3 py-2 text-sm leading-snug line-clamp-2">
            {member.context_notes}
          </div>
        )}

        {/* Meta row */}
        <div className="flex items-center gap-3 flex-wrap mt-auto">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-white/60">
            <Repeat className="h-3 w-3" /> {cadenceLabel(member.relationship_type)}
          </span>
          {pendingForThem > 0 && (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-200">
              <AlertTriangle className="h-3 w-3" />
              {pendingForThem} action item{pendingForThem !== 1 ? 's' : ''}
            </span>
          )}
          <span className="text-[11px] text-white/40 ml-auto inline-flex items-center gap-1.5">
            <Clock className="h-3 w-3" />
            {member.last_1on1_date ? format(parseLocalDate(member.last_1on1_date), 'MMM d') : 'Never met'}
          </span>
        </div>
      </div>
    </button>
  );
}

// ── Compact person card ─────────────────────────────────────────────────────

function CompactPersonCard({
  member, pendingForThem, onOpen, loading, compact, forceStyle,
}: {
  member: MemberWithSchedule;
  pendingForThem: number;
  onOpen: (m: OneOnOneMember) => void;
  loading: boolean;
  compact?: boolean;
  forceStyle?: RelStyle;
}) {
  const style = forceStyle ?? (REL_STYLE[member.relationship_type] ?? DEFAULT_REL_STYLE);
  const isOverdue = (member.daysUntilNext ?? 0) < 0;

  return (
    <button
      onClick={() => onOpen(member)}
      disabled={loading}
      className={cn(
        'relative flex flex-col text-left rounded-lg border border-border bg-card overflow-hidden',
        'shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        'disabled:opacity-60 disabled:cursor-not-allowed',
      )}
    >
      {/* Color rail */}
      <span className={cn('absolute left-0 top-0 bottom-0', compact ? 'w-[3px]' : 'w-1', style.rail)} aria-hidden />

      <div className={cn(
        'flex items-center gap-3',
        compact ? 'p-2.5 pl-3.5' : 'p-3 pl-4',
      )}>
        <div className={cn(
          'rounded-full flex items-center justify-center font-bold text-white flex-shrink-0',
          compact ? 'h-8 w-8 text-xs' : 'h-10 w-10 text-sm',
          style.avatarBg,
        )}>
          {initials(member.name)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn(
              'font-bold leading-tight truncate',
              compact ? 'text-[13px]' : 'text-sm',
            )}>
              {member.name}
            </span>
            <span className={cn(
              'inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-1.5 py-px',
              style.chipBg, style.chipFg,
            )}>
              <span className={cn('w-[5px] h-[5px] rounded-full', style.dotColor)} />
              {style.short}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
            <span className="truncate">{member.role}</span>
          </div>
        </div>

        <div className="flex-shrink-0 text-right">
          <div className={cn(
            'text-xs font-bold',
            isOverdue ? 'text-destructive' : 'text-foreground',
          )}>
            {dueLabel(member)}
          </div>
          {pendingForThem > 0 && (
            <div className="text-[10px] font-bold text-amber-600 mt-0.5">
              {pendingForThem} action{pendingForThem !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

// ── Helpers for event display ────────────────────────────────────────────────

function eventDisplayInfo(event: UpcomingOneOnOneEvent) {
  const rawName = event.team_member?.name ?? event.attendee_name ?? null;
  const isEmailAsName = rawName != null && rawName.includes('@');
  const displayName = isEmailAsName
    ? (event.attendee_email?.split('@')[0] ?? rawName)
    : (rawName ?? event.attendee_email ?? 'Unknown');
  const displayRole = event.team_member?.role
    ?? (event.attendee_email && !isEmailAsName ? event.attendee_email : (event.attendee_email ?? ''));
  const cfg = CATEGORY_CONFIG[event.inferred_category] ?? CATEGORY_CONFIG.stakeholder;
  const relStyle = event.team_member
    ? (REL_STYLE[event.team_member.relationship_type] ?? DEFAULT_REL_STYLE)
    : DEFAULT_REL_STYLE;
  return { displayName, displayRole, cfg, relStyle };
}

// ── Hero card (calendar-driven) ─────────────────────────────────────────────

function UpNextHeroEvent({
  event, onOpen, loading,
}: {
  event: UpcomingOneOnOneEvent;
  onOpen: (m: OneOnOneMember) => void;
  loading: boolean;
}) {
  const { displayName, displayRole, relStyle } = eventDisplayInfo(event);
  const start = new Date(event.start_time);

  return (
    <button
      onClick={() => { if (event.team_member) onOpen(event.team_member); }}
      disabled={loading || !event.team_member}
      className="relative rounded-xl overflow-hidden shadow-lg text-white text-left transition-shadow hover:shadow-xl disabled:opacity-60 disabled:cursor-not-allowed h-full"
      style={{ background: 'linear-gradient(135deg, #042a55 0%, #0a3f7a 55%, #0760c6 130%)' }}
    >
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(110% 120% at 100% -20%, rgba(240,140,0,0.3), transparent 55%)' }} />
      <div className="relative p-4 flex flex-col gap-2.5 h-full justify-between">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-full bg-white/15 border-2 border-white/20 flex items-center justify-center font-bold text-sm flex-shrink-0">
            {initials(displayName)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-heading font-extrabold text-[15px] tracking-tight leading-tight">{displayName}</div>
            <div className="text-xs text-white/65 mt-0.5">{displayRole}</div>
          </div>
          <Badge className="gap-1 font-extrabold tracking-wide uppercase text-[10px] border-0 flex-shrink-0 whitespace-nowrap bg-amber-500 text-white">
            <Play className="h-2.5 w-2.5 fill-current" />
            {format(start, 'h:mm a')}
          </Badge>
        </div>

        {/* Context preview */}
        {event.team_member?.context_notes && (
          <div className="bg-white/10 rounded-lg px-3 py-2 text-sm leading-snug line-clamp-2">
            {event.team_member.context_notes}
          </div>
        )}

        <div className="flex items-center gap-3 flex-wrap mt-auto">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-white/60">
            <Repeat className="h-3 w-3" /> {relStyle.label}
          </span>
          {event.prep_available ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-300">
              <Sparkles className="h-3 w-3" /> Prep ready
            </span>
          ) : event.team_member ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-300">
              <AlertTriangle className="h-3 w-3" /> No prep
            </span>
          ) : null}
          <span className="text-[11px] text-white/40 ml-auto inline-flex items-center gap-1.5">
            <Clock className="h-3 w-3" />
            {format(start, 'EEE, MMM d')}
          </span>
        </div>
      </div>
    </button>
  );
}

// ── Prep companion panel (shown next to hero when only 1 event) ────────────

function PrepCompanionPanel({
  event, onOpen, loading,
}: {
  event: UpcomingOneOnOneEvent;
  onOpen: (m: OneOnOneMember) => void;
  loading: boolean;
}) {
  const hasPrep = event.prep_available;
  const hasMember = !!event.team_member;
  const { displayName } = eventDisplayInfo(event);
  const firstName = displayName.split(' ')[0];
  const member = event.team_member;

  const lastMetLabel = member?.last_1on1_date
    ? `Last met ${format(parseLocalDate(member.last_1on1_date), 'MMM d')}`
    : 'First meeting';

  return (
    <div className="rounded-xl border border-border bg-card p-5 flex flex-col">
      <h3 className="text-xs font-extrabold tracking-[0.08em] uppercase text-muted-foreground mb-4">
        Meeting prep
      </h3>

      <div className="flex-1 space-y-3">
        {hasPrep ? (
          <div className="flex items-start gap-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 p-3">
            <Sparkles className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Prep ready</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Topics, talking points, and action items prepared for your 1:1 with {firstName}.
              </p>
            </div>
          </div>
        ) : hasMember ? (
          <div className="flex items-start gap-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3">
            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">No prep yet</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Generate a brief with context, suggested topics, and open action items for {firstName}.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-lg bg-muted/50 border border-border p-3">
            <AlertTriangle className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold">Contact not linked</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Add {firstName} to your team in Settings to enable AI-generated prep, action tracking, and shared context.
              </p>
            </div>
          </div>
        )}

        {member?.context_notes && (
          <div className="rounded-lg bg-muted/30 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Context</p>
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{member.context_notes}</p>
          </div>
        )}

        {member && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>{lastMetLabel}</span>
          </div>
        )}
      </div>

      {hasMember && (
        <Button
          onClick={() => onOpen(event.team_member!)}
          disabled={loading}
          size="sm"
          className={cn(
            'w-full mt-4 gap-2',
            hasPrep
              ? 'bg-[#04356c] hover:bg-[#04356c]/90 text-white'
              : 'bg-amber-500 hover:bg-amber-600 text-white',
          )}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : hasPrep ? (
            <FileText className="h-4 w-4" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {hasPrep ? 'Review prep' : 'Generate prep'}
        </Button>
      )}
    </div>
  );
}

// ── Upcoming event card (calendar-driven) ───────────────────────────────────

function UpcomingEventCard({
  event, onOpen, loading,
}: {
  event: UpcomingOneOnOneEvent;
  onOpen: (m: OneOnOneMember) => void;
  loading: boolean;
}) {
  const { displayName, displayRole, relStyle } = eventDisplayInfo(event);
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
      <span className={cn('absolute left-0 top-0 bottom-0 w-1', relStyle.rail)} aria-hidden />
      <div className="flex items-center gap-3 p-3 pl-4 w-full">
        <div className={cn(
          'h-9 w-9 rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 text-xs',
          relStyle.avatarBg,
        )}>
          {initials(displayName)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold leading-tight truncate text-sm">{displayName}</span>
            <span className={cn(
              'inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-1.5 py-px',
              relStyle.chipBg, relStyle.chipFg,
            )}>
              <span className={cn('w-[5px] h-[5px] rounded-full', relStyle.dotColor)} />
              {relStyle.short}
            </span>
            {event.prep_available ? (
              <Badge className="text-[9px] font-semibold uppercase tracking-wide border-0 bg-emerald-50 text-emerald-700 gap-1">
                <Sparkles className="h-2.5 w-2.5" />
                Prep ready
              </Badge>
            ) : event.team_member ? (
              <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-amber-600">
                <Sparkles className="h-2.5 w-2.5" />
                Prepare
              </span>
            ) : null}
          </div>
          <p className="text-[11px] text-muted-foreground truncate mt-0.5">{displayRole}</p>
        </div>
        <div className="flex-shrink-0 text-right">
          <div className="text-xs font-bold">{format(start, 'h:mm a')}</div>
          <div className="text-[11px] text-muted-foreground">{format(start, 'EEE')}</div>
        </div>
      </div>
    </button>
  );
}
