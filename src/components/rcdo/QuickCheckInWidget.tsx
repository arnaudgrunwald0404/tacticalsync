import { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Calendar, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import { CheckInDialog } from '@/components/rcdo/CheckInDialog';
import { isFeatureEnabled } from '@/lib/featureFlags';

interface SIListItem {
  id: string;
  title: string;
  status: string | null;
}

interface LatestCheckinMap {
  [siId: string]: { date: string | null; percent: number | null } | undefined;
}

type Filter = 'owner' | 'participant';

export function QuickCheckInWidget() {
  const [loading, setLoading] = useState(true);
  const [ownedSIs, setOwnedSIs] = useState<SIListItem[]>([]);
  const [participantSIs, setParticipantSIs] = useState<SIListItem[]>([]);
  const [latestBySI, setLatestBySI] = useState<LatestCheckinMap>({});
  const [filter, setFilter] = useState<Filter>('owner');

  // Check-in dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogParent, setDialogParent] = useState<{ id: string; name: string } | null>(null);

  const listToRender = useMemo(() => (filter === 'owner' ? ownedSIs : participantSIs), [filter, ownedSIs, participantSIs]);

  const openDialog = useCallback((si: SIListItem) => {
    setDialogParent({ id: si.id, name: si.title });
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
        setOwnedSIs([]);
        setParticipantSIs([]);
        setLatestBySI({});
        setLoading(false);
        return;
      }

      // Owned SIs
      const { data: ownerSIs } = await supabase
        .from('rc_strategic_initiatives')
        .select('id, title, status')
        .eq('owner_user_id', userId)
        .order('title', { ascending: true });

      // Participant SIs (array contains)
      let participantSIsData: any[] | null = null;
      const { data: participantContains, error: containsErr } = await supabase
        .from('rc_strategic_initiatives')
        .select('id, title, status, participant_user_ids')
        .contains('participant_user_ids', [userId])
        .order('title', { ascending: true });

      if (containsErr) {
        // Fallback: fetch all and filter client-side if contains is not supported
        const { data: allSIs } = await supabase
          .from('rc_strategic_initiatives')
          .select('id, title, status, participant_user_ids');
        participantSIsData = (allSIs || []).filter(
          (si) => Array.isArray(si.participant_user_ids) && si.participant_user_ids.includes(userId)
        );
      } else {
        participantSIsData = participantContains || [];
      }

      const owned = (ownerSIs || []).map((s) => ({ id: s.id, title: s.title, status: s.status }));
      const participant = (participantSIsData || []).map((s) => ({ id: s.id, title: s.title, status: s.status }));

      setOwnedSIs(owned);
      setParticipantSIs(participant);

      // Fetch latest check-in for all SIs we will display
      const allIds = Array.from(new Set([...owned.map((s) => s.id), ...participant.map((s) => s.id)]));
      if (allIds.length > 0) {
        const { data: checkins } = await supabase
          .from('rc_checkins')
          .select('parent_id, date, percent_to_goal, created_at')
          .eq('parent_type', 'initiative')
          .in('parent_id', allIds)
          .order('date', { ascending: false })
          .order('created_at', { ascending: false });

        const latest: LatestCheckinMap = {};
        (checkins || []).forEach((c) => {
          if (!latest[c.parent_id]) {
            latest[c.parent_id] = { date: c.date ?? null, percent: c.percent_to_goal ?? null };
          }
        });
        setLatestBySI(latest);
      } else {
        setLatestBySI({});
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
        <Skeleton className="h-6 w-40 ml-auto" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  const nothingToShow = listToRender.length === 0;

  return (
    <div className="space-y-3">
      {/* Filter toggle */}
      <div className="flex justify-end gap-2">
        <Button
          variant={filter === 'owner' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('owner')}
        >
          Owned
        </Button>
        <Button
          variant={filter === 'participant' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('participant')}
        >
          Participating
        </Button>
      </div>

      {nothingToShow ? (
        <div className="text-sm text-muted-foreground text-right py-4 w-[70%] ml-auto">
          {filter === 'owner'
            ? "You don't own any Strategic Initiatives yet."
            : "You're not listed as a participant on any Strategic Initiatives."}
        </div>
      ) : (
        <div className="space-y-3">
          {listToRender.map((si) => {
            const latest = latestBySI[si.id];
            return (
              <Card key={si.id} className="border-blue-200">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base font-semibold pr-2 line-clamp-2">
                      {si.title}
                    </CardTitle>
                    {si.status && <Badge className="ml-2 capitalize">{si.status.replace('_', ' ')}</Badge>}
                  </div>
                </CardHeader>
                <CardContent className="pt-0 flex items-center justify-between gap-2">
                  <div className="text-xs text-muted-foreground">
                    {latest?.date ? (
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span>
                          Last check-in: {format(new Date(latest.date), 'MMM d, yyyy')}
                          {isFeatureEnabled('siProgress') && typeof latest.percent === 'number' ? ` • ${latest.percent}% to goal` : ''}
                        </span>
                      </div>
                    ) : (
                      <span>No check-ins yet</span>
                    )}
                  </div>
                  <Button size="sm" onClick={() => openDialog(si)}>
                    <MessageSquare className="h-3.5 w-3.5 mr-1" />
                    Check-In
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Reuse the existing dialog component */}
      {dialogParent && (
        <CheckInDialog
          isOpen={dialogOpen}
          onClose={closeDialog}
          parentType="initiative"
          parentId={dialogParent.id}
          parentName={dialogParent.name}
          onSuccess={closeDialog}
        />
      )}
    </div>
  );
}
