import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

// Admin recovery view for supabase/migrations/20260807234142_add_rc_deleted_items_audit_table.sql
// and .../20260807234201_add_restore_deleted_rc_batch_rpc.sql.

interface DeletedItemRow {
  id: string;
  batch_id: string;
  table_name: string;
  row_data: Record<string, unknown>;
  deleted_by: string | null;
  deleted_at: string;
  restored_at: string | null;
}

interface Batch {
  batchId: string;
  deletedAt: string;
  deletedBy: string | null;
  items: DeletedItemRow[];
}

const TABLE_LABELS: Record<string, string> = {
  rc_defining_objectives: 'Defining Objective',
  rc_do_metrics: 'DO Metric',
  rc_strategic_initiatives: 'Strategic Initiative',
  rc_tasks: 'Task',
  rc_links: 'Link',
  rc_checkins: 'Check-in',
};

// Priority order for picking which row's title represents the whole batch
// in the list (a DO delete cascades to metrics/SIs/tasks — the DO itself is
// the most meaningful label).
const TITLE_PRIORITY = ['rc_defining_objectives', 'rc_strategic_initiatives', 'rc_tasks'];

function batchTitle(batch: Batch): string {
  for (const table of TITLE_PRIORITY) {
    const row = batch.items.find(i => i.table_name === table);
    const title = row?.row_data?.title;
    if (typeof title === 'string' && title.trim()) return title;
  }
  return 'Deleted item';
}

function batchSummary(batch: Batch): string {
  const counts = new Map<string, number>();
  for (const item of batch.items) {
    counts.set(item.table_name, (counts.get(item.table_name) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([table, count]) => `${count} ${TABLE_LABELS[table] ?? table}${count > 1 ? 's' : ''}`)
    .join(', ');
}

export default function RecentlyDeletedPanel() {
  const { toast } = useToast();
  const [rows, setRows] = useState<DeletedItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileNames, setProfileNames] = useState<Map<string, string>>(new Map());
  const [restoringBatchId, setRestoringBatchId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('rc_deleted_items')
        .select('id, batch_id, table_name, row_data, deleted_by, deleted_at, restored_at')
        .is('restored_at', null)
        .order('deleted_at', { ascending: false });
      if (error) throw error;
      const items = (data ?? []) as unknown as DeletedItemRow[];
      setRows(items);

      const userIds = Array.from(new Set(items.map(i => i.deleted_by).filter((id): id is string => !!id)));
      if (userIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', userIds);
        if (profilesError) throw profilesError;
        const map = new Map<string, string>();
        for (const p of profiles ?? []) {
          map.set(p.id, p.full_name || p.email);
        }
        setProfileNames(map);
      }
    } catch (err) {
      console.error('Failed to load recently deleted RCDO items:', err);
      toast({ title: 'Error', description: 'Failed to load recently deleted items.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const batches = useMemo<Batch[]>(() => {
    const byBatch = new Map<string, DeletedItemRow[]>();
    for (const row of rows) {
      const existing = byBatch.get(row.batch_id);
      if (existing) existing.push(row);
      else byBatch.set(row.batch_id, [row]);
    }
    return Array.from(byBatch.entries())
      .map(([batchId, items]) => ({
        batchId,
        deletedAt: items[0].deleted_at,
        deletedBy: items[0].deleted_by,
        items,
      }))
      .sort((a, b) => (a.deletedAt < b.deletedAt ? 1 : -1));
  }, [rows]);

  const handleRestore = async (batch: Batch) => {
    setRestoringBatchId(batch.batchId);
    try {
      const { data, error } = await supabase.rpc('restore_deleted_rc_batch', { p_batch_id: batch.batchId });
      if (error) throw error;
      const results = data ?? [];
      const restored = results.reduce((sum, r) => sum + r.restored_count, 0);
      const skipped = results.reduce((sum, r) => sum + r.skipped_count, 0);
      if (skipped > 0) {
        toast({
          title: 'Partially restored',
          description: `Restored ${restored} row(s); ${skipped} could not be restored (likely a conflicting row already exists).`,
        });
      } else {
        toast({ title: 'Restored', description: `Restored ${restored} row(s).` });
      }
      await load();
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setRestoringBatchId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Recently deleted</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          RCDO objectives, initiatives, and tasks that have been deleted. Restoring brings back the deleted row(s) as they were.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
            <Loader2 className="h-4 w-4 animate-spin" />Loading…
          </div>
        ) : batches.length === 0 ? (
          <p className="text-sm text-muted-foreground italic py-6 flex items-center gap-2">
            <Trash2 className="h-4 w-4" />Nothing in the trash.
          </p>
        ) : (
          <div className="divide-y divide-border/60">
            {batches.map(batch => (
              <div key={batch.batchId} className="flex items-start gap-3 py-3.5">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-[14px]">{batchTitle(batch)}</span>
                    <Badge variant="secondary">{batch.items.length} row{batch.items.length > 1 ? 's' : ''}</Badge>
                  </div>
                  <p className="text-[13px] text-muted-foreground mt-1">{batchSummary(batch)}</p>
                  <p className="text-[12px] text-muted-foreground mt-1.5">
                    Deleted {format(new Date(batch.deletedAt), 'MMM d, yyyy h:mm a')}
                    {batch.deletedBy && ` by ${profileNames.get(batch.deletedBy) ?? 'Unknown user'}`}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRestore(batch)}
                  disabled={restoringBatchId === batch.batchId}
                  className="flex-shrink-0"
                >
                  {restoringBatchId === batch.batchId ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Restore
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
