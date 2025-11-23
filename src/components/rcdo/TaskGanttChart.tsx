import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { format, startOfWeek, addWeeks, differenceInWeeks, parseISO, startOfDay, subWeeks, min, max } from 'date-fns';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { TaskGanttBar } from './TaskGanttBar';
import { TaskContextMenu } from './TaskContextMenu';
import type { TaskWithRelations } from '@/types/rcdo';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

interface TaskGanttChartProps {
  tasks: TaskWithRelations[];
  cycleStartDate: Date;
  cycleEndDate: Date;
  onTaskClick?: (task: TaskWithRelations) => void;
  onTaskEdit?: (task: TaskWithRelations) => void;
  onTaskDelete?: (task: TaskWithRelations) => void;
  onTaskComplete?: (task: TaskWithRelations) => void;
  onTaskDateUpdate?: (task: TaskWithRelations, startDate: Date, endDate: Date) => void;
  canEditTask?: (task: TaskWithRelations) => boolean;
  canDeleteTask?: (task: TaskWithRelations) => boolean;
}

export function TaskGanttChart({
  tasks,
  cycleStartDate,
  cycleEndDate,
  onTaskClick,
  onTaskEdit,
  onTaskDelete,
  onTaskComplete,
  onTaskDateUpdate,
  canEditTask,
  canDeleteTask,
}: TaskGanttChartProps) {
  const isMobile = useIsMobile();
  const [showLeftColumn, setShowLeftColumn] = useState(!isMobile);
  const weekWidth = isMobile ? 80 : 120; // Narrower on mobile
  const leftColumnWidth = isMobile ? 0 : (showLeftColumn ? 200 : 0); // Collapsible on mobile
  const taskRowHeight = isMobile ? 56 : 40; // Larger touch targets on mobile

  // Helper function to get task bar dates
  const getTaskBarDates = useCallback((task: TaskWithRelations): { start: Date; end: Date } | null => {
    let start: Date;
    if (task.start_date) {
      start = parseISO(task.start_date);
    } else if (task.target_delivery_date) {
      start = parseISO(task.target_delivery_date);
    } else {
      return null;
    }
    
    let end: Date;
    if (task.actual_delivery_date) {
      end = parseISO(task.actual_delivery_date);
    } else if (task.target_delivery_date) {
      end = parseISO(task.target_delivery_date);
    } else {
      end = new Date(start);
      end.setDate(end.getDate() + 7);
    }
    
    if (end < start) {
      end = new Date(start);
      end.setDate(end.getDate() + 7);
    }
    
    return { start, end };
  }, []);

  // Calculate effective timeline dates based on tasks
  const effectiveDates = useMemo(() => {
    const taskDates = tasks
      .map(getTaskBarDates)
      .filter((dates): dates is { start: Date; end: Date } => dates !== null);

    if (taskDates.length === 0) {
      // No tasks with dates, use cycle dates
      return {
        start: cycleStartDate,
        end: cycleEndDate,
      };
    }

    // Find min start and max end from all tasks
    const allStarts = taskDates.map(d => d.start);
    const allEnds = taskDates.map(d => d.end);
    const minStart = min(allStarts);
    const maxEnd = max(allEnds);

    // Add padding: 2 weeks before first task, 2 weeks after last task
    const paddedStart = subWeeks(startOfWeek(minStart, { weekStartsOn: 1 }), 2);
    const paddedEnd = addWeeks(startOfWeek(maxEnd, { weekStartsOn: 1 }), 2);

    // Ensure we don't go before cycle start or after cycle end (if cycle exists)
    const finalStart = cycleStartDate && paddedStart < cycleStartDate ? cycleStartDate : paddedStart;
    const finalEnd = cycleEndDate && paddedEnd > cycleEndDate ? cycleEndDate : paddedEnd;

    // Ensure minimum 8 weeks of timeline
    const minDuration = addWeeks(finalStart, 8);
    const adjustedEnd = finalEnd < minDuration ? minDuration : finalEnd;

    return {
      start: finalStart,
      end: adjustedEnd,
    };
  }, [tasks, cycleStartDate, cycleEndDate, getTaskBarDates]);

  // Calculate weeks in the timeline (using effective dates)
  const weeks = useMemo(() => {
    const weekList = [];
    let currentWeek = startOfWeek(effectiveDates.start, { weekStartsOn: 1 }); // Monday
    const endWeek = startOfWeek(effectiveDates.end, { weekStartsOn: 1 });
    
    // Include the week containing the end date
    while (currentWeek <= endWeek || currentWeek <= effectiveDates.end) {
      weekList.push(new Date(currentWeek));
      const nextWeek = addWeeks(currentWeek, 1);
      if (nextWeek > endWeek && nextWeek > effectiveDates.end) break;
      currentWeek = nextWeek;
    }
    
    return weekList;
  }, [effectiveDates]);


  // Filter tasks that have dates
  const tasksWithDates = useMemo(() => {
    return tasks.filter(task => task.start_date || task.target_delivery_date || task.actual_delivery_date);
  }, [tasks]);

  // Tasks without dates (show in unscheduled area)
  const tasksWithoutDates = useMemo(() => {
    return tasks.filter(task => !task.start_date && !task.target_delivery_date && !task.actual_delivery_date);
  }, [tasks]);

  const [draggingUnscheduled, setDraggingUnscheduled] = useState<TaskWithRelations | null>(null);
  const [dragPosition, setDragPosition] = useState<number | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const defaultCanEdit = (task: TaskWithRelations) => canEditTask ? canEditTask(task) : true;
  const defaultCanDelete = (task: TaskWithRelations) => canDeleteTask ? canDeleteTask(task) : true;

  // Calculate date from pixel position in timeline
  const pixelToDate = useCallback((pixelX: number): Date => {
    const timelineWeekStart = startOfWeek(effectiveDates.start, { weekStartsOn: 1 });
    const weeks = Math.round(pixelX / weekWidth);
    return startOfDay(addWeeks(timelineWeekStart, weeks));
  }, [weekWidth, effectiveDates.start]);

  // Update showLeftColumn when mobile state changes
  useEffect(() => {
    if (isMobile) {
      setShowLeftColumn(false);
    } else {
      setShowLeftColumn(true);
    }
  }, [isMobile]);

  // Handle unscheduled task drag
  const handleUnscheduledDragStart = useCallback((task: TaskWithRelations, e: React.MouseEvent) => {
    if (!defaultCanEdit(task) || !onTaskDateUpdate) return;
    e.preventDefault();
    setDraggingUnscheduled(task);
  }, [defaultCanEdit, onTaskDateUpdate]);

  // Handle drag over timeline
  const handleTimelineDragOver = useCallback((e: React.DragEvent) => {
    if (!draggingUnscheduled) return;
    e.preventDefault();
    if (timelineRef.current) {
      const rect = timelineRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left - leftColumnWidth; // Subtract left column width
      setDragPosition(Math.max(0, x));
    }
  }, [draggingUnscheduled, leftColumnWidth]);

  // Handle drop on timeline
  const handleTimelineDrop = useCallback((e: React.DragEvent) => {
    if (!draggingUnscheduled || !onTaskDateUpdate || !dragPosition) return;
    e.preventDefault();
    
    const startDate = pixelToDate(dragPosition);
    const endDate = addWeeks(startDate, 2); // Default 2 weeks duration
    
    onTaskDateUpdate(draggingUnscheduled, startDate, endDate);
    setDraggingUnscheduled(null);
    setDragPosition(null);
  }, [draggingUnscheduled, onTaskDateUpdate, dragPosition, pixelToDate]);

  // Handle mouse move for unscheduled task dragging
  useEffect(() => {
    if (!draggingUnscheduled) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (timelineRef.current) {
        const rect = timelineRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left - leftColumnWidth; // Subtract left column width
        setDragPosition(Math.max(0, x));
      }
    };

    const handleMouseUp = () => {
      if (draggingUnscheduled && onTaskDateUpdate && dragPosition !== null) {
        const startDate = pixelToDate(dragPosition);
        const endDate = addWeeks(startDate, 2); // Default 2 weeks duration
        onTaskDateUpdate(draggingUnscheduled, startDate, endDate);
      }
      setDraggingUnscheduled(null);
      setDragPosition(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingUnscheduled, dragPosition, onTaskDateUpdate, pixelToDate, leftColumnWidth]);

  return (
    <Card className="p-4">
      {/* Empty State */}
      {tasks.length === 0 && (
        <div className="p-12 text-center">
          <p className="text-muted-foreground">
            No tasks yet. Use the "Add Task" button above to create your first task.
          </p>
        </div>
      )}

      {tasks.length > 0 && (
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          {/* Mobile: Toggle button for left column */}
          {isMobile && (
            <div className="flex items-center justify-between mb-2 pb-2 border-b">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowLeftColumn(!showLeftColumn)}
                className="h-11 md:h-10"
              >
                {showLeftColumn ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <span className="ml-2">{showLeftColumn ? 'Hide' : 'Show'} Task Names</span>
              </Button>
            </div>
          )}
          
          {/* Week Headers */}
          <div 
            className="flex border-b mb-2 sticky top-0 bg-background z-10" 
            style={{ paddingLeft: `${leftColumnWidth}px` }}
          >
            {weeks.map((week, index) => (
              <div
                key={index}
                className="border-l px-1 md:px-2 py-1 text-xs font-semibold text-center"
                style={{ minWidth: `${weekWidth}px` }}
              >
                <div className="text-[10px] md:text-xs">Wk {index + 1}</div>
                <div className="text-muted-foreground text-[10px] md:text-xs">{format(week, 'MMM d')}</div>
              </div>
            ))}
          </div>

          {/* Task Rows */}
          <div
            ref={timelineRef}
            className="space-y-2"
            onDragOver={handleTimelineDragOver}
            onDrop={handleTimelineDrop}
          >
            {tasksWithDates.map((task) => {
              const dates = getTaskBarDates(task);
              if (!dates) return null;

              return (
                <div
                  key={task.id}
                  className="flex items-center relative"
                  style={{ height: `${taskRowHeight}px` }}
                >
                  {/* Task Name (Fixed Left) - Hidden on mobile when collapsed */}
                  {showLeftColumn && (
                    <div
                      className={cn(
                        "absolute left-0 bg-background border-r pr-2 z-20 flex items-center h-full",
                        isMobile && "shadow-md"
                      )}
                      style={{ width: `${leftColumnWidth}px` }}
                    >
                      <div className="truncate text-sm font-medium px-2" title={task.title}>
                        {task.title}
                      </div>
                    </div>
                  )}

                  {/* Mobile: Task name above bar when left column is hidden */}
                  {isMobile && !showLeftColumn && (
                    <div className="absolute left-0 top-0 text-xs font-medium mb-1 z-10 bg-background/80 px-1">
                      {task.title}
                    </div>
                  )}

                  {/* Gantt Bar Area */}
                  <div
                    className="relative flex-1"
                    style={{ marginLeft: `${leftColumnWidth}px`, height: `${taskRowHeight}px` }}
                  >
                    <TaskContextMenu
                      task={task}
                      onEdit={onTaskEdit ? () => onTaskEdit(task) : undefined}
                      onDelete={onTaskDelete ? () => onTaskDelete(task) : undefined}
                      onComplete={onTaskComplete ? () => onTaskComplete(task) : undefined}
                      onView={onTaskClick ? () => onTaskClick(task) : undefined}
                      canEdit={defaultCanEdit(task)}
                      canDelete={defaultCanDelete(task)}
                    >
                      <div>
                    <TaskGanttBar
                      task={task}
                      startDate={dates.start}
                      endDate={dates.end}
                      weekWidth={weekWidth}
                      cycleStartDate={effectiveDates.start}
                      onClick={() => onTaskClick?.(task)}
                      onDateUpdate={onTaskDateUpdate ? (newStart, newEnd) => onTaskDateUpdate(task, newStart, newEnd) : undefined}
                      canEdit={defaultCanEdit(task)}
                    />
                      </div>
                    </TaskContextMenu>
                  </div>
                </div>
              );
            })}

            {/* Unscheduled Tasks */}
            {tasksWithoutDates.length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <div className="text-sm font-semibold mb-2 text-muted-foreground">
                  Unscheduled Tasks ({tasksWithoutDates.length})
                  {onTaskDateUpdate && (
                    <span className="text-xs ml-2 text-muted-foreground">
                      (Drag to timeline to schedule)
                    </span>
                  )}
                </div>
                <div className="space-y-1">
                  {tasksWithoutDates.map((task) => (
                    <TaskContextMenu
                      key={task.id}
                      task={task}
                      onEdit={onTaskEdit ? () => onTaskEdit(task) : undefined}
                      onDelete={onTaskDelete ? () => onTaskDelete(task) : undefined}
                      onComplete={onTaskComplete ? () => onTaskComplete(task) : undefined}
                      onView={onTaskClick ? () => onTaskClick(task) : undefined}
                      canEdit={defaultCanEdit(task)}
                      canDelete={defaultCanDelete(task)}
                    >
                      <div
                        className={cn(
                          "text-sm p-2 rounded hover:bg-accent cursor-move transition-colors",
                          draggingUnscheduled?.id === task.id && "opacity-50 bg-accent"
                        )}
                        onClick={() => onTaskClick?.(task)}
                        onMouseDown={(e) => handleUnscheduledDragStart(task, e)}
                        draggable={defaultCanEdit(task) && !!onTaskDateUpdate}
                      >
                        {task.title}
                      </div>
                    </TaskContextMenu>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {/* Legend */}
      <div className="mt-4 pt-4 border-t">
        <div className="text-xs font-semibold mb-2">Status Colors:</div>
        <div className="flex flex-wrap gap-3 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded bg-gray-400" />
            <span>Not Assigned</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded bg-[#C97D60]" />
            <span>Assigned</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded bg-yellow-500" />
            <span>In Progress</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded bg-green-500" />
            <span>Completed</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded bg-red-500" />
            <span>Changed/Canceled</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded bg-orange-500" />
            <span>Delayed</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

