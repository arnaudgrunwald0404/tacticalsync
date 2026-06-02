import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { format, startOfWeek, addDays, isToday as isDateToday } from 'date-fns';
import {
  Plus, GripVertical, ChevronDown, Trash2, Check, X, Send, Copy, Save, Loader2, FileText, RefreshCw, RotateCcw, Settings,
  Sparkles, Pencil, AlertCircle, Info, FolderOpen,
} from 'lucide-react';
import { useDciBrief, type AiPrioritySuggestion, type DciBriefData } from '@/hooks/useDciAiSuggestions';
import {
  DndContext, DragEndEvent,
  PointerSensor, KeyboardSensor, useSensor, useSensors,
  closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy, horizontalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
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
  CosLayoutConfig, CosColumn, CosColumnSection, CosSectionType,
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
  // Weekly objectives (set on Monday, read Tue–Fri from Monday's row)
  weekly_obj_1: string | null;
  weekly_obj_2: string | null;
  weekly_obj_3: string | null;
  weekly_obj_1_activities: string[] | null;
  weekly_obj_2_activities: string[] | null;
  weekly_obj_3_activities: string[] | null;
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ChiefOfStaff() {
  const { toast } = useToast();
  const [userId, setUserId] = useState<string | null>(null);
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
  const [activeTab, setActiveTab] = useState('priorities');

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

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

  const dropPriorityOnAccountability = async (memberId: string, text: string) => {
    if (!userId) return;
    const memberAccts = accountabilities.filter(a => a.member_id === memberId);
    const maxOrder = memberAccts.length > 0 ? Math.max(...memberAccts.map(a => a.sort_order)) : 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).from('cos_person_accountabilities').insert({
      user_id: userId, member_id: memberId, text, sort_order: maxOrder + 1,
    }).select().single();
    if (!error && data) setAccountabilities(prev => [...prev, data as CosPersonAccountability]);
  };

  const dropPriorityOnTopic = async (memberId: string, text: string) => {
    if (!userId) return;
    const memberTopics = personTopics.filter(t => t.member_id === memberId);
    const maxOrder = memberTopics.length > 0 ? Math.max(...memberTopics.map(t => t.sort_order)) : 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).from('cos_person_topics').insert({
      user_id: userId, member_id: memberId, text, sort_order: maxOrder + 1,
    }).select().single();
    if (!error && data) setPersonTopics(prev => [...prev, data as CosPersonTopic]);
  };

  const logBrief = async (
    topPriorities: CosPriority[],
    topicRaised: string,
    weeklyObjectives?: { text: string; activities: string[] }[],
  ) => {
    if (!userId) return;
    const today = format(new Date(), 'yyyy-MM-dd');
    const existingToday = dciLogs.find(l => l.date === today);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: Record<string, any> = {
      priority_1: topPriorities[0]?.text ?? null,
      priority_2: topPriorities[1]?.text ?? null,
      priority_3: topPriorities[2]?.text ?? null,
      topic_raised: topicRaised || null,
      notes: null,
    };
    // On Monday (or whenever weekly objectives are provided), save them too
    if (weeklyObjectives && weeklyObjectives.length > 0) {
      payload.weekly_obj_1 = weeklyObjectives[0]?.text ?? null;
      payload.weekly_obj_2 = weeklyObjectives[1]?.text ?? null;
      payload.weekly_obj_3 = weeklyObjectives[2]?.text ?? null;
      payload.weekly_obj_1_activities = weeklyObjectives[0]?.activities ?? [];
      payload.weekly_obj_2_activities = weeklyObjectives[1]?.activities ?? [];
      payload.weekly_obj_3_activities = weeklyObjectives[2]?.activities ?? [];
    }
    let data, error;
    if (existingToday) {
      ({ data, error } = await db.from('cos_dci_logs').update(payload).eq('id', existingToday.id).select().single());
      if (!error && data) setDciLogs(prev => prev.map(l => l.id === existingToday.id ? data as CosDciLog : l));
    } else {
      ({ data, error } = await db.from('cos_dci_logs').insert({ user_id: userId, date: today, ...payload }).select().single());
      if (!error && data) setDciLogs(prev => [data as CosDciLog, ...prev]);
    }
    if (!error && data) {
      toast({ title: existingToday ? 'Brief updated' : 'Brief logged' });
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
      `Daily Check-in Status Review — ${format(new Date(), 'EEEE, MMMM d')}`,
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
      lines.push('', 'Still open for next Daily Check-in:');
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

  const prioritiesTabLabel = 'My Lists';

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
        <TabsList className="mb-6 grid max-w-sm grid-cols-3">
          <TabsTrigger value="priorities">{prioritiesTabLabel}</TabsTrigger>
          <TabsTrigger value="dci">Daily Check-in</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
        </TabsList>

        <TabsContent value="priorities">
          {priorities.length === 0 && teamMembers.length === 0 && accountabilities.length === 0 && personTopics.length === 0 ? (
            /* ── Empty state for brand-new users ── */
            <div className="flex flex-col items-center justify-center py-16 sm:py-24 px-4">
              {/* Illustration: stylised column layout */}
              <div className="mb-8 flex items-end gap-3 opacity-80">
                <div className="w-20 sm:w-24 space-y-2">
                  <div className="h-3 rounded-full bg-copper/20" />
                  <div className="h-16 sm:h-20 rounded-lg border-2 border-dashed border-rose-gold/40 bg-platinum/50" />
                  <div className="h-10 sm:h-12 rounded-lg border-2 border-dashed border-rose-gold/40 bg-platinum/50" />
                </div>
                <div className="w-20 sm:w-24 space-y-2">
                  <div className="h-3 rounded-full bg-titanium/20" />
                  <div className="h-12 sm:h-14 rounded-lg border-2 border-dashed border-rose-gold/40 bg-platinum/50" />
                  <div className="h-14 sm:h-18 rounded-lg border-2 border-dashed border-rose-gold/40 bg-platinum/50" />
                </div>
                <div className="w-20 sm:w-24 space-y-2">
                  <div className="h-3 rounded-full bg-copper/20" />
                  <div className="h-10 sm:h-12 rounded-lg border-2 border-dashed border-rose-gold/40 bg-platinum/50" />
                  <div className="h-8 sm:h-10 rounded-lg border-2 border-dashed border-rose-gold/40 bg-platinum/50" />
                  <div className="h-6 sm:h-8 rounded-lg border-2 border-dashed border-rose-gold/40 bg-platinum/50" />
                </div>
              </div>

              <h3 className="font-heading text-xl sm:text-2xl font-bold text-cast-iron mb-2 text-center">
                Your workspace is ready
              </h3>
              <p className="font-body text-sm sm:text-base text-titanium max-w-md text-center mb-6 leading-relaxed">
                This is where you'll track priorities, commitments, and people topics. Add your first item to any column to get started.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 items-center">
                <Button
                  onClick={() => {
                    // Add a priority to the first enabled section
                    const firstSection = layoutConfig.columns
                      .flatMap(c => c.sections)
                      .find(s => s.enabled && s.type !== 'direct_reports');
                    if (firstSection) {
                      addPriority(sectionToCategoryKey(firstSection));
                    }
                  }}
                  className="bg-copper hover:bg-copper-hover text-white font-body h-10 px-6"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add your first item
                </Button>

                <Link
                  to="/settings?section=configure-my-lists"
                  className="inline-flex items-center gap-1.5 font-body text-sm text-titanium hover:text-cast-iron transition-colors underline underline-offset-2 decoration-titanium/30 hover:decoration-cast-iron/50"
                >
                  <Settings className="h-3.5 w-3.5" />
                  Configure columns & sections
                </Link>
              </div>
            </div>
          ) : (
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
              onDropPriorityOnAccountability={dropPriorityOnAccountability}
              onDropPriorityOnTopic={dropPriorityOnTopic}
              onPermanentDelete={permanentDeletePriority}
              onRestoreArchived={restoreArchivedPriority}
              layoutConfig={layoutConfig}
            />
          )}
        </TabsContent>

        <TabsContent value="dci">
          <div className="space-y-8">
            <DciTabContent
              priorities={priorities}
              thisWeekPriorities={thisWeekPriorities}
              dciLogs={dciLogs}
              onLog={logBrief}
              onUpdateLog={updateDciLog}
              onRerun={rerunDci}
            />
          </div>
        </TabsContent>

        <TabsContent value="team">
          <TeamSection members={teamMembers} />
        </TabsContent>


      </Tabs>



    </div>
  );
}

// ── DCI Tab Content (weekly matrix + today's brief) ─────────────────────────

const DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const DAY_LABELS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

