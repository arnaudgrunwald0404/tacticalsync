import React, { useState, useEffect, useRef } from 'react';
import { Loader2, MessageSquare, Unlink, RefreshCw, X, Hash } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

const SLACK_CLIENT_ID = import.meta.env.VITE_SLACK_CLIENT_ID ?? '';

// Scopes needed for reading DMs/channels, sending messages, and the
// /add-to-my-lists slash command. `commands` must be included or a (re)install
// via this flow drops the slash command registration for the workspace.
const SLACK_SCOPES = [
  'chat:write',
  'commands',
  'users:read',
  'users:read.email',
  'channels:read',
  'channels:history',
  'groups:read',
  'groups:history',
  'im:read',
  'im:history',
].join(',');

export default function CosSlackSyncPanel() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState<{
    connected: boolean;
    slackTeamName: string | null;
    slackEmail: string | null;
    lastSyncAt: string | null;
    lastSyncStatus: string | null;
    syncChannels: string[];
  } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Extra channel input
  const [channelInput, setChannelInput] = useState('');
  const [savingChannels, setSavingChannels] = useState(false);
  const channelInputRef = useRef<HTMLInputElement>(null);

  const loadState = async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('user_slack_credentials_public')
      .select('*')
      .maybeSingle();

    if (data) {
      setConnection({
        connected: Boolean(data.connected),
        slackTeamName: data.slack_team_name ?? null,
        slackEmail: data.slack_email ?? null,
        lastSyncAt: data.last_sync_at ?? null,
        lastSyncStatus: data.last_sync_status ?? null,
        syncChannels: Array.isArray(data.sync_channels) ? data.sync_channels : [],
      });
    } else {
      setConnection({ connected: false, slackTeamName: null, slackEmail: null, lastSyncAt: null, lastSyncStatus: null, syncChannels: [] });
    }
    setLoading(false);
  };

  const saveChannels = async (channels: string[]) => {
    setSavingChannels(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('user_slack_credentials')
        .update({ sync_channels: channels })
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id);
      if (error) throw error;
      setConnection(prev => prev ? { ...prev, syncChannels: channels } : prev);
    } catch (err) {
      toast({ title: 'Could not save channels', description: String(err), variant: 'destructive' });
    } finally {
      setSavingChannels(false);
    }
  };

  const addChannel = async () => {
    const raw = channelInput.trim().replace(/^#/, '').toLowerCase();
    if (!raw || !connection) return;
    if (connection.syncChannels.includes(raw)) { setChannelInput(''); return; }
    const next = [...connection.syncChannels, raw];
    setChannelInput('');
    await saveChannels(next);
  };

  const removeChannel = async (ch: string) => {
    if (!connection) return;
    await saveChannels(connection.syncChannels.filter(c => c !== ch));
  };

  useEffect(() => {
    loadState();

    // Handle OAuth callback: Slack redirects back with ?code=...
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const slackCallback = params.get('slack');
    if (code && slackCallback === 'connected') {
      window.history.replaceState(null, '', `${window.location.pathname}?section=slack-sync`);
      setConnecting(true);
      (async () => {
        try {
          const tokenRes = await supabase.functions.invoke('exchange-slack-token', {
            body: { code },
          });
          if (tokenRes.error) throw tokenRes.error;

          const syncRes = await supabase.functions.invoke('slack-messages-sync', { body: {} });
          if (syncRes.error) throw syncRes.error;

          const { synced = 0 } = (syncRes.data ?? {}) as { synced?: number };
          toast({
            title: 'Slack connected',
            description: `${synced} messages synced`,
          });
          await loadState();
        } catch (err) {
          toast({ title: 'Slack connection failed', description: String(err), variant: 'destructive' });
        } finally {
          setConnecting(false);
        }
      })();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = () => {
    if (!SLACK_CLIENT_ID) {
      toast({ title: 'Slack not configured', description: 'VITE_SLACK_CLIENT_ID is not set.', variant: 'destructive' });
      return;
    }
    const redirectUri = `${window.location.origin}/settings?section=slack-sync&slack=connected`;
    const url = `https://slack.com/oauth/v2/authorize?client_id=${encodeURIComponent(SLACK_CLIENT_ID)}&scope=${encodeURIComponent(SLACK_SCOPES)}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    window.location.href = url;
  };

  const disconnect = async () => {
    setDisconnecting(true);
    try {
      const { error } = await supabase.functions.invoke('disconnect-slack', { body: {} });
      if (error) throw error;
      toast({ title: 'Slack disconnected' });
      setConnection({ connected: false, slackTeamName: null, slackEmail: null, lastSyncAt: null, lastSyncStatus: null });
    } catch (err) {
      toast({ title: 'Disconnect failed', description: String(err), variant: 'destructive' });
    } finally {
      setDisconnecting(false);
    }
  };

  const syncNow = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('slack-messages-sync', {
        body: connection?.syncChannels.length ? { channels: connection.syncChannels } : {},
      });
      if (error) throw error;
      const { synced = 0 } = (data ?? {}) as { synced?: number };
      toast({
        title: 'Slack sync complete',
        description: `${synced} messages synced`,
      });
      await loadState();
    } catch (err) {
      toast({ title: 'Sync failed', description: String(err), variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  if (loading) return null;

  if (connecting) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4" /> Connection
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Connecting Slack…
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="h-4 w-4" /> Connection
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {connection?.connected ? (
          <>
            <div className="flex items-center gap-3">
              <Badge className="bg-emerald-50 text-emerald-700 border-0">Connected</Badge>
              <span className="text-sm text-muted-foreground">
                {connection.slackTeamName ?? 'Slack'}
                {connection.slackEmail && ` · ${connection.slackEmail}`}
              </span>
            </div>
            {connection.lastSyncAt && (
              <p className="text-xs text-muted-foreground">
                Last synced {new Date(connection.lastSyncAt).toLocaleString()}
                {connection.lastSyncStatus && connection.lastSyncStatus !== 'ok' && ` · ${connection.lastSyncStatus}`}
              </p>
            )}

            {/* Extra channels */}
            <div className="pt-1">
              <p className="text-xs font-medium text-foreground mb-1.5">Extra channels to sync</p>
              <p className="text-xs text-muted-foreground mb-2.5">
                DMs are always synced. Add public channels here to pull in their messages too — e.g. <span className="font-mono">#success</span> for recognitions.
              </p>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {connection.syncChannels.map(ch => (
                  <span key={ch} className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-muted text-foreground">
                    <Hash className="h-3 w-3 text-muted-foreground" />{ch}
                    <button
                      onClick={() => removeChannel(ch)}
                      disabled={savingChannels}
                      className="ml-0.5 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
                      aria-label={`Remove #${ch}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                {connection.syncChannels.length === 0 && (
                  <span className="text-xs text-muted-foreground italic">No extra channels configured</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 flex-1 min-w-0 border border-input rounded-md px-2.5 py-1.5 bg-background focus-within:ring-1 focus-within:ring-ring">
                  <Hash className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <input
                    ref={channelInputRef}
                    value={channelInput}
                    onChange={e => setChannelInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addChannel(); }}
                    placeholder="channel-name"
                    className="flex-1 min-w-0 bg-transparent border-0 outline-none text-xs"
                  />
                </div>
                <Button size="sm" variant="secondary" onClick={addChannel} disabled={!channelInput.trim() || savingChannels} className="shrink-0">
                  {savingChannels ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Add'}
                </Button>
              </div>
            </div>

            <div className="flex gap-2 pt-1 flex-wrap">
              <Button size="sm" variant="outline" onClick={syncNow} disabled={syncing} className="gap-1.5">
                {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Sync now
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
              Connect Slack to include recent DMs and channel messages in your 1:1 prep, and share prep notes via Slack DM.
            </p>
            <Button size="sm" onClick={connect} className="gap-1.5">
              <MessageSquare className="h-3.5 w-3.5" />
              Connect Slack
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
