import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { TeamSection, type CosTeamMember } from '@/pages/ChiefOfStaff';

export function InboxMeetingsView() {
  const [members, setMembers] = useState<CosTeamMember[]>([]);
  const [loading, setLoading] = useState(true);

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

  return <TeamSection members={members} basePath="/inbox/meetings" hideViewToggle />;
}
