import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { format, differenceInDays } from 'date-fns';
import {
  Brain, ChevronDown, ChevronRight, Clock, TrendingUp, TrendingDown,
  Minus, CheckCircle2, Circle, AlertTriangle, MessageSquare, Target,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { parseLocalDate } from '@/lib/dateUtils';
import { supabase } from '@/integrations/supabase/client';

// ── Types ──────────────────────────────────────────────────────────────────────

interface TimelinePrep {
  id: string;
  prep_date: string;
  source: string;
  content: string;
}

interface TimelineTopic {
  id: string;
  topic: string;
  category: string;
  sentiment: string;
  first_mentioned_at: string;
  last_mentioned_at: string;
  mention_count: number;
  status: string;
}

interface TimelineAction {
  id: string;
  text: string;
  status: string;
  created_at: string;
  due_date: string | null;
  completed_at: string | null;
}

interface TimelineMention {
  prep_id: string;
  topic_id: string;
  snippet: string | null;
}

interface TimelineEntry {
  date: string;
  prep: TimelinePrep;
  topicsMentioned: Array<{ topic: string; category: string; sentiment: string }>;
  actionsCreated: TimelineAction[];
  actionsCompleted: TimelineAction[];
}

// ── Category colors ────────────────────────────────────────────────────────────

const CAT_COLORS: Record<string, { dot: string; bg: string; text: string }> = {
  blocker:     { dot: 'bg-red-500',     bg: 'bg-red-50',     text: 'text-red-700' },
  escalation:  { dot: 'bg-orange-500',  bg: 'bg-orange-50',  text: 'text-orange-700' },
  project:     { dot: 'bg-blue-500',    bg: 'bg-blue-50',    text: 'text-blue-700' },
  goal:        { dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700' },
  feedback:    { dot: 'bg-violet-500',  bg: 'bg-violet-50',  text: 'text-violet-700' },
  development: { dot: 'bg-indigo-500',  bg: 'bg-indigo-50',  text: 'text-indigo-700' },
  personal:    { dot: 'bg-pink-500',    bg: 'bg-pink-50',    text: 'text-pink-700' },
  general:     { dot: 'bg-gray-400',    bg: 'bg-gray-50',    text: 'text-gray-600' },
};

const SENTIMENT_ICON: Record<string, React.ReactNode> = {
  positive: <TrendingUp className="h-3 w-3 text-emerald-500" />,
  negative: <TrendingDown className="h-3 w-3 text-red-500" />,
  mixed:    <Minus className="h-3 w-3 text-amber-500" />,
  neutral:  null,
};

// ── Component ──────────────────────────────────────────────────────────────────

interface RelationshipTimelineProps {
  memberId: string;
  memberName: string;
}

export function RelationshipTimeline({ memberId, memberName }: RelationshipTimelineProps) {
  const [preps, setPreps] = useState<TimelinePrep[]>([]);
  const [topics, setTopics] = useState<TimelineTopic[]>([]);
  const [actions, setActions] = useState<TimelineAction[]>([]);
  const [mentions, setMentions] = useState<TimelineMention[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());

  const firstName = memberName.split(' ')[0];

  // Load data
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) return;
        const userId = userData.user.id;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = supabase as any;

        const [prepsRes, topicsRes, actionsRes, mentionsRes] = await Promise.all([
          db.from('cos_one_on_one_prep')
            .select('id, prep_date, source, content')
            .eq('user_id', userId)
            .eq('team_member_id', memberId)
            .eq('status', 'ready')
            .order('prep_date', { ascending: false })
            .limit(30),
          db.from('cos_relationship_topics')
            .select('id, topic, category, sentiment, first_mentioned_at, last_mentioned_at, mention_count, status')
            .eq('user_id', userId)
            .eq('team_member_id', memberId)
            .order('mention_count', { ascending: false }),
          db.from('cos_meeting_actions')
            .select('id, text, status, created_at, due_date, completed_at')
            .eq('user_id', userId)
            .eq('member_id', memberId)
            .order('created_at', { ascending: false })
            .limit(100),
          db.from('cos_prep_topic_mentions')
            .select('prep_id, topic_id, snippet'),
        ]);

        setPreps((prepsRes.data ?? []) as TimelinePrep[]);
        setTopics((topicsRes.data ?? []) as TimelineTopic[]);
        setActions((actionsRes.data ?? []) as TimelineAction[]);
        setMentions((mentionsRes.data ?? []) as TimelineMention[]);
      } catch (err) {
        console.error('Timeline load failed:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, [memberId]);

  // Build timeline entries
  const entries = useMemo<TimelineEntry[]>(() => {
    const topicById = new Map(topics.map(t => [t.id, t]));
    const mentionsByPrep = new Map<string, TimelineMention[]>();
    for (const m of mentions) {
      if (!mentionsByPrep.has(m.prep_id)) mentionsByPrep.set(m.prep_id, []);
      mentionsByPrep.get(m.prep_id)!.push(m);
    }

    return preps.map(prep => {
      const prepMentions = mentionsByPrep.get(prep.id) ?? [];
      const topicsMentioned = prepMentions
        .map(m => topicById.get(m.topic_id))
        .filter(Boolean)
        .map(t => ({ topic: t!.topic, category: t!.category, sentiment: t!.sentiment }));

      const prepDate = prep.prep_date;
      const actionsCreated = actions.filter(a =>
        a.created_at.slice(0, 10) === prepDate
      );
      const actionsCompleted = actions.filter(a =>
        a.completed_at && a.completed_at.slice(0, 10) === prepDate
      );

      return {
        date: prepDate,
        prep,
        topicsMentioned,
        actionsCreated,
        actionsCompleted,
      };
    });
  }, [preps, topics, actions, mentions]);

  // Stats
  const stats = useMemo(() => {
    const totalMeetings = preps.length;
    const totalTopics = topics.length;
    const resolvedTopics = topics.filter(t => t.status === 'resolved').length;
    const pendingActions = actions.filter(a => a.status === 'pending').length;
    const completedActions = actions.filter(a => a.status === 'done').length;

    // Meeting frequency
    let avgDaysBetween: number | null = null;
    if (preps.length >= 2) {
      const dates = preps.map(p => parseLocalDate(p.prep_date)?.getTime() ?? 0).filter(Boolean);
      const gaps = dates.slice(0, -1).map((d, i) => d - dates[i + 1]);
      const avgMs = gaps.reduce((sum, g) => sum + g, 0) / gaps.length;
      avgDaysBetween = Math.round(avgMs / 86_400_000);
    }

    // Longest gap
    let longestGap: { days: number; from: string; to: string } | null = null;
    if (preps.length >= 2) {
      for (let i = 0; i < preps.length - 1; i++) {
        const fromDate = parseLocalDate(preps[i + 1].prep_date);
        const toDate = parseLocalDate(preps[i].prep_date);
        if (fromDate && toDate) {
          const gap = differenceInDays(toDate, fromDate);
          if (!longestGap || gap > longestGap.days) {
            longestGap = { days: gap, from: preps[i + 1].prep_date, to: preps[i].prep_date };
          }
        }
      }
    }

    // Most discussed topic
    const topTopic = topics.length > 0 ? topics[0] : null;

    return {
      totalMeetings,
      totalTopics,
      resolvedTopics,
      pendingActions,
      completedActions,
      avgDaysBetween,
      longestGap,
      topTopic,
    };
  }, [preps, topics, actions]);

  const toggleDate = useCallback((date: string) => {
    setExpandedDates(prev => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-pulse text-xs text-muted-foreground">Loading timeline...</div>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center px-4">
        <Brain className="h-8 w-8 text-muted-foreground/30 mb-3" />
        <p className="text-sm text-muted-foreground">No meeting history yet</p>
        <p className="text-xs text-muted-foreground/70 mt-1">
          Generate a prep for {firstName} to start building the timeline.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatCard
          label="Meetings"
          value={stats.totalMeetings}
          sub={stats.avgDaysBetween ? `~${stats.avgDaysBetween}d apart` : undefined}
        />
        <StatCard
          label="Topics tracked"
          value={stats.totalTopics}
          sub={stats.resolvedTopics > 0 ? `${stats.resolvedTopics} resolved` : undefined}
        />
        <StatCard
          label="Actions created"
          value={stats.pendingActions + stats.completedActions}
          sub={`${stats.pendingActions} pending`}
        />
        <StatCard
          label="Most discussed"
          value={stats.topTopic?.topic ?? '—'}
          sub={stats.topTopic ? `${stats.topTopic.mention_count}x` : undefined}
          isText
        />
      </div>

      {/* Longest gap callout */}
      {stats.longestGap && stats.longestGap.days > 21 && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-xs">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
          <span className="text-amber-700">
            Longest gap: <strong>{stats.longestGap.days} days</strong> between {stats.longestGap.from} and {stats.longestGap.to}
          </span>
        </div>
      )}

      {/* Top recurring topics */}
      {topics.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Topic map
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {topics.slice(0, 12).map(t => {
              const colors = CAT_COLORS[t.category] ?? CAT_COLORS.general;
              return (
                <span
                  key={t.id}
                  className={cn(
                    'inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border',
                    t.status === 'resolved' && 'opacity-50 line-through',
                    t.status === 'stale' && 'opacity-70',
                    colors.bg, colors.text, 'border-current/20',
                  )}
                >
                  <span className={cn('w-1.5 h-1.5 rounded-full', colors.dot)} />
                  {t.topic}
                  {t.mention_count > 1 && (
                    <span className="font-bold">{t.mention_count}x</span>
                  )}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />

        <div className="space-y-0">
          {entries.map((entry, i) => {
            const isExpanded = expandedDates.has(entry.date);
            const date = parseLocalDate(entry.date);
            const isFirst = i === entries.length - 1;
            const isLatest = i === 0;

            // Gap between this and previous entry
            let gapDays: number | null = null;
            if (i < entries.length - 1) {
              const prevDate = parseLocalDate(entries[i + 1].date);
              if (date && prevDate) {
                gapDays = differenceInDays(date, prevDate);
              }
            }

            return (
              <div key={entry.date}>
                {/* Gap indicator */}
                {gapDays !== null && gapDays > 14 && (
                  <div className="flex items-center gap-2 ml-[7px] py-1">
                    <div className="w-[9px] border-t border-dashed border-amber-300" />
                    <span className="text-[9px] text-amber-500 font-medium">{gapDays}d gap</span>
                  </div>
                )}

                <button
                  onClick={() => toggleDate(entry.date)}
                  className="flex items-start gap-3 w-full text-left py-2 px-1 rounded-md hover:bg-muted/50 transition-colors group"
                >
                  {/* Timeline dot */}
                  <div className={cn(
                    'w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center flex-shrink-0 z-10 bg-background',
                    isLatest ? 'border-primary' : 'border-border',
                  )}>
                    <div className={cn(
                      'w-2 h-2 rounded-full',
                      isLatest ? 'bg-primary' : 'bg-muted-foreground/30',
                    )} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 -mt-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-foreground">
                        {date ? format(date, 'MMM d, yyyy') : entry.date}
                      </span>
                      {isFirst && (
                        <Badge variant="outline" className="text-[8px] h-3.5 px-1 border-emerald-200 text-emerald-600">First 1:1</Badge>
                      )}
                      {isLatest && (
                        <Badge variant="outline" className="text-[8px] h-3.5 px-1 border-primary/30 text-primary">Latest</Badge>
                      )}
                      <span className="flex-1" />
                      {isExpanded
                        ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
                        : <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
                      }
                    </div>

                    {/* Topic pills */}
                    {entry.topicsMentioned.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {entry.topicsMentioned.map((t, j) => {
                          const colors = CAT_COLORS[t.category] ?? CAT_COLORS.general;
                          return (
                            <span
                              key={j}
                              className={cn(
                                'inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0 rounded-full',
                                colors.bg, colors.text,
                              )}
                            >
                              <span className={cn('w-1 h-1 rounded-full', colors.dot)} />
                              {t.topic}
                              {SENTIMENT_ICON[t.sentiment]}
                            </span>
                          );
                        })}
                      </div>
                    )}

                    {/* Summary line (collapsed) */}
                    {!isExpanded && (
                      <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                        {entry.actionsCreated.length > 0 && (
                          <span className="flex items-center gap-0.5">
                            <Target className="h-2.5 w-2.5" />
                            {entry.actionsCreated.length} action{entry.actionsCreated.length !== 1 ? 's' : ''}
                          </span>
                        )}
                        {entry.actionsCompleted.length > 0 && (
                          <span className="flex items-center gap-0.5 text-emerald-600">
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            {entry.actionsCompleted.length} completed
                          </span>
                        )}
                        <span className="flex items-center gap-0.5">
                          <MessageSquare className="h-2.5 w-2.5" />
                          {entry.topicsMentioned.length} topics
                        </span>
                      </div>
                    )}
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="ml-[34px] mb-3 space-y-2">
                    {/* Actions created */}
                    {entry.actionsCreated.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Actions created
                        </span>
                        {entry.actionsCreated.map(a => (
                          <div key={a.id} className="flex items-start gap-1.5 text-xs">
                            {a.status === 'done' ? (
                              <CheckCircle2 className="h-3 w-3 text-emerald-500 mt-0.5 flex-shrink-0" />
                            ) : (
                              <Circle className="h-3 w-3 text-muted-foreground/40 mt-0.5 flex-shrink-0" />
                            )}
                            <span className={cn(
                              a.status === 'done' && 'line-through text-muted-foreground',
                            )}>
                              {a.text}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Prep excerpt */}
                    <div className="space-y-1">
                      <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Prep excerpt
                      </span>
                      <p className="text-[11px] text-muted-foreground leading-relaxed bg-muted/30 rounded-md px-3 py-2 border border-border">
                        {entry.prep.content.slice(0, 300)}
                        {entry.prep.content.length > 300 && '...'}
                      </p>
                    </div>
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

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, isText,
}: {
  label: string; value: string | number; sub?: string; isText?: boolean;
}) {
  return (
    <div className="px-3 py-2 rounded-md border border-border bg-background">
      <p className="text-[9px] uppercase tracking-wide text-muted-foreground font-semibold">{label}</p>
      <p className={cn(
        'font-bold text-foreground mt-0.5',
        isText ? 'text-xs truncate' : 'text-lg leading-none',
      )}>
        {value}
      </p>
      {sub && <p className="text-[9px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}
