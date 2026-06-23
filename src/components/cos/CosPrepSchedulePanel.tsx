import React, { useState, useEffect, useCallback } from 'react';
import {
  Loader2, Save, Clock, Play, Square, Plus, X,
  CheckCircle, AlertTriangle, XCircle, Video, MessageSquare,
  Brain, CalendarClock, Repeat, Star, Lock,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
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
import { useUpcomingMeetingGroups } from '@/hooks/useUpcomingMeetingGroups';
import { PREP_TOOLS, EXTRA_TOOLS, resolveToolTier } from '@/lib/prepTools';

// ── Constants ─────────────────────────────────────────────────────────────────

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

// ── Types ─────────────────────────────────────────────────────────────────────

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

interface DciLog {
  id: string;
  trigger_type: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  items_found: number;
  items_surfaced: number;
  error: string | null;
  summary: string | null;
}

interface TeamMember {
  id: string;
  name: string;
  email: string | null;
  agent_overrides: Record<string, unknown>;
}

type Patch = (patch: Partial<PrepScheduleConfig>) => void;

// ── Shared helpers ────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: string }) {
  if (status === 'ok')        return <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />;
  if (status === 'partial')   return <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />;
  if (status === 'failed')    return <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />;
  if (status === 'cancelled') return <XCircle className="h-4 w-4 text-muted-foreground flex-shrink-0" />;
  return <Loader2 className="h-4 w-4 text-muted-foreground animate-spin flex-shrink-0" />;
}

function LastRunLine({ at, status, detail }: { at: string | null; status: string | null; detail?: string }) {
  if (!at) return <p className="text-[11px] text-muted-foreground">Not run yet.</p>;
  return (
    <p className="text-xs text-muted-foreground">
      Last run: {new Date(at).toLocaleString()}
      {status && ` · ${status}`}
      {detail && ` · ${detail}`}
    </p>
  );
}

// ── Tool tier matrix ─────────────────────────────────────────────────────────

const TIER_LABELS: Record<1 | 2 | 3, { label: string; description: string }> = {
  1: { label: 'Tier 1',  description: 'Primary signal — direct comms with this person' },
  2: { label: 'Tier 2',  description: 'Team/workflow context — work signal, not direct comms' },
  3: { label: 'Tier 3',  description: 'Background only — org context, never projected onto person' },
};

