import React, { useEffect, useState, useCallback } from 'react';
import { Loader2, Bot, Bell, FileText, AlertTriangle, BarChart3, Clock, Slack, Users, ArrowRight, Activity, Wrench, Hash, Video } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cn } from '@/lib/utils';
import { AgentActivityFeed } from './AgentActivityFeed';

// ── Types ──────────────────────────────────────────────────────────────────────

interface AgentConfig {
  enabled: boolean;
  nudge_actions: boolean;
  pre_stage_prep: boolean;
  escalate_patterns: boolean;
  recommend_format: boolean;
  recommend_tools: boolean;
  // User-facing on/off control for meeting-insight cards in the inbox
  // (distinct from any internal rollout gating) — plan §9.4.2.
  enable_meeting_insights: boolean;
  nudge_timing_hours: number;
  nudge_max_count: number;
  quiet_hours_start: number;
  quiet_hours_end: number;
  timezone: string;
}

const DEFAULT_AGENT_CONFIG: AgentConfig = {
  enabled: false,
  nudge_actions: true,
  pre_stage_prep: true,
  escalate_patterns: false,
  recommend_format: false,
  recommend_tools: false,
  enable_meeting_insights: false,
  nudge_timing_hours: 24,
  nudge_max_count: 5,
  quiet_hours_start: 18,
  quiet_hours_end: 9,
  timezone: 'America/New_York',
};

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Australia/Sydney',
];

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function formatHour(h: number): string {
  if (h === 0) return '12 AM';
  if (h < 12) return `${h} AM`;
  if (h === 12) return '12 PM';
  return `${h - 12} PM`;
}

// ── Component ──────────────────────────────────────────────────────────────────

interface AgentSettingsPanelProps {
  className?: string;
  /** Allows the panel to jump the user to another Settings section (e.g. Slack). */
  onNavigateToSection?: (section: string) => void;
}

