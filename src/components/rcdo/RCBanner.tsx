import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import FancyAvatar from '@/components/ui/fancy-avatar';
import { Lock } from 'lucide-react';
import { format } from 'date-fns';
import type { RallyingCryWithRelations } from '@/types/rcdo';
import { getFullNameForAvatar } from '@/lib/nameUtils';

interface RCBannerProps {
  rallyingCry: RallyingCryWithRelations;
  startDate: string;
  endDate: string;
}

const statusColors = {
  draft: 'bg-gray-500',
  committed: 'bg-[#C97D60]',
  in_progress: 'bg-green-500',
  done: 'bg-purple-500',
};

const statusLabels = {
  draft: 'Draft',
  committed: 'Committed',
  in_progress: 'In Progress',
  done: 'Done',
};

export function RCBanner({ rallyingCry, startDate, endDate }: RCBannerProps) {
  const ownerName = getFullNameForAvatar(
    rallyingCry.owner?.first_name,
    rallyingCry.owner?.last_name,
    rallyingCry.owner?.full_name
  );

  return (
    <Card className="p-6 bg-gradient-to-r from-[#F5F3F0] to-[#F8F6F2] border-[#E8B4A0]/30">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            {rallyingCry.title}
          </h1>
          {rallyingCry.locked_at && (
            <Lock className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
          )}
        </div>
        <Badge className={statusColors[rallyingCry.status]}>
          {statusLabels[rallyingCry.status]}
        </Badge>
      </div>

      {rallyingCry.narrative && (
        <p className="text-lg text-gray-700 dark:text-gray-300 mb-4 leading-relaxed">
          {rallyingCry.narrative}
        </p>
      )}

      <div className="flex items-center gap-6 text-sm text-gray-600 dark:text-gray-400">
        <div className="flex items-center gap-2">
          <span className="font-semibold">Owner:</span>
          <div className="flex items-center gap-2">
            <FancyAvatar
              name={rallyingCry.owner?.avatar_name || ownerName}
              displayName={ownerName}
              avatarUrl={rallyingCry.owner?.avatar_url}
              size="sm"
            />
            <span>{ownerName}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-semibold">Period:</span>
          <span>
            {format(new Date(startDate), 'MMM d, yyyy')} -{' '}
            {format(new Date(endDate), 'MMM d, yyyy')}
          </span>
          <span className="text-xs text-muted-foreground">[
            {format(new Date(startDate), 'M/d')} - {format(new Date(endDate), 'M/d')}
          ]</span>
        </div>

        {rallyingCry.locked_at && (
          <div className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
            <Lock className="h-4 w-4" />
            <span>Locked</span>
          </div>
        )}
      </div>
    </Card>
  );
}

