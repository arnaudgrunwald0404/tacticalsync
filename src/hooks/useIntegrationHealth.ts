import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface IntegrationHealth {
  loading: boolean;
  agentEnabled: boolean;
  /** Google Calendar connected with a valid refresh token */
  googleConnected: boolean;
  /** google token also has gmail.readonly scope */
  gmailScopeGranted: boolean;
  /** Slack connected */
  slackConnected: boolean;
  /** Zoom connected (has refresh token) */
  zoomConnected: boolean;
  /** Zoom token needs re-authorization (refresh failed) */
  zoomReauthRequired: boolean;
}

export function useIntegrationHealth(): IntegrationHealth {
  const [state, setState] = useState<IntegrationHealth>({
    loading: true,
    agentEnabled: false,
    googleConnected: false,
    gmailScopeGranted: false,
    slackConnected: false,
    zoomConnected: false,
    zoomReauthRequired: false,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db = supabase as unknown as SupabaseClient;
        const [settingsRes, googleRes, slackRes, zoomRes] = await Promise.all([
          db.from('cos_settings').select('agent_config').maybeSingle(),
          db.from('user_calendar_credentials_public').select('connected, scope').maybeSingle(),
          db.from('user_slack_credentials_public').select('connected').maybeSingle(),
          db.from('user_zoom_credentials_public').select('connected, last_sync_status').maybeSingle(),
        ]);
        if (cancelled) return;

        const config = settingsRes.data?.agent_config as { enabled?: boolean } | null;
        const scope: string = googleRes.data?.scope ?? '';
        const gmailScopeGranted =
          scope.includes('gmail.readonly') ||
          scope.includes('https://www.googleapis.com/auth/gmail.readonly');

        setState({
          loading: false,
          agentEnabled: config?.enabled === true,
          googleConnected: googleRes.data?.connected === true,
          gmailScopeGranted,
          slackConnected: slackRes.data?.connected === true,
          zoomConnected: zoomRes.data?.connected === true,
          zoomReauthRequired: zoomRes.data?.last_sync_status === 'error: reauth_required',
        });
      } catch {
        if (!cancelled) setState(prev => ({ ...prev, loading: false }));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return state;
}
