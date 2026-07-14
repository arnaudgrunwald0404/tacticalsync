import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Shared per-user flag store for one-time in-product education moments
// (first-run callouts, rollout banners) — see
// supabase/migrations/20260723000004_profile_feature_announcements.sql,
// which added `profiles.feature_announcements jsonb not null default '{}'`
// so each new "have they seen this yet" flag doesn't need its own column.
//
// markSeen() merges its flag atomically server-side via the
// set_feature_announcement_flag RPC (20260728000000_atomic_flag_merge_rpc.sql)
// rather than reading the blob, spreading the new key in client-side, and
// writing the whole object back. Multiple instances of this hook are often
// mounted at once (e.g. Inbox.tsx renders two banners, each with its own
// useFeatureAnnouncement() call) — a client-side merge lets whichever
// instance writes last clobber flags the others just set, using its own
// stale in-memory snapshot.
export function useFeatureAnnouncement(userId: string | null, flagKey: string) {
  const [seen, setSeen] = useState<boolean | null>(null); // null = not loaded yet

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('feature_announcements')
        .eq('id', userId)
        .maybeSingle();
      if (cancelled) return;
      const current = (data?.feature_announcements as Record<string, boolean> | null) ?? {};
      setSeen(!!current[flagKey]);
    })();
    return () => { cancelled = true; };
  }, [userId, flagKey]);

  const markSeen = useCallback(async () => {
    if (!userId) return;
    // Optimistic — the banner/callout should disappear immediately on dismiss.
    setSeen(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).rpc('set_feature_announcement_flag', { p_key: flagKey, p_value: true });
  }, [userId, flagKey]);

  return { seen, markSeen };
}
