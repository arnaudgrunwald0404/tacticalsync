// Soundbites (PLAN_idea10_meeting_intelligence_enrichment.md, Phase B): the
// first audio-player component this codebase has ever needed — every quote
// surface before this shipped as text-only (§1.4 of the plan). A thin
// wrapper around a native <audio> element pointed at the zoom-media-proxy
// edge function, which streams the whole underlying Zoom recording file and
// lets the browser seek via currentTime (see the proxy's own file header for
// why: Zoom's compressed audio formats don't map a time offset to a fixed
// byte range without server-side decoding, so slicing server-side isn't v1
// scope).
//
// Clip persistence (plan's open question #3): deliberately NOT backed by
// Supabase Storage for v1 — a clip plays straight from Zoom's cloud
// recording, which is subject to Zoom's own account-configurable retention
// window. Once that window passes, the underlying file 404s and this
// component shows "Clip no longer available" rather than a silently broken
// player. See the PR description for the full tradeoff writeup.
import { useCallback, useRef, useState } from 'react';
import { Play, Pause, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

type ClipState = 'idle' | 'checking' | 'playing' | 'paused' | 'unavailable' | 'error';

interface ClipPlayerProps {
  /** cos_zoom_recordings.id — which recording to stream from. */
  recordingId: string;
  /** cos_member_quotes.start_seconds / end_seconds — already verified by the
   *  alignment step in extract-zoom-quotes/index.ts; this component trusts
   *  them as given (never re-derives or guesses a range). */
  startSeconds: number;
  endSeconds: number;
  /** 'onDark' for the 1:1 hero card's dark gradient background, 'onLight'
   *  (default) for the white Meeting Detail recording cards. */
  variant?: 'onDark' | 'onLight';
  className?: string;
}

function buildProxyUrl(recordingId: string, accessToken: string): string {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const params = new URLSearchParams({ recording_id: recordingId, access_token: accessToken });
  return `${supabaseUrl}/functions/v1/zoom-media-proxy?${params.toString()}`;
}

export function ClipPlayer({ recordingId, startSeconds, endSeconds, variant = 'onLight', className }: ClipPlayerProps) {
  const [state, setState] = useState<ClipState>('idle');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const seekedRef = useRef(false);

  const duration = Math.max(0, endSeconds - startSeconds);
  const isOnDark = variant === 'onDark';

  const stopAndReset = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = startSeconds;
    }
    setState('paused');
  }, [startSeconds]);

  const onLoadedMetadata = useCallback(() => {
    const audio = audioRef.current;
    if (audio && !seekedRef.current) {
      audio.currentTime = startSeconds;
      seekedRef.current = true;
    }
  }, [startSeconds]);

  const onTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.currentTime >= endSeconds) {
      stopAndReset();
    }
  }, [endSeconds, stopAndReset]);

  const onEnded = useCallback(() => stopAndReset(), [stopAndReset]);

  // A native <audio> element only fires `error` for genuine playback
  // failures (unsupported format, network drop mid-stream, etc.) — the
  // upfront HEAD probe below is what actually distinguishes "clip is gone"
  // from "something else went wrong," so this stays a generic error.
  const onError = useCallback(() => setState('error'), []);

  const handleToggle = useCallback(async (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation(); // never let this bubble into a parent card's onClick
    if (state === 'checking') return;

    const audio = audioRef.current;

    if (state === 'playing') {
      audio?.pause();
      setState('paused');
      return;
    }

    if (state === 'paused' && audio?.src) {
      try {
        await audio.play();
        setState('playing');
      } catch {
        setState('error');
      }
      return;
    }

    // idle, error, or a retry from unavailable — (re)check availability with
    // a cheap HEAD request before loading the real stream, so a recording
    // whose Zoom retention window has passed shows a clear "no longer
    // available" state instead of a broken player.
    setState('checking');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setState('error');
        return;
      }
      const url = buildProxyUrl(recordingId, token);
      const head = await fetch(url, { method: 'HEAD' });
      if (!head.ok) {
        setState(head.status === 404 ? 'unavailable' : 'error');
        return;
      }
      if (!audio) {
        setState('error');
        return;
      }
      seekedRef.current = false;
      audio.src = url;
      await audio.play();
      setState('playing');
    } catch {
      setState('error');
    }
  }, [state, recordingId]);

  if (!(endSeconds > startSeconds)) return null;

  if (state === 'unavailable') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 text-xs',
          isOnDark ? 'text-white/50' : 'text-muted-foreground',
          className,
        )}
      >
        <AlertCircle className="h-3.5 w-3.5" />
        Clip no longer available
      </span>
    );
  }

  return (
    <div className={cn('inline-flex items-center gap-2', className)}>
      <audio
        ref={audioRef}
        preload="none"
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={onTimeUpdate}
        onEnded={onEnded}
        onError={onError}
      />
      <div
        role="button"
        tabIndex={0}
        aria-label={state === 'playing' ? 'Pause clip' : 'Play clip'}
        onClick={handleToggle}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleToggle(e);
          }
        }}
        className={cn(
          'inline-flex items-center justify-center h-7 w-7 rounded-full flex-shrink-0 cursor-pointer transition-colors',
          isOnDark ? 'bg-white/20 hover:bg-white/30 text-white' : 'bg-primary/10 hover:bg-primary/20 text-primary',
        )}
      >
        {state === 'checking' ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : state === 'playing' ? (
          <Pause className="h-3.5 w-3.5 fill-current" />
        ) : (
          <Play className="h-3.5 w-3.5 fill-current ml-0.5" />
        )}
      </div>
      <span className={cn('text-xs', isOnDark ? 'text-white/50' : 'text-muted-foreground')}>
        {state === 'error' ? "Couldn't play this clip — try again" : `${Math.round(duration)}s clip`}
      </span>
    </div>
  );
}
