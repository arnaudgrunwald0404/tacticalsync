import React, { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import {
  Plus, GripVertical, ChevronDown, Trash2, Check, X, Send, Copy, Save, Brain, Loader2, FileText, RefreshCw,
} from 'lucide-react';
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, KeyboardSensor, useSensor, useSensors,
  closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

// ── Types ────────────────────────────────────────────────────────────────────

interface CosPriority {
  id: string;
  user_id: string;
  text: string;
  category: 'now' | 'this_week' | 'this_month' | 'next_month' | 'strategic' | 'people';
  tier_order: number;
  notes: string | null;
  status: string | null;
  created_at: string;
  updated_at: string;
}

const DEFAULT_STATUS_OPTIONS = ['WIP', 'WOS', 'Done'];

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
  reports_to_id: string | null;
}

const COL1_CATEGORIES = ['now', 'this_week', 'this_month', 'next_month'] as const;
const COL2_CATEGORIES = ['strategic', 'people'] as const;
const ALL_CATEGORIES = [...COL1_CATEGORIES, ...COL2_CATEGORIES] as const;
type CategoryKey = CosPriority['category'];

function getCategoryLabels(): Record<CategoryKey, string> {
  const now = new Date();
  const thisMonth = now.toLocaleString('default', { month: 'long' });
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    .toLocaleString('default', { month: 'long' });
  return {
    now: 'Now',
    this_week: 'This Week',
    this_month: thisMonth,
    next_month: nextMonth,
    strategic: 'Strategic Opportunities',
    people: 'People to Meet',
  };
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ChiefOfStaff() {
  const { toast } = useToast();
  const [userId, setUserId] = useState<string | null>(null);
  const [priorities, setPriorities] = useState<CosPriority[]>([]);
  const [dciLogs, setDciLogs] = useState<CosDciLog[]>([]);
  const [teamMembers, setTeamMembers] = useState<CosTeamMember[]>([]);
  const [statusOptions, setStatusOptions] = useState<string[]>(DEFAULT_STATUS_OPTIONS);
  const [loading, setLoading] = useState(true);
  const isTodayMonday = new Date().getDay() === 1;
  const [briefLogged, setBriefLogged] = useState(false);
  const showBrief = isTodayMonday && !briefLogged;
  const [activeTab, setActiveTab] = useState(showBrief ? 'brief' : 'priorities');

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const [priRes, logsRes, teamRes, settingsRes] = await Promise.all([
        db.from('cos_priorities').select('*').eq('user_id', user.id).order('tier_order'),
        db.from('cos_dci_logs').select('*').eq('user_id', user.id).order('date', { ascending: false }),
        db.from('cos_team_members').select('*').eq('user_id', user.id).order('name'),
        db.from('cos_settings').select('*').eq('user_id', user.id).maybeSingle(),
      ]);

      setPriorities((priRes.data ?? []) as CosPriority[]);
      setDciLogs((logsRes.data ?? []) as CosDciLog[]);
      setTeamMembers((teamRes.data ?? []) as CosTeamMember[]);
      if (settingsRes.data?.status_options) {
        setStatusOptions(settingsRes.data.status_options as string[]);
      }
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

  const saveStatusOptions = async (options: string[]) => {
    if (!userId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('cos_settings').upsert(
      { user_id: userId, status_options: options, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
    setStatusOptions(options);
  };

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

  const reorderPriority = async (
    id: string,
    targetCategory: CategoryKey,
    insertBeforeId: string | null,
  ) => {
    const activeItem = priorities.find(p => p.id === id);
    if (!activeItem) return;
    const sourceCategory = activeItem.category;

    // Build new target list (excluding the moved item, then insert at position)
    const targetItems = priorities
      .filter(p => p.category === targetCategory && p.id !== id)
      .sort((a, b) => a.tier_order - b.tier_order);
    const insertIdx = insertBeforeId
      ? Math.max(0, targetItems.findIndex(p => p.id === insertBeforeId))
      : targetItems.length;
    const newTargetItems: CosPriority[] = [
      ...targetItems.slice(0, insertIdx === -1 ? targetItems.length : insertIdx),
      { ...activeItem, category: targetCategory },
      ...targetItems.slice(insertIdx === -1 ? targetItems.length : insertIdx),
    ];

    // Optimistic update
    setPriorities(prev => {
      const sourceItems = sourceCategory !== targetCategory
        ? prev.filter(p => p.category === sourceCategory && p.id !== id)
            .sort((a, b) => a.tier_order - b.tier_order)
            .map((p, i) => ({ ...p, tier_order: i + 1 }))
        : [];
      const others = prev.filter(
        p => p.category !== targetCategory && p.id !== id && p.category !== sourceCategory,
      );
      const reindexedTarget = newTargetItems.map((p, i) => ({ ...p, tier_order: i + 1 }));
      return sourceCategory !== targetCategory
        ? [...others, ...sourceItems, ...reindexedTarget]
        : [...others, ...reindexedTarget];
    });

    // Persist
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    await Promise.all([
      ...newTargetItems.map((p, i) =>
        db.from('cos_priorities').update({ category: targetCategory, tier_order: i + 1 }).eq('id', p.id),
      ),
      ...(sourceCategory !== targetCategory
        ? priorities
            .filter(p => p.category === sourceCategory && p.id !== id)
            .sort((a, b) => a.tier_order - b.tier_order)
            .map((p, i) => db.from('cos_priorities').update({ tier_order: i + 1 }).eq('id', p.id))
        : []),
    ]);
  };

  const logBrief = async (topPriorities: CosPriority[], topicRaised: string, numTopics?: number) => {
    if (!userId) return;
    const today = format(new Date(), 'yyyy-MM-dd');
    const existingToday = dciLogs.find(l => l.date === today);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const payload = {
      priority_1: topPriorities[0]?.text ?? null,
      priority_2: topPriorities[1]?.text ?? null,
      priority_3: topPriorities[2]?.text ?? null,
      topic_raised: topicRaised || null,
      notes: numTopics != null ? `${numTopics} topics` : null,
    };
    let data, error;
    if (existingToday) {
      ({ data, error } = await db.from('cos_dci_logs').update(payload).eq('id', existingToday.id).select().single());
      if (!error && data) setDciLogs(prev => prev.map(l => l.id === existingToday.id ? data as CosDciLog : l));
    } else {
      ({ data, error } = await db.from('cos_dci_logs').insert({ user_id: userId, date: today, ...payload }).select().single());
      if (!error && data) setDciLogs(prev => [data as CosDciLog, ...prev]);
    }
    if (!error && data) {
      setBriefLogged(true);
      setActiveTab('priorities');
      toast({ title: existingToday ? 'Brief updated' : 'Brief logged' });
    }
  };

  const updateDciLog = async (id: string, updates: Partial<CosDciLog>) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).from('cos_dci_logs').update(updates).eq('id', id).select().single();
    if (!error && data) setDciLogs(prev => prev.map(l => l.id === id ? { ...l, ...data } as CosDciLog : l));
  };

  const [rerunOpen, setRerunOpen] = useState(false);
  const openRerunBrief = () => setRerunOpen(true);
  const rerunDci = async (log: CosDciLog) => {
    if (!userId) return;
    const items = [
      { text: log.priority_1, status: log.priority_1_status, comment: log.priority_1_comment },
      { text: log.priority_2, status: log.priority_2_status, comment: log.priority_2_comment },
      { text: log.priority_3, status: log.priority_3_status, comment: log.priority_3_comment },
    ].filter(i => i.text && i.status !== 'done');

    const newPriorities = items.map(i => i.text!);
    const topic = `Rerun from ${format(new Date(log.date + 'T12:00:00'), 'MMM d')}`;
    const today = format(new Date(), 'yyyy-MM-dd');
    const existingToday = dciLogs.find(l => l.date === today);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    const payload = {
      priority_1: newPriorities[0] ?? null,
      priority_2: newPriorities[1] ?? null,
      priority_3: newPriorities[2] ?? null,
      topic_raised: topic,
    };
    let data, error;
    if (existingToday) {
      ({ data, error } = await db.from('cos_dci_logs').update(payload).eq('id', existingToday.id).select().single());
      if (!error && data) setDciLogs(prev => prev.map(l => l.id === existingToday.id ? data as CosDciLog : l));
    } else {
      ({ data, error } = await db.from('cos_dci_logs').insert({ user_id: userId, date: today, ...payload }).select().single());
      if (!error && data) setDciLogs(prev => [data as CosDciLog, ...prev]);
    }

    if (!error && data) {
      toast({ title: existingToday ? 'Brief updated from undone items' : 'New brief created from undone items' });
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

  // Derive which priorities were tagged on Monday this week
  const mondayOfCurrentWeek = (() => {
    const now = new Date();
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);
    return monday.toISOString().split('T')[0];
  })();
  const mondayLog = dciLogs.find(l => l.date === mondayOfCurrentWeek);
  const mondayTaggedTexts = mondayLog
    ? [mondayLog.priority_1, mondayLog.priority_2, mondayLog.priority_3].filter(Boolean) as string[]
    : [];

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <div className="flex items-center gap-2 mb-6">
        <Brain className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold">Chief of Staff</h1>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className={cn('mb-6 w-full grid', showBrief ? 'grid-cols-5' : 'grid-cols-4')}>
          {showBrief && <TabsTrigger value="brief">Brief</TabsTrigger>}
          <TabsTrigger value="priorities">Priorities</TabsTrigger>
          <TabsTrigger value="dci">DCI</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        {showBrief && (
          <TabsContent value="brief">
            <TonightsBrief
              priorities={thisWeekPriorities}
              onCopy={copyToClipboard}
              onLog={logBrief}
            />
          </TabsContent>
        )}

        <TabsContent value="priorities">
          <PrioritiesSection
            priorities={priorities}
            onUpdate={updatePriority}
            onAdd={addPriority}
            onDelete={deletePriority}
            onReorder={reorderPriority}
            onCopy={copyToClipboard}
            mondayTaggedTexts={mondayTaggedTexts}
            statusOptions={statusOptions}
          />
        </TabsContent>

        <TabsContent value="dci">
          <DciHistory logs={dciLogs} onUpdate={updateDciLog} onRerun={openRerunBrief} />
        </TabsContent>

        <TabsContent value="team">
          <TeamSection members={teamMembers} />
        </TabsContent>

        <TabsContent value="settings">
          <SettingsSection statusOptions={statusOptions} onSave={saveStatusOptions} />
        </TabsContent>
      </Tabs>

      <Sheet open={rerunOpen} onOpenChange={setRerunOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>Rerun DCI</SheetTitle>
          </SheetHeader>
          <TonightsBrief
            priorities={thisWeekPriorities}
            onCopy={copyToClipboard}
            onLog={(p, t, n) => {
              logBrief(p, t, n);
              setRerunOpen(false);
            }}
            heading="Today's Brief"
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ── Tonight's Brief ───────────────────────────────────────────────────────────

function TonightsBrief({ priorities, onCopy, onLog, heading = 'Monday Brief' }: {
  priorities: CosPriority[];
  onCopy: (text: string, label?: string) => void;
  onLog: (priorities: CosPriority[], topic: string, numTopics?: number) => void;
  heading?: string;
}) {
  const [topicRaised, setTopicRaised] = useState('');
  const [numTopics, setNumTopics] = useState<number | ''>('');
  const today = format(new Date(), 'EEEE, MMMM d');

  const buildBriefText = () => {
    const lines = [
      `DCI Brief — ${today}`,
      '',
      'Top 3 this week:',
      ...priorities.map((p, i) => `${i + 1}. ${p.text}`),
      '',
      `Topics for DCI: ${numTopics !== '' ? numTopics : 'TBD'}`,
    ];
    if (topicRaised) lines.push('', `Topic to raise: ${topicRaised}`);
    return lines.join('\n');
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{heading}</h2>
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

      <div className="flex items-center gap-3">
        <label className="text-sm font-medium whitespace-nowrap">Topics for DCI</label>
        <input
          type="number"
          min={0}
          placeholder="TBD"
          value={numTopics}
          onChange={e => setNumTopics(e.target.value === '' ? '' : Number(e.target.value))}
          className="w-20 h-9 rounded-md border border-input bg-background px-3 text-sm text-center"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Topic to raise <span className="text-muted-foreground font-normal">(optional)</span></label>
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
        <Button onClick={() => onLog(priorities, topicRaised, numTopics !== '' ? numTopics as number : undefined)}>
          <Save className="h-4 w-4 mr-2" />
          Log this brief
        </Button>
      </div>
    </div>
  );
}

// ── Priorities ────────────────────────────────────────────────────────────────

function CategoryBucket({
  category, label, items, onUpdate, onAdd, onDelete, onCopy, mondayTaggedTexts, statusOptions,
}: {
  category: CategoryKey;
  label: string;
  items: CosPriority[];
  onUpdate: (id: string, updates: Partial<CosPriority>) => void;
  onAdd: (category: CategoryKey) => void;
  onDelete: (id: string) => void;
  onCopy: (text: string, label?: string) => void;
  mondayTaggedTexts: string[];
  statusOptions: string[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: category });
  return (
    <div
      ref={setNodeRef}
      className={cn('rounded-lg transition-colors', isOver && 'bg-primary/5')}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm">{label}</h3>
          <Badge variant="secondary" className="text-xs">{items.length}</Badge>
        </div>
        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => onAdd(category)}>
          <Plus className="h-3.5 w-3.5 mr-1" />Add
        </Button>
      </div>
      <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-1.5">
          {items.map(item => (
            <SortablePriorityCard
              key={item.id}
              item={item}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onCopy={onCopy}
              isTagged={mondayTaggedTexts.includes(item.text)}
              statusOptions={statusOptions}
            />
          ))}
          {items.length === 0 && (
            <div className={cn(
              'rounded-md border-2 border-dashed border-border/40 py-4 text-center text-xs text-muted-foreground',
              isOver && 'border-primary/40 bg-primary/5',
            )}>
              Drop here
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

function SortablePriorityCard({
  item, onUpdate, onDelete, onCopy, isTagged, statusOptions,
}: {
  item: CosPriority;
  onUpdate: (id: string, updates: Partial<CosPriority>) => void;
  onDelete: (id: string) => void;
  onCopy: (text: string, label?: string) => void;
  isTagged: boolean;
  statusOptions: string[];
}) {
  const isMobile = useIsMobile();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
    >
      <PriorityCard
        item={item}
        dragListeners={isMobile ? undefined : listeners}
        dragAttributes={isMobile ? undefined : attributes}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onCopy={onCopy}
        isTagged={isTagged}
        statusOptions={statusOptions}
      />
    </div>
  );
}

function PrioritiesSection({ priorities, onUpdate, onAdd, onDelete, onReorder, onCopy, mondayTaggedTexts, statusOptions }: {
  priorities: CosPriority[];
  onUpdate: (id: string, updates: Partial<CosPriority>) => void;
  onAdd: (category: CategoryKey) => void;
  onDelete: (id: string) => void;
  onReorder: (id: string, targetCategory: CategoryKey, insertBeforeId: string | null) => void;
  onCopy: (text: string, label?: string) => void;
  mondayTaggedTexts: string[];
  statusOptions: string[];
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeItem = priorities.find(p => p.id === activeId);
  const categoryLabels = getCategoryLabels();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragStart = ({ active }: DragStartEvent) => setActiveId(active.id as string);

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (!over || active.id === over.id) return;
    const activeItem = priorities.find(p => p.id === active.id);
    if (!activeItem) return;

    const overId = over.id as string;
    const targetCategory = ALL_CATEGORIES.includes(overId as CategoryKey)
      ? (overId as CategoryKey)
      : (priorities.find(p => p.id === overId)?.category ?? activeItem.category);

    const insertBeforeId = ALL_CATEGORIES.includes(overId as CategoryKey) ? null : overId;
    onReorder(activeItem.id, targetCategory, insertBeforeId);
  };

  const sortedFor = (cat: CategoryKey) =>
    priorities.filter(p => p.category === cat).sort((a, b) => a.tier_order - b.tier_order);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="grid gap-8 md:grid-cols-[3fr_2fr]">
        {/* Column 1 — time buckets */}
        <div className="space-y-6">
          {COL1_CATEGORIES.map(cat => (
            <CategoryBucket
              key={cat}
              category={cat}
              label={categoryLabels[cat]}
              items={sortedFor(cat)}
              onUpdate={onUpdate}
              onAdd={onAdd}
              onDelete={onDelete}
              onCopy={onCopy}
              mondayTaggedTexts={mondayTaggedTexts}
              statusOptions={statusOptions}
            />
          ))}
        </div>
        {/* Column 2 — strategic buckets */}
        <div className="space-y-6">
          {COL2_CATEGORIES.map(cat => (
            <CategoryBucket
              key={cat}
              category={cat}
              label={categoryLabels[cat]}
              items={sortedFor(cat)}
              onUpdate={onUpdate}
              onAdd={onAdd}
              onDelete={onDelete}
              onCopy={onCopy}
              mondayTaggedTexts={mondayTaggedTexts}
              statusOptions={statusOptions}
            />
          ))}
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeItem ? (
          <Card className="border border-primary/30 shadow-lg opacity-95 cursor-grabbing">
            <CardContent className="p-3">
              <p className="text-sm font-medium leading-snug">{activeItem.text}</p>
            </CardContent>
          </Card>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

// Colours cycle through these in order, looping back if there are more options than colours
const STATUS_BADGE_COLORS = [
  'bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-200',
  'bg-amber-100 text-amber-800 border-amber-200 hover:bg-amber-200',
  'bg-green-100 text-green-800 border-green-200 hover:bg-green-200',
  'bg-purple-100 text-purple-800 border-purple-200 hover:bg-purple-200',
  'bg-rose-100 text-rose-800 border-rose-200 hover:bg-rose-200',
];

function PriorityCard({
  item, dragListeners, dragAttributes, onUpdate, onDelete, onCopy, isTagged, statusOptions,
}: {
  item: CosPriority;
  dragListeners?: React.HTMLAttributes<HTMLElement>;
  dragAttributes?: React.HTMLAttributes<HTMLElement>;
  onUpdate: (id: string, updates: Partial<CosPriority>) => void;
  onDelete: (id: string) => void;
  onCopy: (text: string, label?: string) => void;
  isTagged?: boolean;
  statusOptions: string[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(item.text);
  const [editNotes, setEditNotes] = useState(item.notes ?? '');
  const [agentQuery, setAgentQuery] = useState('');

  const cycleStatus = () => {
    const idx = item.status ? statusOptions.indexOf(item.status) : -1;
    const next = idx < statusOptions.length - 1 ? statusOptions[idx + 1] : null;
    onUpdate(item.id, { status: next });
  };
  const statusIdx = item.status ? statusOptions.indexOf(item.status) : -1;
  const statusColor = statusIdx >= 0 ? STATUS_BADGE_COLORS[statusIdx % STATUS_BADGE_COLORS.length] : null;

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
        <div className="flex items-start gap-1.5">
          {/* Drag handle — hidden on mobile so the left edge stays scrollable */}
          <button
            {...dragListeners}
            {...dragAttributes}
            className="hidden sm:block flex-shrink-0 mt-0.5 p-1 text-muted-foreground/30 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label="Drag to reorder"
          >
            <GripVertical className="h-4 w-4" />
          </button>

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
              <div className="flex items-start gap-2 flex-wrap">
                {isTagged && (
                  <Badge variant="secondary" className="text-xs shrink-0 bg-primary/10 text-primary border border-primary/20">
                    W
                  </Badge>
                )}
                <button
                  onClick={() => setEditing(true)}
                  className="text-sm font-medium text-left hover:text-primary transition-colors leading-snug"
                >
                  {item.text}
                </button>
              </div>
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
                  <Button variant="outline" className="h-10 text-sm" onClick={() => onCopy(buildPrompt('recommend'))}>
                    💡 Recommend next step
                  </Button>
                  <Button variant="outline" className="h-10 text-sm" onClick={() => onCopy(buildPrompt('draft'))}>
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
                      if (agentQuery.trim()) { onCopy(buildPrompt('custom', agentQuery.trim())); setAgentQuery(''); }
                    }}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={cycleStatus}
              title={item.status ? `Status: ${item.status} — click to advance` : 'Click to set status'}
              className={cn(
                'text-xs font-medium px-2 py-0.5 rounded border transition-colors',
                statusColor ?? 'bg-muted/40 text-muted-foreground border-border/40 hover:bg-muted',
              )}
            >
              {item.status ?? '·'}
            </button>
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-2 text-muted-foreground hover:text-foreground"
              aria-label={expanded ? 'Collapse' : 'Expand'}
            >
              <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
            </button>
            <button
              onClick={() => onDelete(item.id)}
              className="hidden sm:inline-flex p-2 text-muted-foreground hover:text-destructive"
              aria-label="Delete"
            >
              <Trash2 className="h-4 w-4" />
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
  onRerun: () => void;
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
            onClick={onRerun}
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
  onRerun: () => void;
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

// ── 1:1 prep — local markdown renderer ───────────────────────────────────────

function inlineMarkdown(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith('*') && part.endsWith('*')) return <em key={i}>{part.slice(1, -1)}</em>;
    return part;
  });
}

function renderMarkdown(content: string): React.ReactNode {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('### ')) {
      elements.push(<h3 key={i} className="font-semibold text-sm mt-4 mb-1 text-foreground">{inlineMarkdown(line.slice(4))}</h3>);
    } else if (line.startsWith('## ')) {
      elements.push(<h2 key={i} className="font-bold text-base mt-5 mb-1 border-b border-border pb-1">{inlineMarkdown(line.slice(3))}</h2>);
    } else if (line.startsWith('# ')) {
      elements.push(<h1 key={i} className="font-bold text-lg mt-4 mb-2">{inlineMarkdown(line.slice(2))}</h1>);
    } else if (line.match(/^---+$/)) {
      elements.push(<hr key={i} className="my-3 border-border" />);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      const items: string[] = [];
      while (i < lines.length && (lines[i].startsWith('- ') || lines[i].startsWith('* '))) {
        items.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="list-disc pl-5 space-y-0.5 my-1">
          {items.map((it, j) => <li key={j} className="text-sm leading-snug">{inlineMarkdown(it)}</li>)}
        </ul>
      );
      continue;
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="h-1.5" />);
    } else {
      elements.push(<p key={i} className="text-sm leading-relaxed">{inlineMarkdown(line)}</p>);
    }
    i++;
  }
  return <>{elements}</>;
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

async function generatePrep(member: CosTeamMember): Promise<{ content: string; source: 'cleargo' | 'static' }> {
  if (CLEARGO_API_KEY) {
    try {
      const content = await fetchCleargoPrep(member);
      return { content, source: 'cleargo' };
    } catch {
      // fall through to static
    }
  }
  return { content: buildStaticPrepPrompt(member), source: 'static' };
}

function formatGeneratedAt(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return format(new Date(iso), 'MMM d, h:mm a');
}

// ── Team ──────────────────────────────────────────────────────────────────────

function MemberCard({ member, onViewPrep, compact }: {
  member: CosTeamMember;
  onViewPrep: (member: CosTeamMember) => void;
  compact?: boolean;
}) {
  return (
    <Card className={cn('border border-border/50', compact && 'bg-muted/20')}>
      <CardContent className={cn('p-4', compact && 'p-3')}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className={cn('font-medium', compact ? 'text-sm' : 'text-sm')}>{member.name}</p>
            <p className="text-xs text-muted-foreground">{member.role}</p>
            {!compact && member.last_1on1_date && (
              <p className="text-xs text-muted-foreground mt-1">
                Last 1:1: {format(new Date(member.last_1on1_date + 'T12:00:00'), 'MMM d')}
              </p>
            )}
            {!compact && member.context_notes && (
              <p className="text-xs text-muted-foreground mt-1 italic leading-snug">{member.context_notes}</p>
            )}
          </div>
          <Button
            variant="outline"
            className={cn('flex-shrink-0 gap-1.5 touch-manipulation', compact ? 'h-8 text-xs' : 'h-10 text-sm')}
            onClick={() => onViewPrep(member)}
          >
            <FileText className={cn(compact ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
            <span className="hidden sm:inline">View 1:1 Prep</span>
            <span className="sm:hidden">Prep</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}


function TeamSection({ members }: { members: CosTeamMember[] }) {
  const { toast } = useToast();
  const [prepSheet, setPrepSheet] = useState<{
    member: CosTeamMember;
    content: string;
    source: 'cleargo' | 'static';
    generatedAt: string;
  } | null>(null);
  const [sharing, setSharing] = useState(false);
  const [loadingPrep, setLoadingPrep] = useState(false);
  const [refreshingPrep, setRefreshingPrep] = useState(false);

  const sharePrep = async () => {
    if (!prepSheet) return;
    setSharing(true);
    try {
      const { data, error } = await supabase.functions.invoke('share-prep', {
        body: { memberName: prepSheet.member.name, content: prepSheet.content },
      });
      if (error) throw error;
      const channel = (data as { channel?: string })?.channel ?? 'unknown';
      toast({
        title: channel === 'slack' ? 'Sent via Slack ✓' : 'Sent via email ✓',
        description: channel === 'slack'
          ? `Prep note for ${prepSheet.member.name} sent to your Slack DM`
          : `Prep note for ${prepSheet.member.name} sent to your email`,
      });
    } catch (err) {
      toast({ title: 'Share failed', description: String(err), variant: 'destructive' });
    } finally {
      setSharing(false);
    }
  };

  // Build tree: roots = direct_reports with no reports_to_id
  const directReports = members.filter(
    m => m.relationship_type === 'direct_report' && !m.reports_to_id
  ).sort((a, b) => a.name.localeCompare(b.name));

  // Map manager id → their reports
  const reportsByManager: Record<string, CosTeamMember[]> = {};
  for (const m of members) {
    if (m.reports_to_id) {
      (reportsByManager[m.reports_to_id] ??= []).push(m);
    }
  }
  // Sort each manager's reports alphabetically
  for (const list of Object.values(reportsByManager)) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }

  const collaborators = members.filter(m => m.relationship_type === 'collaborator')
    .sort((a, b) => a.name.localeCompare(b.name));

  const openPrepFile = async (member: CosTeamMember) => {
    // 1. Try ClearGO API
    try {
      const content = await fetchCleargoPrep(member);
      setPrepSheet({ member, content });
      return;
    } catch {
      // fall through
    }

    // 2. Try local filesystem
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fsApi = (window as any).showDirectoryPicker;
    if (fsApi) {
      if (!dirHandleRef.current) {
        try {
          dirHandleRef.current = await fsApi({ id: '1on1-prep', mode: 'read' });
        } catch {
          // user cancelled — fall through
        }
      }
      if (dirHandleRef.current) {
        const slug = member.name.trim().toLowerCase().replace(/\s+/g, '_');
        try {
          const fileHandle = await dirHandleRef.current.getFileHandle(`${slug}.md`);
          const file = await fileHandle.getFile();
          const content = await file.text();
          setPrepSheet({ member, content });
          return;
        } catch {
          dirHandleRef.current = null;
        }
      }
    }

    // 3. Fall back: show static prep prompt in the sheet and copy to clipboard
    const content = buildStaticPrepPrompt(member);
    setPrepSheet({ member, content });
    try { await navigator.clipboard.writeText(content); } catch { /* ignore */ }
    toast({ title: 'Prep prompt ready — also copied to clipboard' });
  };

  const totalDirectLine = directReports.length +
    Object.values(reportsByManager).reduce((s, arr) => s + arr.length, 0);

  return (
    <>
      <div className="space-y-8">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Team</h2>
          <Badge variant="secondary" className="text-xs">{totalDirectLine}</Badge>
        </div>

        {/* Org tree */}
        <div className="space-y-3">
          {/* You (root) */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20">
            <div className="h-2 w-2 rounded-full bg-primary" />
            <span className="text-sm font-semibold text-primary">You</span>
          </div>

          {/* Direct reports + their trees */}
          <div className="pl-4 border-l-2 border-border space-y-4">
            {directReports.map(manager => {
              const reports = reportsByManager[manager.id] ?? [];
              return (
                <div key={manager.id} className="space-y-2">
                  {/* Manager row */}
                  <MemberCard member={manager} onViewPrep={openPrep} />

                  {/* Their direct reports indented */}
                  {reports.length > 0 && (
                    <div className="pl-4 border-l-2 border-border/50 space-y-1.5 ml-2">
                      {reports.map(r => (
                        <div key={r.id}>
                          <MemberCard member={r} onViewPrep={openPrep} compact />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {directReports.length === 0 && (
              <p className="text-xs text-muted-foreground py-2">No direct reports yet.</p>
            )}
          </div>
        </div>

        {/* Collaborators */}
        {collaborators.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Collaborators</h3>
              <Badge variant="secondary" className="text-xs">{collaborators.length}</Badge>
            </div>
            <div className="space-y-2">
              {collaborators.map(m => <MemberCard key={m.id} member={m} onViewPrep={openPrep} />)}
            </div>
          </div>
        )}
      </div>

      {/* 1:1 Prep Sheet */}
      <Sheet open={!!prepSheet} onOpenChange={open => { if (!open) setPrepSheet(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader className="mb-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <SheetTitle className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  {prepSheet?.member.name} — 1:1 Prep
                </SheetTitle>
                {prepSheet && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Generated {formatGeneratedAt(prepSheet.generatedAt)} · {prepSheet.source === 'cleargo' ? 'ClearGO' : 'Static'}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={refreshingPrep}
                  onClick={refreshPrep}
                >
                  {refreshingPrep
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <RefreshCw className="h-4 w-4" />}
                  <span className="hidden sm:inline">{refreshingPrep ? 'Refreshing…' : 'Refresh'}</span>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={sharing}
                  onClick={sharePrep}
                >
                  {sharing
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Send className="h-4 w-4" />}
                  <span className="hidden sm:inline">{sharing ? 'Sending…' : 'Share'}</span>
                </Button>
              </div>
            </div>
          </SheetHeader>
          <div className="prose-sm text-foreground">
            {prepSheet && renderMarkdown(prepSheet.content)}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

// ── Settings ──────────────────────────────────────────────────────────────────

function SettingsSection({ statusOptions, onSave }: {
  statusOptions: string[];
  onSave: (options: string[]) => Promise<void>;
}) {
  const [draft, setDraft] = useState<string[]>(statusOptions);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  // Keep draft in sync if parent options change (e.g. on initial load)
  React.useEffect(() => { setDraft(statusOptions); }, [statusOptions]);

  const update = (idx: number, val: string) =>
    setDraft(prev => prev.map((s, i) => (i === idx ? val : s)));

  const remove = (idx: number) =>
    setDraft(prev => prev.filter((_, i) => i !== idx));

  const addOption = () => setDraft(prev => [...prev, '']);

  const save = async () => {
    const cleaned = draft.map(s => s.trim()).filter(Boolean);
    if (cleaned.length === 0) {
      toast({ title: 'Add at least one status option', variant: 'destructive' });
      return;
    }
    setSaving(true);
    await onSave(cleaned);
    setSaving(false);
    toast({ title: 'Status options saved' });
  };

  return (
    <div className="max-w-sm space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Settings</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure the status options that cycle on each priority card.
          Click a status badge once to advance to the next state; the last
          state cycles back to none.
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Priority statuses (in order)</label>
        {draft.map((opt, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <Input
              value={opt}
              onChange={e => update(idx, e.target.value)}
              placeholder={`Status ${idx + 1}`}
              className="h-9 text-sm"
            />
            <button
              onClick={() => remove(idx)}
              className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
              aria-label="Remove"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        <Button size="sm" variant="ghost" className="h-8 text-xs mt-1" onClick={addOption}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add status
        </Button>
      </div>

      <Button onClick={save} disabled={saving} className="h-9">
        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
        Save
      </Button>
    </div>
  );
}
