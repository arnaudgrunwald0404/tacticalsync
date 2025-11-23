import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import FancyAvatar from '@/components/ui/fancy-avatar';
import { Calendar, Edit, Trash2, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import type { TaskWithRelations } from '@/types/rcdo';
import { getFullNameForAvatar } from '@/lib/nameUtils';
import { cn } from '@/lib/utils';
import { MOBILE_CONSTANTS } from '@/hooks/use-breakpoint';

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
  assigned: { label: 'Assigned', color: 'bg-[#C97D60]' },
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

  const handleRowClick = (e: React.MouseEvent) => {
    // Don't trigger if clicking on action buttons
    if ((e.target as HTMLElement).closest('button')) {
      return;
    }
    // Always allow clicking to edit if handler exists, even if canEdit is false
    // The dialog will handle permission checks
    if (onEdit) {
      onEdit();
    }
  };

  return (
    <div 
      className={cn(
        // Desktop: horizontal row layout
        "md:flex md:items-center md:gap-4",
        // Mobile: card layout (vertical)
        "flex flex-col gap-3 p-4 border rounded-lg hover:bg-accent/50 transition-colors",
        onEdit && "cursor-pointer"
      )}
      onClick={handleRowClick}
    >
      {/* Mobile: Header row with status and actions */}
      <div className="flex items-center justify-between gap-2 md:hidden">
        <Badge className={cn(statusData.color, 'justify-center')}>
          {statusData.label}
        </Badge>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {!isCompleted && onComplete && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onComplete();
              }}
              className={cn("h-11 w-11 md:h-10 md:w-10 p-0")}
              title="Mark as completed"
            >
              <CheckCircle2 className="h-5 w-5" />
            </Button>
          )}
          {onEdit && canEdit && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className={cn("h-11 w-11 md:h-10 md:w-10 p-0")}
              title="Edit task"
            >
              <Edit className="h-5 w-5" />
            </Button>
          )}
          {onDelete && canDelete && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className={cn("h-11 w-11 md:h-10 md:w-10 p-0 text-destructive hover:text-destructive")}
              title="Delete task"
            >
              <Trash2 className="h-5 w-5" />
            </Button>
          )}
        </div>
      </div>

      {/* Desktop: Status Badge */}
      <Badge className={cn(statusData.color, 'min-w-[100px] justify-center hidden md:flex')}>
        {statusData.label}
      </Badge>

      {/* Task Title */}
      <div className="flex-1 min-w-0">
        <div className="font-medium text-base md:text-sm truncate">{task.title}</div>
        {task.completion_criteria && (
          <div className="text-sm md:text-xs text-muted-foreground mt-1 line-clamp-2 md:truncate">
            {task.completion_criteria}
          </div>
        )}
      </div>

      {/* Owner */}
      <div className="flex items-center gap-2 md:min-w-[150px]">
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
      <div className="flex items-center gap-2 text-sm md:text-xs text-muted-foreground md:min-w-[200px]">
        <Calendar className="h-4 w-4 md:h-3 md:w-3" />
        <span>
          {task.start_date && format(new Date(task.start_date), 'MMM d')}
          {task.start_date && task.target_delivery_date && ' - '}
          {task.actual_delivery_date 
            ? format(new Date(task.actual_delivery_date), 'MMM d, yyyy') + ' (actual)'
            : task.target_delivery_date && format(new Date(task.target_delivery_date), 'MMM d, yyyy')
          }
        </span>
      </div>

      {/* Desktop: Actions */}
      <div className="hidden md:flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {!isCompleted && onComplete && (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onComplete();
            }}
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
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
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
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
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