export function AgentSettingsPanel({ className, onNavigateToSection }: AgentSettingsPanelProps) {
  const { toast } = useToast();
  const [config, setConfig] = useState<AgentConfig>(DEFAULT_AGENT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [slackConnected, setSlackConnected] = useState(false);
  const [slackEmail, setSlackEmail] = useState<string | null>(null);
  const [exceptionCount, setExceptionCount] = useState(0);

  // Load current config
  useEffect(() => {
    (async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) return;

        const { data: settings } = await (supabase as unknown as SupabaseClient)
          .from('cos_settings')
          .select('agent_config')
          .eq('user_id', userData.user.id)
          .maybeSingle();

        if (settings?.agent_config) {
          setConfig({ ...DEFAULT_AGENT_CONFIG, ...settings.agent_config });
        }

        // Check Slack connection
        const { data: slackCreds } = await (supabase as unknown as SupabaseClient)
          .from('user_slack_credentials_public')
          .select('connected, slack_email')
          .maybeSingle();

        setSlackConnected(slackCreds?.connected === true);
        setSlackEmail(slackCreds?.slack_email ?? null);

        // Count per-person exceptions (members with any agent override turned off)
        const { data: members } = await (supabase as unknown as SupabaseClient)
          .from('cos_team_members')
          .select('agent_overrides')
          .eq('user_id', userData.user.id);

        const exceptions = ((members ?? []) as Array<{ agent_overrides: Record<string, unknown> | null }>)
          .filter(m => {
            const o = m.agent_overrides ?? {};
            return o.auto_prep === false || o.nudge_actions === false;
          }).length;
        setExceptionCount(exceptions);
      } catch (err) {
        console.error('Failed to load agent settings:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = useCallback(async (newConfig: AgentConfig) => {
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      await (supabase as unknown as SupabaseClient)
        .from('cos_settings')
        .upsert({
          user_id: userData.user.id,
          agent_config: newConfig,
        }, { onConflict: 'user_id' });

      toast({ title: 'Agent settings saved' });
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }, [toast]);

  const update = useCallback((patch: Partial<AgentConfig>) => {
    setConfig(prev => {
      const next = { ...prev, ...patch };
      save(next);
      return next;
    });
  }, [save]);

  if (loading) {
    return (
      <div className={cn('flex items-center justify-center py-12', className)}>
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={cn('space-y-8', className)}>
      {/* ── Group 1: Activation ─────────────────────────────────────────── */}
      <SettingsGroup
        title="Activation"
        description="Turn the Agent on and make sure it has a way to reach you."
      >
        {/* Master toggle */}
        <div className="flex items-center justify-between p-4 rounded-lg border border-border bg-card">
          <div className="flex items-center gap-3">
            <div className={cn(
              'h-9 w-9 rounded-lg flex items-center justify-center',
              config.enabled ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
            )}>
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <Label className="text-sm font-semibold">Agent</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {config.enabled
                  ? 'Active — working between your 1:1s'
                  : 'Enable to get proactive nudges and pre-staged prep'}
              </p>
            </div>
          </div>
          <Switch
            checked={config.enabled}
            onCheckedChange={enabled => update({ enabled })}
          />
        </div>

        {/* Slack prerequisite — guided step */}
        <div className={cn(
          'flex items-center justify-between px-4 py-3 rounded-lg border',
          slackConnected
            ? 'border-border bg-background'
            : 'border-amber-200 bg-amber-50/50',
        )}>
          <div className="flex items-center gap-3">
            <div className={cn(
              'h-8 w-8 rounded-md flex items-center justify-center',
              slackConnected ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600',
            )}>
              <Slack className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Slack delivery</span>
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[9px] h-4 px-1.5',
                    slackConnected
                      ? 'border-emerald-200 text-emerald-700'
                      : 'border-amber-300 text-amber-700',
                  )}
                >
                  {slackConnected
                    ? `Connected${slackEmail ? ` as ${slackEmail}` : ''}`
                    : 'Required'}
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {slackConnected
                  ? 'Nudges and alerts will be delivered to your Slack DMs.'
                  : 'The Agent reaches you over Slack. Connect it so nudges and alerts can be delivered.'}
              </p>
            </div>
          </div>
          {!slackConnected && (
            <Button
              size="sm"
              variant="outline"
              className="flex-shrink-0 gap-1.5"
              onClick={() => onNavigateToSection?.('slack-sync')}
            >
              Connect Slack
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </SettingsGroup>

      {config.enabled && (
        <>
          {/* ── Group 2: What the agent does ──────────────────────────────── */}
          <SettingsGroup
            title="What the Agent does"
            description="These are team-wide defaults. You can override prep and nudges for individual people from each 1:1's prep panel."
          >
            <FeatureToggle
              icon={Bell}
              label="Nudge on overdue actions"
              description="Get a Slack DM when action items approach or pass their due date"
              checked={config.nudge_actions}
              onChange={nudge_actions => update({ nudge_actions })}
            />

            <FeatureToggle
              icon={FileText}
              label="Pre-stage meeting prep"
              description="Auto-generate prep ahead of each 1:1 (timing set below)"
              checked={config.pre_stage_prep}
              onChange={pre_stage_prep => update({ pre_stage_prep })}
            />

            <FeatureToggle
              icon={AlertTriangle}
              label="Escalation alerts"
              description="Flag patterns like chronic overdue items, missed meetings, or stalled topics"
              checked={config.escalate_patterns}
              onChange={escalate_patterns => update({ escalate_patterns })}
            />

            <FeatureToggle
              icon={BarChart3}
              label="Format recommendations"
              description="Suggest meeting format (full / async / skip) based on agenda density"
              checked={config.recommend_format}
              onChange={recommend_format => update({ recommend_format })}
            />

            <FeatureToggle
              icon={Wrench}
              label="Tool recommendations"
              description="Suggest which data sources to attach to each 1:1's prep, shown in the prep panel"
              checked={config.recommend_tools}
              onChange={recommend_tools => update({ recommend_tools })}
            />

            <FeatureToggle
              icon={Video}
              label="Meeting insights"
              description="Surface standout quotes from your meeting recordings in the inbox to confirm, save, or dismiss"
              checked={config.enable_meeting_insights}
              onChange={enable_meeting_insights => update({ enable_meeting_insights })}
            />

            {/* Per-person exceptions summary */}
            <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-md border border-dashed border-border bg-muted/30">
              <Users className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <p className="text-[11px] text-muted-foreground">
                {exceptionCount > 0 ? (
                  <>
                    <span className="font-medium text-foreground">
                      {exceptionCount} {exceptionCount === 1 ? 'person has' : 'people have'} custom Agent settings
                    </span>{' '}
                    that override these defaults. Adjust them from each person's 1:1 prep panel.
                  </>
                ) : (
                  <>Need an exception for someone? You can turn prep or nudges off for an individual from their 1:1 prep panel.</>
                )}
              </p>
            </div>
          </SettingsGroup>

          {/* ── Group 3: Slack actions ────────────────────────────────────── */}
          {slackConnected && (
            <SettingsGroup
              title="Slack actions"
              description="Use these slash commands from any Slack channel or DM to send items straight into TacticalSync."
              icon={Hash}
            >
              <div className="flex items-start gap-3 px-3 py-3 rounded-md border border-border bg-background">
                <div className="flex-shrink-0 mt-0.5 h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center">
                  <Slack className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">/add-to-my-lists</code>
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5">Active</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Run this command from Slack to capture a thought, link, or note and send it directly to your <span className="font-medium text-foreground">My Lists</span> inbox — without leaving the conversation.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 px-3 py-3 rounded-md border border-border bg-background">
                <div className="flex-shrink-0 mt-0.5 h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center">
                  <Slack className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">/add-to-1on1 @name topic</code>
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5">Active</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Queue a topic for an upcoming 1:1 — mention <span className="font-medium text-foreground">@name</span> and describe the topic. It will surface in the prep brief for that meeting.
                  </p>
                </div>
              </div>
            </SettingsGroup>
          )}

          {/* ── Group 4: When it contacts you ─────────────────────────────── */}
          <SettingsGroup
            title="When it contacts you"
            description="Control delivery channel, timing, and quiet hours."
          >
            {/* Link to the consolidated Notifications settings page */}
            <div className="flex items-center justify-between px-3 py-2.5 rounded-md border border-dashed border-border bg-muted/30">
              <p className="text-[11px] text-muted-foreground">
                Which alerts get sent to Slack is managed on the <span className="font-medium text-foreground">Notifications</span> settings page.
              </p>
              <Button
                size="sm"
                variant="ghost"
                className="flex-shrink-0 gap-1.5 h-7 text-xs"
                onClick={() => onNavigateToSection?.('notifications')}
              >
                Manage
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Timezone</Label>
                <Select
                  value={config.timezone}
                  onValueChange={timezone => update({ timezone })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES.map(tz => (
                      <SelectItem key={tz} value={tz} className="text-xs">
                        {tz.replace('_', ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Nudge lead time</Label>
                <Select
                  value={String(config.nudge_timing_hours)}
                  onValueChange={v => update({ nudge_timing_hours: Number(v) })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="12" className="text-xs">12 hours before</SelectItem>
                    <SelectItem value="24" className="text-xs">24 hours before</SelectItem>
                    <SelectItem value="48" className="text-xs">48 hours before</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Stop nudging after</Label>
                <Select
                  value={String(config.nudge_max_count)}
                  onValueChange={v => update({ nudge_max_count: Number(v) })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3" className="text-xs">3 reminders</SelectItem>
                    <SelectItem value="5" className="text-xs">5 reminders</SelectItem>
                    <SelectItem value="7" className="text-xs">7 reminders</SelectItem>
                    <SelectItem value="10" className="text-xs">10 reminders</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Quiet hours start</Label>
                <Select
                  value={String(config.quiet_hours_start)}
                  onValueChange={v => update({ quiet_hours_start: Number(v) })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <Clock className="h-3 w-3 mr-1 text-muted-foreground" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HOURS.map(h => (
                      <SelectItem key={h} value={String(h)} className="text-xs">
                        {formatHour(h)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Quiet hours end</Label>
                <Select
                  value={String(config.quiet_hours_end)}
                  onValueChange={v => update({ quiet_hours_end: Number(v) })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <Clock className="h-3 w-3 mr-1 text-muted-foreground" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HOURS.map(h => (
                      <SelectItem key={h} value={String(h)} className="text-xs">
                        {formatHour(h)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </SettingsGroup>

          {/* ── Recent activity (co-located outcomes) ─────────────────────── */}
          <SettingsGroup
            title="Recent activity"
            description="What the Agent has done on your behalf."
            icon={Activity}
          >
            <AgentActivityFeed />
          </SettingsGroup>
        </>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SettingsGroup({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description?: string;
  icon?: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          {Icon && <Icon className="h-3.5 w-3.5" />}
          {title}
        </h3>
        {description && (
          <p className="text-[11px] text-muted-foreground/80 mt-1">{description}</p>
        )}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function FeatureToggle({
  icon: Icon,
  label,
  description,
  checked,
  onChange,
  badge,
}: {
  icon: React.ElementType;
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  badge?: string;
}) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5 rounded-md border border-border bg-background">
      <div className="flex items-start gap-2.5">
        <Icon className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{label}</span>
            {badge && (
              <Badge variant="outline" className="text-[8px] h-3.5 px-1 border-muted-foreground/30 text-muted-foreground">
                {badge}
              </Badge>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        disabled={!!badge}
      />
    </div>
  );
}
