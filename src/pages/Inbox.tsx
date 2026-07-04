import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { format } from 'date-fns';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Settings, CheckSquare2, AlignJustify, Layers, LayoutList, Bot, Trash2, Copy, Zap, X, Pin, Menu } from 'lucide-react';
import { InboxMeetingsView } from '@/components/inbox/InboxMeetingsView';
import { cn } from '@/lib/utils';
import { useIsDesktop, useIsMobile, useIsTouch } from '@/hooks/use-breakpoint';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { InboxSidebar, type MeetingsSyncInfo } from '@/components/inbox/InboxSidebar';
import { InboxItemRow } from '@/components/inbox/InboxItemRow';
import { InboxGroupedView } from '@/components/inbox/InboxGroupedView';
import { InboxByProjectView } from '@/components/inbox/InboxByProjectView';
import { DelegateDropdown } from '@/components/inbox/DelegateDropdown';
import { InboxAssistantPanel } from '@/components/inbox/InboxAssistantPanel';
import { useInboxItems } from '@/hooks/useInboxItems';
import { useInboxTags } from '@/hooks/useInboxTags';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useDciBrief } from '@/hooks/useDciAiSuggestions';
import type { Json } from '@/integrations/supabase/types';
import type { InboxFilterState, InboxItem, InboxItemType, InboxBucket, BriefPriority } from '@/types/inbox';
import { TAG_COLORS } from '@/types/inbox';

type SortMode = 'date' | 'grouped' | 'byProject';

// ── Seed data helper ─────────────────────────────────────────────────────────
// Creates demo items so the page is not empty on first load

