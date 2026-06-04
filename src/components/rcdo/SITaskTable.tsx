import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, Dispatch, SetStateAction } from 'react';
import { ChevronRight, MoreVertical, ArrowUpRight, ArrowRightLeft, GripVertical, Trash2, X } from 'lucide-react';
import { useDraggable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import FancyAvatar from '@/components/ui/fancy-avatar';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuPortal,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getFullNameForAvatar } from '@/lib/nameUtils';
import { parseLocalDate } from '@/lib/dateUtils';
import { updateTask } from '@/hooks/useTasks';
import { cn } from '@/lib/utils';
import type { TaskWithRelations } from '@/types/rcdo';

interface SITaskTableProps {
  tasks: TaskWithRelations[];
  loading?: boolean;
  onEditTask: (taskId: string) => void;
  onRefetch: () => void | Promise<void>;
  emptyMessage?: string;
  // Optional: when provided, each row shows a kebab menu with "Promote to
  // sub-initiative". Callers that aren't inside a sub-SI (e.g., the flat-mode SIDetail
  // task list) omit this and the menu doesn't render — automatic gating without a
  // separate prop.
  onPromoteTask?: (taskId: string) => void | Promise<void>;
  // Optional: sibling sub-SIs the task can be moved into. When provided alongside
  // onMoveTasksToSubSI, the kebab menu shows a "Move to sub-initiative…" submenu
  // and the checkbox column + bulk-action bar appear for multi-row moves. Should
  // already exclude the current container.
  moveTargets?: Array<{ id: string; title: string }>;
  onMoveTasksToSubSI?: (taskIds: string[], destSiId: string) => void | Promise<void>;
  // Optional: bulk delete handler. When provided, the checkbox column + bulk-
  // action bar render even if there are no move targets (a lone sub-SI can
  // still bulk-delete its tasks). Handler is responsible for confirmation —
  // we only show a yes/no prompt before calling it.
  onDeleteTasks?: (taskIds: string[]) => void | Promise<void>;
  // Optional: bulk promote handler. Mirrors the per-row `onPromoteTask` for
  // selections — caller decides whether to use a batched RPC or loop the
  // per-task one. Surfacing it here keeps the action discoverable next to
  // Move/Delete instead of forcing N kebab clicks.
  onPromoteTasks?: (taskIds: string[]) => void | Promise<void>;
  // Optional: when provided, each row becomes a draggable source carrying this
  // container id in its drag data. The parent DndContext's onDragEnd reads it as
  // sourceSiId to perform the cross-container move. Absent (e.g., flat-mode SI page)
  // means no drag affordance.
  draggableContainerId?: string;
  // Optional: when provided, rows become sortable within this table and the
  // caller persists the new order (display_order). Works with `draggableContainerId`
  // so the same drag gesture can either reorder within the container OR move across
  // containers (when an outer DndContext routes the drop elsewhere).
  onReorderTasks?: (orderedTaskIds: string[]) => void | Promise<void>;
}

const STATUS_OPTIONS: { value: string; label: string; color: string }[] = [
  { value: 'not_assigned', label: 'Not Assigned', color: 'text-gray-600 dark:text-gray-400' },
  { value: 'assigned', label: 'Assigned', color: 'text-[#4A5D5F]' },
  { value: 'in_progress', label: 'In Progress', color: 'text-yellow-600 dark:text-yellow-400' },
  { value: 'completed', label: 'Completed', color: 'text-green-600 dark:text-green-400' },
  { value: 'delayed', label: 'Delayed', color: 'text-orange-600 dark:text-orange-400' },
  { value: 'task_changed_canceled', label: 'Changed/Canceled', color: 'text-red-600 dark:text-red-400' },
];

