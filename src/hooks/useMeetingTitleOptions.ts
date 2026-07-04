import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- cos_group_meetings isn't in the generated types yet
const sb = supabase as any;

// Distinct recurring meeting titles/subjects the user has discovered from their
// calendar — used to power autocomplete when linking a meeting to a project.
export function useMeetingTitleOptions(userId: string | null) {
  const [titles, setTitles] = useState<string[]>([]);

  useEffect(() => {
    if (!userId) return;
    sb
      .from('cos_group_meetings')
      .select('title, subject')
      .eq('user_id', userId)
      .then(({ data }: { data: { title: string; subject: string | null }[] | null }) => {
        if (!data) return;
        const names = Array.from(new Set(data.map(r => r.subject || r.title).filter(Boolean)));
        names.sort((a, b) => a.localeCompare(b));
        setTitles(names);
      });
  }, [userId]);

  return titles;
}
