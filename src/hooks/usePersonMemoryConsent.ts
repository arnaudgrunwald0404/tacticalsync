import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Tracks whether the user has acknowledged the person-page/pre-1:1-brief
 * consent & expectations modal (PLAN_idea7_relationship_memory.md §7a.4).
 * Backed by cos_settings.person_memory_consent_seen_at — NULL means not yet
 * shown. The modal should appear before the user's first person-page view
 * or first received pre-1:1 brief, whichever comes first.
 */
export function usePersonMemoryConsent(userId: string | null) {
  const [seenAt, setSeenAt] = useState<string | null | undefined>(undefined); // undefined = not loaded yet
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from('cos_settings')
      .select('person_memory_consent_seen_at')
      .eq('user_id', userId)
      .maybeSingle();
    setSeenAt(data?.person_memory_consent_seen_at ?? null);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const acknowledge = useCallback(async () => {
    if (!userId) return;
    const now = new Date().toISOString();
    // Upsert: a user opening their very first person page may not have a
    // cos_settings row yet (it's normally created lazily elsewhere in the
    // app) — don't assume one exists.
    await supabase
      .from('cos_settings')
      .upsert({ user_id: userId, person_memory_consent_seen_at: now }, { onConflict: 'user_id' });
    setSeenAt(now);
  }, [userId]);

  return {
    // Only show the modal once we've actually loaded and confirmed it's
    // unseen — showing it during the `undefined` (loading) state would
    // flash it open for users who already acknowledged it.
    shouldShow: !loading && seenAt === null,
    loading,
    acknowledge,
  };
}
