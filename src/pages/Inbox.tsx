import { useState, useEffect, useMemo, useCallback, useRef, type ComponentType } from 'react';
import { format, addDays } from 'date-fns';
import { parseLocalDate } from '@/lib/dateUtils';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import {
  Settings, AlignJustify, Layers, LayoutList, Bot, Trash2, X, Pin, Menu, Flame,
  Inbox as InboxIcon, Zap, Clock, Archive as ArchiveIcon, Hash, User, FolderOpen,
  Loader2, type LucideIcon,
} from 'lucide-react';
import { InboxMeetingsView } from '@/components/inbox/InboxMeetingsView';
import { WeekendBanner } from '@/components/WeekendBanner';
import { MeetingDetailSidebarNav, type MeetingDetailTab } from '@/components/inbox/MeetingDetailSidebarNav';
import type { UpcomingOneOnOneEvent } from '@/components/cos/OneOnOnesView';
import { cn } from '@/lib/utils';
import { useIsDesktop, useIsMobile, useIsTouch } from '@/hooks/use-breakpoint';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { InboxSidebar, type MeetingsSyncInfo } from '@/components/inbox/InboxSidebar';
import { InboxGroupedView } from '@/components/inbox/InboxGroupedView';
import { InboxByProjectView } from '@/components/inbox/InboxByProjectView';
import { DelegateDropdown } from '@/components/inbox/DelegateDropdown';
import { InboxAssistantPanel } from '@/components/inbox/InboxAssistantPanel';
import { AccountabilityIllustration } from '@/components/inbox/AccountabilityIllustration';
import { InboxSuggestionsPanel } from '@/components/inbox/InboxSuggestionsPanel';
import { useInboxItems } from '@/hooks/useInboxItems';
import { useInboxTags } from '@/hooks/useInboxTags';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useSlackChannelOptions } from '@/hooks/useSlackChannelOptions';
import { useMeetingTitleOptions } from '@/hooks/useMeetingTitleOptions';
import { useDciBrief } from '@/hooks/useDciAiSuggestions';
import type { Json } from '@/integrations/supabase/types';
import type { InboxFilterState, InboxItem, InboxItemType, InboxBucket, BriefPriority, InboxTag } from '@/types/inbox';
import { planTagGroupReindex, isAutoPinnedItem } from '@/lib/inboxValidation';
import { TAG_COLORS } from '@/types/inbox';
import { kickOffCalendarSync, kickOffZoomSync } from '@/lib/calendarZoomConnect';

type SortMode = 'grouped' | 'byProject';

// ── Seed data helper ─────────────────────────────────────────────────────────
// Creates demo items so the page is not empty on first load

async function seedDemoItems(userId: string, tags: { id: string; name: string }[]) {
  const existing = await supabase.from('inbox_items').select('id').eq('user_id', userId).limit(1);
  if (existing.data && existing.data.length > 0) return;

  const demoItems: Array<{ type: InboxItemType; text: string; tagNames: string[] }> = [];

  for (const item of demoItems) {
    const { data: inserted } = await supabase
      .from('inbox_items')
      .insert({
        user_id: userId,
        type: item.type,
        text: item.text,
        agent_payload: (item.type === 'agent_question'
          ? { action_required: true, cta_label: 'Review', rationale: 'Auto-generated from daily brief' }
          : null) as Json,
      })
      .select('id')
      .single();

    if (inserted && item.tagNames.length > 0) {
      const matchedTags = item.tagNames
        .map(n => tags.find(t => t.name === n))
        .filter((t): t is { id: string; name: string } => Boolean(t));
      if (matchedTags.length > 0) {
        await supabase.from('inbox_item_tags').insert(
          matchedTags.map(t => ({ item_id: inserted.id, tag_id: t.id }))
        );
      }
    }
  }
}

async function seedDemoTags(userId: string) {
  const existing = await supabase.from('inbox_tags').select('id').eq('user_id', userId).limit(1);
  // Return undefined (not []) so the caller's `seededTags ?? tags` falls back to
  // the already-loaded tags and still seeds demo items against them.
  if (existing.data && existing.data.length > 0) return;

  const tagDefs = [
    { name: 'ASAP',        type: 'urgency',  color: '#ef4444', sort_order: 0 },
    { name: 'Later',       type: 'urgency',  color: '#f59e0b', sort_order: 1 },
    { name: 'This week',   type: 'folder',   color: '#14b8a6', sort_order: 0 },
    { name: 'Follow-ups',  type: 'folder',   color: '#f97316', sort_order: 1 },
  ];

  const { data } = await supabase.from('inbox_tags')
    .insert(tagDefs.map(t => ({ ...t, user_id: userId })))
    .select();

  return data ?? [];
}

// ── Label helpers ─────────────────────────────────────────────────────────────

