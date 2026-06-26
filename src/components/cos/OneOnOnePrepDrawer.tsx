import React, { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import {
  X, RefreshCw, Send, Loader2, FileText, Sparkles, Target, ListChecks,
  ClipboardList, NotebookText, CornerUpLeft,
  Repeat, Clock, Video, Brain, AlertTriangle, Check, Calendar,
  TrendingUp, Bot, Mail, Rocket, Flag, HelpCircle, History, Settings,
  ChevronDown, ChevronUp, ArrowUp, CircleCheck, UserPlus, Plus, EyeOff, Wrench, Star,
} from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import * as SheetPrimitive from '@radix-ui/react-dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { parseLocalDate } from '@/lib/dateUtils';
import { useRelationshipTopics, useForgottenCommitments } from '@/hooks/useRelationshipTopics';
import { toolLabel } from '@/lib/prepTools';
import { RelationshipTimeline } from '@/components/cos/RelationshipTimeline';
import type {
  QuarterlyPriority, MonthlyCommitment, CommitmentQuarter, CommitmentStatus,
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
  due_date: string | null;
  owner: 'them' | 'me';
  done: boolean;
}

interface ChatMessage {
  id: string;
  role: 'agent' | 'user';
  text: string;
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

type RelTone = { label: string; short: string; bg: string; fg: string; rail: string; dotColor: string };
const REL_TONE: Record<string, RelTone> = {
  direct_report: { label: 'Direct report', short: 'Report',  bg: 'bg-blue-50',   fg: 'text-blue-700',  rail: 'bg-blue-600',  dotColor: 'bg-blue-600' },
  collaborator:  { label: 'Collaborator',  short: 'Collaborator',  bg: 'bg-teal-50',   fg: 'text-teal-700',  rail: 'bg-teal-600',  dotColor: 'bg-teal-600' },
  boss:          { label: 'Manager',       short: 'Manager', bg: 'bg-[#e8eef7]', fg: 'text-[#04356c]', rail: 'bg-[#254677]', dotColor: 'bg-[#254677]' },
  skip_level:    { label: 'Skip-level',    short: 'Skip',    bg: 'bg-violet-50', fg: 'text-violet-700', rail: 'bg-violet-500', dotColor: 'bg-violet-500' },
  peer:          { label: 'Peer',          short: 'Peer',    bg: 'bg-gray-100',  fg: 'text-gray-600',  rail: 'bg-gray-400',  dotColor: 'bg-gray-400' },
  stakeholder:   { label: 'Stakeholder',   short: 'Stakeholder', bg: 'bg-slate-50',  fg: 'text-slate-700', rail: 'bg-slate-400', dotColor: 'bg-slate-400' },
  external:      { label: 'External',      short: 'External', bg: 'bg-stone-50', fg: 'text-stone-700', rail: 'bg-stone-400', dotColor: 'bg-stone-400' },
};

const DEFAULT_TONE: RelTone = {
  label: 'Team member', short: 'Team', bg: 'bg-slate-50', fg: 'text-slate-700', rail: 'bg-slate-400', dotColor: 'bg-slate-400',
};

const CADENCE_DAYS: Record<string, number> = {
  direct_report: 7, collaborator: 14, boss: 14, peer: 14, skip_level: 30, stakeholder: 30, external: 30,
};

const STATUS_META: Record<CommitmentStatus, { label: string; cls: string }> = {
  done:        { label: 'Done',        cls: 'bg-emerald-50 text-emerald-700' },
  in_progress: { label: 'In progress', cls: 'bg-amber-50 text-amber-700' },
  not_done:    { label: 'Off track',   cls: 'bg-red-50 text-red-700' },
  draft:       { label: 'Draft',       cls: 'bg-muted text-muted-foreground' },
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
function fmtShort(iso: string): string {
  const d = parseLocalDate(iso);
  return d ? `${MONTHS[d.getMonth()]} ${d.getDate()}` : iso;
}

type DueBadge = { label: string; cls: string; icon: React.ElementType };
function dueBadge(iso: string | null, done: boolean): DueBadge {
  if (!iso) return { label: 'No date', cls: 'bg-muted text-muted-foreground', icon: Calendar };
  const d = parseLocalDate(iso);
  if (!d) return { label: 'No date', cls: 'bg-muted text-muted-foreground', icon: Calendar };
  const diff = Math.round((d.getTime() - startOfToday().getTime()) / 86_400_000);
  if (diff < 0) {
    return done
      ? { label: `Was due ${fmtShort(iso)}`, cls: 'bg-muted text-muted-foreground', icon: Calendar }
      : { label: `Overdue · ${fmtShort(iso)}`, cls: 'bg-red-50 text-red-700', icon: AlertTriangle };
  }
  if (diff === 0) return { label: 'Due today', cls: 'bg-orange-50 text-orange-700', icon: Clock };
  if (diff <= 2) return { label: `Due ${fmtShort(iso)}`, cls: 'bg-orange-50 text-orange-700', icon: Clock };
  return { label: `Due ${fmtShort(iso)}`, cls: 'bg-muted text-muted-foreground', icon: Calendar };
}

// Pull a joinable meeting URL out of a calendar event, if there is one.
// Calendar sync stores the link in location/description; Zoom calls also
// carry a meeting id we can rebuild a join URL from.
const URL_RE = /https?:\/\/[^\s<>"')]+/i;
function deriveMeetingUrl(ev?: { location: string | null; description: string | null; zoom_meeting_id: string | null }): string | null {
  if (!ev) return null;
  if (ev.zoom_meeting_id) return `https://zoom.us/j/${ev.zoom_meeting_id}`;
  if (ev.location && URL_RE.test(ev.location)) return ev.location.match(URL_RE)![0];
  if (ev.description) { const m = ev.description.match(URL_RE); if (m) return m[0]; }
  return null;
}

// Section header used throughout the drawer
function SecHdr({ icon: Icon, label, right }: { icon: React.ElementType; label: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-[17px] w-[17px] text-muted-foreground" />
      <span className="text-[11px] font-semibold tracking-[0.06em] uppercase text-muted-foreground">{label}</span>
      {right}
    </div>
  );
}

// Card shell matching the design's surface cards
function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-lg border border-border bg-card', className)}>{children}</div>
  );
}

// ── The drawer ──────────────────────────────────────────────────────────────

type TabKey = 'prep' | 'past' | 'ask' | 'timeline' | 'settings';

export function OneOnOnePrepDrawer({
  open, member, content, source, generatedAt,
  refreshing, sharing, aiGenerating,
  onClose, onRefresh, onShare, onAiGenerate,
}: PrepDrawerProps) {
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<TabKey>('prep');

  // Commitments carried forward (cos_meeting_actions)
  const [pastActions, setPastActions] = useState<PendingAction[]>([]);
  const [assignInput, setAssignInput] = useState('');
  const [mineInput, setMineInput] = useState('');

  // Talking points (derived from the prep brief) + custom additions
  const [excludedPoints, setExcludedPoints] = useState<Set<string>>(new Set());
  const [customPoints, setCustomPoints] = useState<Array<{ id: string; text: string; included: boolean }>>([]);
  const [newPoint, setNewPoint] = useState('');
  const [showAllPoints, setShowAllPoints] = useState(false);

  // How many talking points to surface before the "show more" cut-off.
  const TALKING_POINTS_VISIBLE = 5;

  // Questions to ask
  const [pickedQuestions, setPickedQuestions] = useState<Set<number>>(new Set());

  // Settings drafts
  const [contextDraft, setContextDraft] = useState('');
  const [savingContext, setSavingContext] = useState(false);
  const [savedContext, setSavedContext] = useState(false);
  const [feedbackDraft, setFeedbackDraft] = useState('');
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState(false);

  // Reference data
  const [quarter, setQuarter] = useState<CommitmentQuarter | null>(null);
  const [priorities, setPriorities] = useState<QuarterlyPriority[]>([]);
  const [commitments, setCommitments] = useState<MonthlyCommitment[]>([]);
  const [zoomRecordings, setZoomRecordings] = useState<Array<{
    id: string; topic: string | null; start_time: string;
    duration_minutes: number | null; has_transcript: boolean; ai_summary: string | null;
  }>>([]);
  const [nextMeetingUrl, setNextMeetingUrl] = useState<string | null>(null);

  // Recognitions from #success Slack channel
  type Recognition = { giver: string; receiver: string; excerpt: string; date: string };
  const [recognitions, setRecognitions] = useState<Recognition[]>([]);

  // Ask / agent chat
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [askInput, setAskInput] = useState('');
  const [askLoading, setAskLoading] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const { topics: relTopics, updateTopicStatus } = useRelationshipTopics(member?.id ?? null);
  const { commitments: forgottenItems } = useForgottenCommitments(member?.id ?? null);

  const firstName = member?.name.split(' ')[0] ?? '';

  // Reset transient state + load carry-forward / settings on open
  useEffect(() => {
    if (!open || !member) return;
    setActiveTab('prep');
    setAssignInput('');
    setMineInput('');
    setNewPoint('');
    setExcludedPoints(new Set());
    setCustomPoints([]);
    setPickedQuestions(new Set());
    setNextMeetingUrl(null);
    setContextDraft(member.context_notes ?? '');
    setChat([{
      id: 'greeting',
      role: 'agent',
      text: `Hi — I've prepped your 1:1 with ${member.name.split(' ')[0]}. Ask me anything about them, the last meeting, or what's still open. I'm grounded in your saved context and your past 1:1 history.`,
    }]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    db.from('cos_meeting_actions')
      .select('id, text, created_at, due_date, owner')
      .eq('member_id', member.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .then(({ data }: { data: Array<{ id: string; text: string; created_at: string; due_date: string | null; owner: 'them' | 'me' | null }> | null }) =>
        setPastActions((data ?? []).map(a => ({ ...a, owner: a.owner ?? 'them', done: false }))));

    db.from('cos_prep_settings')
      .select('prep_instructions')
      .single()
      .then(({ data }: { data: { prep_instructions: string } | null }) => {
        setFeedbackDraft(data?.prep_instructions ?? '');
      });

    db.from('cos_zoom_recordings')
      .select('id, topic, start_time, duration_minutes, has_transcript, ai_summary')
      .eq('team_member_id', member.id)
      .order('start_time', { ascending: false })
      .limit(8)
      .then(({ data }: { data: Array<{ id: string; topic: string | null; start_time: string; duration_minutes: number | null; has_transcript: boolean; ai_summary: string | null }> | null }) => {
        setZoomRecordings(data ?? []);
      })
      .catch(() => setZoomRecordings([]));

    // Next upcoming 1:1 — used to wire the "Start Zoom" button to the real call.
    db.from('cos_one_on_one_events')
      .select('location, description, zoom_meeting_id, start_time')
      .eq('team_member_id', member.id)
      .neq('status', 'cancelled')
      .gte('start_time', new Date().toISOString())
      .order('start_time', { ascending: true })
      .limit(1)
      .then(({ data }: { data: Array<{ location: string | null; description: string | null; zoom_meeting_id: string | null }> | null }) => {
        setNextMeetingUrl(deriveMeetingUrl(data?.[0]));
      })
      .catch(() => setNextMeetingUrl(null));
  }, [open, member]);

  // Load the member's quarterly priorities + monthly commitments for reference
  useEffect(() => {
    if (!open || !member) return;
    let cancelled = false;
    async function load() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      let memberUserId: string | null = null;
      if (member!.email) {
        const { data: profile } = await db
          .from('profiles')
          .select('id')
          .eq('email', member!.email)
          .maybeSingle();
        memberUserId = profile?.id ?? null;
      }
      if (!memberUserId || cancelled) { setPriorities([]); setCommitments([]); return; }

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
      if (!q) { setPriorities([]); setCommitments([]); return; }
      const qStart = parseLocalDate(q.start_date);
      const nowMonth = new Date().getMonth();
      const monthNum = qStart ? Math.min(3, Math.max(1, nowMonth - qStart.getMonth() + 1)) : 1;
      const [priRes, comRes] = await Promise.all([
        db.from('quarterly_priorities').select('*')
          .eq('quarter_id', q.id).eq('user_id', memberUserId).order('display_order'),
        db.from('monthly_commitments').select('*')
          .eq('quarter_id', q.id).eq('user_id', memberUserId).eq('month_number', monthNum).order('display_order'),
      ]);
      if (cancelled) return;
      setPriorities(priRes.data ?? []);
      setCommitments(comRes.data ?? []);
    }
    load();
    return () => { cancelled = true; };
  }, [open, member]);

  // Load recognitions from #success Slack channel involving either party since last 1:1
  useEffect(() => {
    if (!open || !member) { setRecognitions([]); return; }
    let cancelled = false;
    async function loadRecognitions() {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const db = supabase as any;
        const { data: { user: me } } = await supabase.auth.getUser();
        if (!me || cancelled) return;

        const { data: myProfile } = await db.from('profiles').select('full_name').eq('id', me.id).maybeSingle();
        const myFullName: string = myProfile?.full_name ?? '';

        const since = member!.last_1on1_date
          ? (() => {
              const d = parseLocalDate(member!.last_1on1_date!);
              d?.setHours(0, 0, 0, 0);
              return d?.toISOString() ?? new Date(Date.now() - 30 * 86_400_000).toISOString();
            })()
          : new Date(Date.now() - 30 * 86_400_000).toISOString();

        const { data: msgs } = await db
          .from('cos_slack_messages')
          .select('content, message_date')
          .eq('channel_name', 'success')
          .gte('message_date', since)
          .order('message_date', { ascending: false })
          .limit(100);

        if (cancelled) return;

        const SHOUTOUT_RE = /^(.+?)\s+gave a shout out to\s+(.+?)(?:\n|$)/im;
        const memberLc = member!.name.toLowerCase();
        const myLc = myFullName.toLowerCase();

        type Recognition = { giver: string; receiver: string; excerpt: string; date: string };
        const parsed: Recognition[] = ((msgs ?? []) as Array<{ content: string; message_date: string }>)
          .map(msg => {
            const m = SHOUTOUT_RE.exec(msg.content);
            if (!m) return null;
            const giver = m[1].trim();
            const receiver = m[2].trim();
            const lines = msg.content.split('\n').filter((l: string) => l.trim());
            const excerpt = lines.slice(1).join(' ').trim().slice(0, 200);
            return { giver, receiver, excerpt, date: msg.message_date };
          })
          .filter((r): r is Recognition => {
            if (!r) return false;
            const gl = r.giver.toLowerCase();
            const rl = r.receiver.toLowerCase();
            const involvesMember = gl.includes(memberLc) || rl.includes(memberLc);
            const involvesMe = myLc.length > 0 && (gl.includes(myLc) || rl.includes(myLc));
            return involvesMember || involvesMe;
          });

        if (!cancelled) setRecognitions(parsed);
      } catch {
        if (!cancelled) setRecognitions([]);
      }
    }
    loadRecognitions();
    return () => { cancelled = true; };
  }, [open, member]);

  // Auto-scroll the chat as messages arrive
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chat]);

  const topics = useMemo(() => parsePrepMarkdown(content), [content]);

  // Filter out noise topics (generic boilerplate, empty-result sections)
  const NOISE_PATTERNS = [
    /no\s+(recent\s+)?zoom\s+(call\s+)?recordings?\s+found/i,
    /no\s+recordings?\s+(were\s+)?found/i,
    /not\s+worth\s+mentioning/i,
    /^ClearGO\s+Context$/i,
    /^ClearGO\s+is\s+the\s+bi-weekly/i,
  ];
  const filteredTopics = useMemo(() => {
    const isNoise = (t: TopicSection) => {
      const fullText = [t.heading, ...t.paragraphs, ...t.bullets].join(' ');
      return NOISE_PATTERNS.some(p => p.test(fullText));
    };
    // Drop pure section dividers (no body) — talking points need substance.
    return topics.filter(t => !isNoise(t) && (t.bullets.length || t.paragraphs.length));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topics]);

  // ── Commitment helpers ──────────────────────────────────────────────────────
  const sortedCommitments = useMemo(() => {
    const today = startOfToday().getTime();
    return [...pastActions].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      const ao = a.due_date ? (parseLocalDate(a.due_date)?.getTime() ?? Infinity) : Infinity;
      const bo = b.due_date ? (parseLocalDate(b.due_date)?.getTime() ?? Infinity) : Infinity;
      const aOverdue = !a.done && a.due_date && ao < today;
      const bOverdue = !b.done && b.due_date && bo < today;
      if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
      return ao - bo;
    });
  }, [pastActions]);

  const overdueCount = useMemo(() => {
    const today = startOfToday().getTime();
    return pastActions.filter(a => !a.done && a.due_date && (parseLocalDate(a.due_date)?.getTime() ?? Infinity) < today).length;
  }, [pastActions]);

  const toggleAction = async (id: string) => {
    const target = pastActions.find(a => a.id === id);
    if (!target) return;
    const nextDone = !target.done;
    setPastActions(prev => prev.map(a => a.id === id ? { ...a, done: nextDone } : a));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('cos_meeting_actions')
      .update({ status: nextDone ? 'done' : 'pending' }).eq('id', id);
  };

  const addAssignAction = async () => {
    const text = assignInput.trim();
    if (!text || !member) return;
    setAssignInput('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from('cos_meeting_actions')
        .insert({ user_id: user.id, member_id: member.id, text, owner: 'them' })
        .select('id, text, created_at, due_date, owner')
        .single();
      if (error) throw error;
      setPastActions(prev => [{ ...data, done: false }, ...prev]);
      toast({ title: `Queued for ${firstName}` });
    } catch (err) {
      toast({ title: 'Failed to add action', description: String(err), variant: 'destructive' });
    }
  };

  const addMyCommitment = async () => {
    const text = mineInput.trim();
    if (!text || !member) return;
    setMineInput('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from('cos_meeting_actions')
        .insert({ user_id: user.id, member_id: member.id, text, owner: 'me' })
        .select('id, text, created_at, due_date, owner')
        .single();
      if (error) throw error;
      setPastActions(prev => [{ ...data, done: false }, ...prev]);
      toast({ title: 'Added as your commitment' });
    } catch (err) {
      toast({ title: 'Failed to add commitment', description: String(err), variant: 'destructive' });
    }
  };

  // ── Talking points ──────────────────────────────────────────────────────────
  // Rank by urgency signals in the topic text rather than markdown order, so the
  // most pressing items (overdue, at-risk, blockers) surface as P1.
  const rankedPoints = useMemo(() => {
    const P1 = /overdue|at[\s-]?risk|slipping|slipped|blocker|blocked|behind|escalat|urgent|past[\s-]?due|missed|jeopard/i;
    const P2 = /decision|deadline|\bdue\b|launch|ship|review|sign[\s-]?off|approval|commit|deliver/i;
    const tierOf = (t: TopicSection) => {
      const text = [t.heading, ...t.paragraphs, ...t.bullets].join(' ');
      if (P1.test(text)) return 0;
      if (P2.test(text)) return 1;
      return 2;
    };
    return filteredTopics
      .map((t, i) => ({
        key: `tp-${i}`,
        heading: t.heading,
        why: t.paragraphs.length ? t.paragraphs.join(' ') : t.bullets.join(' · '),
        tier: tierOf(t),
        order: i,
      }))
      .sort((a, b) => a.tier - b.tier || a.order - b.order)
      .map(p => {
        const rankLabel = `P${p.tier + 1}`;
        const rankCls = p.tier === 0 ? 'bg-orange-50 text-orange-700' : p.tier === 1 ? 'bg-amber-50 text-amber-700' : 'bg-muted text-muted-foreground';
        return { ...p, rankLabel, rankCls };
      });
  }, [filteredTopics]);

  const togglePoint = (key: string) => setExcludedPoints(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const addPoint = () => {
    const text = newPoint.trim();
    if (!text) return;
    setCustomPoints(prev => [...prev, { id: 'c' + Date.now(), text, included: true }]);
    setNewPoint('');
  };
  const toggleCustomPoint = (id: string) =>
    setCustomPoints(prev => prev.map(p => p.id === id ? { ...p, included: !p.included } : p));
  const includedCount =
    rankedPoints.filter(p => !excludedPoints.has(p.key)).length +
    customPoints.filter(p => p.included).length;

  // ── Questions ────────────────────────────────────────────────────────────────
  const questions = useMemo(() => ([
    `What's the single biggest blocker on your plate right now?`,
    `What do you need from me to keep things on track?`,
    `How are you feeling about your current workload and priorities?`,
    `Is our current 1:1 cadence working for you?`,
  ]), []);
  const toggleQuestion = (i: number) => setPickedQuestions(prev => {
    const next = new Set(prev);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  });

  // ── Settings saves ────────────────────────────────────────────────────────────
  const saveContext = async () => {
    if (!member) return;
    setSavingContext(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('cos_team_members')
        .update({ context_notes: contextDraft || null })
        .eq('id', member.id);
      if (error) throw error;
      setSavedContext(true);
      setTimeout(() => setSavedContext(false), 1800);
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
      setSavedFeedback(true);
      setTimeout(() => setSavedFeedback(false), 1800);
    } catch (err) {
      toast({ title: 'Failed to save instructions', description: String(err), variant: 'destructive' });
    } finally {
      setSavingFeedback(false);
    }
  };

  // ── Ask / agent chat ──────────────────────────────────────────────────────────
  const sendAsk = async (raw?: string) => {
    const q = (raw ?? askInput).trim();
    if (!q || askLoading || !member) return;
    setAskInput('');
    setChat(prev => [...prev, { id: 'u' + Date.now(), role: 'user', text: q }]);
    setAskLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/query-relationship-history`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_member_id: member.id, question: q }),
      });
      if (!res.ok) {
        if (res.status === 429) throw new Error('Daily query limit reached (max 10 per day).');
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json() as { answer: string };
      setChat(prev => [...prev, { id: 'a' + Date.now(), role: 'agent', text: data.answer }]);
    } catch (err) {
      setChat(prev => [...prev, {
        id: 'a' + Date.now(), role: 'agent',
        text: `Sorry — I couldn't reach your relationship history just now. ${err instanceof Error ? err.message : ''}`.trim(),
      }]);
    } finally {
      setAskLoading(false);
    }
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

  // AI coach summary — derived from the real signals we have on hand.
  const offTrackPriorities = useMemo(
    () => priorities.filter(p => p.status === 'not_done'),
    [priorities],
  );
  const coachSummary = useMemo(() => {
    const bits: string[] = [];
    if (overdueCount > 0) bits.push(`${overdueCount} commitment${overdueCount === 1 ? '' : 's'} from past 1:1s ${overdueCount === 1 ? 'is' : 'are'} overdue — clear ${overdueCount === 1 ? 'it' : 'those'} first.`);
    if (offTrackPriorities.length > 0) bits.push(`${offTrackPriorities.length} of ${firstName}'s quarterly ${offTrackPriorities.length === 1 ? 'priority is' : 'priorities are'} off track${offTrackPriorities.length === 1 ? ` — "${offTrackPriorities[0].title}"` : ''}.`);
    if (forgottenItems.length > 0) bits.push(`${forgottenItems.length} item${forgottenItems.length === 1 ? ' has' : 's have'} been sitting unresolved for a while.`);
    if (filteredTopics.length > 0) bits.push(`${filteredTopics.length} talking point${filteredTopics.length === 1 ? '' : 's'} are suggested below, ordered by priority.`);
    if (bits.length === 0) return `Your prep is ready. Review the talking points and check off anything you've already handled.`;
    return bits.join(' ');
  }, [overdueCount, offTrackPriorities, forgottenItems.length, filteredTopics.length, firstName]);

  if (!member) return null;

  const tone = REL_TONE[member.relationship_type] ?? DEFAULT_TONE;
  const lastLabel = member.last_1on1_date
    ? format(parseLocalDate(member.last_1on1_date) ?? new Date(member.last_1on1_date), 'MMM d')
    : null;
  const cadenceDays = CADENCE_DAYS[member.relationship_type] ?? 14;
  const cadenceLabel = cadenceDays <= 7 ? 'Weekly 1:1' : cadenceDays <= 14 ? 'Bi-weekly 1:1' : 'Monthly 1:1';
  const pastCount = zoomRecordings.length;
  const metLabel = pastCount > 0
    ? `${pastCount} past 1:1${pastCount === 1 ? '' : 's'}${lastLabel ? ` · last met ${lastLabel}` : ''}`
    : lastLabel ? `Last met ${lastLabel}` : 'No prior 1:1 logged';

  const TABS: Array<{ key: TabKey; label: string; icon: React.ElementType; badge?: number }> = [
    { key: 'prep', label: 'Prep', icon: ListChecks },
    { key: 'past', label: 'Past 1:1s', icon: FileText, badge: pastCount || undefined },
    { key: 'ask', label: 'Ask', icon: HelpCircle },
    { key: 'timeline', label: 'Timeline', icon: History },
  ];

  return (
    <Sheet open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <SheetContent
        side="right"
        // Hide the built-in Radix close button via [&>button]:hidden — we have our own
        className="w-screen sm:max-w-full inset-0 p-0 border-0 flex flex-col gap-0 [&>button]:hidden bg-background"
      >
        <SheetPrimitive.Title className="sr-only">{member.name} — 1:1 Prep</SheetPrimitive.Title>

        {/* ===== HEADER ===== */}
        <header className="flex-shrink-0 px-7 pt-[18px] border-b border-border/60">
          <div className="flex items-start gap-4">
            <div className={cn('h-14 w-14 rounded-full flex items-center justify-center text-white font-bold text-lg flex-shrink-0', tone.rail)}>
              {initials(member.name)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5">
                <h1 className="font-heading font-bold text-[23px] tracking-[-0.02em] leading-none">{member.name}</h1>
                <span className={cn('inline-flex items-center gap-1.5 text-xs font-semibold rounded-full px-2.5 py-[3px]', tone.bg, tone.fg)}>
                  <span className={cn('w-1.5 h-1.5 rounded-full', tone.dotColor)} />
                  {tone.label}
                </span>
              </div>
              <div className="flex items-center gap-[18px] mt-[7px] text-[13px] text-muted-foreground flex-wrap">
                <span className="inline-flex items-center gap-1.5"><Repeat className="h-[15px] w-[15px]" />{cadenceLabel}</span>
                <span className="inline-flex items-center gap-1.5"><Clock className="h-[15px] w-[15px]" />{metLabel}</span>
                {member.email && <span className="inline-flex items-center gap-1.5"><Mail className="h-[15px] w-[15px]" />{member.email}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {nextMeetingUrl && (
                <>
                  <Button size="sm" className="h-9 gap-1.5" onClick={() => window.open(nextMeetingUrl, '_blank', 'noopener')}>
                    <Video className="h-[17px] w-[17px]" />Join call
                  </Button>
                  <div className="w-px h-6 bg-border mx-0.5" />
                </>
              )}
              {onAiGenerate && (
                <Button size="sm" variant="secondary" className="h-9 gap-1.5" disabled={aiGenerating} onClick={onAiGenerate}>
                  {aiGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-primary" />}
                  {aiGenerating ? 'Generating…' : 'AI generate'}
                </Button>
              )}
              <Button size="sm" variant="secondary" className="h-9 gap-1.5" disabled={sharing} onClick={onShare}>
                {sharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Share
              </Button>
              <div className="w-px h-6 bg-border mx-0.5" />
              <button onClick={onClose} aria-label="Close" className="h-[34px] w-[34px] grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* tabs */}
          <div className="flex gap-1 mt-[18px]">
            {TABS.map(t => {
              const active = activeTab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={cn(
                    'flex items-center gap-[7px] py-2.5 px-1 mr-[18px] text-sm border-b-2 transition-colors',
                    active ? 'font-semibold text-foreground border-primary' : 'font-normal text-muted-foreground border-transparent hover:text-foreground',
                  )}
                >
                  <t.icon className="h-4 w-4" />{t.label}
                  {t.badge != null && (
                    <span className="text-[11px] font-semibold px-[7px] py-px rounded-full bg-muted text-muted-foreground">{t.badge}</span>
                  )}
                </button>
              );
            })}
            <button
              onClick={() => setActiveTab('settings')}
              className={cn(
                'flex items-center gap-[7px] py-2.5 px-1 ml-auto text-sm border-b-2 transition-colors',
                activeTab === 'settings' ? 'font-semibold text-foreground border-primary' : 'font-normal text-muted-foreground border-transparent hover:text-foreground',
              )}
            >
              <Settings className="h-4 w-4" />Settings
            </button>
          </div>
        </header>

        {/* ===== BODY ===== */}
        <div className="flex-1 overflow-y-auto">

          {/* ---------- PREP TAB ---------- */}
          {activeTab === 'prep' && (
            <div className="max-w-[1280px] mx-auto px-7 pt-[22px] pb-10 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_344px] gap-6 items-start">

              {/* LEFT COLUMN */}
              <div className="flex flex-col gap-4 min-w-0">

                {/* AI coach summary */}
                <div className="flex gap-3.5 px-5 py-[17px] rounded-lg bg-accent/50 border border-border/70">
                  <span className="w-[34px] h-[34px] flex-shrink-0 rounded-[9px] bg-card grid place-items-center shadow-sm">
                    <Sparkles className="h-[19px] w-[19px] text-primary" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] font-bold mb-0.5">Your agent&apos;s read on this 1:1</div>
                    <div className="text-[13.5px] leading-[1.55] text-foreground">{coachSummary}</div>
                    <div className="flex items-center gap-3 mt-3 pt-2.5 border-t border-border/60">
                      <span className="text-xs text-muted-foreground">Generated {generatedLabel} · {source === 'ai_generated' ? 'AI' : source === 'cleargo' ? 'ClearGO' : 'Static'}</span>
                      <Button size="sm" variant="ghost" className="h-7 gap-1.5 ml-auto -mr-2 text-xs" disabled={refreshing} onClick={onRefresh}>
                        {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}Refresh
                      </Button>
                    </div>
                  </div>
                </div>

                {/* OPEN COMMITMENTS */}
                <Card className="px-[22px] pt-[18px] pb-4">
                  <SecHdr icon={Flag} label="Open assignments" right={
                    <span className={cn('ml-auto inline-flex items-center gap-1.5 text-xs font-semibold px-[11px] py-[3px] rounded-full',
                      overdueCount > 0 ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700')}>
                      {overdueCount > 0 ? <AlertTriangle className="h-[13px] w-[13px]" /> : <CircleCheck className="h-[13px] w-[13px]" />}
                      {overdueCount > 0 ? `${overdueCount} overdue` : 'All on track'}
                    </span>
                  } />
                  <p className="text-[12.5px] text-muted-foreground mt-1 mb-2">What you both committed to in past 1:1s. Overdue first — check off what&apos;s done.</p>

                  {sortedCommitments.length === 0 ? (
                    <p className="text-[13px] text-muted-foreground italic py-5 border-t border-border/60">No open commitments carried over.</p>
                  ) : sortedCommitments.map(a => {
                    const db = dueBadge(a.due_date, a.done);
                    const DueIcon = db.icon;
                    const mine = a.owner === 'me';
                    return (
                      <button key={a.id} onClick={() => toggleAction(a.id)} className="w-full flex gap-3 items-start py-[13px] text-left border-t border-border/60 hover:bg-muted/40 transition-colors -mx-[22px] px-[22px]">
                        {a.done ? (
                          <span className="w-[19px] h-[19px] flex-shrink-0 mt-px rounded-[5px] bg-primary grid place-items-center"><Check className="h-[13px] w-[13px] text-primary-foreground" /></span>
                        ) : (
                          <span className={cn('w-[19px] h-[19px] flex-shrink-0 mt-px rounded-[5px] border-[1.5px] bg-background', overdueCount && a.due_date && !a.done && (parseLocalDate(a.due_date)?.getTime() ?? Infinity) < startOfToday().getTime() ? 'border-red-500' : 'border-input')} />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className={cn('text-sm leading-snug', a.done ? 'text-muted-foreground line-through' : 'font-medium text-foreground')}>{a.text}</div>
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            {mine ? (
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-[9px] py-0.5 rounded-full bg-blue-50 text-blue-700">
                                <span className="w-[5px] h-[5px] rounded-full bg-blue-700" />You
                              </span>
                            ) : (
                              <span className={cn('inline-flex items-center gap-1.5 text-[11px] font-semibold px-[9px] py-0.5 rounded-full', tone.bg, tone.fg)}>
                                <span className={cn('w-[5px] h-[5px] rounded-full', tone.dotColor)} />{firstName}
                              </span>
                            )}
                            <span className={cn('inline-flex items-center gap-1.5 text-[11px] font-semibold px-[9px] py-0.5 rounded-md', db.cls)}>
                              <DueIcon className="h-3 w-3" />{db.label}
                            </span>
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-[9px] py-0.5 rounded-md bg-muted text-muted-foreground">
                              <CornerUpLeft className="h-3 w-3" />From {format(new Date(a.created_at), 'MMM d')}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-3 pt-[13px] border-t border-border/60">
                    <div className="flex items-center gap-2 px-[11px] py-[9px] border border-dashed border-input rounded-md">
                      <UserPlus className="h-[15px] w-[15px] text-muted-foreground flex-shrink-0" />
                      <input value={assignInput} onChange={e => setAssignInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addAssignAction(); }}
                        placeholder={`Assign to ${firstName} — Enter`} className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[13px]" />
                    </div>
                    <div className="flex items-center gap-2 px-[11px] py-[9px] border border-dashed border-input rounded-md">
                      <Plus className="h-[15px] w-[15px] text-muted-foreground flex-shrink-0" />
                      <input value={mineInput} onChange={e => setMineInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addMyCommitment(); }}
                        placeholder="Add for me — Enter" className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[13px]" />
                    </div>
                  </div>
                </Card>

                {/* TALKING POINTS */}
                <Card className="px-[22px] pt-[18px] pb-2">
                  <SecHdr icon={ListChecks} label="Talking points" right={
                    <>
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-accent text-primary"><Sparkles className="h-3 w-3" />Suggested</span>
                      <span className="ml-auto text-[12.5px] text-muted-foreground">{includedCount} on the agenda</span>
                    </>
                  } />
                  <p className="text-[12.5px] text-muted-foreground mt-1 mb-0.5">Ordered by priority. Check the ones to cover — checked points become your agenda.</p>

                  {rankedPoints.length === 0 && customPoints.length === 0 ? (
                    (aiGenerating || refreshing) ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 border-t border-border/60"><Loader2 className="h-4 w-4 animate-spin" />Generating your prep brief…</div>
                    ) : (
                      <p className="text-[13px] text-muted-foreground italic py-6 border-t border-border/60">No talking points yet — hit AI generate to draft a brief.</p>
                    )
                  ) : (
                    <>
                      {(showAllPoints ? rankedPoints : rankedPoints.slice(0, TALKING_POINTS_VISIBLE)).map(p => {
                        const included = !excludedPoints.has(p.key);
                        return (
                          <button key={p.key} onClick={() => togglePoint(p.key)} className="w-full flex gap-3.5 py-3.5 text-left border-t border-border/60 hover:bg-muted/40 transition-colors -mx-[22px] px-[22px]">
                            {included ? (
                              <span className="w-5 h-5 flex-shrink-0 mt-px rounded-[5px] bg-primary grid place-items-center"><Check className="h-3.5 w-3.5 text-primary-foreground" /></span>
                            ) : (
                              <span className="w-5 h-5 flex-shrink-0 mt-px rounded-[5px] border-[1.5px] border-input bg-background" />
                            )}
                            <div className={cn('flex-1 min-w-0 transition-opacity', !included && 'opacity-40')}>
                              <div className="flex items-center gap-2.5">
                                <span className={cn('text-[10.5px] font-bold tracking-wide px-[7px] py-0.5 rounded', p.rankCls)}>{p.rankLabel}</span>
                                <span className={cn('text-[14.5px] font-semibold', !included && 'line-through font-normal text-muted-foreground')}>{inlineMd(p.heading)}</span>
                              </div>
                              {p.why && <div className={cn('text-[13px] text-muted-foreground mt-1.5 leading-[1.5]', !included && 'line-through')}>{inlineMd(p.why)}</div>}
                              <span className="inline-flex items-center gap-1.5 mt-2.5 text-[11.5px] font-medium px-[9px] py-[3px] rounded-md bg-muted text-muted-foreground"><FileText className="h-[13px] w-[13px]" />From prep brief</span>
                            </div>
                          </button>
                        );
                      })}
                      {rankedPoints.length > TALKING_POINTS_VISIBLE && (
                        <button onClick={() => setShowAllPoints(v => !v)} className="w-full flex items-center justify-center gap-1.5 py-3 text-[12.5px] font-semibold text-primary border-t border-border/60 hover:bg-muted/40 transition-colors -mx-[22px] px-[22px]">
                          {showAllPoints
                            ? <>Show fewer<ChevronUp className="h-3.5 w-3.5" /></>
                            : <>Show {rankedPoints.length - TALKING_POINTS_VISIBLE} more<ChevronDown className="h-3.5 w-3.5" /></>}
                        </button>
                      )}
                      {customPoints.map(p => (
                        <button key={p.id} onClick={() => toggleCustomPoint(p.id)} className="w-full flex gap-3.5 py-3.5 text-left border-t border-border/60 hover:bg-muted/40 transition-colors -mx-[22px] px-[22px]">
                          {p.included ? (
                            <span className="w-5 h-5 flex-shrink-0 mt-px rounded-[5px] bg-primary grid place-items-center"><Check className="h-3.5 w-3.5 text-primary-foreground" /></span>
                          ) : (
                            <span className="w-5 h-5 flex-shrink-0 mt-px rounded-[5px] border-[1.5px] border-input bg-background" />
                          )}
                          <div className={cn('flex-1 min-w-0 transition-opacity', !p.included && 'opacity-40')}>
                            <div className="flex items-center gap-2.5">
                              <span className="text-[10.5px] font-bold tracking-wide px-[7px] py-0.5 rounded bg-blue-50 text-blue-700">You</span>
                              <span className={cn('text-[14.5px] font-semibold', !p.included && 'line-through font-normal text-muted-foreground')}>{p.text}</span>
                            </div>
                            <span className="inline-flex items-center gap-1.5 mt-2.5 text-[11.5px] font-medium px-[9px] py-[3px] rounded-md bg-muted text-muted-foreground"><Plus className="h-[13px] w-[13px]" />Custom topic</span>
                          </div>
                        </button>
                      ))}
                    </>
                  )}

                  <div className="flex items-center gap-2.5 my-2 mb-3.5 px-3 py-2.5 border border-dashed border-input rounded-md">
                    <Plus className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <input value={newPoint} onChange={e => setNewPoint(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addPoint(); }}
                      placeholder="Add your own talking point — press Enter" className="flex-1 bg-transparent border-0 outline-none text-[13.5px]" />
                  </div>
                </Card>
              </div>

              {/* RIGHT RAIL */}
              <div className="flex flex-col gap-3.5">
                {/* recognition banner */}
                {recognitions.length > 0 && (
                  <RecognitionBanner recognitions={recognitions} />
                )}
                {/* questions to ask */}
                <Card className="px-[18px] py-4">
                  <div className="text-[11px] font-semibold tracking-[0.06em] uppercase text-muted-foreground flex items-center gap-1.5 mb-1"><HelpCircle className="h-3.5 w-3.5" />Questions to ask</div>
                  <p className="text-[11.5px] text-muted-foreground mb-1.5">Pick a few to anchor the conversation.</p>
                  {questions.map((q, i) => {
                    const picked = pickedQuestions.has(i);
                    return (
                      <button key={i} onClick={() => toggleQuestion(i)} className="w-full flex items-start gap-2.5 py-2.5 text-left border-t border-border/60 hover:bg-muted/40 transition-colors -mx-[18px] px-[18px]">
                        {picked ? (
                          <span className="w-[18px] h-[18px] flex-shrink-0 mt-px rounded-full bg-primary grid place-items-center"><Check className="h-3 w-3 text-primary-foreground" /></span>
                        ) : (
                          <span className="w-[18px] h-[18px] flex-shrink-0 mt-px rounded-full border-[1.5px] border-input bg-background" />
                        )}
                        <span className={cn('text-[12.5px] leading-snug', !picked && 'text-muted-foreground')}>{q}</span>
                      </button>
                    );
                  })}
                </Card>

                {/* priority check-in */}
                {priorities.length > 0 && (
                  <Card className="px-[18px] py-4">
                    <div className="text-[11px] font-semibold tracking-[0.06em] uppercase text-muted-foreground flex items-center gap-1.5 mb-1"><Rocket className="h-3.5 w-3.5" />Priority check-in</div>
                    <p className="text-[11.5px] text-muted-foreground mb-2.5">{firstName}&apos;s priorities this quarter{quarter ? ` · ${quarter.label}` : ''}.</p>
                    <ul className="space-y-1.5">
                      {priorities.map(p => {
                        const sm = STATUS_META[p.status] ?? STATUS_META.draft;
                        return (
                          <li key={p.id} className="text-xs flex flex-col gap-1.5 px-2.5 py-2 rounded-md bg-background border border-border">
                            <p className="font-medium leading-snug text-[12.5px]">{p.title}</p>
                            <span className={cn('inline-flex items-center gap-1.5 self-start text-[10px] font-semibold px-2 py-0.5 rounded-full', sm.cls)}><span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />{sm.label}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </Card>
                )}

                {/* monthly commitments */}
                {commitments.length > 0 && (
                  <Card className="px-[18px] py-4">
                    <div className="text-[11px] font-semibold tracking-[0.06em] uppercase text-muted-foreground flex items-center gap-1.5 mb-2.5"><ListChecks className="h-3.5 w-3.5" />{firstName}&apos;s commitments</div>
                    <ul className="space-y-1.5">
                      {commitments.map(c => {
                        const sm = STATUS_META[c.status] ?? STATUS_META.draft;
                        return (
                          <li key={c.id} className="text-xs flex items-start gap-2 px-2.5 py-2 rounded-md bg-background border border-border">
                            <span className="inline-flex h-4 w-4 rounded-full bg-amber-500/15 text-amber-700 text-[9px] font-bold items-center justify-center mt-0.5 flex-shrink-0">{c.display_order}</span>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium leading-snug">{c.title}</p>
                              <span className={cn('inline-flex items-center gap-1 mt-1 text-[9px] font-semibold px-1.5 py-px rounded-full', sm.cls)}>{sm.label}</span>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </Card>
                )}
              </div>
            </div>
          )}

          {/* ---------- PAST 1:1s TAB ---------- */}
          {activeTab === 'past' && (
            <div className="max-w-[780px] mx-auto px-7 pt-6 pb-12">
              <div className="flex items-start gap-3.5 px-[18px] py-[15px] rounded-lg bg-accent/50 border border-border/70 mb-5">
                <span className="w-8 h-8 flex-shrink-0 rounded-lg bg-card grid place-items-center shadow-sm"><FileText className="h-[18px] w-[18px] text-primary" /></span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-bold mb-0.5">Summaries from your past 1:1s</div>
                  <div className="text-[13px] leading-[1.5] text-muted-foreground">Pulled from your Zoom calls. When Zoom&apos;s AI Companion is on, its meeting summary — overview and next steps — shows here automatically.</div>
                </div>
              </div>

              {zoomRecordings.length === 0 ? (
                <div className="text-center py-16 text-sm text-muted-foreground">
                  <Video className="h-8 w-8 mx-auto mb-3 opacity-40" />
                  No past 1:1s recorded yet. Once your Zoom calls with {firstName} are synced, their summaries appear here.
                </div>
              ) : (
                <div className="flex flex-col gap-[18px]">
                  {zoomRecordings.map(rec => {
                    const d = new Date(rec.start_time);
                    return (
                      <Card key={rec.id} className="overflow-hidden">
                        <div className="flex items-center gap-3 px-[22px] py-4 border-b border-border/60 bg-muted/40">
                          <div className="w-[42px] h-[42px] flex-shrink-0 rounded-[9px] bg-card border border-border flex flex-col items-center justify-center leading-none">
                            <span className="text-[9px] font-bold tracking-[0.05em] uppercase text-primary">{MONTHS[d.getMonth()]}</span>
                            <span className="text-[17px] font-bold mt-px">{d.getDate()}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[14.5px] font-bold truncate">{rec.topic ?? `1:1 with ${firstName}`}</div>
                            <div className="flex items-center gap-[7px] mt-0.5 text-xs text-muted-foreground">
                              <span>{format(d, 'MMM d, yyyy')}</span>
                              {rec.duration_minutes != null && (<><span>·</span><span>{rec.duration_minutes} min</span></>)}
                            </div>
                          </div>
                          {rec.has_transcript && (
                            <Badge variant="outline" className="text-[11px] h-6 px-2.5 border-emerald-200 text-emerald-700">Transcript</Badge>
                          )}
                        </div>
                        {rec.ai_summary && (
                          <div className="px-[22px] pt-4 text-[13.5px] leading-[1.6] text-foreground whitespace-pre-line">{rec.ai_summary}</div>
                        )}
                        <div className="flex items-center gap-2.5 px-[22px] py-3.5">
                          <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-muted-foreground"><Sparkles className="h-[13px] w-[13px] text-primary" />{rec.ai_summary ? 'Summarized by Zoom AI Companion' : rec.has_transcript ? 'Transcript captured — summary pending' : 'Recording captured — summary pending'}</span>
                          {rec.has_transcript && (
                            <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-primary cursor-pointer hover:underline"><FileText className="h-[14px] w-[14px]" />View transcript</span>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ---------- ASK TAB ---------- */}
          {activeTab === 'ask' && (
            <div className="max-w-[760px] mx-auto h-full flex flex-col px-7">
              <div ref={chatScrollRef} className="flex-1 overflow-y-auto py-6 flex flex-col gap-[18px]">
                {chat.map(msg => msg.role === 'agent' ? (
                  <div key={msg.id} className="flex gap-[11px] items-start max-w-[88%]">
                    <span className="w-8 h-8 flex-shrink-0 rounded-lg bg-accent grid place-items-center"><Bot className="h-[18px] w-[18px] text-primary" /></span>
                    <div className="bg-card border border-border rounded-[4px_12px_12px_12px] px-4 py-3 text-[13.5px] leading-[1.6] whitespace-pre-line">{msg.text}</div>
                  </div>
                ) : (
                  <div key={msg.id} className="self-end max-w-[80%] bg-primary text-primary-foreground rounded-[12px_4px_12px_12px] px-[15px] py-[11px] text-[13.5px] leading-[1.55]">{msg.text}</div>
                ))}
                {askLoading && (
                  <div className="flex gap-[11px] items-center text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /><span className="text-xs">Searching your 1:1 history…</span></div>
                )}
              </div>

              <div className="flex gap-2 flex-wrap pt-1 pb-3">
                {[`What's overdue?`, 'Recap the last 1:1', 'What should I cover?'].map((s, i) => (
                  <button key={i} onClick={() => sendAsk(s)} disabled={askLoading} className="inline-flex items-center gap-1.5 text-[12.5px] font-medium px-3 py-1.5 rounded-full border border-border bg-card hover:bg-muted/50 transition-colors disabled:opacity-50">
                    <Sparkles className="h-[13px] w-[13px] text-primary" />{s}
                  </button>
                ))}
              </div>

              <div className="flex items-end gap-2.5 px-3.5 py-3 mb-[22px] bg-card border border-input rounded-xl">
                <Bot className="h-[18px] w-[18px] text-primary mb-0.5 flex-shrink-0" />
                <textarea
                  value={askInput}
                  onChange={e => setAskInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAsk(); } }}
                  rows={1}
                  placeholder={`Ask your agent about ${firstName}, the last 1:1, or what's overdue…`}
                  className="flex-1 bg-transparent border-0 outline-none resize-none text-sm leading-[1.5] max-h-[120px]"
                />
                <Button size="icon" className="h-9 w-9 rounded-lg flex-shrink-0" disabled={!askInput.trim() || askLoading} onClick={() => sendAsk()}>
                  <ArrowUp className="h-[18px] w-[18px]" />
                </Button>
              </div>
            </div>
          )}

          {/* ---------- TIMELINE TAB ---------- */}
          {activeTab === 'timeline' && (
            <div className="max-w-[680px] mx-auto px-7 py-7 flex flex-col gap-[18px]">
              {/* relationship memory */}
              {relTopics.length > 0 && (
                <Card className="px-[22px] py-5">
                  <SecHdr icon={Brain} label="Relationship memory" />
                  <p className="text-[12.5px] text-muted-foreground mt-1 mb-3">Recurring topics your agent has tracked across your 1:1s.</p>
                  <ul className="space-y-1.5">
                    {relTopics.map(topic => {
                      const catColors: Record<string, string> = { blocker: 'bg-red-500', escalation: 'bg-orange-500', project: 'bg-blue-500', goal: 'bg-emerald-500', feedback: 'bg-violet-500', development: 'bg-indigo-500', personal: 'bg-pink-500', general: 'bg-gray-400' };
                      const isResolved = topic.status === 'resolved';
                      const lastDate = parseLocalDate(topic.last_mentioned_at);
                      const daysAgo = lastDate ? Math.floor((Date.now() - lastDate.getTime()) / 86_400_000) : null;
                      return (
                        <li key={topic.id} className={cn('text-[13px] flex items-start gap-2.5 px-3 py-2.5 rounded-md bg-background border border-border group', isResolved && 'opacity-50')}>
                          <span className={cn('w-2 h-2 rounded-full mt-1.5 flex-shrink-0', catColors[topic.category] ?? 'bg-gray-400')} />
                          <div className="flex-1 min-w-0">
                            <p className={cn('font-medium leading-snug', isResolved && 'line-through text-muted-foreground')}>{topic.topic}</p>
                            <div className="flex items-center gap-2.5 mt-1">
                              {topic.mention_count > 1 && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><TrendingUp className="h-2.5 w-2.5" />{topic.mention_count}x</span>}
                              {daysAgo !== null && <span className="text-[10px] text-muted-foreground">{daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo}d ago`}</span>}
                            </div>
                          </div>
                          <button onClick={() => updateTopicStatus(topic.id, isResolved ? 'active' : 'resolved')} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground p-0.5" title={isResolved ? 'Mark active' : 'Mark resolved'}>
                            <Check className={cn('h-3.5 w-3.5', isResolved && 'text-emerald-500')} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              )}
              <RelationshipTimeline memberId={member.id} memberName={member.name} />
            </div>
          )}

          {/* ---------- SETTINGS TAB ---------- */}
          {activeTab === 'settings' && (
            <div className="max-w-[680px] mx-auto px-7 pt-6 pb-12 flex flex-col gap-[18px]">
              <AgentToggles memberId={member.id} memberName={firstName} />

              {/* tools for this 1:1 */}
              <PrepToolsCard memberId={member.id} memberName={firstName} />

              {/* context */}
              <Card className="px-[22px] py-5">
                <SecHdr icon={Brain} label={`Context about ${firstName}`} />
                <p className="text-[12.5px] text-muted-foreground mt-1 mb-3">Appended to every future prep so your agent stays grounded.</p>
                <Textarea value={contextDraft} onChange={e => setContextDraft(e.target.value)} rows={4}
                  placeholder={`e.g. ${firstName} cares about shipping quality over speed. Prefers async written updates.`}
                  className="text-[13.5px] leading-[1.55] resize-y" />
                <div className="flex items-center gap-3 mt-3">
                  <Button size="sm" variant="secondary" onClick={saveContext} disabled={savingContext}>
                    {savingContext ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}Save context
                  </Button>
                  {savedContext && <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600"><Check className="h-3.5 w-3.5" />Saved</span>}
                </div>
              </Card>

              {/* prep instructions */}
              <Card className="px-[22px] py-5">
                <SecHdr icon={Sparkles} label="Prep instructions" />
                <p className="text-[12.5px] text-muted-foreground mt-1 mb-3">Your agent follows these every time it drafts a prep.</p>
                <Textarea value={feedbackDraft} onChange={e => setFeedbackDraft(e.target.value)} rows={4}
                  placeholder="e.g. Always highlight blockers first. Don't repeat unchanged items. Keep it terse."
                  className="text-[13.5px] leading-[1.55] resize-y" />
                <div className="flex items-center gap-3 mt-3">
                  <Button size="sm" variant="secondary" onClick={saveFeedback} disabled={savingFeedback}>
                    {savingFeedback ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}Save instructions
                  </Button>
                  {savedFeedback && <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600"><Check className="h-3.5 w-3.5" />Saved</span>}
                </div>
              </Card>
            </div>
          )}

        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Recognition banner (Prep right rail) ───────────────────────────────────────

type RecognitionItem = { giver: string; receiver: string; excerpt: string; date: string };

function RecognitionBanner({ recognitions }: { recognitions: RecognitionItem[] }) {
  const [idx, setIdx] = useState(0);
  const r = recognitions[Math.min(idx, recognitions.length - 1)];

  return (
    <div className="rounded-lg border border-amber-200 bg-gradient-to-br from-amber-50 to-yellow-50 px-[18px] py-4">
      <div className="flex items-center gap-1.5 mb-[10px]">
        <Star className="h-[14px] w-[14px] text-amber-500 fill-amber-400" />
        <span className="text-[11px] font-semibold tracking-[0.06em] uppercase text-amber-700">Recognition</span>
        {recognitions.length > 1 && (
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => setIdx(i => Math.max(0, i - 1))}
              disabled={idx === 0}
              className="h-5 w-5 grid place-items-center rounded text-amber-600 hover:bg-amber-100 disabled:opacity-30 transition-colors"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <span className="text-[10px] font-medium text-amber-600">{idx + 1}/{recognitions.length}</span>
            <button
              onClick={() => setIdx(i => Math.min(recognitions.length - 1, i + 1))}
              disabled={idx === recognitions.length - 1}
              className="h-5 w-5 grid place-items-center rounded text-amber-600 hover:bg-amber-100 disabled:opacity-30 transition-colors"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
      <p className="text-[13px] font-semibold text-amber-900 leading-snug">
        {r.giver} recognized {r.receiver}
      </p>
      {r.excerpt && (
        <p className="text-[12px] text-amber-800 mt-1.5 leading-[1.5] line-clamp-3 italic">
          &ldquo;{r.excerpt}&rdquo;
        </p>
      )}
      <p className="text-[11px] text-amber-600 mt-2">{format(new Date(r.date), 'MMM d')}</p>
    </div>
  );
}

// ── Tool recommendations for this 1:1 (Prep right rail) ─────────────────────────

interface ToolRec { tool: string; action: 'add' | 'remove'; reason: string }

function PrepToolsCard({ memberId, memberName }: { memberId: string; memberName: string }) {
  const { toast } = useToast();
  const [currentTools, setCurrentTools] = useState<string[]>([]);
  const [recs, setRecs] = useState<ToolRec[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('recommend-prep-tools', {
          body: { team_member_id: memberId },
        });
        if (cancelled) return;
        if (error) throw error;
        const res = data as { current_tools?: string[]; recommendations?: ToolRec[] };
        setCurrentTools(res.current_tools ?? []);
        setRecs(res.recommendations ?? []);
      } catch {
        if (!cancelled) { setCurrentTools([]); setRecs([]); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [memberId]);

  const labelFor = toolLabel;

  const applyRec = async (rec: ToolRec) => {
    setApplying(rec.tool);
    const next = rec.action === 'add'
      ? Array.from(new Set([...currentTools, rec.tool]))
      : currentTools.filter(t => t !== rec.tool);
    try {
      // Merge into existing per-member overrides (preserve other keys).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from('cos_team_members').select('agent_overrides').eq('id', memberId).single();
      const overrides = (data?.agent_overrides ?? {}) as Record<string, unknown>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('cos_team_members')
        .update({ agent_overrides: { ...overrides, prep_tools: next } }).eq('id', memberId);
      setCurrentTools(next);
      setRecs(prev => prev.filter(r => r.tool !== rec.tool));
      toast({ title: rec.action === 'add' ? `Added ${labelFor(rec.tool)}` : `Removed ${labelFor(rec.tool)}` });
    } catch (err) {
      toast({ title: 'Could not update tools', description: String(err), variant: 'destructive' });
    } finally {
      setApplying(null);
    }
  };

  return (
    <Card className="px-[18px] py-4">
      <div className="text-[11px] font-semibold tracking-[0.06em] uppercase text-muted-foreground flex items-center gap-1.5 mb-2.5">
        <Wrench className="h-3.5 w-3.5" />Tools for this 1:1
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Checking…</div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {currentTools.length === 0 ? (
              <span className="text-xs text-muted-foreground">Using your default tools.</span>
            ) : currentTools.map(t => (
              <Badge key={t} variant="outline" className="bg-background text-xs">{labelFor(t)}</Badge>
            ))}
          </div>

          {recs.length > 0 && (
            <div className="mt-3 space-y-2 border-t pt-3">
              <p className="text-[11px] font-medium text-muted-foreground">Suggestions</p>
              {recs.map(rec => (
                <div key={`${rec.action}-${rec.tool}`} className="flex items-start gap-2">
                  <button
                    onClick={() => applyRec(rec)}
                    disabled={applying === rec.tool}
                    className="mt-0.5 inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] hover:bg-muted disabled:opacity-50"
                  >
                    {applying === rec.tool
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : rec.action === 'add' ? <Plus className="h-3 w-3" /> : <X className="h-3 w-3" />}
                    {rec.action === 'add' ? 'Add' : 'Remove'} {labelFor(rec.tool)}
                  </button>
                  <span className="text-[11px] text-muted-foreground leading-snug flex-1">{rec.reason}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

// ── Per-member agent toggles (Settings tab) ────────────────────────────────────

function AgentToggles({ memberId, memberName }: { memberId: string; memberName: string }) {
  const [overrides, setOverrides] = useState<Record<string, unknown>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from('cos_team_members')
        .select('agent_overrides')
        .eq('id', memberId)
        .single();
      setOverrides((data?.agent_overrides ?? {}) as Record<string, unknown>);
      setLoaded(true);
    })();
  }, [memberId]);

  const update = async (patch: Record<string, unknown>) => {
    const next = { ...overrides, ...patch };
    setOverrides(next);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('cos_team_members').update({ agent_overrides: next }).eq('id', memberId);
  };

  return (
    <Card className="px-[22px] py-5 flex flex-col gap-4">
      <div>
        <div className="text-[13.5px] font-bold flex items-center gap-2"><Bot className="h-[17px] w-[17px] text-primary" />Agent for {memberName}</div>
        <div className="text-[12.5px] text-muted-foreground mt-0.5">How your agent prepares and follows up between 1:1s.</div>
      </div>
      <ToggleRow label="Auto-generate prep" description="Draft a new prep before each 1:1"
        checked={loaded ? overrides.auto_prep !== false : true} onChange={v => update({ auto_prep: v })} />
      <ToggleRow label="Nudge on open actions" description={`Remind ${memberName} as due dates approach`}
        checked={loaded ? overrides.nudge_actions !== false : true} onChange={v => update({ nudge_actions: v })} />
    </Card>
  );
}

function ToggleRow({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-[13.5px] font-medium">{label}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
