import React, { useEffect, useMemo, useRef, useState } from 'react';
import { differenceInCalendarDays } from 'date-fns';
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, Clock, Lightbulb, TrendingDown, TrendingUp,
} from 'lucide-react';
import { parseLocalDate } from '@/lib/dateUtils';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  /** Effective relationship type — prefers org-chart-inferred category from calendar
   *  events over the raw cos_team_members.relationship_type, matching the list view. */
  effectiveType: MemberRelationshipType;
  cadenceLabel: string;        // "Weekly", "Biweekly", etc. — from calendar sync, or "—"
  cadenceDays: number | null;  // avg days between meetings — from calendar sync
  daysSinceLast: number | null;
  meetingCount: number;
  health: CadenceHealth;
  topicCount: number;
  activeBlockers: number;
  nextExpectedIn: number | null;
}

interface CadenceInsight {
  type: 'asymmetry' | 'overdue' | 'frequency-high' | 'frequency-low' | 'coverage-gap';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  detail: string;
  memberIds: string[];
}

type RingId = 'inner-circle' | 'my-org' | 'cross-functional';

// ── Constants ─────────────────────────────────────────────────────────────────

const RING_CONFIG: { id: RingId; label: string; types: MemberRelationshipType[] }[] = [
  { id: 'inner-circle', label: 'Inner Circle', types: ['boss', 'peer'] },
  { id: 'my-org', label: 'My Org', types: ['direct_report', 'skip_level'] },
  { id: 'cross-functional', label: 'Cross-functional', types: ['collaborator', 'stakeholder', 'external'] },
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

/** Outline color per relationship type — matches the palette from OneOnOnesView. */
const REL_OUTLINE: Record<MemberRelationshipType, { color: string; label: string; dash?: string }> = {
  boss:          { color: '#254677', label: 'My manager' },
  direct_report: { color: '#2563eb', label: 'Direct reports' },
  skip_level:    { color: '#8b5cf6', label: 'Downline', dash: '4 3' },
  peer:          { color: '#9ca3af', label: 'Peers' },
  collaborator:  { color: '#0d9488', label: 'Collaborators' },
  stakeholder:   { color: '#64748b', label: 'Stakeholders', dash: '4 3' },
  external:      { color: '#78716c', label: 'External', dash: '2 3' },
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

/** Fallback label when server hasn't computed cadence yet. */
function fallbackCadenceLabel(avgDays: number | null): string {
  if (avgDays == null) return '—';
  if (avgDays >= 5 && avgDays <= 9) return 'Weekly';
  if (avgDays >= 10 && avgDays <= 18) return 'Biweekly';
  if (avgDays >= 25 && avgDays <= 38) return 'Monthly';
  return `~${avgDays}d`;
}

function generateInsights(cadences: MemberCadence[]): CadenceInsight[] {
  const insights: CadenceInsight[] = [];

  // Group by ring/tier for peer comparison
  const byRing = new Map<RingId, MemberCadence[]>();
  for (const c of cadences) {
    const ring = RING_CONFIG.find(r => r.types.includes(c.effectiveType));
    if (!ring) continue;
    const list = byRing.get(ring.id) ?? [];
    list.push(c);
    byRing.set(ring.id, list);
  }

  // 1. Cadence asymmetry within the same tier
  for (const [ringId, group] of byRing) {
    if (group.length < 2) continue;
    const withCadence = group.filter(c => c.cadenceDays != null && c.cadenceDays > 0);
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
        detail: `You meet ${fastest.member.name} ${fastest.cadenceLabel.toLowerCase()} but ${slowest.member.name} only ${slowest.cadenceLabel.toLowerCase()}. They're at the same tier — is this intentional?`,
        memberIds: [fastest.member.id, slowest.member.id],
      });
    }
  }

  // 2. Overdue / stale meetings
  const overdue = cadences.filter(c => c.health === 'overdue' || c.health === 'stale');
  for (const c of overdue) {
    const expected = EXPECTED_CADENCE_DAYS[c.effectiveType];
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
    c.cadenceDays != null
    && c.cadenceDays > 0
    && c.cadenceDays < EXPECTED_CADENCE_DAYS[c.effectiveType] * 0.6
    && c.topicCount <= 2
    && c.meetingCount >= 4,
  );
  for (const c of highFreq) {
    const expected = EXPECTED_CADENCE_DAYS[c.effectiveType];
    insights.push({
      type: 'frequency-high',
      severity: 'info',
      title: `Consider spacing out ${c.member.name}`,
      detail: `Meeting ${c.cadenceLabel.toLowerCase()} (typical for ${REL_LABELS[c.effectiveType].toLowerCase()}s: ${fallbackCadenceLabel(expected).toLowerCase()}) with only ${c.topicCount} active topic(s). Could you meet less often?`,
      memberIds: [c.member.id],
    });
  }

  // 4. Low-frequency meetings with high topic density
  const lowFreq = cadences.filter(c =>
    c.cadenceDays != null
    && c.cadenceDays > EXPECTED_CADENCE_DAYS[c.effectiveType] * 1.8
    && (c.topicCount >= 5 || c.activeBlockers >= 2)
    && c.meetingCount >= 2,
  );
  for (const c of lowFreq) {
    insights.push({
      type: 'frequency-low',
      severity: 'warning',
      title: `${c.member.name} might need more time`,
      detail: `Meeting ${c.cadenceLabel.toLowerCase()} but ${c.topicCount} active topic(s)${c.activeBlockers > 0 ? ` and ${c.activeBlockers} blocker(s)` : ''}. Consider increasing cadence.`,
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
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Convert SVG coordinates to container-relative pixel coordinates for the tooltip
  const svgToPixel = (svgX: number, svgY: number): { x: number; y: number } | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    // SVG viewBox is 0 0 900 900
    const scaleX = rect.width / 900;
    const scaleY = rect.height / 900;
    return { x: svgX * scaleX, y: svgY * scaleY };
  };

  const handleNodeHover = (id: string | null, svgX?: number, svgY?: number) => {
    setHoveredId(id);
    if (id && svgX != null && svgY != null) {
      setHoverPos(svgToPixel(svgX, svgY) ?? null);
    } else {
      setHoverPos(null);
    }
  };
  const [meetingCounts, setMeetingCounts] = useState<Map<string, number>>(new Map());
  const [topicCounts, setTopicCounts] = useState<Map<string, { total: number; blockers: number }>>(new Map());
  /** People discovered from the org chart who aren't in cos_team_members yet. */
  const [orgChartPeers, setOrgChartPeers] = useState<OneOnOneMember[]>([]);
  const [orgTypeByEmail, setOrgTypeByEmail] = useState<Map<string, MemberRelationshipType>>(new Map());
  const [loaded, setLoaded] = useState(false);

  // Load org chart + meeting counts + topic counts.
  // The org chart query finds peers (same boss), direct reports, and skip-levels
  // directly from profiles.manager_email — including people NOT in cos_team_members.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;

      const memberIds = members.map(m => m.id);

      const [eventsRes, topicsRes, myProfileRes, allProfilesRes] = await Promise.all([
        memberIds.length > 0
          ? db.from('cos_one_on_one_events')
              .select('team_member_id')
              .eq('user_id', user.id)
              .in('team_member_id', memberIds)
              .eq('status', 'confirmed')
          : Promise.resolve({ data: [] }),
        memberIds.length > 0
          ? db.from('cos_relationship_topics')
              .select('team_member_id, category')
              .eq('user_id', user.id)
              .in('team_member_id', memberIds)
              .eq('status', 'active')
          : Promise.resolve({ data: [] }),
        db.from('profiles').select('email, full_name, manager_email').eq('id', user.id).maybeSingle()
          .then((r: { data: unknown }) => r).catch(() => ({ data: null })),
        db.from('profiles').select('id, email, full_name, first_name, last_name, manager_email')
          .not('email', 'is', null)
          .then((r: { data: unknown }) => r).catch(() => ({ data: [] })),
      ]);

      if (cancelled) return;

      // ── Build org chart from profiles ───────────────────────────────────────
      type OrgProfile = { id: string; email: string; full_name: string | null; first_name: string | null; last_name: string | null; manager_email: string | null };
      const myProfile = myProfileRes.data as { email: string; full_name: string | null; manager_email: string | null } | null;
      const allProfiles = (allProfilesRes.data ?? []) as OrgProfile[];
      const myEmail = (myProfile?.email ?? user.email ?? '').toLowerCase();
      const myManagerEmail = myProfile?.manager_email?.toLowerCase() ?? null;

      // Classify every profile by org relationship to me
      const orgMap = new Map<string, MemberRelationshipType>();
      for (const p of allProfiles) {
        const pEmail = p.email.toLowerCase();
        const pManager = p.manager_email?.toLowerCase() ?? null;
        if (pEmail === myEmail) continue;
        if (pManager === myEmail) orgMap.set(pEmail, 'direct_report');
        else if (myManagerEmail && pEmail === myManagerEmail) orgMap.set(pEmail, 'boss');
        else if (myManagerEmail && pManager === myManagerEmail) orgMap.set(pEmail, 'peer');
      }
      // Skip-levels: reports to one of my direct reports
      const myDirectEmails = new Set(
        allProfiles.filter(p => p.manager_email?.toLowerCase() === myEmail).map(p => p.email.toLowerCase()),
      );
      for (const p of allProfiles) {
        const pEmail = p.email.toLowerCase();
        if (orgMap.has(pEmail)) continue;
        if (myDirectEmails.has(p.manager_email?.toLowerCase() ?? '')) {
          orgMap.set(pEmail, 'skip_level');
        }
      }
      setOrgTypeByEmail(orgMap);

      // Find people in the org chart who are NOT in cos_team_members.
      // These are coverage gaps — the most valuable thing this visualization can show.
      const memberEmails = new Set(members.map(m => m.email?.toLowerCase()).filter(Boolean));
      const discovered: OneOnOneMember[] = [];
      for (const p of allProfiles) {
        const pEmail = p.email.toLowerCase();
        if (pEmail === myEmail) continue;
        if (memberEmails.has(pEmail)) continue; // already a team member
        const orgType = orgMap.get(pEmail);
        if (!orgType) continue; // not in my org tree
        const name = p.full_name
          ?? ([p.first_name, p.last_name].filter(Boolean).join(' ') || pEmail.split('@')[0]);
        discovered.push({
          id: `org-${p.id}`,  // synthetic ID so we don't collide with real member IDs
          user_id: user.id,
          name,
          email: p.email,
          role: '',
          relationship_type: orgType,
          context_notes: null,
          last_1on1_date: null,
          reports_to_id: null,
          meeting_cadence: null,
          meeting_cadence_days: null,
        });
      }
      setOrgChartPeers(discovered);

      // ── Meeting counts ─────────────────────────────────────────────────────
      const countMap = new Map<string, number>();
      for (const ev of (eventsRes.data ?? []) as { team_member_id: string }[]) {
        countMap.set(ev.team_member_id, (countMap.get(ev.team_member_id) ?? 0) + 1);
      }
      setMeetingCounts(countMap);

      // ── Topic counts ───────────────────────────────────────────────────────
      const topicMap = new Map<string, { total: number; blockers: number }>();
      for (const t of (topicsRes.data ?? []) as { team_member_id: string; category: string }[]) {
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

  // ── Merge team members + org-chart-discovered people ──────────────────────
  const allPeople = useMemo(() => [...members, ...orgChartPeers], [members, orgChartPeers]);

  // ── Resolve effective relationship type ───────────────────────────────────
  // Priority: org chart (from profiles.manager_email) > calendar events > reports_to_id > stored type.
  const resolvedTypeMap = useMemo(() => {
    const map = new Map<string, MemberRelationshipType>();

    // 1. Org chart — authoritative, covers everyone including people not in team list.
    for (const m of allPeople) {
      if (m.email) {
        const orgType = orgTypeByEmail.get(m.email.toLowerCase());
        if (orgType) { map.set(m.id, orgType); continue; }
      }
    }

    // 2. Calendar event inference — for people the org chart missed.
    for (const ev of upcomingEvents) {
      if (ev.team_member_id && ev.inferred_category && !map.has(ev.team_member_id)) {
        const cat = ev.inferred_category as string;
        if (['boss', 'direct_report', 'skip_level', 'peer', 'collaborator', 'stakeholder', 'external'].includes(cat)) {
          map.set(ev.team_member_id, cat as MemberRelationshipType);
        }
      }
    }

    // 3. reports_to_id — for remaining team members, detect skip-levels.
    const directReportIds = new Set(
      allPeople
        .filter(m => (map.get(m.id) ?? m.relationship_type) === 'direct_report')
        .map(m => m.id),
    );
    for (const m of allPeople) {
      if (map.has(m.id)) continue;
      if (m.reports_to_id && directReportIds.has(m.reports_to_id)) {
        map.set(m.id, 'skip_level');
      }
    }

    return map;
  }, [allPeople, upcomingEvents, orgTypeByEmail]);

  // Build cadence data per member — cadence label comes from calendar sync (stored on member)
  const cadences: MemberCadence[] = useMemo(() => {
    return allPeople.map(member => {
      // Use reports_to_id resolution (matches list view), then stored relationship_type.
      const effectiveType = resolvedTypeMap.get(member.id) ?? member.relationship_type;
      const cadenceDays = member.meeting_cadence_days;
      const cadenceLabel = member.meeting_cadence
        ?? fallbackCadenceLabel(cadenceDays);
      const daysSinceLast = member.last_1on1_date
        ? differenceInCalendarDays(new Date(), parseLocalDate(member.last_1on1_date))
        : null;
      const expected = EXPECTED_CADENCE_DAYS[effectiveType];
      // Use the calendar-synced cadence if available, otherwise fall back to tier default
      const effectiveCadence = cadenceDays != null && cadenceDays > 0 ? cadenceDays : expected;
      const health = computeHealth(daysSinceLast, effectiveCadence);
      const topics = topicCounts.get(member.id) ?? { total: 0, blockers: 0 };
      const meetingCount = meetingCounts.get(member.id) ?? 0;

      const nextExpectedIn = daysSinceLast != null && effectiveCadence > 0
        ? effectiveCadence - daysSinceLast
        : null;

      return {
        member,
        effectiveType,
        cadenceLabel,
        cadenceDays,
        daysSinceLast,
        meetingCount,
        health,
        topicCount: topics.total,
        activeBlockers: topics.blockers,
        nextExpectedIn,
      };
    });
  }, [allPeople, resolvedTypeMap, meetingCounts, topicCounts]);

  const insights = useMemo(() => generateInsights(cadences), [cadences]);

  const rings = useMemo(() => {
    return RING_CONFIG.map(ring => ({
      ...ring,
      members: cadences.filter(c => ring.types.includes(c.effectiveType)),
    })).filter(ring => ring.members.length > 0);
  }, [cadences]);

  // Stats
  const healthCounts = useMemo(() => {
    const counts = { healthy: 0, 'due-soon': 0, overdue: 0, stale: 0, never: 0 };
    for (const c of cadences) counts[c.health]++;
    return counts;
  }, [cadences]);

  const cx = 450;
  const cy = 450;
  const ringRadii = [0, 130, 270, 400];
  const nodeRadius = 26;

  if (allPeople.length === 0) {
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
      <div className="space-y-2 px-1">
        {/* Cadence health (fill color) */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
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
        {/* Relationship type (outline color) */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {(['boss', 'direct_report', 'skip_level', 'collaborator', 'peer', 'stakeholder', 'external'] as MemberRelationshipType[]).map(rel => {
            const has = cadences.some(c => c.effectiveType === rel);
            if (!has) return null;
            const outline = REL_OUTLINE[rel];
            return (
              <div key={rel} className="flex items-center gap-1.5">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{
                    border: `2px ${outline.dash ? 'dashed' : 'solid'} ${outline.color}`,
                    background: 'transparent',
                  }}
                />
                <span className="text-xs text-muted-foreground">{outline.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
        {/* SVG canvas */}
        <div className="flex justify-center">
          <div className="relative w-full max-w-[720px]">
            <svg
              ref={svgRef}
              viewBox="0 0 900 900"
              className="w-full h-auto"
              role="img"
              aria-label="1:1 coverage map"
            >
              {/* Ring band shading — alternating fills for each concentric zone */}
              {/* Render from outermost to innermost so inner bands paint over outer ones */}
              {[...rings].reverse().map((ring, revIdx) => {
                const ringIdx = rings.length - 1 - revIdx;
                const outerR = ringRadii[ringIdx + 1];
                // Inner edge: previous ring radius, or a small center gap
                const innerR = ringIdx === 0 ? 40 : ringRadii[ringIdx];
                const isEven = ringIdx % 2 === 0;
                return (
                  <React.Fragment key={`band-${ring.id}`}>
                    {/* Band fill */}
                    <path
                      d={[
                        `M ${cx + outerR} ${cy}`,
                        `A ${outerR} ${outerR} 0 1 0 ${cx - outerR} ${cy}`,
                        `A ${outerR} ${outerR} 0 1 0 ${cx + outerR} ${cy}`,
                        `M ${cx + innerR} ${cy}`,
                        `A ${innerR} ${innerR} 0 1 1 ${cx - innerR} ${cy}`,
                        `A ${innerR} ${innerR} 0 1 1 ${cx + innerR} ${cy}`,
                        'Z',
                      ].join(' ')}
                      fill={isEven ? 'currentColor' : 'transparent'}
                      className="text-muted-foreground/[0.03]"
                      fillRule="evenodd"
                    />
                    {/* Outer border */}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={outerR}
                      fill="none"
                      stroke="currentColor"
                      className="text-muted-foreground/10"
                      strokeWidth={1}
                    />
                  </React.Fragment>
                );
              })}

              {/* Ring labels */}
              {rings.map((ring, ringIdx) => {
                const outerR = ringRadii[ringIdx + 1];
                const innerR = ringIdx === 0 ? 40 : ringRadii[ringIdx];
                const midR = (outerR + innerR) / 2;
                return (
                  <text
                    key={`label-${ring.id}`}
                    x={cx}
                    y={cy - midR - 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="fill-muted-foreground/30"
                    style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase' as const }}
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
                      onHover={(id) => handleNodeHover(id, nx, ny)}
                      onClick={() => onViewPrep(cadence.member)}
                    />
                  );
                });
              })}
            </svg>

            {/* Floating tooltip — positioned over hovered node */}
            {hoveredId && hoverPos && (() => {
              const hovered = cadences.find(c => c.member.id === hoveredId);
              if (!hovered) return null;
              return (
                <NodeTooltip
                  cadence={hovered}
                  x={hoverPos.x}
                  y={hoverPos.y}
                />
              );
            })()}
          </div>
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
                onHoverMembers={(id) => handleNodeHover(id)}
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
  const { member, effectiveType, health, activeBlockers } = cadence;
  const label = initials(member.name);
  const relLabel = REL_LABELS[effectiveType] ?? 'Team';
  const colors = HEALTH_COLORS[health];
  const outline = REL_OUTLINE[effectiveType];

  return (
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
          r={r + 8}
          fill="none"
          stroke={health === 'stale' ? '#ef4444' : health === 'overdue' ? '#f97316' : '#3b82f6'}
          strokeWidth={2}
          opacity={isHovered ? 0.9 : 0.5}
          className="transition-opacity"
        />
      )}
      {/* Relationship type outline — always visible */}
      <circle
        cx={x}
        cy={y}
        r={r + 3}
        fill="none"
        stroke={outline.color}
        strokeWidth={2.5}
        strokeDasharray={outline.dash}
        opacity={isHovered ? 1 : 0.8}
      />
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
      {/* Main circle (health fill) */}
      <circle
        cx={x}
        cy={y}
        r={r}
        className={cn('transition-all duration-150', colors.fill)}
        strokeWidth={0}
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
  );
}

/** HTML tooltip floating above the SVG, positioned at the hovered node. */
function NodeTooltip({ cadence, x, y }: { cadence: MemberCadence; x: number; y: number }) {
  const { member, effectiveType, health, daysSinceLast, cadenceLabel, meetingCount, topicCount, activeBlockers, nextExpectedIn } = cadence;
  const relLabel = REL_LABELS[effectiveType] ?? 'Team';

  const lastText = daysSinceLast != null
    ? daysSinceLast === 0 ? 'Today' : daysSinceLast === 1 ? 'Yesterday' : `${daysSinceLast}d ago`
    : 'Never';

  const nextText = nextExpectedIn != null
    ? nextExpectedIn <= 0 ? 'Now' : nextExpectedIn === 1 ? 'Tomorrow' : `In ${nextExpectedIn}d`
    : null;

  return (
    <div
      className="absolute z-50 pointer-events-none animate-in fade-in-0 zoom-in-95 duration-100"
      style={{
        left: x,
        top: y,
        transform: 'translate(-50%, calc(-100% - 16px))',
      }}
    >
      <div className="bg-popover text-popover-foreground border rounded-lg shadow-md py-2.5 px-3 max-w-[220px]">
        {/* Name + role */}
        <p className="font-semibold text-sm leading-tight">{member.name}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{relLabel}</p>

        {/* Cadence — the hero line */}
        <div className="flex items-center gap-1.5 mt-2">
          <span className={cn(
            'text-sm font-medium',
            cadenceLabel === '—' ? 'text-muted-foreground' : 'text-foreground',
          )}>
            {cadenceLabel}
          </span>
          {member.meeting_cadence && cadenceLabel !== '—' && (
            <Badge variant="secondary" className="text-[9px] px-1 py-0 h-3.5 font-normal">
              calendar
            </Badge>
          )}
        </div>

        {/* Details */}
        <div className="text-[11px] text-muted-foreground space-y-0.5 mt-1.5 pt-1.5 border-t border-border/50">
          <div className="flex justify-between gap-3">
            <span>Last met</span>
            <span className="font-medium text-foreground">{lastText}</span>
          </div>
          {nextText && (
            <div className="flex justify-between gap-3">
              <span>Next expected</span>
              <span className={cn('font-medium', {
                'text-foreground': health === 'healthy',
                'text-yellow-600 dark:text-yellow-400': health === 'due-soon',
                'text-orange-600 dark:text-orange-400': health === 'overdue',
                'text-red-600 dark:text-red-400': health === 'stale',
              })}>{nextText}</span>
            </div>
          )}
          <div className="flex justify-between gap-3">
            <span>Meetings</span>
            <span className="font-medium text-foreground">{meetingCount}</span>
          </div>
          {topicCount > 0 && (
            <div className="flex justify-between gap-3">
              <span>Active topics</span>
              <span className="font-medium text-foreground">
                {topicCount}{activeBlockers > 0 ? ` (${activeBlockers} blocker${activeBlockers > 1 ? 's' : ''})` : ''}
              </span>
            </div>
          )}
        </div>

        {/* Arrow */}
        <div className="absolute left-1/2 -translate-x-1/2 -bottom-1.5 w-3 h-3 rotate-45 bg-popover border-r border-b" />
      </div>
    </div>
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
