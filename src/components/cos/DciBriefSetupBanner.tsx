import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles, CheckCircle2, Loader2, X, Clock, MessageSquare,
  ChevronDown, ChevronUp, Settings2, Calendar, Video, ListChecks, Target, TrendingUp,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { formatHourLabel } from '@/hooks/usePrepScheduleConfig';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALL_SOURCES = [
  { key: 'my_lists', label: 'My Lists', description: 'Your active priorities and flagged items', icon: ListChecks, alwaysOn: true },
  { key: 'rcdo', label: 'RCDO Objectives', description: 'Quarterly strategy and initiatives', icon: Target },
  { key: 'calendar', label: 'Calendar', description: "Today's meetings and attendees", icon: Calendar },
  { key: 'slack', label: 'Slack', description: 'Recent DMs and channel messages', icon: MessageSquare },
  { key: 'zoom', label: 'Zoom', description: 'Meeting recordings and AI summaries', icon: Video },
  { key: 'commitments', label: 'Commitments', description: 'Quarterly priorities and monthly goals', icon: TrendingUp },
] as const;

const INTERNAL_SOURCE_KEYS = ['my_lists', 'rcdo', 'commitments'];
const EXTERNAL_SOURCE_KEYS = ['calendar', 'slack', 'zoom'];

const DEFAULT_SOURCES = ALL_SOURCES.map(s => s.key);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BannerState = 'loading' | 'prompt' | 'enabled' | 'dismissed';

interface DciBriefSetupBannerProps {
  onStateChange?: (enabled: boolean) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DciBriefSetupBanner({ onStateChange }: DciBriefSetupBannerProps) {
  const { toast } = useToast();
  const [state, setState] = useState<BannerState>('loading');
  const [slackDm, setSlackDm] = useState(true);
  const [enabling, setEnabling] = useState(false);
  const [runningNow, setRunningNow] = useState(false);
  const [runHourLocal, setRunHourLocal] = useState<number | null>(null);
  const [lastRunStatus, setLastRunStatus] = useState<string | null>(null);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [hasSlackConnected, setHasSlackConnected] = useState(false);
  const [firstRunDone, setFirstRunDone] = useState(false);

  // Sources & instructions
  const [sources, setSources] = useState<string[]>([...DEFAULT_SOURCES]);
  const [instructions, setInstructions] = useState('');
  const [showCustomize, setShowCustomize] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // ── Load current state ──────────────────────────────────────────────────

  useEffect(() => {
    async function check() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const [scheduleRes, slackRes] = await Promise.all([
        db.from('cos_prep_schedule')
          .select('dci_enabled, dci_slack_dm, dci_sources, dci_instructions, dci_last_run_at, dci_last_run_status, run_hour_local')
          .eq('user_id', user.id)
          .maybeSingle(),
        db.from('user_slack_credentials')
          .select('access_token')
          .eq('user_id', user.id)
          .maybeSingle(),
      ]);

      setHasSlackConnected(Boolean(slackRes.data?.access_token));

      const schedule = scheduleRes.data as {
        dci_enabled: boolean; dci_slack_dm: boolean;
        dci_sources: string[] | null; dci_instructions: string | null;
        dci_last_run_at: string | null; dci_last_run_status: string | null;
        run_hour_local: number | null;
      } | null;

      if (schedule?.dci_sources) setSources(schedule.dci_sources);
      if (schedule?.dci_instructions) setInstructions(schedule.dci_instructions);

      if (schedule?.dci_enabled) {
        setState('enabled');
        setSlackDm(schedule.dci_slack_dm ?? true);
        setLastRunStatus(schedule.dci_last_run_status);
        setLastRunAt(schedule.dci_last_run_at);
        if (schedule.run_hour_local != null) setRunHourLocal(schedule.run_hour_local);
      } else {
        const dismissed = localStorage.getItem('dci-brief-banner-dismissed');
        setState(dismissed === 'true' ? 'dismissed' : 'prompt');
        if (schedule?.run_hour_local != null) setRunHourLocal(schedule.run_hour_local);
      }
    }
    check();
  }, []);

  // ── Toggle a source ─────────────────────────────────────────────────────

  const toggleSource = (key: string) => {
    setSources(prev =>
      prev.includes(key) ? prev.filter(s => s !== key) : [...prev, key]
    );
  };

  // ── Save settings (sources + instructions) ──────────────────────────────

  const saveSettings = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      await db.from('cos_prep_schedule')
        .update({
          dci_sources: sources,
          dci_instructions: instructions || null,
          dci_slack_dm: slackDm,
        })
        .eq('user_id', user.id);

