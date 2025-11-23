import { useState, useRef, useCallback, useEffect } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format, startOfWeek, differenceInWeeks, addWeeks, startOfDay } from 'date-fns';
import type { TaskWithRelations } from '@/types/rcdo';
import { cn } from '@/lib/utils';

interface TaskGanttBarProps {
  task: TaskWithRelations;
  startDate: Date;
  endDate: Date;
  weekWidth: number;
  cycleStartDate: Date;
  onClick?: () => void;
  onDateUpdate?: (newStartDate: Date, newEndDate: Date) => void;
  canEdit?: boolean;
}

const statusColors = {
  not_assigned: 'bg-gray-400',
  assigned: 'bg-blue-500',
  in_progress: 'bg-yellow-500',
  completed: 'bg-green-500',
  task_changed_canceled: 'bg-red-500',
  delayed: 'bg-orange-500',
};

export function TaskGanttBar({
  task,
  startDate,
  endDate,
  weekWidth,
  cycleStartDate,
  onClick,
  onDateUpdate,
  canEdit = true,
}: TaskGanttBarProps) {
  const [isDragging, setIsDragging] = useState<'left' | 'right' | 'move' | null>(null);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartLeft, setDragStartLeft] = useState(0);
  const [dragStartWidth, setDragStartWidth] = useState(0);
  const [currentLeft, setCurrentLeft] = useState(0);
  const [currentWidth, setCurrentWidth] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);

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
  
  const baseLeft = Math.max(0, weeksFromCycleStart * weekWidth);
  const baseWidth = Math.max(weeksDuration * weekWidth, 20); // Minimum width of 20px
  
  const left = isDragging ? currentLeft : baseLeft;
  const width = isDragging ? currentWidth : baseWidth;
  
  const colorClass = statusColors[task.status] || statusColors.not_assigned;

  // Convert pixel position to date (snap to week start)
  // Note: cycleStartDate here is actually the effective timeline start
  const pixelToDate = useCallback((pixelX: number): Date => {
    const weeks = Math.round(pixelX / weekWidth);
    return startOfDay(addWeeks(cycleWeekStart, weeks));
  }, [weekWidth, cycleWeekStart]);

  // Handle drag start
  const handleMouseDown = useCallback((e: React.MouseEvent, dragType: 'left' | 'right' | 'move') => {
    if (!canEdit || !onDateUpdate) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(dragType);
    setDragStartX(e.clientX);
    setDragStartLeft(baseLeft);
    setDragStartWidth(baseWidth);
    setCurrentLeft(baseLeft);
    setCurrentWidth(baseWidth);
  }, [canEdit, onDateUpdate, baseLeft, baseWidth]);

  // Handle drag
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStartX;
      
      if (isDragging === 'left') {
        // Resize from left
        const newLeft = Math.max(0, dragStartLeft + deltaX);
        const newWidth = Math.max(20, dragStartWidth - deltaX);
        setCurrentLeft(newLeft);
        setCurrentWidth(newWidth);
      } else if (isDragging === 'right') {
        // Resize from right
        const newWidth = Math.max(20, dragStartWidth + deltaX);
        setCurrentWidth(newWidth);
      } else if (isDragging === 'move') {
        // Move entire bar
        const newLeft = Math.max(0, dragStartLeft + deltaX);
        setCurrentLeft(newLeft);
      }
    };

    const handleMouseUp = () => {
      if (isDragging && onDateUpdate) {
        // Calculate new dates based on final position (snap to week boundaries)
        const newStartWeek = Math.round(currentLeft / weekWidth);
        const newStartDate = startOfDay(addWeeks(cycleWeekStart, newStartWeek));
        
        let newEndDate: Date;
        if (isDragging === 'left' || isDragging === 'right') {
          // Resize: calculate end date from width
          const newEndWeek = Math.round((currentLeft + currentWidth) / weekWidth);
          newEndDate = startOfDay(addWeeks(cycleWeekStart, newEndWeek));
          // Ensure end is at least 1 week after start
          if (newEndDate <= newStartDate) {
            newEndDate = startOfDay(addWeeks(newStartDate, 1));
          }
        } else {
          // Move: keep same duration
          const durationWeeks = Math.max(1, Math.round(currentWidth / weekWidth));
          newEndDate = startOfDay(addWeeks(newStartDate, durationWeeks));
        }
        
        onDateUpdate(newStartDate, newEndDate);
      }
      setIsDragging(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragStartX, dragStartLeft, dragStartWidth, currentLeft, currentWidth, weekWidth, cycleWeekStart, onDateUpdate]);
  
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
            ref={barRef}
            className={cn(
              'h-6 rounded cursor-pointer hover:opacity-80 transition-opacity relative group',
              colorClass,
              isDragging && 'opacity-70 z-50',
              canEdit && onDateUpdate && 'cursor-move'
            )}
            style={{
              left: `${left}px`,
              width: `${width}px`,
              position: 'absolute',
            }}
            onClick={(e) => {
              // Don't trigger onClick if clicking on resize handles
              if ((e.target as HTMLElement).classList.contains('resize-handle')) {
                return;
              }
              onClick?.();
            }}
            onMouseDown={(e) => {
              if (canEdit && onDateUpdate && e.shiftKey) {
                handleMouseDown(e, 'move');
              }
            }}
          >
            {/* Left resize handle */}
            {canEdit && onDateUpdate && (
              <div
                className="resize-handle absolute left-0 top-0 w-2 h-full cursor-ew-resize opacity-0 group-hover:opacity-100 bg-white/20 hover:bg-white/40 transition-opacity rounded-l"
                onMouseDown={(e) => handleMouseDown(e, 'left')}
              />
            )}
            {/* Right resize handle */}
            {canEdit && onDateUpdate && (
              <div
                className="resize-handle absolute right-0 top-0 w-2 h-full cursor-ew-resize opacity-0 group-hover:opacity-100 bg-white/20 hover:bg-white/40 transition-opacity rounded-r"
                onMouseDown={(e) => handleMouseDown(e, 'right')}
              />
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          {tooltipContent}
          {canEdit && onDateUpdate && (
            <div className="text-xs mt-1 text-muted-foreground">
              Shift+drag to move • Drag edges to resize
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

