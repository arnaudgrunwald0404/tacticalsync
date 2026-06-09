import React, { useState, useEffect, useCallback } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Bell, FileText, AlertTriangle, BarChart3, CheckCircle2, XCircle,
  Bot, Clock, Loader2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

// ── Types ──────────────────────────────────────────────────────────────────────

interface AgentLogEntry {
  id: string;
  event_type: string;
  member_id: string | null;
  event_id: string | null;
  action_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

interface MemberInfo {
  id: string;
  name: string;
}

// ── Event type metadata ────────────────────────────────────────────────────────

const EVENT_META: Record<string, {
  icon: React.ElementType;
  label: string;
  color: string;
}> = {
  nudge_sent:          { icon: Bell,           label: 'Nudge sent',        color: 'text-amber-500' },
  prep_staged:         { icon: FileText,       label: 'Prep staged',       color: 'text-blue-500' },
  escalation_flagged:  { icon: AlertTriangle,  label: 'Escalation',        color: 'text-red-500' },
  escalation_dismissed:{ icon: XCircle,        label: 'Dismissed',         color: 'text-muted-foreground' },
  format_recommended:  { icon: BarChart3,      label: 'Format suggested',  color: 'text-violet-500' },
  tick_completed:      { icon: CheckCircle2,   label: 'Tick completed',    color: 'text-emerald-500' },
  error:               { icon: XCircle,        label: 'Error',             color: 'text-red-400' },
  feedback_received:   { icon: Bot,            label: 'Feedback',          color: 'text-primary' },
  health_score_updated:{ icon: Bot,            label: 'Health updated',    color: 'text-emerald-500' },
};

// ── Component ──────────────────────────────────────────────────────────────────

interface AgentActivityFeedProps {
  className?: string;
  limit?: number;
}

export function AgentActivityFeed({ className, limit = 50 }: AgentActivityFeedProps) {
  const [entries, setEntries] = useState<AgentLogEntry[]>([]);
  const [memberMap, setMemberMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    try {
      setLoading(true);
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;

      let query = db
        .from('cos_agent_log')
        .select('id, event_type, member_id, event_id, action_id, payload, created_at')
        .eq('user_id', userData.user.id)
        .order('created_at', { ascending: false })
        .limit(limit);

      // Filter out tick_completed by default (noisy)
      if (!filter) {
        query = query.neq('event_type', 'tick_completed');
      } else if (filter !== 'all') {
        query = query.eq('event_type', filter);
      }

      const { data: logs } = await query;
      setEntries((logs ?? []) as AgentLogEntry[]);

      // Load member names
      const memberIds = [...new Set(
        ((logs ?? []) as AgentLogEntry[])
          .map(l => l.member_id)
          .filter(Boolean) as string[]
      )];

      if (memberIds.length > 0) {
        const { data: members } = await db
          .from('cos_team_members')
          .select('id, name')
          .in('id', memberIds);

        setMemberMap(new Map(
          ((members ?? []) as MemberInfo[]).map(m => [m.id, m.name])
        ));
      }
    } catch (err) {
      console.error('Failed to load agent activity:', err);
    } finally {
      setLoading(false);
    }
  }, [limit, filter]);

  useEffect(() => { fetch(); }, [fetch]);

  // Stats
  const stats = {
    nudges: entries.filter(e => e.event_type === 'nudge_sent').length,
    preps: entries.filter(e => e.event_type === 'prep_staged').length,
    escalations: entries.filter(e => e.event_type === 'escalation_flagged').length,
  };

  if (loading) {
    return (
      <div className={cn('flex items-center justify-center py-12', className)}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Stats row */}
      <div className="flex items-center gap-3">
        <Badge variant="outline" className="text-xs gap-1">
          <Bell className="h-3 w-3 text-amber-500" />
          {stats.nudges} nudges
        </Badge>
        <Badge variant="outline" className="text-xs gap-1">
          <FileText className="h-3 w-3 text-blue-500" />
          {stats.preps} preps staged
        </Badge>
        {stats.escalations > 0 && (
          <Badge variant="outline" className="text-xs gap-1">
            <AlertTriangle className="h-3 w-3 text-red-500" />
            {stats.escalations} escalations
          </Badge>
        )}
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-1.5">
        {[
          { value: null, label: 'Recent' },
          { value: 'nudge_sent', label: 'Nudges' },
          { value: 'prep_staged', label: 'Preps' },
          { value: 'escalation_flagged', label: 'Escalations' },
          { value: 'format_recommended', label: 'Format' },
          { value: 'all', label: 'All' },
        ].map(f => (
          <button
            key={f.value ?? 'default'}
            onClick={() => setFilter(f.value)}
            className={cn(
              'text-[10px] px-2 py-0.5 rounded-full border transition-colors',
              filter === f.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground border-border hover:bg-muted',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Activity list */}
      {entries.length === 0 ? (
        <div className="text-center py-8">
          <Bot className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">No agent activity yet</p>
          <p className="text-[10px] text-muted-foreground/70 mt-0.5">
            Enable the agent in settings to start seeing activity here.
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {entries.map(entry => {
            const meta = EVENT_META[entry.event_type] ?? EVENT_META.error;
            const Icon = meta.icon;
            const memberName = entry.member_id ? memberMap.get(entry.member_id) : null;
            const payload = entry.payload ?? {};

            // Build description from payload
            let description = '';
            if (entry.event_type === 'nudge_sent') {
              description = (payload.text as string) ?? 'Action item nudge';
            } else if (entry.event_type === 'prep_staged') {
              description = `Prep generated for ${payload.member_name ?? memberName ?? 'meeting'}`;
            } else if (entry.event_type === 'escalation_flagged') {
              description = (payload.details as string) ?? 'Pattern detected';
            } else if (entry.event_type === 'format_recommended') {
              description = `${payload.format ?? 'Format'}: ${((payload.reasons as string[]) ?? []).join(', ')}`;
            } else if (entry.event_type === 'error') {
              description = `${payload.handler ?? 'unknown'}: ${payload.error ?? 'error'}`;
            } else if (entry.event_type === 'tick_completed') {
              const parts: string[] = [];
              if (payload.actions_nudged) parts.push(`${payload.actions_nudged} nudged`);
              if (payload.preps_staged) parts.push(`${payload.preps_staged} staged`);
              if (payload.escalations) parts.push(`${payload.escalations} escalations`);
              description = parts.length > 0 ? parts.join(', ') : 'No actions taken';
            }

            return (
              <div
                key={entry.id}
                className="flex items-start gap-2.5 px-3 py-2 rounded-md hover:bg-muted/50 transition-colors"
              >
                <Icon className={cn('h-3.5 w-3.5 mt-0.5 flex-shrink-0', meta.color)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-foreground">{meta.label}</span>
                    {memberName && (
                      <span className="text-[10px] text-muted-foreground">
                        {memberName}
                      </span>
                    )}
                    <span className="flex-1" />
                    <span className="text-[9px] text-muted-foreground flex-shrink-0">
                      {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  {description && (
                    <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">
                      {description}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
