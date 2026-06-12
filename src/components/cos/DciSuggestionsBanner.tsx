import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, ChevronUp, Sparkles, Check, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

interface DciTask {
  id: string;
  title: string;
  source: string | null;
  source_type: string | null;
  urgency: string | null;
  raw_context: string | null;
  date: string;
}

interface Props {
  userId: string;
}

const URGENCY_CONFIG: Record<string, { label: string; className: string }> = {
  urgent:    { label: 'Urgent',     className: 'border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950/30 dark:text-red-400' },
  this_week: { label: 'This week',  className: 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-400' },
  watching:  { label: 'Watching',   className: 'border-border bg-muted text-muted-foreground' },
};

export function DciSuggestionsBanner({ userId }: Props) {
  const [tasks, setTasks] = useState<DciTask[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadTasks = useCallback(async () => {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('dci_suggested_tasks')
      .select('id, title, source, source_type, urgency, raw_context, date')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .gte('date', cutoff)
      .order('date', { ascending: false })
      .order('urgency', { ascending: true });
    setTasks(data ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  const updateStatus = async (id: string, status: 'accepted' | 'dismissed') => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('dci_suggested_tasks')
      .update({ status })
      .eq('id', id);
    setTasks(t => t.filter(x => x.id !== id));
  };

  if (loading || tasks.length === 0) return null;

  const urgentCount = tasks.filter(t => t.urgency === 'urgent').length;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/20">
      <button
        className="w-full flex items-center gap-2 px-4 py-3 text-left"
        onClick={() => setExpanded(e => !e)}
      >
        <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
        <span className="text-sm font-medium text-amber-900 dark:text-amber-200 flex-1">
          {tasks.length} item{tasks.length !== 1 ? 's' : ''} identified from your meetings &amp; messages
        </span>
        <Badge
          variant="outline"
          className={`text-[10px] h-5 ${urgentCount > 0
            ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-950/30 dark:text-red-400'
            : 'border-amber-300 bg-amber-100 text-amber-700 dark:border-amber-700 dark:text-amber-300 dark:bg-amber-900/40'
          }`}
        >
          {urgentCount > 0 ? `${urgentCount} urgent` : 'review'}
        </Badge>
        {expanded
          ? <ChevronUp className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
          : <ChevronDown className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
        }
      </button>

      {expanded && (
        <div className="border-t border-amber-200 dark:border-amber-800 divide-y divide-amber-100 dark:divide-amber-900/50">
          {tasks.map(task => {
            const urgencyConfig = URGENCY_CONFIG[task.urgency ?? 'watching'] ?? URGENCY_CONFIG.watching;
            return (
              <div key={task.id} className="px-4 py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-snug">{task.title}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {task.source && (
                      <span className="text-[11px] text-muted-foreground">{task.source}</span>
                    )}
                    <Badge
                      variant="outline"
                      className={`text-[10px] h-4 px-1.5 ${urgencyConfig.className}`}
                    >
                      {urgencyConfig.label}
                    </Badge>
                  </div>
                  {task.raw_context && (
                    <p className="text-[11px] text-muted-foreground mt-1 italic line-clamp-2">
                      &ldquo;{task.raw_context}&rdquo;
                    </p>
                  )}
                </div>
                <div className="flex gap-1.5 flex-shrink-0 pt-0.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2 text-xs border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-950/30"
                    onClick={() => updateStatus(task.id, 'accepted')}
                  >
                    <Check className="h-3 w-3 mr-1" />
                    Add
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                    onClick={() => updateStatus(task.id, 'dismissed')}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
