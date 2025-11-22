import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Calendar, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import { CheckInDialog } from '@/components/rcdo/CheckInDialog';
import { isFeatureEnabled } from '@/lib/featureFlags';

interface ItemBase { id: string; title: string; status: string | null }
interface DOItem extends ItemBase { kind: 'do' }
interface SIItem extends ItemBase { kind: 'si' }

type Item = DOItem | SIItem;

interface LatestMap {
  [id: string]: { date: string | null; percent?: number | null } | undefined;
}

export function QuickUnifiedCheckInWidget() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Item[]>([]);
  const [latestById, setLatestById] = useState<LatestMap>({});

  // Check-in dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogParent, setDialogParent] = useState<{ id: string; name: string; kind: 'do' | 'initiative' } | null>(null);

  const openDialog = useCallback((item: Item) => {
    setDialogParent({ id: item.id, name: item.title, kind: item.kind === 'do' ? 'do' : 'initiative' });
    setDialogOpen(true);
  }, []);

  const closeDialog = useCallback(() => {
    setDialogOpen(false);
    setDialogParent(null);
    void fetchData();
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) {
        setItems([]);
        setLatestById({});
        setLoading(false);
        return;
      }

      // Owned DOs
      const { data: ownerDOs } = await supabase
        .from('rc_defining_objectives')
        .select('id, title, status')
        .eq('owner_user_id', userId)
        .order('title', { ascending: true });

      // Owned SIs
      const { data: ownerSIs } = await supabase
        .from('rc_strategic_initiatives')
        .select('id, title, status, participant_user_ids')
        .eq('owner_user_id', userId)
        .order('title', { ascending: true });

      // Participant SIs
      let participantSIs: any[] | null = null;
      const { data: participantContains, error: containsErr } = await supabase
        .from('rc_strategic_initiatives')
        .select('id, title, status, participant_user_ids')
        .contains('participant_user_ids', [userId])
        .order('title', { ascending: true });
      participantSIs = containsErr ? [] : (participantContains || []);

      const allSIsRaw = [ ...(ownerSIs || []), ...(participantSIs || []) ];
      // De-dup by id
      const seen = new Set<string>();
      const siItems: SIItem[] = [];
      for (const s of allSIsRaw) {
        if (seen.has(s.id)) continue;
        seen.add(s.id);
        siItems.push({ id: s.id, title: s.title, status: s.status ?? null, kind: 'si' });
      }

      const doItems: DOItem[] = (ownerDOs || []).map((d) => ({ id: d.id, title: d.title, status: (d as any).status ?? null, kind: 'do' }));

      // Combine and sort alphabetically by title
      const combined: Item[] = [...doItems, ...siItems].sort((a, b) => a.title.localeCompare(b.title));
      setItems(combined);

      // Fetch latest check-ins for each
      const doIds = doItems.map((d) => d.id);
      const siIds = siItems.map((s) => s.id);
      const latest: LatestMap = {};

      if (doIds.length > 0) {
        const { data: checkins } = await supabase
          .from('rc_checkins')
          .select('parent_id, date, created_at')
          .eq('parent_type', 'do')
          .in('parent_id', doIds)
          .order('date', { ascending: false })
          .order('created_at', { ascending: false });
        (checkins || []).forEach((c) => {
          if (!latest[c.parent_id]) latest[c.parent_id] = { date: c.date ?? null };
        });
      }

      if (siIds.length > 0) {
        const { data: checkins } = await supabase
          .from('rc_checkins')
          .select('parent_id, date, percent_to_goal, created_at')
          .eq('parent_type', 'initiative')
          .in('parent_id', siIds)
          .order('date', { ascending: false })
          .order('created_at', { ascending: false });
        (checkins || []).forEach((c) => {
          if (!latest[c.parent_id]) latest[c.parent_id] = { date: c.date ?? null, percent: c.percent_to_goal ?? null };
        });
      }

      setLatestById(latest);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-56 ml-auto" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  const nothingToShow = items.length === 0;

  return (
    <div className="space-y-3">
      {nothingToShow ? (
        <div className="text-sm text-muted-foreground text-right py-4 w-[70%] ml-auto">
          You have no DOs or SIs yet.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const latest = latestById[item.id];
            const pill = item.kind === 'do' ? 'DO' : 'SI';
            return (
              <Card key={`${item.kind}-${item.id}`} className="border-blue-200">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base font-semibold pr-2 line-clamp-2">
                      {item.title}
                    </CardTitle>
                    <Badge className="ml-2" variant="outline">{pill}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 flex items-center justify-between gap-2">
                  <div className="text-xs text-muted-foreground">
                    {latest?.date ? (
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span>
                          Last check-in: {format(new Date(latest.date), 'MMM d, yyyy')}
                          {item.kind === 'si' && isFeatureEnabled('siProgress') && typeof latest?.percent === 'number' ? ` • ${latest.percent}% to goal` : ''}
                        </span>
                      </div>
                    ) : (
                      <span>No check-ins yet</span>
                    )}
                  </div>
                  <Button size="sm" onClick={() => openDialog(item)}>
                    <MessageSquare className="h-3.5 w-3.5 mr-1" />
                    Check-In
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {dialogParent && (
        <CheckInDialog
          isOpen={dialogOpen}
          onClose={closeDialog}
          parentType={dialogParent.kind}
          parentId={dialogParent.id}
          parentName={dialogParent.name}
          onSuccess={closeDialog}
        />
      )}
    </div>
  );
}
