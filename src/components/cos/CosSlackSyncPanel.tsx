import React, { useState, useEffect } from 'react';
import { Loader2, MessageSquare, Unlink, RefreshCw, Clock, Save, MailSearch } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

const SLACK_CLIENT_ID = import.meta.env.VITE_SLACK_CLIENT_ID ?? '';

// Bot scopes — installed workspace-wide. `commands` keeps the slash command
// registration alive on reinstall.
const SLACK_BOT_SCOPES = [
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
  'im:write',
].join(',');

// User scopes — grant the authorizing user's token (xoxp-) so we can read
// their personal DMs and channels without the bot needing to be invited.
const SLACK_USER_SCOPES = [
  'channels:history',
  'groups:history',
  'im:history',
  'im:read',
  'users:read',
  'users:read.email',
].join(',');

function utcHourToLocalLabel(utcHour: number): string {
  const d = new Date();
  d.setUTCHours(utcHour, 0, 0, 0);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
}

export default function CosSlackSyncPanel() {
  const { toast } = useToast();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState<{
    connected: boolean;
    slackTeamName: string | null;
    slackEmail: string | null;
    lastSyncAt: string | null;
    lastSyncStatus: string | null;
    autoSyncEnabled: boolean;
    autoSyncMorningHourUtc: number;
    autoSyncMiddayHourUtc: number;
  } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [scanningInbox, setScanningInbox] = useState(false);
  const [inboxTriageEnabled, setInboxTriageEnabled] = useState(true);
  const [savingInboxTriage, setSavingInboxTriage] = useState(false);
  const [savingAutoSync, setSavingAutoSync] = useState(false);

  const loadState = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) setUserId(user.id);

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
        autoSyncEnabled: data.auto_sync_enabled ?? true,
        autoSyncMorningHourUtc: data.auto_sync_morning_hour_utc ?? 11,
        autoSyncMiddayHourUtc: data.auto_sync_midday_hour_utc ?? 18,
      });
    } else {
      setConnection({
        connected: false, slackTeamName: null, slackEmail: null, lastSyncAt: null, lastSyncStatus: null,
        autoSyncEnabled: true, autoSyncMorningHourUtc: 11, autoSyncMiddayHourUtc: 18,
      });
    }

    // Load inbox triage preference (Slack-specific).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prefRes = await (supabase as any).from('sources_triage_preferences').select('slack_enabled').maybeSingle();
    setInboxTriageEnabled(prefRes.data?.slack_enabled ?? true);

    setLoading(false);
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
    const url = `https://slack.com/oauth/v2/authorize?client_id=${encodeURIComponent(SLACK_CLIENT_ID)}&scope=${encodeURIComponent(SLACK_BOT_SCOPES)}&user_scope=${encodeURIComponent(SLACK_USER_SCOPES)}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    window.location.href = url;
  };

  const disconnect = async () => {
    setDisconnecting(true);
    try {
      const { error } = await supabase.functions.invoke('disconnect-slack', { body: {} });
      if (error) throw error;
      toast({ title: 'Slack disconnected' });
      setConnection(prev => prev ? { ...prev, connected: false, slackTeamName: null, slackEmail: null, lastSyncAt: null, lastSyncStatus: null } : prev);
    } catch (err) {
      toast({ title: 'Disconnect failed', description: String(err), variant: 'destructive' });
    } finally {
      setDisconnecting(false);
    }
  };

  const syncNow = async () => {
    setSyncing(true);
    try {
      // Read configured channels from cos_prep_schedule (the source of truth set in Briefs & Schedule).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: scheduleData } = await (supabase as any)
        .from('cos_prep_schedule')
        .select('slack_channels')
        .maybeSingle();
      const channels: string[] = Array.isArray(scheduleData?.slack_channels) ? scheduleData.slack_channels : [];

      const { data, error } = await supabase.functions.invoke('slack-messages-sync', {
        body: channels.length ? { channels } : {},
      });
      if (error) throw error;
      const { synced = 0 } = (data ?? {}) as { synced?: number };
      toast({
        title: 'Slack synced',
        description: `${synced} messages synced`,
      });
      await loadState();
    } catch (err) {
      toast({ title: 'Sync failed', description: String(err), variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  const scanInboxNow = async () => {
    setScanningInbox(true);
    try {
      const { data, error } = await supabase.functions.invoke('extract-inbox-action-items');
      if (error) throw error;
      const { total_items_created = 0 } = (data ?? {}) as { total_items_created?: number };
      toast({
        title: 'Inbox scan complete',
        description: total_items_created > 0
          ? `${total_items_created} new item${total_items_created === 1 ? '' : 's'} found`
          : 'No new action items found',
      });
    } catch (err) {
      toast({ title: 'Scan failed', description: String(err), variant: 'destructive' });
    } finally {
      setScanningInbox(false);
    }
  };

  const toggleInboxTriage = async (enabled: boolean) => {
    setInboxTriageEnabled(enabled);
    setSavingInboxTriage(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('sources_triage_preferences')
        .upsert({ user_id: userId, slack_enabled: enabled, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (error) throw error;
    } catch (err) {
      setInboxTriageEnabled(!enabled);
      toast({ title: 'Failed to save preference', description: String(err), variant: 'destructive' });
    } finally {
      setSavingInboxTriage(false);
    }
  };

  const saveAutoSync = async () => {
    if (!userId || !connection) return;
    setSavingAutoSync(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('user_slack_credentials')
        .update({
          auto_sync_enabled: connection.autoSyncEnabled,
          auto_sync_morning_hour_utc: connection.autoSyncMorningHourUtc,
          auto_sync_midday_hour_utc: connection.autoSyncMiddayHourUtc,
        })
        .eq('user_id', userId);
      if (error) throw error;
      toast({ title: 'Sync schedule saved' });
    } catch (err) {
      toast({ title: 'Save failed', description: String(err), variant: 'destructive' });
    } finally {
      setSavingAutoSync(false);
    }
  };

  if (loading) return null;

  if (connecting) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Connecting Slack…
        </CardContent>
      </Card>
    );
  }

  const showSchedule = connection?.connected && connection.autoSyncEnabled;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-5 space-y-5">

          {/* ── Connection status ── */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              {connection?.connected ? (
                <>
                  <div className="flex items-center gap-2">
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
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Connect Slack to include recent DMs and channel messages in your 1:1 prep, and share prep notes via Slack DM.
                </p>
              )}
            </div>
            {connection?.connected ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={disconnect}
                disabled={disconnecting}
                className="gap-1.5 text-destructive hover:text-destructive shrink-0"
              >
                {disconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5" />}
                Disconnect
              </Button>
            ) : (
              <Button size="sm" onClick={connect} className="gap-1.5 shrink-0">
                <MessageSquare className="h-3.5 w-3.5" />
                Connect Slack
              </Button>
            )}
          </div>

          {connection?.connected && (
            <>
              <div className="border-t border-border" />

              {/* ── Automatic sync toggles ── */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  Automatic sync
                </div>

                <label className="flex items-center justify-between gap-3 py-1">
                  <div>
                    <span className="text-sm">Sync Slack messages twice a day</span>
                    <p className="text-[11px] text-muted-foreground">New DMs and channel messages refresh automatically.</p>
                  </div>
                  <Switch
                    checked={connection.autoSyncEnabled}
                    onCheckedChange={v => setConnection(c => c ? { ...c, autoSyncEnabled: v } : c)}
                  />
                </label>

                <label className="flex items-center justify-between gap-3 py-1">
                  <div>
                    <span className="text-sm">Surface actionable Slack messages in my inbox</span>
                    <p className="text-[11px] text-muted-foreground">Questions and requests in your DMs and channels appear as cards — scanned every 6 hours.</p>
                  </div>
                  <Switch
                    checked={inboxTriageEnabled}
                    disabled={savingInboxTriage}
                    onCheckedChange={toggleInboxTriage}
                  />
                </label>
              </div>

              {/* ── Schedule pickers (visible when auto-sync is on) ── */}
              {showSchedule && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-medium">Morning sync</label>
                      <Select
                        value={String(connection.autoSyncMorningHourUtc)}
                        onValueChange={v => setConnection(c => c ? { ...c, autoSyncMorningHourUtc: parseInt(v) } : c)}
                      >
                        <SelectTrigger className="w-full h-9 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 24 }, (_, i) => (
                            <SelectItem key={i} value={String(i)}>
                              {utcHourToLocalLabel(i)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium">Evening sync</label>
                      <Select
                        value={String(connection.autoSyncMiddayHourUtc)}
                        onValueChange={v => setConnection(c => c ? { ...c, autoSyncMiddayHourUtc: parseInt(v) } : c)}
                      >
                        <SelectTrigger className="w-full h-9 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 24 }, (_, i) => (
                            <SelectItem key={i} value={String(i)}>
                              {utcHourToLocalLabel(i)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button size="sm" onClick={saveAutoSync} disabled={savingAutoSync} className="gap-1.5">
                    {savingAutoSync ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Save schedule
                  </Button>
                </div>
              )}

              <div className="border-t border-border" />

              {/* ── Manual sync ── */}
              <div className="space-y-2">
                <p className="text-sm font-medium">Sync now</p>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" onClick={syncNow} disabled={syncing} className="gap-1.5">
                    {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Sync Slack
                  </Button>
                  <Button size="sm" variant="outline" onClick={scanInboxNow} disabled={scanningInbox} className="gap-1.5">
                    {scanningInbox ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MailSearch className="h-3.5 w-3.5" />}
                    Scan inbox
                  </Button>
                </div>
              </div>
            </>
          )}

        </CardContent>
      </Card>
    </div>
  );
}
