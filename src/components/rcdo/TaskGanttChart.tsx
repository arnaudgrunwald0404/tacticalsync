import { useMemo } from 'react';
import { format, startOfWeek, addWeeks, differenceInWeeks, parseISO } from 'date-fns';
import { Card } from '@/components/ui/card';
import { TaskGanttBar } from './TaskGanttBar';
import type { TaskWithRelations } from '@/types/rcdo';
import { cn } from '@/lib/utils';

interface TaskGanttChartProps {
  tasks: TaskWithRelations[];
  cycleStartDate: Date;
  cycleEndDate: Date;
  onTaskClick?: (task: TaskWithRelations) => void;
}

export function TaskGanttChart({ tasks, cycleStartDate, cycleEndDate, onTaskClick }: TaskGanttChartProps) {
  const weekWidth = 120; // Width of each week column in pixels
  const taskRowHeight = 40; // Height of each task row

  // Calculate weeks in the cycle
  const weeks = useMemo(() => {
    const weekList = [];
    let currentWeek = startOfWeek(cycleStartDate, { weekStartsOn: 1 }); // Monday
    const endWeek = startOfWeek(cycleEndDate, { weekStartsOn: 1 });
    
    // Include the week containing the end date
    while (currentWeek <= endWeek || currentWeek <= cycleEndDate) {
      weekList.push(new Date(currentWeek));
      const nextWeek = addWeeks(currentWeek, 1);
      if (nextWeek > endWeek && nextWeek > cycleEndDate) break;
      currentWeek = nextWeek;
    }
    
    return weekList;
  }, [cycleStartDate, cycleEndDate]);

  // Filter tasks that have dates
  const tasksWithDates = useMemo(() => {
    return tasks.filter(task => task.start_date || task.target_delivery_date || task.actual_delivery_date);
  }, [tasks]);

  // Tasks without dates (show in unscheduled area)
  const tasksWithoutDates = useMemo(() => {
    return tasks.filter(task => !task.start_date && !task.target_delivery_date && !task.actual_delivery_date);
  }, [tasks]);

  const getTaskBarDates = (task: TaskWithRelations): { start: Date; end: Date } | null => {
    // Use start_date if available, otherwise target_delivery_date, otherwise skip
    let start: Date;
    if (task.start_date) {
      start = parseISO(task.start_date);
    } else if (task.target_delivery_date) {
      start = parseISO(task.target_delivery_date);
    } else {
      return null; // No start date, can't display in Gantt
    }
    
    // Use actual_delivery_date if completed, otherwise target_delivery_date, otherwise start_date + 1 week
    let end: Date;
    if (task.actual_delivery_date) {
      end = parseISO(task.actual_delivery_date);
    } else if (task.target_delivery_date) {
      end = parseISO(task.target_delivery_date);
    } else {
      end = new Date(start);
      end.setDate(end.getDate() + 7); // Default to 1 week
    }
    
    // Ensure end is after start
    if (end < start) {
      end = new Date(start);
      end.setDate(end.getDate() + 7);
    }
    
    return { start, end };
  };

  return (
    <Card className="p-4">
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          {/* Week Headers */}
          <div className="flex border-b mb-2 sticky top-0 bg-background z-10" style={{ paddingLeft: '200px' }}>
            {weeks.map((week, index) => (
              <div
                key={index}
                className="border-l px-2 py-1 text-xs font-semibold text-center"
                style={{ minWidth: `${weekWidth}px` }}
              >
                <div>Wk {index + 1}</div>
                <div className="text-muted-foreground">{format(week, 'MMM d')}</div>
              </div>
            ))}
          </div>

          {/* Task Rows */}
          <div className="space-y-2">
            {tasksWithDates.map((task) => {
              const dates = getTaskBarDates(task);
              if (!dates) return null;

              return (
                <div
                  key={task.id}
                  className="flex items-center relative"
                  style={{ height: `${taskRowHeight}px` }}
                >
                  {/* Task Name (Fixed Left) */}
                  <div
                    className="absolute left-0 bg-background border-r pr-2 z-20 flex items-center h-full"
                    style={{ width: '200px' }}
                  >
                    <div className="truncate text-sm font-medium" title={task.title}>
                      {task.title}
                    </div>
                  </div>

                  {/* Gantt Bar Area */}
                  <div
                    className="relative flex-1"
                    style={{ marginLeft: '200px', height: `${taskRowHeight}px` }}
                  >
                    <TaskGanttBar
                      task={task}
                      startDate={dates.start}
                      endDate={dates.end}
                      weekWidth={weekWidth}
                      cycleStartDate={cycleStartDate}
                      onClick={() => onTaskClick?.(task)}
                    />
                  </div>
                </div>
              );
            })}

            {/* Unscheduled Tasks */}
            {tasksWithoutDates.length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <div className="text-sm font-semibold mb-2 text-muted-foreground">
                  Unscheduled Tasks ({tasksWithoutDates.length})
                </div>
                <div className="space-y-1">
                  {tasksWithoutDates.map((task) => (
                    <div
                      key={task.id}
                      className="text-sm p-2 rounded hover:bg-accent cursor-pointer"
                      onClick={() => onTaskClick?.(task)}
                    >
                      {task.title}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 pt-4 border-t">
        <div className="text-xs font-semibold mb-2">Status Colors:</div>
        <div className="flex flex-wrap gap-3 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded bg-gray-400" />
            <span>Not Assigned</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-4 h-4 rounded bg-blue-500" />
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