const VIEW_LABELS: Record<string, string> = {
  all:     'All',
  asap:    'Do Now',
  waiting: 'Waiting on me',
  archive: 'Archive',
};

function filterLabel(filter: InboxFilterState, tags: { id: string; name: string }[]) {
  if (filter.builtIn) return VIEW_LABELS[filter.builtIn] ?? 'All';
  if (filter.tagIds?.length === 1) {
    return tags.find(t => t.id === filter.tagIds![0])?.name ?? 'Filtered';
  }
  return 'Filtered';
}

// ── Empty states ───────────────────────────────────────────────────────────────
// Each view gets its own icon/copy so an empty list reads as "you're caught up"
// rather than "something's broken" — tailored to what would actually fill it.

interface EmptyStateContent {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  /** Optional brand illustration shown instead of the plain icon+circle treatment. */
  illustration?: ComponentType<{ className?: string }>;
}

function emptyStateFor(filter: InboxFilterState, tags: InboxTag[]): EmptyStateContent {
  if (filter.tagIds?.length === 1) {
    const tag = tags.find(t => t.id === filter.tagIds![0]);
    if (tag?.type === 'person') {
      return {
        icon: User,
        title: `Nothing tied to ${tag.name}`,
        subtitle: 'Tag a task or note with them, or check back after your next 1:1.',
      };
    }
    if (tag?.type === 'folder') {
      return {
        icon: FolderOpen,
        title: `${tag.name} is empty`,
        subtitle: 'Move items here from the sidebar, or add a new one below.',
      };
    }
    if (tag) {
      return {
        icon: Hash,
        title: `No items in ${tag.name}`,
        subtitle: 'Tag a task or note with this project to see it here.',
      };
    }
  }
  if (filter.tagIds && filter.tagIds.length > 1) {
    return {
      icon: AlignJustify,
      title: 'Nothing matches this filter',
      subtitle: 'Try a different combination of tags.',
    };
  }
  switch (filter.builtIn) {
    case 'asap':
      return {
        icon: Zap,
        title: 'Nothing urgent',
        subtitle: 'Items marked Do Now will show up here.',
      };
    case 'waiting':
      return {
        icon: Clock,
        title: 'Nothing waiting on you',
        subtitle: 'Items marked Waiting on someone will show up here.',
      };
    case 'archive':
      return {
        icon: ArchiveIcon,
        title: 'Nothing archived yet',
        subtitle: 'Items you archive will land here.',
      };
    default:
      return {
        icon: InboxIcon,
        illustration: AccountabilityIllustration,
        title: 'This is where accountability lives',
        subtitle: "Record a conversation and we'll surface commitments and follow-ups here automatically — so nothing falls through the cracks.",
      };
  }
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function InboxPage() {
  const navigate = useNavigate();
  const location = useLocation();
  // Derived from the URL so navigating between /inbox and /inbox/meetings always
  // switches the middle view — InboxPage stays mounted across those routes, so a
  // one-time useState initializer would go stale and leave the wrong panel showing.
  const activePanel: 'inbox' | 'meetings' =
    location.pathname.startsWith('/inbox/meetings') ? 'meetings' : 'inbox';
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | undefined>(undefined);
  const [seeded, setSeeded] = useState(false);
  const [filter, setFilter] = useState<InboxFilterState>({ builtIn: 'all' });
  const [lastAddedId, setLastAddedId] = useState<string | null>(null);
  const [meetingsSearch, setMeetingsSearch] = useState('');
  const [meetingsSyncInfo, setMeetingsSyncInfo] = useState<MeetingsSyncInfo | undefined>(undefined);
  const [selectedMeetingEvent, setSelectedMeetingEvent] = useState<UpcomingOneOnOneEvent | null>(null);
  const [meetingDetailTab, setMeetingDetailTab] = useState<MeetingDetailTab>('prep');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [delegateOpen, setDelegateOpen] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('byProject');
  const [prioritizeMode, setPrioritizeMode] = useState(false);
  const [drawerItem, setDrawerItem] = useState<InboxItem | null>(null);
  const [editingProjectTag, setEditingProjectTag] = useState<import('@/types/inbox').InboxTag | null>(null);
  const openDrawer = useCallback((item: import('@/types/inbox').InboxItem) => { setDrawerItem(item); setEditingProjectTag(null); }, []);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isDesktop = useIsDesktop();
  const isMobile = useIsMobile();
  const isTouch = useIsTouch();
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUserId(data.user.id);
        setUserName(data.user.user_metadata?.full_name ?? data.user.email?.split('@')[0]);
      }
    });
  }, []);

  const { tags, loading: tagsLoading, createTag, createWorkstream, renameTag, updateTag, saveTagSettings, deleteTag, getOrCreate, reload: reloadTags } = useInboxTags(userId);
  const teamMembers = useTeamMembers(userId);

  // ── Post-connect sync + simple progress log ───────────────────────────────
  // Shown in the empty middle list area while a calendar/Zoom connection just
  // triggered from the Assistant chat is syncing and analyzing recent
  // meetings — see handleConnectOAuthCallback below.
  const [syncing, setSyncing] = useState(false);
  const [syncLog, setSyncLog] = useState<string[]>([]);
  const didSyncOAuthRef = useRef(false);

  const pushSyncLog = useCallback((line: string) => {
    setSyncLog(prev => [...prev, line]);
  }, []);

  // Analyzes up to a week's worth of newly-synced Zoom transcripts one at a
  // time — real per-meeting counts via generate-meeting-suggestions'
  // transcript_id param, not a fake progress bar. Idempotent: already-
  // analyzed transcripts (suggestions_extracted_at set) are skipped, so
  // re-running this doesn't reprocess the same meetings.
  const analyzeRecentTranscripts = useCallback(async () => {
    const { data: transcripts } = await supabase
      .from('cos_zoom_transcripts')
      .select('id, recording_id')
      .is('suggestions_extracted_at', null)
      .order('fetched_at', { ascending: false });
    if (!transcripts || transcripts.length === 0) return;

    const recordingIds = transcripts.map(t => t.recording_id);
    const { data: recordings } = await supabase
      .from('cos_zoom_recordings')
      .select('id, topic')
      .in('id', recordingIds);
    const topicById = new Map((recordings ?? []).map(r => [r.id, r.topic ?? 'Untitled meeting']));

    for (const t of transcripts) {
      const topic = topicById.get(t.recording_id) ?? 'Untitled meeting';
      pushSyncLog(`Analyzing ${topic}`);
      try {
        const { data } = await supabase.functions.invoke('generate-meeting-suggestions', {
          body: { transcript_id: t.id },
        });
        const added = (data as { suggestions_added?: number } | null)?.suggestions_added ?? 0;
        pushSyncLog(`Done analyzing ${topic} → ${added} action item${added === 1 ? '' : 's'} found (will soon be added to your inbox)`);
      } catch (err) {
        pushSyncLog(`Couldn't analyze ${topic} — skipping.`);
      }
    }
  }, [pushSyncLog]);

  useEffect(() => {
    if (!userId || didSyncOAuthRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const isCalendarCallback = params.get('calendar') === 'connected';
    const isZoomCallback = !!code && params.get('state') === 'zoom_connected';
    if (!isCalendarCallback && !isZoomCallback) return;
    didSyncOAuthRef.current = true;
    navigate(location.pathname, { replace: true });

    (async () => {
      setSyncing(true);
      setSyncLog([]);
      try {
        if (isCalendarCallback) {
          pushSyncLog('Connecting to your calendar…');
          const { created = 0, updated = 0 } = await kickOffCalendarSync(7);
          pushSyncLog(`Synced ${created + updated} meeting${created + updated === 1 ? '' : 's'} from your calendar.`);
        }
        if (isZoomCallback) {
          pushSyncLog('Connecting to Zoom…');
          const { transcripts_fetched = 0 } = await kickOffZoomSync(code!, 7);
          pushSyncLog(`Found ${transcripts_fetched} meeting transcript${transcripts_fetched === 1 ? '' : 's'}.`);
        }
        await analyzeRecentTranscripts();
        pushSyncLog('All done — check your inbox for new suggestions.');
        await reloadItems();
        await reloadTags();
      } catch (err) {
        pushSyncLog(`Something went wrong: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setSyncing(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);
  const slackChannelOptions = useSlackChannelOptions(userId);
  const meetingOptions = useMeetingTitleOptions(userId);

  // Seed on first load
  useEffect(() => {
    if (!userId || seeded || tagsLoading) return;
    (async () => {
      const seededTags = await seedDemoTags(userId);
      const allTags = seededTags ?? tags;
      if (allTags.length > 0) {
        await seedDemoItems(userId, allTags);
        await reloadTags();
      }
      setSeeded(true);
    })();
  }, [userId, seeded, tagsLoading, tags, reloadTags]);

  // Counts for sidebar badges — fetch "all open" for aggregation. Created first so
  // its setter can be passed as a mirror to the main list below: every mutation on
  // `items` replays the same patch here, keeping counts in sync with no extra
  // network round trip.
  const allFilter = useMemo<InboxFilterState>(() => ({ builtIn: 'all' }), []);
  const { items: allItems, loading: allItemsLoading, applyExternalPatch: mirrorToAllItems } = useInboxItems(userId, allFilter);
  // Drives the assistant panel's default greeting: a returning-user "what's up
  // next" framing doesn't fit someone who has never had an inbox item.
  const isNewUser = !allItemsLoading && allItems.length === 0;

  const { items, loading: itemsLoading, addItem, updateItem, markDone, archive, deleteItem, addTagToItem, removeTagFromItem, cycleWorkflowStatus, syncBriefItem, pinItem, acceptSuggestion, dismissSuggestion, reload: reloadItems } = useInboxItems(userId, filter, mirrorToAllItems);

  // Sync daily brief → brief_item in inbox (once per brief load)
  const { brief } = useDciBrief();
  const syncedBriefDate = useRef<string | null>(null);
  useEffect(() => {
    if (!brief || brief.source === 'none' || !userId) return;
    const today = format(new Date(), 'yyyy-MM-dd');
    if (syncedBriefDate.current === today) return;
    syncedBriefDate.current = today;

    const priorities: BriefPriority[] = brief.dailyPriorities.slice(0, 5).map(p => ({
      text: p.text,
      source: p.source,
      reasoning: p.reasoning,
      origin: (p as { origin?: BriefPriority['origin'] }).origin ?? 'brief',
      action: p.action,
    }));

    const count = brief.dailyPriorities.length;
    const dayLabel = format(new Date(), 'EEEE, MMMM do');
    const summaryText = `Daily brief · ${count} priorit${count === 1 ? 'y' : 'ies'} for ${dayLabel}`;
    syncBriefItem(today, priorities, summaryText);
  }, [brief, userId, syncBriefItem]);

  // Sync Monday's weekly priorities → a separate brief_item in inbox (once per week)
  const syncedWeeklyDate = useRef<string | null>(null);
  useEffect(() => {
    if (!brief || brief.source === 'none' || !userId) return;
    if (!brief.isMonday || brief.weeklyPriorities.length === 0) return;
    const mondayDate = brief.weeklySourceDate ?? format(new Date(), 'yyyy-MM-dd');
    if (syncedWeeklyDate.current === mondayDate) return;
    syncedWeeklyDate.current = mondayDate;

    const priorities: BriefPriority[] = brief.weeklyPriorities.slice(0, 5).map(p => ({
      text: p.text,
      source: p.source,
      reasoning: p.reasoning,
      origin: (p as { origin?: BriefPriority['origin'] }).origin ?? 'brief',
      action: p.action,
    }));

    const monday = parseLocalDate(mondayDate);
    const friday = addDays(monday, 4);
    const summaryText = `Weekly Priorities for the week of Monday, ${format(monday, 'MMMM d')} to Friday, ${format(friday, 'MMMM d')}`;
    syncBriefItem(mondayDate, priorities, summaryText, 'weekly');
  }, [brief, userId, syncBriefItem]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0, asap: 0, waiting: 0, archive: 0 };
    for (const item of allItems) {
      c['all']++;
      if (item.workflow_status === 'Do Now') c['asap']++;
      if (item.type === 'agent_question' && item.agent_payload?.action_required) c['waiting']++;
      for (const tag of item.tags ?? []) {
        c[tag.id] = (c[tag.id] ?? 0) + 1;
      }
    }
    return c;
  }, [allItems]);

  const handleSubmit = useCallback(async (text: string, type: InboxItemType, tagIds: string[]) => {
    const item = await addItem(text, type, tagIds);
    if (item?.id) {
      // The active filter may hide what was just added (e.g. viewing "Do Now"
      // and adding a plain task) — switch to "All" so the add is never invisible.
      const visibleUnderCurrentFilter =
        filter.builtIn === 'asap' ? item.workflow_status === 'Do Now' :
        filter.builtIn === 'waiting' ? item.type === 'agent_question' && Boolean(item.agent_payload?.action_required) :
        filter.tagIds?.length ? filter.tagIds.every(tid => tagIds.includes(tid)) :
        true;
      if (!visibleUnderCurrentFilter) setFilter(allFilter);

      setLastAddedId(item.id);
      setTimeout(() => setLastAddedId(null), 2000);

      // Fire tag suggestion agent async — only when item has no tags already
      if (tagIds.length === 0 && userId) {
        supabase.functions.invoke('suggest-inbox-tags', {
          body: { item_id: item.id, user_id: userId },
        }).then(() => reloadItems());
      }
    }
  }, [addItem, userId, reloadItems, filter, allFilter]);

  const handleCreateTag = useCallback(async (name: string, type: 'project' | 'person', color: string) => {
    return getOrCreate(name, type, color);
  }, [getOrCreate]);

  const handleQuickCreateTag = useCallback(async (name: string, type: 'project' | 'folder') => {
    const color = TAG_COLORS[tags.length % TAG_COLORS.length];
    return createTag(name, type, color);
  }, [createTag, tags.length]);

  const handleCreatePersonTag = useCallback(async (member: { id: string; name: string }) => {
    const color = TAG_COLORS[tags.length % TAG_COLORS.length];
    return getOrCreate(member.name, 'person', color, member.id);
  }, [getOrCreate, tags.length]);

  // Materialize the assistant's proposed setup items into a real "Onboarding"
  // project, ending with a deterministic (client-appended, not model-generated)
  // "Delete onboarding project" item — see handleItemDone for the cleanup side.
  const handleMaterializeOnboarding = useCallback(async (proposedItems: { text: string }[]) => {
    const color = TAG_COLORS[tags.length % TAG_COLORS.length];
    const onboardingTag = await getOrCreate('Onboarding', 'project', color);
    if (!onboardingTag) return;
    for (const proposed of proposedItems) {
      await addItem(proposed.text, 'task', [onboardingTag.id]);
    }
    await addItem('Delete onboarding project', 'task', [onboardingTag.id], {
      agent_payload: { cta_action: 'delete_onboarding_project' },
    });
  }, [tags.length, getOrCreate, addItem]);

  const handleItemDone = useCallback(async (id: string, done: boolean) => {
    const item = allItems.find(i => i.id === id);
    const isSelfDestruct = done && item?.agent_payload?.cta_action === 'delete_onboarding_project';
    await markDone(id, done);
    if (!isSelfDestruct) return;
    try {
      const onboardingTag = item?.tags?.find(t => t.type === 'project');
      if (!onboardingTag) return;
      const siblingIds = allItems
        .filter(i => i.id !== id && i.tags?.some(t => t.id === onboardingTag.id))
        .map(i => i.id);
      await Promise.all(siblingIds.map(sid => deleteItem(sid)));
      await deleteItem(id);
      await deleteTag(onboardingTag.id);
      await reloadTags();
    } catch (err) {
      console.error('Failed to clean up onboarding project', err);
    }
  }, [allItems, markDone, deleteItem, deleteTag, reloadTags]);

  const handleAssistantMutated = useCallback(() => {
    void reloadItems();
    void reloadTags();
  }, [reloadItems, reloadTags]);

  const pinnedProjectIds = useMemo(() =>
    new Set(tags.filter(t => t.type === 'project' && t.settings?.pinned).map(t => t.id)),
  [tags]);

  // For date/grouped views: weekly priorities and daily check-ins float first,
  // then items with pending suggestions, then pinned-project items
  const sortedItems = useMemo(() => {
    const base = sortMode === 'byProject' ? items : [...items].sort((a, b) => {
      const aPinned = isAutoPinnedItem(a) ? 1 : 0;
      const bPinned = isAutoPinnedItem(b) ? 1 : 0;
      if (bPinned !== aPinned) return bPinned - aPinned;
      const aSug = (a.tag_suggestions?.length ?? 0) > 0 ? 2 : 0;
      const bSug = (b.tag_suggestions?.length ?? 0) > 0 ? 2 : 0;
      if (bSug !== aSug) return bSug - aSug;
      const aFloat = a.tags?.some(t => pinnedProjectIds.has(t.id)) ? 1 : 0;
      const bFloat = b.tags?.some(t => pinnedProjectIds.has(t.id)) ? 1 : 0;
      return bFloat - aFloat;
    });
    // Prioritize mode ranks by the informal due date (soonest first), regardless
    // of the sort mode underneath — items without one yet sort to the end.
    // Weekly priorities and daily check-ins stay pinned to the top even here.
    if (!prioritizeMode) return base;
    return [...base].sort((a, b) => {
      const aPinned = isAutoPinnedItem(a) ? 1 : 0;
      const bPinned = isAutoPinnedItem(b) ? 1 : 0;
      if (bPinned !== aPinned) return bPinned - aPinned;
      const aDue = a.priority_due_at ? new Date(a.priority_due_at).getTime() : Infinity;
      const bDue = b.priority_due_at ? new Date(b.priority_due_at).getTime() : Infinity;
      return aDue - bDue;
    });
  }, [items, pinnedProjectIds, sortMode, prioritizeMode]);

  const handleTogglePin = useCallback(async (tag: import('@/types/inbox').InboxTag) => {
    const next = { ...(tag.settings ?? {}), pinned: !tag.settings?.pinned };
    await saveTagSettings(tag.id, next, tag.name);
  }, [saveTagSettings]);

  const handleConvertFolderToProject = useCallback(async (tagId: string) => {
    const projectTags = tags.filter(t => t.type === 'project');
    const updates = planTagGroupReindex(projectTags, tagId, projectTags.length, 'project');
    await Promise.all(updates.map(u => updateTag(u.id, u.patch)));
    await reloadTags();
    setEditingProjectTag(prev => (prev && prev.id === tagId ? { ...prev, type: 'project', parent_id: null } : prev));
  }, [tags, updateTag, reloadTags]);

  // Move a project/folder to a new 1-based position within its own group — the
  // same reindex math the sidebar's drag-and-drop and position badge use.
  const handleSetTagPosition = useCallback(async (
    tagId: string,
    groupType: 'folder' | 'project',
    newPosition: number,
  ) => {
    const group = tags.filter(t => t.type === groupType);
    const index = Math.max(0, Math.min(Math.trunc(newPosition) - 1, group.length - 1));
    const updates = planTagGroupReindex(group, tagId, index, groupType);
    await Promise.all(updates.map(u => updateTag(u.id, u.patch)));
  }, [tags, updateTag]);

  const handleSelect = useCallback((id: string, sel: boolean) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (sel) next.add(id); else next.delete(id);
      return next;
    });
  }, []);

  const handleBulkPin = useCallback(async () => {
    const anyUnpinned = items.filter(i => selected.has(i.id)).some(i => !i.pinned);
    for (const id of selected) await pinItem(id, anyUnpinned);
    setSelected(new Set());
  }, [selected, items, pinItem]);

  const handleBulkArchive = useCallback(async () => {
    for (const id of selected) await archive(id);
    setSelected(new Set());
  }, [selected, archive]);

  const handleDelegateToAssistant = useCallback(async () => {
    if (!userId) return;
    const { data: { session } } = await supabase.auth.getSession();
    for (const itemId of selected) {
      fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delegate-inbox-task`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ action: 'start', item_id: itemId, user_id: userId }),
      });
    }
    setSelected(new Set());
    setDelegateOpen(false);
  }, [selected, userId]);

  const handleMoveBucket = useCallback(async (itemId: string, bucket: InboxBucket) => {
    await supabase
      .from('inbox_items')
      .update({ bucket, updated_at: new Date().toISOString() })
      .eq('id', itemId);
    // Optimistic update via updateItem
    updateItem(itemId, { bucket });
  }, [updateItem]);

  const title = filterLabel(filter, tags);
  const emptyState = useMemo(() => emptyStateFor(filter, tags), [filter, tags]);

  // The person tag selected in the sidebar's People section, if the current
  // filter is scoped to exactly one such tag — drives the assistant panel's
  // person context widget (accountabilities + discussion topics).
  const selectedPersonTag = useMemo(() => {
    if (filter.tagIds?.length !== 1) return null;
    const tag = tags.find(t => t.id === filter.tagIds![0]);
    return tag?.type === 'person' ? tag : null;
  }, [filter, tags]);

  const applyFilter = useCallback((f: InboxFilterState) => {
    setFilter(f);
    setSelected(new Set());
    setSidebarOpen(false);
  }, []);

  return (
    <div className="flex h-full overflow-hidden bg-gray-100/80 gap-3 p-2 relative">
      {/* Sidebar — persistent column on desktop, slide-in Sheet below lg */}
      {isDesktop ? (
        selectedMeetingEvent ? (
          <MeetingDetailSidebarNav
            event={selectedMeetingEvent}
            activeTab={meetingDetailTab}
            onTabChange={setMeetingDetailTab}
            onBack={() => { setSelectedMeetingEvent(null); setMeetingDetailTab('prep'); }}
          />
        ) : (
        <InboxSidebar
          tags={tags}
          counts={counts}
          filter={filter}
          onFilterChange={applyFilter}
          onRenameTag={renameTag}
          onCreateWorkstream={createWorkstream}
          onUpdateTag={updateTag}
          onEditProject={tag => { setEditingProjectTag(tag); setDrawerItem(null); }} onTogglePin={handleTogglePin}
          meetingsSearch={meetingsSearch}
          onMeetingsSearchChange={setMeetingsSearch}
          meetingsSyncInfo={meetingsSyncInfo}
        />
        )
      ) : (
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="left" className="w-[280px] p-0 gap-0">
            <SheetTitle className="sr-only">Inbox navigation</SheetTitle>
            <InboxSidebar
              bare
              tags={tags}
              counts={counts}
              filter={filter}
              onFilterChange={applyFilter}
              onRenameTag={renameTag}
              onCreateWorkstream={createWorkstream}
              onUpdateTag={updateTag}
              onEditProject={tag => { setEditingProjectTag(tag); setDrawerItem(null); setSidebarOpen(false); }} onTogglePin={handleTogglePin}
              meetingsSearch={meetingsSearch}
              onMeetingsSearchChange={setMeetingsSearch}
              meetingsSyncInfo={meetingsSyncInfo}
            />
          </SheetContent>
        </Sheet>
      )}

      {/* Main stream + drawer */}
      <div className="flex-1 flex min-w-0 overflow-hidden gap-3">
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden gap-2">
      <WeekendBanner bare />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white rounded-xl shadow-sm border border-gray-200/80">
        {/* Top bar */}
        <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 border-b border-gray-200 flex-shrink-0">
          {/* Hamburger — opens sidebar sheet below lg */}
          {!isDesktop && (
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation"
              className={cn(
                'flex-shrink-0 flex items-center justify-center rounded text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors',
                isTouch ? 'h-9 w-9 -ml-1.5' : 'p-1.5',
              )}
            >
              <Menu className="h-5 w-5" />
            </button>
          )}

          <h1 className="font-semibold text-gray-900 text-sm truncate">
            {activePanel === 'meetings' ? 'Meetings' : title}
          </h1>
          {activePanel === 'inbox' && !itemsLoading && (
            <span className="text-xs text-gray-400 flex-shrink-0">{items.length} item{items.length !== 1 ? 's' : ''}</span>
          )}

          <div className="flex-1" />

          {activePanel === 'inbox' && (
            <>
          {/* Sort / group toggle — labels collapse to icons below lg */}
          <div className="flex-shrink-0 flex items-center rounded border border-gray-200 overflow-hidden text-xs">
            <button
              onClick={() => setSortMode('byProject')}
              title="By Project"
              className={cn(
                'flex items-center gap-1.5 transition-colors',
                isTouch ? 'px-3 py-2' : 'px-2.5 py-1',
                sortMode === 'byProject'
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50',
              )}
            >
              <LayoutList className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">By Project</span>
            </button>
            <button
              onClick={() => setSortMode('grouped')}
              title="Now / Next / Later"
              className={cn(
                'flex items-center gap-1.5 transition-colors border-l border-gray-200',
                isTouch ? 'px-3 py-2' : 'px-2.5 py-1',
                sortMode === 'grouped'
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50',
              )}
            >
              <Layers className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Now / Next / Later</span>
            </button>
          </div>

          {/* Prioritize toggle — reveals per-row tier pills and ranks by informal due date */}
          <button
            onClick={() => setPrioritizeMode(m => !m)}
            title="Prioritize"
            className={cn(
              'flex-shrink-0 flex items-center gap-1.5 rounded border text-xs transition-colors',
              isTouch ? 'px-3 py-2' : 'px-2.5 py-1',
              prioritizeMode
                ? 'bg-gray-900 text-white border-gray-900'
                : 'text-gray-500 border-gray-200 hover:text-gray-800 hover:bg-gray-50',
            )}
          >
            <Flame className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Prioritize</span>
          </button>

          {/* Settings */}
          <button
            aria-label="Settings"
            className={cn(
              'hidden sm:flex flex-shrink-0 items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors',
              isTouch ? 'h-9 w-9' : 'p-1.5',
            )}
          >
            <Settings className="h-4 w-4" />
          </button>
            </>
          )}
        </div>

        {activePanel === 'meetings' && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <InboxMeetingsView
              search={meetingsSearch}
              onSyncInfoChange={setMeetingsSyncInfo}
              selectedEvent={selectedMeetingEvent}
              onSelectEvent={e => { setSelectedMeetingEvent(e); if (e) setMeetingDetailTab('prep'); }}
              activeTab={meetingDetailTab}
              onTabChange={setMeetingDetailTab}
            />
          </div>
        )}

        {/* Bulk action bar — wraps to multiple rows when it can't fit */}
        {activePanel === 'inbox' && selected.size > 0 && (
          <div className="relative flex flex-wrap items-center gap-1 gap-y-1.5 px-3 sm:px-4 py-2 bg-gray-900 text-white flex-shrink-0">
            <span className="text-xs text-gray-400 mr-2 flex-shrink-0">{selected.size} selected</span>

            {/* Archive */}
            <button
              onClick={handleBulkArchive}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded text-sm text-gray-200 hover:bg-white/10 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />Archive
            </button>

            {/* Delegate — with dropdown */}
            <div className="relative flex-shrink-0">
              <button
                onClick={() => setDelegateOpen(o => !o)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded text-sm transition-colors',
                  delegateOpen ? 'bg-white/20 text-white' : 'text-gray-200 hover:bg-white/10',
                )}
              >
                <Bot className="h-3.5 w-3.5" />Delegate
              </button>
              {delegateOpen && userId && (
                <DelegateDropdown
                  userId={userId}
                  onSelect={(target) => {
                    if (target.type === 'assistant') handleDelegateToAssistant();
                    else setDelegateOpen(false); // person delegation — future
                  }}
                  onClose={() => setDelegateOpen(false)}
                />
              )}
            </div>

            {[
              { label: 'Pin', icon: <Pin className="h-3.5 w-3.5" />, onClick: handleBulkPin },
            ].map(({ label, icon, onClick }) => (
              <button
                key={label}
                onClick={onClick}
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded text-sm text-gray-200 hover:bg-white/10 transition-colors"
              >
                {icon}{label}
              </button>
            ))}

            <button
              onClick={() => { setSelected(new Set()); setDelegateOpen(false); }}
              className="ml-auto flex-shrink-0 p-1.5 rounded text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Item list — extra bottom room on mobile for the fixed composer bar */}
        {activePanel === 'inbox' && <div className={cn('flex-1 min-h-0 overflow-y-auto', isMobile && 'pb-36')}>
          {userId && (
            <InboxSuggestionsPanel
              userId={userId}
              members={teamMembers.map(m => ({ id: m.id, name: m.name }))}
              tags={tags}
              onAddItem={handleSubmit}
              scopeTagIds={filter.tagIds}
              teamMembers={teamMembers}
              onCreateTag={handleQuickCreateTag}
              onCreatePersonTag={handleCreatePersonTag}
            />
          )}
          {syncing ? (
            <div className="flex flex-col items-center justify-center h-56 gap-3 px-6 text-center">
              <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
              <div className="space-y-1 max-w-sm">
                {syncLog.map((line, i) => (
                  <p
                    key={i}
                    className={cn(
                      'text-xs',
                      i === syncLog.length - 1 ? 'text-gray-700 font-medium' : 'text-gray-400',
                    )}
                  >
                    {line}
                  </p>
                ))}
              </div>
            </div>
          ) : itemsLoading ? (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Loading…</div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-56 gap-2 px-6 text-center">
              {emptyState.illustration ? (
                <emptyState.illustration className="h-24 w-auto mb-1" />
              ) : (
                <div className="h-11 w-11 rounded-full bg-gray-100 flex items-center justify-center mb-1">
                  <emptyState.icon className="h-5 w-5 text-gray-400" />
                </div>
              )}
              <p className="text-sm font-medium text-gray-600">{emptyState.title}</p>
              <p className="text-xs text-gray-400 max-w-[240px]">{emptyState.subtitle}</p>
            </div>
          ) : sortMode === 'grouped' ? (
            <InboxGroupedView
              items={sortedItems}
              allTags={tags}
              onDone={handleItemDone}
              onArchive={archive}
              onDelete={deleteItem}
              onRemoveTag={removeTagFromItem}
              onAddTag={addTagToItem}
              onCycleWorkflowStatus={cycleWorkflowStatus}
              onCreateWorkstream={createWorkstream}
              onQuickCreateTag={handleQuickCreateTag}
              teamMembers={teamMembers}
              onCreatePersonTag={handleCreatePersonTag}
              onUpdateItem={updateItem}
              onMoveBucket={handleMoveBucket}
              onOpenDrawer={openDrawer}
              onAcceptSuggestion={(it, s) => acceptSuggestion(it.id, s)}
              onDismissSuggestion={dismissSuggestion}
              selectedIds={selected}
              onSelect={handleSelect}
              prioritizeMode={prioritizeMode}
              newItemId={lastAddedId}
            />
          ) : (
            <InboxByProjectView
              items={sortedItems}
              allTags={tags}
              onDone={handleItemDone}
              onArchive={archive}
              onDelete={deleteItem}
              onRemoveTag={removeTagFromItem}
              onAddTag={addTagToItem}
              onCycleWorkflowStatus={cycleWorkflowStatus}
              onCreateWorkstream={createWorkstream}
              onQuickCreateTag={handleQuickCreateTag}
              teamMembers={teamMembers}
              onCreatePersonTag={handleCreatePersonTag}
              onUpdateItem={updateItem}
              onOpenDrawer={openDrawer}
              onAcceptSuggestion={(it, s) => acceptSuggestion(it.id, s)}
              onDismissSuggestion={dismissSuggestion}
              selectedIds={selected}
              onSelect={handleSelect}
              prioritizeMode={prioritizeMode}
              newItemId={lastAddedId}
            />
          )}
        </div>}

      </div>
      </div>

      {/* Right assistant panel — always visible */}
      <InboxAssistantPanel
        item={drawerItem}
        allTags={tags}
        userName={userName}
        onClose={() => setDrawerItem(null)}
        onCycleWorkflowStatus={cycleWorkflowStatus}
        onRemoveTag={removeTagFromItem}
        onAddTag={addTagToItem}
        onCreateWorkstream={createWorkstream}
        onUpdateItem={updateItem}
        onAddItem={handleSubmit}
        onCreateTag={handleCreateTag}
        projectTag={editingProjectTag}
        onCloseProject={() => setEditingProjectTag(null)}
        onSaveProjectSettings={saveTagSettings}
        onDeleteProjectTag={async (id) => { await deleteTag(id); setEditingProjectTag(null); await reloadTags(); }}
        onConvertFolderToProject={handleConvertFolderToProject}
        onSetTagPosition={handleSetTagPosition}
        stakeholderOptions={teamMembers.map(m => m.name)}
        slackChannelOptions={slackChannelOptions}
        meetingOptions={meetingOptions}
        meetingEvent={selectedMeetingEvent}
        selectedPersonTag={selectedPersonTag}
        userId={userId}
        isNewUser={isNewUser}
        onMaterializeOnboarding={handleMaterializeOnboarding}
        onMutated={handleAssistantMutated}
      />
      </div>
    </div>
  );
}
