import { useEffect, useState, useCallback } from 'react';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import FancyAvatar from '@/components/ui/fancy-avatar';
import { supabase } from '@/integrations/supabase/client';
import { useSubSIs } from '@/hooks/useSubSIs';
import { useTasksBySI } from '@/hooks/useTasks';
import { useRCDORealtime } from '@/hooks/useRCDORealtime';
import { parseLocalDate } from '@/lib/dateUtils';
import { getFullNameForAvatar } from '@/lib/nameUtils';
import { SITaskTable } from './SITaskTable';
import type { StrategicInitiativeWithRelations } from '@/types/rcdo';

interface OwnerProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  avatar_url: string | null;
  avatar_name: string | null;
}

interface SISubTreeProps {
  parentSiId: string;
  parentNumbering: string;
  parentDefiningObjectiveId: string;
  onEditTask: (taskId: string) => void;
  focusTaskId?: string | null;
}

const STATUS_OPTIONS = [
  { value: 'not_started', label: 'Not Started' },
  { value: 'active', label: 'Active' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Done' },
  { value: 'draft', label: 'Draft' },
];

export function SISubTree({
  parentSiId,
  parentNumbering,
  parentDefiningObjectiveId,
  onEditTask,
  focusTaskId,
}: SISubTreeProps) {
  const { subSIs, loading, refetch, createSubSI } = useSubSIs(parentSiId);
  const [creating, setCreating] = useState(false);
  const [profiles, setProfiles] = useState<OwnerProfile[]>([]);

  // Profiles power the owner Select in each expanded sub-SI. Fetch once at the tree
  // level rather than per row so a sub-SI with five rows doesn't run five identical
  // queries.
  useEffect(() => {
    let cancelled = false;
    supabase
      .from('profiles')
      .select('id, first_name, last_name, full_name, avatar_url, avatar_name')
      .order('first_name', { ascending: true })
      .then(({ data }) => {
        if (!cancelled) setProfiles((data || []) as OwnerProfile[]);
      });
    return () => { cancelled = true; };
  }, []);

  const handleAdd = useCallback(async () => {
    setCreating(true);
    const nextIdx = subSIs.length + 1;
    await createSubSI(parentDefiningObjectiveId, `Sub-initiative ${nextIdx}`);
    setCreating(false);
  }, [subSIs.length, parentDefiningObjectiveId, createSubSI]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(2)].map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {subSIs.length === 0 ? (
        <Card className="p-6 text-center text-sm text-gray-600 dark:text-gray-400">
          No sub-initiatives yet. Add one below to start organizing tasks.
        </Card>
      ) : (
        subSIs.map((subSI, idx) => (
          <SubSIRow
            key={subSI.id}
            subSI={subSI}
            numbering={`${parentNumbering}.${idx + 1}`}
            onEditTask={onEditTask}
            onChanged={refetch}
            startExpanded={focusTaskId == null}
            profiles={profiles}
          />
        ))
      )}

      <div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleAdd}
          disabled={creating}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          {creating ? 'Adding…' : 'Add sub-initiative'}
        </Button>
      </div>
    </div>
  );
}

interface SubSIRowProps {
  subSI: StrategicInitiativeWithRelations;
  numbering: string;
  onEditTask: (taskId: string) => void;
  onChanged: () => void;
  startExpanded?: boolean;
  profiles: OwnerProfile[];
}

