import React, { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import {
  Plus, GripVertical, ChevronDown, Trash2, Check, X, Send, Copy, Save, Loader2, FileText, RefreshCw, RotateCcw,
} from 'lucide-react';
import {
  DndContext, DragEndEvent, DragOverEvent, DragOverlay, DragStartEvent,
  PointerSensor, KeyboardSensor, useSensor, useSensors,
  pointerWithin, MeasuringStrategy, UniqueIdentifier,
} from '@dnd-kit/core';
import { snapCenterToCursor } from '@dnd-kit/modifiers';
import {
  SortableContext, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
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
import {
  CosSectionType, CosColumnSection, CosColumn, CosLayoutConfig,
  DEFAULT_STATUS_OPTIONS, DEFAULT_LAYOUT_CONFIG,
  SECTION_TYPE_LABELS, isAutoType, resolveNewSectionLabel,
  sectionToCategoryKey, totalWidthPct, adjustColumnCount, migrateOldSettings,
} from '@/types/cos';

// ── Types ────────────────────────────────────────────────────────────────────

interface CosPriority {
  id: string;
  user_id: string;
  text: string;
  category: string;
  tier_order: number;
  notes: string | null;
  status: string | null;
  created_at: string;
  updated_at: string;
  done_at: string | null;
  archived_at: string | null;
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

interface CosPersonAccountability {
  id: string;
  user_id: string;
  member_id: string;
  text: string;
  sort_order: number;
}

interface CosPersonTopic {
  id: string;
  user_id: string;
  member_id: string;
  text: string;
  status: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

type CategoryKey = string;

// Legacy types — only used internally for migration
interface CosCol1Section { key: string; label: string | null; auto_label: boolean; enabled: boolean; }
interface CosCol2Section { key: string; label: string; enabled: boolean; }
interface CosTabLabels   { priorities: string; dci: string; team: string; }

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ChiefOfStaff() {
  const { toast } = useToast();
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [priorities, setPriorities] = useState<CosPriority[]>([]);
  const [dciLogs, setDciLogs] = useState<CosDciLog[]>([]);
  const [teamMembers, setTeamMembers] = useState<CosTeamMember[]>([]);
  const [statusOptions, setStatusOptions] = useState<string[]>(DEFAULT_STATUS_OPTIONS);
  const [layoutConfig, setLayoutConfig] = useState<CosLayoutConfig>(DEFAULT_LAYOUT_CONFIG);
  const [accountabilities, setAccountabilities] = useState<CosPersonAccountability[]>([]);
  const [personTopics, setPersonTopics] = useState<CosPersonTopic[]>([]);
  const [newlyAddedAccountabilityId, setNewlyAddedAccountabilityId] = useState<string | null>(null);
  const [newlyAddedTopicId, setNewlyAddedTopicId] = useState<string | null>(null);
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
      setUserEmail(user.email ?? null);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const [priRes, logsRes, teamRes, settingsRes, acctRes, topicsRes] = await Promise.all([
        db.from('cos_priorities').select('*').eq('user_id', user.id).order('tier_order'),
        db.from('cos_dci_logs').select('*').eq('user_id', user.id).order('date', { ascending: false }),
        db.from('cos_team_members').select('*').eq('user_id', user.id).order('name'),
        db.from('cos_settings').select('*').eq('user_id', user.id).maybeSingle(),
        db.from('cos_person_accountabilities').select('*').eq('user_id', user.id).order('sort_order'),
        db.from('cos_person_topics').select('*').eq('user_id', user.id).order('sort_order'),
      ]);

      setPriorities((priRes.data ?? []) as CosPriority[]);
      setDciLogs((logsRes.data ?? []) as CosDciLog[]);
      setTeamMembers((teamRes.data ?? []) as CosTeamMember[]);
      if (settingsRes.data?.status_options) {
        setStatusOptions(settingsRes.data.status_options as string[]);
      }
      const raw = settingsRes.data as Record<string, unknown> | null;
      if (raw?.layout_config) {
        setLayoutConfig(raw.layout_config as CosLayoutConfig);
      } else if (raw) {
        setLayoutConfig(migrateOldSettings(raw));
      }
      setAccountabilities((acctRes.data ?? []) as CosPersonAccountability[]);
      setPersonTopics((topicsRes.data ?? []) as CosPersonTopic[]);
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

  const saveLayoutConfig = async (newConfig: CosLayoutConfig) => {
    if (!userId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('cos_settings').upsert(
      { user_id: userId, layout_config: newConfig, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
    setLayoutConfig(newConfig);
  };

  const updatePriority = async (id: string, updates: Partial<CosPriority>) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).from('cos_priorities').update(updates).eq('id', id).select().single();
    if (!error && data) setPriorities(prev => prev.map(p => p.id === id ? { ...p, ...data } as CosPriority : p));
  };

  const [newlyAddedId, setNewlyAddedId] = useState<string | null>(null);

  const addPriority = async (category: CosPriority['category']) => {
    if (!userId) return;
    const catPriorities = priorities.filter(p => p.category === category);
    const maxOrder = catPriorities.length > 0 ? Math.max(...catPriorities.map(p => p.tier_order)) : 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).from('cos_priorities').insert({
      user_id: userId, text: '', category, tier_order: maxOrder + 1,
    }).select().single();
    if (!error && data) {
      setPriorities(prev => [...prev, data as CosPriority]);
      setNewlyAddedId((data as CosPriority).id);
    }
  };

  const deletePriority = async (id: string) => {
    // Soft-archive instead of hard delete — item lands in the Archive section
    const now = new Date().toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('cos_priorities').update({ archived_at: now }).eq('id', id);
    setPriorities(prev => prev.map(p => p.id === id ? { ...p, archived_at: now } : p));
  };

  const permanentDeletePriority = async (id: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('cos_priorities').delete().eq('id', id);
    setPriorities(prev => prev.filter(p => p.id !== id));
  };

  const restoreArchivedPriority = async (id: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('cos_priorities').update({ archived_at: null, done_at: null }).eq('id', id);
    setPriorities(prev => prev.map(p => p.id === id ? { ...p, archived_at: null, done_at: null } : p));
  };

  const reorderPriority = async (
    id: string,
    targetCategory: CategoryKey,
    insertBeforeId: string | null,
  ) => {
    const item = priorities.find(p => p.id === id);
    if (!item) return;
    const srcCat = item.category;
    const targetItems = priorities
      .filter(p => p.category === targetCategory && p.id !== id)
      .sort((a, b) => a.tier_order - b.tier_order);
    const insertIdx = insertBeforeId
      ? targetItems.findIndex(p => p.id === insertBeforeId)
      : targetItems.length;
    const idx = insertIdx === -1 ? targetItems.length : insertIdx;
    const newTargetItems: CosPriority[] = [
      ...targetItems.slice(0, idx),
      { ...item, category: targetCategory },
      ...targetItems.slice(idx),
    ];
    setPriorities(prev => {
      const srcItems = srcCat !== targetCategory
        ? prev.filter(p => p.category === srcCat && p.id !== id)
            .sort((a, b) => a.tier_order - b.tier_order)
            .map((p, i) => ({ ...p, tier_order: i + 1 }))
        : [];
      const others = prev.filter(p => p.category !== targetCategory && p.id !== id && p.category !== srcCat);
      const reindexed = newTargetItems.map((p, i) => ({ ...p, tier_order: i + 1 }));
      return srcCat !== targetCategory ? [...others, ...srcItems, ...reindexed] : [...others, ...reindexed];
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    await Promise.all([
      ...newTargetItems.map((p, i) => db.from('cos_priorities').update({ category: targetCategory, tier_order: i + 1 }).eq('id', p.id)),
      ...(srcCat !== targetCategory
        ? priorities.filter(p => p.category === srcCat && p.id !== id).sort((a, b) => a.tier_order - b.tier_order)
            .map((p, i) => db.from('cos_priorities').update({ tier_order: i + 1 }).eq('id', p.id))
        : []),
    ]);
  };

  const markDone = async (id: string) => {
    const now = new Date().toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('cos_priorities').update({ done_at: now }).eq('id', id);
    setPriorities(prev => prev.map(p => p.id === id ? { ...p, done_at: now } : p));
  };

  const markUndone = async (id: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('cos_priorities').update({ done_at: null }).eq('id', id);
    setPriorities(prev => prev.map(p => p.id === id ? { ...p, done_at: null } : p));
  };

  const addAccountability = async (memberId: string) => {
    if (!userId) return;
    const memberAccts = accountabilities.filter(a => a.member_id === memberId);
    const maxOrder = memberAccts.length > 0 ? Math.max(...memberAccts.map(a => a.sort_order)) : 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).from('cos_person_accountabilities').insert({
      user_id: userId, member_id: memberId, text: '', sort_order: maxOrder + 1,
    }).select().single();
    if (!error && data) {
      setAccountabilities(prev => [...prev, data as CosPersonAccountability]);
      setNewlyAddedAccountabilityId((data as CosPersonAccountability).id);
    }
  };

  const updateAccountability = async (id: string, text: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('cos_person_accountabilities').update({ text }).eq('id', id);
    setAccountabilities(prev => prev.map(a => a.id === id ? { ...a, text } : a));
  };

  const deleteAccountability = async (id: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('cos_person_accountabilities').delete().eq('id', id);
    setAccountabilities(prev => prev.filter(a => a.id !== id));
  };

  const addPersonTopic = async (memberId: string) => {
    if (!userId) return;
    const memberTopics = personTopics.filter(t => t.member_id === memberId);
    const maxOrder = memberTopics.length > 0 ? Math.max(...memberTopics.map(t => t.sort_order)) : 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).from('cos_person_topics').insert({
      user_id: userId, member_id: memberId, text: '', sort_order: maxOrder + 1,
    }).select().single();
    if (!error && data) {
      setPersonTopics(prev => [...prev, data as CosPersonTopic]);
      setNewlyAddedTopicId((data as CosPersonTopic).id);
    }
  };

  const updatePersonTopic = async (id: string, updates: Partial<CosPersonTopic>) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('cos_person_topics').update(updates).eq('id', id);
    setPersonTopics(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  };

  const deletePersonTopic = async (id: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('cos_person_topics').delete().eq('id', id);
    setPersonTopics(prev => prev.filter(t => t.id !== id));
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
      <div className="container mx-auto px-6 py-6 max-w-7xl space-y-4">
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const prioritiesTabLabel = layoutConfig.columns[0]?.headerLabel || 'Priorities';

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
    <div className="container mx-auto px-6 py-6 max-w-7xl">
      <div className="flex items-center gap-2 mb-6">
        <h1 className="text-xl font-semibold">Chief of Staff</h1>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className={cn('mb-6 grid w-full', showBrief ? 'grid-cols-4 sm:w-[440px]' : 'grid-cols-3 sm:w-[360px]')}>
          {showBrief && <TabsTrigger value="brief">Brief</TabsTrigger>}
          <TabsTrigger value="priorities">My Lists</TabsTrigger>
          <TabsTrigger value="dci" title="Daily Check-In">DCI</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
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
            newlyAddedId={newlyAddedId}
            onNewlyAddedConsumed={() => setNewlyAddedId(null)}
            members={teamMembers}
            accountabilities={accountabilities}
            personTopics={personTopics}
            onAddAccountability={addAccountability}
            onUpdateAccountability={updateAccountability}
            onDeleteAccountability={deleteAccountability}
            onAddPersonTopic={addPersonTopic}
            onUpdatePersonTopic={updatePersonTopic}
            onDeletePersonTopic={deletePersonTopic}
            newlyAddedAccountabilityId={newlyAddedAccountabilityId}
            newlyAddedTopicId={newlyAddedTopicId}
            onNewlyAddedAccountabilityConsumed={() => setNewlyAddedAccountabilityId(null)}
            onNewlyAddedTopicConsumed={() => setNewlyAddedTopicId(null)}
            onPermanentDelete={permanentDeletePriority}
            onRestoreArchived={restoreArchivedPriority}
            layoutConfig={layoutConfig}
          />
        </TabsContent>

        <TabsContent value="dci">
          {userEmail === 'agrunwald@clearcompany.com' ? (
            <DciHistory logs={dciLogs} onUpdate={updateDciLog} onRerun={openRerunBrief} />
          ) : (
            <div className="flex items-center justify-center py-24 text-center">
              <p className="text-muted-foreground text-sm max-w-sm">
                In the near future, we will help you automate the creation of your Daily Check-In priorities.
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="team">
          {userEmail === 'agrunwald@clearcompany.com' ? (
            <TeamSection members={teamMembers} />
          ) : (
            <div className="flex items-center justify-center py-24 text-center">
              <p className="text-muted-foreground text-sm max-w-sm">
                In the near future, we will help you prepare your 1-1s.
              </p>
            </div>
          )}
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

// ── Person sections (Priorities tab) ─────────────────────────────────────────

function AccountabilityRow({
  item, autoFocus, onAutoFocusConsumed, onUpdate, onDelete,
}: {
  item: CosPersonAccountability;
  autoFocus?: boolean;
  onAutoFocusConsumed?: () => void;
  onUpdate: (id: string, text: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(item.text);

  useEffect(() => {
    if (!autoFocus) return;
    setEditing(true);
    setEditText('');
    onAutoFocusConsumed?.();
  }, [autoFocus]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => {
    const trimmed = editText.trim();
    if (trimmed && trimmed !== item.text) onUpdate(item.id, trimmed);
    else if (!trimmed && !item.text) onDelete(item.id);
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-1 group/row py-0.5">
      {editing ? (
        <>
          <Input
            value={editText}
            onChange={e => setEditText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') save();
              if (e.key === 'Escape') { setEditText(item.text); setEditing(false); }
            }}
            className="h-7 text-xs flex-1"
            autoFocus
          />
          <button onClick={save} className="p-1 text-green-600 hover:text-green-700 flex-shrink-0">
            <Check className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => { setEditText(item.text); setEditing(false); }} className="p-1 text-muted-foreground hover:text-foreground flex-shrink-0">
            <X className="h-3.5 w-3.5" />
          </button>
        </>
      ) : (
        <>
          <span className="text-muted-foreground text-xs mr-0.5 flex-shrink-0">•</span>
          <button
            onClick={() => { setEditing(true); setEditText(item.text); }}
            className="text-xs text-left flex-1 hover:text-primary transition-colors leading-snug"
          >
            {item.text || <span className="text-muted-foreground/60 italic">Click to add</span>}
          </button>
          <button
            onClick={() => onDelete(item.id)}
            className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover/row:opacity-100 transition-opacity flex-shrink-0"
            aria-label="Delete"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </>
      )}
    </div>
  );
}

function PersonTopicCard({
  topic, autoFocus, onAutoFocusConsumed, onUpdate, onDelete, statusOptions,
}: {
  topic: CosPersonTopic;
  autoFocus?: boolean;
  onAutoFocusConsumed?: () => void;
  onUpdate: (id: string, updates: Partial<CosPersonTopic>) => void;
  onDelete: (id: string) => void;
  statusOptions: string[];
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(topic.text);

  useEffect(() => {
    if (!autoFocus) return;
    setEditing(true);
    setEditText('');
    onAutoFocusConsumed?.();
  }, [autoFocus]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => {
    const trimmed = editText.trim();
    if (trimmed && trimmed !== topic.text) onUpdate(topic.id, { text: trimmed });
    else if (!trimmed && !topic.text) onDelete(topic.id);
    setEditing(false);
  };

  const cycleStatus = () => {
    const idx = topic.status ? statusOptions.indexOf(topic.status) : -1;
    const next = idx < statusOptions.length - 1 ? statusOptions[idx + 1] : null;
    onUpdate(topic.id, { status: next });
  };
  const statusIdx = topic.status ? statusOptions.indexOf(topic.status) : -1;
  const statusColor = statusIdx >= 0 ? STATUS_BADGE_COLORS[statusIdx % STATUS_BADGE_COLORS.length] : null;

  return (
    <div className="flex items-center gap-1.5 group/topic py-0.5">
      {editing ? (
        <>
          <Input
            value={editText}
            onChange={e => setEditText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') save();
              if (e.key === 'Escape') { setEditText(topic.text); setEditing(false); }
            }}
            className="h-7 text-xs flex-1"
            autoFocus
          />
          <button onClick={save} className="p-1 text-green-600 hover:text-green-700 flex-shrink-0">
            <Check className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => { setEditText(topic.text); setEditing(false); }} className="p-1 text-muted-foreground hover:text-foreground flex-shrink-0">
            <X className="h-3.5 w-3.5" />
          </button>
        </>
      ) : (
        <>
          <button
            onClick={() => { setEditing(true); setEditText(topic.text); }}
            className="text-xs text-left flex-1 hover:text-primary transition-colors leading-snug"
          >
            {topic.text || <span className="text-muted-foreground/60 italic">Click to add</span>}
          </button>
          <button
            onClick={cycleStatus}
            title={topic.status ? `Status: ${topic.status} — click to advance` : 'Click to set status'}
            className={cn(
              'text-xs font-medium px-1.5 py-0.5 rounded border transition-colors flex-shrink-0',
              statusColor ?? 'bg-muted/40 text-muted-foreground border-border/40 hover:bg-muted',
            )}
          >
            {topic.status ?? '·'}
          </button>
          <button
            onClick={() => onDelete(topic.id)}
            className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover/topic:opacity-100 transition-opacity flex-shrink-0"
            aria-label="Delete"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </>
      )}
    </div>
  );
}

function PersonSectionCard({
  member, accountabilities, topics, onAddAccountability, onUpdateAccountability,
  onDeleteAccountability, onAddTopic, onUpdateTopic, onDeleteTopic,
  newlyAddedAccountabilityId, newlyAddedTopicId,
  onNewlyAddedAccountabilityConsumed, onNewlyAddedTopicConsumed,
  onCopy, statusOptions, priorities,
}: {
  member: CosTeamMember;
  accountabilities: CosPersonAccountability[];
  topics: CosPersonTopic[];
  onAddAccountability: (memberId: string) => void;
  onUpdateAccountability: (id: string, text: string) => void;
  onDeleteAccountability: (id: string) => void;
  onAddTopic: (memberId: string) => void;
  onUpdateTopic: (id: string, updates: Partial<CosPersonTopic>) => void;
  onDeleteTopic: (id: string) => void;
  newlyAddedAccountabilityId: string | null;
  newlyAddedTopicId: string | null;
  onNewlyAddedAccountabilityConsumed: () => void;
  onNewlyAddedTopicConsumed: () => void;
  onCopy: (text: string, label?: string) => void;
  statusOptions: string[];
  priorities: CosPriority[];
}) {
  const firstName = member.name.split(' ')[0];

  const handleSuggestTopics = () => {
    const prompt = buildPersonTopicSuggestPrompt(member, accountabilities, priorities, topics);
    onCopy(prompt, `Topics prompt for ${firstName} copied — paste into Cowork`);
  };

  return (
    <Card className="w-full border border-border/50">
      <CardContent className="p-4 space-y-4">
        {/* Header */}
        <div>
          <p className="font-semibold text-sm">{member.name}</p>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-xs -ml-2 gap-1 text-muted-foreground"
            onClick={handleSuggestTopics}
            title="Copy AI prompt to suggest discussion topics"
          >
            <Copy className="h-3 w-3" />
            Suggest topics
          </Button>
        </div>

        {/* Accountabilities */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Accountabilities</h4>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-xs px-2"
              onClick={() => onAddAccountability(member.id)}
            >
              <Plus className="h-3 w-3 mr-0.5" />Add
            </Button>
          </div>
          <div className="space-y-0.5 rounded-md p-1 min-h-[32px]">
            {accountabilities.map(a => (
              <AccountabilityRow
                key={a.id}
                item={a}
                autoFocus={a.id === newlyAddedAccountabilityId}
                onAutoFocusConsumed={onNewlyAddedAccountabilityConsumed}
                onUpdate={onUpdateAccountability}
                onDelete={onDeleteAccountability}
              />
            ))}
            {accountabilities.length === 0 && (
              <p className="text-xs text-muted-foreground/60 italic">
                {`None yet — add what ${firstName} owns`}
              </p>
            )}
          </div>
        </div>

        {/* Discussion topics */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Discussion Topics</h4>
              {topics.length > 0 && (
                <span className="text-xs font-bold text-copper">{topics.length}</span>
              )}
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-xs px-2"
              onClick={() => onAddTopic(member.id)}
            >
              <Plus className="h-3 w-3 mr-0.5" />Add
            </Button>
          </div>
          <div className="space-y-0.5 rounded-md p-1 min-h-[32px]">
            {topics.map(t => (
              <PersonTopicCard
                key={t.id}
                topic={t}
                autoFocus={t.id === newlyAddedTopicId}
                onAutoFocusConsumed={onNewlyAddedTopicConsumed}
                onUpdate={onUpdateTopic}
                onDelete={onDeleteTopic}
                statusOptions={statusOptions}
              />
            ))}
            {topics.length === 0 && (
              <p className="text-xs text-muted-foreground/60 italic">
                None yet — add manually or use "Suggest topics"
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PersonSectionsRow({
  members, accountabilities, topics,
  onAddAccountability, onUpdateAccountability, onDeleteAccountability,
  onAddTopic, onUpdateTopic, onDeleteTopic,
  newlyAddedAccountabilityId, newlyAddedTopicId,
  onNewlyAddedAccountabilityConsumed, onNewlyAddedTopicConsumed,
  onCopy, statusOptions, priorities, colLabel,
}: {
  members: CosTeamMember[];
  accountabilities: CosPersonAccountability[];
  topics: CosPersonTopic[];
  onAddAccountability: (memberId: string) => void;
  onUpdateAccountability: (id: string, text: string) => void;
  onDeleteAccountability: (id: string) => void;
  onAddTopic: (memberId: string) => void;
  onUpdateTopic: (id: string, updates: Partial<CosPersonTopic>) => void;
  onDeleteTopic: (id: string) => void;
  newlyAddedAccountabilityId: string | null;
  newlyAddedTopicId: string | null;
  onNewlyAddedAccountabilityConsumed: () => void;
  onNewlyAddedTopicConsumed: () => void;
  onCopy: (text: string, label?: string) => void;
  statusOptions: string[];
  priorities: CosPriority[];
  colLabel: string;
}) {
  const directReports = members
    .filter(m => m.relationship_type === 'direct_report' && !m.reports_to_id)
    .sort((a, b) => a.name.localeCompare(b.name));

  if (directReports.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        {directReports.map(m => (
          <PersonSectionCard
            key={m.id}
            member={m}
            accountabilities={accountabilities.filter(a => a.member_id === m.id)}
            topics={topics.filter(t => t.member_id === m.id)}
            priorities={priorities}
            statusOptions={statusOptions}
            onAddAccountability={onAddAccountability}
            onUpdateAccountability={onUpdateAccountability}
            onDeleteAccountability={onDeleteAccountability}
            onAddTopic={onAddTopic}
            onUpdateTopic={onUpdateTopic}
            onDeleteTopic={onDeleteTopic}
            newlyAddedAccountabilityId={newlyAddedAccountabilityId}
            newlyAddedTopicId={newlyAddedTopicId}
            onNewlyAddedAccountabilityConsumed={onNewlyAddedAccountabilityConsumed}
            onNewlyAddedTopicConsumed={onNewlyAddedTopicConsumed}
            onCopy={onCopy}
          />
        ))}
      </div>
    </div>
  );
}

// ── Archive section ───────────────────────────────────────────────────────────

function ArchiveSection({
  items, layoutConfig, onRestore, onDelete,
}: {
  items: CosPriority[];
  layoutConfig: CosLayoutConfig;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const labelMap: Record<string, string> = {};
  for (const col of layoutConfig.columns) {
    for (const s of col.sections) {
      if (s.type !== 'direct_reports') labelMap[sectionToCategoryKey(s)] = resolveNewSectionLabel(s);
    }
  }

  const getItemDate = (item: CosPriority) =>
    item.archived_at ?? item.done_at ?? item.created_at;

  return (
    <div className="mt-8 border-t border-border/40 pt-4">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
      >
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
        Archive
        <span className="text-xs font-bold text-copper">{items.length}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-1">
          {items.map(item => (
            <div key={item.id} className="group flex items-center gap-2 py-1 px-2 rounded hover:bg-muted/40 transition-colors">
              <span className="text-[10px] text-muted-foreground/50 whitespace-nowrap flex-shrink-0 w-8">
                {format(new Date(getItemDate(item)), 'M/d')}
              </span>
              {item.done_at && !item.archived_at && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 border border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800 flex-shrink-0">
                  Done
                </span>
              )}
              <Badge variant="outline" className="text-[10px] px-1 py-0 flex-shrink-0 font-normal text-muted-foreground/70 border-border/40">
                {labelMap[item.category] ?? item.category}
              </Badge>
              <p className="flex-1 min-w-0 text-sm text-muted-foreground/60 line-through truncate">
                {item.text}
              </p>
              <div className="flex-shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  className="p-1 rounded hover:bg-muted text-muted-foreground/60 hover:text-foreground"
                  onClick={() => onRestore(item.id)}
                  title="Restore to original bucket"
                >
                  <RotateCcw className="h-3 w-3" />
                </button>
                <button
                  className="p-1 rounded hover:bg-muted text-muted-foreground/60 hover:text-destructive"
                  onClick={() => onDelete(item.id)}
                  title="Permanently delete"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryBucket({
  category, label, items, onUpdate, onAdd, onDelete, onCopy, mondayTaggedTexts, statusOptions,
  newlyAddedId, onNewlyAddedConsumed, isDropTarget,
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
  newlyAddedId: string | null;
  onNewlyAddedConsumed: () => void;
  isDropTarget?: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: category });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-lg transition-all duration-150 p-1 -m-1',
        isDropTarget && 'ring-2 ring-primary/40 ring-inset bg-primary/5',
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm">{label}</h3>
          <span className="text-xs font-bold text-copper">{items.length}</span>
        </div>
        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => onAdd(category)}>
          <Plus className="h-3.5 w-3.5 mr-1" />Add
        </Button>
      </div>
      <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-1.5 min-h-[2rem]">
          {items.map(item => (
            <SortableItem
              key={item.id}
              item={item}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onCopy={onCopy}
              isTagged={mondayTaggedTexts.includes(item.text)}
              statusOptions={statusOptions}
              autoEdit={item.id === newlyAddedId}
              onAutoEditConsumed={onNewlyAddedConsumed}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

function SortableItem({
  item, onUpdate, onDelete, onCopy, isTagged, statusOptions, autoEdit, onAutoEditConsumed,
}: {
  item: CosPriority;
  onUpdate: (id: string, updates: Partial<CosPriority>) => void;
  onDelete: (id: string) => void;
  onCopy: (text: string, label?: string) => void;
  isTagged: boolean;
  statusOptions: string[];
  autoEdit?: boolean;
  onAutoEditConsumed?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 }}
    >
      <PriorityCard
        item={item}
        dragHandleListeners={listeners}
        dragHandleAttributes={attributes}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onCopy={onCopy}
        isTagged={isTagged}
        statusOptions={statusOptions}
        autoEdit={autoEdit}
        onAutoEditConsumed={onAutoEditConsumed}
      />
    </div>
  );
}

function PrioritiesSection({
  priorities, onUpdate, onAdd, onDelete, onReorder, onCopy, mondayTaggedTexts, statusOptions,
  newlyAddedId, onNewlyAddedConsumed,
  members, accountabilities, personTopics,
  onAddAccountability, onUpdateAccountability, onDeleteAccountability,
  onAddPersonTopic, onUpdatePersonTopic, onDeletePersonTopic,
  newlyAddedAccountabilityId, newlyAddedTopicId,
  onNewlyAddedAccountabilityConsumed, onNewlyAddedTopicConsumed,
  onPermanentDelete, onRestoreArchived,
  layoutConfig,
}: {
  priorities: CosPriority[];
  onUpdate: (id: string, updates: Partial<CosPriority>) => void;
  onAdd: (category: CategoryKey) => void;
  onDelete: (id: string) => void;
  onReorder: (id: string, targetCategory: CategoryKey, insertBeforeId: string | null) => void;
  onCopy: (text: string, label?: string) => void;
  mondayTaggedTexts: string[];
  statusOptions: string[];
  newlyAddedId: string | null;
  onNewlyAddedConsumed: () => void;
  members: CosTeamMember[];
  accountabilities: CosPersonAccountability[];
  personTopics: CosPersonTopic[];
  onAddAccountability: (memberId: string) => void;
  onUpdateAccountability: (id: string, text: string) => void;
  onDeleteAccountability: (id: string) => void;
  onAddPersonTopic: (memberId: string) => void;
  onUpdatePersonTopic: (id: string, updates: Partial<CosPersonTopic>) => void;
  onDeletePersonTopic: (id: string) => void;
  newlyAddedAccountabilityId: string | null;
  newlyAddedTopicId: string | null;
  onNewlyAddedAccountabilityConsumed: () => void;
  onNewlyAddedTopicConsumed: () => void;
  onPermanentDelete: (id: string) => void;
  onRestoreArchived: (id: string) => void;
  layoutConfig: CosLayoutConfig;
}) {
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const [dragOverCategory, setDragOverCategory] = useState<string | null>(null);
  // dnd-kit doesn't recompute collisions on pointerup — keep the last over id in a ref
  // so handleDragEnd can use it as a fallback when over is null at release time.
  const lastOverIdRef = React.useRef<string | null>(null);

  const activeItem = priorities.find(p => p.id === activeId);

  const allCategories = layoutConfig.columns
    .flatMap(c => c.sections.filter(s => s.enabled && s.type !== 'direct_reports'))
    .map(sectionToCategoryKey);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const resolveCategoryFromId = (id: string): string | null => {
    if (allCategories.includes(id)) return id;
    return priorities.find(p => p.id === id)?.category ?? null;
  };

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveId(active.id);
    setDragOverCategory(null);
    lastOverIdRef.current = null;
  };

  const handleDragOver = ({ over }: DragOverEvent) => {
    const id = over ? (over.id as string) : null;
    lastOverIdRef.current = id;
    setDragOverCategory(id ? resolveCategoryFromId(id) : null);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    setDragOverCategory(null);

    // Use dnd-kit's over if available, otherwise fall back to last tracked over
    const overId = (over?.id as string | undefined) ?? lastOverIdRef.current;
    lastOverIdRef.current = null;
    if (!overId) return;

    const dragged = priorities.find(p => p.id === active.id);
    if (!dragged) return;

    const isBucket = allCategories.includes(overId);
    const targetItem = !isBucket ? priorities.find(p => p.id === overId) : null;
    if (!isBucket && !targetItem) return;
    if (!isBucket && overId === (active.id as string)) return;

    const targetCategory = isBucket ? overId : targetItem!.category;
    const insertBeforeId = isBucket ? null : overId;
    onReorder(dragged.id, targetCategory, insertBeforeId);
  };

  const sortedFor = (cat: CategoryKey) =>
    priorities.filter(p => p.category === cat && !p.done_at && !p.archived_at)
      .sort((a, b) => a.tier_order - b.tier_order);

  const archivedItems = priorities
    .filter(p => !!p.archived_at || !!p.done_at)
    .sort((a, b) => new Date(b.archived_at ?? b.done_at ?? b.created_at).getTime()
                  - new Date(a.archived_at ?? a.done_at ?? a.created_at).getTime());

  const renderBuckets = (sections: typeof layoutConfig.columns[0]['sections'], colLabel: string) =>
    sections.filter(s => s.enabled).map(section =>
      section.type === 'direct_reports' ? (
        <PersonSectionsRow key={section.id} members={members} accountabilities={accountabilities}
          topics={personTopics} onAddAccountability={onAddAccountability}
          onUpdateAccountability={onUpdateAccountability} onDeleteAccountability={onDeleteAccountability}
          onAddTopic={onAddPersonTopic} onUpdateTopic={onUpdatePersonTopic} onDeleteTopic={onDeletePersonTopic}
          newlyAddedAccountabilityId={newlyAddedAccountabilityId} newlyAddedTopicId={newlyAddedTopicId}
          onNewlyAddedAccountabilityConsumed={onNewlyAddedAccountabilityConsumed}
          onNewlyAddedTopicConsumed={onNewlyAddedTopicConsumed}
          onCopy={onCopy} statusOptions={statusOptions} priorities={priorities} colLabel={colLabel} />
      ) : (
        <CategoryBucket key={section.id}
          category={sectionToCategoryKey(section)} label={resolveNewSectionLabel(section)}
          items={sortedFor(sectionToCategoryKey(section))}
          onUpdate={onUpdate} onAdd={onAdd} onDelete={onDelete} onCopy={onCopy}
          mondayTaggedTexts={mondayTaggedTexts} statusOptions={statusOptions}
          newlyAddedId={newlyAddedId} onNewlyAddedConsumed={onNewlyAddedConsumed}
          isDropTarget={dragOverCategory === sectionToCategoryKey(section)}
        />
      )
    );

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={(args) => pointerWithin({
          ...args,
          droppableContainers: args.droppableContainers.filter(c => c.id !== args.active.id),
        })}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      >
        {/* Desktop grid */}
        <div className="hidden md:grid gap-6"
          style={{ gridTemplateColumns: layoutConfig.columns.map(c => `${c.widthPct}fr`).join(' ') }}
        >
          {layoutConfig.columns.map(col => (
            <div key={col.id} className="space-y-6">
              <div className="pb-2 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-widest">{col.headerLabel}</h3>
              </div>
              {renderBuckets(col.sections, col.headerLabel)}
            </div>
          ))}
        </div>

        {/* Mobile stacked */}
        <div className="md:hidden space-y-6">
          {layoutConfig.columns.flatMap(col => renderBuckets(col.sections, col.headerLabel))}
        </div>

        <DragOverlay dropAnimation={null} modifiers={[snapCenterToCursor]}>
          {activeItem && (
            <Card className="border border-primary/40 shadow-xl opacity-95 rotate-1 cursor-grabbing">
              <CardContent className="px-3 py-2">
                <p className="text-sm font-medium leading-snug">{activeItem.text}</p>
              </CardContent>
            </Card>
          )}
        </DragOverlay>
      </DndContext>

      {archivedItems.length > 0 && (
        <ArchiveSection items={archivedItems} layoutConfig={layoutConfig}
          onRestore={onRestoreArchived} onDelete={onPermanentDelete} />
      )}
    </>
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
  item, dragHandleListeners, dragHandleAttributes, onUpdate, onDelete, onCopy, isTagged, statusOptions, autoEdit, onAutoEditConsumed,
}: {
  item: CosPriority;
  dragHandleListeners?: React.HTMLAttributes<HTMLElement>;
  dragHandleAttributes?: React.HTMLAttributes<HTMLElement>;
  onUpdate: (id: string, updates: Partial<CosPriority>) => void;
  onDelete: (id: string) => void;
  onCopy: (text: string, label?: string) => void;
  isTagged?: boolean;
  statusOptions: string[];
  autoEdit?: boolean;
  onAutoEditConsumed?: () => void;
}) {
  const cardRef = React.useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(item.text);

  useEffect(() => {
    if (!autoEdit) return;
    setEditing(true);
    setEditText('');
    // Scroll the card into view, then hand focus to the input (autoFocus handles it)
    requestAnimationFrame(() => {
      cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    onAutoEditConsumed?.();
  }, [autoEdit]); // eslint-disable-line react-hooks/exhaustive-deps
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
    else if (!trimmed && !item.text) onDelete(item.id); // cancelled new item with no text
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
    <Card ref={cardRef} className="group border border-border/50 hover:border-border transition-colors">
      <CardContent className="px-2 py-1.5">
        <div className="flex items-start gap-1">
          <button
            {...dragHandleListeners}
            {...dragHandleAttributes}
            className="hidden sm:flex flex-shrink-0 self-stretch items-center w-4 text-muted-foreground/20 hover:text-muted-foreground/50 cursor-grab active:cursor-grabbing touch-none opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label="Drag to reorder"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
          {/* Content */}
          <div className="flex-1 min-w-0 py-0.5">
            {editing ? (
              <Input
                value={editText}
                onChange={e => setEditText(e.target.value)}
                onBlur={saveText}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.currentTarget.blur(); }
                  if (e.key === 'Escape') { setEditText(item.text); setEditing(false); }
                }}
                className="h-8 text-sm"
                autoFocus
              />
            ) : (
              <div className="flex items-start gap-1.5 flex-wrap">
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
              <div className="mt-2 space-y-2">
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
                  <Button variant="outline" className="h-8 text-xs" onClick={() => onCopy(buildPrompt('recommend'))}>
                    💡 Recommend next step
                  </Button>
                  <Button variant="outline" className="h-8 text-xs" onClick={() => onCopy(buildPrompt('draft'))}>
                    ✍️ Draft message
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Ask agent..."
                    value={agentQuery}
                    onChange={e => setAgentQuery(e.target.value)}
                    className="h-8 text-sm"
                    onKeyDown={e => {
                      if (e.key === 'Enter' && agentQuery.trim()) {
                        onCopy(buildPrompt('custom', agentQuery.trim()));
                        setAgentQuery('');
                      }
                    }}
                  />
                  <Button
                    variant="ghost"
                    className="h-8 px-2 flex-shrink-0"
                    disabled={!agentQuery.trim()}
                    onClick={() => {
                      if (agentQuery.trim()) { onCopy(buildPrompt('custom', agentQuery.trim())); setAgentQuery(''); }
                    }}
                  >
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="flex justify-end pt-1 border-t border-border/30">
                  <button
                    onClick={() => onDelete(item.id)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-3 w-3" /> Delete
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right controls — status stacked above chevron */}
          <div className="flex flex-col items-end gap-0.5 flex-shrink-0 pt-0.5">
            <button
              onClick={cycleStatus}
              title={item.status ? `Status: ${item.status} — click to advance` : 'Click to set status'}
              className={cn(
                'text-[10px] font-medium px-1.5 py-0.5 rounded border transition-colors truncate max-w-[56px] text-center leading-tight',
                statusColor ?? 'bg-muted/40 text-muted-foreground/50 border-border/30 hover:bg-muted',
              )}
            >
              {item.status ?? '—'}
            </button>
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-0.5 text-muted-foreground hover:text-foreground"
              aria-label={expanded ? 'Collapse' : 'Expand'}
            >
              <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} />
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
    } else if (line.trim().startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = lines[i].trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
        if (!cells.every(c => /^[-: ]+$/.test(c))) rows.push(cells);
        i++;
      }
      if (rows.length > 0) {
        elements.push(
          <div key={`tbl-${i}`} className="overflow-x-auto my-3">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  {rows[0].map((cell, j) => (
                    <th key={j} className="text-left px-2 py-1 font-semibold whitespace-nowrap">{inlineMarkdown(cell)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(1).map((row, ri) => (
                  <tr key={ri} className="border-b border-border/50 hover:bg-muted/30">
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-2 py-1 leading-snug">{inlineMarkdown(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
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

function buildPersonTopicSuggestPrompt(
  member: CosTeamMember,
  accts: CosPersonAccountability[],
  currentPriorities: CosPriority[],
  existingTopics: CosPersonTopic[],
): string {
  const firstName = member.name.split(' ')[0];
  const lines: string[] = [
    `Suggest discussion topics for my 1:1 with ${member.name} (${member.role}).`,
    '',
  ];
  if (accts.length > 0) {
    lines.push(`${firstName}'s accountabilities:`);
    accts.forEach(a => lines.push(`  • ${a.text}`));
    lines.push('');
  }
  const horizons: [string, CosPriority['category']][] = [
    ['Now', 'now'], ['This Week', 'this_week'], ['This Month', 'this_month'], ['Strategic', 'strategic'],
  ];
  const priorityLines = horizons.flatMap(([label, cat]) => {
    const items = currentPriorities.filter(p => p.category === cat && p.text);
    return items.length > 0 ? [`${label}: ${items.map(p => p.text).join(', ')}`] : [];
  });
  if (priorityLines.length > 0) {
    lines.push('My current CoS priorities:');
    priorityLines.forEach(l => lines.push(`  ${l}`));
    lines.push('');
  }
  if (member.context_notes) {
    lines.push(`Context about ${firstName}: ${member.context_notes}`);
    lines.push('');
  }
  if (existingTopics.length > 0) {
    lines.push('Topics already queued:');
    existingTopics.forEach(t => lines.push(`  • ${t.text}`));
    lines.push('');
  }
  lines.push(
    `Suggest 3–5 concrete discussion topics I should raise in my next 1:1 with ${firstName}. ` +
    'Focus on intersections between my priorities and their accountabilities, alignment needed, ' +
    'or blockers I can help remove. Be specific and actionable.',
  );
  return lines.join('\n');
}

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dirHandleRef = React.useRef<any>(null);
  const [prepSheet, setPrepSheet] = useState<{
    member: CosTeamMember;
    content: string;
    source: 'cleargo' | 'static';
    generatedAt: string;
  } | null>(null);
  const [sharing, setSharing] = useState(false);
  const [loadingPrep, setLoadingPrep] = useState(false);
  const [refreshingPrep, setRefreshingPrep] = useState(false);

  // Footer: per-meeting actions
  const [actionDraft, setActionDraft] = useState('');
  const [savingActions, setSavingActions] = useState(false);

  // Footer: person context
  const [contextDraft, setContextDraft] = useState('');
  const [savingContext, setSavingContext] = useState(false);

  // Footer: global prep feedback
  const [feedbackDraft, setFeedbackDraft] = useState('');
  const [savingFeedback, setSavingFeedback] = useState(false);

  // Load global prep instructions whenever a sheet opens
  useEffect(() => {
    if (!prepSheet) return;
    setActionDraft('');
    setContextDraft(prepSheet.member.context_notes ?? '');
    supabase
      .from('cos_prep_settings')
      .select('prep_instructions')
      .single()
      .then(({ data }) => setFeedbackDraft(data?.prep_instructions ?? ''));
  }, [prepSheet?.member.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveActions = async () => {
    if (!prepSheet || !actionDraft.trim()) return;
    setSavingActions(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const lines = actionDraft.split('\n').map(l => l.replace(/^[-*]\s*/, '').trim()).filter(Boolean);
      const rows = lines.map(text => ({ user_id: user.id, member_id: prepSheet.member.id, text }));
      const { error } = await supabase.from('cos_meeting_actions').insert(rows);
      if (error) throw error;
      setActionDraft('');
      toast({ title: `${rows.length} action${rows.length !== 1 ? 's' : ''} queued` });
    } catch (err) {
      toast({ title: 'Failed to save actions', description: String(err), variant: 'destructive' });
    } finally {
      setSavingActions(false);
    }
  };

  const saveContext = async () => {
    if (!prepSheet) return;
    setSavingContext(true);
    try {
      const { error } = await supabase
        .from('cos_team_members')
        .update({ context_notes: contextDraft || null })
        .eq('id', prepSheet.member.id);
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
      const { error } = await supabase
        .from('cos_prep_settings')
        .upsert({ user_id: user.id, prep_instructions: feedbackDraft }, { onConflict: 'user_id' });
      if (error) throw error;
      toast({ title: 'Prep instructions saved' });
    } catch (err) {
      toast({ title: 'Failed to save feedback', description: String(err), variant: 'destructive' });
    } finally {
      setSavingFeedback(false);
    }
  };

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
    setLoadingPrep(true);
    try {
      // 1. Try ClearGO API
      if (CLEARGO_API_KEY) {
        try {
          const content = await fetchCleargoPrep(member);
          setPrepSheet({ member, content, source: 'cleargo', generatedAt: new Date().toISOString() });
          return;
        } catch {
          // fall through
        }
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
            setPrepSheet({ member, content, source: 'static', generatedAt: new Date().toISOString() });
            return;
          } catch {
            dirHandleRef.current = null;
          }
        }
      }

      // 3. Fall back to static prompt
      const content = buildStaticPrepPrompt(member);
      setPrepSheet({ member, content, source: 'static', generatedAt: new Date().toISOString() });
      try { await navigator.clipboard.writeText(content); } catch { /* ignore */ }
      toast({ title: 'Prep prompt ready — also copied to clipboard' });
    } finally {
      setLoadingPrep(false);
    }
  };

  const refreshPrep = async () => {
    if (!prepSheet) return;
    setRefreshingPrep(true);
    try {
      const { content, source } = await generatePrep(prepSheet.member);
      setPrepSheet({ ...prepSheet, content, source, generatedAt: new Date().toISOString() });
    } catch (err) {
      toast({ title: 'Refresh failed', description: String(err), variant: 'destructive' });
    } finally {
      setRefreshingPrep(false);
    }
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
                  <MemberCard member={manager} onViewPrep={openPrepFile} />

                  {/* Their direct reports indented */}
                  {reports.length > 0 && (
                    <div className="pl-4 border-l-2 border-border/50 space-y-1.5 ml-2">
                      {reports.map(r => (
                        <div key={r.id}>
                          <MemberCard member={r} onViewPrep={openPrepFile} compact />
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
              {collaborators.map(m => <MemberCard key={m.id} member={m} onViewPrep={openPrepFile} />)}
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

          {/* ── Feedback footer ─────────────────────────────────────────── */}
          <div className="mt-8 space-y-6 border-t border-border pt-6">

            {/* 1. Meeting actions */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions for this meeting</p>
              <p className="text-xs text-muted-foreground">One per line — e.g. "Draft an email about X", "Introduce Matt to Y", "Add to priorities: Z"</p>
              <Textarea
                value={actionDraft}
                onChange={e => setActionDraft(e.target.value)}
                placeholder={"- Draft a follow-up on the LMS release\n- Introduce Matt to the data team lead\n- Add to my priorities: unblock AI Course Builder"}
                rows={4}
                className="text-sm resize-none"
              />
              <Button
                size="sm"
                onClick={saveActions}
                disabled={savingActions || !actionDraft.trim()}
              >
                {savingActions ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                Queue actions
              </Button>
            </div>

            {/* 2. Person context */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Context about {prepSheet?.member.name.split(' ')[0]}
              </p>
              <p className="text-xs text-muted-foreground">Goals, working style, things the AI missed — appended to every future prep for this person.</p>
              <Textarea
                value={contextDraft}
                onChange={e => setContextDraft(e.target.value)}
                placeholder="e.g. Matt cares deeply about shipping quality over speed. He's been frustrated by scope creep on Agent Studio. His long-term goal is to move into a VP role."
                rows={4}
                className="text-sm resize-none"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={saveContext}
                disabled={savingContext}
              >
                {savingContext ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                Save context
              </Button>
            </div>

            {/* 3. Global prep instructions */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Improve future 1:1 preps</p>
              <p className="text-xs text-muted-foreground">Standing instructions applied to every prep — tell the AI what good looks like for you.</p>
              <Textarea
                value={feedbackDraft}
                onChange={e => setFeedbackDraft(e.target.value)}
                placeholder={"e.g. Disregard releases that are already past their target date. Show future releases in ascending date order. Always highlight blockers first. Don't repeat items from last week if status hasn't changed."}
                rows={5}
                className="text-sm resize-none"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={saveFeedback}
                disabled={savingFeedback}
              >
                {savingFeedback ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                Save instructions
              </Button>
            </div>

          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