export function SITaskTable({
  tasks,
  loading = false,
  onEditTask,
  onRefetch,
  emptyMessage = 'No tasks yet.',
  onPromoteTask,
  moveTargets,
  onMoveTasksToSubSI,
  onDeleteTasks,
  onPromoteTasks,
  draggableContainerId,
  onReorderTasks,
}: SITaskTableProps) {
  const [editingCell, setEditingCell] = useState<{ taskId: string; field: 'start_date' | 'target_delivery_date' } | null>(null);
  const [statusMenuTaskId, setStatusMenuTaskId] = useState<string | null>(null);

  // Two narrow capabilities — separately gated so a sub-SI with no siblings
  // still gets bulk delete, and a read-only viewer with neither gets neither.
  const canBulkMove = !!onMoveTasksToSubSI && !!moveTargets && moveTargets.length > 0;
  const canBulkDelete = !!onDeleteTasks;
  const canBulkPromote = !!onPromoteTasks;
  // Checkbox column + bar appear when ANY bulk action is available.
  const supportsBulkActions = canBulkMove || canBulkDelete || canBulkPromote;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  // Prune stale ids when tasks list changes (e.g., after a successful move the
  // row leaves this table — clear it from selection so the count stays honest).
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const live = new Set(tasks.map((t) => t.id));
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (live.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [tasks]);

  const allSelected = supportsBulkActions && tasks.length > 0 && selectedIds.size === tasks.length;
  const someSelected = supportsBulkActions && selectedIds.size > 0 && selectedIds.size < tasks.length;
  // Radix Checkbox supports 'indeterminate' via the checked prop; mirror that with
  // a ref-based update because the type only allows boolean | 'indeterminate'.
  const headerCheckboxRef = useRef<HTMLButtonElement | null>(null);

  const toggleOne = (taskId: string, next: boolean) => {
    setSelectedIds((prev) => {
      const out = new Set(prev);
      if (next) out.add(taskId);
      else out.delete(taskId);
      return out;
    });
  };

  const toggleAll = (next: boolean) => {
    setSelectedIds(next ? new Set(tasks.map((t) => t.id)) : new Set());
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkMove = async (destSiId: string) => {
    if (!onMoveTasksToSubSI || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    await onMoveTasksToSubSI(ids, destSiId);
    // Optimistic clear — even if the move call is still in flight, the rows are
    // about to leave this table, and the useEffect above would clear them on the
    // next render. Clearing now avoids a flash of stale "N selected".
    clearSelection();
  };

  const handleBulkDelete = async () => {
    if (!onDeleteTasks || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    // Inline confirm matches the existing destructive-action pattern (e.g.,
    // "Promote to sub-initiative"). A Dialog would be heavier for a yes/no.
    const noun = ids.length === 1 ? 'task' : `${ids.length} tasks`;
    if (!window.confirm(`Delete ${noun}? This can't be undone.`)) return;
    await onDeleteTasks(ids);
    clearSelection();
  };

  const handleBulkPromote = async () => {
    if (!onPromoteTasks || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const noun = ids.length === 1 ? 'task' : `${ids.length} tasks`;
    if (!window.confirm(`Promote ${noun} into sub-initiatives? Each task becomes a peer sub-initiative with the same title, owner, and dates.`)) return;
    await onPromoteTasks(ids);
    clearSelection();
  };

  const handleInlineUpdate = async (taskId: string, field: string, value: string) => {
    try {
      await updateTask(taskId, { [field]: value });
      await onRefetch();
    } catch (err) {
      console.error('Error updating task:', err);
    }
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (tasks.length === 0) {
    return <p className="text-gray-600 dark:text-gray-400">{emptyMessage}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            {supportsBulkActions && (
              <th className="w-8 py-3 pl-2 pr-0 align-middle">
                <Checkbox
                  ref={headerCheckboxRef}
                  aria-label={allSelected ? 'Deselect all tasks' : 'Select all tasks'}
                  checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                  onCheckedChange={(v) => toggleAll(v === true)}
                />
              </th>
            )}
            {draggableContainerId && <th className="w-6" aria-label="Drag handle" />}
            <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-400">Description</th>
            <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-400">Owner</th>
            <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-400">Start Date</th>
            <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-400">Target Delivery Date</th>
            <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-400">Status</th>
            {(onPromoteTask || onMoveTasksToSubSI) && <th className="w-10" aria-label="Row actions" />}
          </tr>
        </thead>
        <tbody>
          {onReorderTasks ? (
            // useSortable in each row needs a surrounding SortableContext. Same
            // gesture still routes through the outer DndContext (provided by
            // SISubTree or by SITaskTable's own self-contained wrapper in flat
            // mode), so cross-container drops keep working.
            <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              {tasks.map((task) => (
                <SortableSITaskRow
                  key={task.id}
                  task={task}
                  editingCell={editingCell}
                  setEditingCell={setEditingCell}
                  statusMenuTaskId={statusMenuTaskId}
                  setStatusMenuTaskId={setStatusMenuTaskId}
                  handleInlineUpdate={handleInlineUpdate}
                  onEditTask={onEditTask}
                  onPromoteTask={onPromoteTask}
                  moveTargets={moveTargets}
                  onMoveTasksToSubSI={onMoveTasksToSubSI}
                  draggableContainerId={draggableContainerId}
                  selectable={supportsBulkActions}
                  selected={selectedIds.has(task.id)}
                  onToggleSelected={toggleOne}
                />
              ))}
            </SortableContext>
          ) : (
            tasks.map((task) => (
              <SITaskRow
                key={task.id}
                task={task}
                editingCell={editingCell}
                setEditingCell={setEditingCell}
                statusMenuTaskId={statusMenuTaskId}
                setStatusMenuTaskId={setStatusMenuTaskId}
                handleInlineUpdate={handleInlineUpdate}
                onEditTask={onEditTask}
                onPromoteTask={onPromoteTask}
                moveTargets={moveTargets}
                onMoveTasksToSubSI={onMoveTasksToSubSI}
                draggableContainerId={draggableContainerId}
                selectable={supportsBulkActions}
                selected={selectedIds.has(task.id)}
                onToggleSelected={toggleOne}
              />
            ))
          )}
        </tbody>
      </table>
      {supportsBulkActions && selectedIds.size > 0 && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 px-3 py-2">
          <div className="text-sm text-blue-900 dark:text-blue-100">
            {selectedIds.size} selected
          </div>
          <div className="flex items-center gap-2">
            {canBulkMove && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-md bg-white dark:bg-gray-900 border border-blue-300 dark:border-blue-800 px-3 py-1.5 text-sm font-medium text-blue-900 dark:text-blue-100 hover:bg-blue-100/60 dark:hover:bg-blue-900/40"
                  >
                    <ArrowRightLeft className="h-4 w-4" />
                    Move to sub-initiative…
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-w-[260px]">
                  {moveTargets!.map((target) => (
                    <DropdownMenuItem
                      key={target.id}
                      onSelect={(e) => {
                        e.preventDefault();
                        void handleBulkMove(target.id);
                      }}
                    >
                      <span className="truncate">{target.title}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {canBulkPromote && (
              <button
                type="button"
                onClick={() => void handleBulkPromote()}
                className="inline-flex items-center gap-1.5 rounded-md bg-white dark:bg-gray-900 border border-blue-300 dark:border-blue-800 px-3 py-1.5 text-sm font-medium text-blue-900 dark:text-blue-100 hover:bg-blue-100/60 dark:hover:bg-blue-900/40"
              >
                <ArrowUpRight className="h-4 w-4" />
                Promote to sub-initiatives
              </button>
            )}
            {canBulkDelete && (
              <button
                type="button"
                onClick={() => void handleBulkDelete()}
                className="inline-flex items-center gap-1.5 rounded-md bg-white dark:bg-gray-900 border border-red-300 dark:border-red-800 px-3 py-1.5 text-sm font-medium text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </button>
            )}
            <button
              type="button"
              onClick={clearSelection}
              className="inline-flex items-center gap-1 text-sm text-blue-900/80 dark:text-blue-100/80 hover:text-blue-900 dark:hover:text-blue-100"
              aria-label="Clear selection"
            >
              <X className="h-4 w-4" />
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Drag glue shared between the two row variants. Either useDraggable (cross-
// container only) or useSortable (sortable + cross-container) writes into this
// bag; the body renderer is hook-agnostic.
type RowDragBag = {
  setNodeRef?: (el: HTMLElement | null) => void;
  attributes?: Record<string, unknown>;
  listeners?: Record<string, unknown>;
  style?: CSSProperties;
  isDragging?: boolean;
};

type SITaskRowSharedProps = {
  task: TaskWithRelations;
  editingCell: { taskId: string; field: 'start_date' | 'target_delivery_date' } | null;
  setEditingCell: Dispatch<SetStateAction<{ taskId: string; field: 'start_date' | 'target_delivery_date' } | null>>;
  statusMenuTaskId: string | null;
  setStatusMenuTaskId: Dispatch<SetStateAction<string | null>>;
  handleInlineUpdate: (taskId: string, field: string, value: string) => Promise<void>;
  onEditTask: (taskId: string) => void;
  onPromoteTask?: (taskId: string) => void | Promise<void>;
  moveTargets?: Array<{ id: string; title: string }>;
  onMoveTasksToSubSI?: (taskIds: string[], destSiId: string) => void | Promise<void>;
  draggableContainerId?: string;
  selectable: boolean;
  selected: boolean;
  onToggleSelected: (taskId: string, next: boolean) => void;
};

// Two thin wrappers feed the same body — one uses useDraggable (legacy/cross-
// container-only callers like a sub-SI with no siblings and no reorder enabled);
// the other uses useSortable (intra-container reorder + cross-container). Hooks
// can't be conditional, so each wrapper exists to keep call sites unconditional.
function SITaskRow(props: SITaskRowSharedProps) {
  const { setNodeRef, attributes, listeners, transform, isDragging } = useDraggable({
    id: props.task.id,
    data: { sourceSiId: props.draggableContainerId },
    disabled: !props.draggableContainerId,
  });
  // Transforms on <tr> elements work in modern browsers, and the 5px activation
  // distance in the parent's PointerSensor keeps click-to-edit and double-click
  // handlers responsive. If table-row transforms ever glitch visually, swap this for
  // a DragOverlay-based ghost.
  const style: CSSProperties | undefined = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.4 : 1, zIndex: isDragging ? 10 : undefined, position: 'relative' }
    : undefined;
  return (
    <SITaskRowBody
      {...props}
      drag={{ setNodeRef: props.draggableContainerId ? setNodeRef : undefined, attributes, listeners, style, isDragging }}
    />
  );
}

function SortableSITaskRow(props: SITaskRowSharedProps) {
  // useSortable subsumes useDraggable — same drag listeners plus the surrounding
  // SortableContext lets dnd-kit place the row at the correct index on drop.
  // sourceSiId rides in `data` so SISubTree's onDragEnd can tell intra-container
  // (reorder) from cross-container (move) without a separate lookup.
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: props.task.id,
    data: { sourceSiId: props.draggableContainerId },
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 10 : undefined,
    position: 'relative',
  };
  return (
    <SITaskRowBody
      {...props}
      drag={{ setNodeRef, attributes, listeners, style, isDragging }}
    />
  );
}

function SITaskRowBody({
  task,
  editingCell,
  setEditingCell,
  statusMenuTaskId,
  setStatusMenuTaskId,
  handleInlineUpdate,
  onEditTask,
  onPromoteTask,
  moveTargets,
  onMoveTasksToSubSI,
  draggableContainerId,
  selectable,
  selected,
  onToggleSelected,
  drag,
}: SITaskRowSharedProps & { drag: RowDragBag }) {
  const { setNodeRef, attributes, listeners, style: dragStyle, isDragging } = drag;

  const taskOwnerName = getFullNameForAvatar(
    task.owner?.first_name,
    task.owner?.last_name,
    task.owner?.full_name
  );
  const startDate = task.start_date
    ? parseLocalDate(task.start_date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
    : '—';
  const deliveryDate = task.target_delivery_date
    ? parseLocalDate(task.target_delivery_date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
    : '—';
  const currentStatus = STATUS_OPTIONS.find(s => s.value === task.status) || STATUS_OPTIONS[0];

  return (
    <tr
      ref={setNodeRef}
      style={dragStyle}
      className={cn(
        'border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors',
        selected && 'bg-blue-50/60 dark:bg-blue-950/30',
        isDragging && 'bg-blue-50 dark:bg-blue-950/40 shadow-lg'
      )}
    >
      {selectable && (
        <td className="py-3 pl-2 pr-0 w-8 align-middle">
          <Checkbox
            checked={selected}
            onCheckedChange={(v) => onToggleSelected(task.id, v === true)}
            aria-label={selected ? `Deselect "${task.title}"` : `Select "${task.title}"`}
          />
        </td>
      )}
      {draggableContainerId && (
        <td className="py-3 pl-2 pr-0 w-6 align-middle">
          {/* Drag handle: only this element listens for the drag gesture, so clicks
              on the row body still go to the cell-specific handlers (title opens the
              task dialog, dates open inline editors, etc.). */}
          <button
            type="button"
            aria-label="Drag to move task"
            className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 cursor-grab active:cursor-grabbing touch-none"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        </td>
      )}
      <td
        className="py-3 px-4 text-sm text-gray-900 dark:text-gray-100 cursor-pointer group/desc"
        onClick={() => onEditTask(task.id)}
      >
        <div className="flex items-center gap-1">
          <span className="font-medium">{task.title}</span>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover/desc:opacity-100 transition-opacity flex-shrink-0" />
        </div>
        {task.completion_criteria && (
          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
            {task.completion_criteria.replace(/<[^>]*>/g, '').trim()}
          </div>
        )}
      </td>
      <td className="py-3 px-4 text-sm">
        {task.owner ? (
          <div className="flex items-center gap-2">
            <FancyAvatar
              name={task.owner?.avatar_name || taskOwnerName}
              displayName={taskOwnerName}
              avatarUrl={task.owner?.avatar_url}
              size="sm"
            />
            <span className="text-gray-700 dark:text-gray-300">{taskOwnerName}</span>
          </div>
        ) : (
          <span className="text-gray-600 dark:text-gray-400">—</span>
        )}
      </td>
      <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300">
        {editingCell?.taskId === task.id && editingCell.field === 'start_date' ? (
          <input
            type="date"
            defaultValue={task.start_date || ''}
            autoFocus
            className="border rounded px-2 py-1 text-sm w-[140px] bg-white dark:bg-gray-800"
            onBlur={(e) => {
              setEditingCell(null);
              if (e.target.value !== (task.start_date || '')) {
                handleInlineUpdate(task.id, 'start_date', e.target.value);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') setEditingCell(null);
            }}
          />
        ) : (
          <span
            className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 rounded px-1 py-0.5 -mx-1"
            onDoubleClick={() => setEditingCell({ taskId: task.id, field: 'start_date' })}
          >
            {startDate}
          </span>
        )}
      </td>
      <td className="py-3 px-4 text-sm text-gray-700 dark:text-gray-300">
        {editingCell?.taskId === task.id && editingCell.field === 'target_delivery_date' ? (
          <input
            type="date"
            defaultValue={task.target_delivery_date || ''}
            autoFocus
            className="border rounded px-2 py-1 text-sm w-[140px] bg-white dark:bg-gray-800"
            onBlur={(e) => {
              setEditingCell(null);
              if (e.target.value !== (task.target_delivery_date || '')) {
                handleInlineUpdate(task.id, 'target_delivery_date', e.target.value);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') setEditingCell(null);
            }}
          />
        ) : (
          <span
            className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 rounded px-1 py-0.5 -mx-1"
            onDoubleClick={() => setEditingCell({ taskId: task.id, field: 'target_delivery_date' })}
          >
            {deliveryDate}
          </span>
        )}
      </td>
      <td className="py-3 px-4 text-sm relative">
        <div className="relative">
          <span
            className={`${currentStatus.color} cursor-pointer hover:underline`}
            onClick={() => setStatusMenuTaskId(statusMenuTaskId === task.id ? null : task.id)}
          >
            {currentStatus.label}
          </span>
          {statusMenuTaskId === task.id && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setStatusMenuTaskId(null)} />
              <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-gray-800 border rounded-md shadow-lg py-1 min-w-[160px]">
                {STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${opt.color} ${opt.value === task.status ? 'font-semibold bg-gray-50 dark:bg-gray-700/50' : ''}`}
                    onClick={() => {
                      setStatusMenuTaskId(null);
                      if (opt.value !== task.status) {
                        handleInlineUpdate(task.id, 'status', opt.value);
                      }
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </td>
      {(onPromoteTask || onMoveTasksToSubSI) && (
        <td className="py-3 px-2 text-sm w-10">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                aria-label="Task actions"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onPromoteTask && (
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    // Confirm before destructive op — the task row vanishes and a new
                    // sub-initiative takes its place. Inline confirm() keeps the
                    // dependency surface small; a Dialog would be heavier for a
                    // single-question flow.
                    if (window.confirm(`Promote "${task.title}" into a sub-initiative? The task will be replaced by a new sub-initiative with the same title, owner, and dates.`)) {
                      void onPromoteTask(task.id);
                    }
                  }}
                >
                  <ArrowUpRight className="h-4 w-4 mr-2" />
                  Promote to sub-initiative
                </DropdownMenuItem>
              )}
              {onMoveTasksToSubSI && moveTargets && moveTargets.length > 0 && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <ArrowRightLeft className="h-4 w-4 mr-2" />
                    Move to sub-initiative…
                  </DropdownMenuSubTrigger>
                  <DropdownMenuPortal>
                    <DropdownMenuSubContent className="max-w-[260px]">
                      {moveTargets.map((target) => (
                        <DropdownMenuItem
                          key={target.id}
                          onSelect={(e) => {
                            e.preventDefault();
                            void onMoveTasksToSubSI([task.id], target.id);
                          }}
                        >
                          <span className="truncate">{target.title}</span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuPortal>
                </DropdownMenuSub>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </td>
      )}
    </tr>
  );
}
