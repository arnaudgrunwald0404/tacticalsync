import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface OnboardingState {
  welcome: boolean;
  lists: boolean;
  oneOnOnes: boolean;
}

const DEFAULT_STATE: OnboardingState = { welcome: false, lists: false, oneOnOnes: false };

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
    const next = { ...onboarding, [key]: true };
    setOnboarding(next);
    if (!userId) return;
    const db = supabase as unknown as SupabaseClient;
    await db.from('cos_settings').upsert(
      { user_id: userId, onboarding_completed: next, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
  }, [onboarding, userId]);

  return { onboarding, loading, markComplete };
}
