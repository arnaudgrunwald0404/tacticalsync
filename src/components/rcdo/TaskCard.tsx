import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import FancyAvatar from '@/components/ui/fancy-avatar';
import { Calendar, User, MessageSquare, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import type { TaskWithRelations } from '@/types/rcdo';
import { getFullNameForAvatar } from '@/lib/nameUtils';
import { cn } from '@/lib/utils';
import { CheckInDialog } from './CheckInDialog';

interface TaskCardProps {
  task: TaskWithRelations;
  onClick?: () => void;
  isDragging?: boolean;
}

const statusConfig = {
  not_assigned: { label: 'Not Assigned', color: 'bg-gray-500' },
  assigned: { label: 'Assigned', color: 'bg-blue-500' },
  in_progress: { label: 'In Progress', color: 'bg-yellow-500' },
  completed: { label: 'Completed', color: 'bg-green-500' },
  task_changed_canceled: { label: 'Changed/Canceled', color: 'bg-red-500' },
  delayed: { label: 'Delayed', color: 'bg-orange-500' },
};

export function TaskCard({ task, onClick, isDragging = false }: TaskCardProps) {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showCheckInDialog, setShowCheckInDialog] = useState(false);
  const navigate = useNavigate();

  const ownerName = getFullNameForAvatar(
    task.owner?.first_name,
    task.owner?.last_name,
    task.owner?.full_name
  );

  const statusData = statusConfig[task.status] || { label: 'Unknown', color: 'bg-gray-500' };
  const isOwner = currentUserId === task.owner_user_id;

  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
      }
    };
    getCurrentUser();
  }, []);

  const handleCheckInClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowCheckInDialog(true);
  };

  const handleSIClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (task.strategic_initiative?.id) {
      navigate(`/rcdo/detail/si/${task.strategic_initiative.id}`);
    }
  };

  return (
    <Card
      className={cn(
        'p-4 cursor-pointer hover:shadow-md transition-all',
        isDragging && 'opacity-50 rotate-2'
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-2">
        <h4 className="font-semibold text-gray-900 dark:text-gray-100 flex-1 pr-2">
          {task.title}
        </h4>
        <Badge className={statusData.color}>{statusData.label}</Badge>
      </div>

      {task.completion_criteria && (
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
          {task.completion_criteria}
        </p>
      )}

      {task.strategic_initiative && (
        <div className="mb-2">
          <button
            onClick={handleSIClick}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
          >
            <ExternalLink className="h-3 w-3" />
            {task.strategic_initiative.title}
          </button>
        </div>
      )}

      <div className="space-y-2">
        {/* Owner */}
        <div className="flex items-center gap-2 text-sm">
          <User className="h-4 w-4 text-gray-500" />
          <div className="flex items-center gap-2">
            {(() => {
              const hasOwnerInfo = !!(task.owner?.full_name || task.owner?.first_name || task.owner?.last_name || task.owner?.avatar_url);
              if (!hasOwnerInfo || (ownerName || '').trim().toLowerCase() === 'unknown') {
                return (
                  <span className="inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-full bg-muted text-[10px] font-semibold">?</span>
                );
              }
              return (
                <FancyAvatar
                  name={task.owner?.avatar_name || ownerName}
                  displayName={ownerName}
                  avatarUrl={task.owner?.avatar_url}
                  size="sm"
                />
              );
            })()}
            <span className="text-gray-700 dark:text-gray-300">{(ownerName || '').trim().toLowerCase() === 'unknown' ? 'Unknown' : ownerName}</span>
          </div>
        </div>

        {/* Dates */}
        {(task.start_date || task.target_delivery_date || task.actual_delivery_date) && (
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <Calendar className="h-4 w-4" />
            <span>
              {task.start_date && format(new Date(task.start_date), 'MMM d')}
              {task.start_date && task.target_delivery_date && ' - '}
              {task.actual_delivery_date 
                ? format(new Date(task.actual_delivery_date), 'MMM d, yyyy') + ' (actual)'
                : task.target_delivery_date && format(new Date(task.target_delivery_date), 'MMM d, yyyy')
              }
            </span>
          </div>
        )}

        {/* Check-In Button */}
        {isOwner && (
          <div className="pt-2 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCheckInClick}
              className="w-full h-7 text-xs"
            >
              <MessageSquare className="h-3 w-3 mr-1" />
              Check-In
            </Button>
          </div>
        )}
      </div>
      <CheckInDialog
        isOpen={showCheckInDialog}
        onClose={() => setShowCheckInDialog(false)}
        parentType="task"
        parentId={task.id}
        parentName={task.title}
        onSuccess={() => {
          setShowCheckInDialog(false);
        }}
      />
    </Card>
  );
}

