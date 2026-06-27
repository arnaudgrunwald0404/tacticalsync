import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar, CheckCircle2, Loader2, Sparkles, Clock,
  MessageSquare, Video, ChevronRight, Plus, X, Plug,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { formatHourLabel, getBrowserTimezone } from '@/hooks/usePrepScheduleConfig';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RecurringMeeting {
  title: string;
  attendee_emails: string[];
  attendee_names: string[];
  occurrence_count: number;
  is_true_one_on_one: boolean;
  included: boolean;
}

interface IntegrationStatus {
  calendar: boolean;
  zoom: boolean;
  slack: boolean;
  stackone_accounts: string[];  // provider names like "jira", "salesforce"
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STEPS = [
  { label: 'Calendar', shortLabel: 'Calendar' },
  { label: 'Meetings', shortLabel: 'Meetings' },
  { label: 'Sources', shortLabel: 'Sources' },
  { label: 'Schedule', shortLabel: 'Schedule' },
] as const;

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface PrepSetupWizardProps {
  onComplete: () => void;
  /** If calendar is already connected (e.g. from previous setup), skip to step 2 */
  calendarAlreadyConnected?: boolean;
}

export default function PrepSetupWizard({ onComplete, calendarAlreadyConnected }: PrepSetupWizardProps) {
  const { toast } = useToast();
  const [step, setStep] = useState(calendarAlreadyConnected ? 1 : 0);
  const [userId, setUserId] = useState<string | null>(null);

  // Step 1: Calendar
  const [calendarConnected, setCalendarConnected] = useState(calendarAlreadyConnected ?? false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ created: number; updated: number } | null>(null);

  // Step 2: Meetings
  const [meetings, setMeetings] = useState<RecurringMeeting[]>([]);
  const [loadingMeetings, setLoadingMeetings] = useState(false);

  // Step 3: Integrations
  const [integrations, setIntegrations] = useState<IntegrationStatus>({
    calendar: calendarAlreadyConnected ?? false,
    zoom: false,
    slack: false,
    stackone_accounts: [],
  });
  const [connectingZoom, setConnectingZoom] = useState(false);
  const [connectingSlack, setConnectingSlack] = useState(false);

  // Step 4: Schedule
  const [runHourLocal, setRunHourLocal] = useState(7);
  const [slackChannels, setSlackChannels] = useState<string[]>([]);
  const [newChannel, setNewChannel] = useState('');
  const [saving, setSaving] = useState(false);
  const [runningNow, setRunningNow] = useState(false);
  const [firstRunResult, setFirstRunResult] = useState<{ preps: number } | null>(null);

  // ── Init: Load user + check existing integrations ─────────────────────

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;

      const [calRes, zoomRes, slackRes, stackRes] = await Promise.all([
        db.from('user_calendar_credentials_public').select('connected').maybeSingle(),
        db.from('user_zoom_credentials').select('access_token').eq('user_id', user.id).maybeSingle(),
        db.from('user_slack_credentials').select('access_token').eq('user_id', user.id).maybeSingle(),
        supabase.functions.invoke('stackone-proxy', { body: { action: 'list_accounts' } }).catch(() => null),
      ]);

      const calConnected = calRes.data?.connected ?? false;
      const zoomConnected = Boolean(zoomRes.data?.access_token);
      const slackConnected = Boolean(slackRes.data?.access_token);

      let stackAccounts: string[] = [];
      if (stackRes?.data?.accounts) {
        stackAccounts = (stackRes.data.accounts as Array<{ provider: string; status: string }>)
          .filter(a => a.status === 'active')
          .map(a => a.provider);
      }

      setCalendarConnected(calConnected);
      setIntegrations({
        calendar: calConnected,
        zoom: zoomConnected,
        slack: slackConnected,
        stackone_accounts: stackAccounts,
      });

      if (calConnected && step === 0) {
        setStep(1);
      }
    }
    init();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handle OAuth callbacks from redirects ──────────────────────────────

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (params.get('calendar') === 'connected') {
      setCalendarConnected(true);
      setIntegrations(prev => ({ ...prev, calendar: true }));
      triggerCalendarSync();
      window.history.replaceState(null, '', window.location.pathname);
    }
    if (params.get('zoom') === 'connected') {
      setIntegrations(prev => ({ ...prev, zoom: true }));
      setStep(2); // Return to sources step
      window.history.replaceState(null, '', window.location.pathname);
    }
    if (params.get('slack') === 'connected') {
      setIntegrations(prev => ({ ...prev, slack: true }));
      setStep(2); // Return to sources step
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Calendar sync ──────────────────────────────────────────────────────

  const triggerCalendarSync = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await supabase.functions.invoke('google-calendar-sync', { body: {} });
      if (res.error) throw res.error;
      const data = res.data as { created?: number; updated?: number };
      setSyncResult({ created: data.created ?? 0, updated: data.updated ?? 0 });
    } catch (err) {
      toast({ title: 'Calendar sync failed', description: String(err), variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  }, [toast]);

  // ── Load recurring meetings for Step 2 ─────────────────────────────────

  const loadRecurringMeetings = useCallback(async () => {
    if (!userId) return;
    setLoadingMeetings(true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const { data: events } = await db
      .from('cos_one_on_one_events')
      .select('title, attendee_email, attendee_name, attendee_emails, inferred_category')
      .eq('user_id', userId)
      .neq('status', 'cancelled');

    if (!events) {
      setLoadingMeetings(false);
      return;
    }

    // Group by title, deduplicate
    const byTitle = new Map<string, {
      attendee_emails: Set<string>;
      attendee_names: Map<string, string>;
      count: number;
    }>();

    for (const evt of events as Array<{
      title: string | null; attendee_email: string | null;
      attendee_name: string | null; attendee_emails: string[] | null;
    }>) {
      const title = evt.title ?? 'Untitled';
      if (!byTitle.has(title)) {
        byTitle.set(title, { attendee_emails: new Set(), attendee_names: new Map(), count: 0 });
      }
      const group = byTitle.get(title)!;
      group.count++;
      const emails = evt.attendee_emails ?? (evt.attendee_email ? [evt.attendee_email] : []);
      for (const email of emails) {
        group.attendee_emails.add(email.toLowerCase());
        if (evt.attendee_name) group.attendee_names.set(email.toLowerCase(), evt.attendee_name);
      }
    }

    const result: RecurringMeeting[] = [];
    for (const [title, group] of byTitle) {
      if (group.count < 2) continue; // Only recurring meetings
      const emailsArray = Array.from(group.attendee_emails);
      const namesArray = emailsArray.map(e => group.attendee_names.get(e) ?? e.split('@')[0]);
      const isTrueOneOnOne = emailsArray.length === 1;

      result.push({
        title,
        attendee_emails: emailsArray,
        attendee_names: namesArray,
        occurrence_count: group.count,
        is_true_one_on_one: isTrueOneOnOne,
        included: isTrueOneOnOne, // True 1:1s auto-included
      });
    }

    // Sort: true 1:1s first, then by occurrence count
    result.sort((a, b) => {
      if (a.is_true_one_on_one !== b.is_true_one_on_one) return a.is_true_one_on_one ? -1 : 1;
      return b.occurrence_count - a.occurrence_count;
    });

    setMeetings(result);
    setLoadingMeetings(false);
  }, [userId]);

  // Load meetings when entering step 2
  useEffect(() => {
    if (step === 1 && meetings.length === 0 && userId) {
      loadRecurringMeetings();
    }
  }, [step, meetings.length, userId, loadRecurringMeetings]);

  // ── OAuth connect functions ────────────────────────────────────────────

  const connectCalendar = async () => {
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

  const connectZoom = async () => {
    setConnectingZoom(true);
    const clientId = import.meta.env.VITE_ZOOM_CLIENT_ID;
    const redirectUri = `${window.location.origin}/chief-of-staff?zoom=connected`;
    const scopes = 'user:read:user meeting:read:list_meetings meeting:read:meeting cloud_recording:read:list_user_recordings cloud_recording:read:list_recording_files meeting:read:summary meeting:read:list_past_instances';
    const zoomAuthUrl = `https://zoom.us/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}`;
    window.location.href = zoomAuthUrl;
  };

  const connectSlack = async () => {
    setConnectingSlack(true);
    const clientId = import.meta.env.VITE_SLACK_CLIENT_ID;
    const redirectUri = `${window.location.origin}/chief-of-staff?slack=connected`;
    const scopes = 'chat:write,users:read,users:read.email,channels:read,channels:history,groups:read,groups:history,im:read,im:history,im:write';
    const slackAuthUrl = `https://slack.com/oauth/v2/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    window.location.href = slackAuthUrl;
  };

  // ── Save schedule + run ────────────────────────────────────────────────

  const saveAndEnable = async () => {
    if (!userId) return;
    setSaving(true);

    try {
      // Build always_include from selected non-1:1 meetings' attendee names
      const alwaysInclude: string[] = [];
      for (const m of meetings) {
        if (m.included && !m.is_true_one_on_one) {
          alwaysInclude.push(...m.attendee_names);
        }
      }
      // Deduplicate
      const uniqueNames = [...new Set(alwaysInclude)];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      await db.from('cos_prep_schedule').upsert({
        user_id: userId,
        enabled: true,
        run_hour_local: runHourLocal,
        timezone: getBrowserTimezone(),
        always_include: uniqueNames,
        max_others_after_exclude: 1,
        sync_zoom_before: integrations.zoom,
        sync_slack_before: integrations.slack,
        slack_channels: slackChannels,
        enrich_stackone: integrations.stackone_accounts.length > 0,
      }, { onConflict: 'user_id' });

      toast({ title: 'Prep schedule saved' });
    } catch (err) {
      toast({ title: 'Save failed', description: String(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    setRunningNow(true);
    try {
      await saveAndEnable();
      const res = await supabase.functions.invoke('daily-prep-batch', { body: {} });
      if (res.error) throw res.error;
      const data = res.data as { total_preps_generated?: number };
      setFirstRunResult({ preps: data.total_preps_generated ?? 0 });
    } catch (err) {
      toast({ title: 'Run failed', description: String(err), variant: 'destructive' });
    } finally {
      setRunningNow(false);
    }
  };

  // ── Toggle meeting inclusion ───────────────────────────────────────────

  const toggleMeeting = (index: number) => {
    setMeetings(prev => prev.map((m, i) =>
      i === index ? { ...m, included: !m.included } : m
    ));
  };

  // ── Slack channel management ───────────────────────────────────────────

  const addChannel = () => {
    const ch = newChannel.trim().replace(/^#/, '');
    if (ch && !slackChannels.includes(ch)) {
      setSlackChannels(prev => [...prev, ch]);
    }
    setNewChannel('');
  };

  const removeChannel = (ch: string) => {
    setSlackChannels(prev => prev.filter(c => c !== ch));
  };

  // ── Progress ───────────────────────────────────────────────────────────

  const progressPercent = ((step + 1) / STEPS.length) * 100;
  const connectedCount = [integrations.calendar, integrations.zoom, integrations.slack].filter(Boolean).length
    + (integrations.stackone_accounts.length > 0 ? 1 : 0);

  // ── Success state ──────────────────────────────────────────────────────

  if (firstRunResult) {
    return (
      <Card className="border-2 border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/20">
        <CardContent className="py-12 text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
            <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Your mornings just got easier</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {firstRunResult.preps > 0
                ? `${firstRunResult.preps} brief${firstRunResult.preps !== 1 ? 's' : ''} ready for today.`
                : 'No meetings found for today. Briefs will generate before tomorrow\'s meetings.'}
            </p>
          </div>
          <div className="flex items-center justify-center gap-3">
            <Button onClick={onComplete}>
              {firstRunResult.preps > 0 ? 'View briefs' : 'Done'}
            </Button>
            <Button variant="ghost" size="sm" onClick={onComplete}>
              Adjust in Settings
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          {STEPS.map((s, i) => (
            <span
              key={s.label}
              className={cn(
                'transition-colors',
                i <= step ? 'text-foreground font-medium' : ''
              )}
            >
              {s.shortLabel}
            </span>
          ))}
        </div>
        <Progress value={progressPercent} className="h-1.5" />
      </div>

      {/* ── Step 1: Connect Calendar ─────────────────────────────────── */}
      {step === 0 && (
        <Card>
          <CardContent className="pt-8 pb-8 space-y-6">
            <div className="text-center space-y-2">
              <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Calendar className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-xl font-semibold">Sync my calendar</h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                We'll find your 1:1 meetings automatically. This is the only required step
                — everything else makes your briefs richer.
              </p>
            </div>

            {calendarConnected ? (
              <div className="text-center space-y-4">
                <div className="flex items-center justify-center gap-2 text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-medium">Calendar connected</span>
                </div>
                {syncing && (
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Syncing your meetings...
                  </div>
                )}
                {syncResult && (
                  <p className="text-sm text-muted-foreground">
                    Found {syncResult.created + syncResult.updated} meeting{syncResult.created + syncResult.updated !== 1 ? 's' : ''}
                  </p>
                )}
                <Button onClick={() => setStep(1)}>
                  Continue <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="text-center">
                <Button size="lg" onClick={connectCalendar}>
                  <Calendar className="mr-2 h-4 w-4" />
                  Sync my calendar
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Step 2: Additional meetings ──────────────────────────────── */}
      {step === 1 && (
        <Card>
          <CardContent className="pt-8 pb-8 space-y-6">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">Additional meeting inclusion</h2>
              <p className="text-sm text-muted-foreground">
                True 1:1s are included automatically. Select any group meetings below
                that you'd also like briefs for.
              </p>
            </div>

            {loadingMeetings ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading your recurring meetings...
              </div>
            ) : (
              <div className="space-y-4">
                {/* True 1:1s — auto-included, shown for confirmation */}
                {meetings.filter(m => m.is_true_one_on_one).length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Your 1:1s (included automatically)
                    </p>
                    <div className="space-y-1">
                      {meetings.filter(m => m.is_true_one_on_one).map((m, i) => (
                        <div
                          key={`1on1-${i}`}
                          className="flex items-center gap-3 px-3 py-2 rounded-md bg-muted/50"
                        >
                          <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium truncate block">{m.title}</span>
                            <span className="text-xs text-muted-foreground">
                              {m.attendee_names[0]}
                            </span>
                          </div>
                          <Badge variant="secondary" className="text-xs shrink-0">
                            {m.occurrence_count}x
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Group meetings — toggleable */}
                {meetings.filter(m => !m.is_true_one_on_one).length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Group meetings (select to include)
                    </p>
                    <div className="space-y-1">
                      {meetings.filter(m => !m.is_true_one_on_one).map((m) => {
                        const realIndex = meetings.indexOf(m);
                        return (
                          <div
                            key={`group-${realIndex}`}
                            className={cn(
                              'flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer transition-colors',
                              m.included
                                ? 'bg-primary/5 border border-primary/20'
                                : 'bg-muted/30 hover:bg-muted/50'
                            )}
                            onClick={() => toggleMeeting(realIndex)}
                          >
                            <Checkbox checked={m.included} className="shrink-0" />
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium truncate block">{m.title}</span>
                              <span className="text-xs text-muted-foreground">
                                {m.attendee_names.join(', ')}
                              </span>
                            </div>
                            <Badge variant="secondary" className="text-xs shrink-0">
                              {m.occurrence_count}x
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {meetings.length === 0 && !loadingMeetings && (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    No recurring meetings found yet. They'll appear after your calendar syncs.
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep(0)}>Back</Button>
              <Button onClick={() => setStep(2)}>
                Continue <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 3: Context sources ──────────────────────────────────── */}
      {step === 2 && (
        <Card>
          <CardContent className="pt-8 pb-8 space-y-6">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">Make your briefs smarter</h2>
              <p className="text-sm text-muted-foreground">
                Each source adds more context. Connect what you use — you can always add more later.
              </p>
            </div>

            <div className="space-y-3">
              {/* Slack */}
              <div className={cn(
                'flex items-center gap-4 p-4 rounded-lg border transition-colors',
                integrations.slack ? 'border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/20' : ''
              )}>
                <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center shrink-0">
                  <MessageSquare className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Slack</p>
                  <p className="text-xs text-muted-foreground">Recent DMs, channel discussions, decisions</p>
                </div>
                {integrations.slack ? (
                  <Badge variant="outline" className="text-green-600 border-green-300 dark:text-green-400 shrink-0">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Connected
                  </Badge>
                ) : (
                  <Button size="sm" variant="outline" onClick={connectSlack} disabled={connectingSlack}>
                    {connectingSlack ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Connect'}
                  </Button>
                )}
              </div>

              {/* Zoom */}
              <div className={cn(
                'flex items-center gap-4 p-4 rounded-lg border transition-colors',
                integrations.zoom ? 'border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/20' : ''
              )}>
                <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
                  <Video className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Zoom</p>
                  <p className="text-xs text-muted-foreground">Meeting recordings, transcripts, AI summaries</p>
                </div>
                {integrations.zoom ? (
                  <Badge variant="outline" className="text-green-600 border-green-300 dark:text-green-400 shrink-0">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Connected
                  </Badge>
                ) : (
                  <Button size="sm" variant="outline" onClick={connectZoom} disabled={connectingZoom}>
                    {connectingZoom ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Connect'}
                  </Button>
                )}
              </div>

              {/* StackOne services (shown individually) */}
              {integrations.stackone_accounts.length > 0 && (
                integrations.stackone_accounts.map(provider => (
                  <div
                    key={provider}
                    className="flex items-center gap-4 p-4 rounded-lg border border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/20"
                  >
                    <div className="w-10 h-10 rounded-lg bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center shrink-0">
                      <Plug className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium capitalize">{provider}</p>
                      <p className="text-xs text-muted-foreground">Tickets, projects, activity</p>
                    </div>
                    <Badge variant="outline" className="text-green-600 border-green-300 dark:text-green-400 shrink-0">
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Connected
                    </Badge>
                  </div>
                ))
              )}

              {/* Hint for more integrations */}
              <p className="text-xs text-muted-foreground text-center pt-1">
                {connectedCount === 0
                  ? 'You can connect these anytime in Settings.'
                  : `${connectedCount} source${connectedCount !== 1 ? 's' : ''} connected. Add more anytime in Settings.`}
              </p>
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
              <Button onClick={() => setStep(3)}>
                Continue <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 4: Schedule ─────────────────────────────────────────── */}
      {step === 3 && (
        <Card>
          <CardContent className="pt-8 pb-8 space-y-6">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">When should your briefs be ready?</h2>
              <p className="text-sm text-muted-foreground">
                We'll prepare them before your first meeting each day.
              </p>
            </div>

            <div className="space-y-4">
              {/* Time picker */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Generate at</label>
                <Select
                  value={String(runHourLocal)}
                  onValueChange={(val) => setRunHourLocal(parseInt(val))}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 14 }, (_, i) => i + 5).map(h => (
                      <SelectItem key={h} value={String(h)}>
                        {formatHourLabel(h)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Slack channels */}
              {integrations.slack && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Prioritize specific Slack channels</label>
                  <p className="text-xs text-muted-foreground">
                    DMs and mentions are always included. Add channels here only if they contain context
                    that wouldn't surface through direct conversations — like team standups or project channels.
                  </p>
                  <div className="flex gap-2">
                    <Input
                      placeholder="#channel-name"
                      value={newChannel}
                      onChange={e => setNewChannel(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addChannel())}
                      className="flex-1"
                    />
                    <Button size="sm" variant="outline" onClick={addChannel} disabled={!newChannel.trim()}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {slackChannels.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {slackChannels.map(ch => (
                        <Badge key={ch} variant="secondary" className="gap-1 pr-1">
                          #{ch}
                          <button
                            onClick={() => removeChannel(ch)}
                            className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-4">
              <Button variant="ghost" onClick={() => setStep(2)}>Back</Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={async () => { await saveAndEnable(); onComplete(); }}
                  disabled={saving}
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Start preparing
                </Button>
                <Button onClick={runNow} disabled={runningNow || saving}>
                  {runningNow ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Run now for today
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
