import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, Save, Clock, Play, Plus, X, CheckCircle, AlertTriangle, XCircle, Video, MessageSquare, Brain, CalendarClock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import {
  usePrepScheduleConfig,
  formatHourLabel,
  getBrowserTimezone,
  isValidTimezone,
  type PrepScheduleConfig,
} from '@/hooks/usePrepScheduleConfig';

const DCI_SOURCES = [
  { id: 'calendar',    label: 'Calendar' },
  { id: 'zoom',        label: 'Zoom calls' },
  { id: 'slack',       label: 'Slack' },
  { id: 'email',       label: 'Email' },
  { id: 'my_lists',    label: 'My Lists' },
  { id: 'rcdo',        label: 'Strategy (RCDO)' },
  { id: 'commitments', label: 'Commitments' },
];

const COMMON_TIMEZONES = [
  'America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York',
  'America/Sao_Paulo', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
  'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney', 'UTC',
];

interface BatchLog {
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
}

type Patch = (patch: Partial<PrepScheduleConfig>) => void;

// ── Shared "last run" line ───────────────────────────────────────────────────

function LastRunLine({ at, status, detail }: { at: string | null; status: string | null; detail?: string }) {
  if (!at) {
    return <p className="text-[11px] text-muted-foreground">Not run yet.</p>;
  }
  return (
    <p className="text-xs text-muted-foreground">
      Last run: {new Date(at).toLocaleString()}
      {status && ` · ${status}`}
      {detail && ` · ${detail}`}
    </p>
  );
}

// ── Product A — Recurring Meeting Prep ───────────────────────────────────────

