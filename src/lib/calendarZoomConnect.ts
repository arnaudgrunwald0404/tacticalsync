import { supabase } from '@/integrations/supabase/client';

const ZOOM_CLIENT_ID = import.meta.env.VITE_ZOOM_CLIENT_ID ?? '';
const CALENDAR_SCOPES = 'openid email profile https://www.googleapis.com/auth/calendar.events.readonly';
const ZOOM_SCOPES = 'user:read:user meeting:read:list_meetings meeting:read:meeting cloud_recording:read:list_user_recordings cloud_recording:read:list_recording_files meeting:read:summary meeting:read:list_past_instances meeting:read:meeting_transcript docs:read:file docs:read:list_children docs:read:export docs:write:export';

/**
 * Starts the Google Calendar OAuth flow. Same call as CosCalendarSyncPanel's
 * `connect()`, retargeted to land back on `/inbox` (not `/chief-of-staff`)
 * so the sync — and its progress log — actually happen on the page the user
 * is looking at. Unlike Zoom's raw OAuth2 flow, Supabase Auth's redirect
 * isn't validated against a single fixed value, but it does need to be on
 * the project's configured redirect allowlist — if that's locked to an
 * exact path today, this will need a matching entry (or a wildcard) added
 * in the Supabase Auth dashboard.
 */
export async function connectGoogleCalendar(): Promise<void> {
  const origin = window.location.origin;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      scopes: CALENDAR_SCOPES,
      queryParams: { access_type: 'offline', prompt: 'consent' },
      redirectTo: `${origin}/inbox?calendar=connected`,
    },
  });
  if (error) throw error;
}

/**
 * Starts the Zoom OAuth flow. Zoom requires the `redirect_uri` sent here to
 * exactly match both what's registered in the Zoom app console AND the
 * server-side `ZOOM_REDIRECT_URI` secret `exchange-zoom-token` uses for the
 * token exchange — both are fixed to `/settings` today, so this can't be
 * retargeted client-side without changing external config. `Settings.tsx`
 * intercepts this callback before its admin gate and forwards to `/inbox`.
 */
export function connectZoom(): void {
  if (!ZOOM_CLIENT_ID) throw new Error('VITE_ZOOM_CLIENT_ID is not set.');
  const redirectUri = `${window.location.origin}/settings`;
  const url = `https://zoom.us/oauth/authorize?response_type=code&client_id=${encodeURIComponent(ZOOM_CLIENT_ID)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(ZOOM_SCOPES)}&state=zoom_connected`;
  window.location.href = url;
}

interface CalendarSyncResult { created?: number; updated?: number; cancelled?: number }

/** Saves the freshly-granted Google tokens (if this is the post-consent
 *  redirect) then runs the calendar sync, scoped to `days` (7 for a first
 *  connect, so onboarding doesn't dump two weeks of history on the user). */
export async function kickOffCalendarSync(days = 7): Promise<CalendarSyncResult> {
  const { data: { session } } = await supabase.auth.getSession();
  const s = session as unknown as { provider_token?: string; provider_refresh_token?: string };
  if (s?.provider_refresh_token) {
    const { error: saveError } = await supabase.functions.invoke('save-google-calendar-tokens', {
      body: {
        access_token: s.provider_token ?? '',
        refresh_token: s.provider_refresh_token,
        expires_in: 3600,
        scope: CALENDAR_SCOPES,
      },
    });
    if (saveError) throw saveError;
  }
  const { data, error } = await supabase.functions.invoke('google-calendar-sync', { body: { days } });
  if (error) throw error;
  return (data ?? {}) as CalendarSyncResult;
}

interface ZoomSyncResult { synced?: number; transcripts_fetched?: number }

/** Exchanges the Zoom OAuth `code` for tokens, then runs the recordings
 *  sync scoped to `days` (7 for a first connect). */
export async function kickOffZoomSync(code: string, days = 7): Promise<ZoomSyncResult> {
  const { error: tokenError } = await supabase.functions.invoke('exchange-zoom-token', { body: { code } });
  if (tokenError) throw tokenError;
  const { data, error } = await supabase.functions.invoke('zoom-recordings-sync', { body: { days } });
  if (error) throw error;
  return (data ?? {}) as ZoomSyncResult;
}
