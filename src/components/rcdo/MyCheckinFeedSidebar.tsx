import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import FancyAvatar from '@/components/ui/fancy-avatar';
import { Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { getFullNameForAvatar } from '@/lib/nameUtils';

interface CheckinRow {
  id: string;
  parent_type: 'do' | 'initiative';
  parent_id: string;
  date: string;
  summary: string | null;
  next_steps: string | null;
  sentiment: number | null;
  percent_to_goal: number | null;
  created_at: string;
  creator: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    full_name: string | null;
    avatar_url: string | null;
    avatar_name: string | null;
  } | null;
}

export function MyCheckinFeedSidebar() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<CheckinRow[]>([]);
  const [titlesById, setTitlesById] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const { data: auth } = await supabase.auth.getUser();
        const userId = auth.user?.id;
        if (!userId) { setRows([]); setTitlesById({}); return; }

        // My DOs
        const { data: myDOs } = await supabase
          .from('rc_defining_objectives')
          .select('id, title')
          .eq('owner_user_id', userId);
        const doIds = (myDOs || []).map((d) => d.id);

        // My SIs (owner and participant)
        const { data: ownerSIs } = await supabase
          .from('rc_strategic_initiatives')
          .select('id, title')
          .eq('owner_user_id', userId);
        const { data: participantSIs, error: containsErr } = await supabase
          .from('rc_strategic_initiatives')
          .select('id, title, participant_user_ids')
          .contains('participant_user_ids', [userId]);
        const siAll = [ 
          ...(ownerSIs || []), 
          ...(containsErr || !participantSIs ? [] : participantSIs)
        ];
        const siIds = Array.from(new Set(siAll.map((s: any) => s.id)));

        // Fetch recent check-ins for my DOs and SIs
        const feed: CheckinRow[] = [];
        if (doIds.length) {
          const { data } = await supabase
            .from('rc_checkins')
            .select(`
              id,
              parent_type,
              parent_id,
              date,
              summary,
              next_steps,
              sentiment,
              percent_to_goal,
              created_at,
              creator:profiles!created_by(id, first_name, last_name, full_name, avatar_url, avatar_name)
            `)
            .eq('parent_type', 'do')
            .in('parent_id', doIds)
            .order('date', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(40);
          feed.push(...((data as any) || []));
        }
        if (siIds.length) {
          const { data } = await supabase
            .from('rc_checkins')
            .select(`
              id,
              parent_type,
              parent_id,
              date,
              summary,
              next_steps,
              sentiment,
              percent_to_goal,
              created_at,
              creator:profiles!created_by(id, first_name, last_name, full_name, avatar_url, avatar_name)
            `)
            .eq('parent_type', 'initiative')
            .in('parent_id', siIds)
            .order('date', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(40);
          feed.push(...((data as any) || []));
        }

        // Sort combined feed by date/created_at desc
        feed.sort((a, b) => {
          const ad = new Date(a.date || a.created_at).getTime();
          const bd = new Date(b.date || b.created_at).getTime();
          return bd - ad;
        });
        setRows(feed.slice(0, 40));

        // Build title map
        const titleMap: Record<string, string> = {};
        (myDOs || []).forEach((d) => { titleMap[d.id] = d.title; });
        siAll.forEach((s: any) => { titleMap[s.id] = s.title; });
        setTitlesById(titleMap);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (!rows.length) {
    return <div className="text-xs text-muted-foreground">No recent check-ins.</div>;
  }

  const statusDot = (sentiment: number | null | undefined) => {
    if (sentiment === null || sentiment === undefined) return 'bg-gray-300';
    if (sentiment <= -1) return 'bg-red-400';
    if (sentiment === 0) return 'bg-yellow-400';
    return 'bg-emerald-400';
  };

  const statusInfo = (sentiment: number | null | undefined) => {
    if (sentiment === null || sentiment === undefined) return { label: 'Neutral', bg: 'bg-gray-100', text: 'text-gray-700' };
    if (sentiment <= -1) return { label: 'At Risk', bg: 'bg-red-100', text: 'text-red-700' };
    if (sentiment === 0) return { label: 'Neutral', bg: 'bg-yellow-100', text: 'text-yellow-700' };
    return { label: 'On Track', bg: 'bg-emerald-100', text: 'text-emerald-700' };
  };

  const typePill = (t: 'do' | 'initiative') => (t === 'do' ? 'DO' : 'SI');

  return (
    <div className="space-y-3">
      <div className="px-1 py-1">
        <h3 className="text-sm font-semibold">My recent check-ins</h3>
      </div>
      {rows.map((c) => {
        const reporter = getFullNameForAvatar(
          c.creator?.first_name,
          c.creator?.last_name,
          c.creator?.full_name,
        );
        const title = titlesById[c.parent_id] || (c.parent_type === 'do' ? 'Defining Objective' : 'Strategic Initiative');
        const status = statusInfo(c.sentiment);
        return (
          <Card key={c.id} className="p-3">
            {/* Header: [Pill] Title + status dot */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1 inline-flex items-center gap-1">
                <Badge variant="outline" className="px-1.5 py-0 text-[10px]">{typePill(c.parent_type)}</Badge>
                <div className="text-xs font-semibold truncate" title={title}>{title}</div>
              </div>
              <div className={`h-2.5 w-2.5 rounded-full mt-0.5 ${statusDot(c.sentiment)}`} />
            </div>

            {/* Owner */}
            <div className="mt-2 flex items-center gap-2">
              <FancyAvatar
                name={c.creator?.avatar_name || reporter}
                displayName={reporter}
                avatarUrl={c.creator?.avatar_url}
                size="sm"
              />
              <span className="text-xs">{reporter}</span>
            </div>

            {/* Date before updates */}
            <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
              <Calendar className="h-3 w-3" />
              <span>{format(new Date(c.date), 'MMM d, yyyy')}</span>
            </div>

            {/* Updates */}
            <div className="mt-2 space-y-2">
              {/* Metric Update */}
              <div>
                <div className="text-[10px] font-semibold text-muted-foreground">Metric Update</div>
                <div className="text-xs text-foreground/90">
                  {c.parent_type === 'initiative' && typeof c.percent_to_goal === 'number'
                    ? `${c.percent_to_goal}% to goal`
                    : 'No metric change reported'}
                </div>
              </div>

              {/* Comment Update */}
              {c.summary && (
                <div>
                  <div className="text-[10px] font-semibold text-muted-foreground">Comment Update</div>
                  <div className="text-xs text-foreground/90 line-clamp-2">{c.summary}</div>
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="mt-2 border-t" />

            {/* Status Update */}
            <div className="pt-2 flex items-center gap-2 text-[10px]">
              <span className="font-semibold text-muted-foreground">Status Update:</span>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full ${status.bg} ${status.text} text-[10px] font-semibold`}>
                {status.label}
              </span>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