function RecurringMeetingPrepSection({
  draft, update, running, onRunNow, logs,
}: {
  draft: PrepScheduleConfig;
  update: Patch;
  running: boolean;
  onRunNow: () => void;
  logs: BatchLog[];
}) {
  const [newIncludeName, setNewIncludeName] = useState('');
  const [newChannel, setNewChannel] = useState('');

  const addIncludeName = () => {
    const name = newIncludeName.trim();
    if (!name || draft.always_include.includes(name)) return;
    update({ always_include: [...draft.always_include, name] });
    setNewIncludeName('');
  };
  const removeIncludeName = (name: string) =>
    update({ always_include: draft.always_include.filter(n => n !== name) });

  const addChannel = () => {
    const ch = newChannel.trim().replace(/^#/, '');
    if (!ch || draft.slack_channels.includes(ch)) return;
    update({ slack_channels: [...draft.slack_channels, ch] });
    setNewChannel('');
  };
  const removeChannel = (ch: string) =>
    update({ slack_channels: draft.slack_channels.filter(c => c !== ch) });

  const tzOptions = Array.from(new Set([getBrowserTimezone(), draft.timezone, ...COMMON_TIMEZONES]));

  return (
    <section className="space-y-4">
      <div>
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <CalendarClock className="h-4 w-4" /> Recurring Meeting Prep
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Generate a prep brief each morning for today's qualifying 1:1 meetings.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" /> Schedule
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-3">
            <Switch
              checked={draft.enabled}
              onCheckedChange={v => update({ enabled: v })}
            />
            <div>
              <span className="text-sm font-medium">Enable daily auto-generation</span>
              <p className="text-[11px] text-muted-foreground">
                Automatically generate 1:1 prep briefs for today's qualifying meetings.
              </p>
            </div>
          </label>

          <div className="flex flex-wrap gap-4">
            <div className="space-y-1">
              <label className="text-xs font-medium">Run at</label>
              <Select
                value={String(draft.run_hour_local)}
                onValueChange={v => update({ run_hour_local: parseInt(v) })}
              >
                <SelectTrigger className="w-40 h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 24 }, (_, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {formatHourLabel(i)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium">Timezone</label>
              <Select
                value={draft.timezone}
                onValueChange={v => update({ timezone: v })}
              >
                <SelectTrigger className="w-56 h-9 text-sm font-mono">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tzOptions.map(tz => (
                    <SelectItem key={tz} value={tz} className="font-mono text-xs">
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Runs at {formatHourLabel(draft.run_hour_local)} in {draft.timezone}. This schedule is
            shared with My Daily Brief below.
          </p>

          <div className="border-t pt-3">
            <LastRunLine
              at={draft.last_run_at}
              status={draft.last_run_status}
              detail={draft.last_run_preps_generated != null ? `${draft.last_run_preps_generated} prep(s)` : undefined}
            />
          </div>

          <Button variant="outline" onClick={onRunNow} disabled={running} className="gap-1.5">
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Run prep now
          </Button>
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
                  <button className="ml-1 rounded-full hover:bg-muted" onClick={() => removeIncludeName(name)}>
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
                update({ max_others_after_exclude: Math.max(0, Math.min(5, parseInt(e.target.value) || 0)) })
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
            <Switch checked={draft.sync_zoom_before} onCheckedChange={v => update({ sync_zoom_before: v })} />
            <span className="text-sm">Sync Zoom recordings before generating</span>
          </label>

          <label className="flex items-center gap-3">
            <Switch checked={draft.sync_slack_before} onCheckedChange={v => update({ sync_slack_before: v })} />
            <span className="text-sm">Sync Slack messages before generating</span>
          </label>

          <div className="pt-2 border-t">
            <label className="flex items-center gap-3">
              <Switch checked={draft.enrich_stackone ?? false} onCheckedChange={v => update({ enrich_stackone: v })} />
              <div>
                <span className="text-sm">Enrich with StackOne data</span>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Pull HRIS, project management, and CRM data for each team member during prep generation.
                  Requires a connected StackOne account in Settings &rarr; Integrations.
                </p>
              </div>
            </label>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium">Slack channels to include</label>
            <div className="flex flex-wrap gap-1.5">
              {draft.slack_channels.map(ch => (
                <Badge key={ch} variant="outline" className="bg-background">
                  <span className="text-xs">#{ch}</span>
                  <button className="ml-1 rounded-full hover:bg-muted" onClick={() => removeChannel(ch)}>
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Run history</CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs yet. Click "Run prep now" or wait for the scheduled run.</p>
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
                    <div className="flex items-center gap-2">
                      {statusIcon}
                      <span className="text-sm font-medium">
                        {new Date(log.started_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        {' '}
                        {new Date(log.started_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      </span>
                      <Badge variant="outline" className="text-[10px] h-5">{log.trigger_type}</Badge>
                      {duration != null && (
                        <span className="text-[11px] text-muted-foreground ml-auto">{duration}s</span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>{log.meetings_found} meeting{log.meetings_found !== 1 ? 's' : ''} found</span>
                      <span>{log.meetings_qualified} qualified</span>
                      <span className="text-foreground font-medium">{log.preps_generated} prep{log.preps_generated !== 1 ? 's' : ''} generated</span>
                      {log.preps_cached > 0 && <span>{log.preps_cached} cached</span>}
                    </div>

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
    </section>
  );
}

// ── Product B — My Daily Brief (DCI) ─────────────────────────────────────────

function MyDailyBriefSection({
  draft, update, running, onRunNow,
}: {
  draft: PrepScheduleConfig;
  update: Patch;
  running: boolean;
  onRunNow: () => void;
}) {
  const toggleDciSource = (id: string) =>
    update({
      dci_sources: draft.dci_sources.includes(id)
        ? draft.dci_sources.filter(s => s !== id)
        : [...draft.dci_sources, id],
    });

  return (
    <section className="space-y-4">
      <div>
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Brain className="h-4 w-4" /> My Daily Brief
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Discover action items across your meetings, email, and Slack throughout the day.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" /> Schedule
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-3">
            <Switch checked={draft.dci_enabled} onCheckedChange={v => update({ dci_enabled: v })} />
            <div>
              <span className="text-sm font-medium">Enable daily action-item discovery</span>
              <p className="text-[11px] text-muted-foreground">
                Automatically extract action items from your meetings, email, and Slack throughout the day.
              </p>
            </div>
          </label>

          <p className="text-[11px] text-muted-foreground">
            Runs on your daily schedule at {formatHourLabel(draft.run_hour_local)} in {draft.timezone}
            {' '}(set under Recurring Meeting Prep).
          </p>

          <div className="border-t pt-3">
            <LastRunLine at={draft.dci_last_run_at} status={draft.dci_last_run_status} />
          </div>

          <Button variant="outline" onClick={onRunNow} disabled={running} className="gap-1.5">
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Run brief now
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Data sources</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {DCI_SOURCES.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleDciSource(s.id)}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs border transition-colors',
                    draft.dci_sources.includes(s.id)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-border hover:bg-muted'
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium">Focus instructions (optional)</label>
            <Textarea
              value={draft.dci_instructions ?? ''}
              onChange={e => update({ dci_instructions: e.target.value || null })}
              placeholder="e.g. Focus on product launch blockers and customer-facing commitments"
              className="text-sm resize-none"
              rows={3}
            />
            <p className="text-[11px] text-muted-foreground">
              Describe what you care about. The agent will prioritize matching items.
            </p>
          </div>

          <label className="flex items-center gap-3 border-t pt-3">
            <Switch checked={draft.dci_slack_dm} onCheckedChange={v => update({ dci_slack_dm: v })} />
            <span className="text-sm">Send end-of-day brief to Slack DM</span>
          </label>

          {draft.dci_sources.includes('slack') && (
            <div className="space-y-1">
              <label className="text-xs font-medium">Your Slack member ID (optional)</label>
              <Input
                value={draft.slack_user_id ?? ''}
                onChange={e => update({ slack_user_id: e.target.value || null })}
                placeholder="e.g. U01234ABCDE"
                className="h-9 text-sm font-mono w-48"
              />
              <p className="text-[11px] text-muted-foreground">
                Find it in Slack: click your name → Copy member ID. Used to filter messages directed at you.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

// ── Panel ─────────────────────────────────────────────────────────────────────

export default function CosPrepSchedulePanel() {
  const { toast } = useToast();
  const { config, userId, loading, refetch, saveConfig } = usePrepScheduleConfig();
  const [draft, setDraft] = useState<PrepScheduleConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [runningPrep, setRunningPrep] = useState(false);
  const [runningBrief, setRunningBrief] = useState(false);
  const [logs, setLogs] = useState<BatchLog[]>([]);

  useEffect(() => {
    if (config) setDraft(config);
  }, [config]);

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
    if (userId) loadLogs(userId);
  }, [userId, loadLogs]);

  const update: Patch = useCallback((patch) => {
    setDraft(d => (d ? { ...d, ...patch } : d));
  }, []);

  // Persist all editable fields (read-only last_run_* are owned by the backend).
  const persistDraft = useCallback(async (d: PrepScheduleConfig): Promise<boolean> => {
    if (!isValidTimezone(d.timezone)) {
      toast({ title: 'Invalid timezone', description: `"${d.timezone}" is not a valid IANA timezone.`, variant: 'destructive' });
      return false;
    }
    return saveConfig({
      enabled: d.enabled,
      run_hour_local: d.run_hour_local,
      timezone: d.timezone,
      always_include: d.always_include,
      max_others_after_exclude: d.max_others_after_exclude,
      sync_zoom_before: d.sync_zoom_before,
      sync_slack_before: d.sync_slack_before,
      enrich_stackone: d.enrich_stackone,
      slack_channels: d.slack_channels,
      dci_enabled: d.dci_enabled,
      dci_sources: d.dci_sources,
      dci_instructions: d.dci_instructions || null,
      dci_slack_dm: d.dci_slack_dm,
      slack_user_id: d.slack_user_id || null,
    });
  }, [saveConfig, toast]);

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    const ok = await persistDraft(draft);
    if (ok) toast({ title: 'Schedule saved' });
    setSaving(false);
  };

  // Product A: save current settings, then run the prep batch only.
  const runPrepNow = async () => {
    if (!draft) return;
    setRunningPrep(true);
    try {
      if (!(await persistDraft(draft))) return;
      const { data, error } = await supabase.functions.invoke('daily-prep-batch', { body: {} });
      if (error) throw error;
      const totalPreps = (data as { total_preps_generated?: number })?.total_preps_generated ?? 0;
      toast({ title: 'Prep complete', description: `${totalPreps} prep${totalPreps !== 1 ? 's' : ''} generated` });
      await refetch();
      if (userId) loadLogs(userId);
    } catch (err) {
      toast({ title: 'Prep failed', description: String(err), variant: 'destructive' });
    } finally {
      setRunningPrep(false);
    }
  };

  // Product B: save current settings, then run the DCI brief only.
  const runBriefNow = async () => {
    if (!draft) return;
    setRunningBrief(true);
    try {
      if (!(await persistDraft(draft))) return;
      const { error } = await supabase.functions.invoke('generate-dci-brief', { body: {} });
      if (error) throw error;
      toast({ title: 'Daily brief generated' });
      await refetch();
    } catch (err) {
      toast({ title: 'Brief failed', description: String(err), variant: 'destructive' });
    } finally {
      setRunningBrief(false);
    }
  };

  if (loading || !draft) return null;

  return (
    <div className="space-y-10">
      <RecurringMeetingPrepSection
        draft={draft}
        update={update}
        running={runningPrep}
        onRunNow={runPrepNow}
        logs={logs}
      />

      <MyDailyBriefSection
        draft={draft}
        update={update}
        running={runningBrief}
        onRunNow={runBriefNow}
      />

      <div className="flex gap-2">
        <Button onClick={save} disabled={saving} className="gap-1.5">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save schedule
        </Button>
      </div>
    </div>
  );
}
