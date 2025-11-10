import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { PresenceUser } from '@/hooks/usePresence';
import { Users } from 'lucide-react';

interface PresenceIndicatorProps {
  users: PresenceUser[];
  maxDisplay?: number;
}

/**
 * Component to display who's currently online viewing the same content
 * Shows avatars with names on hover
 */
export function PresenceIndicator({ users, maxDisplay = 5 }: PresenceIndicatorProps) {
  if (users.length === 0) {
    return null;
  }

  const displayUsers = users.slice(0, maxDisplay);
  const remainingCount = users.length - maxDisplay;

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <TooltipProvider>
      <div className="flex items-center gap-2">
        <div className="flex items-center">
          <Users className="h-4 w-4 text-green-600 mr-2" />
          <span className="text-sm text-muted-foreground">
            {users.length} online
          </span>
        </div>
        
        <div className="flex -space-x-2">
          {displayUsers.map((user) => (
            <Tooltip key={user.userId}>
              <TooltipTrigger asChild>
                <div className="relative">
                  <Avatar className="h-8 w-8 border-2 border-background">
                    <AvatarImage src={user.avatarUrl} alt={user.userName} />
                    <AvatarFallback className="text-xs">
                      {getInitials(user.userName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 bg-green-500 border-2 border-background rounded-full" />
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-sm">
                  <p className="font-medium">{user.userName}</p>
                  {user.userEmail && (
                    <p className="text-muted-foreground text-xs">{user.userEmail}</p>
                  )}
                  {user.viewingSection && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Viewing: {user.viewingSection}
                    </p>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          ))}
          
          {remainingCount > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="relative h-8 w-8 rounded-full bg-muted border-2 border-background flex items-center justify-center">
                  <span className="text-xs font-medium">+{remainingCount}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <div className="text-sm max-w-xs">
                  <p className="font-medium mb-1">Also viewing:</p>
                  {users.slice(maxDisplay).map((user) => (
                    <p key={user.userId} className="text-xs">
                      {user.userName}
                    </p>
                  ))}
                </div>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

