import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Loader2, Save, Clock, Play, Square, Plus, X,
  CheckCircle, AlertTriangle, XCircle, Video, MessageSquare,
  Brain, CalendarClock, Repeat, Star, Lock, Calendar, ExternalLink,
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
import {
  CalendarSyncRules,
  RelationshipType,
  DEFAULT_SYNC_RULES,
} from '@/lib/calendar/matchEventToMember';
import { AgentSettingsPanel } from '@/components/cos/AgentSettingsPanel';

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
  const [runningPrep, setRunningPrep] = useState(false);
  const [runningBrief, setRunningBrief] = useState(false);
  const [prepLogs, setPrepLogs] = useState<BatchLog[]>([]);
  const isDirty = useRef(false);

  useEffect(() => { if (config) { isDirty.current = false; setDraft(config); } }, [config]);

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
    isDirty.current = true;
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
      enrich_stackone: d.prep_tools.includes('salesforce') || d.prep_tools.includes('stackone'),
      slack_channels: d.slack_channels,
      dci_enabled: d.dci_enabled,
      dci_sources: d.dci_sources,
      dci_instructions: d.dci_instructions || null,
      dci_slack_dm: d.dci_slack_dm,
      slack_user_id: d.slack_user_id || null,
      dci_run_hour_local: d.dci_run_hour_local,
      dci_timezone: d.dci_timezone,
    });
  }, [saveConfig, toast]);

  useEffect(() => {
    if (!draft || !isDirty.current) return;
    const timer = setTimeout(() => { persistDraft(draft); }, 800);
    return () => clearTimeout(timer);
  }, [draft, persistDraft]);

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
    draft, update,
    runningPrep, runPrepNow,
    runningBrief, runBriefNow,
    prepLogs, loadPrepLogs, userId, loading,
  };
}

// ── Meetings — Card 1: Schedule ───────────────────────────────────────────────

function MeetingsScheduleCard({ draft, update }: {
  draft: PrepScheduleConfig; update: Patch;
}) {
  const tzOptions = Array.from(new Set([getBrowserTimezone(), draft.timezone, ...COMMON_TIMEZONES]));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4" /> Schedule
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
      </CardContent>
    </Card>
  );
}

// ── Meetings — Card 2: Manual Run ─────────────────────────────────────────────

