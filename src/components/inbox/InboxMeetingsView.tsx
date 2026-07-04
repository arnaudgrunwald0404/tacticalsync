import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { TeamSection, type CosTeamMember } from '@/pages/ChiefOfStaff';
import { MeetingDetailPanel } from '@/components/inbox/MeetingDetailPanel';
import type { UpcomingOneOnOneEvent } from '@/components/cos/OneOnOnesView';
import type { MeetingsSyncInfo } from '@/components/inbox/InboxSidebar';

interface InboxMeetingsViewProps {
  search?: string;
  onSyncInfoChange?: (info: MeetingsSyncInfo) => void;
  /** Controlled selected event — lifted to parent so the sidebar can render the nav */
  selectedEvent?: UpcomingOneOnOneEvent | null;
  onSelectEvent?: (event: UpcomingOneOnOneEvent | null) => void;
  /** Controlled active tab for the meeting detail panel */
  activeTab?: import('@/components/inbox/MeetingDetailSidebarNav').MeetingDetailTab;
  onTabChange?: (tab: import('@/components/inbox/MeetingDetailSidebarNav').MeetingDetailTab) => void;
}

export function InboxMeetingsView({ search = '', onSyncInfoChange, selectedEvent: selectedEventProp, onSelectEvent, activeTab, onTabChange }: InboxMeetingsViewProps) {
  const [members, setMembers] = useState<CosTeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEventInternal, setSelectedEventInternal] = useState<UpcomingOneOnOneEvent | null>(null);
  const selectedEvent = selectedEventProp !== undefined ? selectedEventProp : selectedEventInternal;
  const setSelectedEvent = (e: UpcomingOneOnOneEvent | null) => {
    setSelectedEventInternal(e);
    onSelectEvent?.(e);
  };

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
    const isControlled = selectedEventProp !== undefined;
    return (
      <MeetingDetailPanel
        event={selectedEvent}
        onBack={() => setSelectedEvent(null)}
        hideSidebar={isControlled}
        activeTabOverride={activeTab}
        onTabChange={onTabChange}
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
