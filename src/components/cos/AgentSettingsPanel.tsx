import React, { useEffect, useState, useCallback } from 'react';
import { Loader2, Bot, Bell, FileText, AlertTriangle, BarChart3, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cn } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────────

interface AgentConfig {
  enabled: boolean;
  nudge_actions: boolean;
  pre_stage_prep: boolean;
  escalate_patterns: boolean;
  recommend_format: boolean;
  nudge_timing_hours: number;
  quiet_hours_start: number;
  quiet_hours_end: number;
  timezone: string;
  slack_notifications: boolean;
}

const DEFAULT_AGENT_CONFIG: AgentConfig = {
  enabled: false,
  nudge_actions: true,
  pre_stage_prep: true,
  escalate_patterns: false,
  recommend_format: false,
  nudge_timing_hours: 24,
  quiet_hours_start: 18,
  quiet_hours_end: 9,
  timezone: 'America/New_York',
  slack_notifications: true,
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
}

export function AgentSettingsPanel({ className }: AgentSettingsPanelProps) {
  const { toast } = useToast();
  const [config, setConfig] = useState<AgentConfig>(DEFAULT_AGENT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [slackConnected, setSlackConnected] = useState(false);
  const [slackEmail, setSlackEmail] = useState<string | null>(null);

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
    <div className={cn('space-y-6', className)}>
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
            <Label className="text-sm font-semibold">Agentic Follow-Through</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              {config.enabled
                ? 'Agent is actively monitoring your 1:1s'
                : 'Enable to get proactive nudges and pre-staged prep'}
            </p>
          </div>
        </div>
        <Switch
          checked={config.enabled}
          onCheckedChange={enabled => update({ enabled })}
        />
      </div>

      {config.enabled && (
        <>
          {/* Feature toggles */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Features</h3>

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
              description="Auto-generate prep 24 hours before each 1:1"
              checked={config.pre_stage_prep}
              onChange={pre_stage_prep => update({ pre_stage_prep })}
            />

            <FeatureToggle
              icon={AlertTriangle}
              label="Escalation alerts"
              description="Flag patterns like chronic overdue items or missed meetings"
              checked={config.escalate_patterns}
              onChange={escalate_patterns => update({ escalate_patterns })}
              badge="Coming soon"
            />

            <FeatureToggle
              icon={BarChart3}
              label="Format recommendations"
              description="Suggest meeting format (full/async/skip) based on agenda density"
              checked={config.recommend_format}
              onChange={recommend_format => update({ recommend_format })}
              badge="Coming soon"
            />
          </div>

          {/* Timing */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Timing</h3>

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
          </div>

          {/* Notifications */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notifications</h3>

            <div className="flex items-center justify-between px-3 py-2.5 rounded-md border border-border bg-background">
              <div className="flex items-center gap-2">
                <span className="text-sm">Slack notifications</span>
                {slackConnected ? (
                  <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-emerald-200 text-emerald-700">
                    Connected{slackEmail ? ` as ${slackEmail}` : ''}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-amber-200 text-amber-600">
                    Not connected
                  </Badge>
                )}
              </div>
              <Switch
                checked={config.slack_notifications}
                onCheckedChange={slack_notifications => update({ slack_notifications })}
                disabled={!slackConnected}
              />
            </div>
            {!slackConnected && config.slack_notifications && (
              <p className="text-[10px] text-amber-600 px-3">
                Connect Slack in Settings to receive notifications.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

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