function MeetingsManualRunCard({ draft, running, onRunNow }: {
  draft: PrepScheduleConfig; running: boolean; onRunNow: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Play className="h-4 w-4" /> Manual Run
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <LastRunLine
          at={draft.last_run_at}
          status={draft.last_run_status}
          detail={draft.last_run_preps_generated != null ? `${draft.last_run_preps_generated} prep(s)` : undefined}
        />
        <Button variant="outline" onClick={onRunNow} disabled={running} className="gap-1.5">
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          Run now
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Meetings — Scope columns ──────────────────────────────────────────────────

function MeetingsScopeCard({ draft, update }: { draft: PrepScheduleConfig; update: Patch }) {
  const { recurringOneOnOnes, oneOffOneOnOnes, recurringGroups, loading } = useUpcomingMeetingGroups();

  const toggleGroupSeries = (key: string) =>
    update({
      included_group_series: draft.included_group_series.includes(key)
        ? draft.included_group_series.filter(k => k !== key)
        : [...draft.included_group_series, key],
    });

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Column 1: Recurring 1:1s */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-medium">Recurring 1:1s</CardTitle>
            <Badge variant="secondary" className="text-[10px] h-4 px-1.5">auto-included</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-[11px] text-muted-foreground">Loading…</p>
          ) : recurringOneOnOnes.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">No recurring 1:1s in the next 60 days.</p>
          ) : (
            <div className="space-y-1.5">
              {recurringOneOnOnes.map(m => (
                <div key={m.key} className="flex items-center gap-1.5">
                  <Repeat className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm">{m.attendeeLabel}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Column 2: One-off 1:1s */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-medium">One-off 1:1s</CardTitle>
            <Badge className="text-[10px] h-4 px-1.5 bg-amber-100 text-amber-800 hover:bg-amber-100">high-value</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-[11px] text-muted-foreground">Loading…</p>
          ) : oneOffOneOnOnes.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">None in the next 60 days.</p>
          ) : (
            <div className="space-y-1.5">
              {oneOffOneOnOnes.map(m => (
                <div key={m.key} className="flex items-center gap-1.5">
                  <Star className="h-3 w-3 text-amber-500 flex-shrink-0" />
                  <span className="text-sm">{m.attendeeLabel}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Column 3: Group meetings (opt-in) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Group meetings (opt-in)</CardTitle>
        </CardHeader>
        <CardContent>
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
                  <div>
                    <p className="text-sm">{m.title}</p>
                    <p className="text-[11px] text-muted-foreground">{m.attendeeCount} attendees</p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Meetings — Card 3: Tools (merged global + per-person) ────────────────────

const CORE_TOOL_IDS = ['zoom', 'slack', 'gmail'];

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
  const [gmailConnected, setGmailConnected] = useState(false);
  const [salesforceConnected, setSalesforceConnected] = useState(false);
  const { toast } = useToast();
  const { recurringGroups } = useUpcomingMeetingGroups();

  // Both Gmail and Salesforce are provisioned via StackOne connector profiles.
  useEffect(() => {
    (async () => {
      try {
        const { data: s1Data } = await supabase.functions.invoke('stackone-proxy', {
          body: { action: 'list_connector_profiles' },
        });
        const profiles = (s1Data?.profiles ?? []) as Array<{ provider?: string; category?: string }>;
        setGmailConnected(profiles.some(p => {
          const provider = (p.provider ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
          return provider === 'gmail' || provider.includes('gmail') || provider.includes('google');
        }));
        setSalesforceConnected(profiles.some(p => {
          const provider = (p.provider ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
          const category = (p.category ?? '').toLowerCase();
          return provider === 'salesforce' || provider.includes('salesforce') || category === 'crm';
        }));
      } catch {
        setGmailConnected(false);
        setSalesforceConnected(false);
      }
    })();
  }, []);

  const availableTools = PREP_TOOLS.filter(tool => {
    if (tool.connectionKey === 'gmail') return gmailConnected;
    if (tool.connectionKey === 'salesforce') return salesforceConnected;
    return true;
  });

  // Core comms tools stay in the "Default — all meetings" section (global toggles).
  // Everything else moves to "Additional per person" (select-all + per-row checkboxes).
  const coreTools = availableTools.filter(t => CORE_TOOL_IDS.includes(t.id));
  const perPersonToolDefs = [
    ...availableTools.filter(t => !CORE_TOOL_IDS.includes(t.id)),
    ...EXTRA_TOOLS,
  ];

  useEffect(() => {
    if (!userId) { setLoadingMembers(false); return; }
    (async () => {
      const [membersRes, eventsRes] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from('cos_team_members').select('id, name, email, agent_overrides').eq('user_id', userId).order('name'),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from('cos_one_on_one_events').select('team_member_id, recurring_event_id').eq('user_id', userId),
      ]);
      const recurring = new Set<string>(
        (eventsRes.data ?? [])
          .filter((e: { recurring_event_id: string | null }) => !!e.recurring_event_id)
          .map((e: { team_member_id: string }) => e.team_member_id)
      );
      setRecurringMemberIds(recurring);
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

  const recurringMembers = members.filter(m => recurringMemberIds.has(m.id));

  // For PREP_TOOLS in the per-person section (e.g. Salesforce), "select all" = global toggle.
  // For EXTRA_TOOLS (ClearGO, Jira), "select all" = all recurring members have it.
  const isToolGlobal = (toolId: string) => PREP_TOOLS.some(p => p.id === toolId);

  const isSelectAllOn = (toolId: string): boolean => {
    if (isToolGlobal(toolId)) return draft.prep_tools.includes(toolId);
    return recurringMembers.length > 0 && recurringMembers.every(m => getMemberExtras(m).has(toolId));
  };

  const handleSelectAll = async (toolId: string) => {
    if (isToolGlobal(toolId)) { toggleTool(toolId); return; }
    const allOn = recurringMembers.every(m => getMemberExtras(m).has(toolId));
    await Promise.all(recurringMembers.map(m => toggleExtra(m, toolId, !allOn)));
  };

  const totalCols = 1 + coreTools.length + perPersonToolDefs.length;

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Tools</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {/* Slack channels */}
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

        {/* Per-person matrix */}
        <div className="border-t pt-3">
          <p className="text-[11px] text-muted-foreground mb-3">
            Click a core source to toggle it globally. Click a per-person column header to enable or disable it for all recurring 1:1 relationships at once.
          </p>
          {loadingMembers ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr>
                    <th className="text-left pb-1 pr-6 text-xs text-muted-foreground min-w-[160px]" />
                    {coreTools.length > 0 && (
                      <th
                        colSpan={coreTools.length}
                        className="pb-1 text-center text-[10px] uppercase tracking-wide text-muted-foreground/60 border-b border-dashed border-border/50"
                      >
                        Default — all meetings
                      </th>
                    )}
                    {perPersonToolDefs.length > 0 && (
                      <th
                        colSpan={perPersonToolDefs.length}
                        className="pb-1 pl-6 text-center text-[10px] uppercase tracking-wide text-muted-foreground/60 border-b border-dashed border-border/50"
                      >
                        Additional per person
                      </th>
                    )}
                  </tr>
                  <tr>
                    <th className="pb-3 text-left text-xs font-medium text-muted-foreground pr-6">Meeting / Person</th>
                    {coreTools.map(t => {
                      const on = draft.prep_tools.includes(t.id);
                      return (
                        <th key={t.id} className="pb-3 px-3 text-center">
                          <button
                            type="button"
                            title={`${on ? 'Disable' : 'Enable'} ${t.label} for all meetings`}
                            onClick={() => toggleTool(t.id)}
                            className={cn(
                              'px-3 py-1 rounded-full text-xs border transition-colors whitespace-nowrap',
                              on ? 'bg-primary text-primary-foreground border-primary'
                                 : 'bg-background text-muted-foreground border-border hover:bg-muted'
                            )}
                          >
                            {t.label}
                          </button>
                        </th>
                      );
                    })}
                    {perPersonToolDefs.map(t => {
                      const on = isSelectAllOn(t.id);
                      return (
                        <th key={t.id} className="pb-3 px-3 pl-6 text-center">
                          <button
                            type="button"
                            title={`${on ? 'Deselect' : 'Select'} ${t.label} for all recurring 1:1s`}
                            onClick={() => handleSelectAll(t.id)}
                            className={cn(
                              'px-3 py-1 rounded-full text-xs border transition-colors whitespace-nowrap',
                              on ? 'bg-primary text-primary-foreground border-primary'
                                 : 'bg-background text-muted-foreground border-border hover:bg-muted'
                            )}
                          >
                            {t.label}
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {/* Section A: recurring 1:1 relationships */}
                  {recurringMembers.map((m, i) => {
                    const extras = getMemberExtras(m);
                    return (
                      <tr key={m.id} className={cn('border-t border-border/40', i % 2 !== 0 && 'bg-muted/20')}>
                        <td className="py-2.5 pr-6">
                          <span className="font-medium text-sm">{m.name || m.email || 'Unknown'}</span>
                          <span className="ml-1.5 text-[9px] text-primary/60 uppercase tracking-wide">recurring 1:1</span>
                        </td>
                        {coreTools.map(t => {
                          const on = draft.prep_tools.includes(t.id);
                          return (
                            <td key={t.id} className="py-2.5 px-3 text-center">
                              <div className="flex items-center justify-center" title={on ? 'Included via global toggle' : 'Excluded via global toggle'}>
                                <div className={cn('h-4 w-4 rounded border flex items-center justify-center',
                                  on ? 'border-primary/40 bg-primary/10' : 'border-border/40 bg-muted/30')}>
                                  <Lock className={cn('h-2.5 w-2.5', on ? 'text-primary/60' : 'text-muted-foreground/40')} />
                                </div>
                              </div>
                            </td>
                          );
                        })}
                        {perPersonToolDefs.map(t => {
                          if (isToolGlobal(t.id)) {
                            const on = draft.prep_tools.includes(t.id);
                            return (
                              <td key={t.id} className="py-2.5 px-3 pl-6 text-center">
                                <div className="flex items-center justify-center" title={on ? 'Enabled for all via column toggle' : 'Disabled for all via column toggle'}>
                                  <div className={cn('h-4 w-4 rounded border flex items-center justify-center',
                                    on ? 'border-primary/40 bg-primary/10' : 'border-border/40 bg-muted/30')}>
                                    <Lock className={cn('h-2.5 w-2.5', on ? 'text-primary/60' : 'text-muted-foreground/40')} />
                                  </div>
                                </div>
                              </td>
                            );
                          }
                          return (
                            <td key={t.id} className="py-2.5 px-3 pl-6 text-center">
                              <Checkbox
                                checked={extras.has(t.id)}
                                onCheckedChange={(v) => toggleExtra(m, t.id, v as boolean)}
                                className="mx-auto"
                                title={t.description}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}

                  {/* Section B: non-recurring 1:1s — global defaults only */}
                  <tr>
                    <td colSpan={totalCols} className="pt-4 pb-1">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground/50">Non-recurring 1:1s</p>
                    </td>
                  </tr>
                  <tr className="border-t border-border/40">
                    <td className="py-2.5 pr-6">
                      <span className="font-medium text-sm text-muted-foreground">One-off 1:1 meetings</span>
                      <p className="text-[10px] text-muted-foreground/60">Uses global default tools</p>
                    </td>
                    {coreTools.map(t => (
                      <td key={t.id} className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center" title="Inherits global defaults">
                          <div className="h-4 w-4 rounded border border-border/40 bg-muted/30 flex items-center justify-center">
                            <Lock className="h-2.5 w-2.5 text-muted-foreground/40" />
                          </div>
                        </div>
                      </td>
                    ))}
                    {perPersonToolDefs.map(t => (
                      <td key={t.id} className="py-2.5 px-3 pl-6 text-center">
                        <div className="h-4 w-4 rounded border border-border/40 mx-auto opacity-30" />
                      </td>
                    ))}
                  </tr>

                  {/* Section C: group meetings in scope */}
                  {draft.included_group_series.length > 0 && (
                    <>
                      <tr>
                        <td colSpan={totalCols} className="pt-4 pb-1">
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
                            {coreTools.map(t => (
                              <td key={t.id} className="py-2.5 px-3 text-center">
                                <div className="flex items-center justify-center" title="Inherits global defaults">
                                  <div className="h-4 w-4 rounded border border-border/40 bg-muted/30 flex items-center justify-center">
                                    <Lock className="h-2.5 w-2.5 text-muted-foreground/40" />
                                  </div>
                                </div>
                              </td>
                            ))}
                            {perPersonToolDefs.map(t => (
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


// ── Daily Brief — Card 1: Schedule ───────────────────────────────────────────

function BriefScheduleCard({ draft, update }: {
  draft: PrepScheduleConfig; update: Patch;
}) {
  const tzOptions = Array.from(new Set([getBrowserTimezone(), draft.dci_timezone, ...COMMON_TIMEZONES]));
  return (
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
              Automatically extract action items from your meetings, email, and Slack.
            </p>
          </div>
        </label>

        <div className="flex flex-wrap gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium">Run at</label>
            <Select value={String(draft.dci_run_hour_local)} onValueChange={v => update({ dci_run_hour_local: parseInt(v) })}>
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
            <Select value={draft.dci_timezone} onValueChange={v => update({ dci_timezone: v })}>
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
          Runs at {formatHourLabel(draft.dci_run_hour_local)} in {draft.dci_timezone}.
        </p>
      </CardContent>
    </Card>
  );
}

// ── Daily Brief — Card 2: Manual Run ─────────────────────────────────────────

function BriefManualRunCard({ draft, running, onRunNow }: {
  draft: PrepScheduleConfig; running: boolean; onRunNow: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Play className="h-4 w-4" /> Manual Run
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <LastRunLine at={draft.dci_last_run_at} status={draft.dci_last_run_status} />
        <Button variant="outline" onClick={onRunNow} disabled={running} className="gap-1.5">
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          Run now
        </Button>
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

// ── Meetings — Card: Inclusion rules (from calendar settings) ────────────────

function MeetingsInclusionRulesCard({ onNavigateToCalendar }: { onNavigateToCalendar?: () => void }) {
  const { toast } = useToast();
  const [userId, setUserId] = useState<string | null>(null);
  const [calendarConnected, setCalendarConnected] = useState<boolean | null>(null);
  const [draftRules, setDraftRules] = useState<CalendarSyncRules>(DEFAULT_SYNC_RULES);
  const [savingRules, setSavingRules] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const [credsRes, settingsRes] = await Promise.all([
        db.from('user_calendar_credentials_public').select('connected').maybeSingle(),
        db.from('cos_settings').select('calendar_sync_rules').eq('user_id', user.id).maybeSingle(),
      ]);
      setCalendarConnected(Boolean(credsRes.data?.connected));
      if (settingsRes.data?.calendar_sync_rules) {
        setDraftRules({ ...DEFAULT_SYNC_RULES, ...(settingsRes.data.calendar_sync_rules as Partial<CalendarSyncRules>) });
      }
    })();
  }, []);

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
      toast({ title: 'Inclusion rules saved' });
    } catch (err) {
      toast({ title: 'Save failed', description: String(err), variant: 'destructive' });
    } finally {
      setSavingRules(false);
    }
  };

  if (calendarConnected === null) return null;

  if (!calendarConnected) {
    return (
      <Card>
        <CardContent className="py-8 flex flex-col items-center gap-3 text-center">
          <Calendar className="h-8 w-8 text-muted-foreground/40" />
          <div>
            <p className="text-sm font-medium">Calendar not connected</p>
            <p className="text-[11px] text-muted-foreground mt-1 max-w-[280px]">
              Connect Google Calendar to configure which relationships and meeting titles are included in prep.
            </p>
          </div>
          {onNavigateToCalendar ? (
            <Button size="sm" variant="outline" onClick={onNavigateToCalendar} className="gap-1.5 mt-1">
              <ExternalLink className="h-3.5 w-3.5" /> Set up Calendar
            </Button>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Inclusion rules</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-[11px] text-muted-foreground">
          True 1:1s (you + one other person) are tracked automatically. Meetings with three or more
          people appear under Group meetings for you to opt in individually.
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
            onChange={e => setDraftRules(r => ({ ...r, include_titles_regex: e.target.value || null }))}
            placeholder="e.g. 1:1|sync|catch.?up"
            className="h-9 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium">Title must NOT match (regex, optional)</label>
          <Input
            value={draftRules.exclude_titles_regex ?? ''}
            onChange={e => setDraftRules(r => ({ ...r, exclude_titles_regex: e.target.value || null }))}
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
  );
}

// ── Exported panels ───────────────────────────────────────────────────────────

export function MeetingsPrepPanel() {
  const { draft, update, runningPrep, runPrepNow, prepLogs, loadPrepLogs, userId, loading } = usePanelState();
  if (loading || !draft) return null;

  const latestLogHasError = prepLogs.length > 0 &&
    (prepLogs[0].status === 'failed' || (prepLogs[0].errors?.length ?? 0) > 0);

  return (
    <Tabs defaultValue="schedule">
      <TabsList className="mb-4">
        <TabsTrigger value="schedule">Schedule</TabsTrigger>
        <TabsTrigger value="scope">Scope</TabsTrigger>
        <TabsTrigger value="tools">Tools</TabsTrigger>
        <TabsTrigger value="agent">Agent</TabsTrigger>
        <TabsTrigger value="logs" className="relative">
          Logs
          {latestLogHasError && (
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-red-500" />
          )}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="schedule" className="space-y-4">
        <MeetingsScheduleCard draft={draft} update={update} />
        <MeetingsManualRunCard draft={draft} running={runningPrep} onRunNow={runPrepNow} />
      </TabsContent>

      <TabsContent value="scope" className="space-y-4">
        <MeetingsScopeCard draft={draft} update={update} />
        <MeetingsInclusionRulesCard />
      </TabsContent>

      <TabsContent value="tools" className="space-y-4">
        <MeetingsToolsCard draft={draft} update={update} userId={userId} />
        <MeetingsToolTiersCard draft={draft} update={update} />
      </TabsContent>

      <TabsContent value="agent">
        <AgentSettingsPanel />
      </TabsContent>

      <TabsContent value="logs">
        <MeetingsLogsCard logs={prepLogs} userId={userId} onRefresh={() => userId && loadPrepLogs(userId)} />
      </TabsContent>
    </Tabs>
  );
}

export function DailyBriefPanel() {
  const { draft, update, runningBrief, runBriefNow, userId, loading } = usePanelState();
  if (loading || !draft) return null;
  return (
    <Tabs defaultValue="schedule">
      <TabsList className="mb-4">
        <TabsTrigger value="schedule">Schedule</TabsTrigger>
        <TabsTrigger value="sources">Sources</TabsTrigger>
        <TabsTrigger value="logs">Logs</TabsTrigger>
      </TabsList>

      <TabsContent value="schedule" className="space-y-4">
        <BriefScheduleCard draft={draft} update={update} />
        <BriefManualRunCard draft={draft} running={runningBrief} onRunNow={runBriefNow} />
      </TabsContent>

      <TabsContent value="sources">
        <BriefSourcesCard draft={draft} update={update} />
      </TabsContent>

      <TabsContent value="logs">
        <BriefLogsCard userId={userId} />
      </TabsContent>
    </Tabs>
  );
}

// ── Default export (legacy — both sections on one page) ───────────────────────

export default function CosPrepSchedulePanel() {
  const { draft, update, runningPrep, runPrepNow, runningBrief, runBriefNow, prepLogs, loadPrepLogs, userId, loading } = usePanelState();
  if (loading || !draft) return null;
  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <CalendarClock className="h-4 w-4" /> Meetings
          </h3>
        </div>
        <MeetingsScheduleCard draft={draft} update={update} />
        <MeetingsManualRunCard draft={draft} running={runningPrep} onRunNow={runPrepNow} />
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
        <BriefScheduleCard draft={draft} update={update} />
        <BriefManualRunCard draft={draft} running={runningBrief} onRunNow={runBriefNow} />
        <BriefSourcesCard draft={draft} update={update} />
        <BriefLogsCard userId={userId} />
      </section>
    </div>
  );
}
