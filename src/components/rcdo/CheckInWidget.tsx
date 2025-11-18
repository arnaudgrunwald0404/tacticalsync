import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import FancyAvatar from '@/components/ui/fancy-avatar';
import { Calendar, MessageSquare, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';
import { useUserCheckins, type UserCheckinWithParent } from '@/hooks/useUserCheckins';
import { getFullNameForAvatar } from '@/lib/nameUtils';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

function getStatusColor(sentiment: number | null): { bg: string; border: string; text: string } {
  if (sentiment === null || sentiment === undefined) {
    return { bg: 'bg-gray-100', border: 'border-gray-300', text: 'text-gray-700' };
  }
  
  if (sentiment <= -1) {
    // Red for unhappy/very unhappy
    return { bg: 'bg-red-100', border: 'border-red-300', text: 'text-red-700' };
  } else if (sentiment === 0) {
    // Yellow for neutral
    return { bg: 'bg-yellow-100', border: 'border-yellow-300', text: 'text-yellow-700' };
  } else {
    // Green for happy/very happy
    return { bg: 'bg-green-100', border: 'border-green-300', text: 'text-green-700' };
  }
}

function CheckInItem({ checkin }: { checkin: UserCheckinWithParent }) {
  const reporterName = getFullNameForAvatar(
    checkin.creator?.first_name,
    checkin.creator?.last_name,
    checkin.creator?.full_name
  );

  const statusColor = getStatusColor(checkin.sentiment);

  return (
    <Card className={`border-l-4 ${statusColor.border}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-base font-semibold mb-1">
              {checkin.parent_name || 'Unknown'}
            </CardTitle>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="outline" className="text-xs">
                {checkin.parent_type_label || 'SI'}
              </Badge>
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                <span>{format(new Date(checkin.date), 'MMM d, yyyy')}</span>
              </div>
            </div>
          </div>
          <div className={`h-3 w-3 rounded-full ${statusColor.bg} border ${statusColor.border}`} />
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {/* Reporter */}
        <div className="flex items-center gap-2">
          {checkin.creator?.avatar_url ? (
            <Avatar className="h-6 w-6">
              <AvatarImage src={checkin.creator.avatar_url} />
              <AvatarFallback>{reporterName}</AvatarFallback>
            </Avatar>
          ) : (
            <FancyAvatar name={reporterName} size={24} />
          )}
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {reporterName}
          </span>
        </div>

        {/* Comment Update */}
        {checkin.summary && (
          <div>
            <div className="flex items-center gap-1 mb-1">
              <MessageSquare className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground">Comment</span>
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">
              {checkin.summary}
            </p>
          </div>
        )}

        {/* Metric Update (Next Steps) */}
        {checkin.next_steps && (
          <div>
            <div className="flex items-center gap-1 mb-1">
              <TrendingUp className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground">Metric Update</span>
            </div>
            <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">
              {checkin.next_steps}
            </p>
          </div>
        )}

        {/* Status Badge */}
        <div className="flex items-center gap-2 pt-2 border-t">
          <span className="text-xs font-semibold text-muted-foreground">Status:</span>
          <Badge className={`${statusColor.bg} ${statusColor.text} border-0`}>
            {checkin.sentiment === null || checkin.sentiment === undefined
              ? 'Neutral'
              : checkin.sentiment <= -1
              ? 'At Risk'
              : checkin.sentiment === 0
              ? 'Neutral'
              : 'On Track'}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

export function CheckInWidget() {
  const { checkins, loading } = useUserCheckins();

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Check-Ins</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (checkins.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Check-Ins</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            No check-ins found. Check-ins will appear here when you're a participant in a Strategic Initiative or Defining Objective.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Check-Ins</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {checkins.slice(0, 5).map((checkin) => (
            <CheckInItem key={checkin.id} checkin={checkin} />
          ))}
          {checkins.length > 5 && (
            <p className="text-xs text-muted-foreground text-center pt-2">
              Showing 5 of {checkins.length} check-ins
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

