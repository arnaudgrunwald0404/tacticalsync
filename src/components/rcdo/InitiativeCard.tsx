import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import FancyAvatar from '@/components/ui/fancy-avatar';
import { Calendar, User, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import type { StrategicInitiativeWithRelations } from '@/types/rcdo';
import { getFullNameForAvatar } from '@/lib/nameUtils';
import { cn } from '@/lib/utils';
import { CheckInDialog } from './CheckInDialog';

interface InitiativeCardProps {
  initiative: StrategicInitiativeWithRelations;
  onClick?: () => void;
  isDragging?: boolean;
}

const statusConfig = {
  draft: { label: 'Draft', color: 'bg-gray-500' },
  not_started: { label: 'Not Started', color: 'bg-blue-500' },
  active: { label: 'Active', color: 'bg-green-500' },
  blocked: { label: 'Blocked', color: 'bg-red-500' },
  done: { label: 'Done', color: 'bg-purple-500' },
};

export function InitiativeCard({ initiative, onClick, isDragging = false }: InitiativeCardProps) {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showCheckInDialog, setShowCheckInDialog] = useState(false);

  const ownerName = getFullNameForAvatar(
    initiative.owner?.first_name,
    initiative.owner?.last_name,
    initiative.owner?.full_name
  );

  const statusData = statusConfig[initiative.status];
  const isOwner = currentUserId === initiative.owner_user_id;
  const isParticipant = initiative.participant_user_ids?.includes(currentUserId || '') || false;
  const canCheckIn = isOwner || isParticipant;

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
          {initiative.title}
        </h4>
        <Badge className={statusData.color}>{statusData.label}</Badge>
      </div>

      {initiative.description && (
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
          {initiative.description}
        </p>
      )}

      <div className="space-y-2">
        {/* Owner */}
        <div className="flex items-center gap-2 text-sm">
          <User className="h-4 w-4 text-gray-500" />
          <div className="flex items-center gap-2">
            <FancyAvatar
              name={(initiative.owner?.avatar_name || initiative.owner?.full_name) || ownerName}
              displayName={ownerName}
              avatarUrl={initiative.owner?.avatar_url || undefined}
              size="sm"
            />
            <span className="text-gray-700 dark:text-gray-300">{ownerName}</span>
          </div>
        </div>

        {/* Dates */}
        {(initiative.start_date || initiative.end_date) && (
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <Calendar className="h-4 w-4" />
            <span>
              {initiative.start_date && format(new Date(initiative.start_date), 'MMM d')}
              {initiative.start_date && initiative.end_date && ' - '}
              {initiative.end_date && format(new Date(initiative.end_date), 'MMM d, yyyy')}
            </span>
          </div>
        )}

        {/* Check-In Button */}
        {canCheckIn && (
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
        parentType="initiative"
        parentId={initiative.id}
        parentName={initiative.title}
        onSuccess={() => {
          setShowCheckInDialog(false);
        }}
      />
    </Card>
  );
}

