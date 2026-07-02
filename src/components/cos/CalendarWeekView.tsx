import { useState, useMemo, useEffect, useRef } from 'react';
import { format, addWeeks, subWeeks, startOfWeek, addDays, isToday, isSameDay } from 'date-fns';
import { ChevronLeft, ChevronRight, Sparkles, Users, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UpcomingOneOnOneEvent, OneOnOneMember } from './OneOnOnesView';

// ── Constants ────────────────────────────────────────────────────────────────

const HOUR_PX = 64;        // px per hour
const START_HOUR = 7;      // 7 am
const END_HOUR = 20;       // 8 pm
const TOTAL_HOURS = END_HOUR - START_HOUR;
const GUTTER_W = 52;       // time-label column width in px

// ── Category colours ─────────────────────────────────────────────────────────

const CAT: Record<string, { bg: string; dark: string }> = {
  direct_report: { bg: '#3B82F6', dark: '#1D4ED8' },
  skip_level:    { bg: '#8B5CF6', dark: '#6D28D9' },
  peer:          { bg: '#6B7280', dark: '#4B5563' },
  boss:          { bg: '#1E40AF', dark: '#1E3A8A' },
  stakeholder:   { bg: '#64748B', dark: '#475569' },
  external:      { bg: '#78716C', dark: '#57534E' },
};
const GROUP_CAT = { bg: '#6366F1', dark: '#4338CA' };
const fallbackCat = { bg: '#64748B', dark: '#475569' };

function catFor(ev: UpcomingOneOnOneEvent) {
  return ev.attendee_count > 1 ? GROUP_CAT : (CAT[ev.inferred_category] ?? fallbackCat);
}

// ── Name helpers ─────────────────────────────────────────────────────────────

