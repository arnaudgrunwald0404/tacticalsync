import React, { useState, useEffect } from 'react';
import { Loader2, Save, Calendar, Unlink, RefreshCw, Clock, Mail } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

function utcHourToLocalLabel(utcHour: number): string {
  const d = new Date();
  d.setUTCHours(utcHour, 0, 0, 0);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function CosCalendarSyncPanel() {
  const { toast } = useToast();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState<{
    connected: boolean;
    scope: string | null;
    lastSyncAt: string | null;
    lastSyncStatus: string | null;
    autoSyncEnabled: boolean;
    autoSyncEmailEnabled: boolean;
    autoSyncMorningHourUtc: number;
    autoSyncMiddayHourUtc: number;
  } | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncingGmail, setSyncingGmail] = useState(false);
  const [savingAutoSync, setSavingAutoSync] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const credsRes = await db.from('user_calendar_credentials_public').select('*').maybeSingle();
      if (credsRes.data) {
        setConnection({
          connected: Boolean(credsRes.data.connected),
          scope: credsRes.data.scope ?? null,
          lastSyncAt: credsRes.data.last_sync_at ?? null,
          lastSyncStatus: credsRes.data.last_sync_status ?? null,
          autoSyncEnabled: credsRes.data.auto_sync_enabled ?? true,
          autoSyncEmailEnabled: credsRes.data.auto_sync_email_enabled ?? true,
          autoSyncMorningHourUtc: credsRes.data.auto_sync_morning_hour_utc ?? 11,
          autoSyncMiddayHourUtc: credsRes.data.auto_sync_midday_hour_utc ?? 18,
        });
      } else {
        setConnection({
          connected: false, scope: null, lastSyncAt: null, lastSyncStatus: null,
          autoSyncEnabled: true, autoSyncEmailEnabled: true,
          autoSyncMorningHourUtc: 11, autoSyncMiddayHourUtc: 18,
        });
      }
      setLoading(false);
    }
    load();
  }, []);

  const connect = async () => {
    const origin = window.location.origin;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        scopes: 'openid email profile https://www.googleapis.com/auth/calendar.events.readonly https://www.googleapis.com/auth/gmail.readonly',
        queryParams: { access_type: 'offline', prompt: 'consent' },
        redirectTo: `${origin}/settings?section=calendar-sync&calendar=connected`,
      },
    });
    if (error) toast({ title: 'OAuth failed', description: error.message, variant: 'destructive' });
  };

  const didHandleCallbackRef = React.useRef(false);
  useEffect(() => {
    if (didHandleCallbackRef.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('calendar') !== 'connected') return;
    didHandleCallbackRef.current = true;
    window.history.replaceState({}, '', '/settings?section=calendar-sync');
    void (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const s = session as unknown as { provider_token?: string; provider_refresh_token?: string };
        if (s?.provider_refresh_token) {
          const CALENDAR_SCOPES = 'openid email profile https://www.googleapis.com/auth/calendar.events.readonly https://www.googleapis.com/auth/gmail.readonly';
          await supabase.functions.invoke('save-google-calendar-tokens', {
            body: {
              access_token: s.provider_token ?? '',
              refresh_token: s.provider_refresh_token,
              expires_in: 3600,
              scope: CALENDAR_SCOPES,
            },
          });
        }
        const { error } = await supabase.functions.invoke('google-calendar-sync', { body: { days: 7 } });
        if (error) throw error;
        toast({ title: 'Google Calendar connected', description: 'Your meetings are syncing.' });
        setConnection(prev => prev ? { ...prev, connected: true } : prev);
      } catch (err) {
        toast({ title: 'Calendar sync failed', description: String(err), variant: 'destructive' });
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const disconnect = async () => {
    setDisconnecting(true);
    try {
      const { error } = await supabase.functions.invoke('disconnect-google-calendar', { body: {} });
      if (error) throw error;
      toast({ title: 'Calendar disconnected' });
      setConnection(prev => prev ? { ...prev, connected: false, scope: null, lastSyncAt: null, lastSyncStatus: null } : prev);
    } catch (err) {
      toast({ title: 'Disconnect failed', description: String(err), variant: 'destructive' });
    } finally {
      setDisconnecting(false);
    }
  };

  const syncNow = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('google-calendar-sync', { body: {} });
      if (error) throw error;
      const { created = 0, updated = 0, cancelled = 0 } = (data ?? {}) as {
        created?: number;
        updated?: number;
        cancelled?: number;
      };
      toast({ title: 'Calendar synced', description: `${created} added · ${updated} updated · ${cancelled} removed` });
    } catch (err) {
      toast({ title: 'Sync failed', description: String(err), variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  const syncGmailNow = async () => {
    setSyncingGmail(true);
    try {
      const { data, error } = await supabase.functions.invoke('gmail-meeting-assets-sync', { body: {} });
      if (error) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const errBody = await (error as any)?.context?.json?.().catch(() => null);
        if (errBody?.error === 'missing_scope') {
          toast({
            title: 'Reconnect needed',
            description: 'Disconnect and reconnect Google Calendar to grant Gmail access for this sync.',
            variant: 'destructive',
          });
          return;
        }
        throw error;
      }
      const { processed = 0, transcripts_fetched = 0 } = (data ?? {}) as {
        processed?: number;
        transcripts_fetched?: number;
      };
      toast({
        title: 'Emails synced',
        description: `${processed} meeting email${processed === 1 ? '' : 's'} found · ${transcripts_fetched} new summar${transcripts_fetched === 1 ? 'y' : 'ies'} added`,
      });
    } catch (err) {
      toast({ title: 'Sync failed', description: String(err), variant: 'destructive' });
    } finally {
      setSyncingGmail(false);
    }
  };

  const saveAutoSync = async () => {
    if (!userId || !connection) return;
    setSavingAutoSync(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('user_calendar_credentials')
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

  const showSchedule = connection?.connected && (connection.autoSyncEnabled || connection.autoSyncEmailEnabled);

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
                    <span className="text-sm text-muted-foreground">Google Calendar &amp; Gmail</span>
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
                  Sign in with Google to connect Calendar and Gmail — one authorization, both integrations.
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
                <Calendar className="h-3.5 w-3.5" />
                Sign in with Google
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
                    <span className="text-sm">Sync calendar twice a day</span>
                    <p className="text-[11px] text-muted-foreground">New meetings appear as cards automatically.</p>
                  </div>
                  <Switch
                    checked={connection.autoSyncEnabled}
                    onCheckedChange={v => setConnection(c => c ? { ...c, autoSyncEnabled: v } : c)}
                  />
                </label>

                <label className="flex items-center justify-between gap-3 py-1">
                  <div>
                    <span className="text-sm">Sync meeting emails twice a day</span>
                    <p className="text-[11px] text-muted-foreground">Email threads with teammates surface as context before each meeting.</p>
                  </div>
                  <Switch
                    checked={connection.autoSyncEmailEnabled}
                    onCheckedChange={v => setConnection(c => c ? { ...c, autoSyncEmailEnabled: v } : c)}
                  />
                </label>
              </div>

              {/* ── Schedule pickers (visible when either auto-sync is on) ── */}
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
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={syncNow} disabled={syncing} className="gap-1.5">
                    {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Sync calendar
                  </Button>
                  <Button size="sm" variant="outline" onClick={syncGmailNow} disabled={syncingGmail} className="gap-1.5">
                    {syncingGmail ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                    Sync emails
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
