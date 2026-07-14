import { ClipboardList, CheckSquare } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { RCLinkWithDetails } from '@/types/rcdo';

interface LinkedMeetingItemsProps {
  links: RCLinkWithDetails[];
  loading?: boolean;
  emptyMessage?: string;
}

const kindLabels: Record<string, string> = {
  meeting_priority: 'Meeting Priority',
  action_item: 'Action Item',
  topic: 'Topic',
  decision: 'Decision',
  jira: 'Jira',
  doc: 'Doc',
};

/**
 * Read-only list of meeting priorities / action items that have been linked
 * to this DO or SI via `rc_links`. Surfaces the write-side connection made in
 * the meeting-priority / action-item compose flows so the link is visible
 * from both directions, not just write-only.
 */
export function LinkedMeetingItems({ links, loading, emptyMessage }: LinkedMeetingItemsProps) {
  // Only meeting_priority and action_item links are ever created by the
  // compose flows today; other `kind` values in the enum aren't wired up
  // anywhere, so we don't render placeholder rows for them.
  const relevantLinks = links.filter(
    (link) => link.kind === 'meeting_priority' || link.kind === 'action_item'
  );

  if (loading) {
    return (
      <div className="text-sm text-muted-foreground p-4" data-testid="linked-meeting-items-loading">
        Loading linked meeting items...
      </div>
    );
  }

  if (relevantLinks.length === 0) {
    return (
      <div className="text-sm text-muted-foreground p-4" data-testid="linked-meeting-items-empty">
        {emptyMessage || 'Not linked to any meeting priorities or action items yet.'}
      </div>
    );
  }

  return (
    <div className="space-y-2" data-testid="linked-meeting-items">
      {relevantLinks.map((link) => {
        const Icon = link.kind === 'meeting_priority' ? ClipboardList : CheckSquare;
        return (
          <div
            key={link.id}
            className="flex items-start gap-3 rounded-md border border-gray-200 dark:border-gray-700 p-3"
            data-testid="linked-meeting-item"
          >
            <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <Badge variant="outline" className="text-xs">
                  {kindLabels[link.kind] || link.kind}
                </Badge>
                {link.linked_item?.meeting_name && (
                  <span className="text-xs text-muted-foreground truncate">
                    {link.linked_item.meeting_name}
                  </span>
                )}
              </div>
              <p className="text-sm truncate">
                {link.linked_item?.title || 'Untitled item'}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
