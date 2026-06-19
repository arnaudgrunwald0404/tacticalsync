import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { categorizeMeeting } from '@/lib/prepTools';

/**
 * Loads the user's upcoming calendar events and groups them into the categories
 * the inclusion model cares about: recurring 1:1s (auto-included, preview),
 * one-off 1:1s (auto-included, "high-value"), and recurring >2-attendee
 * meetings (opt-in, keyed by `recurring_event_id`).
 *
 * Powers the inclusion lists in the Recurring Meeting Prep settings.
 */

export interface MeetingGroup {
  /** recurring_event_id for series; event id for one-offs. */
  key: string;
  title: string;
  attendeeLabel: string;
  attendeeCount: number;
  occurrences: number;
}

interface RawEvent {
  id: string;
  title: string | null;
  start_time: string;
  attendee_name: string | null;
  attendee_email: string | null;
  attendee_emails: string[] | null;
  recurring_event_id: string | null;
  status: string;
}

function attendeeLabelFor(e: RawEvent): string {
  if (e.attendee_name && !e.attendee_name.includes('@')) return e.attendee_name;
  const email = e.attendee_email ?? e.attendee_emails?.[0];
  if (email) return email.split('@')[0];
  return e.title ?? 'Untitled';
}

export function useUpcomingMeetingGroups() {
  const [recurringOneOnOnes, setRecurringOneOnOnes] = useState<MeetingGroup[]>([]);
  const [oneOffOneOnOnes, setOneOffOneOnOnes] = useState<MeetingGroup[]>([]);
  const [recurringGroups, setRecurringGroups] = useState<MeetingGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const now = new Date();
      const horizon = new Date(Date.now() + 60 * 86_400_000);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from('cos_one_on_one_events')
        .select('id, title, start_time, attendee_name, attendee_email, attendee_emails, recurring_event_id, status')
        .eq('user_id', user.id)
        .gte('start_time', now.toISOString())
        .lte('start_time', horizon.toISOString())
        .neq('status', 'cancelled')
        .order('start_time', { ascending: true });

      const events = (data ?? []) as RawEvent[];

      // Group recurring events by series; collect one-offs individually.
      const series = new Map<string, { rep: RawEvent; count: number; maxAttendees: number }>();
      const oneOffs: MeetingGroup[] = [];

      for (const e of events) {
        const attendeeCount = e.attendee_emails?.length ?? 0;
        if (e.recurring_event_id) {
          const existing = series.get(e.recurring_event_id);
          if (existing) {
            existing.count += 1;
            existing.maxAttendees = Math.max(existing.maxAttendees, attendeeCount);
          } else {
            series.set(e.recurring_event_id, { rep: e, count: 1, maxAttendees: attendeeCount });
          }
        } else if (categorizeMeeting(null, attendeeCount) === 'oneoff_1on1') {
          // Only one-off 1:1s are auto-included/high-value; skip one-off groups.
          oneOffs.push({
            key: e.id,
            title: e.title ?? 'Untitled',
            attendeeLabel: attendeeLabelFor(e),
            attendeeCount,
            occurrences: 1,
          });
        }
      }

      const recurring1on1: MeetingGroup[] = [];
      const recurringGrp: MeetingGroup[] = [];
      for (const [seriesId, s] of series) {
        const group: MeetingGroup = {
          key: seriesId,
          title: s.rep.title ?? 'Untitled',
          attendeeLabel: attendeeLabelFor(s.rep),
          attendeeCount: s.maxAttendees,
          occurrences: s.count,
        };
        if (categorizeMeeting(seriesId, s.maxAttendees) === 'recurring_1on1') recurring1on1.push(group);
        else recurringGrp.push(group);
      }

      recurring1on1.sort((a, b) => a.title.localeCompare(b.title));
      recurringGrp.sort((a, b) => b.attendeeCount - a.attendeeCount);

      setRecurringOneOnOnes(recurring1on1);
      setOneOffOneOnOnes(oneOffs);
      setRecurringGroups(recurringGrp);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return { recurringOneOnOnes, oneOffOneOnOnes, recurringGroups, loading, refetch: load };
}
