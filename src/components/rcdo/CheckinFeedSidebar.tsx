import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import FancyAvatar from '@/components/ui/fancy-avatar';
import { Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { getFullNameForAvatar } from '@/lib/nameUtils';

interface GlobalCheckin {
  id: string;
  parent_type: 'do' | 'initiative' | 'task';
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

interface CheckinFeedSidebarProps {
  viewAsUserId?: string | null;
  filteredNodeIds?: {
    doIds: string[];
    siIds: string[];
  };
}

export function CheckinFeedSidebar({ viewAsUserId, filteredNodeIds }: CheckinFeedSidebarProps = {}) {
  const [loading, setLoading] = useState(true);
  const [updates, setUpdates] = useState<GlobalCheckin[]>([]);
  const [parentTitles, setParentTitles] = useState<Record<string, { title: string; type: string }>>({});

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        
        let rows: GlobalCheckin[] = [];
        
        // If filtering is active, only fetch check-ins for visible DOs and SIs
        if (viewAsUserId && filteredNodeIds) {
          const { doIds, siIds } = filteredNodeIds;
          
          // If no visible DOs or SIs, return empty
          if (doIds.length === 0 && siIds.length === 0) {
            setUpdates([]);
            setParentTitles({});
            setLoading(false);
            return;
          }
          
          // Fetch check-ins for DOs and SIs separately, then combine
          if (doIds.length > 0) {
            const { data: doCheckins, error: doError } = await supabase
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
              .in('parent_id', doIds);
            
            if (!doError && doCheckins) {
              rows.push(...(doCheckins as unknown as GlobalCheckin[]));
            }
          }
          
          if (siIds.length > 0) {
            const { data: siCheckins, error: siError } = await supabase
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
              .in('parent_id', siIds);
            
            if (!siError && siCheckins) {
              rows.push(...(siCheckins as unknown as GlobalCheckin[]));
            }
          }
          
          if (rows.length > 0) {
            
            // Sort by date and created_at, then limit
            rows.sort((a, b) => {
              const ad = new Date(a.date || a.created_at).getTime();
              const bd = new Date(b.date || b.created_at).getTime();
              if (bd !== ad) return bd - ad;
              return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            });
            
            rows = rows.slice(0, 30);
          }
        } else {
          // Default: fetch all check-ins
          const { data, error } = await supabase
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
            .in('parent_type', ['do', 'initiative', 'task'])
            .order('date', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(30);
          if (error) throw error;
          rows = (data || []) as unknown as GlobalCheckin[];
        }
        
        setUpdates(rows);

        // Fetch titles for all parent types
        const doIds = rows.filter(r => r.parent_type === 'do').map(r => r.parent_id);
        const siIds = rows.filter(r => r.parent_type === 'initiative').map(r => r.parent_id);
        const taskIds = rows.filter(r => r.parent_type === 'task').map(r => r.parent_id);

        const map: Record<string, { title: string; type: string }> = {};

        if (doIds.length) {
          const { data: dos } = await supabase
            .from('rc_defining_objectives')
            .select('id, title')
            .in('id', doIds);
          (dos || []).forEach((d: any) => { 
            map[d.id] = { title: d.title, type: 'DO' }; 
          });
        }

        if (siIds.length) {
          const { data: sis } = await supabase
            .from('rc_strategic_initiatives')
            .select('id, title')
            .in('id', siIds);
          (sis || []).forEach((s: any) => { 
            map[s.id] = { title: s.title, type: 'SI' }; 
          });
        }

        if (taskIds.length) {
          const { data: tasks } = await supabase
            .from('rc_tasks' as any)
            .select('id, title')
            .in('id', taskIds);
          (tasks || []).forEach((t: any) => { 
            map[t.id] = { title: t.title, type: 'Task' }; 
          });
        }

        setParentTitles(map);
      } finally {
        setLoading(false);
      }
    })();
  }, [viewAsUserId, filteredNodeIds]);

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (!updates.length) {
    return <div className="text-xs text-muted-foreground">No recent check-ins.</div>;
  }

  const statusDot = (sentiment: number | null | undefined) => {
    if (sentiment === null || sentiment === undefined) return 'bg-gray-300';
    if (sentiment <= -1) return 'bg-red-400';
    if (sentiment === 0) return 'bg-yellow-400';
    return 'bg-emerald-400';
  };

  return (
    <div className="space-y-3">
      <div className="px-1 py-1">
        <h3 className="text-sm font-semibold">Recent Check-ins</h3>
      </div>
      {updates.map((c) => {
        const reporter = getFullNameForAvatar(
          c.creator?.first_name,
          c.creator?.last_name,
          c.creator?.full_name,
        );
        const parentInfo = parentTitles[c.parent_id] || { title: 'Unknown', type: c.parent_type === 'do' ? 'DO' : c.parent_type === 'initiative' ? 'SI' : 'Task' };
        return (
          <Card key={c.id} className="p-3">
            <div className="flex items-start gap-2">
              <div className={`h-2.5 w-2.5 rounded-full mt-1.5 ${statusDot(c.sentiment)}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <div className="text-xs font-semibold truncate" title={parentInfo.title}>{parentInfo.title}</div>
                  <Badge variant="outline" className="px-1 py-0 text-[10px]">{parentInfo.type}</Badge>
                </div>
                <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <span>{format(new Date(c.date), 'MMM d, yyyy')}</span>
                  </div>
                  {typeof c.percent_to_goal === 'number' && (
                    <span className="ml-auto">{c.percent_to_goal}%</span>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <FancyAvatar
                    name={c.creator?.avatar_name || reporter}
                    displayName={reporter}
                    avatarUrl={c.creator?.avatar_url}
                    size="sm"
                  />
                  <span className="text-xs">{reporter}</span>
                </div>
                {c.summary && (
                  <p className="mt-2 text-xs text-foreground/90 line-clamp-2">{c.summary}</p>
                )}
                {!c.summary && c.next_steps && (
                  <p className="mt-2 text-xs text-foreground/90 line-clamp-2">{c.next_steps}</p>
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
