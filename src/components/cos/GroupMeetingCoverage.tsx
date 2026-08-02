import { Users, Repeat } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { useGroupMeetings } from '@/hooks/useGroupMeetings';

/**
 * Second half of the Coverage tab. The circular CoverageMap above covers true
 * 1:1s; this surfaces recurring meetings with more than two people and lets the
 * user opt each one in or out of daily prep.
 *
 * Backed by cos_group_meetings (the same curated, calendar-sync-discovered
 * group meeting list the Recurring Meeting Prep settings panel manages), so
 * toggling here and there stays in sync — this is just a more discoverable
 * place to do it.
 */
export function GroupMeetingCoverage() {
  const { meetings, loading, setIncluded } = useGroupMeetings();

  const includedCount = meetings.filter(m => m.included).length;

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
        {!loading && meetings.length > 0 && (
          <Badge variant="secondary" className="shrink-0">
            {includedCount} of {meetings.length} included
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
          ) : meetings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                <Users className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">No group meetings found</p>
              <p className="text-xs text-muted-foreground max-w-sm mt-1">
                Recurring meetings with three or more people will show up here once your calendar sync discovers them.
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {meetings.map(m => (
                <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <label htmlFor={`group-${m.id}`} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                    <Repeat className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{m.subject ?? m.title}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {m.participants.length} attendees{m.cadence ? ` · ${m.cadence}` : ''}
                      </span>
                    </span>
                  </label>
                  <Switch
                    id={`group-${m.id}`}
                    checked={m.included}
                    onCheckedChange={() => setIncluded(m.id, !m.included)}
                    aria-label={`Include ${m.subject ?? m.title} in prep`}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
