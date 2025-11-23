import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Edit, Trash2, CheckCircle2, Eye } from 'lucide-react';
import type { TaskWithRelations } from '@/types/rcdo';

interface TaskContextMenuProps {
  task: TaskWithRelations;
  children: React.ReactNode;
  onEdit?: () => void;
  onDelete?: () => void;
  onComplete?: () => void;
  onView?: () => void;
  canEdit?: boolean;
  canDelete?: boolean;
  canComplete?: boolean;
}

export function TaskContextMenu({
  task,
  children,
  onEdit,
  onDelete,
  onComplete,
  onView,
  canEdit = true,
  canDelete = true,
  canComplete = true,
}: TaskContextMenuProps) {
  const isCompleted = task.status === 'completed';

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        {onView && (
          <ContextMenuItem onClick={onView}>
            <Eye className="h-4 w-4 mr-2" />
            View Details
          </ContextMenuItem>
        )}
        {onView && (onEdit || onDelete || onComplete) && <ContextMenuSeparator />}
        {onEdit && canEdit && (
          <ContextMenuItem onClick={onEdit}>
            <Edit className="h-4 w-4 mr-2" />
            Edit Task
          </ContextMenuItem>
        )}
        {onComplete && canComplete && !isCompleted && (
          <ContextMenuItem onClick={onComplete}>
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Mark as Completed
          </ContextMenuItem>
        )}
        {onDelete && canDelete && (
          <>
            {(onEdit || onComplete) && <ContextMenuSeparator />}
            <ContextMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Task
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

