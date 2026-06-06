import React, { useState, useEffect } from 'react';
import { Loader2, Save, Calendar, Unlink, RefreshCw, Check, ChevronsUpDown, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import {
  CalendarSyncRules,
  RelationshipType,
  DEFAULT_SYNC_RULES,
} from '@/lib/calendar/matchEventToMember';

export default function CosCalendarSyncPanel() {
  const { toast } = useToast();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState<{
    connected: boolean;
    scope: string | null;
    lastSyncAt: string | null;
    lastSyncStatus: string | null;
  } | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [draftRules, setDraftRules] = useState<CalendarSyncRules>(DEFAULT_SYNC_RULES);
  const [savingRules, setSavingRules] = useState(false);
  const [knownAttendees, setKnownAttendees] = useState<{ email: string; name: string | null }[]>([]);
  const [excludeOpen, setExcludeOpen] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const [credsRes, settingsRes, attendeesRes] = await Promise.all([
        db.from('user_calendar_credentials_public').select('*').maybeSingle(),
        db.from('cos_settings').select('calendar_sync_rules').eq('user_id', user.id).maybeSingle(),
        db.from('cos_one_on_one_events')
          .select('attendee_email, attendee_name, attendee_emails')
          .eq('user_id', user.id)
          .not('attendee_email', 'is', null),
      ]);
      if (credsRes.data) {
        setConnection({
          connected: Boolean(credsRes.data.connected),
          scope: credsRes.data.scope ?? null,
          lastSyncAt: credsRes.data.last_sync_at ?? null,
          lastSyncStatus: credsRes.data.last_sync_status ?? null,
        });
      } else {
        setConnection({ connected: false, scope: null, lastSyncAt: null, lastSyncStatus: null });
      }
      if (settingsRes.data?.calendar_sync_rules) {
        setDraftRules({
          ...DEFAULT_SYNC_RULES,
          ...(settingsRes.data.calendar_sync_rules as Partial<CalendarSyncRules>),
        });
      }

      // Build deduplicated attendee list from all synced events.
      const seen = new Map<string, string | null>();
      for (const row of (attendeesRes.data ?? []) as Array<{ attendee_email?: string | null; attendee_name?: string | null; attendee_emails?: string[] | null }>) {
        const email = (row.attendee_email ?? row.attendee_emails?.[0] ?? '').trim().toLowerCase();
        if (!email) continue;
        if (!seen.has(email)) seen.set(email, row.attendee_name ?? null);
      }
      setKnownAttendees(
        Array.from(seen.entries())
          .map(([email, name]) => ({ email, name }))
          .sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email)),
      );

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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Inclusion rules</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-medium">Max other attendees</label>
            <Input
              type="number"
              min={0}
              max={5}
              value={draftRules.max_other_attendees}
              onChange={e =>
                setDraftRules(r => ({
                  ...r,
                  max_other_attendees: Math.max(0, Math.min(5, parseInt(e.target.value) || 0)),
                }))
              }
              className="h-9 text-sm w-24"
            />
            <p className="text-[11px] text-muted-foreground">
              1 keeps true 1:1s. Higher includes small group meetings.
            </p>
          </div>

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

          <div className="space-y-1.5">
            <label className="text-xs font-medium">Exclude specific people</label>
            <Popover open={excludeOpen} onOpenChange={setExcludeOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={excludeOpen}
                  className="w-full justify-between min-h-10 h-auto py-2 text-sm"
                >
                  <div className="flex flex-wrap gap-1 flex-1">
                    {(draftRules.exclude_emails ?? []).length === 0 ? (
                      <span className="text-muted-foreground">Select people to exclude...</span>
                    ) : (
                      (draftRules.exclude_emails ?? []).map(email => {
                        const att = knownAttendees.find(a => a.email === email.toLowerCase());
                        return (
                          <Badge key={email} variant="outline" className="bg-background hover:bg-accent/50">
                            <span className="text-xs">{att?.name ?? email}</span>
                            <button
                              className="ml-1 rounded-full hover:bg-muted"
                              onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}
                              onClick={e => {
                                e.stopPropagation();
                                setDraftRules(r => ({ ...r, exclude_emails: (r.exclude_emails ?? []).filter(x => x !== email) }));
                              }}
                            >
                              <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                            </button>
                          </Badge>
                        );
                      })
                    )}
                  </div>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[300px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search by name or email..." />
                  <CommandList>
                    <CommandEmpty>No matching attendees.</CommandEmpty>
                    <CommandGroup>
                      {knownAttendees.map(att => {
                        const isExcluded = (draftRules.exclude_emails ?? []).includes(att.email);
                        return (
                          <CommandItem
                            key={att.email}
                            value={`${att.name ?? ''} ${att.email}`}
                            onSelect={() => {
                              setDraftRules(r => ({
                                ...r,
                                exclude_emails: isExcluded
                                  ? (r.exclude_emails ?? []).filter(x => x !== att.email)
                                  : [...(r.exclude_emails ?? []), att.email],
                              }));
                            }}
                            className="cursor-pointer"
                          >
                            <div className={cn(
                              "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                              isExcluded ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible",
                            )}>
                              <Check className="h-4 w-4" />
                            </div>
                            <div className="flex flex-col">
                              {att.name && <span className="text-sm">{att.name}</span>}
                              <span className="text-xs text-muted-foreground">{att.email}</span>
                            </div>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <p className="text-[11px] text-muted-foreground">
              These people's 1:1s will be hidden from your list.
            </p>
          </div>

          <div className="pt-2">
            <Button size="sm" onClick={saveRules} disabled={savingRules} className="gap-1.5">
              {savingRules ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save rules
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
