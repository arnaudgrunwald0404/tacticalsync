import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
  committed: 'bg-blue-500',
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
    <Card className="p-6 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950 border-blue-200 dark:border-blue-800">
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
            {rallyingCry.owner?.avatar_url ? (
              <Avatar className="h-6 w-6">
                <AvatarImage src={rallyingCry.owner.avatar_url} />
                <AvatarFallback>{ownerName}</AvatarFallback>
              </Avatar>
            ) : (
              <FancyAvatar name={ownerName} size={24} />
            )}
            <span>{ownerName}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-semibold">Period:</span>
          <span>
            {format(new Date(startDate), 'MMM d, yyyy')} -{' '}
            {format(new Date(endDate), 'MMM d, yyyy')}
          </span>
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

