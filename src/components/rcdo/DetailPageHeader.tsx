import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Lock, Unlock, MessageSquare, MoreVertical, TrendingUp, AlertTriangle, TrendingDown, Plus, Table2, BarChart3 } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import FancyAvatar from '@/components/ui/fancy-avatar';
import { getFullNameForAvatar } from '@/lib/nameUtils';
import { calculateDOHealth, getHealthColor } from '@/lib/rcdoScoring';
import { supabase } from '@/integrations/supabase/client';

interface DetailPageHeaderProps {
  // Common fields
  title: string;
  description?: string | null;
  owner?: {
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    full_name?: string | null;
    avatar_url?: string | null;
    avatar_name?: string | null;
  } | null;
  isLocked: boolean;
  isOwner: boolean;
  currentUserId: string | null;
  
  // DO-specific
  type: 'do' | 'si';
  doId?: string;
  metrics?: Array<{ id: string; type: string; name?: string }>;
  status?: string;
  
  // Actions
  onLock?: () => void;
  onUnlock?: () => void;
  onCheckIn?: () => void;
  canLock?: boolean;
  canEdit?: boolean;
  
  // SI-specific actions
  viewMode?: 'table' | 'gantt';
  onViewModeChange?: (mode: 'table' | 'gantt') => void;
  onAddTask?: () => void;
  canCreateTask?: boolean;
  activeTab?: string;
  onTabChange?: (value: string) => void;
  tasksCount?: number;
  checkinsCount?: number;
  
  // Additional content (for selected items in header)
  additionalContent?: React.ReactNode;
}

export function DetailPageHeader({
  title,
  description,
  owner,
  isLocked,
  isOwner,
  currentUserId,
  type,
  doId,
  metrics = [],
  status,
  onLock,
  onUnlock,
  onCheckIn,
  canLock = false,
  canEdit = false,
  viewMode,
  onViewModeChange,
  onAddTask,
  canCreateTask = false,
  activeTab,
  onTabChange,
  tasksCount = 0,
  checkinsCount = 0,
  additionalContent,
}: DetailPageHeaderProps) {
  const ownerName = getFullNameForAvatar(
    owner?.first_name,
    owner?.last_name,
    owner?.full_name
  );

  // Calculate health for DOs
  let healthResult: { health: 'on_track' | 'at_risk' | 'off_track' | 'done' } = { health: 'on_track' };
  if (type === 'do' && doId) {
    healthResult = calculateDOHealth(doId, metrics as any);
  }
  const isDefaultState = status === 'draft' || (type === 'do' && metrics.length === 0);
  const healthColor = isDefaultState ? 'text-[#5B6E7A]' : getHealthColor(healthResult.health);

  const healthIcons = {
    on_track: TrendingUp,
    at_risk: AlertTriangle,
    off_track: TrendingDown,
    done: TrendingUp,
  };

  const HealthIcon = healthIcons[healthResult.health];

  return (
    <Card className="p-6 mb-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
              {title}
            </h1>
            {isLocked && (
              <Lock className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
            )}
          </div>
          {description && (
            <p className="text-gray-700 dark:text-gray-300 mb-3 whitespace-pre-wrap">
              {description.replace(/<[^>]*>/g, '').trim() || 'No description provided.'}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* SI-specific: View mode toggle */}
          {type === 'si' && viewMode && onViewModeChange && (
            <div className="flex items-center gap-2 mr-2">
              <Button
                variant={viewMode === 'table' ? 'default' : 'outline'}
                size="sm"
                onClick={() => onViewModeChange('table')}
              >
                <Table2 className="h-4 w-4 mr-2" />
                Table
              </Button>
              <Button
                variant={viewMode === 'gantt' ? 'default' : 'outline'}
                size="sm"
                onClick={() => onViewModeChange('gantt')}
              >
                <BarChart3 className="h-4 w-4 mr-2" />
                Gantt
              </Button>
            </div>
          )}
          {/* SI-specific: Add Task button */}
          {type === 'si' && !isLocked && canCreateTask && onAddTask && (
            <Button
              onClick={onAddTask}
              size="sm"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Task
            </Button>
          )}
          {isOwner && !isLocked && onCheckIn && (
            <Button
              variant="outline"
              onClick={onCheckIn}
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              Check-In
            </Button>
          )}
          {canLock && !isLocked && onLock && (
            <Button
              variant="outline"
              onClick={onLock}
            >
              <Lock className="h-4 w-4 mr-2" />
              Lock
            </Button>
          )}
          {isLocked && canLock && onUnlock && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-11 w-11 md:h-9 md:w-auto md:px-3">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onUnlock}>
                  <Unlock className="h-4 w-4 mr-2" />
                  Unlock
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {type === 'do' && (
            <div className="flex flex-col gap-2 items-end">
              <Badge
                className={
                  isDefaultState
                    ? 'bg-[#5B6E7A]'
                    : healthResult.health === 'on_track'
                    ? 'bg-[#6B9A8F]'
                    : healthResult.health === 'at_risk'
                    ? 'bg-[#B89A6B]'
                    : healthResult.health === 'off_track'
                    ? 'bg-[#8B6F47]'
                    : 'bg-[#6B9A8F]'
                }
              >
                <HealthIcon className="h-3 w-3 mr-1" />
                {healthResult.health.replace('_', ' ').toUpperCase()}
              </Badge>
            </div>
          )}
          {type === 'si' && status && (
            <Badge className={
              status === 'draft' ? 'bg-[#5B6E7A]' :
              status === 'initialized' ? 'bg-cyan-500' :
              status === 'on_track' ? 'bg-green-500' :
              status === 'delayed' ? 'bg-yellow-500' :
              status === 'cancelled' ? 'bg-red-500' :
              'bg-gray-500'
            }>
              {status.replace('_', ' ').toUpperCase()}
            </Badge>
          )}
        </div>
      </div>

      {/* Owner */}
      {owner && (
        <div className="flex items-center gap-2 text-sm mb-4">
          <FancyAvatar
            name={owner.avatar_name || ownerName}
            displayName={ownerName}
            avatarUrl={owner.avatar_url}
            size="sm"
          />
          <span className="text-gray-700 dark:text-gray-300">{ownerName}</span>
        </div>
      )}

      {/* Additional content (e.g., selected initiative or task details) */}
      {additionalContent && (
        <div className="mt-4 pt-4 border-t">
          {additionalContent}
        </div>
      )}

      {/* SI-specific: Tabs for Tasks and Check-ins */}
      {type === 'si' && activeTab && onTabChange && (
        <div className="mt-4 pt-4 border-t">
          <Tabs value={activeTab} onValueChange={onTabChange}>
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="tasks" className="flex-1 sm:flex-initial">
                Tasks ({tasksCount})
              </TabsTrigger>
              <TabsTrigger value="checkins" className="flex-1 sm:flex-initial">
                Check-ins ({checkinsCount})
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      )}
    </Card>
  );
}

