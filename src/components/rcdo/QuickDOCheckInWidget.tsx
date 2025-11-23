import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Calendar, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import { CheckInDialog } from '@/components/rcdo/CheckInDialog';

interface DOListItem {
  id: string;
  title: string;
  status: string | null;
}

interface LatestCheckinMap {
  [doId: string]: { date: string | null } | undefined;
}

type Filter = 'owner';

export function QuickDOCheckInWidget() {
  const [loading, setLoading] = useState(true);
  const [ownedDOs, setOwnedDOs] = useState<DOListItem[]>([]);
  const [latestByDO, setLatestByDO] = useState<LatestCheckinMap>({});
  const [filter] = useState<Filter>('owner');

  // Check-in dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogParent, setDialogParent] = useState<{ id: string; name: string } | null>(null);

  const listToRender = useMemo(() => ownedDOs, [ownedDOs]);

  const openDialog = useCallback((d: DOListItem) => {
    setDialogParent({ id: d.id, name: d.title });
    setDialogOpen(true);
  }, []);

  const closeDialog = useCallback(() => {
    setDialogOpen(false);
    setDialogParent(null);
    // After creating, refresh latest check-ins so the dates update
    void fetchData();
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) {
        setOwnedDOs([]);
        setLatestByDO({});
        setLoading(false);
        return;
      }

      // Owned DOs
      const { data: ownerDOs } = await supabase
        .from('rc_defining_objectives')
        .select('id, title, status')
        .eq('owner_user_id', userId)
        .order('title', { ascending: true });

      const owned = (ownerDOs || []).map((d) => ({ id: d.id, title: d.title, status: (d as any).status ?? null }));
      setOwnedDOs(owned);

      // Fetch latest check-in for all DOs we will display
      const allIds = Array.from(new Set(owned.map((d) => d.id)));
      if (allIds.length > 0) {
        const { data: checkins } = await supabase
          .from('rc_checkins')
          .select('parent_id, date, created_at')
          .eq('parent_type', 'do')
          .in('parent_id', allIds)
          .order('date', { ascending: false })
          .order('created_at', { ascending: false });

        const latest: LatestCheckinMap = {};
        (checkins || []).forEach((c) => {
          if (!latest[c.parent_id]) {
            latest[c.parent_id] = { date: c.date ?? null };
          }
        });
        setLatestByDO(latest);
      } else {
        setLatestByDO({});
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

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

  const nothingToShow = listToRender.length === 0;

  return (
    <div className="space-y-3">
      {nothingToShow ? (
        <div className="text-sm text-muted-foreground text-right py-4 w-[70%] ml-auto">
          You don't own any Defining Objectives yet.
        </div>
      ) : (
        <div className="space-y-3">
          {listToRender.map((d) => {
            const latest = latestByDO[d.id];
            return (
              <Card key={d.id} className="border-[#E8B4A0]/30">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base font-semibold pr-2 line-clamp-2">
                      {d.title}
                    </CardTitle>
                    {d.status && <Badge className="ml-2 capitalize">{String(d.status).replace('_', ' ')}</Badge>}
                  </div>
                </CardHeader>
                <CardContent className="pt-0 flex items-center justify-between gap-2">
                  <div className="text-xs text-muted-foreground">
                    {latest?.date ? (
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span>Last check-in: {format(new Date(latest.date), 'MMM d, yyyy')}</span>
                      </div>
                    ) : (
                      <span>No check-ins yet</span>
                    )}
                  </div>
                  <Button size="sm" onClick={() => openDialog(d)}>
                    <MessageSquare className="h-3.5 w-3.5 mr-1" />
                    Check-In
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog */}
      {dialogParent && (
        <CheckInDialog
          isOpen={dialogOpen}
          onClose={closeDialog}
          parentType="do"
          parentId={dialogParent.id}
          parentName={dialogParent.name}
          onSuccess={closeDialog}
        />
      )}
    </div>
  );
}
