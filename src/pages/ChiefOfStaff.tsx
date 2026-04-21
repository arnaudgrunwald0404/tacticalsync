import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import {
  Plus, ChevronUp, ChevronDown, Trash2, Check, X, Send, Copy, Save, Brain, Loader2,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

// ── Types ────────────────────────────────────────────────────────────────────

interface CosPriority {
  id: string;
  user_id: string;
  text: string;
  category: 'this_week' | 'april' | 'strategic' | 'people';
  tier_order: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

type DciItemStatus = 'done' | 'in_progress' | 'blocked' | 'deferred';

interface CosDciLog {
  id: string;
  user_id: string;
  date: string;
  priority_1: string | null;
  priority_2: string | null;
  priority_3: string | null;
  topic_raised: string | null;
  notes: string | null;
  created_at: string;
  priority_1_status: DciItemStatus | null;
  priority_1_comment: string | null;
  priority_2_status: DciItemStatus | null;
  priority_2_comment: string | null;
  priority_3_status: DciItemStatus | null;
  priority_3_comment: string | null;
}

interface CosTeamMember {
  id: string;
  user_id: string;
  name: string;
  role: string;
  relationship_type: 'direct_report' | 'collaborator';
  context_notes: string | null;
  last_1on1_date: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  this_week: 'This Week',
  april: 'April',
  strategic: 'Strategic',
  people: 'People',
};

const CATEGORY_ORDER = ['this_week', 'april', 'strategic', 'people'] as const;

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ChiefOfStaff() {
  const { toast } = useToast();
  const [userId, setUserId] = useState<string | null>(null);
  const [priorities, setPriorities] = useState<CosPriority[]>([]);
  const [dciLogs, setDciLogs] = useState<CosDciLog[]>([]);
  const [teamMembers, setTeamMembers] = useState<CosTeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('brief');

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const [priRes, logsRes, teamRes] = await Promise.all([
        db.from('cos_priorities').select('*').eq('user_id', user.id).order('tier_order'),
        db.from('cos_dci_logs').select('*').eq('user_id', user.id).order('date', { ascending: false }),
        db.from('cos_team_members').select('*').eq('user_id', user.id).order('name'),
      ]);

      setPriorities((priRes.data ?? []) as CosPriority[]);
      setDciLogs((logsRes.data ?? []) as CosDciLog[]);
      setTeamMembers((teamRes.data ?? []) as CosTeamMember[]);
      setLoading(false);
    }
    load();
  }, []);

  const copyToClipboard = useCallback(async (text: string, label = 'Copied — paste into Cowork') => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: label });
    } catch {
      toast({ title: 'Failed to copy', variant: 'destructive' });
    }
  }, [toast]);

  const updatePriority = async (id: string, updates: Partial<CosPriority>) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).from('cos_priorities').update(updates).eq('id', id).select().single();
    if (!error && data) setPriorities(prev => prev.map(p => p.id === id ? { ...p, ...data } as CosPriority : p));
  };

  const addPriority = async (category: CosPriority['category']) => {
    if (!userId) return;
    const catPriorities = priorities.filter(p => p.category === category);
    const maxOrder = catPriorities.length > 0 ? Math.max(...catPriorities.map(p => p.tier_order)) : 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).from('cos_priorities').insert({
      user_id: userId, text: 'New priority', category, tier_order: maxOrder + 1,
    }).select().single();
    if (!error && data) setPriorities(prev => [...prev, data as CosPriority]);
  };

  const deletePriority = async (id: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('cos_priorities').delete().eq('id', id);
    setPriorities(prev => prev.filter(p => p.id !== id));
  };

  const movePriority = async (id: string, direction: 'up' | 'down') => {
    const p = priorities.find(x => x.id === id);
    if (!p) return;
    const catItems = priorities.filter(x => x.category === p.category).sort((a, b) => a.tier_order - b.tier_order);
    const idx = catItems.findIndex(x => x.id === id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= catItems.length) return;
    const swap = catItems[swapIdx];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    await Promise.all([
      db.from('cos_priorities').update({ tier_order: swap.tier_order }).eq('id', p.id),
      db.from('cos_priorities').update({ tier_order: p.tier_order }).eq('id', swap.id),
    ]);
    setPriorities(prev => prev.map(x => {
      if (x.id === p.id) return { ...x, tier_order: swap.tier_order };
      if (x.id === swap.id) return { ...x, tier_order: p.tier_order };
      return x;
    }));
  };

  const logBrief = async (topPriorities: CosPriority[], topicRaised: string) => {
    if (!userId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).from('cos_dci_logs').insert({
      user_id: userId,
      date: format(new Date(), 'yyyy-MM-dd'),
      priority_1: topPriorities[0]?.text ?? null,
      priority_2: topPriorities[1]?.text ?? null,
      priority_3: topPriorities[2]?.text ?? null,
      topic_raised: topicRaised || null,
    }).select().single();
    if (!error && data) {
      setDciLogs(prev => [data as CosDciLog, ...prev]);
      toast({ title: 'Brief logged' });
    }
  };

  const updateDciLog = async (id: string, updates: Partial<CosDciLog>) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).from('cos_dci_logs').update(updates).eq('id', id).select().single();
    if (!error && data) setDciLogs(prev => prev.map(l => l.id === id ? { ...l, ...data } as CosDciLog : l));
  };

  const rerunDci = async (log: CosDciLog) => {
    if (!userId) return;
    const items = [
      { text: log.priority_1, status: log.priority_1_status, comment: log.priority_1_comment },
      { text: log.priority_2, status: log.priority_2_status, comment: log.priority_2_comment },
      { text: log.priority_3, status: log.priority_3_status, comment: log.priority_3_comment },
    ].filter(i => i.text && i.status !== 'done');

    const newPriorities = items.map(i => i.text!);
    const topic = `Rerun from ${format(new Date(log.date + 'T12:00:00'), 'MMM d')}`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).from('cos_dci_logs').insert({
      user_id: userId,
      date: format(new Date(), 'yyyy-MM-dd'),
      priority_1: newPriorities[0] ?? null,
      priority_2: newPriorities[1] ?? null,
      priority_3: newPriorities[2] ?? null,
      topic_raised: topic,
    }).select().single();

    if (!error && data) {
      setDciLogs(prev => [data as CosDciLog, ...prev]);
      toast({ title: 'New brief created from undone items' });
    }

    // Also build agentic context and copy to clipboard
    const statusLabel: Record<string, string> = {
      done: '✅ Done', in_progress: '🔄 In Progress', blocked: '🚫 Blocked', deferred: '⏭️ Deferred',
    };
    const lines = [
      `DCI Status Review — ${format(new Date(), 'EEEE, MMMM d')}`,
      `Original brief from ${format(new Date(log.date + 'T12:00:00'), 'MMM d')}:`,
      '',
    ];
    [
      { text: log.priority_1, status: log.priority_1_status, comment: log.priority_1_comment },
      { text: log.priority_2, status: log.priority_2_status, comment: log.priority_2_comment },
      { text: log.priority_3, status: log.priority_3_status, comment: log.priority_3_comment },
    ].filter(i => i.text).forEach((item, i) => {
      lines.push(`${i + 1}. ${item.text}`);
      if (item.status) lines.push(`   Status: ${statusLabel[item.status] ?? item.status}`);
      if (item.comment) lines.push(`   Note: ${item.comment}`);
    });
    if (newPriorities.length > 0) {
      lines.push('', 'Still open for next DCI:');
      newPriorities.forEach((p, i) => lines.push(`${i + 1}. ${p}`));
    }
    lines.push('', 'Given this context, please: (1) identify what needs the most attention right now, (2) suggest any adjustments to the remaining priorities, and (3) draft a brief update I can share with my team.');

    copyToClipboard(lines.join('\n'), 'Review prompt copied — paste into Cowork');
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-4xl space-y-4">
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const thisWeekPriorities = priorities
    .filter(p => p.category === 'this_week')
    .sort((a, b) => a.tier_order - b.tier_order)
    .slice(0, 3);

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <div className="flex items-center gap-2 mb-6">
        <Brain className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold">Chief of Staff</h1>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6 w-full grid grid-cols-4">
          <TabsTrigger value="brief">Brief</TabsTrigger>
          <TabsTrigger value="priorities">Priorities</TabsTrigger>
          <TabsTrigger value="dci">DCI</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
        </TabsList>

        <TabsContent value="brief">
          <TonightsBrief
            priorities={thisWeekPriorities}
            onCopy={copyToClipboard}
            onLog={logBrief}
          />
        </TabsContent>

        <TabsContent value="priorities">
          <PrioritiesSection
            priorities={priorities}
            onUpdate={updatePriority}
            onAdd={addPriority}
            onDelete={deletePriority}
            onMove={movePriority}
            onCopy={copyToClipboard}
          />
        </TabsContent>

        <TabsContent value="dci">
          <DciHistory logs={dciLogs} onUpdate={updateDciLog} onRerun={rerunDci} />
        </TabsContent>

        <TabsContent value="team">
          <TeamSection members={teamMembers} onCopy={copyToClipboard} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Tonight's Brief ───────────────────────────────────────────────────────────

