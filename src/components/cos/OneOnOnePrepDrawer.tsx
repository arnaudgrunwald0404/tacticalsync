import React, { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  X, RefreshCw, Send, Loader2, FileText, Sparkles, Target, ListChecks,
  CheckSquare, ClipboardList, NotebookText, ArrowRight, AlertCircle, ExternalLink,
  Play, MoreHorizontal, Repeat, Clock, Video,
} from 'lucide-react';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import * as SheetPrimitive from '@radix-ui/react-dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { parseLocalDate } from '@/lib/dateUtils';
import type {
  QuarterlyPriority, MonthlyCommitment, CommitmentQuarter,
} from '@/types/commitments';

export interface PrepDrawerMember {
  id: string;
  name: string;
  email: string | null;
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

interface PrepDrawerProps {
  open: boolean;
  member: PrepDrawerMember | null;
  content: string;
  source: 'cleargo' | 'static' | 'ai_generated';
  generatedAt: string;
  refreshing?: boolean;
  sharing?: boolean;
  aiGenerating?: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onShare: () => void;
  onAiGenerate?: () => void;
}

const STATUS_DOT: Record<string, string> = {
  done: 'bg-emerald-500',
  in_progress: 'bg-amber-400',
  draft: 'bg-muted-foreground/30',
  not_done: 'bg-destructive/60',
};

type RelTone = { label: string; short: string; bg: string; fg: string; rail: string; dotColor: string };
const REL_TONE: Record<string, RelTone> = {
  direct_report: { label: 'Direct report', short: 'Report',  bg: 'bg-blue-50',   fg: 'text-blue-700',  rail: 'bg-blue-600',  dotColor: 'bg-blue-600' },
  collaborator:  { label: 'Collaborator',  short: 'Collab',  bg: 'bg-teal-50',   fg: 'text-teal-700',  rail: 'bg-teal-600',  dotColor: 'bg-teal-600' },
  boss:          { label: 'Manager',       short: 'Manager', bg: 'bg-[#e8eef7]', fg: 'text-[#04356c]', rail: 'bg-[#254677]', dotColor: 'bg-[#254677]' },
  skip_level:    { label: 'Skip-level',    short: 'Skip',    bg: 'bg-violet-50', fg: 'text-violet-700', rail: 'bg-violet-500', dotColor: 'bg-violet-500' },
  peer:          { label: 'Peer',          short: 'Peer',    bg: 'bg-gray-100',  fg: 'text-gray-600',  rail: 'bg-gray-400',  dotColor: 'bg-gray-400' },
  stakeholder:   { label: 'Stakeholder',   short: 'Stake',   bg: 'bg-slate-50',  fg: 'text-slate-700', rail: 'bg-slate-400', dotColor: 'bg-slate-400' },
  external:      { label: 'External',      short: 'External', bg: 'bg-stone-50', fg: 'text-stone-700', rail: 'bg-stone-400', dotColor: 'bg-stone-400' },
};

const DEFAULT_TONE: RelTone = {
  label: 'Team member', short: 'Team', bg: 'bg-slate-50', fg: 'text-slate-700', rail: 'bg-slate-400', dotColor: 'bg-slate-400',
};

const CADENCE_DAYS: Record<string, number> = {
  direct_report: 7, collaborator: 14, boss: 14, peer: 14, skip_level: 30, stakeholder: 30, external: 30,
};

// ── Markdown → structured topics ────────────────────────────────────────────

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
    const isH1 = line.startsWith('# ');
    const isH2 = line.startsWith('## ');
    const isH3 = line.startsWith('### ');
    if (isH1 || isH2 || isH3) {
      push();
      const heading = line.replace(/^#{1,3}\s+/, '');
      if (isH1 && !firstContentSeen) continue;
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
    if (line.match(/^[-_*]{3,}$/)) continue;
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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Section header used throughout the drawer
function SecHdr({ icon: Icon, label, right }: { icon: React.ElementType; label: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 mb-2.5">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-[10px] font-extrabold tracking-[0.08em] uppercase text-muted-foreground flex-1">{label}</span>
      {right}
    </div>
  );
}

// ── The drawer ──────────────────────────────────────────────────────────────

export function OneOnOnePrepDrawer({
  open, member, content, source, generatedAt,
  refreshing, sharing, aiGenerating,
  onClose, onRefresh, onShare, onAiGenerate,
}: PrepDrawerProps) {
  const { toast } = useToast();

  const [pastActions, setPastActions] = useState<PendingAction[]>([]);
  const [actionDraftForThem, setActionDraftForThem] = useState('');
  const [todoDraftForMe, setTodoDraftForMe] = useState('');
  const [savingForThem, setSavingForThem] = useState(false);
  const [savingForMe, setSavingForMe] = useState(false);
  const [contextDraft, setContextDraft] = useState('');
  const [savingContext, setSavingContext] = useState(false);
  const [feedbackDraft, setFeedbackDraft] = useState('');
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [newAgendaItem, setNewAgendaItem] = useState('');

  const [quarter, setQuarter] = useState<CommitmentQuarter | null>(null);
  const [priorities, setPriorities] = useState<QuarterlyPriority[]>([]);
  const [commitments, setCommitments] = useState<MonthlyCommitment[]>([]);
  const [loadingCommitments, setLoadingCommitments] = useState(false);
  const [zoomRecordings, setZoomRecordings] = useState<Array<{
    id: string; topic: string | null; start_time: string;
    duration_minutes: number | null; has_transcript: boolean;
  }>>([]);

  useEffect(() => {
    if (!open || !member) return;
    setActionDraftForThem('');
    setTodoDraftForMe('');
    setNewAgendaItem('');
    setContextDraft(member.context_notes ?? '');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    db.from('cos_meeting_actions')
      .select('id, text, created_at')
      .eq('member_id', member.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .then(({ data }: { data: PendingAction[] | null }) => setPastActions(data ?? []));

    db.from('cos_prep_settings')
      .select('prep_instructions')
      .single()
      .then(({ data }: { data: { prep_instructions: string } | null }) => {
        setFeedbackDraft(data?.prep_instructions ?? '');
      });

    db.from('cos_zoom_recordings')
      .select('id, topic, start_time, duration_minutes, has_transcript')
      .eq('team_member_id', member.id)
      .gte('start_time', new Date(Date.now() - 30 * 86_400_000).toISOString())
      .order('start_time', { ascending: false })
      .limit(5)
      .then(({ data }: { data: Array<{ id: string; topic: string | null; start_time: string; duration_minutes: number | null; has_transcript: boolean }> | null }) => {
        setZoomRecordings(data ?? []);
      })
      .catch(() => setZoomRecordings([]));
  }, [open, member]);

  useEffect(() => {
    if (!open || !member) return;
    let cancelled = false;
    async function load() {
      setLoadingCommitments(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;

      // Resolve the member's profile user_id from their email
      let memberUserId: string | null = null;
      if (member!.email) {
        const { data: profile } = await db
          .from('profiles')
          .select('id')
          .eq('email', member!.email)
          .maybeSingle();
        memberUserId = profile?.id ?? null;
      }
      if (!memberUserId || cancelled) { setPriorities([]); setCommitments([]); setLoadingCommitments(false); return; }

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
          .eq('quarter_id', q.id).eq('user_id', memberUserId).order('display_order'),
        db.from('monthly_commitments').select('*')
          .eq('quarter_id', q.id).eq('user_id', memberUserId).eq('month_number', monthNum).order('display_order'),
      ]);
      if (cancelled) return;
      setPriorities(priRes.data ?? []);
      setCommitments(comRes.data ?? []);
      setLoadingCommitments(false);
    }
    load();
    return () => { cancelled = true; };
  }, [open, member]);

  const topics = useMemo(() => parsePrepMarkdown(content), [content]);

  const [discussed, setDiscussed] = useState<Set<number>>(new Set());
  const toggleDiscussed = (i: number) => setDiscussed(prev => {
    const next = new Set(prev);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  });
  const [topicActions, setTopicActions] = useState<Record<number, string>>({});

  if (!member) return null;

  const tone = REL_TONE[member.relationship_type] ?? DEFAULT_TONE;
  const lastLabel = member.last_1on1_date
    ? format(parseLocalDate(member.last_1on1_date), 'MMM d, yyyy')
    : 'No prior 1:1 logged';
  const cadenceDays = CADENCE_DAYS[member.relationship_type] ?? 14;
  const cadenceLabel = cadenceDays <= 7 ? 'Weekly' : cadenceDays <= 14 ? 'Bi-weekly' : 'Monthly';

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

  const openItems = pastActions;
  const firstName = member.name.split(' ')[0];

  // Filter out noise topics (generic boilerplate, empty-result sections)
  const NOISE_PATTERNS = [
    /no\s+(recent\s+)?zoom\s+(call\s+)?recordings?\s+found/i,
    /no\s+recordings?\s+(were\s+)?found/i,
    /not\s+worth\s+mentioning/i,
    /^ClearGO\s+Context$/i,
    /^ClearGO\s+is\s+the\s+bi-weekly/i,
  ];
  const isNoise = (t: TopicSection) => {
    const fullText = [t.heading, ...t.paragraphs, ...t.bullets].join(' ');
    return NOISE_PATTERNS.some(p => p.test(fullText));
  };
  const filteredTopics = topics.filter(t => !isNoise(t));

  return (
    <Sheet open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <SheetContent
        side="right"
        // Hide the built-in Radix close button via [&>button]:hidden — we have our own
        className="w-screen sm:max-w-full inset-0 p-0 border-0 flex flex-col gap-0 [&>button]:hidden"
      >
        <SheetPrimitive.Title className="sr-only">
          {member.name} — 1:1 Prep
        </SheetPrimitive.Title>

        {/* Header */}
        <header className="flex-shrink-0 border-b border-border bg-background px-5 py-4">
          <div className="flex items-start gap-3">
            <div className={cn('h-11 w-11 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0', tone.rail)}>
              {initials(member.name)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-heading font-extrabold text-[17px] tracking-tight leading-tight">{member.name}</span>
                <span className={cn(
                  'inline-flex items-center gap-1 text-[11px] font-bold rounded-full px-2 py-0.5',
                  tone.bg, tone.fg,
                )}>
                  <span className={cn('w-[5px] h-[5px] rounded-full', tone.dotColor)} />
                  {tone.short}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{member.role}</p>
              <div className="flex items-center gap-3 mt-2">
                <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Repeat className="h-3 w-3" />{cadenceLabel}
                </span>
                <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Clock className="h-3 w-3" />Last: {lastLabel}
                </span>
                {/* Refresh + AI Generate + Share — small, right-aligned */}
                <span className="flex-1" />
                <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs px-2" disabled={refreshing} onClick={onRefresh}>
                  {refreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  {refreshing ? 'Refreshing' : 'Refresh'}
                </Button>
                {onAiGenerate && (
                  <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs px-2" disabled={aiGenerating} onClick={onAiGenerate}>
                    {aiGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    {aiGenerating ? 'Generating...' : 'AI Generate'}
                  </Button>
                )}
                <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs px-2" disabled={sharing} onClick={onShare}>
                  {sharing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                  Share
                </Button>
              </div>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground flex-shrink-0 mt-0.5 p-1 rounded-md hover:bg-muted transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* Body — main + reference panel */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* Main scrollable content */}
          <main className="overflow-y-auto px-5 py-5 space-y-6">

            {/* Carry-forward action items */}
            {openItems.length > 0 && (
              <section>
                <SecHdr icon={ArrowRight} label={`Open from last time (${openItems.length})`} />
                <div className="flex flex-col gap-1.5">
                  {openItems.map(a => (
                    <div key={a.id} className="flex items-start gap-2.5 px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                      <Checkbox
                        id={`pa-${a.id}`}
                        className="mt-0.5"
                        onCheckedChange={(c) => togglePastAction(a.id, !!c === false)}
                      />
                      <div className="flex-1 min-w-0">
                        <label htmlFor={`pa-${a.id}`} className="text-sm leading-snug cursor-pointer block">{a.text}</label>
                        <span className="text-[10px] text-muted-foreground mt-0.5 block">
                          From {format(new Date(a.created_at), 'MMM d')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Topics — each with checkbox + inline action input */}
            <section>
              <SecHdr icon={ListChecks} label="Topics" />
              {filteredTopics.length === 0 ? (
                <div className="text-sm text-muted-foreground italic px-3 py-6 rounded-lg border border-dashed border-border">
                  No topics yet — hit Refresh to generate a prep brief.
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {filteredTopics.map((t, i) => {
                    const isSectionDivider = t.bullets.length === 0 && t.paragraphs.length === 0;

                    if (isSectionDivider) {
                      return (
                        <div
                          key={i}
                          className="relative mt-5 first:mt-0 mb-1 rounded-lg px-4 py-2.5 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-l-[3px] border-primary"
                        >
                          <span className="text-xs font-extrabold tracking-wide text-primary">
                            {t.heading}
                          </span>
                        </div>
                      );
                    }

                    const isDone = discussed.has(i);
                    return (
                      <div
                        key={i}
                        className={cn(
                          'rounded-lg border bg-card overflow-hidden transition-opacity',
                          isDone ? 'border-emerald-200 dark:border-emerald-800 opacity-60' : 'border-border',
                        )}
                      >
                        {/* Topic header with checkbox */}
                        <div className="flex items-start gap-2.5 px-3 py-2.5">
                          <Checkbox
                            checked={isDone}
                            onCheckedChange={() => toggleDiscussed(i)}
                            className="mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            <p className={cn(
                              'text-sm font-semibold',
                              isDone ? 'text-muted-foreground line-through' : 'text-foreground',
                            )}>
                              {inlineMd(t.heading)}
                            </p>
                            {t.bullets.length > 0 && (
                              <ul className="mt-1 space-y-0.5">
                                {t.bullets.map((b, j) => (
                                  <li key={j} className="text-xs text-muted-foreground flex items-start gap-1.5">
                                    <span className="text-primary mt-0.5 flex-shrink-0">•</span>
                                    <span>{inlineMd(b)}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                            {t.paragraphs.length > 0 && (
                              <div className="mt-1 space-y-0.5">
                                {t.paragraphs.map((p, j) => (
                                  <p key={j} className="text-xs text-muted-foreground leading-relaxed">{inlineMd(p)}</p>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Inline action input */}
                        <div className="border-t border-border/50 px-3 py-1.5 bg-muted/30">
                          <input
                            value={topicActions[i] ?? ''}
                            onChange={e => setTopicActions(prev => ({ ...prev, [i]: e.target.value }))}
                            placeholder={`@${firstName} action item...`}
                            className="w-full text-xs bg-transparent border-0 outline-none placeholder:text-muted-foreground/50 py-0.5"
                            onKeyDown={e => {
                              if (e.key === 'Enter' && topicActions[i]?.trim()) {
                                // Queue as action for them
                                setActionDraftForThem(prev => {
                                  const line = topicActions[i].trim();
                                  return prev ? `${prev}\n${line}` : line;
                                });
                                setTopicActions(prev => ({ ...prev, [i]: '' }));
                                toast({ title: `Action added for ${firstName}` });
                              }
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {/* Add topic */}
              <div className="flex gap-2 mt-2">
                <Input
                  value={newAgendaItem}
                  onChange={e => setNewAgendaItem(e.target.value)}
                  placeholder="Add topic..."
                  className="h-8 text-sm flex-1"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newAgendaItem.trim()) {
                      setNewAgendaItem('');
                    }
                  }}
                />
              </div>
            </section>

            {/* Action capture — for them | for me */}
            <section className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                <SecHdr icon={ClipboardList} label={`Actions for ${firstName}`} />
                <Textarea
                  value={actionDraftForThem}
                  onChange={e => setActionDraftForThem(e.target.value)}
                  placeholder={`@${firstName} send the Q3 plan by Friday\n@${firstName} loop me into the review`}
                  rows={3}
                  className="text-sm resize-none"
                />
                <Button size="sm" onClick={saveActionsForThem} disabled={savingForThem || !actionDraftForThem.trim()}>
                  {savingForThem ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                  Queue for {firstName}
                </Button>
              </div>

              <div className="rounded-lg border border-primary/30 bg-primary/[0.03] p-4 space-y-3">
                <SecHdr icon={CheckSquare} label="To-dos for me" />
                <Textarea
                  value={todoDraftForMe}
                  onChange={e => setTodoDraftForMe(e.target.value)}
                  placeholder={`Draft the Q3 narrative\nIntro to the team lead`}
                  rows={3}
                  className="text-sm resize-none"
                />
                <Button size="sm" onClick={saveTodosForMe} disabled={savingForMe || !todoDraftForMe.trim()}>
                  {savingForMe ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                  Add to My Lists
                </Button>
              </div>
            </section>

            {/* Context + prep instructions */}
            <section className="rounded-lg border border-border p-4 space-y-2">
              <SecHdr icon={FileText} label={`Context about ${firstName}`} />
              <Textarea
                value={contextDraft}
                onChange={e => setContextDraft(e.target.value)}
                placeholder={`e.g. ${firstName} cares deeply about shipping quality over speed.`}
                rows={3}
                className="text-sm resize-none"
              />
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={saveContext} disabled={savingContext}>
                  {savingContext ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                  Save context
                </Button>
                <span className="text-[10px] text-muted-foreground">Appended to every future prep</span>
              </div>
            </section>

            <section className="rounded-lg border border-border p-4 space-y-2">
              <SecHdr icon={Sparkles} label="Prep instructions" />
              <Textarea
                value={feedbackDraft}
                onChange={e => setFeedbackDraft(e.target.value)}
                placeholder="e.g. Always highlight blockers first. Don't repeat unchanged items."
                rows={3}
                className="text-sm resize-none"
              />
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={saveFeedback} disabled={savingFeedback}>
                  {savingFeedback ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                  Save instructions
                </Button>
                <span className="text-[10px] text-muted-foreground">Applied to every prep</span>
              </div>
            </section>
          </main>

          {/* Reference panel */}
          <aside className="hidden lg:flex flex-col border-l border-border bg-muted/30 overflow-y-auto">
            <div className="px-5 py-5 space-y-6">
              {/* My quarterly priorities — for context in the meeting */}
              {priorities.length > 0 && (
                <section>
                  <header className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                      <Target className="h-3.5 w-3.5" />
                      {firstName}&apos;s priorities
                    </h3>
                    {quarter && (
                      <span className="text-[10px] text-muted-foreground">{quarter.label}</span>
                    )}
                  </header>
                  <p className="text-[10px] text-muted-foreground mb-2 italic">{firstName}&apos;s priorities — for reference during the conversation</p>
                  <ol className="space-y-1.5">
                    {priorities.map(p => (
                      <li key={p.id} className="text-xs leading-snug flex items-start gap-2 px-2.5 py-2 rounded-md bg-background border border-border">
                        <span className="inline-flex h-4 w-4 rounded-full bg-primary/10 text-primary text-[9px] font-bold items-center justify-center mt-0.5 flex-shrink-0">
                          {p.display_order}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground leading-snug">{p.title}</p>
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
                </section>
              )}

              {/* Monthly commitments */}
              {commitments.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5 mb-2">
                    <ListChecks className="h-3.5 w-3.5" />
                    {firstName}&apos;s commitments
                  </h3>
                  <ol className="space-y-1.5">
                    {commitments.map(c => (
                      <li key={c.id} className="text-xs leading-snug flex items-start gap-2 px-2.5 py-2 rounded-md bg-background border border-border">
                        <span className="inline-flex h-4 w-4 rounded-full bg-amber-500/15 text-amber-700 text-[9px] font-bold items-center justify-center mt-0.5 flex-shrink-0">
                          {c.display_order}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground leading-snug">{c.title}</p>
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
                </section>
              )}

              {/* Recent Zoom calls */}
              {zoomRecordings.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5 mb-2">
                    <Video className="h-3.5 w-3.5" />
                    Recent Zoom calls
                  </h3>
                  <ul className="space-y-1.5">
                    {zoomRecordings.map(rec => (
                      <li key={rec.id} className="text-xs leading-snug px-2.5 py-2 rounded-md bg-background border border-border">
                        <p className="font-medium text-foreground leading-snug">{rec.topic ?? 'Untitled meeting'}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-muted-foreground">
                            {format(new Date(rec.start_time), 'MMM d')}
                          </span>
                          {rec.duration_minutes != null && (
                            <span className="text-[10px] text-muted-foreground">{rec.duration_minutes}min</span>
                          )}
                          {rec.has_transcript && (
                            <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-emerald-200 text-emerald-700">
                              Transcript
                            </Badge>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Shared doc */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5 mb-2">
                  <NotebookText className="h-3.5 w-3.5" />
                  Shared doc
                </h3>
                <a
                  href="#"
                  onClick={e => e.preventDefault()}
                  className="flex items-center gap-2.5 text-xs px-3 py-2.5 rounded-md bg-background border border-border hover:bg-muted/50 transition-colors"
                >
                  <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground text-[13px]">Arnaud × {firstName} 1:1 Notes</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Last edited 3 days ago</p>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                </a>
              </section>

              {/* Generated info */}
              <p className="text-[10px] text-muted-foreground text-center pt-2 border-t border-border">
                Generated {generatedLabel} · {source === 'ai_generated' ? 'AI' : source === 'cleargo' ? 'ClearGO' : 'Static'}
              </p>
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
