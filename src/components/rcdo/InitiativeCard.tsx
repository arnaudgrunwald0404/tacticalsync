import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
  draft: { label: 'Draft', color: 'bg-[#5B6E7A]' },
  initialized: { label: 'Initialized', color: 'bg-cyan-500' },
  on_track: { label: 'On Track', color: 'bg-[#6FA87F]' },
  delayed: { label: 'Delayed', color: 'bg-yellow-500' },
  cancelled: { label: 'Cancelled', color: 'bg-[#A85D5D]' },
  // Legacy status mappings
  not_started: { label: 'Draft', color: 'bg-[#5B6E7A]' },
  at_risk: { label: 'Delayed', color: 'bg-yellow-500' },
  off_track: { label: 'Delayed', color: 'bg-yellow-500' },
  completed: { label: 'On Track', color: 'bg-[#6FA87F]' },
};

export function InitiativeCard({ initiative, onClick, isDragging = false }: InitiativeCardProps) {
  const navigate = useNavigate();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showCheckInDialog, setShowCheckInDialog] = useState(false);

  const ownerName = getFullNameForAvatar(
    initiative.owner?.first_name,
    initiative.owner?.last_name,
    initiative.owner?.full_name
  );

  const statusData = statusConfig[initiative.status] || { label: 'Unknown', color: 'bg-gray-500' };
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

  const handleCardClick = () => {
    if (onClick) {
      onClick();
    } else {
      navigate(`/rcdo/detail/si/${initiative.id}`);
    }
  };

  return (
    <Card
      className={cn(
        'p-4 cursor-pointer hover:shadow-md transition-all',
        isDragging && 'opacity-50 rotate-2'
      )}
      onClick={handleCardClick}
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
            {(() => {
              const hasOwnerInfo = !!(initiative.owner?.full_name || initiative.owner?.first_name || initiative.owner?.last_name || initiative.owner?.avatar_url);
              if (!hasOwnerInfo || (ownerName || '').trim().toLowerCase() === 'unknown') {
                return (
                  <span className="inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-full bg-muted text-[10px] font-semibold">?</span>
                );
              }
              return (
                <FancyAvatar
                  name={initiative.owner?.avatar_name || ownerName}
                  displayName={ownerName}
                  avatarUrl={initiative.owner?.avatar_url}
                  size="sm"
                />
              );
            })()}
            <span className="text-gray-700 dark:text-gray-300">{(ownerName || '').trim().toLowerCase() === 'unknown' ? 'Unknown' : ownerName}</span>
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

