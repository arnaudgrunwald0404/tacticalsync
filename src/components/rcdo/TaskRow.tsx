import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import FancyAvatar from '@/components/ui/fancy-avatar';
import { Calendar, Edit, Trash2, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import type { TaskWithRelations } from '@/types/rcdo';
import { getFullNameForAvatar } from '@/lib/nameUtils';
import { cn } from '@/lib/utils';

interface TaskRowProps {
  task: TaskWithRelations;
  onEdit?: () => void;
  onDelete?: () => void;
  onComplete?: () => void;
  canEdit?: boolean;
  canDelete?: boolean;
}

const statusConfig = {
  not_assigned: { label: 'Not Assigned', color: 'bg-gray-500' },
  assigned: { label: 'Assigned', color: 'bg-blue-500' },
  in_progress: { label: 'In Progress', color: 'bg-yellow-500' },
  completed: { label: 'Completed', color: 'bg-green-500' },
  task_changed_canceled: { label: 'Changed/Canceled', color: 'bg-red-500' },
  delayed: { label: 'Delayed', color: 'bg-orange-500' },
};

export function TaskRow({ task, onEdit, onDelete, onComplete, canEdit = true, canDelete = true }: TaskRowProps) {
  const ownerName = getFullNameForAvatar(
    task.owner?.first_name,
    task.owner?.last_name,
    task.owner?.full_name
  );

  const statusData = statusConfig[task.status] || { label: 'Unknown', color: 'bg-gray-500' };
  const isCompleted = task.status === 'completed';

  return (
    <div className="flex items-center gap-4 p-3 border rounded-lg hover:bg-accent/50 transition-colors">
      {/* Status Badge */}
      <Badge className={cn(statusData.color, 'min-w-[100px] justify-center')}>
        {statusData.label}
      </Badge>

      {/* Task Title */}
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">{task.title}</div>
        {task.completion_criteria && (
          <div className="text-xs text-muted-foreground truncate mt-1">
            {task.completion_criteria}
          </div>
        )}
      </div>

      {/* Owner */}
      <div className="flex items-center gap-2 min-w-[150px]">
        {task.owner && (
          <>
            <FancyAvatar
              name={task.owner?.avatar_name || ownerName}
              displayName={ownerName}
              avatarUrl={task.owner?.avatar_url}
              size="sm"
            />
            <span className="text-sm text-muted-foreground truncate">{ownerName}</span>
          </>
        )}
      </div>

      {/* Dates */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-[200px]">
        <Calendar className="h-3 w-3" />
        <span>
          {task.start_date && format(new Date(task.start_date), 'MMM d')}
          {task.start_date && task.target_delivery_date && ' - '}
          {task.actual_delivery_date 
            ? format(new Date(task.actual_delivery_date), 'MMM d, yyyy') + ' (actual)'
            : task.target_delivery_date && format(new Date(task.target_delivery_date), 'MMM d, yyyy')
          }
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {!isCompleted && onComplete && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onComplete}
            className="h-8 w-8 p-0"
            title="Mark as completed"
          >
            <CheckCircle2 className="h-4 w-4" />
          </Button>
        )}
        {onEdit && canEdit && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            className="h-8 w-8 p-0"
            title="Edit task"
          >
            <Edit className="h-4 w-4" />
          </Button>
        )}
        {onDelete && canDelete && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
            title="Delete task"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