function displayName(ev: UpcomingOneOnOneEvent): string {
  if (ev.attendee_count > 1) return ev.title ?? 'Group meeting';
  const raw = ev.team_member?.name ?? ev.attendee_name ?? ev.attendee_email ?? 'Unknown';
  return raw.includes('@') ? raw.split('@')[0] : raw;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ── Overlap layout ────────────────────────────────────────────────────────────

interface Laid extends UpcomingOneOnOneEvent {
  colIndex: number;
  colCount: number;
}

function layOut(events: UpcomingOneOnOneEvent[]): Laid[] {
  const sorted = [...events].sort((a, b) => a.start_time.localeCompare(b.start_time));
  const colEnds: number[] = [];
  const assigned: Array<{ ev: UpcomingOneOnOneEvent; col: number }> = [];

  for (const ev of sorted) {
    const s = new Date(ev.start_time).getTime();
    const e = new Date(ev.end_time).getTime();
    let col = colEnds.findIndex(end => end <= s);
    if (col === -1) { col = colEnds.length; colEnds.push(e); } else { colEnds[col] = e; }
    assigned.push({ ev, col });
  }

  return assigned.map(({ ev, col }) => {
    const s = new Date(ev.start_time).getTime();
    const e = new Date(ev.end_time).getTime();
    const overlapping = new Set<number>();
    for (const { ev: o, col: oc } of assigned) {
      const os = new Date(o.start_time).getTime();
      const oe = new Date(o.end_time).getTime();
      if (os < e && oe > s) overlapping.add(oc);
    }
    return { ...ev, colIndex: col, colCount: overlapping.size };
  });
}

// ── Current time indicator ────────────────────────────────────────────────────

function timeToTop(date: Date): number {
  const h = date.getHours() + date.getMinutes() / 60;
  return (h - START_HOUR) * HOUR_PX;
}

// ── Event block ──────────────────────────────────────────────────────────────

function EventBlock({
  ev, onOpen, loading, runningPrepEventIds, onSelectEvent,
}: {
  ev: Laid;
  onOpen: (m: OneOnOneMember) => void;
  loading: boolean;
  runningPrepEventIds?: Set<string>;
  onSelectEvent?: (ev: UpcomingOneOnOneEvent) => void;
}) {
  const start = new Date(ev.start_time);
  const end = new Date(ev.end_time);
  const startH = start.getHours() + start.getMinutes() / 60;
  const endH = end.getHours() + end.getMinutes() / 60;
  const top = Math.max(startH - START_HOUR, 0) * HOUR_PX;
  const height = Math.max(Math.min(endH, END_HOUR) - Math.max(startH, START_HOUR), 0) * HOUR_PX;
  const minH = Math.max(height, 22);

  const colW = 100 / ev.colCount;
  const colL = colW * ev.colIndex;

  const cat = catFor(ev);
  const name = displayName(ev);
  const isGroup = ev.attendee_count > 1;
  const isRunning = runningPrepEventIds?.has(ev.id) ?? false;
  const hasPrep = ev.prep_available;
  const short = minH < 40;

  return (
    <button
      onClick={() => {
        if (onSelectEvent) { onSelectEvent(ev); return; }
        if (ev.team_member && !loading) onOpen(ev.team_member);
      }}
      disabled={loading || (!ev.team_member && !isGroup)}
      className="absolute text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
      style={{
        top,
        height: minH,
        left: `calc(${colL}% + 2px)`,
        width: `calc(${colW}% - 4px)`,
        zIndex: 10,
      }}
    >
      <div
        className="h-full w-full rounded-sm overflow-hidden flex flex-col px-1.5 py-1 transition-all hover:brightness-110 active:scale-[0.99]"
        style={{ backgroundColor: cat.bg }}
      >
        {isGroup ? (
          <div className="flex items-center gap-1 min-w-0">
            <Users className="h-2.5 w-2.5 text-white/80 flex-shrink-0" />
            <span className="text-[11px] font-semibold text-white truncate leading-tight">{name}</span>
          </div>
        ) : (
          <span className="text-[11px] font-semibold text-white truncate leading-tight">{name}</span>
        )}

        {!short && (
          <span className="text-[10px] text-white/70 tabular-nums leading-tight">
            {format(start, 'h:mm')}–{format(end, 'h:mm a')}
          </span>
        )}

        {!short && (
          <span className="mt-auto">
            {isRunning ? (
              <Loader2 className="h-2.5 w-2.5 text-white/60 animate-spin" />
            ) : hasPrep ? (
              <Sparkles className="h-2.5 w-2.5 text-emerald-300" />
            ) : null}
          </span>
        )}
      </div>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface CalendarWeekViewProps {
  upcomingEvents: UpcomingOneOnOneEvent[];
  pastEvents?: UpcomingOneOnOneEvent[];
  onOpen: (m: OneOnOneMember) => void;
  loading: boolean;
  runningPrepEventIds?: Set<string>;
  onSelectEvent?: (ev: UpcomingOneOnOneEvent) => void;
}

export function CalendarWeekView({
  upcomingEvents, pastEvents = [], onOpen, loading, runningPrepEventIds, onSelectEvent,
}: CalendarWeekViewProps) {
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [now, setNow] = useState(new Date());
  const scrollRef = useRef<HTMLDivElement>(null);

  // Tick current time every minute
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Auto-scroll to current time on mount
  useEffect(() => {
    if (!scrollRef.current) return;
    const top = Math.max(timeToTop(new Date()) - 80, 0);
    scrollRef.current.scrollTop = top;
  }, []);

  const days = useMemo(() => [0, 1, 2, 3, 4].map(i => addDays(weekStart, i)), [weekStart]);

  const allEvents = useMemo(() =>
    [...upcomingEvents, ...pastEvents].filter(e => e.status !== 'cancelled'),
  [upcomingEvents, pastEvents]);

  // Group events by date key, lay out overlaps per day
  const laidByDay = useMemo(() => {
    const map = new Map<string, Laid[]>();
    for (const ev of allEvents) {
      const key = format(new Date(ev.start_time), 'yyyy-MM-dd');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev as Laid);
    }
    const result = new Map<string, Laid[]>();
    for (const [key, evs] of map) result.set(key, layOut(evs));
    return result;
  }, [allEvents]);

  const nowTop = timeToTop(now);
  const showNow = isToday(now) && days.some(d => isSameDay(d, now));
  const nowDayIndex = days.findIndex(d => isSameDay(d, now));

  const goToday = () => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));

  const isCurrentWeek = isSameDay(weekStart, startOfWeek(new Date(), { weekStartsOn: 1 }));

  return (
    <div className="flex flex-col h-full min-h-0 bg-white overflow-hidden">

      {/* ── Week nav ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 flex-shrink-0">
        <button
          onClick={() => setWeekStart(w => subWeeks(w, 1))}
          className="p-1 rounded hover:bg-gray-100 text-gray-500 transition-colors"
          aria-label="Previous week"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => setWeekStart(w => addWeeks(w, 1))}
          className="p-1 rounded hover:bg-gray-100 text-gray-500 transition-colors"
          aria-label="Next week"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        <span className="text-sm font-semibold text-gray-800 tabular-nums">
          {format(weekStart, 'MMMM yyyy')}
        </span>

        {!isCurrentWeek && (
          <button
            onClick={goToday}
            className="text-xs px-2.5 py-0.5 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Today
          </button>
        )}
      </div>

      {/* ── Day header row ───────────────────────────────────────────────── */}
      <div
        className="flex border-b border-gray-100 flex-shrink-0"
        style={{ paddingLeft: GUTTER_W }}
      >
        {days.map((day) => {
          const today = isToday(day);
          return (
            <div
              key={day.toISOString()}
              className={cn('flex-1 py-2 text-center border-l border-gray-100', today && 'bg-blue-50/60')}
            >
              <div className={cn('text-[10px] uppercase tracking-wide font-medium', today ? 'text-blue-600' : 'text-gray-400')}>
                {format(day, 'EEE')}
              </div>
              <div className={cn(
                'text-sm font-bold mx-auto mt-0.5 w-7 h-7 flex items-center justify-center rounded-full tabular-nums',
                today ? 'bg-blue-600 text-white' : 'text-gray-700',
              )}>
                {format(day, 'd')}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Scrollable time grid ─────────────────────────────────────────── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0">
        <div className="flex" style={{ height: TOTAL_HOURS * HOUR_PX }}>

          {/* Time labels */}
          <div className="flex-shrink-0 relative select-none" style={{ width: GUTTER_W }}>
            {Array.from({ length: TOTAL_HOURS }, (_, i) => (
              <div
                key={i}
                className="absolute right-2 text-[10px] text-gray-400 tabular-nums -translate-y-2"
                style={{ top: i * HOUR_PX }}
              >
                {format(new Date(0, 0, 0, START_HOUR + i), 'h a')}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day, dayIdx) => {
            const key = format(day, 'yyyy-MM-dd');
            const events = laidByDay.get(key) ?? [];
            const today = isToday(day);

            return (
              <div
                key={key}
                className={cn('flex-1 relative border-l border-gray-100', today && 'bg-blue-50/20')}
                style={{ height: TOTAL_HOURS * HOUR_PX }}
              >
                {/* Hour lines */}
                {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                  <div
                    key={i}
                    className="absolute inset-x-0 border-t border-gray-100"
                    style={{ top: i * HOUR_PX }}
                  />
                ))}
                {/* Half-hour lines */}
                {Array.from({ length: TOTAL_HOURS }, (_, i) => (
                  <div
                    key={`h${i}`}
                    className="absolute inset-x-0 border-t border-gray-50"
                    style={{ top: i * HOUR_PX + HOUR_PX / 2 }}
                  />
                ))}

                {/* Current time indicator */}
                {showNow && nowDayIndex === dayIdx && (
                  <div
                    className="absolute inset-x-0 z-20 flex items-center"
                    style={{ top: nowTop }}
                  >
                    <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 flex-shrink-0" />
                    <div className="flex-1 h-px bg-red-400" />
                  </div>
                )}

                {/* Events */}
                {events.map(ev => (
                  <EventBlock
                    key={ev.id}
                    ev={ev}
                    onOpen={onOpen}
                    loading={loading}
                    runningPrepEventIds={runningPrepEventIds}
                    onSelectEvent={onSelectEvent}
                  />
                ))}

                {/* Empty state for today */}
                {today && events.length === 0 && (
                  <div
                    className="absolute inset-x-2 flex items-center justify-center text-[10px] text-gray-300"
                    style={{ top: nowTop + 8, height: 24 }}
                  >
                    No meetings
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
