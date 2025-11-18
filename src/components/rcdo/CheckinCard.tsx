import { Card } from '@/components/ui/card';
import FancyAvatar from '@/components/ui/fancy-avatar';
import { Calendar, Smile, Meh, Frown } from 'lucide-react';
import { format } from 'date-fns';
import type { RCCheckinWithRelations } from '@/types/rcdo';
import { getFullNameForAvatar } from '@/lib/nameUtils';

interface CheckinCardProps {
  checkin: RCCheckinWithRelations;
}

const sentimentIcons = {
  '-2': { icon: Frown, color: 'text-red-500', label: 'Very Unhappy' },
  '-1': { icon: Frown, color: 'text-orange-500', label: 'Unhappy' },
  '0': { icon: Meh, color: 'text-gray-500', label: 'Neutral' },
  '1': { icon: Smile, color: 'text-green-500', label: 'Happy' },
  '2': { icon: Smile, color: 'text-emerald-500', label: 'Very Happy' },
};

export function CheckinCard({ checkin }: CheckinCardProps) {
  const creatorName = getFullNameForAvatar(
    checkin.creator?.first_name,
    checkin.creator?.last_name,
    checkin.creator?.full_name
  );

  const sentimentData =
    checkin.sentiment !== null && checkin.sentiment !== undefined
      ? sentimentIcons[checkin.sentiment.toString() as keyof typeof sentimentIcons]
      : null;

  const SentimentIcon = sentimentData?.icon;

  return (
    <Card className="p-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <FancyAvatar
            name={checkin.creator?.avatar_name || creatorName}
            displayName={creatorName}
            avatarUrl={checkin.creator?.avatar_url}
            size="md"
          />
          <div>
            <div className="font-semibold text-sm text-gray-900 dark:text-gray-100">
              {creatorName}
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <Calendar className="h-3 w-3" />
              <span>{format(new Date(checkin.date), 'MMM d, yyyy')}</span>
            </div>
          </div>
        </div>

        {sentimentData && SentimentIcon && (
          <div className="flex items-center gap-1">
            <SentimentIcon className={`h-5 w-5 ${sentimentData.color}`} />
          </div>
        )}
      </div>

      {/* Summary */}
      {checkin.summary && (
        <div className="mb-3">
          <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
            Summary
          </div>
          <p className="text-sm text-gray-900 dark:text-gray-100">{checkin.summary}</p>
        </div>
      )}

      {/* Blockers */}
      {checkin.blockers && (
        <div className="mb-3">
          <div className="text-xs font-semibold text-red-600 dark:text-red-400 mb-1">
            Blockers
          </div>
          <p className="text-sm text-gray-900 dark:text-gray-100">{checkin.blockers}</p>
        </div>
      )}

      {/* Next Steps */}
      {checkin.next_steps && (
        <div>
          <div className="text-xs font-semibold text-green-600 dark:text-green-400 mb-1">
            Next Steps
          </div>
          <p className="text-sm text-gray-900 dark:text-gray-100">{checkin.next_steps}</p>
        </div>
      )}
    </Card>
  );
}

