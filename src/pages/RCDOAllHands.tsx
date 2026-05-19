import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import FancyAvatar from '@/components/ui/fancy-avatar';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getFullNameForAvatar } from '@/lib/nameUtils';
import GridBackground from '@/components/ui/grid-background';
import { useNavigate } from 'react-router-dom';
import { UserProfileHeader } from '@/components/ui/user-profile-header';
import Logo from '@/components/Logo';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobileBottomNav } from '@/components/ui/mobile-bottom-nav';
import { useActiveCycle } from '@/hooks/useRCDO';

interface OwnerProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  avatar_url: string | null;
  avatar_name: string | null;
}

interface SIRow {
  id: string;
  title: string;
  status: string;
  doId: string;
  doTitle: string;
  doOwner: OwnerProfile | null;
  totalTasks: number;
  completedTasks: number;
  percentComplete: number;
}

const STATUS_STYLES: Record<string, { label: string; dot: string; text: string }> = {
  not_started: { label: 'Not Started', dot: 'bg-gray-400', text: 'text-gray-600' },
  on_track: { label: 'On Track', dot: 'bg-emerald-500', text: 'text-emerald-700' },
  initialized: { label: 'On Track', dot: 'bg-emerald-500', text: 'text-emerald-700' },
  at_risk: { label: 'At Risk', dot: 'bg-yellow-500', text: 'text-yellow-700' },
  delayed: { label: 'At Risk', dot: 'bg-yellow-500', text: 'text-yellow-700' },
  off_track: { label: 'Off Track', dot: 'bg-red-500', text: 'text-red-700' },
  cancelled: { label: 'Off Track', dot: 'bg-red-500', text: 'text-red-700' },
  completed: { label: 'Completed', dot: 'bg-purple-500', text: 'text-purple-700' },
  done: { label: 'Completed', dot: 'bg-purple-500', text: 'text-purple-700' },
  draft: { label: 'Draft', dot: 'bg-gray-400', text: 'text-gray-600' },
};

