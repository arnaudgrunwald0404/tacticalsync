import React, { useState, useEffect } from 'react';
import { Loader2, Video, Unlink, RefreshCw, Quote } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

const ZOOM_CLIENT_ID = import.meta.env.VITE_ZOOM_CLIENT_ID ?? '';

export default function CosZoomSyncPanel() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState<{
    connected: boolean;
    zoomEmail: string | null;
    lastSyncAt: string | null;
    lastSyncStatus: string | null;
  } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [extracting, setExtracting] = useState(false);

  const loadState = async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('user_zoom_credentials_public')
      .select('*')
      .maybeSingle();

    if (data) {
      setConnection({
        connected: Boolean(data.connected),
        zoomEmail: data.zoom_email ?? null,
        lastSyncAt: data.last_sync_at ?? null,
        lastSyncStatus: data.last_sync_status ?? null,
      });
    } else {
      setConnection({ connected: false, zoomEmail: null, lastSyncAt: null, lastSyncStatus: null });
    }
    setLoading(false);
  };

  useEffect(() => {
    loadState();

    // Handle OAuth callback: Zoom redirects back with ?code=...
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const zoomState = params.get('state');
    if (code && zoomState === 'zoom_connected') {
      window.history.replaceState(null, '', `${window.location.pathname}?section=zoom-sync`);
      setConnecting(true);
      (async () => {
        try {
          const tokenRes = await supabase.functions.invoke('exchange-zoom-token', {
            body: { code },
          });
          if (tokenRes.error) throw tokenRes.error;

          const syncRes = await supabase.functions.invoke('zoom-recordings-sync', { body: {} });
          if (syncRes.error) throw syncRes.error;

          const { synced = 0, transcripts_fetched = 0 } = (syncRes.data ?? {}) as {
            synced?: number;
            transcripts_fetched?: number;
          };
          toast({
            title: 'Zoom connected',
            description: `${synced} recordings synced · ${transcripts_fetched} transcripts fetched`,
          });
          await loadState();
        } catch (err) {
          toast({ title: 'Zoom connection failed', description: String(err), variant: 'destructive' });
        } finally {
          setConnecting(false);
        }
      })();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = () => {
    if (!ZOOM_CLIENT_ID) {
      toast({ title: 'Zoom not configured', description: 'VITE_ZOOM_CLIENT_ID is not set.', variant: 'destructive' });
      return;
    }
    const redirectUri = `${window.location.origin}/settings`;
    const scopes = 'user:read:user meeting:read:list_meetings meeting:read:meeting cloud_recording:read:list_user_recordings cloud_recording:read:list_recording_files meeting:read:summary meeting:read:list_past_instances meeting:read:meeting_transcript';
    const url = `https://zoom.us/oauth/authorize?response_type=code&client_id=${encodeURIComponent(ZOOM_CLIENT_ID)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&state=zoom_connected`;
    window.location.href = url;
  };

  const disconnect = async () => {
    setDisconnecting(true);
    try {
      const { error } = await supabase.functions.invoke('disconnect-zoom', { body: {} });
      if (error) throw error;
      toast({ title: 'Zoom disconnected' });
      setConnection({ connected: false, zoomEmail: null, lastSyncAt: null, lastSyncStatus: null });
    } catch (err) {
      toast({ title: 'Disconnect failed', description: String(err), variant: 'destructive' });
    } finally {
      setDisconnecting(false);
    }
  };

  const syncNow = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('zoom-recordings-sync', { body: {} });
      if (error) throw error;
      const { synced = 0, transcripts_fetched = 0 } = (data ?? {}) as {
        synced?: number;
        transcripts_fetched?: number;
      };
      toast({
        title: 'Zoom sync complete',
        description: `${synced} recordings synced · ${transcripts_fetched} transcripts fetched`,
      });
      await loadState();
    } catch (err) {
      toast({ title: 'Sync failed', description: String(err), variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  const extractQuotes = async () => {
    setExtracting(true);
    try {
      const { data, error } = await supabase.functions.invoke('extract-zoom-quotes', { body: {} });
      if (error) throw error;
      const { processed = 0, quotes_added = 0 } = (data ?? {}) as {
        processed?: number;
        quotes_added?: number;
      };

      // Mine the same transcripts for action-item suggestions ("Suggested from your 1:1s").
      let suggestionsAdded = 0;
      try {
        const { data: sugData } = await supabase.functions.invoke('generate-meeting-suggestions', { body: {} });
        suggestionsAdded = ((sugData ?? {}) as { suggestions_added?: number }).suggestions_added ?? 0;
      } catch {
        /* non-fatal — quotes still succeeded */
      }

      toast({
        title: 'Transcript processing complete',
        description: `${processed} transcript${processed !== 1 ? 's' : ''} processed · ${quotes_added} quote${quotes_added !== 1 ? 's' : ''} · ${suggestionsAdded} suggestion${suggestionsAdded !== 1 ? 's' : ''} added`,
      });
    } catch (err) {
      toast({ title: 'Quote extraction failed', description: String(err), variant: 'destructive' });
    } finally {
      setExtracting(false);
    }
  };

  if (loading) return null;

  if (connecting) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Video className="h-4 w-4" /> Connection
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Connecting Zoom…
        </CardContent>
      </Card>
    );
  }

  const needsReauth = connection?.lastSyncStatus === 'error: reauth_required';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Video className="h-4 w-4" /> Connection
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {connection?.connected && !needsReauth ? (
          <>
            <div className="flex items-center gap-3">
              <Badge className="bg-emerald-50 text-emerald-700 border-0">Connected</Badge>
              {connection.zoomEmail && (
                <span className="text-sm text-muted-foreground">{connection.zoomEmail}</span>
              )}
            </div>
            {connection.lastSyncAt && (
              <p className="text-xs text-muted-foreground">
                Last synced {new Date(connection.lastSyncAt).toLocaleString()}
                {connection.lastSyncStatus && connection.lastSyncStatus !== 'ok' && ` · ${connection.lastSyncStatus}`}
              </p>
            )}
            <div className="flex gap-2 pt-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={syncNow} disabled={syncing} className="gap-1.5">
                {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Sync now
              </Button>
              <Button size="sm" variant="outline" onClick={extractQuotes} disabled={extracting || syncing} className="gap-1.5">
                {extracting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Quote className="h-3.5 w-3.5" />}
                Extract quotes
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={disconnect}
                disabled={disconnecting}
                className="gap-1.5 text-destructive hover:text-destructive"
              >
                {disconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5" />}
                Disconnect
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {needsReauth
                ? 'Your Zoom session has expired. Please reconnect to continue syncing recordings and transcripts.'
                : 'Connect Zoom to include recent meeting recordings and transcripts in your 1:1 prep.'}
            </p>
            <Button size="sm" onClick={connect} className="gap-1.5">
              <Video className="h-3.5 w-3.5" />
              {needsReauth ? 'Reconnect Zoom' : 'Connect Zoom'}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