      toast({ title: 'Settings saved' });
      setShowSettings(false);
    } catch (err) {
      toast({ title: 'Save failed', description: String(err), variant: 'destructive' });
    }
  }, [sources, instructions, slackDm, toast]);

  // ── Enable DCI briefs ───────────────────────────────────────────────────

  const enableDci = useCallback(async () => {
    setEnabling(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      await db.from('cos_prep_schedule').upsert({
        user_id: user.id,
        dci_enabled: true,
        dci_slack_dm: slackDm,
        dci_sources: sources,
        dci_instructions: instructions || null,
      }, { onConflict: 'user_id' });

      setState('enabled');
      onStateChange?.(true);
      localStorage.removeItem('dci-brief-banner-dismissed');
      toast({ title: 'Daily brief enabled', description: 'Your DCI brief will generate each morning.' });
    } catch (err) {
      toast({ title: 'Failed to enable', description: String(err), variant: 'destructive' });
    } finally {
      setEnabling(false);
    }
  }, [slackDm, sources, instructions, toast, onStateChange]);

  // ── Run now ─────────────────────────────────────────────────────────────

  const runNow = useCallback(async () => {
    setRunningNow(true);
    try {
      if (state !== 'enabled') await enableDci();
      const res = await supabase.functions.invoke('generate-dci-brief', { body: {} });
      if (res.error) throw res.error;
      setFirstRunDone(true);
      setLastRunStatus('ok');
      setLastRunAt(new Date().toISOString());
      toast({ title: 'DCI brief generated', description: 'Check the weekly matrix below.' });
    } catch (err) {
      toast({ title: 'Generation failed', description: String(err), variant: 'destructive' });
    } finally {
      setRunningNow(false);
    }
  }, [state, enableDci, toast]);

  // ── Disable ─────────────────────────────────────────────────────────────

  const disableDci = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      await db.from('cos_prep_schedule').update({ dci_enabled: false }).eq('user_id', user.id);
      setState('prompt');
      onStateChange?.(false);
      toast({ title: 'Daily brief disabled' });
    } catch (err) {
      toast({ title: 'Failed', description: String(err), variant: 'destructive' });
    }
  }, [toast, onStateChange]);

  // ── Toggle Slack DM (live save when enabled) ────────────────────────────

  const toggleSlackDm = useCallback(async (checked: boolean) => {
    setSlackDm(checked);
    if (state !== 'enabled') return; // Will be saved on enable
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      await db.from('cos_prep_schedule').update({ dci_slack_dm: checked }).eq('user_id', user.id);
    } catch {
      setSlackDm(!checked);
    }
  }, [state]);

  // ── Dismiss ─────────────────────────────────────────────────────────────

  const dismiss = () => {
    setState('dismissed');
    localStorage.setItem('dci-brief-banner-dismissed', 'true');
  };

  // ── Shared: Source picker + Instructions ────────────────────────────────

  const SourcesAndInstructions = ({ compact }: { compact?: boolean }) => {
    const renderSourceGroup = (keys: string[]) =>
      ALL_SOURCES.filter(s => keys.includes(s.key)).map(src => {
        const Icon = src.icon;
        const checked = sources.includes(src.key);
        const isAlwaysOn = 'alwaysOn' in src && src.alwaysOn;
        return (
          <label
            key={src.key}
            className={cn(
              'flex items-center gap-2 rounded-md border px-2.5 py-1.5 cursor-pointer transition-colors',
              checked
                ? 'border-primary/30 bg-primary/[0.03]'
                : 'border-transparent bg-muted/30 hover:bg-muted/50',
              isAlwaysOn && 'opacity-70 cursor-default',
            )}
          >
            <Checkbox
              checked={checked}
              onCheckedChange={() => !isAlwaysOn && toggleSource(src.key)}
              disabled={isAlwaysOn}
              className="shrink-0"
            />
            <div className="flex items-center gap-1.5 min-w-0">
              <Icon className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="text-xs font-medium">{src.label}</span>
            </div>
          </label>
        );
      });

    return (
    <div className={cn('space-y-4', compact && 'space-y-3')}>
      {/* Source checkboxes */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Data sources
        </p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-0">
          <div className="space-y-1">
            <p className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wide pb-0.5">In TacticalSync</p>
            <div className="space-y-1">{renderSourceGroup(INTERNAL_SOURCE_KEYS)}</div>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wide pb-0.5">External</p>
            <div className="space-y-1">{renderSourceGroup(EXTERNAL_SOURCE_KEYS)}</div>
          </div>
        </div>
      </div>

      {/* Custom instructions */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Guidance for the AI
        </p>
        <Textarea
          value={instructions}
          onChange={e => setInstructions(e.target.value)}
          placeholder="e.g. Focus on launch readiness and engineering blockers. Always include ClearGO migration status. My DCI standup is at 9am."
          className="min-h-[60px] text-xs resize-none"
          rows={2}
        />
        <p className="text-[10px] text-muted-foreground/60">
          Optional. These instructions are appended to every brief generation.
        </p>
      </div>
    </div>
    );
  };

  // ── Render: Loading / Dismissed ─────────────────────────────────────────

  if (state === 'loading' || state === 'dismissed') return null;

  // ── Render: Enabled state ───────────────────────────────────────────────

  if (state === 'enabled') {
    const timeLabel = runHourLocal != null ? formatHourLabel(runHourLocal) : 'your scheduled time';
    const lastRunLabel = lastRunAt
      ? new Date(lastRunAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : null;

    return (
      <div className="space-y-0">
        <div className="flex items-center justify-between rounded-lg border bg-emerald-50/50 dark:bg-emerald-950/10 border-emerald-200 dark:border-emerald-800 px-4 py-2.5">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
              <Sparkles className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
                Daily brief is on
              </p>
              <p className="text-xs text-emerald-600/70 dark:text-emerald-400/60">
                Generates at {timeLabel}
                {lastRunLabel && ` · Last run: ${lastRunLabel}`}
                {lastRunStatus === 'ok' && ' ✓'}
                {slackDm && hasSlackConnected && ' · Slack DM'}
                {` · ${sources.length} source${sources.length !== 1 ? 's' : ''}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowSettings(!showSettings)}
              className={cn('h-7 text-xs', showSettings && 'bg-muted')}
            >
              <Settings2 className="h-3.5 w-3.5 mr-1" />
              Settings
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={runNow}
              disabled={runningNow}
              className="h-7 text-xs border-emerald-300 dark:border-emerald-700"
            >
              {runningNow ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : firstRunDone ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                  Done
                </>
              ) : (
                'Run now'
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={disableDci}
              className="h-7 text-xs text-muted-foreground hover:text-destructive"
            >
              Turn off
            </Button>
          </div>
        </div>

        {/* Expanded settings panel */}
        {showSettings && (
          <Card className="mt-2 border-emerald-200/50 dark:border-emerald-800/50">
            <CardContent className="py-4 px-5 space-y-4">
              <SourcesAndInstructions compact />

              {/* Slack DM toggle */}
              {hasSlackConnected && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <Switch checked={slackDm} onCheckedChange={toggleSlackDm} className="scale-90" />
                  <span className="text-xs text-muted-foreground">Send me a Slack DM each morning</span>
                </label>
              )}

              <div className="flex items-center gap-2 pt-1">
                <Button size="sm" onClick={saveSettings}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setShowSettings(false)}>Cancel</Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // ── Render: Prompt state (onboarding card) ──────────────────────────────

  return (
    <Card className="border-dashed border-primary/30 bg-primary/[0.02]">
      <CardContent className="py-5 px-6">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Automate your morning brief</h3>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Get a DCI brief generated every morning before your day starts. It pulls from
                your lists, calendar, Slack, and Zoom to surface today's priorities and suggest
                a standup topic — so you can walk into DCI prepared.
              </p>
            </div>

            {/* Customize toggle */}
            <button
              onClick={() => setShowCustomize(!showCustomize)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {showCustomize ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              Customize sources & guidance
            </button>

            {/* Expanded customization */}
            {showCustomize && (
              <div className="rounded-lg border bg-muted/20 p-4">
                <SourcesAndInstructions />

                {/* Slack DM toggle */}
                {hasSlackConnected && (
                  <label className="flex items-center gap-2 cursor-pointer mt-4">
                    <Switch checked={slackDm} onCheckedChange={setSlackDm} className="scale-90" />
                    <span className="text-xs text-muted-foreground">Send me a Slack DM each morning</span>
                  </label>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                onClick={runNow}
                disabled={enabling || runningNow}
              >
                {runningNow ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-1.5" />
                    Enable & run now
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={enableDci}
                disabled={enabling || runningNow}
              >
                {enabling ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Clock className="h-4 w-4 mr-1.5" />
                    Start tomorrow
                  </>
                )}
              </Button>
              <Button size="sm" variant="ghost" onClick={dismiss} className="text-muted-foreground">
                Not now
              </Button>
            </div>
          </div>

          {/* Dismiss X */}
          <button
            onClick={dismiss}
            className="text-muted-foreground/50 hover:text-muted-foreground transition-colors shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
