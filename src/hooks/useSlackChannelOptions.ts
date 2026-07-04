import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Distinct Slack channel names the user has synced messages from — used to
// power autocomplete when linking a channel to a project.
export function useSlackChannelOptions(userId: string | null) {
  const [channels, setChannels] = useState<string[]>([]);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from('cos_slack_messages')
      .select('channel_name')
      .eq('user_id', userId)
      .not('channel_name', 'is', null)
      .then(({ data }: { data: { channel_name: string | null }[] | null }) => {
        if (!data) return;
        const names = Array.from(new Set(data.map(r => r.channel_name).filter((n): n is string => !!n)));
        names.sort((a, b) => a.localeCompare(b));
        setChannels(names);
      });
  }, [userId]);

  return channels;
}