async function seedDemoItems(userId: string, tags: { id: string; name: string }[]) {
  const existing = await supabase.from('inbox_items').select('id').eq('user_id', userId).limit(1);
  if (existing.data && existing.data.length > 0) return;

  const asapTag = tags.find(t => t.name === 'ASAP');
  const danTag = tags.find(t => t.name === 'Dan Pope');
  const chrTag = tags.find(t => t.name === 'Chrysalis');
  const naTag = tags.find(t => t.name === 'New Altitude');
  const rookTag = tags.find(t => t.name === 'Rook');

  const demoItems: Array<{ type: InboxItemType; text: string; tagNames: string[] }> = [
    { type: 'agent_question', text: 'Daily brief: 2 items overdue. Agent question waiting.', tagNames: [] },
    { type: 'task',           text: 'Send updated timeline to the Chrysalis stakeholders', tagNames: ['Chrysalis'] },
    { type: 'task',           text: 'Follow up with Dan on the delayed vendor invoice', tagNames: ['Dan Pope'] },
    { type: 'note',           text: 'Weekly leadership brief: hiring pipeline is 2 weeks behind plan', tagNames: ['New Altitude'] },
    { type: 'meeting_insight',text: 'Customer call recap: they want SSO before renewal', tagNames: ['Chrysalis'] },
    { type: 'note',           text: 'Dan mentioned the vendor contract renewal is due end of month', tagNames: ['Dan Pope'] },
    { type: 'task',           text: 'Prep talking points for the board update', tagNames: ['New Altitude'] },
    { type: 'note',           text: 'New Altitude retro notes: velocity dipped due to onboarding overlap', tagNames: ['New Altitude'] },
    { type: 'task',           text: "Draft agenda for Friday's Rook sync", tagNames: ['Rook'] },
    { type: 'task',           text: 'Tag and file last week\'s postmortem doc', tagNames: [] },
    { type: 'task',           text: 'Confirm Chrysalis demo environment is reset before Thursday', tagNames: ['Chrysalis'] },
    { type: 'note',           text: 'Marcelo: budget approval came through for the Rook contractor', tagNames: ['Rook'] },
  ];

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
    { name: 'Dan Pope',    type: 'person',   color: '#6366f1', sort_order: 0 },
    { name: 'Marcelo Paiva', type: 'person', color: '#8b5cf6', sort_order: 1 },
    { name: 'New Altitude',type: 'project',  color: '#10b981', sort_order: 0 },
    { name: 'Chrysalis',   type: 'project',  color: '#3b82f6', sort_order: 1 },
    { name: 'Rook',        type: 'project',  color: '#ec4899', sort_order: 2 },
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
  asap:    'ASAP',
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
  const [meetingsSearch, setMeetingsSearch] = useState('');
  const [meetingsSyncInfo, setMeetingsSyncInfo] = useState<MeetingsSyncInfo | undefined>(undefined);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [delegateOpen, setDelegateOpen] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('date');
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

  const { items, loading: itemsLoading, addItem, updateItem, markDone, archive, deleteItem, addTagToItem, removeTagFromItem, cycleWorkflowStatus, syncBriefItem, pinItem, acceptSuggestion, dismissSuggestion, reload: reloadItems } = useInboxItems(userId, filter);

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
    const summaryText = `Daily brief · ${count} priorit${count === 1 ? 'y' : 'ies'} for today`;
    syncBriefItem(today, priorities, summaryText);
  }, [brief, userId, syncBriefItem]);

  // Counts for sidebar badges — fetch "all open" for aggregation
  const allFilter = useMemo<InboxFilterState>(() => ({ builtIn: 'all' }), []);
  const { items: allItems, reload: reloadAllItems } = useInboxItems(userId, allFilter);

  // Keep counts in sync after mutations (mark done, archive, delete all remove items
  // from `items` optimistically but allItems is a separate hook instance)
  useEffect(() => {
    if (userId) reloadAllItems();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, userId]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0, asap: 0, waiting: 0, archive: 0 };
    for (const item of allItems) {
      c['all']++;
      if (item.tags?.some(t => t.name.toLowerCase() === 'asap')) c['asap']++;
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
      setLastAddedId(item.id);
      setTimeout(() => setLastAddedId(null), 2000);
      // Fire tag suggestion agent async — only when item has no tags already
      if (tagIds.length === 0 && userId) {
        supabase.functions.invoke('suggest-inbox-tags', {
          body: { item_id: item.id, user_id: userId },
        }).then(() => reloadItems());
      }
    }
  }, [addItem, userId, reloadItems]);

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

  const pinnedProjectIds = useMemo(() =>
    new Set(tags.filter(t => t.type === 'project' && t.settings?.pinned).map(t => t.id)),
  [tags]);

  // For date/grouped views: items with pending suggestions float first, then pinned-project items
  const sortedItems = useMemo(() => {
    if (sortMode === 'byProject') return items;
    return [...items].sort((a, b) => {
      const aSug = (a.tag_suggestions?.length ?? 0) > 0 ? 2 : 0;
      const bSug = (b.tag_suggestions?.length ?? 0) > 0 ? 2 : 0;
      if (bSug !== aSug) return bSug - aSug;
      const aFloat = a.tags?.some(t => pinnedProjectIds.has(t.id)) ? 1 : 0;
      const bFloat = b.tags?.some(t => pinnedProjectIds.has(t.id)) ? 1 : 0;
      return bFloat - aFloat;
    });
  }, [items, pinnedProjectIds, sortMode]);

  const handleTogglePin = useCallback(async (tag: import('@/types/inbox').InboxTag) => {
    const next = { ...(tag.settings ?? {}), pinned: !tag.settings?.pinned };
    await saveTagSettings(tag.id, next, tag.name);
  }, [saveTagSettings]);

  const handleSelect = useCallback((id: string, sel: boolean) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (sel) next.add(id); else next.delete(id);
      if (next.size === 0) setBulkMode(false);
      else setBulkMode(true);
      return next;
    });
  }, []);

  const handleBulkPin = useCallback(async () => {
    const anyUnpinned = items.filter(i => selected.has(i.id)).some(i => !i.pinned);
    for (const id of selected) await pinItem(id, anyUnpinned);
    setSelected(new Set());
    setBulkMode(false);
  }, [selected, items, pinItem]);

  const handleBulkArchive = useCallback(async () => {
    for (const id of selected) await archive(id);
    setSelected(new Set());
    setBulkMode(false);
  }, [selected, archive]);

  const handleDelegateToAgent = useCallback(async () => {
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
    setBulkMode(false);
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
  const isArchiveView = filter.builtIn === 'archive';

  const applyFilter = useCallback((f: InboxFilterState) => {
    setFilter(f);
    setSelected(new Set());
    setBulkMode(false);
    setSidebarOpen(false);
  }, []);

  return (
    <div className="flex h-full overflow-hidden bg-gray-100/80 gap-3 p-2 relative">
      {/* Sidebar — persistent column on desktop, slide-in Sheet below lg */}
      {isDesktop ? (
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
          {/* Keyboard hint */}
          <span className="hidden lg:block text-[11px] text-gray-400">
            j/k navigate · e archive · t tag · d done
          </span>

          {/* Bulk select toggle */}
          <button
            onClick={() => { setBulkMode(m => !m); setSelected(new Set()); }}
            className={cn(
              'flex-shrink-0 flex items-center justify-center rounded transition-colors',
              isTouch ? 'h-9 w-9' : 'p-1.5',
              bulkMode ? 'bg-gray-900 text-white' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100',
            )}
            title="Select items"
            aria-label="Select items"
          >
            <CheckSquare2 className="h-4 w-4" />
          </button>

          {/* Sort / group toggle — labels collapse to icons below lg */}
          <div className="flex-shrink-0 flex items-center rounded border border-gray-200 overflow-hidden text-xs">
            <button
              onClick={() => setSortMode('date')}
              title="By date"
              className={cn(
                'flex items-center gap-1 transition-colors',
                isTouch ? 'px-3 py-2' : 'px-2.5 py-1',
                sortMode === 'date'
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50',
              )}
            >
              <AlignJustify className="h-3.5 w-3.5 lg:hidden" />
              <span className="hidden lg:inline">By date</span>
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
            <button
              onClick={() => setSortMode('byProject')}
              title="By Project"
              className={cn(
                'flex items-center gap-1.5 transition-colors border-l border-gray-200',
                isTouch ? 'px-3 py-2' : 'px-2.5 py-1',
                sortMode === 'byProject'
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50',
              )}
            >
              <LayoutList className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">By Project</span>
            </button>
          </div>

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
            />
          </div>
        )}

        {/* Bulk action bar — wraps to multiple rows when it can't fit */}
        {activePanel === 'inbox' && bulkMode && selected.size > 0 && (
          <div className="relative flex flex-wrap items-center gap-1 gap-y-1.5 px-3 sm:px-4 py-2 bg-gray-900 text-white flex-shrink-0">
            <span className="text-xs text-gray-400 mr-2 flex-shrink-0">{selected.size} selected</span>

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
                    if (target.type === 'agent') handleDelegateToAgent();
                    else setDelegateOpen(false); // person delegation — future
                  }}
                  onClose={() => setDelegateOpen(false)}
                />
              )}
            </div>

            {[
              { label: 'Pin',         icon: <Pin className="h-3.5 w-3.5" />,    onClick: handleBulkPin },
              { label: 'Archive',     icon: <Trash2 className="h-3.5 w-3.5" />, onClick: handleBulkArchive },
              { label: 'Clone',       icon: <Copy className="h-3.5 w-3.5" />,    onClick: () => {} },
              { label: 'Make Urgent', icon: <Zap className="h-3.5 w-3.5" />,     onClick: () => {} },
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
              onClick={() => { setSelected(new Set()); setBulkMode(false); setDelegateOpen(false); }}
              className="ml-auto flex-shrink-0 p-1.5 rounded text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Item list — extra bottom room on mobile for the fixed composer bar */}
        {activePanel === 'inbox' && <div className={cn('flex-1 min-h-0 overflow-y-auto', isMobile && 'pb-36')}>
          {itemsLoading ? (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Loading…</div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2 text-gray-400">
              <AlignJustify className="h-8 w-8 opacity-30" />
              <p className="text-sm">
                {isArchiveView ? 'Nothing archived yet.' : 'All clear — add a task below.'}
              </p>
            </div>
          ) : sortMode === 'grouped' ? (
            <InboxGroupedView
              items={sortedItems}
              allTags={tags}
              onDone={markDone}
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
            />
          ) : sortMode === 'byProject' ? (
            <InboxByProjectView
              items={sortedItems}
              allTags={tags}
              onDone={markDone}
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
            />
          ) : (
            sortedItems.map(item => (
              <InboxItemRow
                key={item.id}
                item={item}
                allTags={tags}
                onDone={markDone}
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
                isSelected={selected.has(item.id)}
                onSelect={handleSelect}
              />
            ))
          )}
        </div>}

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
      />
      </div>
    </div>
  );
}