function MeetingsToolTiersCard({
  draft, update,
}: {
  draft: PrepScheduleConfig;
  update: Patch;
}) {
  const allTools = [...PREP_TOOLS, ...EXTRA_TOOLS];
  const toolTiers = draft.tool_tiers ?? {};

  const setTier = (toolId: string, tier: 1 | 2 | 3) => {
    update({ tool_tiers: { ...toolTiers, [toolId]: tier } });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tool Tiers</CardTitle>
        <p className="text-[11px] text-muted-foreground mt-1">
          Set the signal tier for each data source. Tier 1 talking points must trace directly to that
          source. Tier 3 sources are never projected onto the person without direct evidence.
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                <th className="text-left pb-3 pr-6 text-xs font-medium text-muted-foreground min-w-[140px]">
                  Tool
                </th>
                {([1, 2, 3] as const).map(tier => (
                  <th key={tier} className="pb-3 px-4 text-center">
                    <div className="text-xs font-medium">{TIER_LABELS[tier].label}</div>
                    <div className="text-[10px] text-muted-foreground font-normal max-w-[120px] mx-auto leading-tight mt-0.5">
                      {TIER_LABELS[tier].description}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allTools.map((tool, i) => {
                const effectiveTier = resolveToolTier(tool.id, toolTiers);
                const isDefault = !toolTiers[tool.id];
                return (
                  <tr key={tool.id} className={cn('border-t border-border/40', i % 2 !== 0 && 'bg-muted/20')}>
                    <td className="py-2.5 pr-6">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-sm">{tool.label}</span>
                        {isDefault && (
                          <span className="text-[9px] text-muted-foreground/60 uppercase tracking-wide">default</span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground">{tool.description}</p>
                    </td>
                    {([1, 2, 3] as const).map(tier => (
                      <td key={tier} className="py-2.5 px-4 text-center">
                        <button
                          type="button"
                          title={TIER_LABELS[tier].description}
                          onClick={() => setTier(tool.id, tier)}
                          className={cn(
                            'h-5 w-5 rounded-full border-2 mx-auto flex items-center justify-center transition-colors',
                            effectiveTier === tier
                              ? 'border-primary bg-primary'
                              : 'border-border bg-background hover:border-primary/50'
                          )}
                        >
                          {effectiveTier === tier && (
                            <div className="h-2 w-2 rounded-full bg-primary-foreground" />
                          )}
                        </button>
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-1.5 mt-3 pt-3 border-t">
          <Lock className="h-3 w-3 text-muted-foreground/60" />
          <p className="text-[10px] text-muted-foreground">
            Tier overrides are saved with your schedule. Reset a tool to its default by selecting its highlighted tier.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Shared panel state ────────────────────────────────────────────────────────

function usePanelState() {
  const { toast } = useToast();
  const { config, userId, loading, refetch, saveConfig } = usePrepScheduleConfig();
  const [draft, setDraft] = useState<PrepScheduleConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [runningPrep, setRunningPrep] = useState(false);
  const [runningBrief, setRunningBrief] = useState(false);
  const [prepLogs, setPrepLogs] = useState<BatchLog[]>([]);

  useEffect(() => { if (config) setDraft(config); }, [config]);

  const loadPrepLogs = useCallback(async (uid: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('cos_prep_batch_log')
      .select('*')
      .eq('user_id', uid)
      .order('started_at', { ascending: false })
      .limit(20);
    if (data) {
      setPrepLogs(data.map((row: Record<string, unknown>) => ({
        ...row,
        errors: typeof row.errors === 'string' ? JSON.parse(row.errors as string) : (row.errors ?? []),
      })));
    }
  }, []);

  useEffect(() => { if (userId) loadPrepLogs(userId); }, [userId, loadPrepLogs]);

  const update: Patch = useCallback((patch) => {
    setDraft(d => (d ? { ...d, ...patch } : d));
  }, []);

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
      included_group_series: d.included_group_series,
      prep_tools: d.prep_tools,
      tool_tiers: d.tool_tiers,
      sync_zoom_before: d.prep_tools.includes('zoom'),
      sync_slack_before: d.prep_tools.includes('slack'),
      enrich_stackone: d.prep_tools.includes('stackone'),
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
    if (ok) toast({ title: 'Settings saved' });
    setSaving(false);
  };

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
      if (userId) loadPrepLogs(userId);
    } catch (err) {
      toast({ title: 'Prep failed', description: String(err), variant: 'destructive' });
    } finally {
      setRunningPrep(false);
    }
  };

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

  return {
    draft, update, saving, save,
    runningPrep, runPrepNow,
    runningBrief, runBriefNow,
    prepLogs, loadPrepLogs, userId, loading,
  };
}

// ── Meetings — Card 1: Schedule + Manual Run ──────────────────────────────────

function MeetingsScheduleCard({ draft, update, running, onRunNow }: {
  draft: PrepScheduleConfig; update: Patch; running: boolean; onRunNow: () => void;
}) {
  const tzOptions = Array.from(new Set([getBrowserTimezone(), draft.timezone, ...COMMON_TIMEZONES]));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4" /> Schedule + Manual Run
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-center gap-3">
          <Switch checked={draft.enabled} onCheckedChange={v => update({ enabled: v })} />
          <div>
            <span className="text-sm font-medium">Enable daily auto-generation</span>
            <p className="text-[11px] text-muted-foreground">
              Generate 1:1 prep briefs each morning for qualifying meetings.
            </p>
          </div>
        </label>

        <div className="flex flex-wrap gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium">Run at</label>
            <Select value={String(draft.run_hour_local)} onValueChange={v => update({ run_hour_local: parseInt(v) })}>
              <SelectTrigger className="w-40 h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 24 }, (_, i) => (
                  <SelectItem key={i} value={String(i)}>{formatHourLabel(i)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Timezone</label>
            <Select value={draft.timezone} onValueChange={v => update({ timezone: v })}>
              <SelectTrigger className="w-56 h-9 text-sm font-mono"><SelectValue /></SelectTrigger>
              <SelectContent>
                {tzOptions.map(tz => (
                  <SelectItem key={tz} value={tz} className="font-mono text-xs">{tz}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Runs at {formatHourLabel(draft.run_hour_local)} in {draft.timezone}. This schedule is shared with Daily Brief.
        </p>

        <div className="border-t pt-3 space-y-3">
          <LastRunLine
            at={draft.last_run_at}
            status={draft.last_run_status}
            detail={draft.last_run_preps_generated != null ? `${draft.last_run_preps_generated} prep(s)` : undefined}
          />
          <Button variant="outline" onClick={onRunNow} disabled={running} className="gap-1.5">
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Run now
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Meetings — Card 2: Scope ──────────────────────────────────────────────────

function MeetingsScopeCard({ draft, update }: { draft: PrepScheduleConfig; update: Patch }) {
  const { recurringOneOnOnes, oneOffOneOnOnes, recurringGroups, loading } = useUpcomingMeetingGroups();

  const toggleGroupSeries = (key: string) =>
    update({
      included_group_series: draft.included_group_series.includes(key)
        ? draft.included_group_series.filter(k => k !== key)
        : [...draft.included_group_series, key],
    });

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Scope</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium">Recurring 1:1s</span>
            <Badge variant="secondary" className="text-[10px] h-4 px-1.5">auto-included</Badge>
          </div>
          <p className="text-[11px] text-muted-foreground">Your regular 1:1s are always prepped.</p>
          {loading ? (
            <p className="text-[11px] text-muted-foreground">Loading…</p>
          ) : recurringOneOnOnes.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">No recurring 1:1s in the next 60 days.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {recurringOneOnOnes.map(m => (
                <Badge key={m.key} variant="outline" className="bg-background gap-1">
                  <Repeat className="h-3 w-3 text-muted-foreground" />
                  <span className="text-xs">{m.attendeeLabel}</span>
                </Badge>
              ))}
            </div>
          )}
        </div>

        {!loading && oneOffOneOnOnes.length > 0 && (
          <div className="space-y-1.5 border-t pt-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium">One-off 1:1s</span>
              <Badge className="text-[10px] h-4 px-1.5 bg-amber-100 text-amber-800 hover:bg-amber-100">high-value</Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">One-time 1:1s are included by default.</p>
            <div className="flex flex-wrap gap-1.5">
              {oneOffOneOnOnes.map(m => (
                <Badge key={m.key} variant="outline" className="bg-background gap-1">
                  <Star className="h-3 w-3 text-amber-500" />
                  <span className="text-xs">{m.attendeeLabel}</span>
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-1.5 border-t pt-3">
          <span className="text-xs font-medium">Group meetings (opt-in)</span>
          <p className="text-[11px] text-muted-foreground">Pick recurring group meetings to also prep.</p>
          {loading ? (
            <p className="text-[11px] text-muted-foreground">Loading…</p>
          ) : recurringGroups.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">No recurring group meetings found.</p>
          ) : (
            <div className="space-y-1.5">
              {recurringGroups.map(m => (
                <label key={m.key} className="flex items-center gap-2.5 cursor-pointer">
                  <Checkbox
                    checked={draft.included_group_series.includes(m.key)}
                    onCheckedChange={() => toggleGroupSeries(m.key)}
                  />
                  <span className="text-sm">{m.title}</span>
                  <span className="text-[11px] text-muted-foreground">{m.attendeeCount} attendees</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Meetings — Card 3: Tools (merged global + per-person) ────────────────────

function MeetingsToolsCard({
  draft, update, userId,
}: {
  draft: PrepScheduleConfig;
  update: Patch;
  userId: string | null;
}) {
  const [newChannel, setNewChannel] = useState('');
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [recurringMemberIds, setRecurringMemberIds] = useState<Set<string>>(new Set());
  const [loadingMembers, setLoadingMembers] = useState(true);
  const { toast } = useToast();
  const { recurringGroups } = useUpcomingMeetingGroups();

  useEffect(() => {
    if (!userId) { setLoadingMembers(false); return; }
    (async () => {
      const [membersRes, eventsRes] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from('cos_team_members').select('id, name, email, agent_overrides').eq('user_id', userId).order('name'),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from('cos_one_on_one_events').select('team_member_id, recurring_event_id').eq('user_id', userId),
      ]);
      // Members with at least one recurring 1:1 are "relationships" → shown individually
      const recurring = new Set<string>(
        (eventsRes.data ?? [])
          .filter((e: { recurring_event_id: string | null }) => !!e.recurring_event_id)
          .map((e: { team_member_id: string }) => e.team_member_id)
      );
      setRecurringMemberIds(recurring);
      // Sort: recurring 1:1 members first (alpha), then the rest (alpha)
      const sorted = [...(membersRes.data ?? [])].sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
        const aRec = recurring.has(a.id as string);
        const bRec = recurring.has(b.id as string);
        if (aRec !== bRec) return aRec ? -1 : 1;
        return ((a.name || a.email || '') as string).localeCompare((b.name || b.email || '') as string);
      });
      setMembers(sorted.map((m: Record<string, unknown>) => ({
        ...m,
        agent_overrides: (m.agent_overrides as Record<string, unknown>) ?? {},
      } as TeamMember)));
      setLoadingMembers(false);
    })();
  }, [userId]);

  const toggleTool = (id: string) =>
    update({
      prep_tools: draft.prep_tools.includes(id)
        ? draft.prep_tools.filter(t => t !== id)
        : [...draft.prep_tools, id],
    });

  const addChannel = () => {
    const ch = newChannel.trim().replace(/^#/, '');
    if (!ch || draft.slack_channels.includes(ch)) return;
    update({ slack_channels: [...draft.slack_channels, ch] });
    setNewChannel('');
  };
  const removeChannel = (ch: string) =>
    update({ slack_channels: draft.slack_channels.filter(c => c !== ch) });

  const getMemberExtras = (m: TeamMember): Set<string> => {
    const override = m.agent_overrides.prep_tools as string[] | null | undefined;
    if (!Array.isArray(override) || override.length === 0) return new Set();
    const defaultSet = new Set(draft.prep_tools);
    return new Set(override.filter(t => !defaultSet.has(t)));
  };

  const toggleExtra = async (m: TeamMember, toolId: string, checked: boolean) => {
    const currentExtras = getMemberExtras(m);
    if (checked) currentExtras.add(toolId); else currentExtras.delete(toolId);
    const newPrepTools = currentExtras.size === 0 ? null : [...draft.prep_tools, ...currentExtras];
    const newOverrides = { ...m.agent_overrides, prep_tools: newPrepTools };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from('cos_team_members').update({ agent_overrides: newOverrides }).eq('id', m.id);
    if (error) {
      toast({ title: 'Failed to update', description: String(error), variant: 'destructive' });
      return;
    }
    setMembers(prev => prev.map(mb => mb.id === m.id ? { ...mb, agent_overrides: newOverrides } : mb));
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Tools</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {/* Global toggles */}
        <div>
          <p className="text-[11px] text-muted-foreground mb-2">
            Data sources gathered for every prep. Toggle off to disable globally.
          </p>
          <div className="flex flex-wrap gap-2">
            {PREP_TOOLS.map(tool => {
              const on = draft.prep_tools.includes(tool.id);
              return (
                <button
                  key={tool.id}
                  type="button"
                  title={tool.description}
                  onClick={() => toggleTool(tool.id)}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs border transition-colors',
                    on ? 'bg-primary text-primary-foreground border-primary'
                       : 'bg-background text-muted-foreground border-border hover:bg-muted'
                  )}
                >
                  {tool.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Slack channels */}
        <div className="space-y-2 border-t pt-3">
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

        {/* Per-person matrix + group meetings */}
        <div className="border-t pt-3">
          <p className="text-[11px] text-muted-foreground mb-3">
            Add integration-specific tools for each 1:1 relationship. Non-recurring 1:1s and group meetings use global defaults.
          </p>
          {loadingMembers ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr>
                    <th className="text-left pb-1 pr-6 text-xs text-muted-foreground min-w-[160px]" />
                    <th
                      colSpan={PREP_TOOLS.length}
                      className="pb-1 text-center text-[10px] uppercase tracking-wide text-muted-foreground/60 border-b border-dashed border-border/50"
                    >
                      Default — all meetings
                    </th>
                    {EXTRA_TOOLS.length > 0 && (
                      <th
                        colSpan={EXTRA_TOOLS.length}
                        className="pb-1 pl-6 text-center text-[10px] uppercase tracking-wide text-muted-foreground/60 border-b border-dashed border-border/50"
                      >
                        Additional per person
                      </th>
                    )}
                  </tr>
                  <tr>
                    <th className="pb-3 text-left text-xs font-medium text-muted-foreground pr-6">Meeting / Person</th>
                    {PREP_TOOLS.map(t => (
                      <th key={t.id} className="pb-3 px-3 text-center text-xs font-medium whitespace-nowrap">{t.label}</th>
                    ))}
                    {EXTRA_TOOLS.map(t => (
                      <th key={t.id} className="pb-3 px-3 pl-6 text-center text-xs font-medium whitespace-nowrap">{t.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Section A: recurring 1:1 relationships — configurable per person */}
                  {members.filter(m => recurringMemberIds.has(m.id)).map((m, i) => {
                    const extras = getMemberExtras(m);
                    return (
                      <tr key={m.id} className={cn('border-t border-border/40', i % 2 !== 0 && 'bg-muted/20')}>
                        <td className="py-2.5 pr-6">
                          <span className="font-medium text-sm">{m.name || m.email || 'Unknown'}</span>
                          <span className="ml-1.5 text-[9px] text-primary/60 uppercase tracking-wide">recurring 1:1</span>
                        </td>
                        {PREP_TOOLS.map(t => (
                          <td key={t.id} className="py-2.5 px-3 text-center">
                            <div className="flex items-center justify-center" title="Default — always included">
                              <div className="h-4 w-4 rounded border border-primary/40 bg-primary/10 flex items-center justify-center">
                                <Lock className="h-2.5 w-2.5 text-primary/60" />
                              </div>
                            </div>
                          </td>
                        ))}
                        {EXTRA_TOOLS.map(t => (
                          <td key={t.id} className="py-2.5 px-3 pl-6 text-center">
                            <Checkbox
                              checked={extras.has(t.id)}
                              onCheckedChange={(v) => toggleExtra(m, t.id, v as boolean)}
                              className="mx-auto"
                              title={t.description}
                            />
                          </td>
                        ))}
                      </tr>
                    );
                  })}

                  {/* Section B: non-recurring 1:1s — one aggregate row, global defaults only */}
                  <tr>
                    <td colSpan={1 + PREP_TOOLS.length + EXTRA_TOOLS.length} className="pt-4 pb-1">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground/50">Non-recurring 1:1s</p>
                    </td>
                  </tr>
                  <tr className="border-t border-border/40">
                    <td className="py-2.5 pr-6">
                      <span className="font-medium text-sm text-muted-foreground">One-off 1:1 meetings</span>
                      <p className="text-[10px] text-muted-foreground/60">Uses global default tools</p>
                    </td>
                    {PREP_TOOLS.map(t => (
                      <td key={t.id} className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center" title="Inherits global defaults">
                          <div className="h-4 w-4 rounded border border-border/40 bg-muted/30 flex items-center justify-center">
                            <Lock className="h-2.5 w-2.5 text-muted-foreground/40" />
                          </div>
                        </div>
                      </td>
                    ))}
                    {EXTRA_TOOLS.map(t => (
                      <td key={t.id} className="py-2.5 px-3 pl-6 text-center">
                        <div className="h-4 w-4 rounded border border-border/40 mx-auto opacity-30" />
                      </td>
                    ))}
                  </tr>

                  {/* Section C: group meetings in scope */}
                  {draft.included_group_series.length > 0 && (
                    <>
                      <tr>
                        <td colSpan={1 + PREP_TOOLS.length + EXTRA_TOOLS.length} className="pt-4 pb-1">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground/50">Group meetings in scope</p>
                        </td>
                      </tr>
                      {draft.included_group_series.map((seriesKey, i) => {
                        const group = recurringGroups.find(g => g.key === seriesKey);
                        return (
                          <tr key={seriesKey} className={cn('border-t border-border/40', i % 2 !== 0 && 'bg-muted/20')}>
                            <td className="py-2.5 pr-6">
                              <span className="font-medium text-sm text-muted-foreground">
                                {group?.title ?? seriesKey}
                              </span>
                              {group && (
                                <p className="text-[10px] text-muted-foreground/60">{group.attendeeCount} attendees · global tools</p>
                              )}
                            </td>
                            {PREP_TOOLS.map(t => (
                              <td key={t.id} className="py-2.5 px-3 text-center">
                                <div className="flex items-center justify-center" title="Inherits global defaults">
                                  <div className="h-4 w-4 rounded border border-border/40 bg-muted/30 flex items-center justify-center">
                                    <Lock className="h-2.5 w-2.5 text-muted-foreground/40" />
                                  </div>
                                </div>
                              </td>
                            ))}
                            {EXTRA_TOOLS.map(t => (
                              <td key={t.id} className="py-2.5 px-3 pl-6 text-center">
                                <div className="h-4 w-4 rounded border border-border/40 mx-auto opacity-30" />
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Meetings — Card 4: Logs ───────────────────────────────────────────────────

function MeetingsLogsCard({ logs, userId, onRefresh }: {
  logs: BatchLog[];
  userId: string | null;
  onRefresh: () => void;
}) {
  const { toast } = useToast();
  const [stopping, setStopping] = useState<string | null>(null);

  const stopRun = async (logId: string) => {
    if (!userId) return;
    setStopping(logId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('cos_prep_batch_log')
      .update({ status: 'cancelled', finished_at: new Date().toISOString() })
      .eq('id', logId)
      .eq('user_id', userId);
    toast({ title: 'Run stopped' });
    setStopping(null);
    onRefresh();
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Logs</CardTitle></CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No runs yet. Click "Run now" or wait for the scheduled run.</p>
        ) : (
          <div className="space-y-3">
            {logs.map(log => {
              const isRunning = log.status === 'running';
              const duration = log.finished_at
                ? Math.round((new Date(log.finished_at).getTime() - new Date(log.started_at).getTime()) / 1000)
                : null;
              return (
                <div key={log.id} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusIcon status={log.status} />
                    <span className="text-sm font-medium">
                      {new Date(log.started_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      {' '}
                      {new Date(log.started_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </span>
                    <Badge variant="outline" className="text-[10px] h-5">{log.trigger_type}</Badge>
                    {duration != null && <span className="text-[11px] text-muted-foreground ml-auto">{duration}s</span>}
                    {isRunning && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-xs gap-1 ml-auto text-destructive hover:text-destructive"
                        onClick={() => stopRun(log.id)}
                        disabled={stopping === log.id}
                      >
                        {stopping === log.id
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <Square className="h-3 w-3" />}
                        Stop
                      </Button>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>{log.meetings_found} meeting{log.meetings_found !== 1 ? 's' : ''} found</span>
                    <span>{log.meetings_qualified} qualified</span>
                    <span className="text-foreground font-medium">
                      {log.preps_generated} prep{log.preps_generated !== 1 ? 's' : ''} generated
                    </span>
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
  );
}


// ── Daily Brief — Card 1: Schedule + Manual Run ───────────────────────────────

function BriefScheduleCard({ draft, update, running, onRunNow }: {
  draft: PrepScheduleConfig; update: Patch; running: boolean; onRunNow: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4" /> Schedule + Manual Run
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-center gap-3">
          <Switch checked={draft.dci_enabled} onCheckedChange={v => update({ dci_enabled: v })} />
          <div>
            <span className="text-sm font-medium">Enable daily action-item discovery</span>
            <p className="text-[11px] text-muted-foreground">
              Automatically extract action items from your meetings, email, and Slack.
            </p>
          </div>
        </label>
        <p className="text-[11px] text-muted-foreground">
          Runs at {formatHourLabel(draft.run_hour_local)} in {draft.timezone}
          {' '}(schedule configured under Settings › Chief of Staff › Meetings).
        </p>
        <div className="border-t pt-3 space-y-3">
          <LastRunLine at={draft.dci_last_run_at} status={draft.dci_last_run_status} />
          <Button variant="outline" onClick={onRunNow} disabled={running} className="gap-1.5">
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Run now
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Daily Brief — Card 2: Sources ─────────────────────────────────────────────

function BriefSourcesCard({ draft, update }: { draft: PrepScheduleConfig; update: Patch }) {
  const toggleSource = (id: string) =>
    update({
      dci_sources: draft.dci_sources.includes(id)
        ? draft.dci_sources.filter(s => s !== id)
        : [...draft.dci_sources, id],
    });

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Sources</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {DCI_SOURCES.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => toggleSource(s.id)}
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
            Describe what you care about — the agent prioritizes matching items.
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
              Find it in Slack: click your name → Copy member ID.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Daily Brief — Card 3: Logs ────────────────────────────────────────────────

function BriefLogsCard({ userId }: { userId: string | null }) {
  const [logs, setLogs] = useState<DciLog[]>([]);
  const [stopping, setStopping] = useState<string | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    if (!userId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('cos_dci_log')
      .select('*')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(20);
    if (!error && data) setLogs(data as DciLog[]);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const stopRun = async (logId: string) => {
    if (!userId) return;
    setStopping(logId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('cos_dci_log')
      .update({ status: 'cancelled', finished_at: new Date().toISOString() })
      .eq('id', logId)
      .eq('user_id', userId);
    toast({ title: 'Run stopped' });
    setStopping(null);
    load();
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Logs</CardTitle></CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No runs yet.</p>
        ) : (
          <div className="space-y-3">
            {logs.map(log => {
              const isRunning = log.status === 'running';
              const duration = log.finished_at
                ? Math.round((new Date(log.finished_at).getTime() - new Date(log.started_at).getTime()) / 1000)
                : null;
              return (
                <div key={log.id} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <StatusIcon status={log.status} />
                    <span className="text-sm font-medium">
                      {new Date(log.started_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      {' '}
                      {new Date(log.started_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </span>
                    <Badge variant="outline" className="text-[10px] h-5">{log.trigger_type}</Badge>
                    {duration != null && <span className="text-[11px] text-muted-foreground ml-auto">{duration}s</span>}
                    {isRunning && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-xs gap-1 ml-auto text-destructive hover:text-destructive"
                        onClick={() => stopRun(log.id)}
                        disabled={stopping === log.id}
                      >
                        {stopping === log.id
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <Square className="h-3 w-3" />}
                        Stop
                      </Button>
                    )}
                  </div>
                  {(log.items_found > 0 || log.items_surfaced > 0) && (
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span>{log.items_found} items found</span>
                      <span className="text-foreground font-medium">{log.items_surfaced} surfaced</span>
                    </div>
                  )}
                  {log.summary && <p className="text-xs text-muted-foreground">{log.summary}</p>}
                  {log.error && (
                    <div className="bg-red-50 rounded p-2">
                      <p className="text-xs text-red-700">{log.error}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Exported panels ───────────────────────────────────────────────────────────

export function MeetingsPrepPanel() {
  const { draft, update, saving, save, runningPrep, runPrepNow, prepLogs, loadPrepLogs, userId, loading } = usePanelState();
  if (loading || !draft) return null;

  const SaveButton = () => (
    <div className="pt-2">
      <Button onClick={save} disabled={saving} className="gap-1.5">
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
        Save
      </Button>
    </div>
  );

  return (
    <Tabs defaultValue="schedule">
      <TabsList className="mb-4">
        <TabsTrigger value="schedule">Schedule</TabsTrigger>
        <TabsTrigger value="scope">Scope</TabsTrigger>
        <TabsTrigger value="tools">Tools</TabsTrigger>
        <TabsTrigger value="logs">Logs</TabsTrigger>
      </TabsList>

      <TabsContent value="schedule" className="space-y-4">
        <MeetingsScheduleCard draft={draft} update={update} running={runningPrep} onRunNow={runPrepNow} />
        <SaveButton />
      </TabsContent>

      <TabsContent value="scope" className="space-y-4">
        <MeetingsScopeCard draft={draft} update={update} />
        <SaveButton />
      </TabsContent>

      <TabsContent value="tools" className="space-y-4">
        <MeetingsToolsCard draft={draft} update={update} userId={userId} />
        <MeetingsToolTiersCard draft={draft} update={update} />
        <SaveButton />
      </TabsContent>

      <TabsContent value="logs">
        <MeetingsLogsCard logs={prepLogs} userId={userId} onRefresh={() => userId && loadPrepLogs(userId)} />
      </TabsContent>
    </Tabs>
  );
}

export function DailyBriefPanel() {
  const { draft, update, saving, save, runningBrief, runBriefNow, userId, loading } = usePanelState();
  if (loading || !draft) return null;
  return (
    <div className="space-y-4">
      <BriefScheduleCard draft={draft} update={update} running={runningBrief} onRunNow={runBriefNow} />
      <BriefSourcesCard draft={draft} update={update} />
      <BriefLogsCard userId={userId} />
      <Button onClick={save} disabled={saving} className="gap-1.5">
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
        Save
      </Button>
    </div>
  );
}

// ── Default export (legacy — both sections on one page) ───────────────────────

export default function CosPrepSchedulePanel() {
  const { draft, update, saving, save, runningPrep, runPrepNow, runningBrief, runBriefNow, prepLogs, loadPrepLogs, userId, loading } = usePanelState();
  if (loading || !draft) return null;
  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <CalendarClock className="h-4 w-4" /> Meetings
          </h3>
        </div>
        <MeetingsScheduleCard draft={draft} update={update} running={runningPrep} onRunNow={runPrepNow} />
        <MeetingsScopeCard draft={draft} update={update} />
        <MeetingsToolsCard draft={draft} update={update} userId={userId} />
        <MeetingsLogsCard logs={prepLogs} userId={userId} onRefresh={() => userId && loadPrepLogs(userId)} />
      </section>

      <section className="space-y-4">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <Brain className="h-4 w-4" /> Daily Brief
          </h3>
        </div>
        <BriefScheduleCard draft={draft} update={update} running={runningBrief} onRunNow={runBriefNow} />
        <BriefSourcesCard draft={draft} update={update} />
        <BriefLogsCard userId={userId} />
      </section>

      <Button onClick={save} disabled={saving} className="gap-1.5">
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
        Save
      </Button>
    </div>
  );
}
