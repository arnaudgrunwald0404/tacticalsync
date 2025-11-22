import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import FancyAvatar from '@/components/ui/fancy-avatar';
import { Calendar, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { getFullNameForAvatar } from '@/lib/nameUtils';
import GridBackground from '@/components/ui/grid-background';
import { useNavigate } from 'react-router-dom';
import { UserProfileHeader } from '@/components/ui/user-profile-header';
import Logo from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

interface CheckinFeedItem {
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
  parent_title: string;
  parent_type_label: string;
}

export default function TasksFeed() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [checkins, setCheckins] = useState<CheckinFeedItem[]>([]);
  const [filterType, setFilterType] = useState<'all' | 'do' | 'initiative' | 'task'>('all');
  const [filterOwner, setFilterOwner] = useState<string>('all');
  const [owners, setOwners] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    fetchCheckins();
    fetchOwners();
  }, [filterType, filterOwner]);

  const fetchOwners = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, full_name')
        .order('full_name', { ascending: true });

      if (error) throw error;
      setOwners((data || []).map(p => ({
        id: p.id,
        name: getFullNameForAvatar(p.first_name, p.last_name, p.full_name)
      })));
    } catch (err) {
      console.error('Error fetching owners:', err);
    }
  };

  const fetchCheckins = async () => {
    try {
      setLoading(true);

      let query = supabase
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
        .limit(50);

      if (filterType !== 'all') {
        query = query.eq('parent_type', filterType);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Fetch parent titles
      const doIds = (data || []).filter(c => c.parent_type === 'do').map(c => c.parent_id);
      const siIds = (data || []).filter(c => c.parent_type === 'initiative').map(c => c.parent_id);
      const taskIds = (data || []).filter(c => c.parent_type === 'task').map(c => c.parent_id);

      const parentTitles: Record<string, { title: string; type: string }> = {};

      if (doIds.length) {
        const { data: dos } = await supabase
          .from('rc_defining_objectives')
          .select('id, title')
          .in('id', doIds);
        (dos || []).forEach((d: any) => {
          parentTitles[d.id] = { title: d.title, type: 'DO' };
        });
      }

      if (siIds.length) {
        const { data: sis } = await supabase
          .from('rc_strategic_initiatives')
          .select('id, title')
          .in('id', siIds);
        (sis || []).forEach((s: any) => {
          parentTitles[s.id] = { title: s.title, type: 'SI' };
        });
      }

      if (taskIds.length) {
        const { data: tasks } = await supabase
          .from('rc_tasks')
          .select('id, title')
          .in('id', taskIds);
        (tasks || []).forEach((t: any) => {
          parentTitles[t.id] = { title: t.title, type: 'Task' };
        });
      }

      // Filter by owner if specified
      let filteredData = data || [];
      if (filterOwner !== 'all') {
        filteredData = filteredData.filter(c => c.creator?.id === filterOwner);
      }

      const items: CheckinFeedItem[] = filteredData.map((c: any) => {
        const parentInfo = parentTitles[c.parent_id] || { title: 'Unknown', type: c.parent_type.toUpperCase() };
        return {
          ...c,
          parent_title: parentInfo.title,
          parent_type_label: parentInfo.type,
        };
      });

      setCheckins(items);
    } catch (err: any) {
      console.error('Error fetching check-ins:', err);
    } finally {
      setLoading(false);
    }
  };

  const statusDot = (sentiment: number | null | undefined) => {
    if (sentiment === null || sentiment === undefined) return 'bg-gray-300';
    if (sentiment <= -1) return 'bg-red-400';
    if (sentiment === 0) return 'bg-yellow-400';
    return 'bg-emerald-400';
  };

  const handleParentClick = (item: CheckinFeedItem) => {
    if (item.parent_type === 'do') {
      navigate(`/dashboard/rcdo/do/${item.parent_id}`);
    } else if (item.parent_type === 'initiative') {
      navigate(`/dashboard/rcdo/si/${item.parent_id}`);
    } else if (item.parent_type === 'task') {
      // Navigate to SI detail page (tasks are shown there)
      // We'd need to fetch the task's SI ID, but for now just navigate to SI detail
      navigate(`/dashboard/rcdo/si/${item.parent_id}`);
    }
  };

  return (
    <GridBackground>
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-3 sm:py-4 flex items-center justify-between relative pr-20">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/dashboard/rcdo')}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <Logo variant="minimal" size="lg" className="scale-75 sm:scale-100" />
          </div>
          <UserProfileHeader />
        </div>
      </header>
      <div className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              Activity Feed
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Recent check-ins from Defining Objectives, Strategic Initiatives, and Tasks
            </p>
          </div>

          {/* Filters */}
          <Card className="p-4 mb-6">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Filter:</span>
              </div>
              <Select value={filterType} onValueChange={(val: any) => setFilterType(val)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="do">DOs</SelectItem>
                  <SelectItem value="initiative">SIs</SelectItem>
                  <SelectItem value="task">Tasks</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterOwner} onValueChange={setFilterOwner}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Owners</SelectItem>
                  {owners.map((owner) => (
                    <SelectItem key={owner.id} value={owner.id}>
                      {owner.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </Card>

          {/* Check-ins List */}
          {loading ? (
            <div className="space-y-3">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : checkins.length === 0 ? (
            <Card className="p-12 text-center">
              <p className="text-gray-600 dark:text-gray-400">
                No check-ins found matching your filters.
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {checkins.map((checkin) => {
                const reporter = getFullNameForAvatar(
                  checkin.creator?.first_name,
                  checkin.creator?.last_name,
                  checkin.creator?.full_name
                );
                return (
                  <Card
                    key={checkin.id}
                    className="p-4 cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => handleParentClick(checkin)}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`h-3 w-3 rounded-full mt-1.5 flex-shrink-0 ${statusDot(checkin.sentiment)}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="text-sm font-semibold truncate" title={checkin.parent_title}>
                            {checkin.parent_title}
                          </div>
                          <Badge variant="outline" className="px-1.5 py-0 text-xs">
                            {checkin.parent_type_label}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span>{format(new Date(checkin.date), 'MMM d, yyyy')}</span>
                          </div>
                          {typeof checkin.percent_to_goal === 'number' && (
                            <span>{checkin.percent_to_goal}% to goal</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                          <FancyAvatar
                            name={checkin.creator?.avatar_name || reporter}
                            displayName={reporter}
                            avatarUrl={checkin.creator?.avatar_url}
                            size="sm"
                          />
                          <span className="text-xs text-muted-foreground">{reporter}</span>
                        </div>
                        {checkin.summary && (
                          <p className="text-sm text-foreground/90 line-clamp-2 mt-2">
                            {checkin.summary}
                          </p>
                        )}
                        {!checkin.summary && checkin.next_steps && (
                          <p className="text-sm text-foreground/90 line-clamp-2 mt-2">
                            {checkin.next_steps}
                          </p>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </GridBackground>
  );
}

