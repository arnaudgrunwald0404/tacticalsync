import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

// Shared per-user flag store for one-time in-product education moments
// (first-run callouts, rollout banners) — see
// supabase/migrations/20260723000004_profile_feature_announcements.sql,
// which added `profiles.feature_announcements jsonb not null default '{}'`
// so each new "have they seen this yet" flag doesn't need its own column.
//
// Merge-not-clobber convention: read the current value, spread the new key
// into it client-side, then write the merged object back — the same pattern
// `saveTagSettings` in useInboxTags.ts / `handleTogglePin` in Inbox.tsx use
// for `inbox_tags.settings`. There's no live Postgres jsonb `||` merge
// happening server-side here.
export function useFeatureAnnouncement(userId: string | null, flagKey: string) {
  const [seen, setSeen] = useState<boolean | null>(null); // null = not loaded yet
  const [flags, setFlags] = useState<Record<string, boolean>>({});

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
      setFlags(current);
      setSeen(!!current[flagKey]);
    })();
    return () => { cancelled = true; };
  }, [userId, flagKey]);

  const markSeen = useCallback(async () => {
    if (!userId) return;
    // Optimistic — the banner/callout should disappear immediately on dismiss.
    setSeen(true);
    const merged = { ...flags, [flagKey]: true };
    setFlags(merged);
    await supabase
      .from('profiles')
      .update({ feature_announcements: merged as unknown as Json })
      .eq('id', userId);
  }, [userId, flagKey, flags]);

  return { seen, markSeen };
}
