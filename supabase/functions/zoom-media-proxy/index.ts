// Soundbites (PLAN_idea10_meeting_intelligence_enrichment.md §2.2/§B3):
// authenticated audio-streaming proxy — the first binary-streaming edge
// function in this codebase. Every other function here is JSON-in/JSON-out;
// this one fetches a Zoom cloud-recording audio file on behalf of the
// authenticated TacticalSync user (using their stored Zoom OAuth token) and
// streams the bytes straight back, so a browser <audio> element can play it.
//
// Why this has to exist at all: Zoom's `download_url`s require the
// connecting user's OAuth Bearer token on every request (see
// zoom-recordings-sync/index.ts's `Authorization: Bearer ${accessToken}`
// calls) — that token can never be embedded in a `<audio src="...">` URL
// directly, both because it doesn't belong to the browser and because Zoom's
// cloud-recording URLs are plain HTTPS resources with no built-in per-request
// auth story a media element could satisfy on its own.
//
// Why verify_jwt is OFF for this function (see supabase/config.toml): a
// native <audio>/<video> element cannot attach a custom `Authorization`
// header to the requests it issues, so the platform's normal gateway-level
// JWT check (which only looks at that header) can't run here. Auth is
// instead done inside this function, accepting the caller's Supabase JWT via
// an `access_token` query parameter (in addition to a normal Authorization
// header, for non-media-element callers) — the same "do our own auth check
// in the function body" shape already used by every other verify_jwt=false
// function in this repo (agent-tick, daily-prep-batch, slack-sync-cron),
// just with the token arriving a different way.
//
// v1 scope, per the plan's §2.2 recommendation: serve the WHOLE recording
// file through this proxy and let the browser's native <audio> element seek
// via `currentTime` / Range requests — no server-side audio slicing
// (ffmpeg or similar) exists anywhere in this codebase, and Zoom's
// compressed audio formats don't map a time offset to a fixed byte offset
// without decoding, so "give me just 3:12-3:27" isn't something the Zoom API
// or this proxy can do directly. Range-request passthrough (see below) at
// least lets the browser avoid re-downloading the whole file on every seek.
//
// participant_audio_files (§2.2/§5.4 spike): NOT used here. See the PR
// description / final report for the reasoning — short version: it's
// unverified whether real connected accounts populate it at all, and even if
// populated there's no documented field tying a given participant-audio file
// to a specific transcript speaker name, which would just add a second,
// unverifiable fuzzy-matching problem on top of the existing speaker-name
// matching this pipeline already has. Mixed-track M4A/MP4 is the safer v1
// default; revisit with a live Zoom account spike before building on it.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"
import { getValidZoomAccessToken } from "../_shared/zoomAuth.ts"
import { pickAudioFile, contentTypeFor, type RecordingFile } from "./pickAudioFile.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, range',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  // Range-aware playback needs the browser to be able to read these back
  // on a cross-origin media fetch.
  'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges, Content-Type',
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return jsonResponse({ error: 'method_not_allowed' }, 405)
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const zoomClientId = Deno.env.get('ZOOM_CLIENT_ID') ?? ''
    const zoomClientSecret = Deno.env.get('ZOOM_CLIENT_SECRET') ?? ''

    const url = new URL(req.url)
    const recordingId = url.searchParams.get('recording_id')
    if (!recordingId) return jsonResponse({ error: 'missing_recording_id' }, 400)

    // Accept the JWT via Authorization header (normal callers) OR an
    // access_token query param (the only option a native <audio>/<video>
    // element has, since it can't set custom headers) — see file header.
    const authHeader = req.headers.get('Authorization') ?? ''
    const headerJwt = authHeader.replace(/^Bearer\s+/i, '').trim()
    const jwt = headerJwt || url.searchParams.get('access_token') || ''
    if (!jwt) return jsonResponse({ error: 'missing_authorization' }, 401)

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt)
    if (userErr || !userData?.user) return jsonResponse({ error: 'invalid_token' }, 401)
    const userId = userData.user.id

    // Scope explicitly to this user even though we're on the service-role
    // client (which bypasses RLS) — never trust recording_id alone to imply
    // ownership.
    const { data: recording, error: recErr } = await supabase
      .from('cos_zoom_recordings')
      .select('id, user_id, recording_files')
      .eq('id', recordingId)
      .eq('user_id', userId)
      .maybeSingle()

    if (recErr) return jsonResponse({ error: recErr.message }, 500)
    if (!recording) return jsonResponse({ error: 'recording_not_found' }, 404)

    const files = (recording.recording_files ?? []) as RecordingFile[]
    const audioFile = pickAudioFile(files)
    if (!audioFile) return jsonResponse({ error: 'no_audio_available' }, 404)

    const zoomAuth = await getValidZoomAccessToken(supabase, userId, zoomClientId, zoomClientSecret)
    if (!zoomAuth.ok) return jsonResponse({ error: zoomAuth.error }, zoomAuth.status)

    // Forward the browser's own Range header when present (native <audio>
    // seeking sends this); for a HEAD probe (the ClipPlayer's "is this clip
    // still available" check — see src/components/media/ClipPlayer.tsx)
    // request just the first byte so we don't pull the whole file merely to
    // check availability.
    const rangeHeader = req.method === 'HEAD' ? 'bytes=0-0' : req.headers.get('Range')
    const zoomHeaders: Record<string, string> = {
      'Authorization': `Bearer ${zoomAuth.accessToken}`,
    }
    if (rangeHeader) zoomHeaders['Range'] = rangeHeader

    const zoomRes = await fetch(audioFile.download_url, { headers: zoomHeaders })

    if (!zoomRes.ok && zoomRes.status !== 206) {
      // Zoom's cloud-recording retention window has likely passed, or the
      // account revoked/expired the file — surface a distinguishable status
      // so the client can show "clip no longer available" instead of a
      // generic broken-player state (plan §2.2/open question 3 — this proxy
      // deliberately does not persist a copy into Supabase Storage; see the
      // PR description for that tradeoff).
      return jsonResponse(
        { error: 'clip_unavailable', zoom_status: zoomRes.status },
        zoomRes.status === 404 ? 404 : 502,
      )
    }

    const responseHeaders = new Headers(corsHeaders)
    responseHeaders.set('Content-Type', zoomRes.headers.get('Content-Type') ?? contentTypeFor(audioFile))
    responseHeaders.set('Accept-Ranges', 'bytes')
    const contentLength = zoomRes.headers.get('Content-Length')
    if (contentLength) responseHeaders.set('Content-Length', contentLength)
    const contentRange = zoomRes.headers.get('Content-Range')
    if (contentRange) responseHeaders.set('Content-Range', contentRange)

    if (req.method === 'HEAD') {
      // Don't stream a body back for a HEAD probe — just the status/headers
      // the ClipPlayer's availability check needs.
      return new Response(null, { status: zoomRes.status, headers: responseHeaders })
    }

    return new Response(zoomRes.body, { status: zoomRes.status, headers: responseHeaders })
  } catch (err) {
    console.error('zoom-media-proxy crash:', String(err))
    return jsonResponse({ error: 'internal_error', detail: String(err) }, 500)
  }
})
