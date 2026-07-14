import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import { useToast } from '@/hooks/use-toast';

export interface NotificationPreferences {
  overdue_action_nudges: boolean;
  prep_ready: boolean;
  escalation_alerts: boolean;
  format_suggestions: boolean;
  meeting_followups: boolean;
  daily_brief: boolean;
  inbox_item_nudges: boolean;
  /** RCDO stale check-in / metric alerts — see supabase/functions/rcdo-stale-check/index.ts. */
  rcdo_stale_alerts: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  overdue_action_nudges: true,
  prep_ready: true,
  escalation_alerts: true,
  format_suggestions: true,
  meeting_followups: true,
  daily_brief: true,
  inbox_item_nudges: true,
  rcdo_stale_alerts: true,
};

export function useNotificationPreferences() {
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_NOTIFICATION_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [slackConnected, setSlackConnected] = useState(false);
  const [slackEmail, setSlackEmail] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) return;

        const { data: settings } = await (supabase as unknown as SupabaseClient)
          .from('cos_settings')
          .select('notification_preferences')
          .eq('user_id', userData.user.id)
          .maybeSingle();

        if (settings?.notification_preferences) {
          setPrefs({ ...DEFAULT_NOTIFICATION_PREFERENCES, ...settings.notification_preferences });
        }

        const { data: slackCreds } = await (supabase as unknown as SupabaseClient)
          .from('user_slack_credentials_public')
          .select('connected, slack_email')
          .maybeSingle();

        setSlackConnected(slackCreds?.connected === true);
        setSlackEmail(slackCreds?.slack_email ?? null);
      } catch (err) {
        console.error('Failed to load notification preferences:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = useCallback(async (next: NotificationPreferences) => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      await (supabase as unknown as SupabaseClient)
        .from('cos_settings')
        .upsert({
          user_id: userData.user.id,
          notification_preferences: next,
        }, { onConflict: 'user_id' });

      toast({ title: 'Notification settings saved' });
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    }
  }, [toast]);

  const update = useCallback((patch: Partial<NotificationPreferences>) => {
    setPrefs(prev => {
      const next = { ...prev, ...patch };
      save(next);
      return next;
    });
  }, [save]);

  return { prefs, loading, slackConnected, slackEmail, update };
}