function SubSIRow({ subSI, numbering, onEditTask, onChanged, startExpanded = true, profiles }: SubSIRowProps) {
  const [expanded, setExpanded] = useState(startExpanded);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(subSI.title);
  const [editingField, setEditingField] = useState<'start_date' | 'end_date' | 'status' | null>(null);
  const [descriptionDraft, setDescriptionDraft] = useState<string>((subSI.description as string | null) || '');

  // The parent's refetch supplies a fresh `subSI.description`. Keep the local draft in
  // sync when that prop changes (e.g., realtime update from another user) so the
  // textarea doesn't show stale text.
  useEffect(() => {
    setDescriptionDraft((subSI.description as string | null) || '');
  }, [subSI.description]);

  const { tasks, loading: tasksLoading, refetch: refetchTasks } = useTasksBySI(subSI.id);
  const isLocked = !!subSI.locked_at;

  // Without this, sub-SI task edits made elsewhere (another tab, another user) never
  // reach this row — useTasksBySI only fetches on mount. Reusing useRCDORealtime with
  // siId=subSI.id wires the same `rc_tasks` channel the top-level SI page uses, but
  // scoped to this sub-SI.
  useRCDORealtime({
    siId: subSI.id,
    onTasksUpdate: refetchTasks,
  });

  const saveTitle = async () => {
    setEditingTitle(false);
    if (titleDraft.trim() && titleDraft !== subSI.title) {
      await supabase
        .from('rc_strategic_initiatives')
        .update({ title: titleDraft.trim() })
        .eq('id', subSI.id);
      onChanged();
    } else {
      setTitleDraft(subSI.title);
    }
  };

  const updateField = async (field: 'start_date' | 'end_date' | 'status', value: string | null) => {
    await supabase
      .from('rc_strategic_initiatives')
      .update({ [field]: value })
      .eq('id', subSI.id);
    setEditingField(null);
    onChanged();
  };

  const ownerName = subSI.owner
    ? getFullNameForAvatar(subSI.owner.first_name, subSI.owner.last_name, subSI.owner.full_name)
    : null;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        <span className="text-sm font-mono text-gray-500 dark:text-gray-400 w-16 flex-shrink-0">
          {numbering}
        </span>

        {editingTitle && !isLocked ? (
          <input
            type="text"
            value={titleDraft}
            autoFocus
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') { setTitleDraft(subSI.title); setEditingTitle(false); }
            }}
            className="flex-1 px-2 py-1 text-sm font-semibold border rounded bg-white dark:bg-gray-900"
          />
        ) : (
          <button
            type="button"
            onClick={() => !isLocked && setEditingTitle(true)}
            className="flex-1 text-left text-sm font-semibold text-gray-900 dark:text-gray-100 hover:underline disabled:no-underline disabled:cursor-not-allowed"
            disabled={isLocked}
          >
            {subSI.title}
          </button>
        )}

        {/* Owner */}
        {ownerName && (
          <div className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300">
            <FancyAvatar
              name={subSI.owner?.avatar_name || ownerName}
              displayName={ownerName}
              avatarUrl={subSI.owner?.avatar_url}
              size="sm"
            />
            <span>{ownerName}</span>
          </div>
        )}

        {/* Start date */}
        <span className="text-xs text-gray-600 dark:text-gray-400 w-20 text-right">
          {editingField === 'start_date' && !isLocked ? (
            <input
              type="date"
              defaultValue={subSI.start_date || ''}
              autoFocus
              className="border rounded px-1 py-0.5 text-xs bg-white dark:bg-gray-900 w-full"
              onBlur={(e) => updateField('start_date', e.target.value || null)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') setEditingField(null);
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => !isLocked && setEditingField('start_date')}
              className="hover:underline disabled:no-underline disabled:cursor-not-allowed"
              disabled={isLocked}
            >
              {subSI.start_date
                ? parseLocalDate(subSI.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : 'Start —'}
            </button>
          )}
        </span>

        {/* End date */}
        <span className="text-xs text-gray-600 dark:text-gray-400 w-20 text-right">
          {editingField === 'end_date' && !isLocked ? (
            <input
              type="date"
              defaultValue={subSI.end_date || ''}
              autoFocus
              className="border rounded px-1 py-0.5 text-xs bg-white dark:bg-gray-900 w-full"
              onBlur={(e) => updateField('end_date', e.target.value || null)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') setEditingField(null);
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => !isLocked && setEditingField('end_date')}
              className="hover:underline disabled:no-underline disabled:cursor-not-allowed"
              disabled={isLocked}
            >
              {subSI.end_date
                ? parseLocalDate(subSI.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : 'End —'}
            </button>
          )}
        </span>

        {/* Status */}
        <span className="w-24 text-right">
          {editingField === 'status' && !isLocked ? (
            <select
              defaultValue={subSI.status || 'not_started'}
              autoFocus
              onBlur={() => setEditingField(null)}
              onChange={(e) => updateField('status', e.target.value)}
              className="border rounded px-1 py-0.5 text-xs bg-white dark:bg-gray-900 w-full"
            >
              {STATUS_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          ) : (
            <button
              type="button"
              onClick={() => !isLocked && setEditingField('status')}
              className="text-xs text-gray-700 dark:text-gray-300 hover:underline disabled:no-underline disabled:cursor-not-allowed"
              disabled={isLocked}
            >
              {STATUS_OPTIONS.find(o => o.value === subSI.status)?.label || subSI.status || '—'}
            </button>
          )}
        </span>
      </div>

      {expanded && (
        <div className="pl-10 pr-3 py-3 space-y-4">
          {/* Description + owner editors. Save-on-blur for description so we don't
              hit Supabase on every keystroke; the owner Select persists immediately on
              change. RLS gates writes — UI shows fields enabled and trusts the toast
              for failures, matching the rest of the SI surface. */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">
                Description
              </label>
              <textarea
                value={descriptionDraft}
                onChange={(e) => setDescriptionDraft(e.target.value)}
                onBlur={async () => {
                  const next = descriptionDraft.trim() ? descriptionDraft : null;
                  const current = (subSI.description as string | null) || null;
                  if (next === current) return;
                  await supabase
                    .from('rc_strategic_initiatives')
                    .update({ description: next })
                    .eq('id', subSI.id);
                  onChanged();
                }}
                disabled={isLocked}
                placeholder="Describe what this sub-initiative covers..."
                className="w-full px-2 py-1 text-sm border rounded-md min-h-[64px] bg-white dark:bg-gray-900"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400 block mb-1">
                Owner
              </label>
              <Select
                value={(subSI.owner_user_id as string | null) || ''}
                disabled={isLocked}
                onValueChange={async (val) => {
                  await supabase
                    .from('rc_strategic_initiatives')
                    .update({ owner_user_id: val || null })
                    .eq('id', subSI.id);
                  onChanged();
                }}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Select owner" />
                </SelectTrigger>
                <SelectContent>
                  {profiles.length === 0 ? (
                    <div className="py-2 px-2 text-sm text-muted-foreground text-center">
                      No profiles available
                    </div>
                  ) : (
                    profiles.map((p) => {
                      const displayName = getFullNameForAvatar(p.first_name, p.last_name, p.full_name) || 'Unknown';
                      return (
                        <SelectItem key={p.id} value={p.id}>
                          <span className="inline-flex items-center gap-2">
                            <FancyAvatar
                              name={p.avatar_name || displayName}
                              displayName={displayName}
                              avatarUrl={p.avatar_url}
                              size="sm"
                            />
                            <span>{displayName}</span>
                          </span>
                        </SelectItem>
                      );
                    })
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <SITaskTable
            tasks={tasks}
            loading={tasksLoading}
            onEditTask={onEditTask}
            onRefetch={refetchTasks}
            emptyMessage="No tasks under this sub-initiative yet."
          />
        </div>
      )}
    </Card>
  );
}
