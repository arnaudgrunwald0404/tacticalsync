import React, { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  X, RefreshCw, Send, Loader2, FileText, Sparkles, Target, ListChecks,
  CheckSquare, ClipboardList, NotebookText, ArrowRight, AlertCircle, ExternalLink,
} from 'lucide-react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import * as SheetPrimitive from '@radix-ui/react-dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { parseLocalDate } from '@/lib/dateUtils';
import type {
  QuarterlyPriority, MonthlyCommitment, CommitmentQuarter,
} from '@/types/commitments';

// Types this drawer accepts
export interface PrepDrawerMember {
  id: string;
  name: string;
  role: string;
  relationship_type: 'direct_report' | 'collaborator';
  context_notes: string | null;
  last_1on1_date: string | null;
}

interface PendingAction {
  id: string;
  text: string;
  created_at: string;
}

interface PrevNote {
  id?: string;
  date: string;
  text: string;
}

interface PrepDrawerProps {
  open: boolean;
  member: PrepDrawerMember | null;
  content: string;
  source: 'cleargo' | 'static';
  generatedAt: string;
  refreshing?: boolean;
  sharing?: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onShare: () => void;
}

const STATUS_DOT: Record<string, string> = {
  done: 'bg-emerald-500',
  in_progress: 'bg-amber-400',
  draft: 'bg-muted-foreground/30',
  not_done: 'bg-destructive/60',
};

const REL_TONE: Record<PrepDrawerMember['relationship_type'], { label: string; bg: string; fg: string; rail: string }> = {
  direct_report: { label: 'Direct report', bg: 'bg-blue-50', fg: 'text-blue-700', rail: 'bg-blue-500' },
  collaborator:  { label: 'Collaborator',  bg: 'bg-teal-50', fg: 'text-teal-700', rail: 'bg-teal-500' },
};

// ── Markdown → structured topics ─────────────────────────────────────────────
// Parse the prep markdown into a list of topic sections so we can render
// them as a presentation instead of a wall of prose.
export interface TopicSection {
  heading: string;
  bullets: string[];
  paragraphs: string[];
}

export function parsePrepMarkdown(md: string): TopicSection[] {
  if (!md) return [];
  const lines = md.split('\n');
  const sections: TopicSection[] = [];
  let current: TopicSection | null = null;
  let firstContentSeen = false;

  const push = () => {
    if (current && (current.bullets.length || current.paragraphs.length || current.heading)) {
      sections.push(current);
    }
    current = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    // Skip top-level "# 1:1 Prep — Name" front matter once at the top
    const isH1 = line.startsWith('# ');
    const isH2 = line.startsWith('## ');
    const isH3 = line.startsWith('### ');
    if (isH1 || isH2 || isH3) {
      push();
      const heading = line.replace(/^#{1,3}\s+/, '');
      if (isH1 && !firstContentSeen) {
        // The top "# 1:1 Prep — Name" — skip it; the drawer header already shows this
        continue;
      }
      firstContentSeen = true;
      current = { heading, bullets: [], paragraphs: [] };
      continue;
    }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      if (!current) current = { heading: 'Topics', bullets: [], paragraphs: [] };
      current.bullets.push(line.slice(2));
      firstContentSeen = true;
      continue;
    }
    if (line.match(/^[-_*]{3,}$/)) continue; // ignore HRs
    if (!current) current = { heading: 'Topics', bullets: [], paragraphs: [] };
    current.paragraphs.push(line);
    firstContentSeen = true;
  }
  push();
  return sections;
}

function inlineMd(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*')) return <em key={i}>{part.slice(1, -1)}</em>;
    return part;
  });
}

// ── The drawer itself ────────────────────────────────────────────────────────

