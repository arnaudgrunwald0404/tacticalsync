import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { suggestSlackChannels, suggestZoomMatches } from '@/lib/calendar/titleSources';

// The cos_group_meeting* tables aren't in the generated Supabase types yet, so
// we access them through an untyped client (matching the CoS module convention).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

// ── Types ──────────────────────────────────────────────────────────────────

export interface GroupParticipant {
  id: string;
  group_meeting_id: string;
  name: string | null;
  email: string | null;
  team_member_id: string | null;
}

export type GroupSourceType = 'slack_channel' | 'zoom' | 'email';

export interface GroupMeetingSource {
  id: string;
  group_meeting_id: string;
  source_type: GroupSourceType;
  ref: string;
  label: string | null;
  origin: 'suggested' | 'user' | 'confirmed';
  enabled: boolean;
}

export interface GroupMeeting {
  id: string;
  user_id: string;
  recurrence_key: string;
  title: string;
  subject: string | null;
  included: boolean;
  cadence: string | null;
  last_seen_at: string | null;
  next_start_at: string | null;
  created_at: string;
  updated_at: string;
  participants: GroupParticipant[];
  sources: GroupMeetingSource[];
}

// ── useGroupMeetings ─────────────────────────────────────────────────────────
// Fetches the user's discovered recurring group meetings with their rosters and
// bound context sources, and exposes mutations for the include toggle and the
// editable subject.

export function useGroupMeetings() {
  const [meetings, setMeetings] = useState<GroupMeeting[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchMeetings = useCallback(async () => {
    try {
      setLoading(true);
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        setMeetings([]);
        return;
      }
      const db = sb;

      const { data: rows, error } = await db
        .from('cos_group_meetings')
        .select('*')
        .eq('user_id', userData.user.id)
        .order('next_start_at', { ascending: true, nullsFirst: false });
      if (error) throw error;

      const meetingIds = (rows ?? []).map((r: GroupMeeting) => r.id);
      let participants: GroupParticipant[] = [];
      let sources: GroupMeetingSource[] = [];
      if (meetingIds.length > 0) {
        const [pRes, sRes] = await Promise.all([
          db.from('cos_group_meeting_participants').select('*').in('group_meeting_id', meetingIds),
          db.from('cos_group_meeting_sources').select('*').in('group_meeting_id', meetingIds),
        ]);
        participants = (pRes.data ?? []) as GroupParticipant[];
        sources = (sRes.data ?? []) as GroupMeetingSource[];
      }

      const byMeeting = (rows ?? []).map((r: GroupMeeting) => ({
        ...r,
        participants: participants.filter(p => p.group_meeting_id === r.id),
        sources: sources.filter(s => s.group_meeting_id === r.id),
      }));
      setMeetings(byMeeting as GroupMeeting[]);
    } catch (err) {
      console.error('Failed to fetch group meetings:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMeetings(); }, [fetchMeetings]);

  const setIncluded = useCallback(async (id: string, included: boolean) => {
    // Optimistic update.
    setMeetings(prev => prev.map(m => (m.id === id ? { ...m, included } : m)));
    try {
      const { error } = await sb
        .from('cos_group_meetings')
        .update({ included })
        .eq('id', id);
      if (error) throw error;
    } catch (err) {
      setMeetings(prev => prev.map(m => (m.id === id ? { ...m, included: !included } : m)));
      toast({
        title: 'Could not update meeting',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    }
  }, [toast]);

  const updateSubject = useCallback(async (id: string, subject: string) => {
    const previous = meetings.find(m => m.id === id)?.subject ?? null;
    setMeetings(prev => prev.map(m => (m.id === id ? { ...m, subject } : m)));
    try {
      const { error } = await sb
        .from('cos_group_meetings')
        .update({ subject })
        .eq('id', id);
      if (error) throw error;
    } catch (err) {
      setMeetings(prev => prev.map(m => (m.id === id ? { ...m, subject: previous } : m)));
      toast({
        title: 'Could not save subject',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    }
  }, [meetings, toast]);

  // Generate title-driven source suggestions for a meeting from the user's Slack
  // channels and recent Zoom topics, persisting any that aren't already bound.
  const suggestSources = useCallback(async (meeting: GroupMeeting) => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const db = sb;
      const [schedRes, zoomRes] = await Promise.all([
        db.from('cos_prep_schedule').select('slack_channels').eq('user_id', userData.user.id).maybeSingle(),
        db.from('cos_zoom_recordings').select('topic').eq('user_id', userData.user.id).order('start_time', { ascending: false }).limit(100),
      ]);
      const channels: string[] = (schedRes.data?.slack_channels ?? []) as string[];
      const zoomTopics: string[] = ((zoomRes.data ?? []) as Array<{ topic: string | null }>)
        .map(r => r.topic).filter((t): t is string => !!t);

      const suggestions = [
        ...suggestSlackChannels(meeting.title, channels),
        ...suggestZoomMatches(meeting.title, zoomTopics),
      ];
      const existing = new Set(meeting.sources.map(s => `${s.source_type}:${s.ref}`));
      const rows = suggestions
        .filter(s => !existing.has(`${s.source_type}:${s.ref}`))
        .map(s => ({
          group_meeting_id: meeting.id,
          source_type: s.source_type,
          ref: s.ref,
          label: s.label,
          origin: 'suggested',
          enabled: true,
        }));
      if (rows.length > 0) {
        await db.from('cos_group_meeting_sources').upsert(rows, { onConflict: 'group_meeting_id,source_type,ref' });
        await fetchMeetings();
      }
    } catch (err) {
      console.error('Failed to suggest sources:', err);
    }
  }, [fetchMeetings]);

  const addSource = useCallback(async (
    meetingId: string,
    source_type: GroupSourceType,
    ref: string,
    label?: string,
  ) => {
    try {
      const { error } = await sb.from('cos_group_meeting_sources').upsert(
        { group_meeting_id: meetingId, source_type, ref, label: label ?? ref, origin: 'user', enabled: true },
        { onConflict: 'group_meeting_id,source_type,ref' },
      );
      if (error) throw error;
      await fetchMeetings();
    } catch (err) {
      toast({ title: 'Could not add source', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    }
  }, [fetchMeetings, toast]);

  const removeSource = useCallback(async (sourceId: string) => {
    setMeetings(prev => prev.map(m => ({ ...m, sources: m.sources.filter(s => s.id !== sourceId) })));
    await sb.from('cos_group_meeting_sources').delete().eq('id', sourceId);
  }, []);

  const toggleSource = useCallback(async (sourceId: string, enabled: boolean) => {
    setMeetings(prev => prev.map(m => ({
      ...m,
      sources: m.sources.map(s => (s.id === sourceId ? { ...s, enabled } : s)),
    })));
    await sb.from('cos_group_meeting_sources').update({ enabled }).eq('id', sourceId);
  }, []);

  const included = meetings.filter(m => m.included);
  const discovered = meetings.filter(m => !m.included);

  return {
    meetings, included, discovered, loading,
    refetch: fetchMeetings,
    setIncluded, updateSubject,
    suggestSources, addSource, removeSource, toggleSource,
  };
}
