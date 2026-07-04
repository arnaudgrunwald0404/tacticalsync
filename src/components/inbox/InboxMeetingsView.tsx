import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { TeamSection, type CosTeamMember } from '@/pages/ChiefOfStaff';
import { MeetingDetailPanel } from '@/components/inbox/MeetingDetailPanel';
import type { UpcomingOneOnOneEvent } from '@/components/cos/OneOnOnesView';
import type { MeetingsSyncInfo } from '@/components/inbox/InboxSidebar';

interface InboxMeetingsViewProps {
  search?: string;
  onSyncInfoChange?: (info: MeetingsSyncInfo) => void;
}

export function InboxMeetingsView({ search = '', onSyncInfoChange }: InboxMeetingsViewProps) {
  const [members, setMembers] = useState<CosTeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<UpcomingOneOnOneEvent | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('cos_team_members')
        .select('*')
        .eq('user_id', user.id)
        .order('name');
      setMembers((data ?? []) as CosTeamMember[]);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
        Loading meetings…
      </div>
    );
  }

  if (selectedEvent) {
    return (
      <MeetingDetailPanel
        event={selectedEvent}
        onBack={() => setSelectedEvent(null)}
      />
    );
  }

  return (
    <TeamSection
      members={members}
      basePath="/inbox/meetings"
      hideViewToggle
      onSelectEvent={setSelectedEvent}
      externalSearch={search}
      onSyncInfoChange={onSyncInfoChange}
    />
  );
}