export default function RCDOAllHands() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { cycle, loading: cycleLoading } = useActiveCycle();
  const [rows, setRows] = useState<SIRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!cycle) {
        setRows([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const { data: rces } = await supabase
          .from('rc_rallying_cries')
          .select('id')
          .eq('cycle_id', cycle.id);
        const rceIds = (rces || []).map((r) => r.id);
        if (rceIds.length === 0) {
          setRows([]);
          return;
        }

        const { data: dos } = await supabase
          .from('rc_defining_objectives')
          .select(`
            id,
            title,
            owner_user_id,
            owner:profiles!owner_user_id(id, first_name, last_name, full_name, avatar_url, avatar_name)
          `)
          .in('rallying_cry_id', rceIds);
        type DORow = {
          id: string;
          title: string;
          owner_user_id: string;
          owner: OwnerProfile | OwnerProfile[] | null;
        };
        const doMap = new Map<string, DORow>();
        (dos as DORow[] | null || []).forEach((d) => doMap.set(d.id, d));
        const doIds = Array.from(doMap.keys());
        if (doIds.length === 0) {
          setRows([]);
          return;
        }

        const { data: sis } = await supabase
          .from('rc_strategic_initiatives')
          .select('id, title, status, defining_objective_id, display_order')
          .in('defining_objective_id', doIds)
          .order('display_order', { ascending: true });
        const siList = (sis || []) as Array<{
          id: string;
          title: string;
          status: string;
          defining_objective_id: string;
          display_order: number;
        }>;
        const siIds = siList.map((s) => s.id);

        const taskMap = new Map<string, { total: number; completed: number }>();
        if (siIds.length > 0) {
          const { data: tasks } = await supabase
            .from('rc_tasks')
            .select('strategic_initiative_id, status')
            .in('strategic_initiative_id', siIds);
          (tasks || []).forEach((t) => {
            const siId = t.strategic_initiative_id as string;
            const bucket = taskMap.get(siId) || { total: 0, completed: 0 };
            if (t.status === 'task_changed_canceled') {
              taskMap.set(siId, bucket);
              return;
            }
            bucket.total += 1;
            if (t.status === 'completed') bucket.completed += 1;
            taskMap.set(siId, bucket);
          });
        }

        const result: SIRow[] = siList.map((si) => {
          const doRecord = doMap.get(si.defining_objective_id);
          const ownerRaw = doRecord?.owner;
          const owner: OwnerProfile | null = Array.isArray(ownerRaw)
            ? ownerRaw[0] || null
            : ownerRaw || null;
          const counts = taskMap.get(si.id) || { total: 0, completed: 0 };
          const pct = counts.total > 0 ? Math.round((counts.completed / counts.total) * 100) : 0;
          return {
            id: si.id,
            title: si.title,
            status: si.status,
            doId: si.defining_objective_id,
            doTitle: doRecord?.title || '',
            doOwner: owner,
            totalTasks: counts.total,
            completedTasks: counts.completed,
            percentComplete: pct,
          };
        });

        setRows(result);
      } catch (err) {
        console.error('Error loading all-hands view:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [cycle]);

  const isLoading = loading || cycleLoading;

  return (
    <GridBackground>
      <header className="sticky top-0 z-50 border-b bg-white">
        <div className="container mx-auto px-4 py-3 sm:py-4 flex items-center justify-between relative pr-20">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard/rcdo')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <Logo variant="minimal" size="lg" className="scale-75 sm:scale-100" />
          </div>
          <UserProfileHeader />
        </div>
      </header>
      <div className={`min-h-screen bg-gradient-to-b from-[#F5F3F0] via-white to-[#F8F6F2] ${isMobile ? 'pb-20' : ''}`}>
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              All-Hands View
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Every Strategic Initiative in the active cycle, with progress and percent complete. A
              single view for all-staff and board meetings.
            </p>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !cycle ? (
            <Card className="p-12 text-center">
              <p className="text-gray-600 dark:text-gray-400">No active cycle.</p>
            </Card>
          ) : rows.length === 0 ? (
            <Card className="p-12 text-center">
              <p className="text-gray-600 dark:text-gray-400">
                No Strategic Initiatives in the active cycle.
              </p>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-900 text-white">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">DO Owner</th>
                      <th className="px-4 py-3 text-left font-semibold">Strategic Initiative</th>
                      <th className="px-4 py-3 text-left font-semibold w-40">Progress</th>
                      <th className="px-4 py-3 text-left font-semibold w-56">% Complete</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {rows.map((row) => {
                      const ownerName = getFullNameForAvatar(
                        row.doOwner?.first_name,
                        row.doOwner?.last_name,
                        row.doOwner?.full_name
                      );
                      const style = STATUS_STYLES[row.status] || STATUS_STYLES.not_started;
                      return (
                        <tr
                          key={row.id}
                          className="border-t hover:bg-gray-50 cursor-pointer"
                          onClick={() => navigate(`/rcdo/detail/si/${row.id}`)}
                        >
                          <td className="px-4 py-3 whitespace-nowrap align-top">
                            <div className="flex items-center gap-2">
                              {row.doOwner ? (
                                <FancyAvatar
                                  name={row.doOwner.avatar_name || ownerName}
                                  displayName={ownerName}
                                  avatarUrl={row.doOwner.avatar_url}
                                  size="sm"
                                />
                              ) : null}
                              <span>{ownerName || '—'}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <div className="font-medium text-gray-900">{row.title}</div>
                            {row.doTitle && (
                              <div className="text-xs text-gray-500 mt-0.5">{row.doTitle}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 align-top">
                            <div className="flex items-center gap-2">
                              <span className={`h-2.5 w-2.5 rounded-full ${style.dot}`} />
                              <span className={style.text}>{style.label}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <div className="flex items-center gap-3">
                              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-orange-200"
                                  style={{ width: `${row.percentComplete}%` }}
                                />
                              </div>
                              <span className="w-12 text-right tabular-nums text-gray-700">
                                {row.percentComplete}%
                              </span>
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {row.completedTasks} / {row.totalTasks} tasks complete
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      </div>
      {isMobile && <MobileBottomNav />}
    </GridBackground>
  );
}
