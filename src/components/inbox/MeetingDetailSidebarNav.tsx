import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ArrowLeft, CalendarDays, Video } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import type { UpcomingOneOnOneEvent } from '@/components/cos/OneOnOnesView';

export type MeetingDetailTab = 'prep' | 'past' | 'timeline' | 'settings';

interface Props {
  event: UpcomingOneOnOneEvent;
  activeTab: MeetingDetailTab;
  onTabChange: (tab: MeetingDetailTab) => void;
  onBack: () => void;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function MeetingDetailSidebarNav({ event, activeTab, onTabChange, onBack }: Props) {
  const member = event.team_member;
  const name = member?.name ?? event.attendee_name ?? event.attendee_email ?? 'Unknown';
  const role = member?.role ?? 'Team member';
  const start = new Date(event.start_time);
  const end = new Date(event.end_time);
  const title = event.title ?? `1:1 with ${name}`;
  const timeStr = `${format(start, 'EEE, MMM d')} · ${format(start, 'h:mm')}–${format(end, 'h:mm a')}`;

  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [zoomRecsCount, setZoomRecsCount] = useState(0);

  useEffect(() => {
    if (!member?.id) return;
    const db = supabase as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await db
        .from('cos_one_on_one_prep')
        .select('generated_at')
        .eq('user_id', user.id)
        .eq('team_member_id', member.id)
        .eq('status', 'ready')
        .order('prep_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data?.generated_at) setGeneratedAt(data.generated_at);
    })();

    db.from('cos_zoom_recordings')
      .select('id', { count: 'exact', head: true })
      .eq('team_member_id', member.id)
      .then(({ count }: { count: number | null }) => setZoomRecsCount(count ?? 0))
      .catch(() => {});
  }, [member?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const NAV_TABS: Array<{ key: MeetingDetailTab; label: string; badge?: number }> = [
    { key: 'prep', label: 'Prep' },
    { key: 'settings', label: 'Prep settings' },
    { key: 'past', label: 'Past 1:1s', badge: zoomRecsCount || undefined },
    { key: 'timeline', label: 'Timeline' },
  ];

  return (
    <div className="h-full bg-white flex flex-col px-5 py-4 gap-6 overflow-y-auto w-[240px] flex-shrink-0 rounded-xl shadow-sm border border-gray-200/80">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors -ml-0.5"
      >
        <ArrowLeft className="h-4 w-4" />
        Calendar
      </button>

      <div className="flex flex-col items-center gap-3 pt-2">
        <div className="w-16 h-16 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-xl flex-shrink-0">
          {initials(name)}
        </div>
        <div className="text-center">
          <div className="text-[17px] font-bold text-gray-900 leading-tight">{name}</div>
          <div className="text-sm text-gray-400 mt-1">{role}</div>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex flex-col gap-1.5">
        <div className="flex items-center gap-2 text-blue-600">
          <CalendarDays className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm font-semibold leading-tight">{title}</span>
        </div>
        <div className="text-xs text-blue-500 pl-6">{timeStr}</div>
        <button className="mt-1 ml-6 self-start flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
          <Video className="h-3 w-3" />
          Join call
        </button>
      </div>

      {generatedAt && (
        <div className="text-xs text-gray-400 -mt-3">
          Prep generated {format(new Date(generatedAt), 'MMM d')}
        </div>
      )}

      <nav className="flex flex-col mt-1">
        {NAV_TABS.map(t => {
          const active = activeTab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => onTabChange(t.key)}
              className={cn(
                'flex items-center gap-2.5 px-2 py-2.5 rounded-lg text-sm transition-colors text-left w-full',
                active
                  ? 'font-semibold text-gray-900 bg-gray-100'
                  : 'font-normal text-gray-500 hover:text-gray-800 hover:bg-gray-50',
              )}
            >
              {t.label}
              {t.badge != null && (
                <Badge className="h-5 min-w-[20px] px-1.5 text-[11px] font-bold bg-gray-600 text-white border-0">
                  {t.badge}
                </Badge>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
