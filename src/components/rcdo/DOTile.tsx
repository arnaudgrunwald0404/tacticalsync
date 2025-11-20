import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import FancyAvatar from '@/components/ui/fancy-avatar';
import { Progress } from '@/components/ui/progress';
import { TrendingUp, AlertTriangle, TrendingDown, CheckCircle2, Target, MessageSquare } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import type { DefiningObjectiveWithRelations } from '@/types/rcdo';
import { getFullNameForAvatar } from '@/lib/nameUtils';
import { CheckInDialog } from './CheckInDialog';

interface DOTileProps {
  definingObjective: DefiningObjectiveWithRelations;
}

const healthConfig = {
  on_track: {
    color: 'bg-green-500 text-white',
    icon: TrendingUp,
    label: 'On Track',
  },
  at_risk: {
    color: 'bg-yellow-500 text-white',
    icon: AlertTriangle,
    label: 'At Risk',
  },
  off_track: {
    color: 'bg-red-500 text-white',
    icon: TrendingDown,
    label: 'Off Track',
  },
  done: {
    color: 'bg-purple-500 text-white',
    icon: CheckCircle2,
    label: 'Done',
  },
};

export function DOTile({ definingObjective }: DOTileProps) {
  const navigate = useNavigate();
  const healthData = healthConfig[definingObjective.health];
  const HealthIcon = healthData.icon;
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showCheckInDialog, setShowCheckInDialog] = useState(false);

  const ownerName = getFullNameForAvatar(
    definingObjective.owner?.first_name,
    definingObjective.owner?.last_name,
    definingObjective.owner?.full_name
  );

  const initiativeCount = definingObjective.initiatives?.length || 0;
  const linkCount = definingObjective.links?.length || 0;
  const metricsCount = definingObjective.metrics?.length || 0;
  const isOwner = currentUserId === definingObjective.owner_user_id;

  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
      }
    };
    getCurrentUser();
  }, []);

  const handleClick = () => {
    navigate(`/dashboard/rcdo/do/${definingObjective.id}`);
  };

  const handleCheckInClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowCheckInDialog(true);
  };

  return (
    <Card
      className="p-5 hover:shadow-lg transition-shadow cursor-pointer border-l-4"
      style={{
        borderLeftColor:
          definingObjective.health === 'on_track'
            ? '#22c55e'
            : definingObjective.health === 'at_risk'
            ? '#eab308'
            : definingObjective.health === 'off_track'
            ? '#ef4444'
            : '#a855f7',
      }}
      onClick={handleClick}
    >
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex-1 pr-2">
          {definingObjective.title}
        </h3>
        <Badge className={healthData.color}>
          <HealthIcon className="h-3 w-3 mr-1" />
          {healthData.label}
        </Badge>
      </div>

      {definingObjective.hypothesis && (
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-2">
          {definingObjective.hypothesis}
        </p>
      )}

      <div className="space-y-3">
        {/* Confidence */}
        <div>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-gray-600 dark:text-gray-400">Confidence</span>
            <span className="font-semibold text-gray-900 dark:text-gray-100">
              {definingObjective.confidence_pct}%
            </span>
          </div>
          <Progress value={definingObjective.confidence_pct} className="h-2" />
        </div>

        {/* Owner */}
        <div className="flex items-center gap-2">
          {(() => {
            const hasOwnerInfo = !!(definingObjective.owner?.full_name || definingObjective.owner?.first_name || definingObjective.owner?.last_name || definingObjective.owner?.avatar_url);
            if (!hasOwnerInfo || (ownerName || '').trim().toLowerCase() === 'unknown') {
              return (
                <span className="inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-full bg-muted text-[10px] font-semibold">?</span>
              );
            }
            return (
              <FancyAvatar
                name={definingObjective.owner?.avatar_name || ownerName}
                displayName={ownerName}
                avatarUrl={definingObjective.owner?.avatar_url}
                size="sm"
              />
            );
          })()}
          <span className="text-sm text-gray-700 dark:text-gray-300">{(ownerName || '').trim().toLowerCase() === 'unknown' ? 'Unknown' : ownerName}</span>
        </div>

        {/* Stats */}
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="flex items-center gap-4 text-xs text-gray-600 dark:text-gray-400">
            <div className="flex items-center gap-1">
              <Target className="h-3 w-3" />
              <span>{metricsCount} metrics</span>
            </div>
            <div className="flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              <span>{initiativeCount} initiatives</span>
            </div>
            {linkCount > 0 && (
              <div className="flex items-center gap-1">
                <span>🔗 {linkCount} linked</span>
              </div>
            )}
          </div>
          {isOwner && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCheckInClick}
              className="h-7 text-xs"
            >
              <MessageSquare className="h-3 w-3 mr-1" />
              Check-In
            </Button>
          )}
        </div>
      </div>
      <CheckInDialog
        isOpen={showCheckInDialog}
        onClose={() => setShowCheckInDialog(false)}
        parentType="do"
        parentId={definingObjective.id}
        parentName={definingObjective.title}
        onSuccess={() => {
          setShowCheckInDialog(false);
        }}
      />
    </Card>
  );
}

