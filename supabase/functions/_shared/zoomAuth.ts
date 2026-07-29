// Shared Zoom OAuth token handling — extracted from zoom-recordings-sync/index.ts
// so zoom-media-proxy (Soundbites, PLAN_idea10 §B3) doesn't reinvent the
// refresh-and-persist dance. Behavior is unchanged from the original inline
// version: read stored credentials, refresh if expired/near-expiry (30s
// skew), persist the rotated access/refresh token pair, and record a
// `last_sync_status` on failure so the existing Settings → Zoom sync UI
// (which reads that column) keeps working the same way it always has —
// including the same retryWithBackoff wrapping around the refresh call.

import { retryWithBackoff } from "./retryWithBackoff.ts"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
// deno-lint-ignore no-explicit-any
type SupabaseClientLike = any

export type ZoomAuthResult =
  | { ok: true; accessToken: string }
  | { ok: false; error: string; status: number }

/**
 * Returns a valid Zoom access token for `userId`, refreshing and persisting a
 * new one if the stored token is expired or within 30s of expiring. Mirrors
 * the exact refresh flow zoom-recordings-sync/index.ts used inline before
 * this extraction — same credential table, same status bookkeeping.
 */
export async function getValidZoomAccessToken(
  supabase: SupabaseClientLike,
  userId: string,
  zoomClientId: string,
  zoomClientSecret: string,
): Promise<ZoomAuthResult> {
  const { data: creds, error: credsErr } = await supabase
    .from('user_zoom_credentials')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (credsErr) return { ok: false, error: credsErr.message, status: 500 }
  if (!creds) return { ok: false, error: 'not_connected', status: 400 }

  let accessToken: string = creds.access_token
  const refreshToken: string | null = creds.refresh_token
  const expiresAt: string | null = creds.expires_at

  const needsRefresh = !expiresAt || (new Date(expiresAt).getTime() - Date.now() < 30_000)
  if (!needsRefresh) return { ok: true, accessToken }

  if (!refreshToken) {
    await supabase
      .from('user_zoom_credentials')
      .update({ last_sync_status: 'error: refresh failed' })
      .eq('user_id', userId)
    return { ok: false, error: 'refresh_failed', status: 401 }
  }

  const basicAuth = btoa(`${zoomClientId}:${zoomClientSecret}`)
  const refreshRes = await retryWithBackoff(
    () => fetch('https://zoom.us/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    }),
    { integration: 'zoom', label: 'refresh access token' },
  )

  if (!refreshRes.ok) {
    const status = refreshRes.status
    const syncStatus = status === 401 ? 'error: reauth_required' : 'error: refresh failed'
    await supabase
      .from('user_zoom_credentials')
      .update({ last_sync_status: syncStatus })
      .eq('user_id', userId)
    return { ok: false, error: syncStatus, status: 401 }
  }

  const refreshData = await refreshRes.json() as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
  }
  if (!refreshData.access_token || typeof refreshData.expires_in !== 'number') {
    await supabase
      .from('user_zoom_credentials')
      .update({ last_sync_status: 'error: refresh failed' })
      .eq('user_id', userId)
    return { ok: false, error: 'refresh_failed', status: 401 }
  }

  accessToken = refreshData.access_token
  const newExpiresAt = new Date(Date.now() + refreshData.expires_in * 1000).toISOString()

  // Zoom issues a new refresh_token on every refresh — must persist it.
  const updatePayload: Record<string, unknown> = {
    access_token: accessToken,
    expires_at: newExpiresAt,
  }
  if (refreshData.refresh_token) {
    updatePayload.refresh_token = refreshData.refresh_token
  }

  await supabase
    .from('user_zoom_credentials')
    .update(updatePayload)
    .eq('user_id', userId)

  return { ok: true, accessToken }
}
