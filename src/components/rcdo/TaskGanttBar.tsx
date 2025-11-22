import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format, startOfWeek, differenceInWeeks } from 'date-fns';
import type { TaskWithRelations } from '@/types/rcdo';
import { cn } from '@/lib/utils';

interface TaskGanttBarProps {
  task: TaskWithRelations;
  startDate: Date;
  endDate: Date;
  weekWidth: number;
  cycleStartDate: Date;
  onClick?: () => void;
}

const statusColors = {
  not_assigned: 'bg-gray-400',
  assigned: 'bg-blue-500',
  in_progress: 'bg-yellow-500',
  completed: 'bg-green-500',
  task_changed_canceled: 'bg-red-500',
  delayed: 'bg-orange-500',
};

export function TaskGanttBar({ task, startDate, endDate, weekWidth, cycleStartDate, onClick }: TaskGanttBarProps) {
  // Calculate the position and width of the bar
  // Get the start of the week for cycle start (Monday)
  const cycleWeekStart = startOfWeek(cycleStartDate, { weekStartsOn: 1 });
  
  // Get the start of the week for task start (Monday)
  const taskWeekStart = startOfWeek(startDate, { weekStartsOn: 1 });
  
  // Calculate weeks difference
  const weeksFromCycleStart = differenceInWeeks(taskWeekStart, cycleWeekStart, { roundingMethod: 'floor' });
  
  // Calculate duration in weeks
  const taskWeekEnd = startOfWeek(endDate, { weekStartsOn: 1 });
  const weeksDuration = Math.max(1, differenceInWeeks(taskWeekEnd, taskWeekStart, { roundingMethod: 'ceil' }) + 1);
  
  const left = Math.max(0, weeksFromCycleStart * weekWidth);
  const width = Math.max(weeksDuration * weekWidth, 20); // Minimum width of 20px
  
  const colorClass = statusColors[task.status] || statusColors.not_assigned;
  
  const tooltipContent = (
    <div className="space-y-1">
      <div className="font-semibold">{task.title}</div>
      <div className="text-xs">
        <div>Status: {task.status.replace('_', ' ')}</div>
        {task.start_date && (
          <div>Start: {format(new Date(task.start_date), 'MMM d, yyyy')}</div>
        )}
        {task.target_delivery_date && (
          <div>Target: {format(new Date(task.target_delivery_date), 'MMM d, yyyy')}</div>
        )}
        {task.actual_delivery_date && (
          <div>Actual: {format(new Date(task.actual_delivery_date), 'MMM d, yyyy')}</div>
        )}
        {task.owner && (
          <div>Owner: {task.owner.full_name || task.owner.first_name || 'Unknown'}</div>
        )}
      </div>
    </div>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'h-6 rounded cursor-pointer hover:opacity-80 transition-opacity',
              colorClass
            )}
            style={{
              left: `${left}px`,
              width: `${width}px`,
              position: 'absolute',
            }}
            onClick={onClick}
          />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

