import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import {
  Plus, ChevronUp, ChevronDown, Trash2, Check, X, Send, Copy, Save, Brain,
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
        <TabsList className="mb-6 w-full sm:w-auto">
          <TabsTrigger value="brief">Tonight's Brief</TabsTrigger>
          <TabsTrigger value="priorities">Priorities</TabsTrigger>
          <TabsTrigger value="dci">DCI History</TabsTrigger>
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
          <DciHistory logs={dciLogs} />
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
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onAdd(category)}>
                <Plus className="h-3.5 w-3.5 mr-1" />
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
          {/* Reorder arrows */}
          <div className="flex flex-col gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5">
            <button
              onClick={() => onMove(item.id, 'up')}
              disabled={isFirst}
              className="text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onMove(item.id, 'down')}
              disabled={isLast}
              className="text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:cursor-not-allowed"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {editing ? (
              <div className="flex items-center gap-1.5">
                <Input
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') saveText();
                    if (e.key === 'Escape') { setEditText(item.text); setEditing(false); }
                  }}
                  className="h-7 text-sm"
                  autoFocus
                />
                <button onClick={saveText} className="text-green-600 hover:text-green-700 flex-shrink-0">
                  <Check className="h-4 w-4" />
                </button>
                <button onClick={() => { setEditText(item.text); setEditing(false); }} className="text-muted-foreground hover:text-foreground flex-shrink-0">
                  <X className="h-4 w-4" />
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
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => onCopy(buildPrompt('recommend'))}
                  >
                    💡 Recommend next step
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
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
                    className="h-7 text-sm"
                    onKeyDown={e => {
                      if (e.key === 'Enter' && agentQuery.trim()) {
                        onCopy(buildPrompt('custom', agentQuery.trim()));
                        setAgentQuery('');
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 flex-shrink-0"
                    disabled={!agentQuery.trim()}
                    onClick={() => {
                      if (agentQuery.trim()) {
                        onCopy(buildPrompt('custom', agentQuery.trim()));
                        setAgentQuery('');
                      }
                    }}
                  >
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-muted-foreground hover:text-foreground"
              aria-label={expanded ? 'Collapse' : 'Expand'}
            >
              <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
            </button>
            <button
              onClick={() => onDelete(item.id)}
              className="text-muted-foreground hover:text-destructive"
              aria-label="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── DCI History ───────────────────────────────────────────────────────────────

function DciHistory({ logs }: { logs: CosDciLog[] }) {
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
          {/* Simple theme analytics */}
          {logs.length >= 3 && (
            <Card className="bg-muted/40 border-dashed">
              <CardContent className="p-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Quick stats</p>
                <div className="flex gap-6 text-sm">
                  <div>
                    <span className="font-semibold">{logs.length}</span>
                    <span className="text-muted-foreground ml-1">briefs</span>
                  </div>
                  <div>
                    <span className="font-semibold">
                      {logs.filter(l => l.topic_raised).length}
                    </span>
                    <span className="text-muted-foreground ml-1">had topics raised</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="space-y-3">
            {logs.map(log => (
              <Card key={log.id}>
                <CardContent className="p-4">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">
                    {format(new Date(log.date + 'T12:00:00'), 'EEEE, MMM d yyyy')}
                  </p>
                  <div className="space-y-1">
                    {[log.priority_1, log.priority_2, log.priority_3].filter(Boolean).map((p, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="text-xs text-muted-foreground mt-0.5 flex-shrink-0">{i + 1}.</span>
                        <span className="text-sm">{p}</span>
                      </div>
                    ))}
                  </div>
                  {log.topic_raised && (
                    <div className="mt-2 pt-2 border-t border-border/50">
                      <span className="text-xs text-muted-foreground">Topic raised: </span>
                      <span className="text-sm">{log.topic_raised}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Team ──────────────────────────────────────────────────────────────────────

function TeamSection({ members, onCopy }: {
  members: CosTeamMember[];
  onCopy: (text: string, label?: string) => void;
}) {
  const directReports = members.filter(m => m.relationship_type === 'direct_report');
  const collaborators = members.filter(m => m.relationship_type === 'collaborator');

  const buildPrepPrompt = (member: CosTeamMember) => {
    const parts = [`I have a 1:1 with ${member.name} (${member.role}) coming up.`];
    if (member.context_notes) parts.push(`Context: ${member.context_notes}.`);
    if (member.last_1on1_date) parts.push(`Last meeting: ${format(new Date(member.last_1on1_date + 'T12:00:00'), 'MMM d yyyy')}.`);
    parts.push('Please help me prepare: what questions should I ask, what updates to request, and how to make the most of this time?');
    return parts.join(' ');
  };

  const MemberCard = ({ member }: { member: CosTeamMember }) => (
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
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs flex-shrink-0"
            onClick={() => onCopy(buildPrepPrompt(member), 'Prep prompt copied — paste into Cowork')}
          >
            Prep 1:1
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-8">
      <h2 className="text-lg font-semibold">Team</h2>

      <div>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Direct Reports</h3>
          <Badge variant="secondary" className="text-xs">{directReports.length}</Badge>
        </div>
        <div className="space-y-2">
          {directReports.map(m => <MemberCard key={m.id} member={m} />)}
          {directReports.length === 0 && <p className="text-xs text-muted-foreground">None added yet.</p>}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Collaborators</h3>
          <Badge variant="secondary" className="text-xs">{collaborators.length}</Badge>
        </div>
        <div className="space-y-2">
          {collaborators.map(m => <MemberCard key={m.id} member={m} />)}
          {collaborators.length === 0 && <p className="text-xs text-muted-foreground">None added yet.</p>}
        </div>
      </div>
    </div>
  );
}
