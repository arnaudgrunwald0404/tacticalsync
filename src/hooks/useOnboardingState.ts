import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface OnboardingState {
  welcome: boolean;
  lists: boolean;
  oneOnOnes: boolean;
  // Has the user seen the meeting-insights first-run intro banner? See
  // PLAN_idea3_meeting_insights.md §9.1 and the
  // 20260724000000_meeting_insight_dedup_and_intro_flag migration.
  meetingInsightsIntro: boolean;
}

const DEFAULT_STATE: OnboardingState = { welcome: false, lists: false, oneOnOnes: false, meetingInsightsIntro: false };

export function useOnboardingState() {
  const [onboarding, setOnboarding] = useState<OnboardingState>(DEFAULT_STATE);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setUserId(user.id);

      const db = supabase as unknown as SupabaseClient;
      const { data } = await db
        .from('cos_settings')
        .select('onboarding_completed')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data?.onboarding_completed) {
        setOnboarding({ ...DEFAULT_STATE, ...data.onboarding_completed });
      }
      setLoading(false);
    }
    load();
  }, []);

  const markComplete = useCallback(async (key: keyof OnboardingState) => {
    // Optimistic — the tutorial/banner should disappear immediately on dismiss.
    setOnboarding((prev) => ({ ...prev, [key]: true }));
    if (!userId) return;
    // Merged atomically server-side (see set_onboarding_flag in
    // 20260728000000_atomic_flag_merge_rpc.sql) rather than read-then-write
    // from the client, so a concurrently-mounted useOnboardingState()
    // instance (e.g. a nested tab section) can't clobber this flag back to
    // false with its own stale snapshot.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any).rpc('set_onboarding_flag', { p_key: key, p_value: true });
    if (data) {
      setOnboarding({ ...DEFAULT_STATE, ...(data as Partial<OnboardingState>) });
    }
  }, [userId]);

  return { onboarding, loading, markComplete };
}
