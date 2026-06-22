import { useEffect, useState } from 'react';
import { Users, Repeat } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { useUpcomingMeetingGroups } from '@/hooks/useUpcomingMeetingGroups';
import { usePrepScheduleConfig } from '@/hooks/usePrepScheduleConfig';

/**
 * Second half of the Coverage tab. The circular CoverageMap above covers true
 * 1:1s; this surfaces recurring meetings with more than two people and lets the
 * user opt each one in or out of daily prep.
 *
 * The opt-in set is the same `cos_prep_schedule.included_group_series` the
 * Recurring Meeting Prep settings panel writes, so toggling here and there stays
 * in sync — this is just a more discoverable place to do it.
 */
export function GroupMeetingCoverage() {
  const { recurringGroups, loading: meetingsLoading } = useUpcomingMeetingGroups();
  const { config, loading: configLoading, saveConfig } = usePrepScheduleConfig();

  // Optimistic local copy so toggles feel instant; reseed when the row loads.
  const [included, setIncluded] = useState<string[]>([]);
  useEffect(() => {
    if (config) setIncluded(config.included_group_series);
  }, [config]);

  const loading = meetingsLoading || configLoading;

  const toggle = (key: string) => {
    const next = included.includes(key)
      ? included.filter(k => k !== key)
      : [...included, key];
    setIncluded(next); // optimistic
    void saveConfig({ included_group_series: next }).then(ok => {
      // saveConfig toasts on failure; roll back so the UI matches reality.
      if (!ok) setIncluded(included);
    });
  };

  const includedCount = recurringGroups.filter(m => included.includes(m.key)).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 px-1">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <Users className="h-4 w-4 text-muted-foreground" /> Group meetings
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Recurring meetings with more than two people. Switch one on to include it in your daily prep.
          </p>
        </div>
        {!loading && recurringGroups.length > 0 && (
          <Badge variant="secondary" className="shrink-0">
            {includedCount} of {recurringGroups.length} included
          </Badge>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-3 p-4">
              {[0, 1, 2].map(i => (
                <div key={i} className="flex items-center justify-between gap-3">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-5 w-9 rounded-full" />
                </div>
              ))}
            </div>
          ) : recurringGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                <Users className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">No recurring group meetings</p>
              <p className="text-xs text-muted-foreground max-w-sm mt-1">
                Recurring meetings with three or more people in the next 60 days will show up here.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {recurringGroups.map(m => {
                const on = included.includes(m.key);
                return (
                  <li key={m.key} className="flex items-center justify-between gap-3 px-4 py-3">
                    <label htmlFor={`group-${m.key}`} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                      <Repeat className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{m.title}</span>
                        <span className="block text-[11px] text-muted-foreground">
                          {m.attendeeCount} attendees · {m.occurrences} upcoming
                        </span>
                      </span>
                    </label>
                    <Switch
                      id={`group-${m.key}`}
                      checked={on}
                      onCheckedChange={() => toggle(m.key)}
                      aria-label={`Include ${m.title} in prep`}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