export function OneOnOnePrepDrawer({
  open, member, content, source, generatedAt,
  refreshing, sharing,
  onClose, onRefresh, onShare,
}: PrepDrawerProps) {
  const { toast } = useToast();

  // Pending actions from previous meetings — to be carried forward
  const [pastActions, setPastActions] = useState<PendingAction[]>([]);
  const [actionDraftForThem, setActionDraftForThem] = useState('');
  const [todoDraftForMe, setTodoDraftForMe] = useState('');
  const [savingForThem, setSavingForThem] = useState(false);
  const [savingForMe, setSavingForMe] = useState(false);
  const [contextDraft, setContextDraft] = useState('');
  const [savingContext, setSavingContext] = useState(false);
  const [feedbackDraft, setFeedbackDraft] = useState('');
  const [savingFeedback, setSavingFeedback] = useState(false);

  // Commitments (reference panel)
  const [quarter, setQuarter] = useState<CommitmentQuarter | null>(null);
  const [priorities, setPriorities] = useState<QuarterlyPriority[]>([]);
  const [commitments, setCommitments] = useState<MonthlyCommitment[]>([]);
  const [loadingCommitments, setLoadingCommitments] = useState(false);

  // Reset per-member state whenever the drawer flips to a different member
  useEffect(() => {
    if (!open || !member) return;
    setActionDraftForThem('');
    setTodoDraftForMe('');
    setContextDraft(member.context_notes ?? '');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    // Past actions for this person — carry forward into "Open from last time"
    db.from('cos_meeting_actions')
      .select('id, text, created_at')
      .eq('member_id', member.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .then(({ data }: { data: PendingAction[] | null }) => setPastActions(data ?? []));

    // Global prep instructions
    db.from('cos_prep_settings')
      .select('prep_instructions')
      .single()
      .then(({ data }: { data: { prep_instructions: string } | null }) => {
        setFeedbackDraft(data?.prep_instructions ?? '');
      });
  }, [open, member]);

  // Load the current quarter + commitments
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      setLoadingCommitments(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) { setLoadingCommitments(false); return; }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const today = format(new Date(), 'yyyy-MM-dd');
      const { data: quarters } = await db
        .from('commitment_quarters')
        .select('*')
        .lte('start_date', today)
        .gte('end_date', today)
        .limit(1);
      const q = (quarters?.[0] ?? null) as CommitmentQuarter | null;
      if (cancelled) return;
      setQuarter(q);
      if (!q) { setPriorities([]); setCommitments([]); setLoadingCommitments(false); return; }
      const qStart = parseLocalDate(q.start_date);
      const nowMonth = new Date().getMonth();
      const monthNum = Math.min(3, Math.max(1, nowMonth - qStart.getMonth() + 1));
      const [priRes, comRes] = await Promise.all([
        db.from('quarterly_priorities').select('*')
          .eq('quarter_id', q.id).eq('user_id', user.id).order('display_order'),
        db.from('monthly_commitments').select('*')
          .eq('quarter_id', q.id).eq('user_id', user.id).eq('month_number', monthNum).order('display_order'),
      ]);
      if (cancelled) return;
      setPriorities(priRes.data ?? []);
      setCommitments(comRes.data ?? []);
      setLoadingCommitments(false);
    }
    load();
    return () => { cancelled = true; };
  }, [open]);

  const topics = useMemo(() => parsePrepMarkdown(content), [content]);

  if (!member) return null;

  const tone = REL_TONE[member.relationship_type];
  const lastLabel = member.last_1on1_date
    ? format(parseLocalDate(member.last_1on1_date), 'MMM d, yyyy')
    : 'No prior 1:1 logged';

  const saveActionsForThem = async () => {
    if (!actionDraftForThem.trim()) return;
    setSavingForThem(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const lines = actionDraftForThem.split('\n').map(l => l.replace(/^[-*]\s*/, '').trim()).filter(Boolean);
      const rows = lines.map(text => ({ user_id: user.id, member_id: member.id, text }));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from('cos_meeting_actions').insert(rows);
      if (error) throw error;
      setActionDraftForThem('');
      // Refresh the carry-forward list to include what we just queued
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: refreshed } = await (supabase as any).from('cos_meeting_actions')
        .select('id, text, created_at')
        .eq('member_id', member.id).eq('status', 'pending')
        .order('created_at', { ascending: false });
      setPastActions((refreshed ?? []) as PendingAction[]);
      toast({ title: `${rows.length} action${rows.length !== 1 ? 's' : ''} queued for ${member.name.split(' ')[0]}` });
    } catch (err) {
      toast({ title: 'Failed to save actions', description: String(err), variant: 'destructive' });
    } finally {
      setSavingForThem(false);
    }
  };

  const saveTodosForMe = async () => {
    if (!todoDraftForMe.trim()) return;
    setSavingForMe(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const lines = todoDraftForMe.split('\n').map(l => l.replace(/^[-*]\s*/, '').trim()).filter(Boolean);
      // Push each into cos_priorities under "this_week", noting the source
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const { data: existing } = await db
        .from('cos_priorities')
        .select('tier_order')
        .eq('user_id', user.id)
        .eq('category', 'this_week')
        .order('tier_order', { ascending: false })
        .limit(1);
      const maxOrder = (existing?.[0]?.tier_order ?? 0) as number;
      const rows = lines.map((text, i) => ({
        user_id: user.id,
        text,
        category: 'this_week',
        tier_order: maxOrder + i + 1,
        notes: `From 1:1 with ${member.name}`,
      }));
      const { error } = await db.from('cos_priorities').insert(rows);
      if (error) throw error;
      setTodoDraftForMe('');
      toast({
        title: `Added ${rows.length} to-do${rows.length !== 1 ? 's' : ''} to My Lists`,
        description: 'Find them under This Week.',
      });
    } catch (err) {
      toast({ title: 'Failed to save to-dos', description: String(err), variant: 'destructive' });
    } finally {
      setSavingForMe(false);
    }
  };

  const saveContext = async () => {
    setSavingContext(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('cos_team_members')
        .update({ context_notes: contextDraft || null })
        .eq('id', member.id);
      if (error) throw error;
      toast({ title: 'Context saved' });
    } catch (err) {
      toast({ title: 'Failed to save context', description: String(err), variant: 'destructive' });
    } finally {
      setSavingContext(false);
    }
  };

  const saveFeedback = async () => {
    setSavingFeedback(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('cos_prep_settings')
        .upsert({ user_id: user.id, prep_instructions: feedbackDraft }, { onConflict: 'user_id' });
      if (error) throw error;
      toast({ title: 'Prep instructions saved' });
    } catch (err) {
      toast({ title: 'Failed to save instructions', description: String(err), variant: 'destructive' });
    } finally {
      setSavingFeedback(false);
    }
  };

  const togglePastAction = async (id: string, currentDone: boolean) => {
    const nextStatus = currentDone ? 'pending' : 'done';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('cos_meeting_actions').update({ status: nextStatus }).eq('id', id);
    setPastActions(prev =>
      nextStatus === 'pending' ? prev : prev.filter(a => a.id !== id)
    );
  };

  const generatedLabel = (() => {
    const diffMs = Date.now() - new Date(generatedAt).getTime();
    const mins = Math.round(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return format(new Date(generatedAt), 'MMM d, h:mm a');
  })();

  return (
    <Sheet open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <SheetContent
        side="right"
        // Full-screen override: kill the max-width and pad so we get the whole viewport
        className="w-screen sm:max-w-full inset-0 p-0 border-0 flex flex-col gap-0"
      >
        {/* Hidden accessible title for screen readers — required by Dialog */}
        <SheetPrimitive.Title className="sr-only">
          {member.name} — 1:1 Prep
        </SheetPrimitive.Title>

        {/* Header bar */}
        <header className="flex-shrink-0 border-b border-border bg-background px-6 py-4 flex items-center gap-4">
          {/* Person identity */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className={cn('h-11 w-11 rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0', tone.rail.replace('bg-', 'bg-'))}>
              {initials(member.name)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-semibold leading-tight truncate">{member.name}</h2>
                <Badge variant="secondary" className={cn('text-[10px] font-semibold uppercase tracking-wide', tone.bg, tone.fg, 'border-0')}>
                  {tone.label}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {member.role} · Last 1:1 {lastLabel}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <p className="text-xs text-muted-foreground mr-2 hidden md:block">
              Generated {generatedLabel} · {source === 'cleargo' ? 'ClearGO' : 'Static'}
            </p>
            <Button size="sm" variant="outline" className="gap-1.5" disabled={refreshing} onClick={onRefresh}>
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="hidden sm:inline">{refreshing ? 'Refreshing…' : 'Refresh'}</span>
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" disabled={sharing} onClick={onShare}>
              {sharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              <span className="hidden sm:inline">{sharing ? 'Sending…' : 'Share'}</span>
            </Button>
            <Button size="sm" variant="ghost" className="gap-1.5" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {/* Body: main column + reference panel */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* MAIN */}
          <main className="overflow-y-auto px-6 py-6 space-y-8">
            {/* Carry-forward from prior meetings */}
            {pastActions.length > 0 && (
              <section className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <ArrowRight className="h-4 w-4 text-amber-700 dark:text-amber-400" />
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                    Open from last time ({pastActions.length})
                  </h3>
                </div>
                <p className="text-xs text-amber-800/80 dark:text-amber-300/80 mb-3">
                  Carried forward from prior 1:1s — check them off as you discuss.
                </p>
                <ul className="space-y-2">
                  {pastActions.map(a => (
                    <li key={a.id} className="flex items-start gap-2.5">
                      <Checkbox
                        id={`pa-${a.id}`}
                        className="mt-0.5"
                        onCheckedChange={(c) => togglePastAction(a.id, !!c === false)}
                      />
                      <label htmlFor={`pa-${a.id}`} className="text-sm leading-snug cursor-pointer flex-1">
                        {a.text}
                        <span className="block text-[10px] text-amber-700/70 dark:text-amber-400/70 mt-0.5">
                          Queued {format(new Date(a.created_at), 'MMM d')}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Topics of the day */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <ListChecks className="h-4 w-4 text-primary" />
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Topics of the day
                </h3>
              </div>

              {topics.length === 0 ? (
                <div className="text-sm text-muted-foreground italic px-3 py-6 rounded-lg border border-dashed border-border">
                  No topics yet — refresh the brief or add agenda items below.
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {topics.map((t, i) => (
                    <article key={i} className="rounded-lg border border-border bg-card p-4 shadow-sm">
                      <h4 className="font-semibold text-sm text-foreground mb-2 flex items-center gap-1.5">
                        <span className="inline-flex h-5 w-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold items-center justify-center">
                          {i + 1}
                        </span>
                        {inlineMd(t.heading)}
                      </h4>
                      {t.paragraphs.length > 0 && (
                        <div className="space-y-1.5 mb-2">
                          {t.paragraphs.map((p, j) => (
                            <p key={j} className="text-xs leading-relaxed text-muted-foreground">
                              {inlineMd(p)}
                            </p>
                          ))}
                        </div>
                      )}
                      {t.bullets.length > 0 && (
                        <ul className="space-y-1">
                          {t.bullets.map((b, j) => (
                            <li key={j} className="text-xs leading-snug text-foreground flex items-start gap-1.5">
                              <span className="text-primary mt-0.5">•</span>
                              <span>{inlineMd(b)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>

            {/* Two-column action capture: for them | for me */}
            <section className="grid gap-4 md:grid-cols-2">
              {/* Actions for them */}
              <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-blue-600" />
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Actions for {member.name.split(' ')[0]}
                  </h3>
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Things {member.name.split(' ')[0]} should do — one per line. Saved to their pending follow-ups.
                </p>
                <Textarea
                  value={actionDraftForThem}
                  onChange={e => setActionDraftForThem(e.target.value)}
                  placeholder={"- Send the Q3 hiring plan by Friday\n- Loop me into the platform review"}
                  rows={4}
                  className="text-sm resize-none"
                />
                <Button size="sm" onClick={saveActionsForThem} disabled={savingForThem || !actionDraftForThem.trim()}>
                  {savingForThem ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                  Queue for {member.name.split(' ')[0]}
                </Button>
              </div>

              {/* To-dos for me */}
              <div className="rounded-lg border border-primary/30 bg-primary/[0.03] p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <CheckSquare className="h-4 w-4 text-primary" />
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-primary">
                    To-dos for me
                  </h3>
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Things <strong>I</strong> have to do. Saved to <em>My Lists → This Week</em> so they don't get lost.
                </p>
                <Textarea
                  value={todoDraftForMe}
                  onChange={e => setTodoDraftForMe(e.target.value)}
                  placeholder={"- Draft the Q3 narrative\n- Intro Dan to the Atlas team lead"}
                  rows={4}
                  className="text-sm resize-none"
                />
                <Button size="sm" onClick={saveTodosForMe} disabled={savingForMe || !todoDraftForMe.trim()}>
                  {savingForMe ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                  Add to My Lists
                </Button>
              </div>
            </section>

            {/* Person context */}
            <section className="rounded-lg border border-border p-4 space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                <FileText className="h-3.5 w-3.5" />
                Context about {member.name.split(' ')[0]}
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Goals, working style, things to remember — appended to every future prep.
              </p>
              <Textarea
                value={contextDraft}
                onChange={e => setContextDraft(e.target.value)}
                placeholder={`e.g. ${member.name.split(' ')[0]} cares deeply about shipping quality over speed.`}
                rows={3}
                className="text-sm resize-none"
              />
              <Button size="sm" variant="outline" onClick={saveContext} disabled={savingContext}>
                {savingContext ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                Save context
              </Button>
            </section>

            {/* Improve future preps */}
            <section className="rounded-lg border border-border p-4 space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5" />
                Improve future 1:1 preps
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Standing instructions applied to every prep — tell the AI what good looks like for you.
              </p>
              <Textarea
                value={feedbackDraft}
                onChange={e => setFeedbackDraft(e.target.value)}
                placeholder="e.g. Always highlight blockers first. Don't repeat unchanged items."
                rows={4}
                className="text-sm resize-none"
              />
              <Button size="sm" variant="outline" onClick={saveFeedback} disabled={savingFeedback}>
                {savingFeedback ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                Save instructions
              </Button>
            </section>
          </main>

          {/* REFERENCE PANEL */}
          <aside className="hidden lg:flex flex-col border-l border-border bg-muted/30 overflow-y-auto">
            <div className="px-5 py-5 space-y-6">
              {/* Quarterly Priorities */}
              <section>
                <header className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                    <Target className="h-3.5 w-3.5" />
                    Quarterly Priorities
                  </h3>
                  {quarter && (
                    <span className="text-[10px] text-muted-foreground">{quarter.label}</span>
                  )}
                </header>
                {loadingCommitments ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : priorities.length === 0 ? (
                  <SetUpNowPrompt
                    label="Set up your Quarterly Priorities"
                    href="/commitments"
                  />
                ) : (
                  <ol className="space-y-1.5">
                    {priorities.map(p => (
                      <li key={p.id} className="text-xs leading-snug flex items-start gap-2 px-2 py-1.5 rounded-md bg-background border border-border">
                        <span className="inline-flex h-4 w-4 rounded-full bg-violet-500/15 text-violet-700 text-[9px] font-bold items-center justify-center mt-0.5">
                          {p.display_order}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground">{p.title}</p>
                          {p.description && (
                            <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{p.description}</p>
                          )}
                          <span className="inline-flex items-center gap-1 mt-1">
                            <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT[p.status] ?? 'bg-muted-foreground/30')} />
                            <span className="text-[9px] text-muted-foreground capitalize">{p.status.replace('_', ' ')}</span>
                          </span>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              {/* Monthly Commitments */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5 mb-2">
                  <ListChecks className="h-3.5 w-3.5" />
                  Monthly Commitments
                </h3>
                {loadingCommitments ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : !quarter ? (
                  <SetUpNowPrompt
                    label="Start a quarter to track Monthly Commitments"
                    href="/commitments"
                  />
                ) : commitments.length === 0 ? (
                  <SetUpNowPrompt
                    label="Set up this month's Commitments"
                    href="/commitments"
                  />
                ) : (
                  <ol className="space-y-1.5">
                    {commitments.map(c => (
                      <li key={c.id} className="text-xs leading-snug flex items-start gap-2 px-2 py-1.5 rounded-md bg-background border border-border">
                        <span className="inline-flex h-4 w-4 rounded-full bg-amber-500/15 text-amber-700 text-[9px] font-bold items-center justify-center mt-0.5">
                          {c.display_order}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground">{c.title}</p>
                          {c.description && (
                            <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{c.description}</p>
                          )}
                          <span className="inline-flex items-center gap-1 mt-1">
                            <span className={cn('h-1.5 w-1.5 rounded-full', STATUS_DOT[c.status] ?? 'bg-muted-foreground/30')} />
                            <span className="text-[9px] text-muted-foreground capitalize">{c.status.replace('_', ' ')}</span>
                          </span>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              {/* Quick links */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5 mb-2">
                  <NotebookText className="h-3.5 w-3.5" />
                  Shared notes
                </h3>
                <a
                  href="#"
                  onClick={e => e.preventDefault()}
                  className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-md bg-background border border-border hover:bg-muted/50 transition-colors"
                >
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="flex-1 truncate">Arnaud × {member.name.split(' ')[0]} 1:1 Notes</span>
                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                </a>
              </section>
            </div>
          </aside>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SetUpNowPrompt({ label, href }: { label: string; href: string }) {
  return (
    <a
      href={href}
      className="flex items-start gap-2 px-3 py-2.5 rounded-md border border-destructive/40 bg-destructive/[0.04] hover:bg-destructive/[0.08] transition-colors"
    >
      <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-xs font-semibold text-destructive">Set up now</p>
        <p className="text-[10px] text-destructive/80 mt-0.5">{label}</p>
      </div>
    </a>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
