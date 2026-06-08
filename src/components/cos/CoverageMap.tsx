import React, { useEffect, useMemo, useState } from 'react';
import { differenceInCalendarDays, format } from 'date-fns';
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, Clock, Lightbulb, TrendingDown, TrendingUp,
} from 'lucide-react';
import { parseLocalDate } from '@/lib/dateUtils';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import type { OneOnOneMember, UpcomingOneOnOneEvent, MemberRelationshipType } from './OneOnOnesView';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CoverageMapProps {
  members: OneOnOneMember[];
  upcomingEvents: UpcomingOneOnOneEvent[];
  onViewPrep: (member: OneOnOneMember) => void;
}

type CadenceHealth = 'healthy' | 'due-soon' | 'overdue' | 'stale' | 'never';

interface MemberCadence {
  member: OneOnOneMember;
  avgDaysBetween: number | null;
  daysSinceLast: number | null;
  meetingCount: number;
  health: CadenceHealth;
  topicCount: number;
  activeBlockers: number;
}

interface CadenceInsight {
  type: 'asymmetry' | 'overdue' | 'frequency-high' | 'frequency-low' | 'coverage-gap';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  detail: string;
  memberIds: string[];
}

type RingId = 'inner-circle' | 'reports' | 'cross-functional' | 'extended';

// ── Constants ─────────────────────────────────────────────────────────────────

const RING_CONFIG: { id: RingId; label: string; types: MemberRelationshipType[] }[] = [
  { id: 'inner-circle', label: 'Inner Circle', types: ['boss', 'peer'] },
  { id: 'reports', label: 'Direct Reports', types: ['direct_report'] },
  { id: 'cross-functional', label: 'Cross-functional', types: ['collaborator', 'stakeholder'] },
  { id: 'extended', label: 'Extended', types: ['skip_level', 'external'] },
];

const EXPECTED_CADENCE_DAYS: Record<MemberRelationshipType, number> = {
  boss: 7,
  direct_report: 7,
  peer: 14,
  collaborator: 14,
  skip_level: 30,
  stakeholder: 30,
  external: 30,
};

const REL_LABELS: Record<MemberRelationshipType, string> = {
  boss: 'Manager',
  direct_report: 'Direct report',
  peer: 'Peer',
  collaborator: 'Collaborator',
  skip_level: 'Skip-level',
  stakeholder: 'Stakeholder',
  external: 'External',
};

