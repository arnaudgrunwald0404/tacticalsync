import React, { useState, useEffect } from 'react';
import { Loader2, Save, Calendar, Unlink, RefreshCw, Clock, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import GroupMeetingsManager from '@/components/cos/GroupMeetingsManager';
import {
  CalendarSyncRules,
  RelationshipType,
  DEFAULT_SYNC_RULES,
} from '@/lib/calendar/matchEventToMember';

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
    autoSyncMorningHourUtc: number;
    autoSyncMiddayHourUtc: number;
  } | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [savingAutoSync, setSavingAutoSync] = useState(false);
  const [draftRules, setDraftRules] = useState<CalendarSyncRules>(DEFAULT_SYNC_RULES);
  const [savingRules, setSavingRules] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const [credsRes, settingsRes] = await Promise.all([
        db.from('user_calendar_credentials_public').select('*').maybeSingle(),
        db.from('cos_settings').select('calendar_sync_rules').eq('user_id', user.id).maybeSingle(),
      ]);
      if (credsRes.data) {
        setConnection({
          connected: Boolean(credsRes.data.connected),
          scope: credsRes.data.scope ?? null,
          lastSyncAt: credsRes.data.last_sync_at ?? null,
          lastSyncStatus: credsRes.data.last_sync_status ?? null,
          autoSyncEnabled: credsRes.data.auto_sync_enabled ?? true,
          autoSyncMorningHourUtc: credsRes.data.auto_sync_morning_hour_utc ?? 11,
          autoSyncMiddayHourUtc: credsRes.data.auto_sync_midday_hour_utc ?? 18,
        });
      } else {
        setConnection({
          connected: false, scope: null, lastSyncAt: null, lastSyncStatus: null,
          autoSyncEnabled: true, autoSyncMorningHourUtc: 11, autoSyncMiddayHourUtc: 18,
        });
      }
      if (settingsRes.data?.calendar_sync_rules) {
        setDraftRules({
          ...DEFAULT_SYNC_RULES,
          ...(settingsRes.data.calendar_sync_rules as Partial<CalendarSyncRules>),
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
        scopes: 'openid email profile https://www.googleapis.com/auth/calendar.events.readonly',
        queryParams: { access_type: 'offline', prompt: 'consent' },
        redirectTo: `${origin}/chief-of-staff?calendar=connected`,
      },
    });
    if (error) toast({ title: 'OAuth failed', description: error.message, variant: 'destructive' });
  };

  const disconnect = async () => {
    setDisconnecting(true);
    try {
      const { error } = await supabase.functions.invoke('disconnect-google-calendar', { body: {} });
      if (error) throw error;
      toast({ title: 'Calendar disconnected' });
      setConnection({ connected: false, scope: null, lastSyncAt: null, lastSyncStatus: null });
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
      toast({ title: 'Sync complete', description: `${created} added · ${updated} updated · ${cancelled} removed` });
    } catch (err) {
      toast({ title: 'Sync failed', description: String(err), variant: 'destructive' });
    } finally {
      setSyncing(false);
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
      toast({ title: 'Auto-sync schedule saved' });
    } catch (err) {
      toast({ title: 'Save failed', description: String(err), variant: 'destructive' });
    } finally {
      setSavingAutoSync(false);
    }
  };

  const saveRules = async () => {
    if (!userId) return;
    setSavingRules(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('cos_settings').upsert(
        { user_id: userId, calendar_sync_rules: draftRules, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      );
      if (error) throw error;
      toast({ title: 'Calendar sync rules saved' });
    } catch (err) {
      toast({ title: 'Save failed', description: String(err), variant: 'destructive' });
    } finally {
      setSavingRules(false);
    }
  };

  if (loading) return null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="h-4 w-4" /> Connection
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {connection?.connected ? (
            <>
              <div className="flex items-center gap-3">
                <Badge className="bg-emerald-50 text-emerald-700 border-0">Connected</Badge>
                <span className="text-sm text-muted-foreground">Google Calendar</span>
              </div>
              {connection.lastSyncAt && (
                <p className="text-xs text-muted-foreground">
                  Last synced {new Date(connection.lastSyncAt).toLocaleString()}
                  {connection.lastSyncStatus && connection.lastSyncStatus !== 'ok' && ` · ${connection.lastSyncStatus}`}
                </p>
              )}
              <div className="flex gap-2 pt-2">
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
                Connect Google Calendar to sync upcoming 1:1s as placeholders in the Chief of Staff tab.
              </p>
              <Button size="sm" onClick={connect} className="gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                Connect Google Calendar
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {connection?.connected && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4" /> Auto-sync schedule
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex items-center gap-3">
              <Switch
                checked={connection.autoSyncEnabled}
                onCheckedChange={v => setConnection(c => c ? { ...c, autoSyncEnabled: v } : c)}
              />
              <div>
                <span className="text-sm font-medium">Sync automatically twice a day</span>
                <p className="text-[11px] text-muted-foreground">
                  New meetings will appear as cards without needing to sync manually.
                </p>
              </div>
            </label>

            {connection.autoSyncEnabled && (
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
                  <label className="text-xs font-medium">Midday sync</label>
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
            )}

            <Button size="sm" onClick={saveAutoSync} disabled={savingAutoSync} className="gap-1.5">
              {savingAutoSync ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save schedule
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Inclusion rules</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-[11px] text-muted-foreground">
            True 1:1s (you + one other person) are tracked automatically. Meetings with three or more
            people are listed under “Recurring group meetings” below for you to include individually.
          </p>

          <div className="space-y-2">
            <p className="text-xs font-medium">Include people I track as…</p>
            {(Object.entries({
              direct_report: 'Direct reports',
              boss:          'My boss',
              peer:          'Peers',
              skip_level:    'My org (skip-levels)',
              stakeholder:   'Other stakeholders',
              external:      'Externals',
            }) as Array<[RelationshipType, string]>).map(([rt, label]) => (
              <label key={rt} className="flex items-center gap-2 text-sm">
                <Switch
                  checked={draftRules.include_relationship_types.includes(rt)}
                  onCheckedChange={c =>
                    setDraftRules(r => ({
                      ...r,
                      include_relationship_types: c
                        ? Array.from(new Set([...r.include_relationship_types, rt])) as RelationshipType[]
                        : r.include_relationship_types.filter(x => x !== rt),
                    }))
                  }
                />
                <span>{label}</span>
              </label>
            ))}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium">Title must match (regex, optional)</label>
            <Input
              value={draftRules.include_titles_regex ?? ''}
              onChange={e =>
                setDraftRules(r => ({ ...r, include_titles_regex: e.target.value || null }))
              }
              placeholder="e.g. 1:1|sync|catch.?up"
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Title must NOT match (regex, optional)</label>
            <Input
              value={draftRules.exclude_titles_regex ?? ''}
              onChange={e =>
                setDraftRules(r => ({ ...r, exclude_titles_regex: e.target.value || null }))
              }
              placeholder="e.g. interview|standup"
              className="h-9 text-sm"
            />
          </div>

          <div className="pt-2">
            <Button size="sm" onClick={saveRules} disabled={savingRules} className="gap-1.5">
              {savingRules ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save rules
            </Button>
          </div>
        </CardContent>
      </Card>

      {connection?.connected && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4" /> Recurring group meetings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-[11px] text-muted-foreground">
              Meetings with three or more people, grouped by their recurring title. Toggle on the ones
              you want briefs for — the title anchors the subject and the relevant Slack/Zoom context.
            </p>
            <GroupMeetingsManager />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
