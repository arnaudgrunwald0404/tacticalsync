import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import FancyAvatar from '@/components/ui/fancy-avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { getFullNameForAvatar } from '@/lib/nameUtils';
import { parseLocalDate } from '@/lib/dateUtils';
import { updateTask } from '@/hooks/useTasks';
import type { TaskWithRelations } from '@/types/rcdo';

interface SITaskTableProps {
  tasks: TaskWithRelations[];
  loading?: boolean;
  onEditTask: (taskId: string) => void;
  onRefetch: () => void | Promise<void>;
  emptyMessage?: string;
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
}: SITaskTableProps) {
  const [editingCell, setEditingCell] = useState<{ taskId: string; field: 'start_date' | 'target_delivery_date' } | null>(null);
  const [statusMenuTaskId, setStatusMenuTaskId] = useState<string | null>(null);

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
            <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-400">Description</th>
            <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-400">Owner</th>
            <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-400">Start Date</th>
            <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-400">Target Delivery Date</th>
            <th className="text-left py-3 px-4 text-sm font-semibold text-gray-600 dark:text-gray-400">Status</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
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
                key={task.id}
                className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
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
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