const HEALTH_COLORS: Record<CadenceHealth, { fill: string; stroke: string; text: string; label: string }> = {
  healthy:   { fill: 'fill-emerald-500 dark:fill-emerald-600', stroke: '', text: 'fill-white', label: 'On track' },
  'due-soon': { fill: 'fill-yellow-400 dark:fill-yellow-500', stroke: '', text: 'fill-yellow-900 dark:fill-yellow-100', label: 'Due soon' },
  overdue:   { fill: 'fill-orange-500 dark:fill-orange-600', stroke: '', text: 'fill-white', label: 'Overdue' },
  stale:     { fill: 'fill-red-500 dark:fill-red-600', stroke: '', text: 'fill-white', label: 'Stale' },
  never:     { fill: 'fill-muted dark:fill-muted', stroke: 'stroke-muted-foreground/30', text: 'fill-muted-foreground', label: 'Never met' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function computeHealth(
  daysSinceLast: number | null,
  expectedCadence: number,
): CadenceHealth {
  if (daysSinceLast == null) return 'never';
  const ratio = daysSinceLast / expectedCadence;
  if (ratio <= 1.0) return 'healthy';
  if (ratio <= 1.5) return 'due-soon';
  if (ratio <= 2.5) return 'overdue';
  return 'stale';
}

function computeAvgCadence(eventDates: Date[]): number | null {
  if (eventDates.length < 2) return null;
  const sorted = [...eventDates].sort((a, b) => a.getTime() - b.getTime());
  let totalGap = 0;
  for (let i = 1; i < sorted.length; i++) {
    totalGap += differenceInCalendarDays(sorted[i], sorted[i - 1]);
  }
  return Math.round(totalGap / (sorted.length - 1));
}

function generateInsights(cadences: MemberCadence[]): CadenceInsight[] {
  const insights: CadenceInsight[] = [];

  // Group by ring/tier for peer comparison
  const byRing = new Map<RingId, MemberCadence[]>();
  for (const c of cadences) {
    const ring = RING_CONFIG.find(r => r.types.includes(c.member.relationship_type));
    if (!ring) continue;
    const list = byRing.get(ring.id) ?? [];
    list.push(c);
    byRing.set(ring.id, list);
  }

  // 1. Cadence asymmetry within the same tier
  for (const [ringId, group] of byRing) {
    if (group.length < 2) continue;
    const withCadence = group.filter(c => c.avgDaysBetween != null && c.avgDaysBetween > 0);
    if (withCadence.length < 2) continue;

    const sorted = [...withCadence].sort((a, b) => a.avgDaysBetween! - b.avgDaysBetween!);
    const fastest = sorted[0];
    const slowest = sorted[sorted.length - 1];

    if (slowest.avgDaysBetween! >= fastest.avgDaysBetween! * 2.5) {
      const ringLabel = RING_CONFIG.find(r => r.id === ringId)?.label ?? ringId;
      insights.push({
        type: 'asymmetry',
        severity: 'warning',
        title: `Cadence gap in ${ringLabel}`,
        detail: `You meet ${fastest.member.name} every ~${fastest.avgDaysBetween}d but ${slowest.member.name} only every ~${slowest.avgDaysBetween}d. They're at the same tier — is this intentional?`,
        memberIds: [fastest.member.id, slowest.member.id],
      });
    }
  }

  // 2. Overdue / stale meetings
  const overdue = cadences.filter(c => c.health === 'overdue' || c.health === 'stale');
  for (const c of overdue) {
    const expected = EXPECTED_CADENCE_DAYS[c.member.relationship_type];
    insights.push({
      type: 'overdue',
      severity: c.health === 'stale' ? 'critical' : 'warning',
      title: `${c.member.name} is ${c.health === 'stale' ? 'significantly ' : ''}overdue`,
      detail: `Last met ${c.daysSinceLast}d ago (expected every ~${expected}d). ${c.activeBlockers > 0 ? `They have ${c.activeBlockers} active blocker(s).` : ''}`,
      memberIds: [c.member.id],
    });
  }

  // 3. High-frequency meetings that might be reducible (meeting more often than expected + low topic count)
  const highFreq = cadences.filter(c =>
    c.avgDaysBetween != null
    && c.avgDaysBetween > 0
    && c.avgDaysBetween < EXPECTED_CADENCE_DAYS[c.member.relationship_type] * 0.6
    && c.topicCount <= 2
    && c.meetingCount >= 4,
  );
  for (const c of highFreq) {
    const expected = EXPECTED_CADENCE_DAYS[c.member.relationship_type];
    insights.push({
      type: 'frequency-high',
      severity: 'info',
      title: `Consider spacing out ${c.member.name}`,
      detail: `Meeting every ~${c.avgDaysBetween}d (typical for ${REL_LABELS[c.member.relationship_type].toLowerCase()}s: ${expected}d) with only ${c.topicCount} active topic(s). Could this be biweekly?`,
      memberIds: [c.member.id],
    });
  }

  // 4. Low-frequency meetings with high topic density
  const lowFreq = cadences.filter(c =>
    c.avgDaysBetween != null
    && c.avgDaysBetween > EXPECTED_CADENCE_DAYS[c.member.relationship_type] * 1.8
    && (c.topicCount >= 5 || c.activeBlockers >= 2)
    && c.meetingCount >= 2,
  );
  for (const c of lowFreq) {
    insights.push({
      type: 'frequency-low',
      severity: 'warning',
      title: `${c.member.name} might need more time`,
      detail: `Meeting every ~${c.avgDaysBetween}d but ${c.topicCount} active topic(s)${c.activeBlockers > 0 ? ` and ${c.activeBlockers} blocker(s)` : ''}. Consider increasing cadence.`,
      memberIds: [c.member.id],
    });
  }

  // 5. Coverage gaps — people never met
  const neverMet = cadences.filter(c => c.health === 'never');
  if (neverMet.length > 0) {
    insights.push({
      type: 'coverage-gap',
      severity: neverMet.length >= 3 ? 'warning' : 'info',
      title: `${neverMet.length} people with no 1:1 history`,
      detail: neverMet.map(c => c.member.name).join(', '),
      memberIds: neverMet.map(c => c.member.id),
    });
  }

  return insights.sort((a, b) => {
    const sev = { critical: 0, warning: 1, info: 2 };
    return sev[a.severity] - sev[b.severity];
  });
}

// ── Main component ────────────────────────────────────────────────────────────

export function CoverageMap({ members, upcomingEvents, onViewPrep }: CoverageMapProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [historicalEvents, setHistoricalEvents] = useState<Map<string, Date[]>>(new Map());
  const [topicCounts, setTopicCounts] = useState<Map<string, { total: number; blockers: number }>>(new Map());
  const [loaded, setLoaded] = useState(false);

  // Load historical meeting events + topic counts
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;

      const memberIds = members.map(m => m.id);
      if (memberIds.length === 0) { setLoaded(true); return; }

      const [eventsRes, topicsRes] = await Promise.all([
        db.from('cos_one_on_one_events')
          .select('team_member_id, start_time')
          .eq('user_id', user.id)
          .in('team_member_id', memberIds)
          .eq('status', 'confirmed')
          .order('start_time', { ascending: true }),
        db.from('cos_relationship_topics')
          .select('team_member_id, category, status')
          .eq('user_id', user.id)
          .in('team_member_id', memberIds)
          .eq('status', 'active'),
      ]);

      if (cancelled) return;

      const eventMap = new Map<string, Date[]>();
      for (const ev of (eventsRes.data ?? []) as { team_member_id: string; start_time: string }[]) {
        const list = eventMap.get(ev.team_member_id) ?? [];
        list.push(new Date(ev.start_time));
        eventMap.set(ev.team_member_id, list);
      }
      setHistoricalEvents(eventMap);

      const topicMap = new Map<string, { total: number; blockers: number }>();
      for (const t of (topicsRes.data ?? []) as { team_member_id: string; category: string; status: string }[]) {
        const cur = topicMap.get(t.team_member_id) ?? { total: 0, blockers: 0 };
        cur.total++;
        if (t.category === 'blocker' || t.category === 'escalation') cur.blockers++;
        topicMap.set(t.team_member_id, cur);
      }
      setTopicCounts(topicMap);
      setLoaded(true);
    }
    load();
    return () => { cancelled = true; };
  }, [members]);

  // Build cadence data per member
  const cadences: MemberCadence[] = useMemo(() => {
    return members.map(member => {
      const events = historicalEvents.get(member.id) ?? [];
      const avgDaysBetween = computeAvgCadence(events);
      const daysSinceLast = member.last_1on1_date
        ? differenceInCalendarDays(new Date(), parseLocalDate(member.last_1on1_date))
        : null;
      const expected = EXPECTED_CADENCE_DAYS[member.relationship_type];
      const health = computeHealth(daysSinceLast, expected);
      const topics = topicCounts.get(member.id) ?? { total: 0, blockers: 0 };

      return {
        member,
        avgDaysBetween,
        daysSinceLast,
        meetingCount: events.length,
        health,
        topicCount: topics.total,
        activeBlockers: topics.blockers,
      };
    });
  }, [members, historicalEvents, topicCounts]);

  const insights = useMemo(() => generateInsights(cadences), [cadences]);

  const rings = useMemo(() => {
    return RING_CONFIG.map(ring => ({
      ...ring,
      members: cadences.filter(c => ring.types.includes(c.member.relationship_type)),
    })).filter(ring => ring.members.length > 0);
  }, [cadences]);

  // Stats
  const healthCounts = useMemo(() => {
    const counts = { healthy: 0, 'due-soon': 0, overdue: 0, stale: 0, never: 0 };
    for (const c of cadences) counts[c.health]++;
    return counts;
  }, [cadences]);

  const cx = 300;
  const cy = 300;
  const ringRadii = [0, 85, 155, 215, 265];
  const nodeRadius = 24;

  if (members.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <Clock className="w-7 h-7 text-muted-foreground" />
        </div>
        <h3 className="font-heading text-lg font-semibold mb-1">No team members yet</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          Add team members or connect your calendar to see your 1:1 coverage map and cadence insights.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1">
        {(['healthy', 'due-soon', 'overdue', 'stale', 'never'] as CadenceHealth[]).map(h => {
          const count = healthCounts[h];
          if (count === 0) return null;
          const colors = HEALTH_COLORS[h];
          return (
            <div key={h} className="flex items-center gap-1.5">
              <div className={cn('w-2.5 h-2.5 rounded-full', colors.fill.replace('fill-', 'bg-').split(' ')[0])} />
              <span className="text-xs text-muted-foreground">{colors.label} ({count})</span>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
        {/* SVG canvas */}
        <div className="flex justify-center">
          <TooltipProvider delayDuration={150}>
            <svg
              viewBox="0 0 600 600"
              className="w-full max-w-[560px] h-auto"
              role="img"
              aria-label="1:1 coverage map"
            >
              {/* Ring circles */}
              {rings.map((ring, ringIdx) => {
                const r = ringRadii[ringIdx + 1];
                return (
                  <circle
                    key={ring.id}
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill="none"
                    stroke="currentColor"
                    className="text-muted-foreground/10"
                    strokeWidth={1}
                    strokeDasharray="4 4"
                  />
                );
              })}

              {/* Ring labels */}
              {rings.map((ring, ringIdx) => {
                const r = ringRadii[ringIdx + 1];
                return (
                  <text
                    key={`label-${ring.id}`}
                    x={cx}
                    y={cy - r + 13}
                    textAnchor="middle"
                    className="fill-muted-foreground/40"
                    style={{ fontSize: 9.5 }}
                  >
                    {ring.label}
                  </text>
                );
              })}

              {/* Center node */}
              <circle cx={cx} cy={cy} r={28} className="fill-primary" />
              <text
                x={cx}
                y={cy + 1}
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-primary-foreground font-semibold"
                style={{ fontSize: 12 }}
              >
                You
              </text>

              {/* Member nodes */}
              {rings.map((ring, ringIdx) => {
                const r = ringRadii[ringIdx + 1];
                const count = ring.members.length;
                return ring.members.map((cadence, i) => {
                  const angle = count === 1
                    ? -Math.PI / 2
                    : -Math.PI / 2 + (i / count) * 2 * Math.PI;
                  const nx = cx + r * Math.cos(angle);
                  const ny = cy + r * Math.sin(angle);

                  return (
                    <MemberNode
                      key={cadence.member.id}
                      cadence={cadence}
                      x={nx}
                      y={ny}
                      r={nodeRadius}
                      isHovered={hoveredId === cadence.member.id}
                      isHighlighted={insights.some(ins => ins.memberIds.includes(cadence.member.id) && ins.severity !== 'info')}
                      onHover={setHoveredId}
                      onClick={() => onViewPrep(cadence.member)}
                    />
                  );
                });
              })}
            </svg>
          </TooltipProvider>
        </div>

        {/* Insights panel */}
        <div className="space-y-3">
          <h3 className="font-heading text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
            <Lightbulb className="w-3.5 h-3.5" />
            Cadence Insights
          </h3>

          {!loaded ? (
            <p className="text-xs text-muted-foreground">Analyzing meeting patterns...</p>
          ) : insights.length === 0 ? (
            <Card>
              <CardContent className="py-4 px-4">
                <p className="text-sm text-muted-foreground">
                  Your meeting cadence looks well-balanced. No issues detected.
                </p>
              </CardContent>
            </Card>
          ) : (
            insights.slice(0, 6).map((insight, idx) => (
              <InsightCard
                key={idx}
                insight={insight}
                onHoverMembers={setHoveredId}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

function MemberNode({
  cadence,
  x,
  y,
  r,
  isHovered,
  isHighlighted,
  onHover,
  onClick,
}: {
  cadence: MemberCadence;
  x: number;
  y: number;
  r: number;
  isHovered: boolean;
  isHighlighted: boolean;
  onHover: (id: string | null) => void;
  onClick: () => void;
}) {
  const { member, health, daysSinceLast, avgDaysBetween, meetingCount, topicCount, activeBlockers } = cadence;
  const label = initials(member.name);
  const relLabel = REL_LABELS[member.relationship_type] ?? 'Team';
  const colors = HEALTH_COLORS[health];
  const expected = EXPECTED_CADENCE_DAYS[member.relationship_type];

  const lastText = daysSinceLast != null
    ? daysSinceLast === 0 ? 'Today' : daysSinceLast === 1 ? 'Yesterday' : `${daysSinceLast}d ago`
    : 'Never';

  const cadenceText = avgDaysBetween != null ? `Every ~${avgDaysBetween}d` : meetingCount > 0 ? '1 meeting' : 'No data';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <g
          className="cursor-pointer"
          onMouseEnter={() => onHover(member.id)}
          onMouseLeave={() => onHover(null)}
          onClick={onClick}
          role="button"
          tabIndex={0}
          aria-label={`${member.name} — ${relLabel} — ${colors.label}`}
        >
          {/* Highlight ring for insight-flagged nodes */}
          {(isHighlighted || isHovered) && (
            <circle
              cx={x}
              cy={y}
              r={r + 4}
              fill="none"
              stroke={health === 'stale' ? '#ef4444' : health === 'overdue' ? '#f97316' : '#3b82f6'}
              strokeWidth={2}
              opacity={isHovered ? 0.9 : 0.5}
              className="transition-opacity"
            />
          )}
          {/* Blocker indicator */}
          {activeBlockers > 0 && (
            <circle
              cx={x + r * 0.65}
              cy={y - r * 0.65}
              r={6}
              className="fill-red-500"
              stroke="white"
              strokeWidth={1.5}
            />
          )}
          {/* Main circle */}
          <circle
            cx={x}
            cy={y}
            r={r}
            className={cn('transition-all duration-150', colors.fill)}
            strokeWidth={health === 'never' ? 1.5 : 0}
            style={{
              filter: isHovered ? 'brightness(1.15)' : undefined,
              transform: isHovered ? 'scale(1.08)' : undefined,
              transformOrigin: `${x}px ${y}px`,
            }}
          />
          {/* Initials */}
          <text
            x={x}
            y={y + 1}
            textAnchor="middle"
            dominantBaseline="central"
            className={cn('font-semibold pointer-events-none select-none', colors.text)}
            style={{ fontSize: 11 }}
          >
            {label}
          </text>
        </g>
      </TooltipTrigger>
      <TooltipContent side="top" className="space-y-1 max-w-[200px]">
        <p className="font-medium text-sm">{member.name}</p>
        <div className="flex items-center gap-1.5 text-xs">
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{relLabel}</Badge>
          <Badge
            variant="outline"
            className={cn('text-[10px] px-1.5 py-0', {
              'border-emerald-500 text-emerald-600': health === 'healthy',
              'border-yellow-500 text-yellow-600': health === 'due-soon',
              'border-orange-500 text-orange-600': health === 'overdue',
              'border-red-500 text-red-600': health === 'stale',
              'border-muted-foreground/30 text-muted-foreground': health === 'never',
            })}
          >
            {colors.label}
          </Badge>
        </div>
        <div className="text-xs text-muted-foreground space-y-0.5 pt-0.5">
          <p>Last: {lastText} · Expected: ~{expected}d</p>
          <p>Cadence: {cadenceText} ({meetingCount} meetings)</p>
          {topicCount > 0 && <p>{topicCount} active topic{topicCount !== 1 ? 's' : ''}{activeBlockers > 0 ? ` · ${activeBlockers} blocker(s)` : ''}</p>}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function InsightCard({
  insight,
  onHoverMembers,
}: {
  insight: CadenceInsight;
  onHoverMembers: (id: string | null) => void;
}) {
  const Icon = insight.severity === 'critical'
    ? AlertTriangle
    : insight.type === 'frequency-high'
    ? TrendingDown
    : insight.type === 'frequency-low'
    ? TrendingUp
    : insight.type === 'asymmetry'
    ? ArrowUpRight
    : insight.type === 'coverage-gap'
    ? Clock
    : ArrowDownRight;

  return (
    <Card
      className={cn(
        'transition-colors cursor-default',
        insight.severity === 'critical' && 'border-red-200 dark:border-red-900/40',
        insight.severity === 'warning' && 'border-orange-200 dark:border-orange-900/40',
      )}
      onMouseEnter={() => {
        if (insight.memberIds.length === 1) onHoverMembers(insight.memberIds[0]);
      }}
      onMouseLeave={() => onHoverMembers(null)}
    >
      <CardContent className="py-3 px-3.5 space-y-1">
        <div className="flex items-start gap-2">
          <Icon className={cn(
            'w-3.5 h-3.5 mt-0.5 flex-shrink-0',
            insight.severity === 'critical' ? 'text-red-500' :
            insight.severity === 'warning' ? 'text-orange-500' : 'text-blue-500',
          )} />
          <div className="min-w-0">
            <p className="text-sm font-medium leading-tight">{insight.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{insight.detail}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
