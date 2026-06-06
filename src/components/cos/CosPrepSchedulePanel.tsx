import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, Save, Clock, Play, Plus, X, CheckCircle, AlertTriangle, XCircle, Video, MessageSquare } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface PrepSchedule {
  enabled: boolean;
  run_hour_utc: number;
  always_include: string[];
  max_others_after_exclude: number;
  sync_zoom_before: boolean;
  sync_slack_before: boolean;
  slack_channels: string[];
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_preps_generated: number | null;
}

const DEFAULT_SCHEDULE: PrepSchedule = {
  enabled: false,
  run_hour_utc: 11, // 4am PT
  always_include: [],
  max_others_after_exclude: 1,
  sync_zoom_before: true,
  sync_slack_before: true,
  slack_channels: [],
  last_run_at: null,
  last_run_status: null,
  last_run_preps_generated: null,
};

// Convert UTC hour to a readable local time label.
function utcHourToLocalLabel(utcHour: number): string {
  const d = new Date();
  d.setUTCHours(utcHour, 0, 0, 0);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function CosPrepSchedulePanel() {
  const { toast } = useToast();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [draft, setDraft] = useState<PrepSchedule>(DEFAULT_SCHEDULE);
  const [newIncludeName, setNewIncludeName] = useState('');
  const [newChannel, setNewChannel] = useState('');
  const [logs, setLogs] = useState<Array<{
    id: string;
    trigger_type: string;
    started_at: string;
    finished_at: string | null;
    status: string;
    meetings_found: number;
    meetings_qualified: number;
    preps_generated: number;
    preps_cached: number;
    zoom_synced: boolean;
    zoom_recordings: number | null;
    slack_synced: boolean;
    slack_messages: number | null;
    errors: Array<{ member_name?: string; error: string }>;
    summary: string | null;
  }>>([]);

  const loadLogs = useCallback(async (uid: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('cos_prep_batch_log')
      .select('*')
      .eq('user_id', uid)
      .order('started_at', { ascending: false })
      .limit(20);
    if (data) {
      setLogs(data.map((row: Record<string, unknown>) => ({
        ...row,
        errors: typeof row.errors === 'string' ? JSON.parse(row.errors as string) : (row.errors ?? []),
      })));
    }
  }, []);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from('cos_prep_schedule')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data) {
        setDraft({
          enabled: data.enabled ?? false,
          run_hour_utc: data.run_hour_utc ?? 11,
          always_include: data.always_include ?? [],
          max_others_after_exclude: data.max_others_after_exclude ?? 1,
          sync_zoom_before: data.sync_zoom_before ?? true,
          sync_slack_before: data.sync_slack_before ?? true,
          slack_channels: data.slack_channels ?? [],
          last_run_at: data.last_run_at ?? null,
          last_run_status: data.last_run_status ?? null,
          last_run_preps_generated: data.last_run_preps_generated ?? null,
        });
      }
      setLoading(false);
      loadLogs(user.id);
    }
    load();
  }, [loadLogs]);

  const save = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('cos_prep_schedule').upsert({
        user_id: userId,
        enabled: draft.enabled,
        run_hour_utc: draft.run_hour_utc,
        always_include: draft.always_include,
        max_others_after_exclude: draft.max_others_after_exclude,
        sync_zoom_before: draft.sync_zoom_before,
        sync_slack_before: draft.sync_slack_before,
        slack_channels: draft.slack_channels,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      if (error) throw error;
      toast({ title: 'Schedule saved' });
    } catch (err) {
      toast({ title: 'Save failed', description: String(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('daily-prep-batch', { body: {} });
      if (error) throw error;
      const totalPreps = (data as { total_preps_generated?: number })?.total_preps_generated ?? 0;
      toast({
        title: 'Batch prep complete',
        description: `${totalPreps} prep${totalPreps !== 1 ? 's' : ''} generated`,
      });
      // Reload to show updated last_run info.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: updated } = await (supabase as any)
        .from('cos_prep_schedule')
        .select('last_run_at, last_run_status, last_run_preps_generated')
        .eq('user_id', userId)
        .maybeSingle();
      if (updated) {
        setDraft(d => ({
          ...d,
          last_run_at: updated.last_run_at,
          last_run_status: updated.last_run_status,
          last_run_preps_generated: updated.last_run_preps_generated,
        }));
      }
      if (userId) loadLogs(userId);
    } catch (err) {
      toast({ title: 'Batch prep failed', description: String(err), variant: 'destructive' });
    } finally {
      setRunning(false);
    }
  };

  const addIncludeName = () => {
    const name = newIncludeName.trim();
    if (!name || draft.always_include.includes(name)) return;
    setDraft(d => ({ ...d, always_include: [...d.always_include, name] }));
    setNewIncludeName('');
  };

  const removeIncludeName = (name: string) => {
    setDraft(d => ({ ...d, always_include: d.always_include.filter(n => n !== name) }));
  };

  const addChannel = () => {
    const ch = newChannel.trim().replace(/^#/, '');
    if (!ch || draft.slack_channels.includes(ch)) return;
    setDraft(d => ({ ...d, slack_channels: [...d.slack_channels, ch] }));
    setNewChannel('');
  };

  const removeChannel = (ch: string) => {
    setDraft(d => ({ ...d, slack_channels: d.slack_channels.filter(c => c !== ch) }));
  };

  if (loading) return null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" /> Auto-generate schedule
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-3">
            <Switch
              checked={draft.enabled}
              onCheckedChange={v => setDraft(d => ({ ...d, enabled: v }))}
            />
            <div>
              <span className="text-sm font-medium">Enable daily auto-generation</span>
              <p className="text-[11px] text-muted-foreground">
                Automatically generate 1:1 prep briefs for today's qualifying meetings.
              </p>
            </div>
          </label>

          <div className="space-y-1">
            <label className="text-xs font-medium">Run at (local time)</label>
            <Select
              value={String(draft.run_hour_utc)}
              onValueChange={v => setDraft(d => ({ ...d, run_hour_utc: parseInt(v) }))}
            >
              <SelectTrigger className="w-40 h-9 text-sm">
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

          {draft.last_run_at && (
            <div className="text-xs text-muted-foreground border-t pt-3">
              Last run: {new Date(draft.last_run_at).toLocaleString()}
              {draft.last_run_status && ` · ${draft.last_run_status}`}
              {draft.last_run_preps_generated != null && ` · ${draft.last_run_preps_generated} prep(s)`}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Meeting inclusion rules</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium">Always include meetings with</label>
            <p className="text-[11px] text-muted-foreground">
              Meetings with these people always qualify, even if other attendees are present.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {draft.always_include.map(name => (
                <Badge key={name} variant="outline" className="bg-background">
                  <span className="text-xs">{name}</span>
                  <button
                    className="ml-1 rounded-full hover:bg-muted"
                    onClick={() => removeIncludeName(name)}
                  >
                    <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newIncludeName}
                onChange={e => setNewIncludeName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addIncludeName()}
                placeholder="e.g. Dan Pope"
                className="h-8 text-sm flex-1"
              />
              <Button size="sm" variant="outline" onClick={addIncludeName} className="h-8 gap-1">
                <Plus className="h-3 w-3" /> Add
              </Button>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium">Max other attendees (after removing above)</label>
            <Input
              type="number"
              min={0}
              max={5}
              value={draft.max_others_after_exclude}
              onChange={e =>
                setDraft(d => ({
                  ...d,
                  max_others_after_exclude: Math.max(0, Math.min(5, parseInt(e.target.value) || 0)),
                }))
              }
              className="h-9 text-sm w-24"
            />
            <p className="text-[11px] text-muted-foreground">
              1 = true 1:1s. Higher includes small group meetings. 0 = only "always include" people.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pre-sync integrations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-3">
            <Switch
              checked={draft.sync_zoom_before}
              onCheckedChange={v => setDraft(d => ({ ...d, sync_zoom_before: v }))}
            />
            <span className="text-sm">Sync Zoom recordings before generating</span>
          </label>

          <label className="flex items-center gap-3">
            <Switch
              checked={draft.sync_slack_before}
              onCheckedChange={v => setDraft(d => ({ ...d, sync_slack_before: v }))}
            />
            <span className="text-sm">Sync Slack messages before generating</span>
          </label>

          <div className="space-y-2">
            <label className="text-xs font-medium">Slack channels to include</label>
            <div className="flex flex-wrap gap-1.5">
              {draft.slack_channels.map(ch => (
                <Badge key={ch} variant="outline" className="bg-background">
                  <span className="text-xs">#{ch}</span>
                  <button
                    className="ml-1 rounded-full hover:bg-muted"
                    onClick={() => removeChannel(ch)}
                  >
                    <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newChannel}
                onChange={e => setNewChannel(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addChannel()}
                placeholder="e.g. pm-ux-weekly-sync"
                className="h-8 text-sm flex-1"
              />
              <Button size="sm" variant="outline" onClick={addChannel} className="h-8 gap-1">
                <Plus className="h-3 w-3" /> Add
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button onClick={save} disabled={saving} className="gap-1.5">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save schedule
        </Button>
        <Button variant="outline" onClick={runNow} disabled={running} className="gap-1.5">
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          Run now
        </Button>
      </div>

      {/* ── Run history ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Run history</CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs yet. Click "Run now" or wait for the scheduled run.</p>
          ) : (
            <div className="space-y-3">
              {logs.map(log => {
                const statusIcon = log.status === 'ok'
                  ? <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                  : log.status === 'partial'
                    ? <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                    : log.status === 'failed'
                      ? <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                      : <Loader2 className="h-4 w-4 text-muted-foreground animate-spin flex-shrink-0" />;

                const duration = log.finished_at
                  ? Math.round((new Date(log.finished_at).getTime() - new Date(log.started_at).getTime()) / 1000)
                  : null;

                return (
                  <div key={log.id} className="border rounded-lg p-3 space-y-2">
                    {/* Header row */}
                    <div className="flex items-center gap-2">
                      {statusIcon}
                      <span className="text-sm font-medium">
                        {new Date(log.started_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        {' '}
                        {new Date(log.started_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      </span>
                      <Badge variant="outline" className="text-[10px] h-5">
                        {log.trigger_type}
                      </Badge>
                      {duration != null && (
                        <span className="text-[11px] text-muted-foreground ml-auto">{duration}s</span>
                      )}
                    </div>

                    {/* Stats row */}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>{log.meetings_found} meeting{log.meetings_found !== 1 ? 's' : ''} found</span>
                      <span>{log.meetings_qualified} qualified</span>
                      <span className="text-foreground font-medium">{log.preps_generated} prep{log.preps_generated !== 1 ? 's' : ''} generated</span>
                      {log.preps_cached > 0 && <span>{log.preps_cached} cached</span>}
                    </div>

                    {/* Integration badges */}
                    {(log.zoom_synced || log.slack_synced) && (
                      <div className="flex gap-2">
                        {log.zoom_synced && (
                          <Badge variant="outline" className="text-[10px] h-5 gap-1">
                            <Video className="h-3 w-3" /> {log.zoom_recordings ?? 0} recordings
                          </Badge>
                        )}
                        {log.slack_synced && (
                          <Badge variant="outline" className="text-[10px] h-5 gap-1">
                            <MessageSquare className="h-3 w-3" /> {log.slack_messages ?? 0} messages
                          </Badge>
                        )}
                      </div>
                    )}

                    {/* Errors */}
                    {log.errors.length > 0 && (
                      <div className="bg-red-50 rounded p-2 space-y-1">
                        {log.errors.map((err, i) => (
                          <p key={i} className="text-xs text-red-700">
                            {err.member_name && <span className="font-medium">{err.member_name}: </span>}
                            {err.error}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