function DciTabContent({
  priorities,
  thisWeekPriorities,
  dciLogs,
  onLog,
  onUpdateLog,
  onRerun,
}: {
  priorities: CosPriority[];
  thisWeekPriorities: CosPriority[];
  dciLogs: CosDciLog[];
  onLog: (priorities: CosPriority[], topic: string, weeklyObjectives?: { text: string; activities: string[] }[]) => void;
  onUpdateLog: (id: string, updates: Partial<CosDciLog>) => void;
  onRerun: (log: CosDciLog) => void;
}) {
  const { brief, isLoading, error, loadBrief, refreshBrief } = useDciBrief();

  // Compute Monday–Friday dates for this week
  const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekDates = Array.from({ length: 5 }, (_, i) => addDays(monday, i));
  const weekDateStrings = weekDates.map(d => format(d, 'yyyy-MM-dd'));
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const todayDayIdx = weekDates.findIndex(d => isDateToday(d)); // 0=Mon, 4=Fri, -1 if weekend

  // Build the matrix data: for each weekday, get logged priorities
  const weekMatrix: { date: string; label: string; shortLabel: string; priorities: (string | null)[]; isToday: boolean; isLogged: boolean; log?: CosDciLog }[] =
    weekDates.map((d, i) => {
      const dateStr = weekDateStrings[i];
      const log = dciLogs.find(l => l.date === dateStr);
      return {
        date: dateStr,
        label: DAY_LABELS[i],
        shortLabel: DAY_LABELS_SHORT[i],
        priorities: log
          ? [log.priority_1, log.priority_2, log.priority_3]
          : [null, null, null],
        isToday: dateStr === todayStr,
        isLogged: !!log,
        log,
      };
    });

  // Monday's log holds the weekly objectives for the whole week
  const mondayLog = dciLogs.find(l => l.date === weekDateStrings[0]);

  // For today's column, if not yet logged but brief is loaded, show brief priorities
  const hasBrief = brief && brief.source !== 'none';
  const mergedDaily = React.useMemo(() => {
    if (!brief || brief.source === 'none') return [];
    return mergePrioritiesWithBrief(thisWeekPriorities, brief.dailyPriorities);
  }, [thisWeekPriorities, brief]);

  const mergedWeekly = React.useMemo(() => {
    if (!brief || brief.source === 'none') return [];
    return mergePrioritiesWithBrief(thisWeekPriorities, brief.weeklyPriorities);
  }, [thisWeekPriorities, brief]);

  // If today is Monday and brief is loaded but not logged, show weekly priorities in Monday column
  // If today is Tue-Fri and brief is loaded but not logged, show daily priorities in today's column
  const todayData = weekMatrix[todayDayIdx];
  // ── Reorder state: 6 items each, user can drag-and-drop, only top 3 are saved ──
  const idCounter = React.useRef(0);
  const assignId = (prefix: string) => `${prefix}-${++idCounter.current}`;

  const [orderedDaily, setOrderedDaily] = useState<OrderedItem[]>([]);
  const [orderedWeekly, setOrderedWeekly] = useState<OrderedItem[]>([]);

  useEffect(() => {
    setOrderedDaily(mergedDaily.slice(0, 5).map(item => ({ dragId: assignId('d'), item })));
  }, [mergedDaily]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setOrderedWeekly(mergedWeekly.slice(0, 5).map(item => ({ dragId: assignId('w'), item })));
  }, [mergedWeekly]); // eslint-disable-line react-hooks/exhaustive-deps

  const todayBriefPriorities = todayDayIdx === 0
    ? orderedWeekly.slice(0, 3).map(o => o.item.text)
    : orderedDaily.slice(0, 3).map(o => o.item.text);

  const [topicRaised, setTopicRaised] = useState('');

  // Pre-fill topic from brief
  useEffect(() => {
    if (brief?.topicSuggestion && !topicRaised) {
      setTopicRaised(brief.topicSuggestion);
    }
  }, [brief]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLog = () => {
    // Daily priorities: always save the top 3 from the daily list
    const dailyItems = orderedDaily;
    const logPriorities = dailyItems.slice(0, 3).map((ordered, i) => ({
      ...(ordered.item.cosPriority ?? {
        id: `brief-${i}`,
        user_id: '',
        category: 'this_week',
        tier_order: i,
        notes: null,
        status: null,
        created_at: '',
        updated_at: '',
        done_at: null,
        archived_at: null,
      }),
      text: ordered.item.text,
    } as CosPriority));

    // Weekly objectives: save top 3 on Monday (or when weekly list has content)
    const isMonday = todayDayIdx === 0;
    const weeklyObjs = isMonday && orderedWeekly.length > 0
      ? orderedWeekly.slice(0, 3).map(o => ({
          text: o.item.text,
          activities: o.item.activities,
        }))
      : undefined;

    onLog(logPriorities, topicRaised, weeklyObjs);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">This Week</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {format(monday, 'MMMM d')} – {format(addDays(monday, 4), 'MMMM d, yyyy')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasBrief && (
            <Button
              variant="ghost"
              size="sm"
              onClick={refreshBrief}
              disabled={isLoading}
              className="text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className={cn('h-4 w-4 mr-1.5', isLoading && 'animate-spin')} />
              Refresh
            </Button>
          )}
          {!hasBrief && !isLoading && !error && (
            <Button
              size="sm"
              onClick={loadBrief}
              disabled={isLoading}
              className="bg-copper hover:bg-copper-hover text-white"
            >
              <FolderOpen className="h-4 w-4 mr-1.5" />
              Load brief
            </Button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <AlertCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Loading */}
      {isLoading && !brief && (
        <Card>
          <CardContent className="py-6 flex items-center justify-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-copper" />
            <p className="text-sm text-muted-foreground">Loading today's brief…</p>
          </CardContent>
        </Card>
      )}

      {/* ── Weekly Matrix: Objectives card + Daily card, separated ── */}
      <div className="grid grid-cols-[2fr_5fr] gap-3">
      <Card>
        <CardContent className="p-0">
            {/* ── Weekly Objectives column (from Monday's log) ── */}
            {(() => {
              const weeklyObjs = [mondayLog?.weekly_obj_1, mondayLog?.weekly_obj_2, mondayLog?.weekly_obj_3];
              const weeklyActivities = [mondayLog?.weekly_obj_1_activities, mondayLog?.weekly_obj_2_activities, mondayLog?.weekly_obj_3_activities];
              const hasWeeklyObjs = weeklyObjs.some(Boolean);
              // If brief is loaded and weekly not yet logged, preview from orderedWeekly
              const previewWeekly = !hasWeeklyObjs && hasBrief && orderedWeekly.length > 0;
              const displayObjs = previewWeekly
                ? orderedWeekly.slice(0, 3).map(o => o.item.text)
                : weeklyObjs;
              const displayActivities = previewWeekly
                ? orderedWeekly.slice(0, 3).map(o => o.item.activities)
                : weeklyActivities;

              return (
                <div className="min-h-[200px] flex flex-col bg-primary/[0.02]">
                  <div className="px-3 py-2.5 border-b border-border text-center bg-primary/10">
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">Weekly</p>
                    <p className="text-[9px] text-primary/70 mt-0.5">Objectives</p>
                  </div>
                  <div className="flex-1 flex flex-col divide-y divide-border/50">
                    {[0, 1, 2].map(rowIdx => {
                      const text = displayObjs[rowIdx];
                      const acts = displayActivities[rowIdx];
                      return (
                        <div
                          key={rowIdx}
                          className={cn(
                            'flex-1 px-3 py-2.5 flex items-start gap-2',
                            !text && 'items-center justify-center',
                          )}
                        >
                          {text ? (
                            <div className="flex items-start gap-2">
                              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center mt-0.5">
                                {rowIdx + 1}
                              </span>
                              <div>
                                <span className={cn(
                                  'text-xs leading-snug font-medium',
                                  previewWeekly && 'text-muted-foreground italic',
                                )}>
                                  {text}
                                </span>
                                {acts && acts.length > 0 && (
                                  <ul className="mt-0.5">
                                    {acts.map((a, j) => (
                                      <li key={j} className="text-[10px] text-muted-foreground/70 leading-snug flex items-start gap-1">
                                        <span className="mt-0.5">•</span>
                                        <span>{a}</span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            </div>
                          ) : (
                            <span className="text-[10px] text-muted-foreground/30">—</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="px-3 py-1.5 border-t border-border/50 text-center">
                    {hasWeeklyObjs ? (
                      <span className="text-[10px] text-emerald-600 font-medium">✓ Set</span>
                    ) : previewWeekly ? (
                      <span className="text-[10px] text-primary font-medium">Preview</span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground/50">Not set</span>
                    )}
                  </div>
                </div>
              );
            })()}

        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-0">
          <div className="grid grid-cols-5 divide-x divide-border">
            {/* ── Mon–Fri daily priority columns ── */}
            {weekMatrix.map((day, dayIdx) => {
              const isTodayCol = day.isToday;
              const isPast = dayIdx < todayDayIdx;
              const isFuture = todayDayIdx >= 0 && dayIdx > todayDayIdx;

              let displayPriorities = day.priorities;
              let showBriefPreview = false;
              if (isTodayCol && !day.isLogged && hasBrief && todayBriefPriorities.length > 0) {
                displayPriorities = todayBriefPriorities.map(p => p || null);
                showBriefPreview = true;
              }

              return (
                <div
                  key={day.date}
                  className={cn(
                    'min-h-[200px] flex flex-col',
                    isTodayCol && 'bg-copper/[0.03]',
                    isFuture && 'opacity-40',
                  )}
                >
                  <div className={cn(
                    'px-3 py-2.5 border-b border-border text-center',
                    isTodayCol && 'bg-copper/10',
                  )}>
                    <p className={cn(
                      'text-xs font-semibold uppercase tracking-wide',
                      isTodayCol ? 'text-copper' : 'text-muted-foreground',
                    )}>
                      {day.shortLabel}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {format(weekDates[dayIdx], 'MMM d')}
                    </p>
                  </div>

                  <div className="flex-1 flex flex-col divide-y divide-border/50">
                    {[0, 1, 2].map(rowIdx => {
                      const text = displayPriorities[rowIdx];
                      return (
                        <div
                          key={rowIdx}
                          className={cn(
                            'flex-1 px-3 py-2.5 flex items-start gap-2',
                            !text && 'items-center justify-center',
                          )}
                        >
                          {text ? (
                            <>
                              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-copper/10 text-copper text-[10px] font-bold flex items-center justify-center mt-0.5">
                                {rowIdx + 1}
                              </span>
                              <span className={cn(
                                'text-xs leading-snug',
                                showBriefPreview ? 'text-muted-foreground italic' : 'text-foreground font-medium',
                              )}>
                                {text}
                              </span>
                            </>
                          ) : (
                            <span className="text-[10px] text-muted-foreground/30">—</span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="px-3 py-1.5 border-t border-border/50 text-center">
                    {day.isLogged ? (
                      <span className="text-[10px] text-emerald-600 font-medium">✓ Logged</span>
                    ) : isTodayCol && showBriefPreview ? (
                      <span className="text-[10px] text-copper font-medium">Preview</span>
                    ) : isFuture ? (
                      <span className="text-[10px] text-muted-foreground/30">—</span>
                    ) : isPast ? (
                      <span className="text-[10px] text-muted-foreground/50">Not logged</span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
      </div>

      {/* ── Today's Brief Detail (only when brief is loaded and today is a weekday) ── */}
      {hasBrief && todayDayIdx >= 0 && (
        <TonightsBrief
          brief={brief}
          orderedDaily={orderedDaily}
          orderedWeekly={orderedWeekly}
          onReorderDaily={setOrderedDaily}
          onReorderWeekly={setOrderedWeekly}
        />
      )}

      {/* Topic + Log */}
      {hasBrief && todayDayIdx >= 0 && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Topic to raise <span className="text-muted-foreground font-normal">(optional)</span></label>
            <Textarea
              placeholder="What else do you want to bring up tonight?"
              value={topicRaised}
              onChange={e => setTopicRaised(e.target.value)}
              rows={2}
              className="resize-none"
            />
          </div>
          <Button onClick={handleLog}>
            <Save className="h-4 w-4 mr-2" />
            Log this brief
          </Button>
          {brief?.generatedAt && (
            <p className="text-xs text-muted-foreground">
              Brief generated {format(new Date(brief.generatedAt), 'h:mm a')} · Source: local file
            </p>
          )}
        </div>
      )}

      {/* History */}
      <div className="border-t pt-8">
        <DciHistory logs={dciLogs} onUpdate={onUpdateLog} onRerun={onRerun} />
      </div>
    </div>
  );
}

// ── Priority merging: CoS pills + AI brief signals ──────────────────────────

interface MergedPriority {
  text: string;
  origin: 'cos' | 'brief' | 'cos+brief';
  /** The CoS priority if this originated from the pills */
  cosPriority?: CosPriority;
  /** Brief annotation (source icon + reasoning) when brief data reinforces or adds this */
  briefSource?: string;
  briefReasoning?: string;
  /** 1-3 activity bullet points (weekly objectives only) */
  activities: string[];
  /** Specific action step (daily priorities only) */
  action: string;
}

/** Wrapper for drag-and-drop reordering of merged priorities. */
interface OrderedItem {
  dragId: string;
  item: MergedPriority;
}

/**
 * Merge CoS priority pills with AI brief suggestions.
 *
 * Strategy:
 * 1. Start with CoS "this_week" priorities as the base.
 * 2. For each brief daily priority, fuzzy-match against CoS items.
 *    - Match → mark as "cos+brief" and attach brief reasoning.
 *    - No match → it's a net-new signal from email/cal/slack.
 * 3. Build final list: matched CoS items first (in brief order), then
 *    unmatched CoS items, then net-new brief items.
 * 4. Return top 3.
 */
function mergePrioritiesWithBrief(
  cosPriorities: CosPriority[],
  briefPriorities: AiPrioritySuggestion[],
): MergedPriority[] {
  if (briefPriorities.length === 0) {
    // No brief loaded — just return CoS priorities as-is
    return cosPriorities.map(p => ({
      text: p.text,
      origin: 'cos' as const,
      cosPriority: p,
      activities: [],
      action: '',
    }));
  }

  const merged: MergedPriority[] = [];
  const usedCosIds = new Set<string>();

  // Normalize for fuzzy matching
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();

  // Pass 1: For each brief priority, try to match a CoS item
  for (const bp of briefPriorities) {
    const bpNorm = norm(bp.text);
    const bpWords = bpNorm.split(/\s+/).filter(w => w.length > 3);

    // Try to find a CoS priority that overlaps significantly
    let bestMatch: CosPriority | null = null;
    let bestScore = 0;
    for (const cp of cosPriorities) {
      if (usedCosIds.has(cp.id)) continue;
      const cpNorm = norm(cp.text);
      // Count shared significant words
      const cpWords = cpNorm.split(/\s+/).filter(w => w.length > 3);
      const shared = bpWords.filter(w => cpWords.some(cw => cw.includes(w) || w.includes(cw)));
      const score = shared.length / Math.max(bpWords.length, 1);
      if (score > bestScore && score >= 0.3) {
        bestScore = score;
        bestMatch = cp;
      }
    }

    if (bestMatch) {
      // CoS priority reinforced by the brief
      usedCosIds.add(bestMatch.id);
      merged.push({
        text: bestMatch.text,
        origin: 'cos+brief',
        cosPriority: bestMatch,
        briefSource: bp.source,
        briefReasoning: bp.reasoning,
        activities: bp.activities,
        action: bp.action,
      });
    } else {
      // Net-new from brief signals (email/cal/slack)
      merged.push({
        text: bp.text,
        origin: 'brief',
        briefSource: bp.source,
        briefReasoning: bp.reasoning,
        activities: bp.activities,
        action: bp.action,
      });
    }
  }

  // Pass 2: Add remaining CoS priorities that weren't matched
  for (const cp of cosPriorities) {
    if (!usedCosIds.has(cp.id)) {
      merged.push({
        text: cp.text,
        origin: 'cos',
        cosPriority: cp,
        activities: [],
        action: '',
      });
    }
  }

  return merged;
}

// ── Tonight's Brief ───────────────────────────────────────────────────────────

const SOURCE_ICONS: Record<string, string> = {
  priorities: '📋',
  email: '📧',
  calendar: '📅',
  slack: '💬',
  dci_history: '🔄',
};

const SOURCE_LABELS: Record<string, string> = {
  priorities: 'My Lists',
  email: 'Email',
  calendar: 'Calendar',
  slack: 'Slack',
  dci_history: 'DCI history',
};

const ORIGIN_BADGE: Record<string, { label: string; className: string }> = {
  cos: { label: 'My Lists', className: 'bg-primary/10 text-primary' },
  brief: { label: 'New signal', className: 'bg-copper/10 text-copper' },
  'cos+brief': { label: 'Boosted', className: 'bg-emerald-500/10 text-emerald-600' },
};

// ── Sortable priority row for DCI drag-and-drop ─────────────────────────────

function SortableBriefItem({
  id, index, item, tier, isAboveLine,
  editingIdx, editingTier, onStartEdit, onStopEdit, onEditText,
}: {
  id: string;
  index: number;
  item: MergedPriority;
  tier: 'daily' | 'weekly';
  isAboveLine: boolean;
  editingIdx: number | null;
  editingTier: 'daily' | 'weekly' | null;
  onStartEdit: (idx: number, tier: 'daily' | 'weekly') => void;
  onStopEdit: () => void;
  onEditText: (idx: number, text: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const badge = ORIGIN_BADGE[item.origin];
  const isEditing = editingTier === tier && editingIdx === index;
  const colorClass = tier === 'daily' ? 'bg-copper/10 text-copper' : 'bg-primary/10 text-primary';

  return (
    <div ref={setNodeRef} style={style} className={cn('group py-1', !isAboveLine && 'opacity-50')}>
      <div className="flex items-start gap-2">
        <button {...attributes} {...listeners} className="flex-shrink-0 mt-1.5 cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground transition-colors">
          <GripVertical className="h-4 w-4" />
        </button>
        <span className={cn('flex-shrink-0 w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center mt-0.5', colorClass)}>
          {index + 1}
        </span>
        {isEditing ? (
          <div className="flex-1 flex items-center gap-2">
            <Input
              value={item.text}
              onChange={e => onEditText(index, e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') onStopEdit(); }}
              onBlur={onStopEdit}
              autoFocus
              className="text-sm h-8"
            />
          </div>
        ) : (
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <span className={cn('text-sm leading-snug', isAboveLine ? 'font-medium' : '')}>{item.text}</span>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {badge && (
                  <Badge variant="secondary" className={cn('text-[10px] px-1.5 py-0 h-5 font-normal', badge.className)}>
                    {badge.label}
                  </Badge>
                )}
                <button
                  onClick={() => onStartEdit(index, tier)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                </button>
              </div>
            </div>
            {/* Weekly objectives: show activities as bullet points */}
            {tier === 'weekly' && item.activities.length > 0 && (
              <ul className="mt-1.5 space-y-0.5">
                {item.activities.map((a, j) => (
                  <li key={j} className="flex items-start gap-1.5 text-xs text-muted-foreground leading-snug">
                    <span className="text-muted-foreground/40 mt-0.5 flex-shrink-0">•</span>
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            )}
            {/* Daily priorities: show action if present */}
            {tier === 'daily' && item.action && (
              <p className="mt-1 text-[11px] text-muted-foreground/70 leading-snug">
                <span className="font-medium text-muted-foreground">Action:</span> {item.action}
              </p>
            )}
            {(item.briefSource || item.briefReasoning) && (
              <p className="mt-1 text-[11px] text-muted-foreground/70 leading-snug">
                {item.briefSource && (
                  <span className="inline-flex items-center gap-1">
                    <span>{SOURCE_ICONS[item.briefSource] ?? '📋'}</span>
                    <span className="font-medium text-muted-foreground">{SOURCE_LABELS[item.briefSource] ?? item.briefSource}</span>
                  </span>
                )}
                {item.briefSource && item.briefReasoning && <span className="mx-1">·</span>}
                {item.briefReasoning && <span>{item.briefReasoning}</span>}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Reorderable priority list (used for both daily and weekly) ──────────────

function ReorderablePriorityList({
  items,
  tier,
  onReorder,
  onEditItem,
  editingIdx,
  editingTier,
  onStartEdit,
  onStopEdit,
}: {
  items: OrderedItem[];
  tier: 'daily' | 'weekly';
  onReorder: (items: OrderedItem[]) => void;
  onEditItem: (idx: number, text: string) => void;
  editingIdx: number | null;
  editingTier: 'daily' | 'weekly' | null;
  onStartEdit: (idx: number, tier: 'daily' | 'weekly') => void;
  onStopEdit: () => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex(i => i.dragId === active.id);
    const newIndex = items.findIndex(i => i.dragId === over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      onReorder(arrayMove(items, oldIndex, newIndex));
    }
  };

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No priorities yet. Add some in the My Lists tab.</p>;
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map(i => i.dragId)} strategy={verticalListSortingStrategy}>
        {items.map((ordered, i) => (
          <React.Fragment key={ordered.dragId}>
            {i === 3 && (
              <div className="flex items-center gap-2 py-1.5 my-1">
                <div className="flex-1 border-t border-dashed border-border" />
                <span className="text-[10px] text-muted-foreground/50 whitespace-nowrap">top 3 saved</span>
                <div className="flex-1 border-t border-dashed border-border" />
              </div>
            )}
            <SortableBriefItem
              id={ordered.dragId}
              index={i}
              item={ordered.item}
              tier={tier}
              isAboveLine={i < 3}
              editingIdx={editingIdx}
              editingTier={editingTier}
              onStartEdit={onStartEdit}
              onStopEdit={onStopEdit}
              onEditText={onEditItem}
            />
          </React.Fragment>
        ))}
      </SortableContext>
    </DndContext>
  );
}

function TonightsBrief({
  brief,
  orderedDaily,
  orderedWeekly,
  onReorderDaily,
  onReorderWeekly,
}: {
  brief?: DciBriefData | null;
  orderedDaily: OrderedItem[];
  orderedWeekly: OrderedItem[];
  onReorderDaily: (items: OrderedItem[]) => void;
  onReorderWeekly: (items: OrderedItem[]) => void;
}) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editingTier, setEditingTier] = useState<'daily' | 'weekly' | null>(null);

  const stopEdit = () => { setEditingIdx(null); setEditingTier(null); };

  const editDailyItem = (idx: number, text: string) => {
    onReorderDaily(orderedDaily.map((o, i) => i === idx ? { ...o, item: { ...o.item, text } } : o));
  };

  const editWeeklyItem = (idx: number, text: string) => {
    onReorderWeekly(orderedWeekly.map((o, i) => i === idx ? { ...o, item: { ...o.item, text } } : o));
  };

  const hasBrief = brief && brief.source !== 'none';

  return (
    <div className="space-y-6">
      {/* ── Side-by-side: Weekly (left) + Daily (right) ── */}
      {hasBrief && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Weekly Objectives — left */}
          {orderedWeekly.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      Weekly Objectives
                    </span>
                  </CardTitle>
                  <span className="text-[10px] text-muted-foreground">
                    top 3 saved
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  What you need to accomplish by end of week.
                </p>
              </CardHeader>
              <CardContent>
                <ReorderablePriorityList
                  items={orderedWeekly}
                  tier="weekly"
                  onReorder={onReorderWeekly}
                  onEditItem={editWeeklyItem}
                  editingIdx={editingIdx}
                  editingTier={editingTier}
                  onStartEdit={(idx, tier) => { setEditingIdx(idx); setEditingTier(tier); }}
                  onStopEdit={stopEdit}
                />
              </CardContent>
            </Card>
          )}

          {/* Daily Priorities — right */}
          <Card className="border-copper/20">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-copper" />
                    Today's Priorities
                  </span>
                </CardTitle>
                <span className="text-[10px] text-muted-foreground">
                  top 3 saved
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                What needs your attention right now.
              </p>
            </CardHeader>
            <CardContent>
              <ReorderablePriorityList
                items={orderedDaily}
                tier="daily"
                onReorder={onReorderDaily}
                onEditItem={editDailyItem}
                editingIdx={editingIdx}
                editingTier={editingTier}
                onStartEdit={(idx, tier) => { setEditingIdx(idx); setEditingTier(tier); }}
                onStopEdit={stopEdit}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Calendar / Email / Slack sections from brief */}
      {brief && (brief.calendarSection || brief.emailSection || brief.slackSection) && (
        <BriefContextCards
          calendarSection={brief.calendarSection}
          emailSection={brief.emailSection}
          slackSection={brief.slackSection}
        />
      )}
    </div>
  );
}

// ── DCI Brief Methodology ───────────────────────────────────────────────────

function DciBriefMethodology({ hasBrief }: { hasBrief: boolean }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-t border-border/50 pt-4">
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <Info className="h-3.5 w-3.5" />
        <span>How this brief is calculated</span>
        <ChevronDown className={cn('h-3 w-3 transition-transform', expanded && 'rotate-180')} />
      </button>
      {expanded && (
        <div className="mt-3 space-y-3 text-xs text-muted-foreground leading-relaxed">
          <div className="rounded-lg border border-border/50 p-3 space-y-2">
            <p className="font-semibold text-foreground">Two tiers of priorities</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded bg-copper/5 p-2">
                <p className="font-semibold text-copper text-[11px] uppercase tracking-wide mb-1">Urgent Today</p>
                <p>What needs your attention <em>right now</em> — driven by today's calendar, emails, and Slack. Re-derived every day.</p>
              </div>
              <div className="rounded bg-primary/5 p-2">
                <p className="font-semibold text-primary text-[11px] uppercase tracking-wide mb-1">Weekly Priorities</p>
                <p>What you need to accomplish by end of week. Set Monday morning, carried through the week, re-evaluated daily against new signals.</p>
              </div>
            </div>
            <p>Today's urgent items may overlap with your weekly priorities — or not. A fire drill from Slack might push a weekly priority off today's list, but it stays in the weekly view.</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 rounded-lg border border-border/50 p-3">
              <p className="font-semibold text-foreground">Step 1: Generate the brief</p>
              <p>
                Run <code className="bg-muted px-1 rounded text-[11px]">claude</code> from your terminal
                and ask it to generate your Daily Check-in brief. It pulls real-time data from:
              </p>
              <ul className="space-y-1 pl-1">
                <li className="flex items-center gap-2">📅 <span>Google Calendar — today's meetings, attendees, prep notes</span></li>
                <li className="flex items-center gap-2">📧 <span>Gmail — unread and important threads from the last 48h</span></li>
                <li className="flex items-center gap-2">💬 <span>Slack — recent DMs, mentions, and channel activity</span></li>
              </ul>
              <p>
                The brief is saved as a dated markdown file on your machine. On Monday it sets both daily and weekly priorities. Tue–Fri it re-derives today's focus while carrying forward the weekly plan.
              </p>
            </div>
            <div className="space-y-2 rounded-lg border border-border/50 p-3">
              <p className="font-semibold text-foreground">Step 2: Merge with My Lists</p>
              <p>
                Your manually curated priorities from <strong>My Lists</strong> are always the foundation.
                AI signals annotate and reorder them:
              </p>
              <ul className="space-y-1.5 pl-1">
                <li className="flex items-start gap-2">
                  <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 text-[10px] px-1.5 py-0 h-4 font-normal flex-shrink-0 mt-0.5">Boosted</Badge>
                  <span>Your priority confirmed by a calendar event, email, or Slack thread</span>
                </li>
                <li className="flex items-start gap-2">
                  <Badge variant="secondary" className="bg-copper/10 text-copper text-[10px] px-1.5 py-0 h-4 font-normal flex-shrink-0 mt-0.5">New signal</Badge>
                  <span>Net-new item surfaced from email/calendar/Slack not on your lists</span>
                </li>
                <li className="flex items-start gap-2">
                  <Badge variant="secondary" className="bg-primary/10 text-primary text-[10px] px-1.5 py-0 h-4 font-normal flex-shrink-0 mt-0.5">My Lists</Badge>
                  <span>Your existing priority — no external signal matched it today</span>
                </li>
              </ul>
            </div>
          </div>
          <div className="rounded-lg border border-border/50 p-3">
            <p className="font-semibold text-foreground mb-1">Step 3: Edit, log, share</p>
            <p>
              Hover any priority to edit it inline. Click <strong>Log this brief</strong> to
              save to Daily Check-in history, or <strong>Copy for Daily Check-in</strong> to paste into your meeting.
              Re-generate anytime by running Claude Code again and clicking Refresh.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Brief Context Cards (Calendar / Email / Slack from markdown) ─────────────

function BriefContextCards({ calendarSection, emailSection, slackSection }: {
  calendarSection: string | null;
  emailSection: string | null;
  slackSection: string | null;
}) {
  const [expanded, setExpanded] = useState(false);

  const sections = [
    { label: 'Calendar', icon: '📅', content: calendarSection },
    { label: 'Email Signals', icon: '📧', content: emailSection },
    { label: 'Slack Signals', icon: '💬', content: slackSection },
  ].filter(s => s.content);

  if (sections.length === 0) return null;

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-2">
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex items-center justify-between w-full"
        >
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Context Sources
          </CardTitle>
          <div className="flex items-center gap-2">
            {sections.map(s => (
              <span key={s.label} className="text-xs">{s.icon}</span>
            ))}
            <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
          </div>
        </button>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-4 pt-0">
          {sections.map(s => (
            <div key={s.label}>
              <p className="text-xs font-semibold text-muted-foreground mb-1.5">
                {s.icon} {s.label}
              </p>
              <div className="text-xs text-muted-foreground whitespace-pre-line leading-relaxed pl-1">
                {s.content!.split('\n').map((line, i) => (
                  <div key={i} className={cn(line.startsWith('-') ? 'ml-2' : '', 'mb-0.5')}>
                    {line}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      )}
    </Card>
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
  onCopy, statusOptions, priorities, disableDnd,
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
  disableDnd?: boolean;
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
          {disableDnd ? (
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
                <p className="text-xs text-muted-foreground/60 italic">{`None yet — add what ${firstName} owns`}</p>
              )}
            </div>
          ) : (
            <Droppable droppableId={`acct-drop-${member.id}`}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={cn(
                    "space-y-0.5 rounded-md p-1 min-h-[32px] transition-colors",
                    snapshot.isDraggingOver && "bg-primary/5 ring-1 ring-primary/30",
                  )}
                >
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
                  {provided.placeholder}
                  {accountabilities.length === 0 && (
                    <p className="text-xs text-muted-foreground/60 italic">
                      {snapshot.isDraggingOver ? 'Drop to add as accountability' : `None yet — add what ${firstName} owns`}
                    </p>
                  )}
                </div>
              )}
            </Droppable>
          )}
        </div>

        {/* Discussion topics */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Discussion Topics</h4>
              {topics.length > 0 && (
                <Badge variant="secondary" className="text-xs px-1.5 py-0">{topics.length}</Badge>
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
          {disableDnd ? (
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
                <p className="text-xs text-muted-foreground/60 italic">None yet — add manually or use "Suggest topics"</p>
              )}
            </div>
          ) : (
            <Droppable droppableId={`topic-drop-${member.id}`}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={cn(
                    "space-y-0.5 rounded-md p-1 min-h-[32px] transition-colors",
                    snapshot.isDraggingOver && "bg-primary/5 ring-1 ring-primary/30",
                  )}
                >
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
                  {provided.placeholder}
                  {topics.length === 0 && (
                    <p className="text-xs text-muted-foreground/60 italic">
                      {snapshot.isDraggingOver ? 'Drop to add as discussion topic' : 'None yet — add manually or use "Suggest topics"'}
                    </p>
                  )}
                </div>
              )}
            </Droppable>
          )}
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
  onCopy, statusOptions, priorities, colLabel, disableDnd,
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
  disableDnd?: boolean;
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
            disableDnd={disableDnd}
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
        <Badge variant="secondary" className="text-xs px-1.5 py-0 normal-case tracking-normal">{items.length}</Badge>
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
  category, label, items, onUpdate, onAdd, onDelete, onPermanentDelete, onCopy, mondayTaggedTexts, statusOptions, newlyAddedId, onNewlyAddedConsumed, disableDnd,
}: {
  category: CategoryKey;
  label: string;
  items: CosPriority[];
  onUpdate: (id: string, updates: Partial<CosPriority>) => void;
  onAdd: (category: CategoryKey) => void;
  onDelete: (id: string) => void;
  onPermanentDelete?: (id: string) => void;
  onCopy: (text: string, label?: string) => void;
  mondayTaggedTexts: string[];
  statusOptions: string[];
  newlyAddedId: string | null;
  onNewlyAddedConsumed: () => void;
  disableDnd?: boolean;
}) {
  const renderItems = (isDraggingOver: boolean) => (
    <>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-sm">{label}</h3>
          <Badge variant="secondary" className="text-xs bg-transparent text-orange-500 border-0 font-extrabold">{items.length}</Badge>
        </div>
        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => onAdd(category)}>
          <Plus className="h-3.5 w-3.5 mr-1" />Add
        </Button>
      </div>
      <div className="space-y-1.5">
        {items.map((item, index) =>
          disableDnd ? (
            <PriorityCard
              key={item.id}
              item={item}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onPermanentDelete={onPermanentDelete}
              onCopy={onCopy}
              isTagged={mondayTaggedTexts.includes(item.text)}
              statusOptions={statusOptions}
              autoEdit={item.id === newlyAddedId}
              onAutoEditConsumed={onNewlyAddedConsumed}
            />
          ) : (
            <DraggablePriorityCard
              key={item.id}
              item={item}
              index={index}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onPermanentDelete={onPermanentDelete}
              onCopy={onCopy}
              isTagged={mondayTaggedTexts.includes(item.text)}
              statusOptions={statusOptions}
              autoEdit={item.id === newlyAddedId}
              onAutoEditConsumed={onNewlyAddedConsumed}
            />
          )
        )}
        {items.length === 0 && (
          <div className={cn(
            'rounded-md border-2 border-dashed border-border/40 py-4 text-center text-xs text-muted-foreground',
            isDraggingOver && 'border-primary/40 bg-primary/5',
          )}>
            Drop here
          </div>
        )}
      </div>
    </>
  );

  if (disableDnd) {
    return <div className="rounded-lg">{renderItems(false)}</div>;
  }

  return (
    <Droppable droppableId={category}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          className={cn('rounded-lg transition-colors', snapshot.isDraggingOver && 'bg-primary/5')}
        >
          {renderItems(snapshot.isDraggingOver)}
          {provided.placeholder}
        </div>
      )}
    </Droppable>
  );
}

function DraggablePriorityCard({
  item, index, onUpdate, onDelete, onPermanentDelete, onCopy, isTagged, statusOptions, autoEdit, onAutoEditConsumed,
}: {
  item: CosPriority;
  index: number;
  onUpdate: (id: string, updates: Partial<CosPriority>) => void;
  onDelete: (id: string) => void;
  onPermanentDelete?: (id: string) => void;
  onCopy: (text: string, label?: string) => void;
  isTagged: boolean;
  statusOptions: string[];
  autoEdit?: boolean;
  onAutoEditConsumed?: () => void;
}) {
  const isMobile = useIsMobile();
  return (
    <Draggable draggableId={item.id} index={index} isDragDisabled={isMobile}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          style={{ ...provided.draggableProps.style, opacity: snapshot.isDragging ? 0.4 : 1 }}
        >
          <PriorityCard
            item={item}
            dragListeners={isMobile ? undefined : provided.dragHandleProps}
            dragAttributes={isMobile ? undefined : {}}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onPermanentDelete={onPermanentDelete}
            onCopy={onCopy}
            isTagged={isTagged}
            statusOptions={statusOptions}
            autoEdit={autoEdit}
            onAutoEditConsumed={onAutoEditConsumed}
          />
        </div>
      )}
    </Draggable>
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
  onDropPriorityOnAccountability, onDropPriorityOnTopic,
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
  onDropPriorityOnAccountability: (memberId: string, text: string) => void;
  onDropPriorityOnTopic: (memberId: string, text: string) => void;
  onPermanentDelete: (id: string) => void;
  onRestoreArchived: (id: string) => void;
  layoutConfig: CosLayoutConfig;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const allActiveCategories = layoutConfig.columns
    .flatMap(c => c.sections.filter(s => s.enabled && s.type !== 'direct_reports'))
    .map(sectionToCategoryKey);

  const handleDragStart = (start: { draggableId: string }) => setActiveId(start.draggableId);

  const handleDragEnd = (result: DropResult) => {
    setActiveId(null);
    if (!result.destination) return;

    const { draggableId, source, destination } = result;
    const activeItem = priorities.find(p => p.id === draggableId);
    if (!activeItem) return;

    // Drop onto person sections
    if (destination.droppableId.startsWith('acct-drop-')) {
      onDropPriorityOnAccountability(destination.droppableId.replace('acct-drop-', ''), activeItem.text);
      return;
    }
    if (destination.droppableId.startsWith('topic-drop-')) {
      onDropPriorityOnTopic(destination.droppableId.replace('topic-drop-', ''), activeItem.text);
      return;
    }

    // Same position — no-op
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    // Reorder within or across category buckets
    const targetCategory = destination.droppableId;
    const targetItems = priorities
      .filter(p => p.category === targetCategory && !p.done_at && !p.archived_at)
      .sort((a, b) => a.tier_order - b.tier_order);

    // If moving within the same list and going downward, the item at destination.index
    // is the one AFTER the drop position (since the dragged item is removed first).
    // If cross-list, destination.index is the position in the target list.
    let insertBeforeId: string | null = null;
    if (source.droppableId === destination.droppableId) {
      // Same list: after removing the dragged item, find the item at destination.index
      const withoutDragged = targetItems.filter(p => p.id !== draggableId);
      insertBeforeId = withoutDragged[destination.index]?.id ?? null;
    } else {
      insertBeforeId = targetItems[destination.index]?.id ?? null;
    }

    onReorder(activeItem.id, targetCategory, insertBeforeId);
  };

  const sortedFor = (cat: CategoryKey) =>
    priorities.filter(p => p.category === cat && !p.done_at && !p.archived_at).sort((a, b) => a.tier_order - b.tier_order);

  const archivedItems = priorities
    .filter(p => !!p.archived_at || !!p.done_at)
    .sort((a, b) => {
      const aTime = new Date(a.archived_at ?? a.done_at ?? a.created_at).getTime();
      const bTime = new Date(b.archived_at ?? b.done_at ?? b.created_at).getTime();
      return bTime - aTime;
    });

  return (
    <>
    <DragDropContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div
        className="hidden md:grid gap-6"
        style={{ gridTemplateColumns: layoutConfig.columns.map(c => `${c.widthPct}fr`).join(' ') }}
      >
        {layoutConfig.columns.map(col => (
          <div key={col.id} className="space-y-6">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{col.headerLabel}</h3>
            {col.sections.filter(s => s.enabled).map(section =>
              section.type === 'direct_reports' ? (
                <PersonSectionsRow
                  key={section.id}
                  members={members}
                  accountabilities={accountabilities}
                  topics={personTopics}
                  onAddAccountability={onAddAccountability}
                  onUpdateAccountability={onUpdateAccountability}
                  onDeleteAccountability={onDeleteAccountability}
                  onAddTopic={onAddPersonTopic}
                  onUpdateTopic={onUpdatePersonTopic}
                  onDeleteTopic={onDeletePersonTopic}
                  newlyAddedAccountabilityId={newlyAddedAccountabilityId}
                  newlyAddedTopicId={newlyAddedTopicId}
                  onNewlyAddedAccountabilityConsumed={onNewlyAddedAccountabilityConsumed}
                  onNewlyAddedTopicConsumed={onNewlyAddedTopicConsumed}
                  onCopy={onCopy}
                  statusOptions={statusOptions}
                  priorities={priorities}
                  colLabel={col.headerLabel}
                />
              ) : (
                <CategoryBucket
                  key={section.id}
                  category={sectionToCategoryKey(section)}
                  label={resolveNewSectionLabel(section)}
                  items={sortedFor(sectionToCategoryKey(section))}
                  onUpdate={onUpdate}
                  onAdd={onAdd}
                  onDelete={onDelete}
                  onPermanentDelete={onPermanentDelete}
                  onCopy={onCopy}
                  mondayTaggedTexts={mondayTaggedTexts}
                  statusOptions={statusOptions}
                  newlyAddedId={newlyAddedId}
                  onNewlyAddedConsumed={onNewlyAddedConsumed}
                />
              )
            )}
          </div>
        ))}
      </div>
      {/* Mobile: stacked single column — DnD disabled */}
      <div className="md:hidden space-y-6">
        {layoutConfig.columns.flatMap(col =>
          col.sections.filter(s => s.enabled).map(section =>
            section.type === 'direct_reports' ? (
              <PersonSectionsRow
                key={section.id}
                members={members}
                accountabilities={accountabilities}
                topics={personTopics}
                onAddAccountability={onAddAccountability}
                onUpdateAccountability={onUpdateAccountability}
                onDeleteAccountability={onDeleteAccountability}
                onAddTopic={onAddPersonTopic}
                onUpdateTopic={onUpdatePersonTopic}
                onDeleteTopic={onDeletePersonTopic}
                newlyAddedAccountabilityId={newlyAddedAccountabilityId}
                newlyAddedTopicId={newlyAddedTopicId}
                onNewlyAddedAccountabilityConsumed={onNewlyAddedAccountabilityConsumed}
                onNewlyAddedTopicConsumed={onNewlyAddedTopicConsumed}
                onCopy={onCopy}
                statusOptions={statusOptions}
                priorities={priorities}
                colLabel={col.headerLabel}
                disableDnd
              />
            ) : (
              <CategoryBucket
                key={section.id}
                category={sectionToCategoryKey(section)}
                label={resolveNewSectionLabel(section)}
                items={sortedFor(sectionToCategoryKey(section))}
                onUpdate={onUpdate}
                onAdd={onAdd}
                onDelete={onDelete}
                onCopy={onCopy}
                mondayTaggedTexts={mondayTaggedTexts}
                statusOptions={statusOptions}
                newlyAddedId={newlyAddedId}
                onNewlyAddedConsumed={onNewlyAddedConsumed}
                disableDnd
              />
            )
          )
        )}
      </div>
    </DragDropContext>

    {archivedItems.length > 0 && (
      <ArchiveSection
        items={archivedItems}
        layoutConfig={layoutConfig}
        onRestore={onRestoreArchived}
        onDelete={onPermanentDelete}
      />
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
  item, dragListeners, dragAttributes, onUpdate, onDelete, onPermanentDelete, onCopy, isTagged, statusOptions, autoEdit, onAutoEditConsumed,
}: {
  item: CosPriority;
  dragListeners?: Record<string, unknown> | null;
  dragAttributes?: Record<string, unknown> | null;
  onUpdate: (id: string, updates: Partial<CosPriority>) => void;
  onDelete: (id: string) => void;
  onPermanentDelete?: (id: string) => void;
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
      <CardContent className="p-3">
        <div className="flex items-center gap-1.5">
          {/* Drag handle — hidden on mobile so the left edge stays scrollable */}
          <button
            {...dragListeners}
            {...dragAttributes}
            className="hidden sm:block flex-shrink-0 py-1 pr-0.5 text-muted-foreground/30 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label="Drag to reorder"
          >
            <GripVertical className="h-4 w-4" />
          </button>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {editing ? (
              <div className="flex items-center">
                <Input
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  onBlur={saveText}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.currentTarget.blur(); }
                    if (e.key === 'Escape') { setEditText(item.text); setEditing(false); }
                  }}
                  className="h-10 text-sm"
                  autoFocus
                />
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
                <div className="pt-2 border-t border-border/40 flex gap-2">
                  <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-foreground" onClick={() => onDelete(item.id)}>
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                    Archive
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-destructive" onClick={() => onPermanentDelete?.(item.id)}>
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    Delete
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Right controls — status stacked above chevron */}
          <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
            <button
              onClick={cycleStatus}
              title={item.status ? `Status: ${item.status} — click to advance` : 'Click to set status'}
              className={cn(
                'text-[10px] font-medium px-1.5 py-px rounded border transition-colors truncate text-center leading-tight',
                statusColor ?? 'bg-muted/40 text-muted-foreground border-border/40 hover:bg-muted',
              )}
            >
              {item.status ?? <span className="text-muted-foreground/30">···</span>}
            </button>
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1 text-muted-foreground hover:text-foreground"
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

function DciLogCard({ log, onUpdate, onRerun, defaultExpanded = false }: {
  log: CosDciLog;
  onUpdate: (id: string, updates: Partial<CosDciLog>) => void;
  onRerun: (log: CosDciLog) => void;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
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
            🔄 Rerun Daily Check-in
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
        <h2 className="text-lg font-semibold">Daily Check-in History</h2>
        <p className="text-sm text-muted-foreground mt-0.5">{logs.length} brief{logs.length !== 1 ? 's' : ''} logged</p>
      </div>

      {logs.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            No Daily Check-in briefs logged yet. Use the form above to log your first one.
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
            {logs.map((log, i) => (
              <DciLogCard key={log.id} log={log} onUpdate={onUpdate} onRerun={onRerun} defaultExpanded={i === 0} />
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

/**
 * Find the latest dated prep file for a person.
 * Files follow the pattern: slug_YYYYMMDD.md (e.g. aj_depew_20260601.md).
 * Returns the file with the most recent date suffix (today or closest prior).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function findLatestPrepFile(dirHandle: any, slug: string): Promise<{ content: string; lastModified: number } | null> {
  const prefix = `${slug}_`;
  const datePattern = /^(\d{8})\.md$/;
  let latestDate = '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let latestHandle: any = null;

  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind !== 'file') continue;
    if (!name.startsWith(prefix)) continue;
    const suffix = name.slice(prefix.length);
    const match = suffix.match(datePattern);
    if (match && match[1] > latestDate) {
      latestDate = match[1];
      latestHandle = handle;
    }
  }

  if (!latestHandle) return null;
  const file = await latestHandle.getFile();
  const content = await file.text();
  return { content, lastModified: file.lastModified };
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
          const result = await findLatestPrepFile(dirHandleRef.current, slug);
          if (result) {
            setPrepSheet({ member, content: result.content, source: 'static', generatedAt: new Date(result.lastModified).toISOString() });
            return;
          }
          dirHandleRef.current = null;
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
      // Try local filesystem first (re-read latest dated file)
      if (dirHandleRef.current) {
        const slug = prepSheet.member.name.trim().toLowerCase().replace(/\s+/g, '_');
        const result = await findLatestPrepFile(dirHandleRef.current, slug);
        if (result) {
          setPrepSheet({ ...prepSheet, content: result.content, source: 'static', generatedAt: new Date(result.lastModified).toISOString() });
          return;
        }
      }
      // Fall back to ClearGO / static
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

// ── Settings ──────────────────────────────────────────────────────────────────

function SortableSectionRow({
  section,
  onUpdate,
  onRemove,
}: {
  section: CosColumnSection;
  onUpdate: (changes: Partial<CosColumnSection>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  const auto = isAutoType(section.type);
  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-1.5">
      <button
        {...attributes}
        {...listeners}
        className="p-0.5 text-muted-foreground/30 hover:text-muted-foreground cursor-grab active:cursor-grabbing flex-shrink-0 touch-none"
        tabIndex={-1}
        title="Drag to reorder"
      >
        <GripVertical className="h-3 w-3" />
      </button>
      <Switch
        checked={section.enabled}
        onCheckedChange={checked => onUpdate({ enabled: checked })}
        className="flex-shrink-0 scale-[0.8] origin-left"
      />
      {auto ? (
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <span className="text-xs text-muted-foreground truncate">{resolveNewSectionLabel(section)}</span>
          <Badge variant="secondary" className="text-[9px] px-1 py-0 font-normal flex-shrink-0 leading-tight">auto</Badge>
        </div>
      ) : (
        <Input
          value={section.label ?? ''}
          onChange={e => onUpdate({ label: e.target.value || null })}
          placeholder={SECTION_TYPE_LABELS[section.type] ?? 'Section name'}
          className="h-7 text-xs flex-1 min-w-0"
          disabled={!section.enabled}
        />
      )}
      <button
        onClick={onRemove}
        className="p-0.5 text-muted-foreground/40 hover:text-destructive flex-shrink-0"
        title="Remove"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function SortableColumnCard({
  col,
  colIndex,
  availableTypes,
  onUpdateHeader,
  onUpdateWidth,
  onUpdateSection,
  onRemoveSection,
  onAddSection,
}: {
  col: CosColumn;
  colIndex: number;
  availableTypes: CosSectionType[];
  onUpdateHeader: (label: string) => void;
  onUpdateWidth: (pct: number) => void;
  onUpdateSection: (sectionId: string, changes: Partial<CosColumnSection>) => void;
  onRemoveSection: (sectionId: string) => void;
  onAddSection: (type: CosSectionType) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: col.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="space-y-3 rounded-lg border border-border/60 p-3 flex flex-col">
      {/* Column badge + drag handle */}
      <div className="flex items-center gap-1.5">
        <button
          {...attributes}
          {...listeners}
          className="text-muted-foreground/30 hover:text-muted-foreground cursor-grab active:cursor-grabbing touch-none"
          tabIndex={-1}
          title="Drag to reorder column"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
          Column {colIndex + 1}
        </p>
      </div>

      {/* Header label */}
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Label</label>
        <Input
          value={col.headerLabel}
          onChange={e => onUpdateHeader(e.target.value)}
          className="h-8 text-sm"
          placeholder={`Column ${colIndex + 1}`}
        />
      </div>

      {/* Width % */}
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Width %</label>
        <Input
          type="number"
          min={5}
          max={90}
          value={col.widthPct}
          onChange={e => onUpdateWidth(parseInt(e.target.value) || 0)}
          className="h-8 text-sm"
        />
      </div>

      {/* Sections */}
      <div className="flex-1 space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">
          {col.headerLabel || `Column ${colIndex + 1}`} — sections
        </p>
        <SortableContext items={col.sections.map(s => s.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1.5">
            {col.sections.map(section => (
              <SortableSectionRow
                key={section.id}
                section={section}
                onUpdate={changes => onUpdateSection(section.id, changes)}
                onRemove={() => onRemoveSection(section.id)}
              />
            ))}
          </div>
        </SortableContext>
        {availableTypes.length > 0 && (
          <SectionTypeAdder availableTypes={availableTypes} onAdd={onAddSection} />
        )}
      </div>
    </div>
  );
}

function SectionTypeAdder({
  availableTypes, onAdd,
}: {
  availableTypes: CosSectionType[];
  onAdd: (type: CosSectionType) => void;
}) {
  const [value, setValue] = React.useState('');
  return (
    <Select value={value} onValueChange={t => { onAdd(t as CosSectionType); setValue(''); }}>
      <SelectTrigger className="h-8 text-xs mt-2 text-muted-foreground">
        <SelectValue placeholder="+ Add section" />
      </SelectTrigger>
      <SelectContent>
        {availableTypes.map(t => (
          <SelectItem key={t} value={t} className="text-xs">{SECTION_TYPE_LABELS[t]}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SettingsSection({
  statusOptions, onSave,
  layoutConfig, onSaveLayout, isActive,
}: {
  statusOptions: string[];
  onSave: (options: string[]) => Promise<void>;
  layoutConfig: CosLayoutConfig;
  onSaveLayout: (config: CosLayoutConfig) => Promise<void>;
  isActive?: boolean;
}) {
  // ── Status options draft ──────────────────────────────────────────────────
  const [draft, setDraft] = useState<string[]>(statusOptions);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  React.useEffect(() => { setDraft(statusOptions); }, [statusOptions]);

  const update = (idx: number, val: string) =>
    setDraft(prev => prev.map((s, i) => (i === idx ? val : s)));
  const remove = (idx: number) => setDraft(prev => prev.filter((_, i) => i !== idx));
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

  // ── Layout config draft ───────────────────────────────────────────────────
  const [draftLayout, setDraftLayout] = useState<CosLayoutConfig>(layoutConfig);
  const [savingLayout, setSavingLayout] = useState(false);

  React.useEffect(() => { setDraftLayout(layoutConfig); }, [layoutConfig]);

  const updateColumnHeader = (colId: string, headerLabel: string) =>
    setDraftLayout(prev => ({ ...prev, columns: prev.columns.map(c => c.id === colId ? { ...c, headerLabel } : c) }));

  const updateColumnWidth = (colId: string, widthPct: number) =>
    setDraftLayout(prev => ({ ...prev, columns: prev.columns.map(c => c.id === colId ? { ...c, widthPct } : c) }));

  const updateSection = (colId: string, sectionId: string, changes: Partial<CosColumnSection>) =>
    setDraftLayout(prev => ({
      ...prev,
      columns: prev.columns.map(c => c.id !== colId ? c : {
        ...c, sections: c.sections.map(s => s.id === sectionId ? { ...s, ...changes } : s),
      }),
    }));

  const removeSection = (colId: string, sectionId: string) =>
    setDraftLayout(prev => ({
      ...prev,
      columns: prev.columns.map(c => c.id !== colId ? c : {
        ...c, sections: c.sections.filter(s => s.id !== sectionId),
      }),
    }));

  const addSection = (colId: string, type: CosSectionType) => {
    const newId = type === 'custom' ? `custom_${crypto.randomUUID().slice(0, 8)}` : type;
    const newSection: CosColumnSection = { id: newId, type, label: type === 'custom' ? 'New Section' : null, enabled: true };
    setDraftLayout(prev => ({
      ...prev,
      columns: prev.columns.map(c => c.id !== colId ? c : { ...c, sections: [...c.sections, newSection] }),
    }));
  };

  const changeColumnCount = (newCount: 3 | 4) =>
    setDraftLayout(prev => adjustColumnCount(prev, newCount));

  // ── Settings-panel drag-and-drop ─────────────────────────────────────────
  const settingsSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleSettingsDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const activeId = active.id as string;
    const overId   = over.id   as string;

    // Column reorder
    if (draftLayout.columns.some(c => c.id === activeId)) {
      const oldIdx = draftLayout.columns.findIndex(c => c.id === activeId);
      const newIdx = draftLayout.columns.findIndex(c => c.id === overId);
      if (oldIdx !== -1 && newIdx !== -1) {
        setDraftLayout(prev => ({ ...prev, columns: arrayMove(prev.columns, oldIdx, newIdx) }));
      }
      return;
    }

    // Section reorder within or across columns
    const sourceColIdx = draftLayout.columns.findIndex(c => c.sections.some(s => s.id === activeId));
    if (sourceColIdx === -1) return;
    let targetColIdx = draftLayout.columns.findIndex(c => c.sections.some(s => s.id === overId));
    if (targetColIdx === -1) targetColIdx = draftLayout.columns.findIndex(c => c.id === overId);
    if (targetColIdx === -1) return;

    setDraftLayout(prev => {
      const newColumns = prev.columns.map(c => ({ ...c, sections: [...c.sections] }));
      if (sourceColIdx === targetColIdx) {
        const col = newColumns[sourceColIdx];
        const oldIdx = col.sections.findIndex(s => s.id === activeId);
        const newIdx = col.sections.findIndex(s => s.id === overId);
        if (oldIdx !== -1 && newIdx !== -1) {
          newColumns[sourceColIdx] = { ...col, sections: arrayMove(col.sections, oldIdx, newIdx) };
        }
      } else {
        const sourceCol = newColumns[sourceColIdx];
        const targetCol = newColumns[targetColIdx];
        const sectionIdx = sourceCol.sections.findIndex(s => s.id === activeId);
        const [movedSection] = sourceCol.sections.splice(sectionIdx, 1);
        const overIdx = targetCol.sections.findIndex(s => s.id === overId);
        if (overIdx !== -1) targetCol.sections.splice(overIdx, 0, movedSection);
        else targetCol.sections.push(movedSection);
      }
      return { ...prev, columns: newColumns };
    });
  };

  const getAvailableTypes = (currentColId: string): CosSectionType[] => {
    const usedNonCustom = new Set<CosSectionType>();
    for (const col of draftLayout.columns) {
      for (const s of col.sections) {
        if (s.type !== 'custom') usedNonCustom.add(s.type);
      }
    }
    const allTypes: CosSectionType[] = [
      'now', 'this_week', 'next_week', 'this_month_auto', 'next_month_auto', 'next_quarter_auto', 'direct_reports', 'custom',
    ];
    // For the current column, exclude types already present in it; for others, exclude non-custom types claimed anywhere
    const currentCol = draftLayout.columns.find(c => c.id === currentColId);
    const typesInThisCol = new Set(currentCol?.sections.map(s => s.type) ?? []);
    return allTypes.filter(t => {
      if (t === 'custom') return true;
      return !usedNonCustom.has(t) || (!typesInThisCol.has(t) && false);
    }).filter(t => t === 'custom' || !typesInThisCol.has(t));
  };

  const saveLayout = async () => {
    if (totalWidthPct(draftLayout.columns) !== 100) {
      toast({ title: `Column widths sum to ${totalWidthPct(draftLayout.columns)}% — must equal 100%`, variant: 'destructive' });
      return;
    }
    setSavingLayout(true);
    await onSaveLayout(draftLayout);
    setSavingLayout(false);
    toast({ title: 'Layout settings saved' });
  };

  return (
    <div className="space-y-10">
      <div className="max-w-lg">
        <h2 className="text-lg font-semibold">Settings</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure labels, sections, and status options for your Chief of Staff workspace.
        </p>
      </div>

      {/* ── Column Labels ────────────────────────────────────────────────────── */}
      <div className="space-y-5">
        <div className="max-w-lg">
          <h3 className="text-sm font-semibold">Column Labels</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Column 1's label also appears as the Priorities tab name. Auto-labeled sections (months, quarter) compute their value from the calendar and cannot be renamed.
          </p>
        </div>

        {/* Column count toggle */}
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Number of columns</p>
          <div className="flex gap-2">
            {([3, 4] as const).map(n => (
              <button
                key={n}
                onClick={() => changeColumnCount(n)}
                className={cn(
                  'px-4 py-1.5 rounded-md text-sm font-medium border transition-colors',
                  draftLayout.columnCount === n
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background border-border hover:bg-muted',
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Per-column config blocks — drag columns or sections to reorder.
            Sensors are only active when this tab is visible to prevent the
            settings DndContext's PointerSensor from interfering with the
            priorities-tab DndContext when both are mounted. */}
        <DndContext
          sensors={isActive ? settingsSensors : []}
          collisionDetection={closestCenter}
          onDragEnd={handleSettingsDragEnd}
        >
          <SortableContext items={draftLayout.columns.map(c => c.id)} strategy={horizontalListSortingStrategy}>
            <div className={cn('grid gap-3', draftLayout.columnCount === 4 ? 'grid-cols-4' : 'grid-cols-3')}>
              {draftLayout.columns.map((col, colIndex) => (
                <SortableColumnCard
                  key={col.id}
                  col={col}
                  colIndex={colIndex}
                  availableTypes={getAvailableTypes(col.id)}
                  onUpdateHeader={label => updateColumnHeader(col.id, label)}
                  onUpdateWidth={pct => updateColumnWidth(col.id, pct)}
                  onUpdateSection={(sectionId, changes) => updateSection(col.id, sectionId, changes)}
                  onRemoveSection={sectionId => removeSection(col.id, sectionId)}
                  onAddSection={type => addSection(col.id, type)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {totalWidthPct(draftLayout.columns) !== 100 && (
          <p className="text-xs text-destructive">
            Column widths sum to {totalWidthPct(draftLayout.columns)}% — must equal 100%.
          </p>
        )}

        <Button onClick={saveLayout} disabled={savingLayout} className="h-9">
          {savingLayout ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Save layout settings
        </Button>
      </div>

      <div className="border-t border-border/40 pt-8 space-y-3 max-w-lg">
        {/* ── Status options ──────────────────────────────────────────────────── */}
        <h3 className="text-sm font-semibold">Priority card statuses</h3>
        <p className="text-xs text-muted-foreground">
          These cycle on each priority card when you click the status badge.
          Defaults: WIP = Work in Progress, WOS = Waiting on Someone.
        </p>
        <div className="space-y-2">
          {draft.map((opt, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Input
                value={opt}
                onChange={e => update(idx, e.target.value)}
                placeholder={`Status ${idx + 1}`}
                className="h-9 text-sm max-w-xs"
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
        <Button onClick={save} disabled={saving} variant="outline" className="h-9">
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Save statuses
        </Button>
      </div>
    </div>
  );
}