function TonightsBrief({ priorities, onCopy, onLog }: {
  priorities: CosPriority[];
  onCopy: (text: string, label?: string) => void;
  onLog: (priorities: CosPriority[], topic: string) => void;
}) {
  const [topicRaised, setTopicRaised] = useState('');
  const today = format(new Date(), 'EEEE, MMMM d');

  const buildBriefText = () => {
    const lines = [
      `DCI Brief — ${today}`,
      '',
      'Top priorities:',
      ...priorities.map((p, i) => `${i + 1}. ${p.text}`),
    ];
    if (topicRaised) lines.push('', `Topic to raise: ${topicRaised}`);
    return lines.join('\n');
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Tonight's Brief</h2>
        <p className="text-sm text-muted-foreground mt-0.5">{today}</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Top 3 This Week
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {priorities.length === 0 ? (
            <p className="text-sm text-muted-foreground">No priorities for this week yet. Add some in the Priorities tab.</p>
          ) : (
            priorities.map((p, i) => (
              <div key={p.id} className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <span className="text-sm font-medium leading-snug">{p.text}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Topic to raise (optional)</label>
        <Textarea
          placeholder="What else do you want to bring up tonight?"
          value={topicRaised}
          onChange={e => setTopicRaised(e.target.value)}
          rows={3}
          className="resize-none"
        />
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={() => onCopy(buildBriefText(), 'Brief copied — paste into Cowork')}>
          <Copy className="h-4 w-4 mr-2" />
          Copy for DCI
        </Button>
        <Button onClick={() => onLog(priorities, topicRaised)}>
          <Save className="h-4 w-4 mr-2" />
          Log this brief
        </Button>
      </div>
    </div>
  );
}

// ── Priorities ────────────────────────────────────────────────────────────────

function PrioritiesSection({ priorities, onUpdate, onAdd, onDelete, onMove, onCopy }: {
  priorities: CosPriority[];
  onUpdate: (id: string, updates: Partial<CosPriority>) => void;
  onAdd: (category: CosPriority['category']) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, direction: 'up' | 'down') => void;
  onCopy: (text: string, label?: string) => void;
}) {
  return (
    <div className="space-y-10">
      {CATEGORY_ORDER.map(category => {
        const items = priorities
          .filter(p => p.category === category)
          .sort((a, b) => a.tier_order - b.tier_order);
        return (
          <div key={category}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{CATEGORY_LABELS[category]}</h3>
                <Badge variant="secondary" className="text-xs">{items.length}</Badge>
              </div>
              <Button size="sm" variant="ghost" className="h-9 text-sm" onClick={() => onAdd(category)}>
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
            <div className="space-y-1.5">
              {items.map((item, idx) => (
                <PriorityCard
                  key={item.id}
                  item={item}
                  isFirst={idx === 0}
                  isLast={idx === items.length - 1}
                  onUpdate={onUpdate}
                  onDelete={onDelete}
                  onMove={onMove}
                  onCopy={onCopy}
                />
              ))}
              {items.length === 0 && (
                <p className="text-xs text-muted-foreground py-2 pl-1">No items yet.</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PriorityCard({ item, isFirst, isLast, onUpdate, onDelete, onMove, onCopy }: {
  item: CosPriority;
  isFirst: boolean;
  isLast: boolean;
  onUpdate: (id: string, updates: Partial<CosPriority>) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, direction: 'up' | 'down') => void;
  onCopy: (text: string, label?: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(item.text);
  const [editNotes, setEditNotes] = useState(item.notes ?? '');
  const [agentQuery, setAgentQuery] = useState('');

  const saveText = () => {
    const trimmed = editText.trim();
    if (trimmed && trimmed !== item.text) onUpdate(item.id, { text: trimmed });
    setEditing(false);
  };

  const saveNotes = () => {
    onUpdate(item.id, { notes: editNotes.trim() || null });
  };

  const buildPrompt = (type: 'recommend' | 'draft' | 'custom', query?: string) => {
    const ctx = `Priority: "${item.text}"${item.notes ? `\nContext: ${item.notes}` : ''}`;
    if (type === 'recommend') return `${ctx}\n\nPlease recommend a concrete next step I should take on this priority today.`;
    if (type === 'draft') return `${ctx}\n\nPlease draft a clear, professional message I can send related to this priority.`;
    return `${ctx}\n\n${query}`;
  };

  return (
    <Card className="group border border-border/50 hover:border-border transition-colors">
      <CardContent className="p-3">
        <div className="flex items-start gap-2">
          {/* Reorder arrows — always visible on mobile, hover-only on desktop */}
          <div className="flex flex-col flex-shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onMove(item.id, 'up')}
              disabled={isFirst}
              className="p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              onClick={() => onMove(item.id, 'down')}
              disabled={isLast}
              className="p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {editing ? (
              <div className="flex items-center gap-1">
                <Input
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') saveText();
                    if (e.key === 'Escape') { setEditText(item.text); setEditing(false); }
                  }}
                  className="h-10 text-sm"
                  autoFocus
                />
                <button onClick={saveText} className="p-2 text-green-600 hover:text-green-700 flex-shrink-0">
                  <Check className="h-5 w-5" />
                </button>
                <button onClick={() => { setEditText(item.text); setEditing(false); }} className="p-2 text-muted-foreground hover:text-foreground flex-shrink-0">
                  <X className="h-5 w-5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setEditing(true)}
                className="text-sm font-medium text-left w-full hover:text-primary transition-colors leading-snug"
              >
                {item.text}
              </button>
            )}

            {expanded && (
              <div className="mt-3 space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes</label>
                  <Textarea
                    value={editNotes}
                    onChange={e => setEditNotes(e.target.value)}
                    onBlur={saveNotes}
                    placeholder="Add context, blockers, links..."
                    rows={2}
                    className="mt-1 text-sm resize-none"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    className="h-10 text-sm"
                    onClick={() => onCopy(buildPrompt('recommend'))}
                  >
                    💡 Recommend next step
                  </Button>
                  <Button
                    variant="outline"
                    className="h-10 text-sm"
                    onClick={() => onCopy(buildPrompt('draft'))}
                  >
                    ✍️ Draft message
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Ask agent..."
                    value={agentQuery}
                    onChange={e => setAgentQuery(e.target.value)}
                    className="h-10 text-sm"
                    onKeyDown={e => {
                      if (e.key === 'Enter' && agentQuery.trim()) {
                        onCopy(buildPrompt('custom', agentQuery.trim()));
                        setAgentQuery('');
                      }
                    }}
                  />
                  <Button
                    variant="ghost"
                    className="h-10 px-3 flex-shrink-0"
                    disabled={!agentQuery.trim()}
                    onClick={() => {
                      if (agentQuery.trim()) {
                        onCopy(buildPrompt('custom', agentQuery.trim()));
                        setAgentQuery('');
                      }
                    }}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Right controls — always visible on mobile, hover-only on desktop */}
          <div className="flex items-center flex-shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-2 text-muted-foreground hover:text-foreground"
              aria-label={expanded ? 'Collapse' : 'Expand'}
            >
              <ChevronDown className={cn('h-5 w-5 transition-transform', expanded && 'rotate-180')} />
            </button>
            <button
              onClick={() => onDelete(item.id)}
              className="p-2 text-muted-foreground hover:text-destructive"
              aria-label="Delete"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── DCI History ───────────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: DciItemStatus; label: string; color: string }[] = [
  { value: 'done',        label: '✅ Done',        color: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-400' },
  { value: 'in_progress', label: '🔄 In Progress', color: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400' },
  { value: 'blocked',     label: '🚫 Blocked',     color: 'bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-400' },
  { value: 'deferred',    label: '⏭️ Deferred',   color: 'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-800 dark:text-gray-400' },
];

function DciLogItem({
  index, text, status, comment, onStatusChange, onCommentChange,
}: {
  index: number;
  text: string;
  status: DciItemStatus | null;
  comment: string | null;
  onStatusChange: (s: DciItemStatus | null) => void;
  onCommentChange: (c: string) => void;
}) {
  const [localComment, setLocalComment] = useState(comment ?? '');

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <span className="flex-shrink-0 w-5 text-xs text-muted-foreground mt-0.5">{index}.</span>
        <div className="flex-1 min-w-0 space-y-2">
          <p className={cn('text-sm font-medium leading-snug', status === 'done' && 'line-through text-muted-foreground')}>
            {text}
          </p>
          {/* Status picker */}
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => onStatusChange(status === opt.value ? null : opt.value)}
                className={cn(
                  'text-sm px-3 py-2 rounded-full border transition-all touch-manipulation',
                  status === opt.value
                    ? opt.color
                    : 'bg-transparent text-muted-foreground border-border hover:border-foreground/40',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {/* Comment field — shown when status set or comment exists */}
          {(status || localComment) && (
            <Textarea
              value={localComment}
              onChange={e => setLocalComment(e.target.value)}
              onBlur={() => onCommentChange(localComment)}
              placeholder="Add a note..."
              rows={2}
              className="text-sm resize-none"
            />
          )}
        </div>
      </div>
    </div>
  );
}

function DciLogCard({ log, onUpdate, onRerun }: {
  log: CosDciLog;
  onUpdate: (id: string, updates: Partial<CosDciLog>) => void;
  onRerun: (log: CosDciLog) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const items = [
    { text: log.priority_1, statusKey: 'priority_1_status' as const, commentKey: 'priority_1_comment' as const, status: log.priority_1_status, comment: log.priority_1_comment },
    { text: log.priority_2, statusKey: 'priority_2_status' as const, commentKey: 'priority_2_comment' as const, status: log.priority_2_status, comment: log.priority_2_comment },
    { text: log.priority_3, statusKey: 'priority_3_status' as const, commentKey: 'priority_3_comment' as const, status: log.priority_3_status, comment: log.priority_3_comment },
  ].filter(i => i.text);

  const doneCount = items.filter(i => i.status === 'done').length;
  const hasAnyStatus = items.some(i => i.status);

  return (
    <Card className={cn('transition-colors', hasAnyStatus && 'border-primary/20')}>
      <CardContent className="p-4">
        {/* Header row */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">
              {format(new Date(log.date + 'T12:00:00'), 'EEEE, MMM d yyyy')}
            </p>
            {hasAnyStatus && (
              <Badge variant="secondary" className="text-xs">
                {doneCount}/{items.length} done
              </Badge>
            )}
          </div>
          <button
            onClick={() => setExpanded(e => !e)}
            className="p-2 -mr-2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            <ChevronDown className={cn('h-5 w-5 transition-transform', expanded && 'rotate-180')} />
          </button>
        </div>

        {/* Priority items */}
        <div className="space-y-3">
          {items.map((item, i) => (
            <DciLogItem
              key={i}
              index={i + 1}
              text={item.text!}
              status={item.status}
              comment={item.comment}
              onStatusChange={s => onUpdate(log.id, { [item.statusKey]: s })}
              onCommentChange={c => onUpdate(log.id, { [item.commentKey]: c || null })}
            />
          ))}
        </div>

        {log.topic_raised && (
          <div className="mt-3 pt-3 border-t border-border/50">
            <span className="text-xs text-muted-foreground">Topic raised: </span>
            <span className="text-sm">{log.topic_raised}</span>
          </div>
        )}

        {/* Actions */}
        <div className="mt-4 pt-3 border-t border-border/50">
          <Button
            variant="outline"
            className="h-10 text-sm w-full sm:w-auto"
            onClick={() => onRerun(log)}
          >
            🔄 Rerun DCI
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DciHistory({ logs, onUpdate, onRerun }: {
  logs: CosDciLog[];
  onUpdate: (id: string, updates: Partial<CosDciLog>) => void;
  onRerun: (log: CosDciLog) => void;
}) {
  const totalDone = logs.reduce((acc, log) => {
    return acc + [log.priority_1_status, log.priority_2_status, log.priority_3_status].filter(s => s === 'done').length;
  }, 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">DCI History</h2>
        <p className="text-sm text-muted-foreground mt-0.5">{logs.length} brief{logs.length !== 1 ? 's' : ''} logged</p>
      </div>

      {logs.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            No DCI briefs logged yet. Use Tonight's Brief to log your first one.
          </CardContent>
        </Card>
      ) : (
        <>
          {logs.length >= 2 && (
            <Card className="bg-muted/40 border-dashed">
              <CardContent className="p-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Quick stats</p>
                <div className="flex gap-6 text-sm">
                  <div>
                    <span className="font-semibold">{logs.length}</span>
                    <span className="text-muted-foreground ml-1">briefs</span>
                  </div>
                  <div>
                    <span className="font-semibold">{totalDone}</span>
                    <span className="text-muted-foreground ml-1">items marked done</span>
                  </div>
                  <div>
                    <span className="font-semibold">{logs.filter(l => l.topic_raised).length}</span>
                    <span className="text-muted-foreground ml-1">had topics raised</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="space-y-3">
            {logs.map(log => (
              <DciLogCard key={log.id} log={log} onUpdate={onUpdate} onRerun={onRerun} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Team — ClearGO API types ──────────────────────────────────────────────────

interface CleargoMember { id: string; name: string; role: string; }
interface CleargoEpic {
  name: string; tier: string;
  target_launch_date: string | null;
  risk_level: string | null;
  readiness_score: number | null;
}
interface CleargoEscalation {
  epic_name: string; blocker_title: string;
  severity: string; days_blocked: number;
}
interface CleargoPrep {
  person: CleargoMember;
  summary: { active_epics: number; completed_this_week: number; open_blockers: number; escalations_needed: number };
  active_epics: CleargoEpic[];
  completed_this_week: CleargoEpic[];
  escalations_needed: CleargoEscalation[];
  suggested_talking_points: string[];
}

const CLEARGO_API_URL = import.meta.env.VITE_CLEARGO_API_URL ?? 'https://cleargo.netlify.app';
const CLEARGO_API_KEY = import.meta.env.VITE_CLEARGO_API_KEY ?? '';

function buildStaticPrepPrompt(member: CosTeamMember): string {
  const parts = [`I have a 1:1 with ${member.name} (${member.role}) coming up.`];
  if (member.context_notes) parts.push(`Context: ${member.context_notes}.`);
  if (member.last_1on1_date) parts.push(`Last meeting: ${format(new Date(member.last_1on1_date + 'T12:00:00'), 'MMM d yyyy')}.`);
  parts.push('Please help me prepare: what questions should I ask, what updates to request, and how to make the most of this time?');
  return parts.join(' ');
}

function buildLivePrepPrompt(prep: CleargoPrep, member: CosTeamMember): string {
  const lines: string[] = [
    `1:1 Prep — ${prep.person.name} (${prep.person.role})`,
    `Generated: ${format(new Date(), 'MMM d yyyy, h:mm a')}`,
    '',
    `📊 ${prep.summary.active_epics} active epics · ${prep.summary.open_blockers} open blockers · ${prep.summary.escalations_needed} escalation${prep.summary.escalations_needed !== 1 ? 's' : ''}`,
    '',
  ];

  if (prep.escalations_needed.length > 0) {
    lines.push('🚨 Escalations:');
    prep.escalations_needed.forEach(e =>
      lines.push(`  • [${e.severity.toUpperCase()}] ${e.epic_name}: ${e.blocker_title} — ${e.days_blocked}d blocked`)
    );
    lines.push('');
  }

  if (prep.active_epics.length > 0) {
    lines.push('🏗 Active epics:');
    prep.active_epics.forEach(e => {
      const parts: string[] = [`[${e.tier}] ${e.name}`];
      if (e.risk_level) parts.push(`risk: ${e.risk_level}`);
      if (e.readiness_score != null) parts.push(`readiness: ${e.readiness_score}%`);
      if (e.target_launch_date) parts.push(`target: ${e.target_launch_date}`);
      lines.push(`  • ${parts.join(' · ')}`);
    });
    lines.push('');
  }

  if (prep.completed_this_week.length > 0) {
    lines.push(`🎉 Shipped this week: ${prep.completed_this_week.map(e => e.name).join(', ')}`);
    lines.push('');
  }

  if (prep.suggested_talking_points.length > 0) {
    lines.push('💬 Suggested talking points:');
    prep.suggested_talking_points.forEach(p => lines.push(`  • ${p}`));
    lines.push('');
  }

  if (member.context_notes) lines.push(`📝 Context: ${member.context_notes}`);
  if (member.last_1on1_date) lines.push(`📅 Last 1:1: ${format(new Date(member.last_1on1_date + 'T12:00:00'), 'MMM d yyyy')}`);

  lines.push('', 'Based on the above, help me prepare for this 1:1: what should I prioritise, what questions should I ask, and how can I best support this person?');
  return lines.join('\n');
}

async function fetchCleargoPrep(member: CosTeamMember): Promise<string> {
  const headers = { 'X-ClearGo-Key': CLEARGO_API_KEY };

  const membersRes = await fetch(`${CLEARGO_API_URL}/api/v1/team-members`, { headers });
  if (!membersRes.ok) throw new Error('team-members fetch failed');
  const { data: cleargoMembers }: { data: CleargoMember[] } = await membersRes.json();

  // Match by first name (case-insensitive)
  const firstName = member.name.split(' ')[0].toLowerCase();
  const matched = cleargoMembers.find(m =>
    m.name.toLowerCase().includes(firstName) || firstName.includes(m.name.toLowerCase().split(' ')[0])
  );
  if (!matched) throw new Error(`${member.name} not found in ClearGO`);

  const prepRes = await fetch(`${CLEARGO_API_URL}/api/v1/1on1-prep/${matched.id}`, { headers });
  if (!prepRes.ok) throw new Error('1on1-prep fetch failed');
  const prep: CleargoPrep = await prepRes.json();

  return buildLivePrepPrompt(prep, member);
}

// ── Team ──────────────────────────────────────────────────────────────────────

function MemberCard({ member, onCopy }: { member: CosTeamMember; onCopy: (text: string, label?: string) => void }) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handlePrep = async () => {
    if (!CLEARGO_API_KEY) {
      onCopy(buildStaticPrepPrompt(member), 'Prep prompt copied — paste into Cowork');
      return;
    }
    setLoading(true);
    try {
      const prompt = await fetchCleargoPrep(member);
      onCopy(prompt, '📋 Live 1:1 prep copied — paste into Cowork');
    } catch (err) {
      // Fall back silently to static prompt; surface only unexpected errors
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('not found in ClearGO') && !msg.includes('fetch failed')) {
        toast({ title: 'ClearGO unavailable — using static prep', variant: 'destructive' });
      }
      onCopy(buildStaticPrepPrompt(member), 'Prep prompt copied — paste into Cowork');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border border-border/50">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium text-sm">{member.name}</p>
            <p className="text-xs text-muted-foreground">{member.role}</p>
            {member.last_1on1_date && (
              <p className="text-xs text-muted-foreground mt-1">
                Last 1:1: {format(new Date(member.last_1on1_date + 'T12:00:00'), 'MMM d')}
              </p>
            )}
            {member.context_notes && (
              <p className="text-xs text-muted-foreground mt-1 italic leading-snug">{member.context_notes}</p>
            )}
            {CLEARGO_API_KEY && (
              <p className="text-xs text-primary/60 mt-1">Live data from ClearGO</p>
            )}
          </div>
          <Button
            variant="outline"
            className="h-10 text-sm flex-shrink-0 min-w-[90px]"
            onClick={handlePrep}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Prep 1:1'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TeamSection({ members, onCopy }: {
  members: CosTeamMember[];
  onCopy: (text: string, label?: string) => void;
}) {
  const directReports = members.filter(m => m.relationship_type === 'direct_report');
  const collaborators = members.filter(m => m.relationship_type === 'collaborator');

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <h2 className="text-lg font-semibold">Team</h2>
        {CLEARGO_API_KEY && (
          <Badge variant="secondary" className="text-xs">🟢 ClearGO live</Badge>
        )}
      </div>

      <div>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Direct Reports</h3>
          <Badge variant="secondary" className="text-xs">{directReports.length}</Badge>
        </div>
        <div className="space-y-2">
          {directReports.map(m => <MemberCard key={m.id} member={m} onCopy={onCopy} />)}
          {directReports.length === 0 && <p className="text-xs text-muted-foreground">None added yet.</p>}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Collaborators</h3>
          <Badge variant="secondary" className="text-xs">{collaborators.length}</Badge>
        </div>
        <div className="space-y-2">
          {collaborators.map(m => <MemberCard key={m.id} member={m} onCopy={onCopy} />)}
          {collaborators.length === 0 && <p className="text-xs text-muted-foreground">None added yet.</p>}
        </div>
      </div>
    </div>
  );
}
